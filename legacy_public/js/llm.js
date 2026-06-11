/* js/llm.js */
class LLMService {
    constructor() {
        // Support local Ollama (e.g. ollama4android on http://127.0.0.1:11434) or cloud.
        // Set in ollama_config.js:
        //   window.OLLAMA_ENDPOINT = "http://127.0.0.1:11434";   // for local on-device
        //   window.OLLAMA_USE_CLOUD = false;
        // or for cloud:
        //   window.OLLAMA_USE_CLOUD = true; window.OLLAMA_API_KEY = "...";
        const explicitEndpoint = (typeof window !== 'undefined') ? window.OLLAMA_ENDPOINT : null;
        this.useCloud = !explicitEndpoint && !!(typeof window !== 'undefined' && window.OLLAMA_USE_CLOUD && window.OLLAMA_API_KEY);
        this.endpoint = explicitEndpoint || (this.useCloud ? (window.OLLAMA_CLOUD_ENDPOINT || 'https://api.ollama.com') : 'http://127.0.0.1:11434');
        // On Android APK (with native TTS bridge), strongly prefer local ollama4android on 11434
        // so we don't accidentally hit cloud or require model selection in the app.
        if (!explicitEndpoint && (window.NativeTTS || window.Capacitor) && !this.useCloud) {
            this.endpoint = 'http://127.0.0.1:11434';
            this.useCloud = false;
        }
        this.apiKey = this.useCloud ? window.OLLAMA_API_KEY : null;
        this.model = '';
        this.available = false;
        this.availableModels = [];
        this.hasModel = false;
        this.useDirectHTTP = true;
        this.useNativeBridge = false;
        this.isWebOrigin = (typeof location !== 'undefined' && location.protocol === 'https:' && location.hostname !== 'localhost');
        this.proxyUrl = (typeof window !== 'undefined' && (window.OLLAMA_PROXY_URL || window.OLLAMA_CLOUD_PROXY_URL))
            || 'https://us-central1-vocabmaster112225.cloudfunctions.net/ollamaProxy'; // default for this project — override via window.OLLAMA_PROXY_URL if region differs
        this.cache = new Map();
        this.db = null;
        this._queue = Promise.resolve();
        this._initDB();
        if (typeof this.initValidator === 'function') this.initValidator();
        L('[LLM] Endpoint configured:', this.endpoint, this.useCloud ? '(cloud)' : '(local)');
    }

    _getLocalCandidates() {
        const all = this.availableModels || [];
        if (this.useCloud) return all;
        // When forcing local (ollama4android on 11434), skip any cloud-proxied models
        // that ollama4android may advertise (they require subscription on their cloud).
        return all.filter(m => {
            const s = String(m || '').toLowerCase();
            return !s.includes('cloud') && !s.includes('ollama.com');
        });
    }

    _pickBestLocalModel() {
        const cands = this._getLocalCandidates();
        if (cands.length === 0) return null;
        // Prefer known-good local models that are likely to be actually loaded and runnable locally in ollama4android.
        const preferred = ['gemma2:27b', 'gemma2:9b', 'llama3.1:70b', 'llama3.1:8b', 'mistral-nemo:12b', 'qwen2.5', 'gemma'];
        for (const p of preferred) {
            const found = cands.find(m => m.toLowerCase().includes(p.toLowerCase()));
            if (found) return found;
        }
        return cands[0];
    }

    _getSafeLocalModel() {
        // Always return a safe non-cloud model name for local ollama4android requests.
        // Prefer gemma2:27b (common in ollama4android local setups), fall back to first local cand or 'gemma'.
        const cands = this._getLocalCandidates();
        const preferred = ['gemma2:27b', 'gemma2:9b', 'llama3.1:8b', 'gemma'];
        for (const p of preferred) {
            const found = cands.find(m => m.toLowerCase().includes(p.toLowerCase()));
            if (found) return found;
        }
        return cands[0] || 'gemma';
    }

    // Native HTTP proxy — bypasses CORS in Capacitor WebView
    async _fetch(url, options = {}) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HttpProxy) {
            try {
                const proxy = window.Capacitor.Plugins.HttpProxy;
                const result = await proxy.request({
                    url,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body || null,
                    connectTimeout: 15000,
                    readTimeout: 60000
                });
                return {
                    ok: result.ok,
                    status: result.status,
                    json: async () => JSON.parse(result.data),
                    text: async () => result.data
                };
            } catch (e) {
                L('[LLM] HttpProxy failed:', e.message);
            }
        }
        // WebView or browser: use native fetch (works for HTTPS in WebView)
        return fetch(url, options);
    }

    _isBrowserWeb() {
        if (typeof window === 'undefined') return false;
        if (window.NativeTTS || window.Capacitor) return false; // native bridge wins (Android)
        const host = (typeof location !== 'undefined') ? location.hostname : '';
        return location.protocol === 'https:' && host !== 'localhost' && host !== '127.0.0.1';
    }

    /**
     * Unified Ollama call that routes through Firebase proxy on pure web
     * (for full AI parity between web and Android).
     */
    async _ollamaRequest(path, payload, { stream = false, timeout = 45000, method = null } = {}) {
        const useProxy = this._isBrowserWeb() && this.proxyUrl;

        // For local Ollama, /api/tags must be GET (no body). Cloud/proxy paths stay POST-wrapped.
        const isTags = path === '/api/tags' || path.endsWith('/tags');
        const reqMethod = method || (isTags ? 'GET' : 'POST');
        const reqBody = (isTags || !payload) ? undefined : JSON.stringify(payload);

        let url, fetchOptions;

        if (useProxy) {
            // Route via our Cloud Function to bypass CORS
            url = this.proxyUrl;
            fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path,
                    method: reqMethod,
                    headers: this.apiKey ? { 'Authorization': 'Bearer ' + this.apiKey } : {},
                    body: payload
                })
            };
        } else {
            url = this.endpoint + path;
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiKey) headers['Authorization'] = 'Bearer ' + this.apiKey;
            fetchOptions = {
                method: reqMethod,
                headers,
                body: reqBody
            };
        }

        const resp = await this._fetch(url, {
            ...fetchOptions,
            signal: AbortSignal.timeout(timeout)
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            L('[LLM] HTTP error', resp.status, 'for', url, 'body:', errText.slice(0,300));
            throw new Error('Ollama HTTP ' + resp.status + ' ' + errText.slice(0, 200));
        }

        if (stream) {
            // Return the raw response so caller can stream NDJSON
            return resp;
        }
        return resp.json();
    }


    // --- Preferences ---
    loadPrefs() {
        const p = app.store.prefs;
        // Respect explicit OLLAMA_ENDPOINT for local (ollama4android etc.)
        const explicitEndpoint = (typeof window !== 'undefined') ? window.OLLAMA_ENDPOINT : null;
        this.endpoint = explicitEndpoint || window.OLLAMA_CLOUD_ENDPOINT || (window.OLLAMA_USE_CLOUD ? 'https://api.ollama.com' : 'http://127.0.0.1:11434');
        this.useCloud = !explicitEndpoint && !!(window.OLLAMA_USE_CLOUD && window.OLLAMA_API_KEY);
        this.apiKey = this.useCloud ? window.OLLAMA_API_KEY : null;
        // On Android APK, force local
        if (!explicitEndpoint && (window.NativeTTS || window.Capacitor) && !this.useCloud) {
            this.endpoint = 'http://127.0.0.1:11434';
            this.useCloud = false;
        }
        this.model = p.llmModel || '';
        // Only force cloud free-tier models if using cloud and no explicit model
        if (this.useCloud && (!p.llmModel || !['gemma4:31b', 'gemma3:4b', 'gemma3:12b', 'gemma3:27b', 'gemma3:1b'].includes(p.llmModel))) {
            this.model = '';
        }
    }

    // --- Auto-detect: always probe on startup ---
    async autoDetect() {
        L('[LLM] autoDetect for', this.useCloud ? 'Cloud' : 'Local', 'endpoint:', this.endpoint);

        const ok = await this.checkConnection();
        L('[LLM] checkConnection result:', ok, 'models:', JSON.stringify(this.availableModels));
        if (ok && this.availableModels.length > 0) {
            const norm = (n) => (n || '').replace(/[:\-_]/g, '').toLowerCase();
            let chosen = null;

            if (this.useCloud) {
                // Cloud: prefer free tier models
                const FREE_TIER = ['gemma4:31b', 'gemma3:4b', 'gemma3:12b', 'gemma3:27b', 'gemma3:1b'];
                if (this.model) {
                    const wanted = norm(this.model);
                    chosen = this.availableModels.find(m => norm(m) === wanted && FREE_TIER.some(ft => norm(ft) === norm(m)));
                }
                if (!chosen) {
                    for (const ft of FREE_TIER) {
                        chosen = this.availableModels.find(m => norm(m).includes(norm(ft)));
                        if (chosen) break;
                    }
                }
            } else {
                // Local (e.g. ollama4android): prefer known good local models, skip cloud.
                if (this.model) {
                    const c = this._getLocalCandidates();
                    chosen = c.find(m => norm(m) === norm(this.model));
                }
                if (!chosen) chosen = this._pickBestLocalModel();
            }
            if (!chosen) {
                chosen = this._getSafeLocalModel();
            }

            // Defensive: never allow a cloud model to be resolved in local mode
            if (chosen && !this.useCloud && /cloud|ollama\.com/i.test(String(chosen))) {
                chosen = this._getSafeLocalModel();
            }

            this.resolvedModel = chosen;
            this.hasModel = true;
            L('[LLM] Ready with model:', this.resolvedModel);
            if (!this.useCloud) {
                L('[LLM] Local mode - filtered non-cloud candidates:', this._getLocalCandidates());
            }
            this._showAIWelcome();
            if (app && app.ui) app.ui.renderAISettings();
            if (app && !app.game) app.goHome(false);
        } else {
            L('[LLM] No models available');
        }
    }

    // --- Connection ---
    async checkConnection() {
        try {
            const data = await this._ollamaRequest('/api/tags', null, { stream: false, timeout: 10000 });
            this.available = true;
            this.availableModels = (data.models || []).map(m => m.name || m.model || m);
            L('[LLM] Connected —', this.availableModels.length, 'models');
            return true;
        } catch (e) {
            L('[LLM] Connection failed for endpoint', this.endpoint, 'useCloud', this.useCloud, ':', e.message || e, 'stack:', e.stack);
            this.available = false;
            if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});
            return false;
        }
    }

    // --- Request queue (serialize API calls) ---
    _enqueue(fn) {
        this._queue = this._queue.then(fn, fn);
        return this._queue;
    }

    // --- Non-streaming generation (direct HTTP preferred) ---
    async generate(opts) {
        let model = this.resolvedModel || this.model;
        
        // For local (ollama4android etc.), respect the model chosen by user in ollama4android or first available.
        // Only force cloud free-tier when using cloud and no suitable model yet.
        if (this.useCloud) {
            const FREE_TIER = ['gemma4:31b', 'gemma3:4b', 'gemma3:12b', 'gemma3:27b', 'gemma3:1b'];
            const norm = (n) => (n || '').replace(/[:\-_]/g, '').toLowerCase();
            if (!model || !FREE_TIER.some(ft => norm(ft) === norm(model))) {
                const available = this.availableModels || [];
                model = available.find(m => FREE_TIER.some(ft => norm(ft) === norm(m))) || FREE_TIER[0];
                this.resolvedModel = model;
            }
        } else if (!model && this.availableModels && this.availableModels.length > 0) {
            // Local: prefer known good local model (user manages in ollama4android)
            model = this._getSafeLocalModel();
            this.resolvedModel = model;
        }

        if (!this.useCloud) {
            // Force a safe local model name for the actual request body. This prevents ollama4android from seeing a cloud name and proxying.
            model = this._getSafeLocalModel();
        }
        
        const body = {
            model: model || 'gemma', // last resort fallback
            prompt: opts.prompt,
            stream: false,
            ...(opts.system && { system: opts.system }),
            ...(opts.options && { options: opts.options })
        };

        L('[LLM] generate sending to', this.endpoint, 'model=', body.model, 'useCloud=', this.useCloud);

        return this._enqueue(async () => {
            const data = await this._ollamaRequest('/api/generate', body, {
                stream: false,
                timeout: opts.timeout || 45000
            });
            return data.response || '';
        });
    }

    // --- Streaming generation (for Story mode) ---
    async streamGenerate(opts, onToken) {
        let model = this.resolvedModel || this.model;
        
        if (this.useCloud) {
            const FREE_TIER = ['gemma4:31b', 'gemma3:4b', 'gemma3:12b', 'gemma3:27b', 'gemma3:1b'];
            const norm = (n) => (n || '').replace(/[:\-_]/g, '').toLowerCase();
            if (!model || !FREE_TIER.some(ft => norm(ft) === norm(model))) {
                model = FREE_TIER[0];
                this.resolvedModel = model;
            }
        } else if (!model && this.availableModels && this.availableModels.length > 0) {
            // Local ollama4android: prefer known good local model (user selects inside ollama4android)
            model = this._getSafeLocalModel();
            this.resolvedModel = model;
        }

        if (!this.useCloud) {
            // Force a safe local model name for the actual request body. This prevents ollama4android from seeing a cloud name and proxying.
            model = this._getSafeLocalModel();
        }

        const body = {
            model: model || 'gemma',
            prompt: opts.prompt,
            stream: true,
            ...(opts.system && { system: opts.system }),
            ...(opts.options && { options: opts.options })
        };

        L('[LLM] streamGenerate sending to', this.endpoint, 'model=', body.model, 'useCloud=', this.useCloud);

        return this._enqueue(async () => {
            const resp = await this._ollamaRequest('/api/generate', body, {
                stream: true,
                timeout: opts.timeout || 180000
            });
            if (!resp.ok) {
                L('[LLM] streamGenerate HTTP error', resp.status);
                throw new Error('HTTP ' + resp.status);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const obj = JSON.parse(line);
                        if (obj.error) {
                            L('[LLM] stream error from backend for model', this.resolvedModel || model, ':', obj.error);
                        }
                        if (obj.response) {
                            fullText += obj.response;
                            if (onToken) onToken(obj.response);
                        }
                    } catch (e) { L('[LLM] stream parse error:', e); /* skip */ }
                }
            }
            if (buffer.trim()) {
                try {
                    const obj = JSON.parse(buffer);
                    if (obj.response) {
                        fullText += obj.response;
                        if (onToken) onToken(obj.response);
                    }
                } catch (e) { L('[LLM] stream parse error:', e); /* skip */ }
            }
            return fullText;
        });
    }

    // --- AI Welcome / Guided Tour ---
    _showToast(msg, icon, iconColor) {
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-[96] bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold opacity-0 transition-opacity duration-300';
        toast.innerHTML = `<i class="ph-bold ${icon || 'ph-info'} ${iconColor || 'text-white'}"></i> ${escapeHtml(msg)}`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; });
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    _showAIWelcome() {
        if (localStorage.getItem('vm_ai_welcomed')) {
            const label = this.useCloud ? this.resolvedModel : 'local (ollama4android)';
            this._showToast(`AI enabled — ${label}`, 'ph-check-circle', 'text-emerald-500');
            return;
        }

        const modelName = this.resolvedModel || this.model;
        const isLocal = !this.useCloud;
        const poweredBy = isLocal ? 'Local AI (ollama4android)' : `Cloud (${escapeHtml(modelName)})`;

        const el = document.createElement('div');
        el.id = 'ai-welcome';
        el.className = 'fixed inset-0 z-[95] flex items-center justify-center p-4';
        el.innerHTML = `
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="document.getElementById('ai-welcome').remove()"></div>
            <div class="relative surface-primary rounded-3xl shadow-2xl w-full max-w-sm overflow-y-auto max-h-[85vh] transform transition-all duration-300 scale-95 opacity-0" id="ai-welcome-inner">

                <!-- Header gradient -->
                <div class="bg-gradient-to-br from-cyan-500 via-indigo-500 to-purple-500 p-5 text-center">
                    <div class="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-2 shadow-lg">
                        <i class="ph-duotone ph-brain text-3xl text-white"></i>
                    </div>
                    <h2 class="text-lg font-black text-on-color">AI Enabled</h2>
                    <p class="text-xs text-white/80 mt-1">${poweredBy}</p>
                </div>

                <div class="p-4 space-y-3">

                    <!-- Feature: Smart Cloze -->
                    <div class="flex items-start gap-3">
                        <div class="shrink-0 w-7 h-7 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                            <i class="ph-bold ph-text-aa text-cyan-500"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-primary">Smart Cloze</p>
                            <p class="text-[10px] text-secondary mt-0.5">AI identifies conjugated words in sentences for accurate fill-in-the-blank.</p>
                        </div>
                    </div>

                    <!-- Privacy note -->
                    <div class="surface-secondary rounded-xl p-2 flex items-start gap-2">
                        <i class="ph-bold ph-shield-check text-xs text-muted mt-0.5 shrink-0"></i>
                        <p class="text-[10px] text-muted">AI via configured endpoint (local 11434 or cloud). See ollama_config.js.</p>
                    </div>
                </div>

                <!-- CTA -->
                <div class="px-4 pb-4">
                    <button id="ai-welcome-ok" class="w-full py-2.5 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">
                        Got it, let's go!
                    </button>
                </div>
            </div>`;

        document.body.appendChild(el);

        document.getElementById('ai-welcome-ok').onclick = () => {
            localStorage.setItem('vm_ai_welcomed', '1');
            const inner = document.getElementById('ai-welcome-inner');
            if (inner) { inner.style.scale = '0.95'; inner.style.opacity = '0'; }
            el.querySelector('.bg-black\\/40').style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        };

        // Animate in
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const inner = document.getElementById('ai-welcome-inner');
            if (inner) { inner.style.scale = '1'; inner.style.opacity = '1'; }
        }));
    }

    static LEVEL_DIFFICULTY_MAP = {
        'N5': 'beginner (N5)', 'N4': 'advanced beginner (N4)', 'N3': 'intermediate (N3)',
        'N2': 'upper intermediate (N2)', 'N1': 'advanced (N1)',
        'HSK1': 'beginner (HSK 1)', 'HSK2': 'advanced beginner (HSK 2)', 'HSK3': 'intermediate (HSK 3)',
        'HSK4': 'upper intermediate (HSK 4)', 'HSK5': 'advanced (HSK 5)', 'HSK6': 'proficient (HSK 6)',
        'TOPIK1': 'beginner (TOPIK 1)', 'TOPIK2': 'advanced beginner (TOPIK 2)', 'TOPIK3': 'intermediate (TOPIK 3)',
        'TOPIK4': 'upper intermediate (TOPIK 4)', 'TOPIK5': 'advanced (TOPIK 5)', 'TOPIK6': 'proficient (TOPIK 6)',
        'A1': 'beginner (A1)', 'A2': 'elementary (A2)', 'B1': 'intermediate (B1)',
        'B2': 'upper intermediate (B2)', 'C1': 'advanced (C1)', 'C2': 'proficient (C2)'
    };


    // --- Helpers ---
    _getLangName(code) {
        const map = {
            ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
            en: 'English', es: 'Spanish', fr: 'French',
            de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian'
        };
        return map[code] || code;
    }
}
