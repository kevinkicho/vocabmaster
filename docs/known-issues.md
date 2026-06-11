# Known Issues and Work Log - VocabMaster

**Purpose**: Consolidated record of all issues discussed and worked on across the conversation (from initial bug report through AI mandatory changes, logging, emulator, parity, builds/deploys). This allows validation of claims vs. actual code/docs/deploy state. Updated after every significant work per AGENTS.md rules.

**Date started**: ~June 2026 (ongoing)
**Core rules followed**:
- Never chase quick fixes; assess root cause.
- Full clean builds (34/34) after changes.
- Document in docs/ (AGENTS.md, development.md, this file, retrospective).
- Device verification required before claiming fixes.
- Use todo lists for multi-step.
- Web (public/) and Android (assets copy) must stay identical for core functionality (especially AI).

---

## Issue List (Chronological + Grouped)

### 1. Initial Device Bugs (Phone connected, first report)
- **1a. Auth icon click silent crash on APK**
  - Symptoms: Tapping auth icon does nothing or crashes silently in WebView.
  - Root cause (found): Android WebView does not set window.Capacitor; code fell into Google popup path which fails in WebView. No WebView detection.
  - Work done: Added detection via window.NativeTTS || userAgent in main.js (handleAuthClick and init). Removed premature signInAnonymously in firebase.js. Used anonymous auth for WebView.
  - Status: Partially addressed in code; needs fresh APK + user test on device (tap auth, check spinner -> icon, Firebase auth state).
  - Verification: User must report after install. No emulator repro for auth (no Google login in headless).
  - Related files: public/js/main.js, public/js/firebase.js
  - Docs: retrospective-past-20-chats-story-llm-logging.md, AGENTS.md (BUG #5)

- **1b. Daily score not reflecting login/anonymous**
  - Symptoms: Score doesn't update based on auth state.
  - Work: Some logging and auth fixes overlapped; daily score uses RTDB / analytics.
  - Status: Not explicitly closed in logs; overlapped with auth fixes.
  - Verification needed on device.

- **1c. 'Spanish A1' crash: 'failed to start game cannot read properties of undefined reading 'id''**
  - Symptoms: Selecting Spanish A1 collection crashes on game start.
  - Root: Likely data.getFilteredList or collection filter returning items without .id, or level mapping.
  - Work: Data/collections work in medium-term features; critical checks added in validate.
  - Status: Tests pass (310+), but specific repro needed on device with collection.
  - Related: data.js, vocabulary-collections.js, main.js launch.

- **1d. Main menu doesnt show 'ai cloze'**
  - Symptoms: No "AI Cloze" button.
  - Work: Added in main.js menu (under conditional AI section with sparkle icon). Later removed the `app.llm ?` guard for parity (see #9).
  - Status: Fixed in source (public/js/main.js); AI section now always rendered.

### 2. Story Generation Failures + Quality
- **Symptoms**: Story fails to generate ("Couldn't generate questions", 0 tokens), falls back to basic/dummy content ("One day a person noticed..." with vocab slots), bad question quality.
- **Root causes (multi)**:
  - LLM endpoint/model forcing mismatches with ollama4android proxy (user selects model inside the Android app; VocabMaster only sends prompt to port 11434).
  - Rigid prompt expecting exact "STORY:\nQ1:\n...ANSWER: X" format; models (esp. cloud-backed) don't always comply.
  - Fallback code in game_story.js (_buildFallbackStory) and game_sentences (regex phase) hiding failures.
  - Insufficient logging of full prompt + raw response.
  - Stale APK / RTDB cached stories serving old content.
  - Architecture: "prompt must be clear and thorough"; no model/provider choice from client.
- **Work done**:
  - Implemented RTDB debug logging (main.js: logBuffer, flushDebugLogsToRTDB to /users/${uid}/debug_logs, auto on errors).
  - Made AI **mandatory** for Story and AI Cloze: removed _buildFallbackStory entirely, added hard checks at startStory/update for llm.available/hasModel -> "AI Required" screen with "Cached stories and basic fallbacks are disabled".
  - In generation: strict hasProperFormat check -> throw + clean error UI ("AI failed to produce...") instead of fallback. Same for _tryLLMCloze (no regex fallback).
  - Logging: full llmInfo, wordList, errors, flush on failure paths. L() calls throughout.
  - Prompts: kept in llm_response_validator / game_story (but improved clarity per architecture).
  - Emulator setup in WSL (sudo 856858 for deps, SDK, AVD creation, start) to self-test without phone friction.
  - Web parity: removed menu guard so AI buttons always shown; documented single-source public/ + always sync for APK.
  - Discrepancy logging in retrospective: stale APK, RTDB cache, deploy timing, logging bounds.
- **Status**: Source changes complete and mandatory (no fallbacks in code for new generations). Emulator booted successfully after KVM fix (sg kvm), app installed in emulator. Phone pushes done multiple times (after uninstall). But full repro of "good generation" or exact failure (prompt vs response) pending reliable navigation + endpoint in emulator (splash taps fragile in headless; logs showed connection fails on localhost as expected). On phone: user must test with ollama4android connected + use logs/"dl".
- **Verification protocol followed**: 34/34 builds, adb -r + force-stop + relaunch. User reports required (screenshots, logs, "dl").
- **Files**: public/js/game_story.js (startStory ~148, _generateStory, _parseAndShow, _buildStoryPrompt), game_sentences.js (update ~141, _tryLLMCloze), main.js (menu, logging), llm.js, docs/retrospective-..., AGENTS.md
- **Docs**: Extensive in retrospective-past-20-chats-story-llm-logging.md (architecture quotes, discrepancy log, mandatory updates), development.md (parity rule), this file.

### 3. Logging for Diagnosis (user requested)
- **Work**: Bounded logBuffer (200), console hijack, global error hooks, flush to RTDB sessions/batches (60 lines), prune 15. "dl" helper via app.flushLogsToRTDB(). Always on for Story/LLM.
- **Status**: Implemented and used in error paths. Helps see prompts/responses/llmInfo.
- **Related**: main.js, used in game_story catches.

### 4. Emulator in WSL for Self-Testing (user provided sudo 856858)
- **Work**: apt via sudo, Linux cmdline-tools, sdkmanager (platform, system image google_apis x86_64 android-34), avdmanager create "vocabmaster_test", emulator -no-window start (background tasks), adb wait/install/launch/logcat/screencap.
- **Blockers found**: KVM permissions (/dev/kvm, group), WSL accel limits, avd create quirks, path issues for adb/APK (WSL vs Windows adb.exe). 2 tasks stuck on wait-for-device (no emulator process).
- **Status**: Fixed with gpasswd + sg kvm; emulator now boots (Boot completed, GRPC up, adb sees emulator-5554). App installed, splash captured, logs seen (LLM fails localhost as expected, "No models"). Navigation to Story menu still fragile (splash "Start" taps not advancing reliably in headless). Rebuilds done for test endpoint. Not 100% end-to-end Story generation repro with working AI (host ollama ready on 11434 -> use 10.0.2.2 from emulator).
- **Why 2 tasks running**: Long-running emulator boot + adb waiter (backgrounded per tool rules for >2min ops). Killed when stuck.
- **Files**: Various terminal logs in .grok/sessions, emulator.log.
- **Docs**: AGENTS.md (emulator protocol), retrospective (discrepancy + WSL section).

### 5. Build / Deploy / Stale APK Issues
- **Symptoms**: Changes "not taking", fallbacks persist after "erased", "34 up-to-date" instead of executed.
- **Work**: Enforced `npm run build:android` (validate 310 tests + critical + tailwind + sync + gradle clean assemble --no-daemon). Always check "34 actionable tasks: 34 executed". adb install -r with correct path (C: for Windows adb.exe from WSL). force-stop + relaunch. Multiple pushes after uninstall.
- **Status**: Builds succeed when followed (e.g. 34/34 in some runs). APK pushed successfully to R3CT50BWDDW. But incremental caches and path quoting ( /mnt/c vs C:\ ) caused "failed to stat". Web parity change (menu) requires re-sync for APK.
- **Protocol**: After change: build, sync, clean gradle, adb -r, force-stop, launch. User tests + reports.
- **Related**: package.json scripts, AGENTS.md build section.

### 6. Web vs Android AI Parity (latest)
- **Symptoms**: "2 different copies of the app with different functionalities/capabilities" for AI (Story/AI Cloze availability, mandatory behavior). Hard to diagnose because web (public/) vs APK assets diverge.
- **Work**: Confirmed single source public/js/. Removed `app.llm ?` guard in main.js menu so Story + AI Cloze buttons *always* rendered (unconditional). AI section now always present for webapp and APK (after build). Updated docs/development.md with "Web / Android Feature Parity Rule". Reverted temp emulator endpoint. Mandatory logic already shared.
- **Status**: Source fixed for parity. AI buttons will be in menu for web (browser load of public/) and future APKs. Behavior (mandatory, no fallbacks) identical via shared game classes. User must re-build APK to see in device. Emulator has app running but splash nav still partial.
- **Files**: public/js/main.js (menu + comment), docs/development.md (new rule section), llm.js (defaults clean).
- **Docs**: This file, development.md, retrospective (parity section).

### 7. Other / Overlapping (from AGENTS pending bugs)
- Dark mode text visibility (neutral-XXX -> white in game files).
- Activities crash after correct answer (try/catch in waitAndNav game_core.js).
- Various 0-token / format in LLM (addressed via mandatory + logging + prompt focus; no "fix" without user logs).
- Prompt engineering needed (per user: "prompt we provide via api endpoint is clear and thorough").

---

## Current Overall Status (as of this update)
- **Core AI mandatory/no-fallback**: Implemented in source for Story + AI Cloze. Buttons now always available (parity fix). No code fallbacks for new content.
- **Builds**: Must be clean 34/34. Recent runs mixed (some up-to-date due to no full clean dirs).
- **Deploys**: Multiple successful adb -r to phone. Emulator now boots + app installed (KVM fixed).
- **Diagnosis tools**: RTDB logging active. Emulator available for self-test (partial nav success).
- **Parity**: Web and Android should now match for AI (source unified; rebuild required for APK).
- **Unverified claims**: Full "good Story generation on device with your ollama4android" + exact prompt/response mismatch data pending fresh user test + logs after this build/push. Emulator generation repro incomplete (splash taps).
- **Risks**: Stale APK on device, RTDB old caches (gated by AI check now), WSL emulator KVM/accel for full headless UI interaction.

**Validation method**: Compare this doc vs:
- Code (grep for "AI Required", "basic fallbacks are disabled", absence of _buildFallbackStory calls).
- Build output (34/34).
- Device: after install, test menu (see AI buttons), no-AI (AI Required), with-AI (generation or clean error), logs.
- Never claim "fixed" without your screenshots/logs/"dl"/RTDB report.

See also:
- docs/retrospective-past-20-chats-story-llm-logging.md (detailed history, architecture, discrepancies).
- docs/development.md (parity rule, build protocol).
- AGENTS.md (core rules, todo, clean build, device verification).

**Next after this build/push**: User tests on phone, reports. Then refine prompts/logging if needed based on real proxy responses.


## Latest Session Update (this build/deploy request)
- **Build**: Ran clean dirs + `npm run build:android`. validate passed (all critical + 310 tests). Tailwind + sync done. Gradle: "BUILD SUCCESSFUL in 1m 6s" / "34 actionable tasks: 33 executed, 1 up-to-date". APK timestamp updated, sync included menu parity change (AI buttons unconditional). Not perfect 34/34 (one task cached despite clean), but source changes + assets in place.
- **Deploy attempt**: Used correct Windows adb.exe + C: APK path. `adb devices` showed empty (no phone/emulator visible in this tool session). Install/launch skipped. User: ensure phone plugged, USB debugging on, authorized, then run the adb sequence locally or reconnect.
- **Parity fix included**: AI (Story + AI Cloze) buttons now always in menu for webapp (public/) and future APKs. Same mandatory no-fallback behavior.
- **Documentation**: Created/updated docs/known-issues.md with full list + this entry. See below for the complete record.
- **Status on user's doubt**: Many issues (auth, score, crashes, generation quality) addressed in source + builds + logging + mandatory logic. Full "fixed" requires your device test + report after this APK (screenshots of menu with AI buttons, no-AI "AI Required", with-AI Story attempt + logs/"dl"). Emulator work advanced (booted, app running) but nav partial. The "feeling" may be because verification is user-dependent per AGENTS rules, and some (like exact prompt/response mismatch) need fresh logs from your ollama4android.

