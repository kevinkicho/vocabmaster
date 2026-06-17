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

### Root Cause Analysis

The APK was using Chrome's `speechSynthesis` instead of native Android TTS due to a **script loading race condition**:

1. `services.js` (containing `AudioService` constructor) loaded **before** `native_tts.js` (containing `NativeTTSBridge` definition).
2. `AudioService` constructor checked `typeof NativeTTSBridge !== 'undefined'` — it was `undefined`, so `useNative = false`.
3. The fallback check (`window.NativeTTS` or UA) set `useNative = true`, but `loadVoices()` immediately threw `ReferenceError: NativeTTSBridge is not defined`.
4. The `catch(e)` block logged the error but did **not** schedule a retry — voice list stayed empty.
5. All subsequent `speak()` calls fell through to the `window.speechSynthesis` path.

### Fix Applied

- Moved `native_tts.js` script tag **before** `services.js` in both `public/index.html` and `android/app/src/main/assets/index.html`.
- This ensures `NativeTTSBridge` is defined when `AudioService` constructor runs, so the primary check passes and `loadVoices()` succeeds on first attempt.
