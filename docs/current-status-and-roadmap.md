# Current Status & Roadmap

**Last major update**: 2026-06-25 (Dictation, Word Context, Chat language enforcement, AI pipeline simplification)

## Current Status (v1200+)
- **11 game modes**: Flashcards, True/False, Quiz, Matching, Sentences (offline cloze), Voice Challenge, Dictation, Story Mode, Grammar Gym, Chat Practice, Word Context.
- **AI pipeline simplified**: Single fixed model `gemma4:31b-cloud`. No model detection, no dropdown, no fallback chain. Clear error on failure.
- **Chat Practice**: Language-agnostic prompts (AI always responds in target language). Long-press trash to clear chat. Transcript stores formatted HTML.
- **Sentences (offline)**: Regex-based cloze from existing vocab example sentences. No AI dependency.
- **Dictation**: TTS plays sentence, user types, word-by-word accuracy. "Show Answer" reveals partial correct words.
- **Word Context**: Gamified cloze quiz — AI generates 3 sentences at increasing difficulty, 4 multiple-choice options, scoring 5/10/15 pts.
- **Dark mode fixes**: Translation cards, cloze blanks, option buttons all properly themed.
- **TTS fixes**: Cross-engine voice selection, provider labels, Word Context skips blank word in TTS.

## Session 2026-06-17: Refactoring + Feature 9 + Verification

### R1+R2 — Error handling hardening (`main.js`)
- **R1 (global error hook)**: Replaced blanket `goHome(false)` on every unhandled error with `_handleUncaught()` — only auto-recovers when a game is mid-flight, surfaces fatal inits via toast, never wipes home/settings state on unrelated promise rejections.
- **R2 (constructor init)**: Replaced 9 swallowing try/catches with `initService(name, factory, critical)` helper. Failed services get no-op stubs (explicit method list + minimum-shape value props for `store.prefs`, `data.list`, etc.) so callers degrade gracefully instead of cascading crashes. Critical services (`store`, `ui`, `auth`, `data`, `llm`) set `_fatalError` to trigger the existing fatal-init screen.

### Feature 9 — AI init sequence + persistent status indicator
- **`init()` blocks up to 3s on `autoDetect()`** with "Connecting to AI..." status bar, then falls through to word-count status (primary info). If the probe is slow, `autoDetect` continues in background.
- **Persistent AI status indicator** on home screen (below Daily Score card): green dot "AI Online (cloud/local)", amber "AI detecting...", rose "AI Offline". Updated by `_updateAIStatus()` in `ui.js`, called from `autoDetect()` success, `_ping()` success/failure, and `goHome()` render.
- **Removed `_showAIWelcome()` + `_showToast()`** from `llm_service.js` — the surprise toast is replaced by the persistent indicator.
- **Removed redundant `app.goHome(false)`** from `autoDetect()` — home screen now renders after `autoDetect` completes in `init()`.

### Auth fix — `waitForAuth()` hang in fresh browser contexts
- **Bug (pre-existing)**: `onAuthStateChanged(null)` preempted the 1.5s anonymous-sign-in timeout and hung the Promise forever. Invisible in production (cached anon session) but blocked Playwright tests.
- **Fix**: `onAuthStateChanged` now only sets `resolved = true` when a real `user` arrives, letting the timeout fire for `signInAnonymously()` when user is `null`. See `docs/architecture.md` §10.2.

### R3 — `ui.js` split
- Extracted `ui_home.js` (174 lines): `renderLevelFilter`, `toggleLevel`, `renderTagFilter`, `toggleTag`.
- Extracted `ui_tooltips.js` (137 lines): `showTooltip`, `positionTooltip`, `hideTooltip`.
- `ui.js` went from 1418 → 1143 lines. Both new files use `UIManager.prototype.fn = ...` pattern (same as existing `ui_settings.js`, `ui_stats.js`).

### R5 — `llm_service.js` style normalization
- Converted all `function().bind(this)` → arrow functions. `var` → `const`/`let` where unassigned. No behavior changes.

### R6+R8 — Repo hygiene
- Deleted stray `nul` (53KB Tailwind artifact) + `test.html` from root.
- Moved 5 `SENSITIVITY_*.md` docs into `docs/`.
- Removed stray `@rolldown/binding-linux-x64-gnu` direct dependency (transitive via vitest/vite, was wrongly pinned in `dependencies`).

### R7 — Test directory consolidation
- Consolidated `tests/` + `tests-e2e/` + gitignored `test/` into single `tests/` tree: `tests/unit/`, `tests/e2e/`, `tests/tools/`, `tests/audit/`.
- Updated all `package.json` script paths, `playwright.config.js` `testDir`, vitest spec path references, README "Test Structure" section.
- The critical checker (`tests/tools/check_critical.js`) and all e2e specs are now committed — fresh clones can run `npm run validate` without needing a gitignored `test/` dir.

### R4 — Documentation
- Added `game_chat.js` to README file table (was missing).
- Added 22-line header comment to `game_chat.js` documenting responsibilities, instance state, dependencies.
- Added `ui_home.js` + `ui_tooltips.js` to README file table.

### Doc sweep
- `IMPLEMENTATION_PLAN.md`: Marked Features 5–8 as ✅ DONE (verified by grep), Feature 9 as completed. Stale implementation-order lists struck through.
- `docs/medium-term-roadmap.md`: Fixed corrupted UTF-16 footer (null bytes between every ASCII char from a bad paste). Pruned ~200 lines of narrative debug saga into concise "Completed Work" summary.
- `docs/current-status-and-roadmap.md`: Pruned ~540 lines of narrative debug saga (790→240 lines). Distilled Story 0-token saga into concise technical record.
- Fixed stale `public/js/llm.js` → `public/js/llm/llm_service.js` references in 4 docs.

### Playwright verification (2026-06-17)

All AI features verified working against the cloud proxy (`https://ollama-proxy-1020976660084.us-central1.run.app`) with `gemma4:31b-cloud`:

| # | Feature | Result | Evidence |
|---|---------|--------|---------|
| Init | App boots, auth, data, LLM | PASS | 6035 words loaded, anon auth resolved, 35 LLM models detected, `gemma4:31b-cloud` resolved |
| 1 | AI Status Indicator (F9) | PASS | Green dot + "AI Online (cloud)" on home screen |
| 2 | Story Mode | PASS | Cached story served from RTDB, prefetch generated 2 new questions via critic pipeline, full Japanese story text rendered with 4 vocab words |
| 3 | Chat Mode | PASS | Launched with "DAILY LIFE / B1" header, typing indicator, input field present |
| 4 | Sentences (AI Cloze) | PASS | Mandatory LLM cloze generation fired, Japanese sentence + translation displayed |
| 5 | Grammar Gym | PASS | Launched, "Generating (attempt 1/1)..." with countdown, vocab + example shown |
| Errors | No page errors | PASS | Zero `pageerror` events across all tests |

**LLM pipeline confirmed**: `autoDetect` → `checkConnection` → "Connected — 35 models" → `gemma4:31b-cloud` resolved → `generate sending to` (proxy URL) → critic evaluation → content generated.

## Recent Work: Grammar Gym RTDB Cache + TTS Enhancements (2026-06-13)

### Cache Layer
- AI-generated Grammar Gym exercises are saved to RTDB at `grammar_exercises/{vocabId}/{langCode}/{token}` (public read, write requires `auth != null`).
- Live app checks cache first via `loadCachedGrammarExercise(vocabId, langCode)`; on miss it generates and auto-saves.
- Tagged as "Loaded from cache" in the explanation view when served from RTDB.

### TTS Interactions
- **Vocab portion** in the header is clickable → plays TTS in the target language engine (e.g., Chinese engine when learning Chinese).
- **Sentence example** above the explanation is clickable → plays TTS with target language engine.
- **Example sentence** in the explanation card is clickable → plays TTS in target language.
- **Answer choices**: first click plays TTS reading only `ch.text` (data portion, not the `labelA`/`labelB` like "send this" / "sounds wrong"). Second click submits as the answer. Ring highlight indicates the active choice. Radio-button behavior — clicking a new choice deselects the previous one.

### Generate Anew
- Button shown during loading and on the summary screen, below "Try Again".
- Skips the RTDB cache and forces a fresh LLM generation.

### Pre-generation Script
- `scripts/pregenerate-grammar.js` reads all vocab from RTDB and generates exercises in bulk, saving to the same `grammar_exercises/` path. Supports `--dry-run`, `--limit`, `--lang`, `--vocab-id`, `--skip-existing`, `--ollama`, `--model`, `--service-account`. Validates 12 exercises, all 12 type variants, and 6A/6B answer balance.

### Settings Fix
- `renderGrammarSettings()` method was missing from `ui_settings.js`. Grammar Gym's `grammar-q` and `grammar-a` `<select>` elements had no options populated, so closing Settings read empty values and reverted `grammarQ`/`grammarA` to `'ja'` default. Now populated via `createOpts` like other modes.

## Recent Work: Native Google Sign-In (2026-06-13)

### Problem
The auth button in the Android APK silently did nothing. Google OAuth popup/redirect both fail from `file:///android_asset/` origin. Previous workaround (navigate to Firebase Hosting URL) was a dead end — the hosting page had stale code and auth state didn't carry back to the APK.

### Solution
Integrated native Google Sign-In directly into the Android WebView wrapper:

- **Kotlin side** (`MainActivity.kt`): Added Firebase Auth + Google Sign-In SDKs (`com.google.firebase:firebase-auth`, `com.google.android.gms:play-services-auth`). `NativeAuthJSInterface` exposes `signIn(callbackId)` and `signOut()` via `@JavascriptInterface`. `onActivityResult` receives the Google account, extracts ID token + photo URL + display name, and passes them (Base64-encoded) to JS via `evaluateJavascript`.
- **JS bridge** (`native_auth.js`): `window.__nativeAuth` receives the ID token + profile, calls `firebase.auth.GoogleAuthProvider.credential(idToken)` + `auth.signInWithCredential()`, then `user.updateProfile({ photoURL, displayName })` to populate the profile image.
- **`handleAuthClick()`** (`main.js`): When `window.location.protocol === 'file:'` and `window.NativeAuth` is available, uses native sign-in. Falls back to hosting redirect if native bridge unavailable.
- **Package name**: Changed from `com.vocabmaster.app` to `com.kevinkicho.vocabmaster` to match the Firebase Android app in `google-services.json`.
- **SHA-1**: Debug keystore fingerprint `96:5B:C6:8A:B2:BB:5E:FB:09:93:05:F5:7A:FE:42:06:EB:27:ED:E8` registered in Firebase Console.

### Result
Auth button now triggers native Google Sign-In directly from the APK. User sees Google account picker, signs in, and profile image appears in the topbar button. No hosting redirect needed.

### Relevant Files
- `android/app/src/main/java/com/vocabmaster/app/MainActivity.kt` — native sign-in implementation
- `public/js/native_auth.js` — JS bridge for native auth
- `public/js/main.js` — `handleAuthClick()` with native auth path
- `public/index.html` — script loading order (native_auth.js before capacitor_tts_bridge.js)
- `android/app/build.gradle.kts` — Firebase + Google Sign-In SDK dependencies, `applicationId = "com.kevinkicho.vocabmaster"`
- `android/build.gradle.kts` — `com.google.gms.google-services` plugin
- `google-services.json` — Firebase Android app config (also copied to `android/app/google-services.json`)

### Prior Auth Work (also 2026-06-13)
- **Auth button spinner-stuck bug fixed**: Two code paths (early return for anonymous + `.then()` callback) didn't reset button HTML after showing spinner. Both now reset to user icon.
- **`getRedirectResult()` added** in `init()` to handle redirect auth results on app reload.
- **Auth listener** keeps `onclick` handler for anonymous users (was `null` before, making button do nothing).

---

This document exists so future agents (and humans) can pick up context quickly without reading every past chat or old AGENTS.md files.

**See also**:
- `docs/lessons-learned.md` — guardrails from past vocabulary generation failures.
- `docs/medium-term-roadmap.md` — collections, review queue, Story + higher tiers.

**Agency decision (2026-06)**: I have taken the lead and chosen the execution order:
1. **Story fallback quality first** (improve the safety-net content that the RTDB logs proved is 100% of what users currently see — target-language micro-stories + real questions + honest "basic mode" indicator). This directly fixes the "quality so bad" experience with data we gathered.
2. Complete the Settings reorg (finish the original 4-phase plan).
3. Medium-term: Collections (as foundation).

Rationale and full details are in the midterm doc. Work on slice 1 begins now following all AGENTS rules (todos, reads first, full clean builds, device + log verification before any claims).

## What Was Just Completed

### Short Term (Hygiene + Maintainability)
- **Build / Git Hygiene**
  - Comprehensive Android + Gradle ignores added to `.gitignore`.
  - New npm scripts for reproducible Android asset preparation:
    - `npm run prepare:android`
    - `npm run sync:android`
    - `npm run clean:android`
    - `npm run build:android`
  - These replace fragile manual `cp -r public/* android/...` steps and dramatically reduce untracked build noise.

- **Settings Registry (Phase 1 complete)**
  - The massive monolithic `renderSettingsUI()` in `ui.js` was extracted into clean named methods:
    - `renderFlashcardSettings`, `renderQuizSettings`, `renderTFSettings`, `renderVoiceSettings`, `renderSentencesSettings`, `renderMatchSettings`, `renderGlobalAudioGrid`.
  - `createOpts()` and `createGrid()` are now proper reusable class methods.
  - Load/save were already using the `preferences_registry.js` schema.
  - Result: Adding a new preference is now close to "1 line in the registry + HTML + one call in the right sub-renderer".

### Strategic Decision: Web AI Parity
User explicitly chose: **Web and Android should be equivalent for AI features**.

- The APK exists primarily because good Android system TTS (Google/Samsung) is not reliably available to web code in Chrome/WebView, and the built-in voices are poor for language learning.
- LLM-powered features (Smart Cloze + Story Mode with streaming, questions, etc.) must work the same on the deployed web app.

**Implementation**:
- Client-side transport abstraction in `llm/llm_service.js` (`_isBrowserWeb()` + `_ollamaRequest()`).
- Firebase Cloud Function proxy (`functions/src/index.ts`) upgraded to support true streaming (NDJSON) instead of buffering.
- Default proxy URL wired in; easily overridable.
- Both non-streaming (`generate`) and streaming (`streamGenerate`) paths now get automatic web support.

Detailed design, rationale, deployment notes, and testing instructions live in:
**`docs/web-ai-parity-proxy-implementation.md`**

## Current State of Key Systems

- **Data / Content**: Significant recent investment in enriched multi-language, multi-level vocabulary (especially higher JLPT tiers) with good example sentences. This is currently one of the strongest assets of the project.
- **AI**: Now has a path to parity. Story Mode remains the most distinctive feature.
- **Settings**: Much better than the "200+ explicit DOM ID lookups" era, but presets logic is still manual (see medium term).
- **Android**: Local assets are the primary runtime. Native TTS is mature.
- **Web**: Hosting works. AI was the main missing piece for parity — now addressed at the code level.

## Medium Term Priorities (Recommended Order) - All Advanced

See dedicated `docs/medium-term-roadmap.md` for details and live progress log. Significant work completed on collections, review queue, and Story integration with higher tiers.

High-level:

1. **Productize Collections + Tier Support**
    - Turn the stub `collections.js` module into a real system (multiple named collections, tier-based like "JLPT N3 Core", user custom).
   - Integrate selection into home, data filtering (`getFilteredList`), game start, and Story word picking.
   - Higher-tier data (enriched N3/N2/N1 etc. from /data/ and RTDB) must be first-class and filterable.

2. **Unified Review / Learning Queue**
   - Bridge `analytics.js` (attempts), `adaptive.js` (difficulty), `learning_loop.js` (behavioral data + prompt adjustments), struggle data.
   - Build a review queue mode or "Smart Practice" that pulls weak words across modes + Story performance.
   - Collections should be able to scope reviews.

3. **Story Mode Excellence + Higher-Tier Leverage**
   - Ensure `_pickWords` and generation visibly use enriched higher tiers when selected.
   - Add collection-aware stories, better post-story flows, replay/save, direct links to review queue for missed words.
   - Improve comprehension question quality and integration with learning data.

See the original recommendations in the conversation that led to this document for more detail.

---

## Resolved Issues (Historical Record)

> **Note (2026-06-17)**: This section replaces ~540 lines of narrative debug saga that previously filled this file (the "Story Mode 0-token" debugging loop, multiple revisions of the same retrospective, and step-by-step repro instructions aimed at a user who is no longer the audience). The technical content is preserved here in concise form. The full saga is in git history if ever needed.

### Story Mode 0-Token Issue (2026-06-09 → resolved in code)

**Symptom**: Story mode showed "Couldn't generate questions this time." + blank screen for local `ollama4android` users.

**Root cause** (confirmed via RTDB debug logs pulled with a service account): `ollama4android`'s `/api/tags` endpoint listed cloud aliases (e.g. `deepseek-v3.1:671b-cloud`) *first*. VocabMaster's `autoDetect` picked `candidates[0]`, the request hit `ollama4android`'s internal cloud proxy → 403 subscription error → 0 tokens. The client-side code was correct in intent (endpoint forced to `127.0.0.1:11434`, `useCloud=false`), but the model selection logic naively took the first advertised model.

**Fixes that stuck** (all verified against device logs):
- `LLMService._getLocalCandidates()` — filters out any model name containing "cloud" or "ollama.com" when `!useCloud`. All picking logic (autoDetect, generate, streamGenerate) uses the filtered list first.
- `_getSafeLocalModel()` — prefers known-good local models in order: `gemma2:27b`, `llama3.1:70b`, `mistral-nemo:12b`.
- Story retry on 0-length — switches to the next local candidate and retries the stream once.
- Unconditional local fallback — if all retries fail, injects a minimal parseable story + 2 questions so the activity completes instead of showing a bare error. (This is why the user later reported "its workinhg yay but the quality of question and quizzes are so bad" — they were seeing the fallback, not real LLM output.)
- RTDB debug logging moved from `/debug_logs/{uid}/...` (permission_denied) to `/users/{uid}/debug_logs/...` (works under existing user-data rules).

**What remains outside our control**: Whether `ollama4android` actually serves a local model for the name we request. The fallback makes the app resilient; real LLM output depends on the user having a local model loaded in `ollama4android`.

**Key lesson from the saga**: The `ollama4android` side is a black box — we only see the JS view (tokens:0, parsed:0). The actual HTTP response or routing decision lives in the other process. The fix was to (a) stop trusting `/api/tags` ordering, (b) filter aggressively on our side, (c) add enough logging to prove the client was doing the right thing, (d) make the failure mode graceful instead of a bare error.

### Quality Phase (post-fix)

After the 0-token fix, Story mode stopped crashing but output was poor because the hardcoded English fallback ("The words X appeared in a short tale about learning and adventure..." + trivial meta questions) was 100% of what users saw. The real LLM path's rigid prompt format ("Q1:\n... A) ... ANSWER: (letter)") was too strict for small local models — slight deviations (casing, "Question 1" instead of "Q1:", missing ANSWER line) caused `_extractQuestions`'s regex to reject the output and fall to the dumb fallback.

**Mitigations applied** (some may still be in code; verify before relying on):
- Hardened model forcing in all local branches (autoDetect, generate, streamGenerate) — never leak a cloud model name into a `!useCloud` request.
- Surfaced `modelUsed` in the failure UI so the user sees which model was tried.
- Auto RTDB flush on every error path for diagnosis.

**Open question** (not resolved as of last session): Should we relax `_extractQuestions` to salvage near-misses, strengthen the system prompt with few-shot examples, or do a second "fix the format" LLM pass? This is a product-quality decision, not a bug fix.

### Remote Debug Logging to RTDB (2026-06-09)

All logs (200-line always-on buffer fed by `L()` + console overrides + global error hooks) are mirrored to Firebase RTDB under the signed-in user's UID.

- Path: `users/{uid}/debug_logs/sessions/{VM_SESSION_ID}/batches` (pruned to last ~15 batches).
- Auto-flush on: 20s timer, console error, global error, unhandled rejection, Story generation fail, "0 questions parsed" path, LLM connection fail, Settings modal close, `goHome()`, early after boot.
- UI in Settings → Developer (always visible): "Push now", "Fetch recent", "Download from RTDB", "Clear my RTDB logs", status line with session ID + UID tail + last push time + exact RTDB path.
- The original local buffer + "Download .log File" and `adb` paths remain intact (this is purely additive remote backup + easier retrieval).

### Screenshot Analysis (2026-06-09)

Two screenshots were provided during debugging. Only one (`Screenshot_20260609_100937.jpg`) was on disk at analysis time — it showed the "Couldn't generate questions this time." soft-fail UI, matching the 0-token root cause above. The other screenshot (referenced but missing) showed pre-fix state with garbled settings UI (leaked CSS classes from a bad `innerHTML` injection) — fixed in source by the settings reorg.

---

## How to Keep Future Work Seamless

- **Always document** significant architectural decisions, transport changes, or data model work in `docs/`.
- Prefer adding to or creating focused files like `web-ai-parity-proxy-implementation.md` rather than scattering notes.
- When touching the LLM pipeline, remember the web vs native transport split (`_isBrowserWeb()` + `_ollamaRequest()`).
- When touching settings, prefer going through the registry (`preferences_registry.js`) + the sub-renderers (`ui_settings.js`).
- Run `npm run prepare:android` (or `build:android`) before Android builds.
- Work directly, ship useful increments, and leave good documentation.

## Quick Links for Agents

- Web AI Proxy details: `docs/web-ai-parity-proxy-implementation.md`
- Development commands & Android workflow: `docs/development.md`
- Architecture overview: `docs/architecture.md`
- Vocabulary enrichment lessons: `docs/lessons-learned.md`
- Medium-term roadmap (collections, review, higher tiers): `docs/medium-term-roadmap.md`
- Audio & TTS architecture: `docs/audio-tts-architecture.md`
- Telemetry & remote logging: `docs/telemetry-feedback.md`
- Codebase modularization: `docs/codebase-modularization.md`
- Refactoring & hygiene plan (R1–R8): `REFACTORING_PLAN.md`
- Implementation plan (Features 1–9): `IMPLEMENTATION_PLAN.md`
- Main app entry: `public/js/main.js`, `public/index.html`
- LLM core: `public/js/llm/llm_service.js` (and `llm_validator.js`, `llm_schemas.js`, `llm_prompts.js`, `llm_roles.js`, `llm_cache.js`, `llm_init.js`)
- Settings: `public/js/preferences_registry.js`, `public/js/store.js`, `public/js/ui.js`

> **Stale references cleaned up**: The previous version of this doc referenced `public/js/llm.js` — that file was deleted in the LLM pipeline refactor and split into `public/js/llm/`. The "Quick Links" above now point to the correct locations.

---

This document should be updated at the end of any substantial work session.

### Settings UI Refactor (Completed)
- Cleaned up the main Settings Modal to remove legacy 'Level Filter' and 'Collections' UI. These are now properly managed globally via the Collections tier system at the top of the app.
- Completely reordered the Settings UI to match the user's explicit preference flow: Presets → Global Theme → Fonts → Mouse & Tooltips → Keyboard → Audio Buttons → Celebrations → (Divider) → Activity-specific settings (Flashcards, Quiz, True/False, Matching, Voice, Voice Selection, Sentences, AI, Grammar Gym).
- Extracted 'Enable Audio Buttons' logic out of the main visual theme card and created a dedicated collapsible `<details>` drawer specifically for Audio Buttons.

### Input Mode & UI State Fixes (Completed)
- Verified 'Input Mode' (Single Click vs Double Click) is wired to the core game engine (`handleInput`) and functionally covers both Quiz and Sentences (AI Cloze) without requiring duplication.
- Fixed a Tailwind CSS compilation bug where light-mode `peer-checked` styling for settings toggles was being stripped by the compiler. Added `peer-checked:bg-white` and `peer-checked:text-slate-700` to the `safelist` in `tailwind.config.js` and rebuilt CSS, restoring visual toggle states for radio buttons across the app.

### Settings Modal UI Reorganization (Completed)
- Reorganized the main Settings Modal to improve usability and group related options logically.
- Order is now: Presets → Global Options (Visual Theme) → Fonts → Mouse & Tooltips → Keyboard → Audio Buttons (New Drawer) → Celebrations → (Divider) → Game Specific Settings (Flashcard, Quiz, etc.) → AI Settings → Grammar Gym.
- Extracted 'Enable Audio Buttons' into its own collapsible drawer named 'Audio Buttons' placed above Celebrations.
- Removed redundant 'Collections' and 'Level Filter' selectors from the settings modal to prevent duplication, keeping them exclusively in the main menu where they function best.
