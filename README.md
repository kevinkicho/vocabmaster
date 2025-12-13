# VocabMaster

**VocabMaster** is a comprehensive, web-based language learning application designed to help users master vocabulary through various interactive game modes. It supports multiple languages (including Japanese, Korean, Chinese, and European languages) and features a spaced-repetition style learning environment. The app includes customizable settings for audio, visual themes, and input methods, catering to different learning styles.

---

## File Structure & Descriptions

| File Name | Description |
| :--- | :--- |
| **`public/index.html`** | The main entry point containing the app's HTML structure, including modals for settings, profile, and the dynamic game view container. |
| **`public/style.css`** | Contains custom CSS styles and Tailwind CSS configuration for the application's visual design and animations. |
| **`public/js/main.js`** | The central controller that initializes the app, manages the main menu, and handles navigation between the home screen and game modes. |
| **`public/js/config.js`** | Defines supported languages (`LANG_CONFIG`), default application settings (`GET_DEFAULTS`), and game-specific configurations. |
| **`public/js/store.js`** | Manages the application's state, persisting user preferences, themes, and game progress to `localStorage`. |
| **`public/js/ui.js`** | Handles all User Interface logic, including rendering headers, populating settings menus dynamically, and managing modals. |
| **`public/js/game_core.js`** | The base class (`GameMode`) for all games, providing shared logic for navigation, audio playback, input handling, and scoring. |
| **`public/js/games.js`** | Contains the specific logic and rendering methods for each game mode: Flashcards, Quiz, True/False, Matching, Voice, and Sentences. |
| **`public/js/data.js`** | Manages data fetching, parsing the vocabulary list (likely from JSON/CSV), and providing data subsets to games. |
| **`public/js/services.js`** | Handles auxiliary services such as Text-to-Speech (Audio) management and visual effects (Confetti). |
| **`public/sw.js`** | The Service Worker file that enables offline functionality and caches core assets for faster loading. |

---

## Key Functions & Responsibilities

### `public/js/main.js`
* **`App.init()`**: Initializes the application, loads data, and sets up event listeners.
* **`App.goHome()`**: Renders the main dashboard with statistics and game mode buttons.
* **`App.launchGameMode(mode)`**: Instantiates and starts a specific game mode (e.g., `new Quiz('quiz')`).

### `public/js/config.js`
* **`GET_DEFAULTS()`**: Returns an object containing the default values for all system settings (e.g., `globalClickMode`, `quizPlayEx`).

### `public/js/store.js`
* **`Store.saveSettings()`**: Reads values from UI inputs (checkboxes, radios) and saves them to `localStorage`.
* **`Store.loadSettings()`**: Retrieves settings from storage to populate the UI.
* **`Store.setLoc(mode, index)`**: Saves the user's current progress (index) for a specific game mode.

### `public/js/ui.js`
* **`UIManager.loadSettings()`**: Populates the settings modal inputs with values from the Store.
* **`UIManager.renderSettingsUI()`**: Dynamically injects HTML for settings options (like language dropdowns) based on `LANG_CONFIG`.
* **`UIManager.header(curr, total, score)`**: Generates the standard top navigation bar used in all games.
* **`UIManager.openEditModal()`**: Opens the admin interface to edit vocabulary data.

### `public/js/game_core.js`
* **`GameMode.nav(direction)`**: Handles navigation to the next or previous card, including randomization logic.
* **`GameMode.playSmartAudio(langKey)`**: intelligently plays audio, masking specific words in example sentences if necessary.
* **`GameMode.handleInput(el, text, lang, onConfirm)`**: Manages user interaction, distinguishing between "Single Click" (instant submit) and "Double Click" (select then confirm).

### `public/js/games.js`
* **`Flashcard.render()`**: Displays the front and back of a card with 3D flip animations.
* **`Quiz.render()`**: Displays a question and multiple-choice answers, handling distractions.
* **`TF.render()`**: Generates a "True/False" scenario by checking if a random definition matches the displayed word.
* **`Sentences.render()`**: Generates a fill-in-the-blank question by masking the target word within an example sentence.
* **`Sentences.runCustomAutoPlay()`**: Handles the specific audio logic for Sentences, playing the sentence with a pause where the blank is.

---

## Critical App Components

### 1. Game Modes
* **Flashcards**: Standard study tool with customizable front/back faces and flip speed.
* **Quiz**: Multiple-choice testing with configurable question/answer languages.
* **True / False**: Rapid-fire verification of word pairs.
* **Matching**: A grid-based game to pair words (e.g., Kanji to English).
* **Voice**: Speech recognition game requiring users to pronounce words correctly.
* **Sentences**: Context-based learning where users fill in missing words in example sentences.

### 2. Audio Engine
* **Smart Masking**: The app can "read" a sentence but silence specific target words (replacing them with natural pauses) to prevent giving away answers during audio-only study.
* **Auto-Play**: Configurable per game mode. Can trigger on card load, on answer selection, or on correct answers.

### 3. Input Modes
* **Single Click**: Selection immediately submits the answer (faster).
* **Double Click**: First click selects/plays audio; second click submits (prevents mistakes).
* **Global Setting**: Users can toggle this preference globally across all supported game modes.

### 4. Data Management
* **Vocabulary Data**: Structured JSON/Object data containing multiple fields per entry (e.g., `ja`, `ja_furi`, `en`, `en_ex`).
* **Separators**: Supports multiple spellings/variations using separators like `·` (middle dot), ensuring matching logic works even if only one variant is present in a sentence.

### 5. Customization
* **Theme Engine**: Supports Dark/Light modes and distinct color themes (Classic, Sakura, Ocean, etc.).
* **Language Config**: Highly extensible `LANG_CONFIG` allows adding new languages or fields (like Pinyin or Romaji) by simply updating the configuration array.
