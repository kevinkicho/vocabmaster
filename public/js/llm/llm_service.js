/* js/llm/llm_service.js — Core LLMService class
 *
 * === Transport layer ===
 *   _fetch() tries Capacitor HttpProxy first (Android WebView),
 *   falls back to native fetch() if proxy absent or throws.
 *   Proxy does NOT support AbortSignal — timeout enforced via readTimeout param.
 *   Native fetch() uses AbortController + setTimeout (not AbortSignal.any,
 *   which is unreliable across WebView versions).
 *
 * === Concurrency ===
 *   _enqueue() manages a FIFO array with _maxConcurrent=2.
 *   Two requests may run in parallel. Queue capped at 50.
 *   _ping() bypasses the queue (health check must not block behind generation).
 *
 * === Connection health ===
 *   _ping() runs on visibilitychange (app resume). 3s timeout /api/tags.
 *   On failure: clears available flag, schedules autoDetect() in 5s.
 *   On success: restores available=true.
 *
 * See docs/architecture.md §1 for full pipeline description.
 */
class LLMService {
    constructor() {
        var isBrowser = !window.Capacitor && !window.NativeTTS;
        if (isBrowser && window.OLLAMA_USE_CLOUD === true) {
            this.useProxy = true;
            this.proxyUrl = 'https://ollama-proxy-1020976660084.us-central1.run.app';
            this.endpoint = this.proxyUrl;
            this.useCloud = true;
            this.apiKey = null;
        } else {
            this.useProxy = false;
            this.proxyUrl = '';
            this.endpoint = window.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
            this.useCloud = window.OLLAMA_USE_CLOUD === true;
            this.apiKey = window.OLLAMA_API_KEY || null;
        }
        this.model = '';
        this.available = false;
        this.availableModels = [];
        this.hasModel = false;
        this.resolvedModel = null;
        this.cache = new Map();
        this.db = null;
        this._activeRequests = 0;
        this._maxConcurrent = 2;
        this._queue = [];
        this._initDB();
        if (typeof this.initValidator === 'function') this.initValidator();
        L('[LLM] Endpoint configured:', this.endpoint);

        // Re-check connection when app returns to foreground
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this._ping();
        });
    }

    async _ping() {
        try {
            await this._ollamaRequest('/api/tags', null, { stream: false, timeout: 3000 });
            L('[LLM] Resume ping OK');
            this.available = true;
            if (app && app.ui && app.ui._updateAIStatus) app.ui._updateAIStatus();
            return true;
        } catch (e) {
            L('[LLM] Resume ping failed — connection lost');
            this.available = false;
            if (app && app.ui && app.ui._updateAIStatus) app.ui._updateAIStatus();
            setTimeout(() => {
                if (!this.available) this.autoDetect().catch(() => {});
            }, 5000);
            return false;
        }
    }

    async _fetch(url, options) {
        // NOTE: Capacitor HttpProxy does NOT support AbortSignal.
        // The caller's timeout value is passed as readTimeout instead.
        // If proxy throws, fall through to native fetch() (which uses AbortController).
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HttpProxy) {
            try {
                var proxy = window.Capacitor.Plugins.HttpProxy;
                var reqTimeout = options.timeout || 60000;
                var result = await proxy.request({
                    url: url,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body || null,
                    connectTimeout: Math.min(reqTimeout, 15000),
                    readTimeout: reqTimeout
                });
                return {
                    ok: result.ok,
                    status: result.status,
                    json: async () => JSON.parse(result.data),
                    text: async () => result.data
                };
            } catch (e) {
                L('[LLM] Capacitor proxy failed, falling back to fetch:', e.message);
            }
        }
        try {
            return await fetch(url, options);
        } catch (e) {
            // Browser CORS blocks cross-origin requests to localhost (e.g. web app → http://127.0.0.1:11434).
            // Return a structured error response instead of throwing, so callers can handle gracefully.
            L('[LLM] fetch failed (likely CORS in browser):', e.message);
            return {
                ok: false,
                status: 0,
                json: async () => { throw e; },
                text: async () => { throw e; }
            };
        }
    }

    async _ollamaRequest(path, payload, opts) {
        if (opts === undefined) opts = {};
        var stream = opts.stream || false;
        var timeout = opts.timeout || 45000;
        var method = opts.method || null;
        var signal = opts.signal || null;

        var isTags = path === '/api/tags' || path.endsWith('/tags');
        var reqMethod = method || (isTags ? 'GET' : 'POST');
        var reqBody = (isTags || !payload) ? undefined : JSON.stringify(payload);

        var url, headers = { 'Content-Type': 'application/json' };
        var fetchOptions;

        if (this.useProxy) {
            // Route through Firebase Cloud Function proxy (key lives server-side)
            url = this.proxyUrl;
            fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: path,
                    method: reqMethod,
                    headers: headers,
                    body: payload
                }),
                timeout: timeout
            };
        } else {
            url = this.endpoint + path;
            if (this.apiKey) headers['Authorization'] = 'Bearer ' + this.apiKey;
            fetchOptions = {
                method: reqMethod,
                headers: headers,
                body: reqBody,
                timeout: timeout
            };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        if (signal) {
            signal.addEventListener('abort', () => { clearTimeout(timeoutId); controller.abort(); });
        }
        var resp;

        try {
            resp = await this._fetch(url, Object.assign({}, fetchOptions, { signal: controller.signal }));
        } finally {
            clearTimeout(timeoutId);
        }

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            L('[LLM] HTTP error', resp.status, 'for', url, 'body:', errText.slice(0, 300));
            throw new Error('Ollama HTTP ' + resp.status + ' ' + errText.slice(0, 200));
        }

        if (stream) {
            return resp;
        }
        return resp.json();
    }

    loadPrefs() {
        var isBrowser = !window.Capacitor && !window.NativeTTS;
        if (isBrowser && window.OLLAMA_USE_CLOUD === true) {
            this.useProxy = true;
            this.proxyUrl = 'https://ollama-proxy-1020976660084.us-central1.run.app';
            this.endpoint = this.proxyUrl;
            this.useCloud = true;
            this.apiKey = null; // key lives server-side in Firebase config
        } else {
            this.useProxy = false;
            this.proxyUrl = '';
            this.endpoint = window.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
            this.useCloud = window.OLLAMA_USE_CLOUD === true;
            this.apiKey = window.OLLAMA_API_KEY || null;
        }
        var p = (typeof app !== 'undefined' && app && app.store && app.store.prefs) ? app.store.prefs : {};
        this.model = p.llmModel || '';
    }

    async autoDetect() {
        L('[LLM] autoDetect endpoint:', this.endpoint);

        var ok = await this.checkConnection();
        L('[LLM] checkConnection result:', ok);

        if (ok) {
            this.resolvedModel = 'gemma4:31b-cloud';
            this.hasModel = true;
            L('[LLM] Ready with model:', this.resolvedModel);
            if (app && app.ui) app.ui.renderAISettings();
            // F9: persistent home-screen indicator replaces the surprise toast.
            if (app && app.ui && app.ui._updateAIStatus) app.ui._updateAIStatus();
            // F9: home screen renders after autoDetect completes in init(), so
            // the redundant app.goHome(false) here is no longer needed.
        } else {
            L('[LLM] No models available');
        }
    }

    async checkConnection() {
        try {
            var data = await this._ollamaRequest('/api/tags', null, { stream: false, timeout: 10000 });
            this.available = true;
            this.availableModels = (data.models || []).map(m => m.name || m.model || m);
            L('[LLM] Connected —', this.availableModels.length, 'models');
            return true;
        } catch (e) {
            L('[LLM] Connection failed for endpoint', this.endpoint, 'useCloud', this.useCloud, ':', e.message || e, 'stack:', e.stack);
            this.available = false;
            return false;
        }
    }

    _enqueue(fn, timeout) {
        if (this._queue.length >= 50) {
            return Promise.reject(new Error('LLM queue full (50 queued), try again later'));
        }
        return new Promise((resolve, reject) => {
            this._queue.push({ fn: fn, resolve: resolve, reject: reject, timeout: timeout });
            this._processQueue();
        });
    }

    _processQueue() {
        while (this._activeRequests < this._maxConcurrent && this._queue.length > 0) {
            const item = this._queue.shift();
            this._activeRequests++;
            let timeoutId = null;
            let timedOut = false;
            if (item.timeout) {
                timeoutId = setTimeout(() => {
                    timedOut = true;
                    item.reject(new Error('LLM request timed out after ' + item.timeout + 'ms'));
                    this._activeRequests--;
                    this._processQueue();
                }, item.timeout + 5000);
            }
            item.fn().then(result => {
                if (timedOut) return;
                if (timeoutId) clearTimeout(timeoutId);
                item.resolve(result);
                this._activeRequests--;
                this._processQueue();
            }, err => {
                if (timedOut) return;
                if (timeoutId) clearTimeout(timeoutId);
                item.reject(err);
                this._activeRequests--;
                this._processQueue();
            });
        }
    }

    async generate(opts) {
        const model = this.resolvedModel || this.model || 'gemma4:31b-cloud';

        const body = {
            model: model,
            prompt: opts.prompt,
            stream: false
        };
        if (opts.system) body.system = opts.system;
        if (opts.options) body.options = opts.options;

        L('[LLM] generate sending to', this.endpoint, 'model=', body.model, 'resolvedModel=', this.resolvedModel);

        return this._enqueue(async () => {
            try {
                const data = await this._ollamaRequest('/api/generate', body, {
                    stream: false,
                    timeout: opts.timeout || 45000,
                    signal: opts.signal
                });
                return data.response || '';
            } catch (err) {
                L('[LLM] Ollama generate failed:', err.message);
                throw err;
            }
        }, opts.timeout || 45000);
    }

    async streamGenerate(opts, onToken) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HttpProxy) {
            L('[LLM] Capacitor HttpProxy detected, falling back to non-streaming generate to avoid crashes.');
            const fullText = await this.generate(opts);
            if (onToken) onToken(fullText);
            return;
        }

        const model = this.resolvedModel || this.model || 'gemma4:31b-cloud';

        const body = {
            model: model,
            prompt: opts.prompt,
            stream: true
        };
        if (opts.system) body.system = opts.system;
        if (opts.options) body.options = opts.options;

        L('[LLM] streamGenerate sending to', this.endpoint, 'model=', body.model, 'resolvedModel=', this.resolvedModel);

        return this._enqueue(async () => {
            let resp;
            try {
                resp = await this._ollamaRequest('/api/generate', body, {
                    stream: true,
                    timeout: opts.timeout || 180000,
                    signal: opts.signal
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
            } catch (err) {
                L('[LLM] Ollama streamGenerate failed:', err.message);
                throw err;
            }

            if (!resp.body) {
                L('[LLM] streamGenerate: resp.body is null, falling back to non-streaming');
                const fullText = await this.generate(opts);
                if (onToken) onToken(fullText);
                return fullText;
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            while (true) {
                const result = await reader.read();
                if (result.done) break;
                buffer += decoder.decode(result.value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const obj = JSON.parse(line);
                        if (obj.error) {
                            L('[LLM] stream error from backend for model', this.resolvedModel || model, ':', obj.error);
                            if (fullText.length < 10) throw new Error(obj.error);
                        }
                        if (obj.response) {
                            fullText += obj.response;
                            if (onToken) onToken(obj.response);
                        }
                    } catch (e) { L('[LLM] stream parse error:', e); }
                }
            }
            if (buffer.trim()) {
                try {
                    const obj = JSON.parse(buffer);
                    if (obj.response) {
                        fullText += obj.response;
                        if (onToken) onToken(obj.response);
                    }
                } catch (e) { L('[LLM] stream parse error:', e); }
            }
            return fullText;
        }, opts.timeout || 180000);
    }

    _getLangName(code) {
        var map = {
            ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
            en: 'English', es: 'Spanish', fr: 'French',
            de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian'
        };
        return map[code] || code;
    }

    static get LEVEL_DIFFICULTY_MAP() {
        return {
            'N5': 'beginner (N5)', 'N4': 'advanced beginner (N4)', 'N3': 'intermediate (N3)',
            'N2': 'upper intermediate (N2)', 'N1': 'advanced (N1)',
            'HSK1': 'beginner (HSK 1)', 'HSK2': 'advanced beginner (HSK 2)', 'HSK3': 'intermediate (HSK 3)',
            'HSK4': 'upper intermediate (HSK 4)', 'HSK5': 'advanced (HSK 5)', 'HSK6': 'proficient (HSK 6)',
            'TOPIK1': 'beginner (TOPIK 1)', 'TOPIK2': 'advanced beginner (TOPIK 2)', 'TOPIK3': 'intermediate (TOPIK 3)',
            'TOPIK4': 'upper intermediate (TOPIK 4)', 'TOPIK5': 'advanced (TOPIK 5)', 'TOPIK6': 'proficient (TOPIK 6)',
            'A1': 'beginner (A1)', 'A2': 'elementary (A2)', 'B1': 'intermediate (B1)',
            'B2': 'upper intermediate (B2)', 'C1': 'advanced (C1)', 'C2': 'proficient (C2)'
        };
    }

    static get GRAMMAR_LABEL_PAIRS() {
        return {
            text_dm: ['Send this', 'Sounds wrong'],
            you_decide: ['Say this', 'Too risky'],
            fix_sign: ['Fixed!', 'Leave it'],
            translation_fail: ['Fix it', 'Keep it'],
            culture_check: ['Polite', 'Too blunt'],
            declarative: ['Sounds right', 'Wrong form'],
            interrogative: ['Good question', 'Not quite'],
            imperative: ['Say this', 'Too bossy'],
            exclamative: ['Nice!', 'Odd'],
            operative: ['Sounds right', 'Wrong tone'],
            conditional: ['Makes sense', "Doesn't fit"],
            exhortation: ['Encouraging', 'Too pushy']
        };
    }

    static resolveLabels(type, answer) {
        var pair = LLMService.GRAMMAR_LABEL_PAIRS[type];
        if (!pair) return { labelA: '', labelB: '' };
        var pos = pair[0], neg = pair[1];
        if (answer === 'A') return { labelA: pos, labelB: neg };
        return { labelA: neg, labelB: pos };
    }
}

LLMService.prototype.validator = null;
LLMService.prototype.initValidator = function() {
    this.validator = new LLMResponseValidator(this);
};