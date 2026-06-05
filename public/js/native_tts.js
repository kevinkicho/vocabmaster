/* js/native_tts.js
 * Bridge layer for native Android TTS via VocabMaster WebView wrapper.
 * When the app runs inside the Android wrapper, a NativeTTS object is injected
 * via @JavascriptInterface. This file provides a promise-based wrapper around
 * those native calls.
 *
 * Usage:
 *   if (NativeTTSBridge.isAvailable()) {
 *       const voices = await NativeTTSBridge.getVoices();
 *       await NativeTTSBridge.speak("Hello", voices[0].name, "en-US", 0.9);
 *   }
 */

const NativeTTSBridge = (() => {
    const _pending = new Map();
    let _counter = 0;

    // Separate global for callback dispatch because window.NativeTTS is
    // a Java-backed object injected via addJavascriptInterface and cannot
    // have arbitrary JS properties added to it.
    window.__nativeTTSBridge = {
        // Called by native Kotlin layer via evaluateJavascript()
        // Receives base64-encoded JSON result to avoid escaping issues
        _onResultEncoded(callbackId, encoded) {
            const cb = _pending.get(callbackId);
            if (!cb) return;
            _pending.delete(callbackId);
            try {
                const json = atob(encoded);
                const result = JSON.parse(json);
                if (result.error) {
                    cb.reject(new Error(result.error));
                } else {
                    cb.resolve(result);
                }
            } catch (e) {
                cb.reject(e);
            }
        },

        // Legacy callback support for simpler implementations
        _onResult(callbackId, json) {
            const cb = _pending.get(callbackId);
            if (!cb) return;
            _pending.delete(callbackId);
            try {
                const result = JSON.parse(json);
                if (result.error) {
                    cb.reject(new Error(result.error));
                } else {
                    cb.resolve(result);
                }
            } catch (e) {
                cb.reject(e);
            }
        }
    };

    function _call(methodName, ...args) {
        return new Promise((resolve, reject) => {
            const id = 'tts_' + (++_counter) + '_' + Date.now();
            _pending.set(id, { resolve, reject });

            const timer = setTimeout(() => {
                if (_pending.has(id)) {
                    _pending.delete(id);
                    reject(new Error('Native TTS call timed out'));
                }
            }, 30000);

            const origResolve = resolve;
            const origReject = reject;
            _pending.set(id, {
                resolve(val) { clearTimeout(timer); origResolve(val); },
                reject(err) { clearTimeout(timer); origReject(err); }
            });

            try {
                const fn = window.NativeTTS[methodName];
                if (typeof fn !== 'function') {
                    _pending.delete(id);
                    clearTimeout(timer);
                    reject(new Error('Native method ' + methodName + ' not available'));
                    return;
                }
                fn.apply(window.NativeTTS, [...args, id]);
            } catch (e) {
                _pending.delete(id);
                clearTimeout(timer);
                reject(e);
            }
        });
    }

    function _callSync(methodName, ...args) {
        try {
            const fn = window.NativeTTS[methodName];
            if (typeof fn !== 'function') {
                throw new Error('Native method ' + methodName + ' not available');
            }
            return fn.apply(window.NativeTTS, args);
        } catch (e) {
            L('[NativeTTSBridge]', methodName, 'error:', e);
            return null;
        }
    }

    return {
        isAvailable() {
            return typeof window.NativeTTS !== 'undefined'
                && typeof window.NativeTTS.speak === 'function';
        },

        getVoices() {
            try {
                const raw = window.NativeTTS.getVoices();
                if (!raw) return [];
                const voices = JSON.parse(raw);
                return Array.isArray(voices) ? voices : [];
            } catch (e) {
                L('[NativeTTSBridge] getVoices error:', e);
                return [];
            }
        },

        speak(text, voiceName, langTag, rate) {
            return _call('speak', text, voiceName, langTag, rate);
        },

        previewVoice(voiceName, langTag) {
            return _call('previewVoice', voiceName, langTag);
        },

        stop() {
            try {
                window.NativeTTS.stop();
            } catch (e) {
                L('[NativeTTSBridge] stop error:', e);
            }
        }
    };
})();
