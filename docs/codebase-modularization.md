# Codebase Modularization (June 2026 Refactor)

## The `<500 Lines` Principle

To ensure the VocabMaster codebase remains maintainable, scalable, and friendly to AI-assisted development, the project strictly adheres to a **<500 lines of code per file** principle.

Previously, the codebase suffered from the "God Object" anti-pattern where files like `ui.js` (~1700 lines), `vocabulary-collections.js` (~1500 lines), and `llm_response_validator.js` (~1110 lines) became unmanageable monoliths.

## Modularization Strategy: Prototype Mixins

VocabMaster is built using Vanilla ES6 Classes without a modern bundler (Webpack/Vite), meaning that global scope and `<script>` load order are critical. To split classes across multiple files without breaking existing `app.ui.method()` references, we use the `Object.assign(Class.prototype, { ... })` mixin pattern.

### 1. UI Subsystems (`ui_*.js`)
The `UIManager` (`ui.js`) was split into targeted sub-managers. Instead of prototype mixins, `ui.js` now acts as a central hub that instantiates sub-classes, but some methods are merged using mixins.
- `ui.js`: Core initialization and hub.
- `ui_settings.js`: Manages the massive settings DOM and tabs.
- `ui_stats.js`: Handles chart.js integrations, heatmaps, and stats rendering.
- `ui_modals.js`: Manages dictionary lookups and profile popups.
- `ui_llm.js`: Specific settings for LLM proxy endpoints and local models.

### 2. Game Story Mode (`game_story_*.js`)
The `Story` class was broken down using prototype mixins:
- `game_story.js`: Core class constructor and navigation.
- `game_story_ui.js`: DOM manipulation, streaming text updates, and highlighting.
- `game_story_generator.js`: The logic for sending prompts to the LLM and receiving questions.
- `game_story_cache.js`: Firebase RTDB integration for pre-fetching cached stories.

### 3. LLM Service & Validators (`llm_*.js`)
The massive AI logic was decomposed into:
- `llm/llm_service.js`: Core network and model selection.
- `llm_features.js`: Cloze, grammar, and listening mode helpers.
- `llm_cache.js`: IndexedDB caching logic.
- `llm_response_validator.js`: The central validation engine.
- `llm_validator_schemas.js`: JSON schemas for AI critic evaluation.
- `llm_validator_prompts.js`: The string templates for prompt generation.

### 4. Vocabulary Collections (`data/vocab_*.js`)
Hardcoded dictionary lists were extracted from `vocabulary-collections.js` and separated by language (e.g., `vocab_ja.js`, `vocab_fr.js`). They push to `window.VOCAB_DATA_COLLECTIONS` which is then consumed by the central `vocabulary-collections.js` manager.

## Enforcing the Principle
When adding new features or game modes, developers and agents must:
1. Ensure the new logic is housed in a separate file if it exceeds ~300-500 lines.
2. Update `public/index.html` to `<script src="...">` the new file.
3. Ensure base classes load **before** their mixins or sub-modules in `index.html`.
4. Run `npm run validate` to ensure syntax is valid and load order is correct.
