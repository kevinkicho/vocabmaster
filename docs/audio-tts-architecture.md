# Audio & Text-To-Speech (TTS) Architecture

VocabMaster uses a dual-engine architecture for Text-To-Speech to guarantee the highest quality audio depending on the platform it is running on.

## The Problem: Android Chrome TTS Limitations

If an Android app uses a WebView (like VocabMaster does) and relies solely on the browser's `window.speechSynthesis` API, it is forced to use the default Chrome TTS engine. Historically, this engine has provided very low-quality, robotic voices compared to the high-quality native voices available in Android's operating system settings (like the Google TTS or Samsung TTS engines).

## The Solution: Dual-Engine Routing

VocabMaster's `AudioService` (`public/js/services.js`) intelligently detects the environment and routes audio requests accordingly.

### 1. Android Environment (Native Bridge)

When the app detects it is running inside the Android APK wrapper:
- It sets an internal flag `useNative = true`.
- It completely bypasses the browser's `window.speechSynthesis` API.
- Instead, it forwards the TTS request through `native_tts.js` to a native Kotlin bridge (`TTSBridge.kt`) injected via `addJavascriptInterface`.
- **Result:** The app uses the high-quality, system-level Android Text-To-Speech engines rather than the low-quality Chrome browser voices.

### 2. Desktop & Pure Web Environment (Web Speech API)

When running as a normal web application on a desktop browser (or iOS Safari):
- `useNative` is false.
- The `AudioService` falls back to the standard Web Speech API (`window.speechSynthesis`).
- The browser then leverages the voices provided by your Operating System (e.g., Microsoft Zira/David on Windows, Apple voices on macOS) and any cloud-based voices provided by the browser (e.g., "Google US English" in Chrome).

## User Voice Selection

In the desktop web app, the `UIManager` parses all available system voices and generates a specific dropdown menu **for each language**.
- The voices are categorized into `optgroups` by their provider (e.g., Google, Microsoft, Apple, Local, Network).
- This allows users to explicitly select which provider's voice they want to use for each language, which is saved locally in their `selectedVoices` preference.
- On Android native, voice dropdowns are hidden and an info message is shown instead: "Using Android default TTS engine — voice selection is managed in Android Settings."

## UI Settings & Preferences

The app features several audio-related user preferences to customize playback behavior:

### Master Audio (`masterAudio`)
A global switch that completely disables all Text-to-Speech output from the app when turned off.

### Show Audio Buttons (`showAudioBtns`)
A global switch that determines the visibility of manual audio playback buttons (the circular speaker icons) during gameplay.
- **Enabled:** Displays the manual speaker buttons for configured languages (English, Chinese, Korean, etc.) so the user can manually click to hear pronunciation.
- **Disabled:** Hides all manual audio buttons for a cleaner UI, ideal for users who rely solely on Auto-Play Audio or keyboard shortcuts (Space / Up / Down) for playback.

### Wait Audio (`audioWait`)
Controls the auto-navigation pacing after a user answers a question correctly (e.g., in Quiz or True/False modes) when 'Auto-Play on Correct' is active.
- **Enabled:** The game engine (`waitAndNav`) awaits the full completion of the TTS audio promise before advancing to the next card. This ensures you always hear the complete pronunciation, no matter how long the sentence is.
- **Disabled:** The game advances to the next card after a fixed short delay (usually 1.5 seconds), which can speed up gameplay but might cut off the audio mid-sentence if the text is long.

## Android Native TTS Bridge

### Architecture

```
User taps audio button
        |
        v
app.audio.play(text, langKey, ...)     [services.js]
        |
        +-- useNative == true --> NativeTTSBridge.speak()  [native_tts.js]
        |                               |
        |                               v
        |                         window.NativeTTS.speak()  [MainActivity.kt]
        |                               |
        |                               v
        |                         TTSBridge.speak()          [TTSBridge.kt]
        |                               |
        |                               v
        |                         Android TextToSpeech API
        |
        +-- useNative == false --> new SpeechSynthesisUtterance()
                                    window.speechSynthesis.speak(u)
```

### Key Files

| File | Path | Role |
|------|------|------|
| AudioService | `public/js/services.js` | Core TTS orchestration, `useNative` decision |
| NativeTTSBridge | `public/js/native_tts.js` | JS wrapper for `window.NativeTTS` |
| CapacitorTTS | `public/js/capacitor_tts_bridge.js` | Dead-end Capacitor plugin wrapper (not used) |
| MainActivity.kt | `android/.../MainActivity.kt` | Injects `NativeTTS` via `addJavascriptInterface` |
| TTSBridge.kt | `android/.../TTSBridge.kt` | Android `TextToSpeech` API implementation |
| AndroidManifest.xml | `android/.../AndroidManifest.xml` | TTS engine discovery query (`<queries>`) |

### Detection Logic (`services.js:6-13`)

```javascript
this.useNative = (typeof window.NativeTTSBridge !== 'undefined') && window.NativeTTSBridge.isAvailable();
if (!this.useNative && (window.NativeTTS || /VocabMasterApp/i.test(navigator.userAgent || ''))) {
    this.useNative = true;
}
```

1. **Primary check:** Is `window.NativeTTSBridge` defined AND does `window.NativeTTS.speak` exist?
2. **Fallback:** Is `window.NativeTTS` truthy OR does UA contain "VocabMasterApp"?

**Important:** All references to `NativeTTSBridge` in `services.js` must use `window.NativeTTSBridge` (not bare `NativeTTSBridge`). JavaScript `const` declarations in one `<script>` tag are not visible to other `<script>` tags — only `window.*` globals cross script boundaries. The `const NativeTTSBridge` in `native_tts.js` is a local variable; the actual global is set via `window.NativeTTSBridge = bridge` at line 144.

### Script Loading Order (Critical Fix)

`native_tts.js` must load **before** `services.js` so `NativeTTSBridge` is defined when `AudioService` constructor runs. Both `public/index.html` and `android/app/src/main/assets/index.html` must maintain this order.

**Correct order:**
```html
<script src="js/native_tts.js" defer></script>
<script src="js/native_auth.js" defer></script>
<script src="js/capacitor_tts_bridge.js" defer></script>
<script src="js/services.js?v=5" defer></script>
```

### R8 / ProGuard

The `NativeTTSJSInterface` inner class in `MainActivity.kt` is obfuscated by R8 in release builds (renamed to `MainActivity$c`), but `@JavascriptInterface` annotations and method names are preserved. No ProGuard keep rules are needed for TTS to function.

### Voice Loading Retry

The native `loadVoices()` path retries every 500ms if `getVoices()` returns an empty array (e.g., TTS engine not yet initialized). This handles the async `TextToSpeech` initialization delay.

## TTS Fix History (June 2026)

### Root Cause Analysis (Final)

The APK was using Chrome's `speechSynthesis` instead of native Android TTS. The root cause was a **JavaScript scope issue with `const` across `<script>` tags**, not just a script ordering problem.

**The real problem:**

1. `native_tts.js` defines `NativeTTSBridge` using `const`:
   ```js
   const NativeTTSBridge = (() => {
       // ...
       window.NativeTTSBridge = bridge;  // ← the actual global
       return bridge;
   })();
   ```

2. In JavaScript, `const` (and `let`, `class`) declarations in one `<script>` tag are **not visible** to other `<script>` tags — only `var` and explicit `window.*` assignments cross script boundaries.

3. `services.js` checked `typeof NativeTTSBridge` (without `window.`):
   ```js
   this.useNative = (typeof NativeTTSBridge !== 'undefined') && NativeTTSBridge.isAvailable();
   ```
   This always returned `'undefined'` because `const NativeTTSBridge` is scoped to `native_tts.js`'s script block.

4. The fallback at line 10 (`window.NativeTTS` exists → `useNative = true`) did fire, but then `loadVoices()` at line 119 called `NativeTTSBridge.getVoices()` (again without `window.`), which threw `ReferenceError: NativeTTSBridge is not defined`.

5. The `catch(e)` block logged the error but did **not** schedule a retry — voice list stayed empty. All subsequent `speak()` calls fell through to the `window.speechSynthesis` path.

### Fix Applied

**First attempt (script reordering):** Moved `native_tts.js` script tag **before** `services.js` in both `public/index.html` and `android/app/src/main/assets/index.html`. This was necessary but **not sufficient** — `const` still doesn't cross script boundaries regardless of load order.

**Final fix (June 17, 2026):** Changed all 5 references in `services.js` from bare `NativeTTSBridge` to `window.NativeTTSBridge`:

| Line | Before | After |
|------|--------|-------|
| 6 | `typeof NativeTTSBridge` | `typeof window.NativeTTSBridge` |
| 6 | `NativeTTSBridge.isAvailable()` | `window.NativeTTSBridge.isAvailable()` |
| 119 | `NativeTTSBridge.getVoices()` | `window.NativeTTSBridge.getVoices()` |
| 157 | `NativeTTSBridge.previewVoice(...)` | `window.NativeTTSBridge.previewVoice(...)` |
| 235 | `NativeTTSBridge.speak(...)` | `window.NativeTTSBridge.speak(...)` |
| 276 | `NativeTTSBridge.stop()` | `window.NativeTTSBridge.stop()` |

The `window.NativeTTSBridge` global was already being set correctly by `native_tts.js` line 144 (`window.NativeTTSBridge = bridge`). The bug was that `services.js` was reading the local `const` variable instead of the `window.*` global.

### Lesson for Future Agents

When accessing a value defined in another `<script>` tag, always use `window.*` prefix. `const`, `let`, and `class` declarations are scoped to their individual script block and are not visible across `<script>` boundaries — only `var` and explicit `window.*` assignments are.
