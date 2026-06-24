# Agent Rules for VocabMaster

## Screenshots
- Always save screenshots in `screenshots/` folder at project root.
- Name screenshots descriptively with a timestamp or sequence number.
- The AI cannot read or describe images — it can only extract computed CSS values programmatically via Playwright `page.evaluate()`.

## AI Accountability
- Every time AI is involved, output the exact prompt and exact response **in a markdown table** in your reply to the user.
- Table format:
  | # | Role | Full Prompt | Full Response |
  |---|------|-------------|---------------|
  | 1 | generate | `...` | `...` |
  | 2 | critique | `...` | `...` |
- Do NOT truncate or summarize prompts/responses. Show them verbatim.
- Never use mock data. Never create mock data. Always use real AI.

## Style Conventions
- **All custom colors** (`indigo-*`, `slate-*`, `neutral-*`) are CSS variables (`var(--p-*)`, `var(--n-*)`).
- **Never use `/opacity` modifiers** on these custom colors — Tailwind silently drops them during build. Use the base color (`dark:bg-neutral-900`) instead of `dark:bg-neutral-900/90`.
- For non-custom colors (amber, emerald, rose, cyan, violet, white, black), `/opacity` modifiers work normally.
- Always rebuild CSS after Tailwind config changes: `npm run build:css`.
- **`@tailwindcss/typography`** plugin is installed and registered in `tailwind.config.js`. The `prose`, `prose-sm`, `dark:prose-invert` classes on `#note-body` depend on it.
- **`animate-shake`** animation is defined in `tailwind.config.js` (`theme.extend.animation` + `theme.extend.keyframes`). Used in voice game (`game_voice.js`) on incorrect answers.

## Languages
- When testing Grammar Gym or any AI feature, randomise the language and word ID on each run to prove fresh generation.

## Grammar Gym Labels
- `labelA`/`labelB` are computed deterministically from (type, answer) in `LLMService.resolveLabels()`.
- Labels are shown on choice buttons at all times.

## Todo List Discipline
- **After completing any task**, immediately update the todo list to mark it `completed`. Never leave completed work as `pending` or `in_progress`.
- **Before replying to the user**, verify all todos reflect their true state. Stale todos are a bug.
- When a multi-step task finishes, mark all sub-items complete in one batch update.

## Critical: `const`/`let`/`class` Do Not Cross `<script>` Tag Boundaries

In JavaScript, `const`, `let`, and `class` declarations in one `<script>` tag are **not visible** to other `<script>` tags — only `var` and explicit `window.*` assignments cross script boundaries. This is a fundamental JS behavior that differs from how bundled/compiled code works.

**Example of the bug (TTS fix, June 2026):**
```js
// native_tts.js — defines NativeTTSBridge
const NativeTTSBridge = (() => {
    window.NativeTTSBridge = bridge;  // ← the actual global
    return bridge;
})();

// services.js — tries to read it
this.useNative = (typeof NativeTTSBridge !== 'undefined')  // ← ALWAYS undefined!
```

**Fix:** Always use `window.*` prefix when accessing a value defined in another `<script>` tag:
```js
this.useNative = (typeof window.NativeTTSBridge !== 'undefined') && window.NativeTTSBridge.isAvailable();
```

This applies to all files loaded via separate `<script>` tags in `index.html` — which is all of them (no bundler).

## Critical: `onAuthStateChanged(null)` Is Not a Terminal State

Firebase `auth.onAuthStateChanged(user)` fires with `null` when no user is signed in. This is **not** "auth is done and there's no user" — it means "no user signed in yet." Treating it as terminal (setting `resolved = true` and clearing the anonymous-sign-in timeout) hangs the auth Promise forever in fresh browser contexts.

**The bug (auth.js, June 2026):**
```js
// waitForAuth() — old code
var unsubscribe = auth.onAuthStateChanged(function(user) {
    if (resolved) return;
    resolved = true;       // ← BUG: sets resolved on null too
    clearTimeout(timeout);  // ← cancels the signInAnonymously() timeout
    unsubscribe();
    if (user) { ... }       // ← user is null, does nothing, Promise hangs
});
```

**Fix:** Only set `resolved = true` when a real `user` arrives. Let the timeout fire to call `signInAnonymously()` when `user` is `null`:
```js
auth.onAuthStateChanged(function(user) {
    if (resolved) return;
    if (user) {             // ← only act on a real user
        resolved = true;
        clearTimeout(timeout);
        unsubscribe();
        this.currentUser = user;
        resolve(user);
    }
    // null → do nothing, let timeout fire
});
```

This is invisible in production (cached anon session fires with a real user) but blocks fresh contexts (Playwright, incognito). See `docs/architecture.md` §10.2.

## Read Docs Before Editing

Before making code changes, read the relevant docs (`docs/architecture.md`, `docs/development.md`, `AGENTS.md`) to understand the existing patterns and constraints. Blaming external factors (Firebase, proxy, network) for issues caused by your own edits is a process failure — verify your changes didn't break things first by testing against the baseline.

## Critical: Cloud Proxy Is Active Production Code

The web app uses a **Cloud Run proxy** (`https://ollama-proxy-1020976660084.us-central1.run.app`) to reach Ollama cloud models from the browser. This is **not dead code** — it is the primary AI backend for the deployed web app at `https://vocabmaster112225.web.app`.

- `public/js/ollama_config.js` (gitignored) sets `window.OLLAMA_USE_CLOUD = true` for the web build. This is intentional — browsers cannot call `http://127.0.0.1:11434` (CORS) or the Ollama Cloud API directly.
- The proxy lives in `functions/src/index.ts` and is deployed as a Firebase Cloud Function. The API key is stored server-side in Firebase config (not in the client).
- `public/js/llm/llm_service.js` constructor reads `OLLAMA_USE_CLOUD` and routes to the proxy URL when true, or to `OLLAMA_ENDPOINT` (default `127.0.0.1:11434`) when false.
- The Android APK uses the local path (`OLLAMA_USE_CLOUD = false`, `OLLAMA_ENDPOINT = 127.0.0.1:11434`) to talk to `ollama4android` on the same device.
- **Do NOT delete or "clean up" the proxy URL, the `useCloud` branch, `_isBrowserWeb()`, or the Cloud Function.** Both paths (cloud proxy for web, local for APK) are essential and actively used. See `docs/web-ai-parity-proxy-implementation.md` for full details.

## Critical: Native TTS — Cross-Engine Voice Selection Is Intentional

`TTSBridge.kt` line 136 (`tts!!.voice = targetVoice`) is **not dead code**. It enables cross-engine voice selection — users can pick a Samsung TTS voice even when the system default TTS engine is Google TTS.

**How it works:**
- `TextToSpeech` is initialized without specifying an engine (`TTSBridge.kt:37`), which uses the system default. But `getVoices()` (`TTSBridge.kt:60`) returns voices from **all installed engines** — this is standard Android API behavior (API 21+).
- When the user selects a voice from a non-default engine, `targetVoice` is found in the unified voice set and `setVoice()` routes the speech to the correct engine transparently.
- Do NOT remove `tts!!.voice = targetVoice` or replace it with `setLanguage()`-only logic. Doing so would lock the app to the system default engine's voices only.

**Do NOT "clean up" these related blocks either:**
- The `provider` heuristic in `TTSBridge.kt:72-80` (Google/Samsung/Network/Local detection). This is the only way to label voices by engine — Android's API returns all voices in one flat set without engine attribution.
- The `window.NativeTTSBridge = bridge` in `native_tts.js:144`. Without this, `const NativeTTSBridge` is invisible to `services.js` (per JS `const`/`let`/`class` not crossing `<script>` tag boundaries — see rule above).
- The `useNative` branching in `services.js:6-12` and `renderVoiceSelector()` in `ui_llm.js:193-197` (which replaces the dropdown with an info box in APK mode). Note: `ui_llm.js` overrides `UIManager.prototype.renderVoiceSelector` — the active implementation is in `ui_llm.js`, not `ui.js`.
- ADB is now available in this WSL environment. See `docs/audio-tts-architecture.md` for the full TTS provider detection chain and cross-engine routing details.

## Critical: explainLang — Explanation Language from Preset Source

All AI-generated content respects the user's "I know..." language setting. The explanation language is **not** a separate preference — it is derived from `presetSource`.

**How it works:**
- `_getExplainLang()` in `llm_roles.js:2-10` reads `window.app.store.prefs.presetSource`. Defaults to `'en'`.
- This value flows as `knownLangCode` through `generateWithCritic()` → appended to `promptArgs` → received by each prompt builder as the `knownLang` parameter.
- All 11 prompt builders in `llm_prompts.js` replace hardcoded `"English"` with the known language name for scenarios, explanations, translations, and feedback.
- Grammar Gym cache entries store `explainLang` at `llm_roles.js:182`. On load, `loadCachedGrammarExercise` (line 193) fetches up to 5 recent entries and picks one matching `_getExplainLang()`, falling back to the latest if no match.

**Do NOT:**
- Add a separate `explainLang` preference dropdown. It was intentionally removed — the preset source is the single source of truth.
- Hardcode `"English"` back into prompts. Always pass `knownLang` through the pipeline.
- Change `loadCachedGrammarExercise` to return `limitToLast(1)` — it needs 5 candidates for `explainLang` matching.

**Affected files:**
- `public/js/llm/llm_prompts.js` — all 11 `build*Prompt` functions accept `knownLang`
- `public/js/llm/llm_roles.js` — `_getExplainLang()`, all role methods pass `knownLangCode`
- `public/js/llm/llm_validator.js:240` — `generateWithCritic` accepts `knownLangCode`
- `scripts/pregenerate-grammar.js` — `--explain-lang ko` flag overrides for batch generation. See `docs/development.md` for full flag reference.

## Critical: APK Assets Are a Separate Copy

The Android APK bundles a **separate copy** of all web assets at `android/app/src/main/assets/`. Changes to `public/` files are **NOT** automatically synced to the APK assets — they must be manually copied:

```bash
cp public/index.html android/app/src/main/assets/index.html
cp -r public/js/* android/app/src/main/assets/js/
cp public/tailwind.css android/app/src/main/assets/tailwind.css
```

**Do NOT** edit files in `android/app/src/main/assets/` directly — always edit in `public/` and copy over. This applies to all JS, HTML, CSS, and config files. The asset file dates reveal when they were last synced.

**Pre-generation:** The `scripts/pregenerate-grammar.js` script is standalone Node.js and does NOT need asset syncing — it runs independently and writes directly to RTDB. See `docs/development.md` for full details.
