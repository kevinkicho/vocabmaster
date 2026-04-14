# VocabMaster

**VocabMaster** is a PWA language learning app built with Vanilla JavaScript, Tailwind CSS v3, and Firebase. It features seven game modes (including AI-powered Story Mode), granular per-mode settings, context-aware audio, on-device LLM integration, and a smooth render pipeline — all in a single-page app optimized for mobile.

**Live:** [vocabmaster112225.web.app](https://vocabmaster112225.web.app)

---

## Game Modes

| Mode | Description |
| :--- | :--- |
| **Flashcards** | Flip cards with configurable front/back languages (up to 4 back fields). Auto-play audio on flip. |
| **Quiz** | Multiple-choice with 4 answer buttons. Flippable question card reveals example sentences. |
| **True / False** | Decide if a word matches its translation. Toggleable example sentences with audio. |
| **Matching** | Grid-based pair matching with responsive tiling. Adaptive layout scoring for portrait/landscape. |
| **Sentences** | Fill-in-the-blank cloze with smart masking — handles conjugations, multi-word phrases, and CJK. |
| **Voice** | Speech recognition challenges via Web Speech API. Pronunciation matching with fuzzy comparison. |
| **Story Mode** | AI-generated stories using your vocab words with streaming display and comprehension questions. Powered by local or cloud LLM via Ollama. |

---

## AI / LLM Integration

VocabMaster integrates with [Ollama](https://ollama.com) for on-device AI features:

- **Story Mode** — Selects vocab words (weighted by struggle analytics), prompts the LLM to generate a short story in the target language, streams tokens to the UI in real time, then presents 2 comprehension questions with 4-choice answers. Background prefetching means the next story is ready by the time you finish the current one.
- **Smart Cloze** — LLM-assisted blank placement for the Sentences game, identifying conjugated word forms in CJK languages.
- **Model-agnostic** — Auto-detects whatever model is loaded (Gemma, DeepSeek, Qwen, etc.) via `/api/tags`. No hardcoded model requirement.
- **Request serialization** — All LLM calls are queued to avoid overwhelming single-threaded inference on mobile.
- **IndexedDB caching** — LLM responses are cached to avoid redundant generation.

### Android App

An Android Studio WebView wrapper is available that bypasses Chrome's HTTPS-only restriction for localhost, enabling communication with [Ollama4Android](https://github.com/kevinkicho/Ollama4Android) running on the same device.

- **Native bridge** — Kotlin `@JavascriptInterface` ↔ `evaluateJavascript()` bridge with promise-based async pattern
- **Streaming support** — Token-by-token streaming from Ollama via native HTTP, pushed to JS via `onToken` callbacks
- **Port discovery** — User enters the port shown in Ollama4Android; saved to localStorage for reconnection
- **Encoding** — All bridge data is JSON-encoded via Gson for safe Unicode/CJK handling

---

## Key Features

- **14 languages supported** — Japanese, Korean, English, Chinese, Spanish, Portuguese, Italian, French, German, Russian (+ Furigana, Romaji, Pinyin, Transliteration visual columns)
- **Per-mode settings** — Each game mode has independent controls for language pairs, audio behavior, randomization, and example display
- **Context-aware audio** — `playSmartAudio()` detects visible content (word vs. example sentence) and plays the appropriate audio
- **Auto-play on correct** — Quiz, TF, Voice, and Sentences modes play audio on correct answer with configurable `audioWait` (waits for TTS to finish before auto-navigating)
- **Render pipeline** — Container hidden during updates, text fitted via binary search, then smooth 0.3s fade-in reveal
- **Dynamic text fitting** — `fitSmart()` derives max font size from `min(containerWidth, containerHeight)` and binary-searches both axes; `fit()` scales single-line text to fill its container
- **Responsive match grid** — `calcLayout()` scores all valid col/row combinations by cell aspect ratio, area, and orientation preference, then sets both CSS grid axes
- **Analytics** — Per-word accuracy tracking, daily score history, weekly/monthly charts, most-missed-words dashboard
- **Themes** — 5 color themes (Classic, Sakura, Ocean, Coffee, Cyber) + dark mode + font family/style/weight controls
- **Celebrations** — 13 confetti effects (emoji-shaped particles via canvas-confetti) with per-effect enable/disable
- **Presets** — One-click "I know X, I want to learn Y" presets that configure all game modes at once
- **Offline PWA** — Service worker with stale-while-revalidate caching, flag icon prefetch, and per-asset error handling
- **Firebase backend** — Auth (anonymous + Google), Realtime Database for scores and vocab data

---

## File Structure

| File | Purpose |
| :--- | :--- |
| `public/index.html` | Single-page shell — settings modal, theme grid, game containers, script loading |
| `public/js/main.js` | App controller — init, auth listener, routing, home dashboard with conditional AI section |
| `public/js/config.js` | `LANG_CONFIG` array, `LANG_MAP` (O(1) lookups), `GET_DEFAULTS()`, flag icon helper |
| `public/js/store.js` | `saveSettings()` reads all UI controls into `prefs`, `applyTheme()`, localStorage persistence |
| `public/js/ui.js` | Dynamic UI — `header()`, `audioBar()`, `loadSettings()`, theme/font/preset/celeb renderers |
| `public/js/services.js` | `AudioService` (TTS), `TextFitter` (`fit` + `fitSmart`), `CelebrationService` (confetti) |
| `public/js/analytics.js` | Per-word accuracy tracking, session recording, weekly/monthly stats, most-missed-words |
| `public/js/llm.js` | `LLMService` — Ollama connection, model auto-detection, cloze matching, port prompt UI, AI welcome modal |
| `public/js/android_bridge.js` | Promise-based JS wrapper for Android `@JavascriptInterface` with streaming `onToken` support |
| `public/js/game_core.js` | `GameMode` base class — nav, keyboard, scoring, `waitAndNav`, `autoPlay`, `handleInput`, DOM caching |
| `public/js/game_flashcard.js` | Flip card with 1–4 back panels, speed control, context-aware flip audio |
| `public/js/game_quiz.js` | 4-choice quiz, flippable question card, correct-answer audio, double-click mode |
| `public/js/game_tf.js` | True/False with random distractor swapping, correct-answer audio, visual feedback |
| `public/js/game_match.js` | Grid matching — adaptive `calcLayout()`, pair restore, hint highlighting |
| `public/js/game_sentences.js` | Cloze generator with variant/token/conjugation matching, LLM-assisted blanks, translation hint |
| `public/js/game_voice.js` | Web Speech recognition, locale mapping, correct-answer playback, visual feedback |
| `public/js/game_story.js` | AI Story Mode — word selection, LLM streaming, question parsing, prefetch pipeline |
| `public/js/data.js` | CSV parsing, Firebase RTDB read/write, score recording, stats |
| `public/js/auth.js` | Firebase Auth (anonymous + Google sign-in) |
| `public/js/notes.js` | Admin note editing, Hanzi character tooltips with long-press support |
| `public/js/presets.js` | Language pair presets that bulk-configure all game mode settings |
| `public/js/firebase.js` | Firebase compat SDK v11 initialization |
| `public/sw.js` | Service worker — versioned cache, stale-while-revalidate, per-asset error handling |
| `public/style.css` | Custom CSS — fit-target/fit-smart opacity transitions, app-view reveal, Hanzi tooltips |
| `public/favicon.svg` | Indigo rounded-square "V" icon |

---

## Tech Stack

- **Frontend:** Vanilla JS (ES6+ classes), Tailwind CSS v3 (static build), Phosphor Icons
- **Backend:** Firebase Hosting, Auth, Realtime Database (compat SDK v11)
- **AI:** Ollama (local or cloud), model-agnostic — works with Gemma, DeepSeek, Qwen, etc.
- **Android:** Kotlin WebView wrapper with `@JavascriptInterface` native bridge, Gson
- **Audio:** Web Speech Synthesis API (TTS), Web Speech Recognition API (voice mode)
- **Animations:** canvas-confetti, CSS transitions
- **Charts:** Chart.js (stats dashboard)
- **Fonts:** Google Fonts — Nunito, Noto Sans JP, Noto Sans KR

---

## Related Projects

- **[Ollama4Android](https://github.com/kevinkicho/Ollama4Android)** — Android app that runs Ollama locally on-device (or proxies to cloud models), providing the LLM backend for VocabMaster's AI features.
