/* js/capacitor_tts_bridge.js
 * Capacitor TTS Bridge — replaces old WebView @JavascriptInterface approach.
 * Uses the VocabTTS Capacitor plugin for native Android TTS.
 */

const CapacitorTTS = (() => {
    const _pending = new Map();
    let _ttsDoneListener = null;
    let _pluginChecked = false;
    let _available = false;

    function _getPlugin() {
        if (_pluginChecked) return _available ? window.Capacitor?.Plugins?.VocabTTS : null;
        _pluginChecked = true;
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.VocabTTS) {
            _available = true;
            L('[CapTTS] Capacitor VocabTTS plugin found');
            return window.Capacitor.Plugins.VocabTTS;
        }
        L('[CapTTS] Capacitor plugin not available');
        return null;
    }

    function isAvailable() {
        return !!_getPlugin();
    }

    async function getVoices() {
        const plugin = _getPlugin();
        if (!plugin) return [];
        try {
            const result = await plugin.getVoices();
            const raw = result.voices;
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') return JSON.parse(raw);
            return [];
        } catch (e) {
            L('[CapTTS] getVoices failed:', e.message);
            return [];
        }
    }

    function _onTTSDone(data) {
        if (!data) return;
        const cbId = data.callbackId;
        if (cbId && _pending.has(cbId)) {
            if (data.error) _pending.get(cbId).reject(new Error(data.error));
            else _pending.get(cbId).resolve(true);
            _pending.delete(cbId);
        }
    }

    function _ensureListener() {
        if (_ttsDoneListener) return;
        const plugin = _getPlugin();
        if (!plugin) return;
        try {
            _ttsDoneListener = plugin.addListener('ttsDone', _onTTSDone);
        } catch (e) {
            L('[CapTTS] listener setup failed:', e.message);
        }
    }

    async function speak(text, voiceName, langTag, rate = 1.0) {
        const plugin = _getPlugin();
        if (!plugin) throw new Error('TTS plugin not available');
        _ensureListener();
        const callbackId = 'tts_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (_pending.has(callbackId)) {
                    _pending.get(callbackId).resolve(true);
                    _pending.delete(callbackId);
                }
            }, 30000);
            _pending.set(callbackId, {
                resolve(val) { clearTimeout(timer); resolve(val); },
                reject(err) { clearTimeout(timer); reject(err); }
            });
            plugin.speak({ text, voiceName, langTag, rate, callbackId }).catch(err => {
                clearTimeout(timer);
                _pending.delete(callbackId);
                reject(err);
            });
        });
    }

    async function stop() {
        const plugin = _getPlugin();
        if (!plugin) return;
        try { await plugin.stop(); } catch(e) {}
        _pending.clear();
    }

    async function previewVoice(voiceName, langTag) {
        const plugin = _getPlugin();
        if (!plugin) throw new Error('TTS plugin not available');
        _ensureListener();
        const callbackId = 'prev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (_pending.has(callbackId)) {
                    _pending.get(callbackId).resolve(true);
                    _pending.delete(callbackId);
                }
            }, 15000);
            _pending.set(callbackId, {
                resolve(val) { clearTimeout(timer); resolve(val); },
                reject(err) { clearTimeout(timer); reject(err); }
            });
            plugin.previewVoice({ voiceName, langTag, callbackId }).catch(err => {
                clearTimeout(timer);
                _pending.delete(callbackId);
                reject(err);
            });
        });
    }

    return { isAvailable, getVoices, speak, stop, previewVoice };
})();

// Monkeypatch NativeTTSBridge so AudioService uses Capacitor TTS transparently
if (typeof NativeTTSBridge !== 'undefined' && CapacitorTTS.isAvailable()) {
    const origAvailable = NativeTTSBridge.isAvailable;
    NativeTTSBridge.isAvailable = () => CapacitorTTS.isAvailable();
    NativeTTSBridge.getVoices = () => CapacitorTTS.getVoices();
    NativeTTSBridge.speak = (text, voice, lang, rate) => CapacitorTTS.speak(text, voice, lang, rate);
    NativeTTSBridge.stop = () => CapacitorTTS.stop();
    NativeTTSBridge.previewVoice = (voice, lang) => CapacitorTTS.previewVoice(voice, lang);
    L('[CapTTS] Patched NativeTTSBridge for Capacitor');
}