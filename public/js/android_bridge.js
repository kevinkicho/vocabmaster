/* js/android_bridge.js
 * Bridge layer for VocabMaster running inside the Android WebView wrapper.
 * When the app runs in Android, the native Kotlin layer injects an "Android"
 * object via @JavascriptInterface. This file provides a promise-based wrapper
 * around those native calls so the rest of the app can use async/await.
 *
 * Usage:
 *   if (AndroidBridge.isAvailable()) {
 *       const result = await AndroidBridge.askGemma({ prompt: "...", model: "gemma3:1b" });
 *   }
 */

const AndroidBridge = (() => {
    const _pending = new Map(); // callbackId -> { resolve, reject }
    let _counter = 0;

    // Native callback receiver — Kotlin calls these via evaluateJavascript()
    window.__ollamaBridge = {
        _tokenHandlers: {},
        resolve(callbackId, resultJson) {
            delete this._tokenHandlers[callbackId];
            const cb = _pending.get(callbackId);
            if (!cb) return;
            _pending.delete(callbackId);
            try {
                cb.resolve(JSON.parse(resultJson));
            } catch {
                cb.resolve(resultJson);
            }
        },
        reject(callbackId, errorMsg) {
            delete this._tokenHandlers[callbackId];
            const cb = _pending.get(callbackId);
            if (!cb) return;
            _pending.delete(callbackId);
            cb.reject(new Error(errorMsg));
        },
        onToken(callbackId, token) {
            const handler = this._tokenHandlers[callbackId];
            if (handler) handler(token);
        }
    };

    function _call(methodName, ...args) {
        return new Promise((resolve, reject) => {
            const id = 'cb_' + (++_counter) + '_' + Date.now();
            _pending.set(id, { resolve, reject });

            // Timeout safety net (2 min for LLM generation)
            const timer = setTimeout(() => {
                if (_pending.has(id)) {
                    _pending.delete(id);
                    reject(new Error('Bridge call timed out'));
                }
            }, 120000);

            const origResolve = resolve;
            const origReject = reject;
            _pending.set(id, {
                resolve(val) { clearTimeout(timer); origResolve(val); },
                reject(err) { clearTimeout(timer); origReject(err); }
            });

            try {
                window.Android[methodName](id, ...args);
            } catch (e) {
                _pending.delete(id);
                clearTimeout(timer);
                reject(e);
            }
        });
    }

    return {
        /** True when running inside the VocabMaster Android wrapper */
        isAvailable() {
            return typeof window.Android !== 'undefined' && typeof window.Android.askGemma === 'function';
        },

        /**
         * Send a prompt to Gemma via ollama4android.
         * @param {Object} opts - { prompt, model?, system? }
         * @returns {Promise<Object>} Ollama API response
         */
        askGemma(opts) {
            return _call('askGemma', JSON.stringify(opts));
        },

        /**
         * Check if ollama4android is running and list available models.
         * @returns {Promise<Object>} { models: [...] }
         */
        checkStatus() {
            return _call('checkOllamaStatus');
        },

        /**
         * Get current bridge config (port, baseUrl).
         * @returns {Promise<Object>}
         */
        getConfig() {
            return _call('getOllamaConfig');
        },

        /**
         * Update the ollama port (no callback needed).
         */
        setPort(port) {
            if (window.Android) window.Android.setOllamaPort(port);
        },

        /**
         * Stream a prompt to Gemma via ollama4android.
         * Tokens arrive via onToken callback, final result via resolve.
         * @param {Object} opts - { prompt, model?, system? }
         * @param {Function} onToken - called with each token string as it arrives
         * @returns {Promise<Object>} Final Ollama API response with full text
         */
        streamGemma(opts, onToken) {
            return new Promise((resolve, reject) => {
                const id = 'cb_' + (++_counter) + '_' + Date.now();
                const timer = setTimeout(() => {
                    if (_pending.has(id)) { _pending.delete(id); reject(new Error('Stream timed out')); }
                }, 180000); // 3 min for streaming
                _pending.set(id, {
                    resolve(val) { clearTimeout(timer); resolve(val); },
                    reject(err) { clearTimeout(timer); reject(err); }
                });
                // Register token handler for this stream
                window.__ollamaBridge._tokenHandlers = window.__ollamaBridge._tokenHandlers || {};
                window.__ollamaBridge._tokenHandlers[id] = onToken;
                try {
                    window.Android.streamGemma(id, JSON.stringify(opts));
                } catch (e) {
                    _pending.delete(id); clearTimeout(timer);
                    delete window.__ollamaBridge._tokenHandlers[id];
                    reject(e);
                }
            });
        },

        /**
         * Connect to ollama4android on a specific port and validate it.
         * @param {number} port
         * @returns {Promise<Object>} Ollama /api/tags response
         */
        connectToPort(port) {
            return new Promise((resolve, reject) => {
                const id = 'cb_' + (++_counter) + '_' + Date.now();
                const timer = setTimeout(() => {
                    if (_pending.has(id)) { _pending.delete(id); reject(new Error('Connection timed out')); }
                }, 10000);
                _pending.set(id, {
                    resolve(val) { clearTimeout(timer); resolve(val); },
                    reject(err) { clearTimeout(timer); reject(err); }
                });
                try {
                    window.Android.connectToPort(id, port);
                } catch (e) {
                    _pending.delete(id); clearTimeout(timer); reject(e);
                }
            });
        }
    };
})();
