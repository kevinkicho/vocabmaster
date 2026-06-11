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
- Instead, it forwards the TTS request through `capacitor_tts_bridge.js` (or legacy `native_tts.js`) to a native Kotlin plugin (`VocabTTS`).
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
- *Note: On Android native, the voice selection is largely delegated to the Android OS settings, though the app provides a banner explaining how to change it.*
