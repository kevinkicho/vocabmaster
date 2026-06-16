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
 *   On failure: clears available+hasModel flags, schedules autoDetect() in 5s.
 *   On success: restores available=true.
 *
 * See docs/architecture.md §1 for full pipeline description.
 */
class LLMService {
    constructor() {
        this.endpoint = 'http://127.0.0.1:11434';
        this.useCloud = false;
        this.apiKey = null;
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
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                this._ping();
            }
        }.bind(this));
    }

async _ping() {
        try {
            await this._ollamaRequest('/api/tags', null, { stream: false, timeout: 3000 });
            L('[LLM] Resume ping OK');
            this.available = true;
            return true;
        } catch (e) {
            L('[LLM] Resume ping failed — connection lost');
            this.available = false;
            this.hasModel = false;
            setTimeout(function() {
                if (!this.available) this.autoDetect().catch(function() {});
            }.bind(this), 5000);
            return false;
        }
    }

    _pickBestLocalModel() {
        var cands = this.availableModels || [];
        var preferred = 'gemma4:31b-cloud';
        var found = cands.find(function(m) { return m.toLowerCase() === preferred; });
        if (found) return found;
        if (cands.length === 0) return preferred;
        if (this.resolvedModel && this.resolvedModel === preferred) return preferred;
        var localCands = cands.filter(function(m) { return !m.toLowerCase().includes('cloud') && !m.includes('ollama.com'); });
        if (localCands.length > 0) {
            var prefOrder = ['gemma2:27b', 'llama3.1:70b', 'mistral-nemo:12b'];
            for (var i = 0; i < prefOrder.length; i++) {
                var match = localCands.find(function(m) { return m.toLowerCase() === prefOrder[i]; });
                if (match) return match;
            }
            return localCands[0];
        }
        return cands[0];
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
                    json: async function() { return JSON.parse(result.data); },
                    text: async function() { return result.data; }
                };
            } catch (e) {
                L('[LLM] Capacitor proxy failed, falling back to fetch:', e.message);
            }
        }
        return fetch(url, options);
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

        var url = this.endpoint + path;
        var headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = 'Bearer ' + this.apiKey;
        var fetchOptions = {
            method: reqMethod,
            headers: headers,
            body: reqBody,
            timeout: timeout
        };

        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, timeout);
        if (signal) {
            signal.addEventListener('abort', function() { clearTimeout(timeoutId); controller.abort(); });
        }
        var resp;

        try {
            resp = await this._fetch(url, Object.assign({}, fetchOptions, { signal: controller.signal }));
        } finally {
            clearTimeout(timeoutId);
        }

        if (!resp.ok) {
            var errText = await resp.text().catch(function() { return ''; });
            L('[LLM] HTTP error', resp.status, 'for', url, 'body:', errText.slice(0, 300));
            throw new Error('Ollama HTTP ' + resp.status + ' ' + errText.slice(0, 200));
        }

        if (stream) {
            return resp;
        }
        return resp.json();
    }

    loadPrefs() {
        this.endpoint = 'http://127.0.0.1:11434';
        this.useCloud = false;
        this.apiKey = null;
        var p = (typeof app !== 'undefined' && app && app.store && app.store.prefs) ? app.store.prefs : {};
        this.model = p.llmModel || '';
    }

    async autoDetect() {
        L('[LLM] autoDetect endpoint:', this.endpoint);

        var ok = await this.checkConnection();
        L('[LLM] checkConnection result:', ok, 'models:', JSON.stringify(this.availableModels));

        var preferred = 'gemma4:31b-cloud';
        var inTags = this.availableModels.some(function(m) { return m.toLowerCase() === preferred; });

        if (ok && this.availableModels.length > 0) {
            if (inTags) {
                this.resolvedModel = preferred;
                this.hasModel = true;
                L('[LLM] Found', preferred, 'in tags');
            } else {
                L('[LLM]', preferred, 'not in tags — probing directly...');
                try {
                    var resp = await this._ollamaRequest('/api/generate', {
                        model: preferred,
                        prompt: 'Say ok',
                        stream: false
                    }, { stream: false, timeout: 10000 });
                    if (resp && resp.response) {
                        this.resolvedModel = preferred;
                        this.hasModel = true;
                        L('[LLM]', preferred, 'responds — using it');
                    } else {
                        throw new Error('empty response');
                    }
                } catch (e) {
                    L('[LLM]', preferred, 'not reachable, falling back to local model');
                    this.resolvedModel = this._pickBestLocalModel();
                    this.hasModel = true;
                }
            }
            L('[LLM] Ready with model:', this.resolvedModel);
            this._showAIWelcome();
            if (app && app.ui) app.ui.renderAISettings();
            if (app && !app.game) app.goHome(false);
        } else {
            L('[LLM] No models available');
        }
    }

    async checkConnection() {
        try {
            var data = await this._ollamaRequest('/api/tags', null, { stream: false, timeout: 10000 });
            this.available = true;
            this.availableModels = (data.models || []).map(function(m) { return m.name || m.model || m; });
            L('[LLM] Connected —', this.availableModels.length, 'models');
            return true;
        } catch (e) {
            L('[LLM] Connection failed for endpoint', this.endpoint, 'useCloud', this.useCloud, ':', e.message || e, 'stack:', e.stack);
            this.available = false;
            return false;
        }
    }

    _enqueue(fn) {
        if (this._queue.length >= 50) {
            return Promise.reject(new Error('LLM queue full (50 queued), try again later'));
        }
        return new Promise(function(resolve, reject) {
            this._queue.push({ fn: fn, resolve: resolve, reject: reject });
            this._processQueue();
        }.bind(this));
    }

    _processQueue() {
        while (this._activeRequests < this._maxConcurrent && this._queue.length > 0) {
            var item = this._queue.shift();
            this._activeRequests++;
            item.fn().then(function(result) {
                item.resolve(result);
                this._activeRequests--;
                this._processQueue();
            }.bind(this), function(err) {
                item.reject(err);
                this._activeRequests--;
                this._processQueue();
            }.bind(this));
        }
    }

    async generate(opts) {
        var model = this.resolvedModel || this.model;
        if (!model && this.availableModels && this.availableModels.length > 0) {
            model = this._pickBestLocalModel();
            this.resolvedModel = model;
        }

        var body = {
            model: model || 'gemma4:31b-cloud',
            prompt: opts.prompt,
            stream: false
        };
        if (opts.system) body.system = opts.system;
        if (opts.options) body.options = opts.options;

        L('[LLM] generate sending to', this.endpoint, 'model=', body.model, 'resolvedModel=', this.resolvedModel);

        return this._enqueue(async function() {
            try {
                var data = await this._ollamaRequest('/api/generate', body, {
                    stream: false,
                    timeout: opts.timeout || 45000,
                    signal: opts.signal
                });
                return data.response || '';
            } catch (err) {
                L('[LLM] Ollama generate failed:', err.message);
                throw err;
            }
        }.bind(this));
    }

    async streamGenerate(opts, onToken) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HttpProxy) {
            L('[LLM] Capacitor HttpProxy detected, falling back to non-streaming generate to avoid crashes.');
            var fullText = await this.generate(opts);
            if (onToken) onToken(fullText);
            return;
        }

        var model = this.resolvedModel || this.model;
        if (!model && this.availableModels && this.availableModels.length > 0) {
            model = this._pickBestLocalModel();
            this.resolvedModel = model;
        }

        var body = {
            model: model || 'gemma4:31b-cloud',
            prompt: opts.prompt,
            stream: true
        };
        if (opts.system) body.system = opts.system;
        if (opts.options) body.options = opts.options;

        L('[LLM] streamGenerate sending to', this.endpoint, 'model=', body.model, 'resolvedModel=', this.resolvedModel);

        return this._enqueue(async function() {
            var resp;
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

            var reader = resp.body.getReader();
            var decoder = new TextDecoder();
            var fullText = '';
            var buffer = '';

            while (true) {
                var result = await reader.read();
                if (result.done) break;
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop();
                for (var j = 0; j < lines.length; j++) {
                    var line = lines[j];
                    if (!line.trim()) continue;
                    try {
                        var obj = JSON.parse(line);
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
                    var obj = JSON.parse(buffer);
                    if (obj.response) {
                        fullText += obj.response;
                        if (onToken) onToken(obj.response);
                    }
                } catch (e) { L('[LLM] stream parse error:', e); }
            }
            return fullText;
        }.bind(this));
    }

    _showToast(msg, icon, iconColor) {
        var toast = document.createElement('div');
        toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-[96] bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold opacity-0 transition-opacity duration-300';
        toast.innerHTML = '<i class="ph-bold ' + (icon || 'ph-info') + ' ' + (iconColor || 'text-white') + '"></i> ' + escapeHtml(msg);
        document.body.appendChild(toast);
        requestAnimationFrame(function() { toast.style.opacity = '1'; });
        setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 300); }, 3000);
    }

    _showAIWelcome() {
        var label = this.useCloud ? this.resolvedModel : 'local (ollama4android)';
        this._showToast('AI enabled — ' + label, 'ph-check-circle', 'text-emerald-500');
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