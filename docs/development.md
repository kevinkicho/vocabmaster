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

```bash
# Development
npm run watch:css       # Watch Tailwind for changes
npx serve public -p 5000 # Local dev server

# Build & Deploy
npm run build           # Compile Tailwind CSS
firebase deploy         # Deploy to Firebase Hosting

# Testing
npm test                # Run Vitest

# Android
cd android && ./gradlew assembleDebug  # Build APK
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

## CI/CD

GitHub Actions (`build.yml`) runs on every push to `master`:
- **web** job: `npm install` → `npm run build` → artifact
- **android** job: Java 21 + Android SDK → `gradlew assembleDebug` → APK artifact
