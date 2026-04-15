# VocabMaster

**VocabMaster** is a PWA language learning app built with Vanilla JavaScript, Tailwind CSS v3, and Firebase. It features seven game modes (including AI-powered Story Mode), granular per-mode settings, context-aware audio, LLM integration via Ollama, and a smooth render pipeline — all in a single-page app optimized for mobile.

**Live:** [vocabmaster112225.web.app](https://vocabmaster112225.web.app)

---

## Game Modes

| Mode | Description |
| :--- | :--- |
| **Flashcards** | Flip cards with configurable front/back languages (up to 4 back fields). Auto-play audio on flip. |
| **Quiz** | Multiple-choice with 4 answer buttons. Flippable question card reveals example sentences. |
| **True / False** | Decide if a word matches its translation. Flippable example sentences with audio. |
| **Matching** | Grid-based pair matching with responsive tiling. Adaptive layout scoring for portrait/landscape. |
| **Sentences** | Fill-in-the-blank cloze with smart masking — handles conjugations, multi-word phrases, and CJK. |
| **Voice** | Speech recognition challenges via Web Speech API. Pronunciation matching with fuzzy comparison. |
| **Story Mode** | AI-generated stories using your vocab words with real-time streaming display, TTS read-aloud, comprehension questions, and RTDB caching for instant replay. |

---

## AI / LLM Integration

VocabMaster integrates with [Ollama](https://ollama.com) for AI-powered features:

### Story Mode
- Selects vocab words (weighted by struggle analytics), prompts the LLM to generate a short story in the target language
- **Streaming UI** — Tokens stream directly into the final story card (no raw text → replace flash)
- **Session progress** — 5 stories per session with progress indicator (1/5) in the header
- **TTS read-aloud** — Speaker button reads the story via Web Speech API; auto-read setting (on by default)
- **Comprehension questions** — 2 multiple-choice questions parsed from LLM output after each story
- **Background prefetch** — Next story generates while you answer the current one
- **RTDB caching** — Generated stories save to a shared top-level `/stories` node in Firebase so all users benefit from cached content
- **Smart serving** — Transparently serves prefetched > RTDB cached > fresh AI-generated stories

### Smart Cloze
- LLM-assisted blank placement for the Sentences game, identifying conjugated word forms in CJK languages
- Two-phase: regex first (instant), LLM fallback (async) when regex finds no match

### Architecture
- **Direct HTTP** — Communicates with Ollama via `fetch()` + `ReadableStream` for NDJSON streaming, bypassing the Android bridge for speed
- **Android bridge fallback** — Falls back to native `@JavascriptInterface` bridge if direct HTTP fails
- **Model-agnostic** — Auto-detects whatever models are available via `/api/tags` (Gemma, Qwen, DeepSeek, Mistral, GLM, etc.)
- **Cloud model support** — ollama4android transparently proxies cloud models (e.g. `mistral-large-3:675b-cloud`, `glm-5.1:cloud`) through the same Ollama-compatible API
- **Request serialization** — All LLM calls are queued to avoid overwhelming single-threaded inference on mobile
- **IndexedDB caching** — LLM cloze responses are cached to avoid redundant generation

### Android App

An Android Studio WebView wrapper bypasses Chrome's HTTPS-only restriction for localhost, enabling communication with [Ollama4Android](https://github.com/kevinkicho/Ollama4Android) running on the same device.

- **Native bridge** — Kotlin `@JavascriptInterface` ↔ `evaluateJavascript()` bridge with promise-based async pattern
- **Streaming support** — Token-by-token streaming from Ollama via native HTTP, pushed to JS via `onToken` callbacks
- **Port discovery** — User enters the port shown in Ollama4Android; saved to localStorage for reconnection

---

## Key Features

- **14 languages supported** — Japanese, Korean, English, Chinese, Spanish, Portuguese, Italian, French, German, Russian (+ Furigana, Romaji, Pinyin, Transliteration visual columns)
- **Per-mode settings** — Each game mode has independent controls for language pairs, audio behavior, randomization, and example display
- **Context-aware audio** — `playSmartAudio()` detects visible content (word vs. example sentence) and plays the appropriate audio
- **Auto-play on correct** — Quiz, TF, Voice, and Sentences modes play audio on correct answer with configurable `audioWait`
- **Render pipeline** — Container hidden during updates, text fitted via binary search, then smooth 0.3s fade-in reveal
- **Dynamic text fitting** — `fitSmart()` derives max font size from `min(containerWidth, containerHeight)` and binary-searches both axes
- **Responsive match grid** — `calcLayout()` scores all valid col/row combinations by cell aspect ratio, area, and orientation preference
- **Analytics** — Per-word accuracy tracking, daily score history, weekly/monthly charts, most-missed-words dashboard
- **Themes** — 5 color themes (Classic, Sakura, Ocean, Coffee, Cyber) + dark mode + font family/style/weight controls
- **Celebrations** — 13 confetti effects (emoji-shaped particles via canvas-confetti) with per-effect enable/disable
- **Presets** — One-click "I know X, I want to learn Y" presets that configure all game modes at once
- **Offline PWA** — Service worker with stale-while-revalidate caching, flag icon prefetch, and per-asset error handling
- **Firebase backend** — Auth (anonymous + Google), Realtime Database for scores, vocab data, and shared AI-generated stories
- **Hanzi tooltips** — Long-press/hover CJK characters for dictionary lookup with traditional, simplified, pinyin, Korean, and English fields

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
| `public/js/llm.js` | `LLMService` — Direct HTTP streaming, Ollama connection, model auto-detect, cloze matching, bridge fallback |
| `public/js/android_bridge.js` | Promise-based JS wrapper for Android `@JavascriptInterface` with streaming `onToken` support |
| `public/js/game_core.js` | `GameMode` base class — nav, keyboard, scoring, `waitAndNav`, `autoPlay`, `handleInput`, DOM caching |
| `public/js/game_flashcard.js` | Flip card with 1–4 back panels, speed control, context-aware flip audio |
| `public/js/game_quiz.js` | 4-choice quiz, flippable question card, correct-answer audio, double-click mode |
| `public/js/game_tf.js` | True/False with random distractor swapping, correct-answer audio, visual feedback |
| `public/js/game_match.js` | Grid matching — adaptive `calcLayout()`, pair restore, hint highlighting |
| `public/js/game_sentences.js` | Cloze generator with variant/token/conjugation matching, LLM-assisted blanks, translation hint |
| `public/js/game_voice.js` | Web Speech recognition, locale mapping, correct-answer playback, visual feedback |
| `public/js/game_story.js` | AI Story Mode — word selection, streaming card UI, question parsing, RTDB cache, prefetch, TTS |
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
- **AI:** Ollama (local + cloud via ollama4android proxy), model-agnostic — Gemma, Qwen, DeepSeek, Mistral, GLM, etc.
- **Android:** Kotlin WebView wrapper with `@JavascriptInterface` native bridge, Gson
- **Audio:** Web Speech Synthesis API (TTS), Web Speech Recognition API (voice mode)
- **Animations:** canvas-confetti, CSS transitions
- **Charts:** Chart.js (stats dashboard)
- **Fonts:** Google Fonts — Nunito, Noto Sans JP, Noto Sans KR

---

## Firebase RTDB Structure

```
/dictionary     — Shared vocab entries (indexed on id, e, k, s, t)
/users/{uid}    — Per-user scores, prefs, analytics
/stories        — Shared AI-generated stories (indexed on lang, ts)
/vocab          — Vocab lists/collections
```

---

## Deployment

Deploy manually from the command line:

```bash
npm run build
firebase deploy --only hosting
```

---

## Related Projects

- **[Ollama4Android](https://github.com/kevinkicho/Ollama4Android)** — Android app that runs Ollama locally on-device (or proxies to cloud models), providing the LLM backend for VocabMaster's AI features.
