# Session Summary — June 2026

## What Was Done

### Native Android TTS
- Built Android WebView wrapper (`android/`) with `TTSBridge.kt` using Android's `TextToSpeech` API
- Exposes 393+ system voices (Google, Samsung, Local) via `@JavascriptInterface`
- `native_tts.js` bridge provides promise-based `getVoices()`, `speak()`, `previewVoice()`, `stop()`
- `AudioService` auto-detects native bridge and uses it instead of Web Speech API
- Voice selection UI with per-language dropdowns, provider grouping, and preview playback
- Voice preview plays sample words in selected voice on dropdown change
- DevTools verification: 393 voices loaded on Galaxy S22 vs Chrome's 4

### UI Improvements
- Collection bar chips removed from all 5 game activities (flashcards, quiz, TF, matching, sentences)
- Settings changes apply immediately to current game without restart
- Level filter shows note: "TOPIK & CEFR levels are approximated from JLPT proficiency"
- Voice selection accordion added to Settings modal with Android-specific guidance

### Console & Debugging
- All `console.log`/`console.warn` gated behind `?debug=1` URL flag
- `L()` helper function added to `escape.js` for conditional logging
- Console silenced across 14 JS files

### Error Fixes
- SW CSV cache failure: removed missing `master112625.csv` from cache list
- Firebase index warning: deployed `database.rules.json` with `.indexOn` for `/dictionary`
- Service worker cache bumped to v1150

### CI/CD
- GitHub Actions workflow (`build.yml`) builds web app and Android APK on push
- Web: `npm install` → Tailwind CSS
- Android: Java 21 + Android SDK → `gradlew assembleDebug`

### Vocabulary Enrichment
- Firebase RTDB data exported and analyzed (6,038 entries, 10 languages each)
- 726 duplicate Japanese words found, 899 extra copies — kept for redundant learning
- Pinyin corrected for all 6,038 Chinese entries using `pypinyin`
- JLPT N5-N1 word list extracted from `@polyglot-bundles/ja-jlpt-syllabi` (10,169 words)
- HSK 1-6 word list fetched (4,993 words)
- JMdict common frequency list (18,029 words)
- 13,833 total entries, all 100% framework-tagged

### Framework Tagging
- JLPT: N5(565), N4(1,286), N3(1,641), N2(3,145), N1(4,420)
- HSK: 1-6 tagged based on Chinese translation field matches
- CEFR: A1-C1 approximated from JLPT mapping
- TOPIK: 1-5 approximated from JLPT mapping
- JMdict: common(1,613), uncommon(206), rare(957)

### Documentation
- `docs/architecture.md`: System diagram, design patterns, data flow, audio pipeline
- `docs/development.md`: Project structure, commands, how to add game modes/languages
- `docs/vocabulary.md`: Enrichment plan, coverage stats, schema, tagging rules

## Files Changed (56+ new, many modified)
See git log for full diff.

## Remaining Work
- HSK 1-6 vocabulary enrichment (3,389 words)
- Android wrapper deploy (needs local server setup)

## Key Decisions
- TOPIK & CEFR tagged as JLPT approximations with UI note
- Duplicate Japanese words kept for redundant learning
- Example sentences generated per JLPT level (N5→N1 increasing complexity)
- Pinyin uses tone marks (not numbers) for cleaner display
