# Development Guide

## Project Structure

```
vocabmaster-master/
├── public/                  # Web app (deployed to Firebase Hosting)
│   ├── index.html           # SPA shell
│   ├── js/                  # JavaScript modules
│   │   ├── main.js          # App controller & routing
│   │   ├── config.js        # Language config, LEVEL_CONFIG, defaults
│   │   ├── store.js         # Preferences & localStorage persistence
│   │   ├── ui.js            # UI rendering & settings
│   │   ├── services.js      # AudioService, TextFitter, CelebrationService
│   │   ├── data.js          # CSV parsing, Firebase RTDB read/write
│   │   ├── analytics.js     # Per-word accuracy tracking
│   │   ├── llm.js           # Ollama LLM integration
│   │   ├── native_tts.js    # Android native TTS bridge
│   │   ├── native_auth.js    # Android native Google Sign-In bridge
│   │   ├── android_bridge.js # Android LLM bridge
│   │   ├── game_core.js     # GameMode base class
│   │   ├── game_flashcard.js
│   │   ├── game_quiz.js
│   │   ├── game_tf.js
│   │   ├── game_match.js
│   │   ├── game_sentences.js
│   │   ├── game_voice.js
│   │   ├── game_story.js
│   │   └── __tests__/
│   ├── sw.js                # Service Worker
│   ├── style.css            # Tailwind input
│   └── tailwind.css         # Compiled CSS
├── android/                 # Android WebView wrapper
│   ├── app/
│   │   ├── build.gradle.kts
│   │   └── src/main/java/com/vocabmaster/app/
│   │       ├── MainActivity.kt    # WebView host
│   │       └── TTSBridge.kt       # Native Android TTS
│   ├── build.gradle.kts
│   └── settings.gradle.kts
├── functions/               # Firebase Cloud Functions
├── scripts/                 # Data processing utilities
├── tests/                   # Unit tests (Vitest)
├── data/                    # Vocabulary exports & word lists
├── docs/                    # Documentation
└── .github/workflows/       # CI/CD
```

## Commands

**Tests are now automatically enforced before every APK/web asset build (prepare:android, sync, build:android):**
- `package.json` now prefixes `prepare:android` (and thus `build:android` / `sync:android`) with `npm run validate`.
- This runs the full suite (`node tests/check_critical.js && npm test`) — critical pre-build checks (syntax, class definitions, script load order in index.html, template balance, no stale references, JSON/HTML sanity, Android manifest notes, etc.) + all Vitest tests (310+ across llm, vocabulary, adaptive, collections/review, escape, config, etc.).
- `build:android` now actually executes: validate + prepare (CSS + assets sync to android/app/src/main/assets/) + `cd android && ./gradlew clean assembleDebug --no-daemon` (expect "34 actionable tasks: 34 executed").

```bash
npm run validate          # critical + full vitest (now auto in prepare)
npm run validate:critical # fast node checker only
npm run build:android     # Full: tests + prepare + clean Gradle APK build
```

After code changes (especially settings, LLM/Story/AI Cloze prompts, collections, data filters, game modes, menu items):

**Web / Android / Feature Parity Rule (critical for diagnosis)**

public/ (and its js/) is the *single source of truth* for all functionality, including AI-powered activities.

- Story Mode and AI Cloze (the mandatory-AI, no-fallback versions) must be identically available and behave the same whether you load the webapp directly from public/ (browser / local server / Firebase Hosting) or run the packaged APK (which is just a WebView loading the last copied assets from android/app/src/main/assets/).
- Never introduce platform/runtime guards (e.g. `if (app.llm)`, `if (window.NativeTTS)`, `isWebView`, `Capacitor` etc.) that hide, rename, or change the availability/behavior of the AI activities (Story, AI Cloze / the enforcing Sentences path) between web and Android.
- The menu always renders the AI section and its buttons the same way.
- The enforcement (AI required / clean error instead of dummy content) lives in the shared game_story.js and game_sentences.js.
- After any edit to AI logic, menu, LLM, or games: run the sync (or full `npm run build:android`) so the Android copy matches. Stale assets in the APK are a common source of "two different copies with different capabilities" and diagnosis pain.
- For web users: AI works by configuring a compatible backend in Settings > AI (local ollama on the desktop machine at http://localhost:11434, or the Firebase proxy + cloud key for hosted web). The same mandatory "AI required" UX applies as on device.
- Platform differences are allowed *only* for non-AI concerns (e.g. native TTS quality via bridge vs browser speech, WebView auth vs popup, file loading). Core activity availability and LLM-powered behavior must stay the same.
- The validate gate now always runs before asset sync / Gradle, catching init/runtime errors early.
- Still recommended to run explicitly for non-Android deploys (firebase hosting, etc.).
- Per AGENTS.md build protocol: use the full `npm run build:android` (or at minimum validate + prepare + clean gradle) after changes. No incremental — always clean for APK. 

The gate covers schema, collections/tiers/review, LLM prompt/response handling, Story/AI Cloze mandatory paths (no fallbacks), first-run, etc.

```bash
# Development
npm run watch:css       # Watch Tailwind for changes
npx serve public -p 5000 # Local dev server

# Build & Deploy (ALWAYS validate first to catch init/runtime errors)
npm run validate          # Runs critical pre-build checker + all Vitest suites (recommended before any prepare/deploy)
npm run validate:critical # Just the node-based init/runtime smoke checks
npm run build           # Compile Tailwind CSS
firebase deploy         # Deploy to Firebase Hosting

# Testing
npm test                # Run Vitest (unit tests for adaptive, llm, collections, review, etc.)

# Android (improved hygiene - tests now automatic)
npm run build:android     # validate (all tests) + prepare:android (CSS + sync) + cd android && ./gradlew clean assembleDebug --no-daemon
# (Or run steps manually; validate is now baked into prepare/build:android)

# Firebase Functions (AI proxy, etc.)
cd functions && npm run build     # Compile TypeScript (or let firebase predeploy do it)
firebase deploy --only functions

# Cleaning build noise
npm run clean:android     # Removes android/app/build, .gradle caches, stale assets
```

## Adding a New Game Mode

1. Create `public/js/game_newmode.js` extending `GameMode`
2. Implement `render()` and `update()` methods
3. Add constructor registration in `main.js:launchGameMode()`
4. Add button in `main.js:goHome()` method
5. Add settings accordion in `index.html`

## Adding a New Language

1. Add entry to `LANG_CONFIG` in `config.js`
2. Add TTS locale mapping
3. Add flag icon URL
4. Add translation fields to all vocab entries
5. Update `GET_DEFAULTS()` in `config.js`

## Debug Mode

Add `?debug=1` to the URL to enable console logging. The `L()` function in `escape.js` gates all diagnostic output behind this flag.

## Web AI Parity (LLM / Story / Smart Cloze on pure browser)

Web and Android now aim for full AI feature parity (see `docs/web-ai-parity-proxy-implementation.md`).

- On pure web (Firebase Hosting), LLM calls are transparently routed through the `ollamaProxy` Cloud Function to bypass CORS.
- Streaming (Story mode) is supported.
- Android still wins on TTS quality via the native bridge.
- Configure/override: `window.OLLAMA_PROXY_URL = 'https://...cloudfunctions.net/ollamaProxy'`

Deploy functions after changes to the proxy:

```bash
cd functions && npm run build
firebase deploy --only functions
```

## Pre-generating AI Content

### Grammar Gym (`scripts/pregenerate-grammar.js`)

Bulk-generates Grammar Gym exercises and saves to RTDB at `grammar_exercises/{vocabId}/{langCode}/{token}`. The live app serves these from cache (see `loadCachedGrammarExercise` in `llm.js`) to avoid ~30-100s waits on first visit.

```bash
cd scripts
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --skip-existing
node pregenerate-grammar.js --service-account ../serviceAccountKey.json --dry-run --limit 5
node pregenerate-grammar.js --service-account ../serviceAccountKey.json --lang ja --vocab-id 1759
```

Flags: `--dry-run`, `--limit N`, `--lang ja`, `--vocab-id N`, `--skip-existing`, `--ollama URL`, `--model NAME`, `--service-account PATH`. Validates 12 exercises, all type variants, and 6A/6B answer balance. 500ms delay between calls.

## CI/CD

GitHub Actions (`build.yml`) runs on every push to `master`:
- **web** job: `npm install` → `npm run build` → artifact
- **android** job: Java 21 + Android SDK → `gradlew assembleDebug` → APK artifact
