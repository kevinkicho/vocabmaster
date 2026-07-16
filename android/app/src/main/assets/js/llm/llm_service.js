/* js/llm/llm_service.js — Core LLMService class
 *
 * Uses a single fixed model (gemma4:31b-cloud). No model detection,
 * no fallback chain. If the model is unavailable, generate() throws
 * with a clear error message.
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
 *   On failure: clears available flag, schedules checkConnection() in 5s.
 *   On success: restores available=true.
 *
 * See docs/architecture.md §1 for full pipeline description.
 */
class LLMService {
    static MODEL = (typeof window !== 'undefined' && window.OLLAMA_MODEL) || 'gemma4:31b-cloud';
    static DEFAULT_PROXY = 'https://ollama-proxy-1020976660084.us-central1.run.app';

    constructor() {
        this.proxyUrl = window.OLLAMA_PROXY_URL || LLMService.DEFAULT_PROXY;
        this._configureTransport();
        this.available = false;
        this.hasModel = false;
        this.cache = new Map();
        this.db = null;
        this._activeRequests = 0;
        this._maxConcurrent = 2;
        this._queue = [];
        this._initDB();
        if (typeof this.initValidator === 'function') this.initValidator();
        L('[LLM] Endpoint:', this.endpoint, '| Proxy:', this.proxyUrl, '| Model:', LLMService.MODEL);

        // Re-check connection when app returns to foreground
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this._ping();
        });
    }

    /** Web+cloud → proxy; APK/local → local endpoint (proxy as fallback on transport fail). Never store client API keys for proxy. */
    _configureTransport() {
        var isBrowser = !window.Capacitor && !window.NativeTTS;
        this.proxyUrl = window.OLLAMA_PROXY_URL || LLMService.DEFAULT_PROXY;
        if (isBrowser && window.OLLAMA_USE_CLOUD === true) {
            this.useProxy = true;
            this.endpoint = this.proxyUrl;
            this.useCloud = true;
            this.apiKey = null; // key stays server-side
        } else {
            this.useProxy = false;
            this.endpoint = window.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
            this.useCloud = false;
            // Local Ollama only — never use client-held cloud keys
            this.apiKey = null;
        }
    }

    async _firebaseIdToken(forceRefresh) {
        try {
            if (typeof auth === 'undefined' || !auth || !auth.currentUser) return null;
            return await auth.currentUser.getIdToken(!!forceRefresh);
        } catch (e) {
            L('[LLM] getIdToken failed:', e && e.message);
            return null;
        }
    }

    async _ping() {
        try {
            await this._ollamaRequest('/api/tags', null, { stream: false, timeout: 3000 });
            L('[LLM] Resume ping OK');
            if (!this.available) {
                L('[LLM] Ping recovered — re-running checkConnection');
                this.checkConnection().catch(function(e) { L('[LLM] checkConnection after ping failed:', e); });
                return true;
            }
            this.available = true;
            if (app && app.ui && app.ui._updateAIStatus) app.ui._updateAIStatus();
            return true;
        } catch (e) {
            L('[LLM] Resume ping failed — connection lost');
            this.available = false;
            if (app && app.ui && app.ui._updateAIStatus) app.ui._updateAIStatus();
            setTimeout(() => {
                if (!this.available) this.checkConnection().catch(() => {});
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
        var forceProxy = !!opts.forceProxy;
        var skipLocalFallback = !!opts.skipLocalFallback;

        try {
            return await this._ollamaRequestOnce(path, payload, {
                stream: stream, timeout: timeout, method: method, signal: signal, forceProxy: forceProxy
            });
        } catch (e) {
            // APK/local: on transport failure, retry once via cloud proxy (key stays server-side)
            var isBrowser = !window.Capacitor && !window.NativeTTS;
            var canFallback = !this.useProxy && !forceProxy && !skipLocalFallback && !isBrowser;
            var msg = (e && e.message) ? e.message : String(e);
            var transportFail = /HTTP 0|timed out|Failed to fetch|NetworkError|status 0|ECONNREFUSED|HTTP 502|HTTP 503/i.test(msg);
            if (canFallback && transportFail && this.proxyUrl) {
                L('[LLM] Local failed — cloud proxy fallback:', msg);
                return await this._ollamaRequestOnce(path, payload, {
                    stream: stream, timeout: timeout, method: method, signal: signal, forceProxy: true
                });
            }
            throw e;
        }
    }

    async _ollamaRequestOnce(path, payload, opts) {
        var stream = opts.stream || false;
        var timeout = opts.timeout || 45000;
        var method = opts.method || null;
        var signal = opts.signal || null;
        var useProxy = opts.forceProxy || this.useProxy;

        var isTags = path === '/api/tags' || path.endsWith('/tags');
        var reqMethod = method || (isTags ? 'GET' : 'POST');
        var reqBody = (isTags || !payload) ? undefined : JSON.stringify(payload);

        var url, headers = { 'Content-Type': 'application/json' };
        var fetchOptions;

        if (useProxy) {
            url = this.proxyUrl || LLMService.DEFAULT_PROXY;
            var token = await this._firebaseIdToken(false);
            var proxyHeaders = { 'Content-Type': 'application/json' };
            if (token) proxyHeaders['Authorization'] = 'Bearer ' + token;
            fetchOptions = {
                method: 'POST',
                headers: proxyHeaders,
                body: JSON.stringify({
                    path: path,
                    method: reqMethod,
                    body: payload
                }),
                timeout: timeout
            };
        } else {
            url = this.endpoint + path;
            fetchOptions = {
                method: reqMethod,
                headers: headers,
                body: reqBody,
                timeout: timeout
            };
        }

        const controller = new AbortController();
        var timeoutTriggered = false;
        const timeoutId = setTimeout(() => {
            timeoutTriggered = true;
            controller.abort();
        }, timeout);
        if (signal) {
            signal.addEventListener('abort', () => { clearTimeout(timeoutId); controller.abort(); });
        }
        var resp;

        try {
            resp = await this._fetch(url, Object.assign({}, fetchOptions, { signal: controller.signal }));
        } catch (e) {
            if (timeoutTriggered) {
                throw new Error('Request timed out after ' + timeout + 'ms');
            }
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }

        // One token refresh on 401 when using proxy
        if (useProxy && resp && resp.status === 401) {
            var token2 = await this._firebaseIdToken(true);
            if (token2) {
                fetchOptions.headers['Authorization'] = 'Bearer ' + token2;
                resp = await this._fetch(url, Object.assign({}, fetchOptions));
            }
        }

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            L('[LLM] HTTP error', resp.status, 'for', url, 'body:', errText.slice(0, 300));
            if (resp.status === 429) {
                throw new Error('Too many AI requests — please wait a moment');
            }
            throw new Error('Ollama HTTP ' + resp.status + ' ' + errText.slice(0, 200));
        }

        if (stream) {
            return resp;
        }
        return resp.json();
    }

    loadPrefs() {
        this._configureTransport();
    }

    async autoDetect() {
        L('[LLM] checkConnection endpoint:', this.endpoint);
        var ok = await this.checkConnection();
        if (ok) {
            L('[LLM] Ready — model:', LLMService.MODEL);
        } else {
            L('[LLM] Connection failed');
        }
        if (app && app.ui) app.ui.renderAISettings();
        if (app && app.ui && app.ui._updateAIStatus) app.ui._updateAIStatus();
    }

    async checkConnection() {
        try {
            await this._ollamaRequest('/api/tags', null, { stream: false, timeout: 10000 });
            this.available = true;
            this.hasModel = true;
            L('[LLM] Connected —', this.endpoint);
            return true;
        } catch (e) {
            L('[LLM] Connection failed for', this.endpoint, ':', e.message || e);
            this.available = false;
            this.hasModel = false;
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
        if (!this.available) {
            throw new Error('AI is offline — check your Ollama server or cloud proxy connection');
        }

        const body = {
            model: LLMService.MODEL,
            prompt: opts.prompt,
            stream: false
        };
        if (opts.system) body.system = opts.system;
        if (opts.options) body.options = opts.options;

        L('[LLM] generate →', this.endpoint, 'model=' + LLMService.MODEL);

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

        if (!this.available) {
            throw new Error('AI is offline — check your Ollama server or cloud proxy connection');
        }

        const body = {
            model: LLMService.MODEL,
            prompt: opts.prompt,
            stream: true
        };
        if (opts.system) body.system = opts.system;
        if (opts.options) body.options = opts.options;

        L('[LLM] streamGenerate →', this.endpoint, 'model=' + LLMService.MODEL);

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
                            L('[LLM] stream error from backend:', obj.error);
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