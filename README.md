# VocabMaster

**VocabMaster** is a modular, PWA-ready language learning application built with Vanilla JavaScript, Tailwind CSS, and Firebase. It features multiple game modes, context-aware audio, and a robust settings system.

---

## File Structure & Functions

| File Name | Key Functions | Description |
| :--- | :--- | :--- |
| **`public/index.html`** | N/A | Main entry point containing the HTML skeleton, Tailwind config, settings modals, and script loaders. |
| **`public/js/main.js`** | `App.init()`, `App.goHome()` | The central controller that initializes services, handles routing, and renders the home dashboard. |
| **`public/js/store.js`** | `saveSettings()`, `applyTheme()` | Manages `localStorage` persistence for user preferences, game states, and dark mode toggling. |
| **`public/js/ui.js`** | `header()`, `loadSettings()` | Generates dynamic UI components (headers, audio bars) and binds logic to the HTML settings menu. |
| **`public/js/game_core.js`** | `nav()`, `autoPlay()` | The base class providing shared logic for navigation, keyboard inputs, and audio handling. |
| **`public/js/game_flashcard.js`** | `update()`, `playSmartAudio()` | Implements flip-card logic with context-aware audio (plays word on front, example on back). |
| **`public/js/game_quiz.js`** | `check()`, `update()` | Manages multiple-choice logic and a multi-state question box (Front → Back 1 → Back 2). |
| **`public/js/game_tf.js`** | `check()`, `update()` | Implements True/False logic with specific visual feedback (green/red highlights) and audio context. |
| **`public/js/game_match.js`** | `tap()`, `restorePrev()` | Grid matching game that saves progress state or resets the level on back navigation. |
| **`public/js/game_sentences.js`** | `update()`, `runCustomAutoPlay()` | Implements fill-in-the-blank logic with smart masking for parentheses and multi-word phrases. |
| **`public/js/game_voice.js`** | `listen()`, `runCustomAutoPlay()` | Integrates Web Speech API for pronunciation challenges and auto-plays prompt audio. |
| **`public/js/data.js`** | `load()`, `getStats()` | Fetches and parses vocabulary datasets and user statistics from Firebase Realtime Database. |
| **`public/js/auth.js`** | `initAuth()`, `logout()` | Handles Firebase user authentication, anonymous sign-ins, and session management. |
| **`public/js/services.js`** | `play()`, `fitAll()` | Helper classes for Text-to-Speech generation and dynamic text resizing (TextFitter). |

---

## Technical Details

### 1. Modular Architecture
* **Split Logic**: The monolithic `games.js` was refactored into six separate files (`game_*.js`) to isolate game logic, reduce code bloat, and improve maintainability.
* **HTML Loading**: `index.html` explicitly loads these modules in order to ensure classes are available before `main.js` initializes the App.

### 2. Context-Aware Audio
* **Smart Detection**: Functions like `playSmartAudio` inspect the DOM to see what text is currently visible (e.g., Front Word vs. Back Example).
* **Targeted Playback**: If the card is flipped to show an example sentence, the audio engine switches to play that specific sentence rather than the original word.

### 3. Sentence Masking Engine
* **Parentheses Logic**: Automatically detects text inside `( )` and converts it into interactive blanks.
* **Phrase Matching**: Can split multi-word vocabulary (e.g., "back of hand") and mask scattered occurrences across a sentence.
* **Audio Pausing**: When auto-playing sentences, the masked portions are replaced with silence/pauses (`...` or `、`) to avoid revealing the answer.

### 4. State Persistence & Restoration
* **Matching Game**: Automatically saves the state of the grid. If a user navigates away and returns, the game resumes.
* **Fresh Start**: Pressing the "Back" button (restore previous) explicitly forces a fresh shuffle and restart of the previous level configuration.

### 5. Visual & Font Optimization
* **CJK Support**: The CSS font stack prioritizes `Noto Sans JP/KR/SC` to ensure Asian characters render with correct weights (using `font-black` for maximum legibility).
* **Feedback Loops**: Quiz and True/False modes utilize specific CSS classes (`ring-emerald-400`, `bg-rose-500`) to provide immediate visual feedback on answer selection.
