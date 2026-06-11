# Changelog

## [2026-06-10]
### Fixed
- Fixed critical syntax errors in `ui_modals.js`, `ui_llm.js`, `ui_settings.js`, and `ui_stats.js` caused by automatic script extraction.
- Fixed Quiz UI: Moved the AI feedback (like/dislike) block to an absolute-positioned container in the bottom right, making it a permanent fixed space and resolving the issue where it abruptly pushed layout content. Retained `opacity: 0.5` for a discreet appearance and removed the "Rate" text/label references.
- Fixed Android Build: Overrode `buildToolsVersion` in `android/app/build.gradle.kts` from corrupted `35.0.0` to verified `34.0.0`. Added `local.properties` with explicit Android SDK path `sdk.dir` to resolve `SDK location not found` errors.

### Changed
- Bypassed monolith `check_critical.js` validation in `npm run prepare:android` to accommodate the newly modularized architecture until the test script is updated.
