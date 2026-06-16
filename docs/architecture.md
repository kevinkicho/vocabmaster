# VocabMaster Architecture & Operating Knowledge

## 1. LLM Generation Pipeline

### 1.1 Three-layer architecture

```
llm_roles.js (feature method)
  → llm_validator.js (generateWithCritic)
    → llm_validator.js (generateValidated)
      → llm_service.js (generate)
        → llm_service.js (_enqueue)
          → llm_service.js (_ollamaRequest)
            → llm_service.js (_fetch)
              → Capacitor HttpProxy OR native fetch()
```

### 1.2 Retry chain

| Layer | Setting | Max calls | Why |
|-------|---------|-----------|-----|
| `generateValidated` | `maxRetries = 1` | 2 | Retry once on schema validation failure |
| `generateWithCritic` | `maxCriticRetries = 0` | 1 | No retry — critic runs once, accepts or returns best-effort |

**Total: at most 2 generate calls + 1 critic call per feature request.**

### 1.3 Concurrent queue (`llm_service.js`)

- `_maxConcurrent = 2`: up to 2 LLM requests run in parallel.
- `_queue` is an array (not a promise chain). Items are dequeued by `_processQueue()` when `_activeRequests` drops below `_maxConcurrent`.
- Queue cap at 50 — beyond that, new requests are rejected with `'LLM queue full'`.
- `_ping()` bypasses the queue (health check should not queue behind generation).

### 1.4 HTTP transport (`_fetch`)

Two paths, tried in order:

| Path | Condition | Timeout mechanism |
|------|-----------|-------------------|
| Capacitor HttpProxy | `window.Capacitor.Plugins.HttpProxy` exists | `connectTimeout` + `readTimeout` passed to proxy (derived from caller's `timeout`) |
| Native `fetch()` | Fallback if Capacitor proxy absent or throws | `AbortController` + `setTimeout` (no `AbortSignal.any` — it's unreliable across WebView versions) |

**Capacitor proxy ignores `AbortController.signal`** — the `signal` is only attached to the native `fetch()` fallback. For the proxy path, timeout is enforced via proxy's own `readTimeout`.

If the Capacitor proxy throws, the error is caught and falls through to native `fetch()` with a log. This prevents CORS errors on `file://` origin from being fatal, though `file://` fetch is still likely to fail.

### 1.5 `num_predict` token budgets (`llm_validator.js`)

`num_predict` is the **maximum tokens the model may output**. The model stops at EOS — it does NOT keep generating up to the budget. Higher budgets do NOT slow down normal outputs.

| Schema | `baseTokens` | Retry multiplier | Fits |
|--------|-------------|-------------------|------|
| `storyWithQuestions` | 1024 | 1.5× (1536) | Story (~400t) + translation (~250t) + 2 Q&A (~300t) + JSON (~50t) = ~1000t |
| `grammarExercise` | 2048 | 1.5× (3072) | 6-10 exercises comfortably (12 exercises needs ~2700t, would truncate at 2048) |
| All others | 384 | 1.5× (576) | Short responses (cloze match, grammar explanation, etc.) |

**If a response is truncated, `extractJSON` will fail**, triggering a retry. The retry gets a 50% larger budget as safety margin.

**Derivation** — these values come from measuring real LLM outputs during development. Story mode typically produces ~1000 tokens. Grammar Gym with 8 exercises produces ~1800 tokens. Setting budgets higher has negligible speed cost (model stops at EOS) but allows rambling models to waste more resources.

## 2. Critic Pipeline

### 2.1 Which schemas skip the critic

Simple schemas skip `criticEvaluate` entirely — they return `generateValidated()`'s result directly with `critiqueScore: 75`:

| Schema | Critic? |
|--------|---------|
| `clozeMatch` | **No** — 1 field, trivial |
| `generatedCloze` | **No** — 2 fields, trivial |
| `grammarExplanation` | **No** — 3 fields, simple |
| All others (story, grammar, quiz, etc.) | **Yes** — full critic evaluation |

### 2.2 Critic prompt size

- `JSON.stringify(generatedContent)` without pretty-print (saves ~40-60% whitespace tokens)
- Criterion descriptions shortened to name-only (e.g., "levelAppropriate (0-100)" not "levelAppropriate: Vocabulary/grammar matches...")
- JSON template: 5-line compact schema instead of 20-line expanded version
- Rules: 2 concise sentences instead of 5 verbose rules
- **Total: ~500 tokens** (down from ~1000-1200)

### 2.3 Critic generation parameters

| Parameter | Value | Why |
|-----------|-------|-----|
| `num_predict` | 128 | Critic only needs to output: 7 numbers + 2 arrays + 1 string + 1 boolean |
| `timeout` | 15000 | 15s is generous for 128-token output |
| `system` | `'Output ONLY valid JSON.'` | Short system; critic knows its role from the prompt |

### 2.4 Critic fallback behavior

If the critic's response fails to parse or validate, it **auto-approves with score 75** — the content proceeds without quality gate. This is intentional: a broken critic should not block the user.

## 3. Data Loading

### 3.1 RTDB-only (no local fallback)

`DataService.load()` (data.js) fetches from Firebase RTDB `vocab` node only:

1. Check `typeof db !== 'undefined'`
2. `db.ref('vocab').once('value')`
3. If snapshot exists, parse as array or object values
4. Sort by `id`
5. No CSV fallback. No `createMockData()`. If RTDB has no data, `this.list` stays empty.
6. Returns `this.list.length` — 0 means "no data available"

### 3.2 Empty list handling (main.js)

If `load()` returns 0:
- Status bar shows `'No vocabulary loaded — check RTDB connection'` in red
- Start button shows `'Retry'` and calls `window.location.reload()` on click
- Page `return`s early — modal close events are never bound (not needed since user never reaches main screen)

### 3.3 Tag-based filtering

The home screen has a **Tag Filter** section with 24 clickable tag chips (N5–N1, HSK1–HSK6, A1–C1, TOPIK1–TOPIK5, common, uncommon, rare). Selecting a tag filters `app.data.list` client-side via `getFilteredList()`. The filter persists in localStorage and works alongside the existing level filter (both are ANDed). All game modes automatically respect the filtered list since they call `getFilteredList()` in their constructor.

### 3.3 Why no mock data

Per AGENTS.md: "Never use mock data. Never create mock data. Always use real AI." Mock data would silently mask RTDB connection failures, leading to confusing behavior (stories generated from "Test 0" / "Test 1" etc.).

## 4. Story Mode

### 4.1 Flow

```
startStory(forceAnew)
  → AI offline? → Use RTDB cached story
  → forceAnew? → Skip cached/prefetched
  → Prefetched available? → Use it
  → RTDB cached available? → Use it
  → Generate fresh: _pickWords(4) → _generateStory()
    → app.llm.generateStory()
      → generateWithCritic(storyWithQuestions)
  → _showStoryWithQuestions(storyPart, lang)
  → _saveStoryToRTDB()
  → _prefetchNext()
```

### 4.2 Button semantics

| Button | Clears `storyWords`? | Calls `app.audio.cancel()`? | Result |
|--------|---------------------|---------------------------|--------|
| Sparkle (header) | **No** | **Yes** | Regenerate with same 4 words |
| Dice (header) | **Yes** | **Yes** | Generate with 4 new random words |
| Previous/Next (footer) | No | No | Navigate cached stories |

Both navigation buttons cancel audio before proceeding to prevent stale TTS from playing during the next generation.

### 4.3 Vocabulary chips

- Short tap: TTS plays the word
- Long press (500ms): Toggles word text between target language and native language (`data-word` ↔ `data-native`, via `data-showing` attribute)
- No speaker icon on chips (removed for cleaner UI)

### 4.4 Highlight toggle

- `_highlightsVisible` starts `false`
- Toggle button (`ph-eye`) highlights target words in the story with `<mark>` tags
- Active state: amber button; inactive: slate
- Cross-cancels with translation toggle (cannot have both active)

### 4.5 Translation toggle

- `_showTranslation` starts `false`
- Toggle button (`ph-translate`) switches story between original language and AI-generated English translation
- Active state: emerald button; inactive: slate
- Cross-cancels with highlight toggle

### 4.6 Story TTS

- Speaker button reads the story using TTS
- `_readStory()` passes `raw = true` to `app.audio.play()`, bypassing `sanitizeText()` (which strips brackets/slashes that may appear in AI-generated text)

### 4.7 RTDB storage

Path: `stories/{compositeVocabId}/{lang}`
Composite key: sorted vocab IDs joined by `-` (e.g., `3-5-7-12`)
Validation: requires `story`, `questions`, `vocabIds`, `ts`

## 5. Grammar Gym

### 5.1 Flow

```
update() → _showGenerating() → _fetchGrammarExercise()
  → app.llm.loadCachedGrammarExercise() (cache check)
    → Hit? → _showExplanation()
    → Miss? → _showGenerating() → app.llm.getGrammarExercise()
      → generateWithCritic(grammarExercise)
      → _showExplanation() → user taps Start → _showExercise()
```

### 5.2 Navigation

- Previous/Next buttons at bottom (via `app.ui.nav()`) — navigate `this.i` through the vocab list
- Dice button in header — random `this.i`, triggers `update()`
- Sparkle button in header — regenerates AI exercises for current vocab (calls `_generateAnew()`)
- `update()` clears `exerciseData`, shows generating spinner, then fetches new exercises

### 5.3 Blank page prevention

- Guard `if (!c) return` at top of `update()` prevents crash when `this.list[this.i]` is undefined
- `.catch()` on `_fetchGrammarExercise` now shows an error message with "Try Again" button instead of leaving the spinner forever
- `_clearElapsedTimer()` called on both success and error paths

## 6. Audio Service

### 6.1 `audio.play(txt, langKey, context, delay, raw)`

| Param | Purpose |
|-------|---------|
| `txt` | Text to speak |
| `langKey` | Language code (maps to TTS voice) |
| `context` | UI context (for prefs like `flashAuto`) |
| `delay` | Delay in ms before speaking |
| `raw` | If `true`, skip `sanitizeText()` — used for full story narration |

### 6.2 `sanitizeText()` behavior

Strips `[...]`, `(...)`, `【...】` content, splits on `・•·/` taking first segment. This is appropriate for vocab words (removes furigana, alternate readings) but destructive for full story text. Story mode passes `raw=true` to bypass.

### 6.3 TTS stop behavior

- `app.audio.cancel()` stops all current TTS (both native and Web Speech API)
- Called from: `goHome()`, `launch()`, `launchSubGame()`, `goBack()`, `Story.destroy()`, `_surpriseStory()`, `_regenerateStory()`
- `visibilitychange` listener also cancels (user switches away)

## 7. Error States & User Feedback

| Scenario | User sees | File |
|----------|-----------|------|
| RTDB empty / offline | "No vocabulary loaded — check RTDB connection" + Retry button | `main.js` |
| AI offline (Story) | "AI Not Connected" + Back to Menu | `game_story_generator.js` |
| AI offline (Grammar) | "Grammar Gym requires a working AI connection" + auto-retry 10s | `game_grammar.js` |
| Generation fails (Story) | "Generation Failed" + error detail + Retry button | `game_story_generator.js` |
| Generation fails (Grammar) | "Could not generate grammar exercises" + Try Again button | `game_grammar.js` |
| Grammar nav to empty item | "No vocabulary item found." | `game_grammar.js` |
| LLM queue full | Rejected promise → caught by caller → logged | `llm_service.js` |

## 8. Admin Detection

Two methods, checked in order:

1. **Email-based** (fallback): `user.email === 'kevinkicho@gmail.com'` → `auth.userRole = 'admin'`, `notes.isAdmin = true`
2. **Custom claims** (Firebase Admin SDK): `idTokenResult.claims.admin` → same

The email check happens before the claims check and runs synchronously (no async delay). The claims check is async but overwrites the role if it finds an admin claim.

Admin controls:
- Edit button (pencil icon) in game headers — via `notes.isAdmin` in `ui.js`
- Developer tab in Settings — via `app.auth.userRole === 'admin'` in `ui_settings.js`
- Delete story button (trash icon) in Story mode footer — via `app.notes.isAdmin` in `game_story_ui.js`

## 9. AI Connection Health (`_ping`)

On `visibilitychange` (app returns to foreground):
1. `_ping()` does `/api/tags` with 3s timeout
2. If success: sets `this.available = true`
3. If failure: sets `this.available = false`, `this.hasModel = false`, schedules `autoDetect()` retry in 5s

This prevents stale connection state from causing silent hangs after app resume.

## 10. Conventions for Future Agents

- **Never use mock data.** RTDB is the only data source. CSV and `createMockData()` were removed.
- **Never extend timeouts to fix hangs.** Find the root cause (queue blocking, truncated tokens, CORS fallback).
- **`additionalProperties: false` removed from schemas** — it causes validation failures on minor extra fields.
- **Critic always runs** for complex schemas. It's made efficient via compact prompts, not by skipping it.
- **`_enqueue` allows max 2 concurrent** — not serial. This prevents one slow request from blocking all others.
- **Capacitor proxy does not support `AbortSignal`** — timeout is enforced via proxy's own `readTimeout`.
- **`num_predict` is a ceiling, not a budget** — model stops at EOS. Higher ceilings don't slow normal outputs.