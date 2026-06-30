# VocabMaster

**VocabMaster** is a personal-use PWA language learning app built with Vanilla JavaScript, Tailwind CSS v3, and Firebase. It features eleven game modes (including AI-powered Story Mode, Grammar Gym, Chat Practice, Dictation, and Word Context), granular per-mode settings, context-aware audio, LLM integration via Ollama (single fixed model `gemma4:31b-cloud`), native Android TTS support, and a smooth render pipeline — all in a single-page app optimized for mobile.

---

## Screenshots

<div align="center">
<table>
  <tr>
    <td align="center"><img src="screenshots/01-home-screen.png" width="480" alt="Home Screen" /><br/>Home</td>
    <td align="center"><img src="screenshots/02-preset-source-korean.png" width="200" alt="Settings Preset" /><br/>Settings Preset</td>
  </tr>
</table>
</div>

---

## Current Status

- **11 game modes**: Flashcards, True/False, Quiz, Matching, Sentences (offline cloze), Voice Challenge, Dictation, Story Mode, Grammar Gym, Chat Practice, Word Context.
- **AI pipeline simplified**: Single fixed model `gemma4:31b-cloud` — no model detection, no dropdown, no fallback chain. If the model is unavailable, `generate()` throws a clear error message.
- **Chat Practice**: Language-agnostic prompts — AI always responds in the target language regardless of what language the user writes in. Long-press trash button to clear chat history. Transcript now stores formatted HTML for proper bubble rendering on reload.
- **Sentences (offline)**: Uses regex-based cloze from existing vocab example sentences. No AI dependency — works fully offline.
- **Dictation**: TTS plays example sentence, user types what they heard. Word-by-word accuracy comparison, "Show Answer" reveals partial correct words with incorrect parts masked.
- **Word Context**: Gamified cloze quiz — AI generates 3 sentences at increasing difficulty (beginner → intermediate → advanced), target word blanked out, 4 multiple-choice options. Scores 5/10/15 points per level.
- **RTDB is sole data source**: All mock data removed. 6035+ vocab items loaded from Firebase Realtime Database.
- **LLM pipeline**: 7 modular files under `public/js/llm/` — service, validator, schemas, prompts, roles, cache, init. Concurrent queue (max 2), critic validation, compact prompts.
- **explainLang feature**: All 11 AI prompt builders accept a `knownLang` parameter — explanations, scenarios, translations, and feedback are no longer hardcoded to English.
- **Grammar Gym pregeneration**: `scripts/pregenerate-grammar.js` bulk-generates exercises via Ollama, saves to RTDB with error-feedback retry.
- **Android TTS**: Cross-engine voice detection via per-engine `TextToSpeech` enumeration (`buildEngineVoiceMap()`). Voice objects include `displayName` with locale name + quality badge.
- **APK asset sync**: `android/app/src/main/assets/` is a separate copy of `public/`. Use `scripts/sync-assets.sh` to sync before APK builds.

---

## Game Modes

### Reading
| Mode | Description | AI? |
|------|-------------|-----|
| **Flashcards** | Flip cards with configurable front/back languages (up to 4 back fields). Auto-play audio on flip. | No |
| **True / False** | Decide if a word matches its translation. Flippable example sentences with audio. | No |
| **Quiz** | Multiple-choice with 4 answer buttons. Flippable question card reveals example sentences. | No |
| **Matching** | Grid-based pair matching with responsive tiling. Adaptive layout scoring for portrait/landscape. | No |

### Context
| Mode | Description | AI? |
|------|-------------|-----|
| **Sentences** | Fill-in-the-blank cloze using existing example sentences from vocab data. Regex-based masking handles conjugations. 70:30 grid layout — question text top, translation bottom with fixed divider. | No |

### Speaking
| Mode | Description | AI? |
|------|-------------|-----|
| **Voice Challenge** | Speech recognition challenges via Web Speech API. Pronunciation matching with fuzzy comparison. | No |
| **Dictation** | TTS plays example sentence → user types what they heard → word-by-word accuracy comparison. "Show Answer" reveals correct words, masks incorrect parts. | No |

### AI-Powered
| Mode | Description | AI? |
|------|-------------|-----|
| **Story Mode** | AI generates a short story using 4 vocab words. 2 comprehension questions with translation fields. RTDB caching. | Yes |
| **Grammar Gym** | AI-generated grammar exercises targeting specific patterns. Two-tap answer (TTS → submit). RTDB caching with explainLang. | Yes |
| **Chat Practice** | AI conversation partner. Rolling message history, memory summaries, speech-to-text input, scenario-aware greetings. Always responds in target language. | Yes |
| **Word Context** | Gamified cloze quiz — AI generates 3 sentences at increasing difficulty, target word blanked out, 4 multiple-choice options. Scores 5/10/15 pts. | Yes |

---

## AI / LLM Integration

VocabMaster integrates with [Ollama](https://ollama.com) for AI-powered features, routing through a Cloud Run proxy for the web app or directly to local `ollama4android` for the APK.

### Single Fixed Model

The app uses `gemma4:31b-cloud` as the fixed model. No model detection, no dropdown, no fallback chain. If the endpoint is unreachable, `generate()` throws a clear error: `"AI is offline — check your Ollama server or cloud proxy connection"`.

### Chat Practice
- AI conversation partner that maintains a rolling message history (max 6 turns) + memory summaries
- **Language-agnostic prompts** — AI always responds in the target language regardless of what language the user writes in. Uses human-readable language names (e.g. "Portuguese") instead of codes.
- **Clear chat** — Long-press trash button (600ms) to clear all messages, memories, and transcript from localStorage and RTDB
- **Rolling window** — Raw messages pruned after 12; old exchanges condensed into `memories[]` summaries
- **Speech-to-text input** — Mic button uses `webkitSpeechRecognition` with locale mapping per target language
- **Exam-level awareness** — Clickable level badge in header controls AI output difficulty

### Word Context (Gamified Cloze)
- AI generates 3 sentences using a vocab word at increasing difficulty (beginner → intermediate → advanced)
- **AI-marked blanks** — LLM returns sentences with `{{BLANK}}` markers, app replaces with styled placeholder (handles conjugations that regex can't)
- **70:30 layout** — Question text fills top 70%, translation fills bottom 30%, fixed divider between them
- 4 multiple-choice options with `fitSmart` text auto-sizing for CJK compatibility
- **Scoring**: Beginner +5, Intermediate +10, Advanced +15
- TTS skips the blank word (replaced with `...` for pause)
- **Vocab card** — Click to reveal vocab + translation for 5 seconds (helps before answering)
- **Long-press question** — Shows translation on demand
- **Dark mode compatible** — Correct/wrong border effects use Grammar Gym's emerald/rose pattern

### Story Mode
- Selects 4 random vocab words, prompts the LLM to generate a short story in the target language
- **Comprehension questions** — 2 multiple-choice questions with translation fields
- **TTS read-aloud** — Speaker button reads the story via TTS
- **RTDB caching** — Generated stories save to `stories/{compositeVocabId}/{lang}`
- **Stale generation guard** — `_generationId` prevents old async results from overwriting new ones

### Grammar Gym
- AI-generated exercises targeting specific grammar patterns for the current vocab word
- **RTDB caching** — Exercises saved to `grammar_exercises/{vocabId}/{langCode}/{explainLang}/{token}`
- **Two-tap answer** — First tap plays TTS, second tap submits
- **Progressive choices** — Schema accepts 2-4 choices (A/B/C/D)

### Architecture
- **7 modular LLM files** under `public/js/llm/` — service, validator, schemas, prompts, roles, cache, init
- **Concurrent queue** — Max 2 parallel requests, queue cap at 50
- **Critic validation** — Compact critic prompt (~500 tokens), skipped for simple schemas
- **HTTP transport** — Capacitor HttpProxy with native `fetch()` fallback; manual `AbortController` for timeout
- **Explanation language (`explainLang`)** — All 11 prompt builders accept a `knownLang` parameter derived from the user's preset source language.

### Deployment: Cloud Proxy (Web AI Parity)

**This is active production code, not dead code.** The web app uses a Cloud Run proxy to reach Ollama cloud models. The Android APK uses a local `ollama4android` server. Both paths are essential and maintained.

- `public/js/ollama_config.js` (gitignored) sets `window.OLLAMA_USE_CLOUD = true` for web
- APK assets overwrite to `OLLAMA_USE_CLOUD = false`
- Default proxy URL: `https://ollama-proxy-1020976660084.us-central1.run.app`
- Model: `gemma4:31b-cloud`

---

## Key Features

- **10 languages supported** — Japanese, Korean, English, Chinese, Spanish, Portuguese, Italian, French, German, Russian (+ Furigana, Romaji, Pinyin, Transliteration visual columns)
- **Per-mode settings** — Each game mode has independent controls for language pairs, audio behavior, randomization, and example display
- **Native Android TTS** — Dedicated Android WebView wrapper with `TTSBridge` providing 393+ system voices via native `TextToSpeech` API
- **Voice selection** — Per-language TTS voice picker in Settings, with instant preview playback
- **Context-aware audio** — `playSmartAudio()` detects visible content (word vs. example sentence) and plays the appropriate audio
- **Render pipeline** — Container hidden during updates, text fitted via binary search, then smooth 0.3s fade-in reveal
- **Dynamic text fitting** — `fitSmart()` derives max font size from `min(containerWidth, containerHeight)` and binary-searches both axes
- **Analytics** — Per-word accuracy tracking, daily score history, weekly/monthly charts, most-missed-words dashboard
- **Themes** — 5 color themes (Classic, Sakura, Ocean, Coffee, Cyber) + dark mode + font family/style/weight controls
- **Celebrations** — 13 confetti effects with per-effect enable/disable
- **Presets** — One-click "I know X, I want to learn Y" presets that configure all game modes at once
- **Offline PWA** — Service worker with stale-while-revalidate caching
- **Firebase backend** — Auth (anonymous + Google), Realtime Database for scores, vocab data, and shared AI-generated content
- **AI Status Indicator** — Home screen shows green/amber/rose dot + "AI Online (cloud/local · gemma4:31b-cloud)"

---

## File Structure

| File | Purpose |
| :--- | :--- |
| `public/index.html` | Single-page shell — settings modal, theme grid, game containers, script loading |
| `public/js/main.js` | App controller — init, auth listener, routing, home dashboard |
| `public/js/config.js` | `LANG_CONFIG` array, `LANG_MAP` (O(1) lookups), `GET_DEFAULTS()` |
| `public/js/store.js` | `saveSettings()`, `applyTheme()`, localStorage persistence |
| `public/js/ui.js` | Dynamic UI — `header()`, `audioBar()`, `loadSettings()`, theme/font/preset renderers |
| `public/js/ui_home.js` | Home screen filters — level filter chips, tag filter chips |
| `public/js/ui_llm.js` | LLM settings UI, AI status rendering, voice selector |
| `public/js/services.js` | `AudioService` (TTS), `TextFitter`, `CelebrationService` (confetti) |
| `public/js/game_core.js` | `GameMode` base class — nav, keyboard, scoring, `waitAndNav`, `autoPlay` |
| `public/js/game_flashcard.js` | Flip cards with configurable front/back languages |
| `public/js/game_quiz.js` | Multiple-choice with 4 answer buttons |
| `public/js/game_tf.js` | True / False — decide if a word matches its translation |
| `public/js/game_match.js` | Grid-based pair matching with responsive tiling |
| `public/js/game_sentences.js` | Offline cloze — regex-based fill-in-the-blank from example sentences |
| `public/js/game_voice.js` | Speech recognition challenges via Web Speech API |
| `public/js/game_dictation.js` | Dictation — TTS plays sentence, user types, word-by-word accuracy |
| `public/js/game_story.js` | Story mode entry — picks words, orchestrates cache/generation flow |
| `public/js/game_story_generator.js` | Story generation via LLM — caching, prefetching, coordination |
| `public/js/game_story_cache.js` | RTDB story cache with prefetch and background generation |
| `public/js/game_story_ui.js` | Story mode UI — story display, Q&A, level badges |
| `public/js/game_grammar.js` | Grammar Gym — AI-generated grammar exercises, two-tap answer |
| `public/js/game_chat.js` | Chat Practice — AI conversation, rolling memory, STT, TTS, markdown |
| `public/js/game_context.js` | Word Context — gamified cloze quiz with AI-generated sentences at 3 difficulty levels |
| `public/js/llm/llm_service.js` | Core LLM service — queue, transport, generate, ping |
| `public/js/llm/llm_validator.js` | Schema validation, JSON extraction, critic pipeline |
| `public/js/llm/llm_schemas.js` | JSON Schema definitions for all response types |
| `public/js/llm/llm_prompts.js` | All 11 prompt builder functions (support `knownLang`) |
| `public/js/llm/llm_roles.js` | Feature methods — findClozeMatch, generateStory, getGrammarExercise, etc. |
| `public/js/llm/llm_cache.js` | IndexedDB + in-memory cache for cloze matches |
| `public/js/presets.js` | Preset system — applies "I know X, I want to learn Y" |
| `public/js/preferences_registry.js` | Centralized preference schema with DOM bindings |
| `public/js/data.js` | Firebase RTDB read/write, vocab list loading |
| `public/js/auth.js` | Firebase Auth — anonymous + Google sign-in |
| `public/js/analytics.js` | Accuracy tracking, sessions, daily/weekly statistics |
| `scripts/pregenerate-grammar.js` | Bulk Grammar Gym generator — Ollama, RTDB write, error-feedback retry |
| `scripts/sync-assets.sh` | Syncs `public/` → `android/app/src/main/assets/` |
| `android/.../TTSBridge.kt` | Native TTS bridge — per-engine voice enumeration |
| `android/.../MainActivity.kt` | WebView setup, JS interface injection |
| `functions/src/index.ts` | Cloud Run proxy for Ollama Cloud API |
| `database.rules.json` | RTDB security rules — grammar_exercises has `$explainLang` path level |

---

## Architecture Docs

- `docs/architecture.md` — Full AI pipeline, flow diagrams, schema reference
- `docs/audio-tts-architecture.md` — TTS provider detection, per-engine enumeration
- `docs/development.md` — Pre-generation script reference, CI/CD, build notes
- `docs/medium-term-roadmap.md` — Future feature planning
- `AGENTS.md` — Critical rules: cross-script scope, auth states, native TTS, explainLang, APK asset sync
