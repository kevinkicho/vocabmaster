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

1. **Primary check:** Is `window.NativeTTSBridge` defined AND does `window.NativeTTSBridge.isAvailable()` return true?
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

---

## TTS Provider Detection (How Samsung & Google TTS Are Found)

When Android has **multiple TTS engines** installed (Google TTS, Samsung TTS, etc.), the app discovers all their voices through Android's unified `TextToSpeech.getVoices()` API and labels each voice with its provider using **per-engine TTS enumeration** (primary) with a name-heuristic fallback.

### Detection Chain

```
Android TextToSpeech API
        |
        v
TTSBridge.kt:buildEngineVoiceMap()   ← per-engine enumeration (primary)
  + TTSBridge.kt:heuristicProvider()  ← name heuristic fallback
        |
        v
JSON string with provider labels
        |
        v
window.NativeTTS.getVoices()         ← @JavascriptInterface
        |
        v
NativeTTSBridge.getVoices()          ← native_tts.js (sync call, JSON.parse)
        |
        v
AudioService.loadVoices()            ← services.js (provider + displayName preserved)
        |
        v
ui_llm.js (active) / ui.js (fallback) renderVoiceSelector()
        |                                   +-----------+
        +--> getProviderName()              |  Google   |
        |       has voice.provider?         |   voices  |
        |         YES → return it           |           |
        |         NO  → heuristic fallback   +-----------+
        |                                   +-----------+
        +--> group by provider              |  Samsung  |
        |       >1 provider?                |   voices  |
        |         YES → <optgroup>          |           |
        |         NO  → flat list           +-----------+
        |
        v
Settings UI voice dropdown per language
```

### Step 1: Android API — All Voices, All Engines (TTSBridge.kt:60)

```kotlin
val voices: MutableSet<Voice> = tts!!.voices
```

Android's `TextToSpeech.getVoices()` (API 21+) returns **every voice from every installed TTS engine** as a single flat set. It does not distinguish which engine owns which voice — that must be determined separately.

### Step 2: Per-Engine Enumeration (Primary — TTSBridge.kt:98-133)

Because Android's `Voice` class has no `getEngine()` API, the app uses `PackageManager.queryIntentServices()` with the TTS intent action to discover installed engines, then creates a **temporary `TextToSpeech` instance per engine** with a 2-second `CountDownLatch` timeout:

```kotlin
private fun buildEngineVoiceMap() {
    scope.launch(Dispatchers.IO) {
        val intent = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
        val enginePackages = context.packageManager.queryIntentServices(intent, 0)
        for (info in enginePackages) {
            val latch = CountDownLatch(1)
            val tempTts = TextToSpeech(context, { status ->
                if (status == TextToSpeech.SUCCESS) {
                    tempVoices = tempTts.voices
                }
                latch.countDown()
            }, packageName)
            latch.await(2, TimeUnit.SECONDS)
            // Map each voice name → engine label
            engineVoiceMap[v.name] = info.loadLabel(packageManager).toString()
            tempTts.shutdown()
        }
        engineMapReady = true
    }
}
```

Each temp TTS instance is scoped to a specific engine, so calling `getVoices()` on it returns only voices from that engine. This yields **perfect provider attribution** — every voice is mapped to its actual engine label (e.g., "Google TTS", "Samsung TTS").

### Step 3: Fallback Heuristic (TTSBridge.kt:65-73)

If the engine map isn't ready yet (e.g., on first `getVoices()` call before background enumeration completes), the app falls back to name-based heuristic:

```kotlin
private fun heuristicProvider(v: Voice, features: String): String {
    return when {
        v.name.contains("google", ignoreCase = true) ||
            v.locale.toString().contains("google", ignoreCase = true) -> "Google"
        v.name.contains("samsung", ignoreCase = true) ||
            features.contains("samsung", ignoreCase = true) -> "Samsung"
        v.isNetworkConnectionRequired -> "Network"
        else -> "Local"
    }
}
```

### Step 4: Provider String Flows Through JS Unchanged

In `services.js:loadVoices()` (line 124), the `provider` field from the Java JSON is preserved:

```javascript
this.voices = raw.map(v => ({
    ...
    provider: v.provider || 'Local',   // ← straight from TTSBridge.kt
    displayName: v.displayName || v.name  // ← locale name + ★ badge
    ...
}));
```

### Step 5: UI Renders Provider Groups (ui_llm.js:150-179)

**Note:** The active `renderVoiceSelector()` is in `ui_llm.js` (lines 69-206), which overrides the one in `ui.js` since `ui_llm.js` is loaded after `ui.js` in `index.html`. Both copies exist but the `ui_llm.js` version is the one that runs.

```javascript
const providerGroups = new Map();
langVoices.forEach(v => {
    const provider = getProviderName(v);
    if (!providerGroups.has(provider)) providerGroups.set(provider, []);
    providerGroups.get(provider).push(v);
});
const useGroups = providerGroups.size > 1;

if (useGroups) {
    providerGroups.forEach((providerVoices, provider) => {
        html += `<optgroup label="${provider}">`;
        // ... each voice as <option>
        html += `</optgroup>`;
    });
}
```

When voices from **multiple providers** exist for a language, they are grouped under `<optgroup>` headers labeled "Google", "Samsung", etc. When only one provider is present, the list is flat.

### Step 6: Browser Fallback Heuristic (ui_llm.js:100-111)

When the app is running in a browser (no native bridge), voice objects from `window.speechSynthesis.getVoices()` do NOT have a `provider` field. The `getProviderName()` function infers it from the name/URI:

```javascript
const getProviderName = (voice) => {
    if (voice.provider) return voice.provider;           // native path
    const combined = (voice.voiceURI + ' ' + voice.name).toLowerCase();
    if (/google|com\.google\.android\.tts/i.test(combined)) return 'Google';
    if (/samsung|com\.samsung/i.test(combined)) return 'Samsung';
    if (/microsoft|edge.*tts/i.test(combined)) return 'Microsoft';
    if (/apple|com\.apple/i.test(combined)) return 'Apple';
    if (voice.localService) return 'Local';
    return 'Network';
};
```

---

## Voice Selection & TTS Engine Routing

The user can select a specific voice per language in Settings. How this selection affects actual TTS playback depends on the platform.

### The Selection Flow

1. User picks a voice from the per-language `<select>` dropdown (e.g., `samsung-ko-kr-narra`)
2. The `onchange` handler saves `selectedVoices[langKey] = voiceURI` via `previewVoice()` then `store.js:savePrefs()`
3. On playback, `speakNow()` reads `selectedVoices[langKey]`, looks up the voice by `voiceURI`, and passes the voice name to the TTS layer

### Native TTS Path (Android WebView / APK)

```
speakNow(txt, langKey)
    |
    +--> prefs.selectedVoices[langKey]  →  voiceURI
    |        |
    |        v
    |    this.voices.find(voiceURI)     →  voice.name
    |        |
    |        v
    |    NativeTTSBridge.speak(txt, voiceName, langTag, rate)
    |        |
    |        v
    |    TTSBridge.speak(voiceName)     →  tts.voices.find(name) → tts.voice = targetVoice
    |        |
    |        v
    |    Android TextToSpeech.speak()
    |
    +--> voiceName is empty?  →  Android uses current tts.voice (system default)
```

**Key mechanism in `TTSBridge.kt:132-138`:**

```kotlin
if (voiceName.isNotEmpty()) {
    val voices: Set<Voice> = tts!!.voices   // ← ALL voices, ALL engines
    val targetVoice = voices.find { it.name == voiceName }
    if (targetVoice != null) {
        tts!!.voice = targetVoice            // ← Android switches engine if needed
    }
}
```

### Cross-Engine Voice Selection (Critical Detail)

`TextToSpeech` is initialized **without specifying an engine** on line 37:
```kotlin
tts = TextToSpeech(context) { status -> ... }
```
This means it uses the **system default TTS engine** (set in Android Settings → General Management → Text-to-speech → Preferred engine).

However, `tts.voices` returns voices from **all installed engines**, and `tts.voice = targetVoice` in modern Android (API 21+) can **transparently switch to the engine that owns the voice**. When `setVoice()` is called with a voice from a non-default engine (e.g., Samsung voice while default engine is Google TTS), Android's TTS framework:
1. Extracts the engine identifier from the `Voice` object
2. Routes the speech request to the appropriate engine
3. Does NOT require the app to re-initialize `TextToSpeech` with a different engine

**Caveat:** This behavior depends on the Android version and OEM implementation. On some devices/skins, `setVoice()` with a cross-engine voice may silently fall back to the default engine's closest matching voice rather than switching engines.

### Browser Path (speechSynthesis)

When `useNative` is false (desktop, Chrome on Android, iOS):

```javascript
// services.js:239-253
const u = new SpeechSynthesisUtterance(txt);
u.voice = freshVoices.find(x => x.voiceURI === voiceURI);
```

The browser's `SpeechSynthesisUtterance.voice` only works with voices from the browser's own speech engine. On Chrome, this typically only exposes Google TTS voices. Samsung voices are generally NOT available through `speechSynthesis` on Chrome, even on Samsung devices.

### APK Override: Voice Dropout

**Important:** When the app detects it is running in the native WebView (`useNative = true`), `renderVoiceSelector()` (ui_llm.js:193-197) **replaces the entire voice dropdown UI** with an info box:

```javascript
if (isNative) {
    html = `<div class="p-3 bg-emerald-50 ...">
        Using Android default TTS engine
        ...
    </div>`;
}
```

Note: `ui_llm.js` overrides `UIManager.prototype.renderVoiceSelector` via `Object.assign` — it is the active implementation. The deprecated copy in `ui.js` is never called.

### Summary Table

| Platform | `useNative` | Voices Source | Provider Labels | Per-Lang Voice Selection | Engine Switching |
|----------|-------------|---------------|-----------------|--------------------------|------------------|
| APK (WebView) | `true` | `TTSBridge.getVoices()` | Heuristic in TTSBridge.kt | Hidden (info box instead) | `setVoice()` cross-engine (API 21+) |
| Android Chrome | `false` | `speechSynthesis.getVoices()` | JS heuristic in `getProviderName()` | Works via dropdown but limited to Chrome voices | Not applicable (Chrome only has Google TTS) |
| Desktop Chrome | `false` | `speechSynthesis.getVoices()` | JS heuristic in `getProviderName()` | Works via dropdown | Not applicable (OS-level voices) |
| iOS Safari | `false` | `speechSynthesis.getVoices()` | JS heuristic in `getProviderName()` | Works via dropdown | Not applicable (Apple voices only) |

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
