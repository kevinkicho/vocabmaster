# VocabMaster Architecture & Findings

## 1. Modularization Strategy
To improve maintainability and resolve the "chasing the carrot" syntax issues with massive files:
- `llm.js` was broken down into `llm_cache.js`, `llm_features.js`, `llm_response_validator.js`, etc.
- **Dependency Order**: Because many modules extend `LLMService.prototype` directly, `llm.js` MUST be loaded before all its extensions. `llm_response_validator.js` MUST be loaded before `llm_validator_schemas.js` and `llm_validator_prompts.js` because they attach static fields to the `LLMResponseValidator` class.

## 2. ESM Transition (Phase 2)
Currently, all scripts are injected via `<script>` tags in `index.html`. 
- **The Challenge**: Any misplaced script order results in `ReferenceError: X is not defined`, breaking the entire application silently.
- **The Solution**: In Phase 2, we will migrate to Vite and true ES Modules (`import`/`export`), entirely eliminating global scope dependence and order issues.

## 3. Local AI Integration (Ollama4Android)
- `LLMService` defaults to `http://127.0.0.1:11434` when Native/Capacitor environment is detected.
- This allows 100% free, private local LLM generation for features like Flashcards context, Story generation, and Quiz questions.
- A Learning Loop (`learning_loop.js`) pushes session outcomes and ratings to Firebase RTDB under `users/{uid}/learning_loop_sessions`.

## 4. E2E Sanity Testing
- We instituted Playwright tests running on `pre-commit` to prevent pushing code with unhandled console errors or `ReferenceError` crashes.
- Android builds (`npm run build:android`) will automatically validate these tests before compiling.
