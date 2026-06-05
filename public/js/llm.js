/* js/llm.js */
class LLMService {
    constructor() {
        this.endpoint = 'http://localhost:11434';
        this.model = 'gemma3:1b';
        this.available = false;
        this.availableModels = [];
        this.hasModel = false;
        this.cache = new Map();
        this.db = null;
        this.useNativeBridge = typeof AndroidBridge !== 'undefined' && AndroidBridge.isAvailable();
        this.useDirectHTTP = false; // set true after first successful direct fetch
        this._queue = Promise.resolve(); // serialize all LLM calls
        this._initDB();
        if (this.useNativeBridge) {
            L('[LLM] Android native bridge detected');
        }
    }

    // --- IndexedDB Cache ---
    _initDB() {
        try {
            const req = indexedDB.open('vocabmaster_llm', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('cloze_cache')) {
                    db.createObjectStore('cloze_cache');
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; };
            req.onerror = () => { L('[LLM] IndexedDB init failed'); };
        } catch (e) {
            L('[LLM] IndexedDB not available');
        }
    }

    _cacheKey(sentence, target, lang) {
        return `${sentence}|||${target}|||${lang}`;
    }

    async getFromCache(sentence, target, lang) {
        const key = this._cacheKey(sentence, target, lang);
        if (this.cache.has(key)) return this.cache.get(key);
        if (!this.db) return null;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('cloze_cache', 'readonly');
                const store = tx.objectStore('cloze_cache');
                const req = store.get(key);
                req.onsuccess = () => {
                    const val = req.result;
                    if (val) this.cache.set(key, val.match);
                    resolve(val ? val.match : null);
                };
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
    }

    async setCache(sentence, target, lang, match) {
        const key = this._cacheKey(sentence, target, lang);
        this.cache.set(key, match);
        if (!this.db) return;
        try {
            const tx = this.db.transaction('cloze_cache', 'readwrite');
            const store = tx.objectStore('cloze_cache');
            store.put({ match, ts: Date.now() }, key);
        } catch (e) { L('[LLM] Cache write failed:', e); }
    }

    async clearCache() {
        this.cache.clear();
        if (!this.db) return;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('cloze_cache', 'readwrite');
                const store = tx.objectStore('cloze_cache');
                store.clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch { resolve(); }
        });
    }

    async getCacheCount() {
        if (!this.db) return this.cache.size;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('cloze_cache', 'readonly');
                const store = tx.objectStore('cloze_cache');
                const req = store.count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(this.cache.size);
            } catch { resolve(this.cache.size); }
        });
    }

    // --- Preferences ---
    loadPrefs() {
        const p = app.store.prefs;
        this.endpoint = (p.llmEndpoint || 'http://localhost:11434').replace(/\/+$/, '');
        this.model = p.llmModel || 'gemma3:1b';
    }

    // --- Auto-detect: always probe on startup ---
    async autoDetect() {
        L('[LLM] autoDetect start, useNativeBridge:', this.useNativeBridge);

        // If running in Android, check for saved port or prompt user
        if (this.useNativeBridge) {
            const savedPort = localStorage.getItem('vm_ollama_port');
            if (savedPort) {
                try {
                    const port = parseInt(savedPort);
                    L('[LLM] Trying saved port:', port);
                    const data = await AndroidBridge.connectToPort(port);
                    this.endpoint = `http://localhost:${port}`;
                    AndroidBridge.setPort(port);
                    L('[LLM] Connected to saved port:', port);
                } catch (e) {
                    L('[LLM] Saved port failed:', e.message);
                    localStorage.removeItem('vm_ollama_port');
                    this._showPortPrompt();
                    return;
                }
            } else {
                this._showPortPrompt();
                return;
            }
        }

        const ok = await this.checkConnection();
        L('[LLM] checkConnection result:', ok, 'models:', JSON.stringify(this.availableModels));
        if (ok) {
            // Use preferred model if available, otherwise use first available model
            const wanted = this.model.replace(/[:\-_]/g, '').toLowerCase();
            const preferredMatch = this.availableModels.find(m => (m || '').replace(/[:\-_]/g, '').toLowerCase().includes(wanted));
            this.resolvedModel = preferredMatch || this.availableModels[0] || null;
            this.hasModel = !!this.resolvedModel;
            L('[LLM] hasModel:', this.hasModel, 'resolvedModel:', this.resolvedModel, '(preferred was:', this.model + ')');
            if (this.hasModel) {
                L('[LLM] Ready with model:', this.resolvedModel);
                this._showAIWelcome();
                this.warmup();
                // Refresh home menu so the AI section appears
                if (app && !app.game) app.goHome(false);
            } else {
                L('[LLM] Ollama running but no models loaded');
                this._showModelPrompt();
            }
        } else {
            // Not detected — show setup prompt (once, unless dismissed)
            const dismissed = localStorage.getItem('vm_llm_dismissed');
            if (!dismissed) {
                this._showSetupPrompt();
            }
        }
    }

    // --- Connection ---
    async checkConnection() {
        try {
            let data;
            // Always try direct HTTP first — faster, no bridge overhead
            try {
                const resp = await fetch(this.endpoint + '/api/tags', {
                    signal: AbortSignal.timeout(3000)
                });
                if (resp.ok) {
                    data = await resp.json();
                    this.useDirectHTTP = true;
                    L('[LLM] Direct HTTP connection OK');
                }
            } catch (e) {
                L('[LLM] Direct HTTP failed, trying bridge...', e.message);
            }

            // Fall back to Android bridge if direct HTTP failed
            if (!data && this.useNativeBridge) {
                data = await AndroidBridge.checkStatus();
            }

            if (!data) { this.available = false; return false; }
            this.available = true;
            L('[LLM] Raw tags response:', JSON.stringify(data));
            this.availableModels = (data.models || []).map(m => m.name || m.model || m);
            L('[LLM] Connected. Models:', this.availableModels, 'directHTTP:', this.useDirectHTTP);
            return true;
        } catch (e) {
            this.available = false;
            return false;
        }
    }

    // --- Request queue (serialize — ollama4android handles one at a time) ---
    _enqueue(fn) {
        this._queue = this._queue.then(fn, fn);
        return this._queue;
    }

    // --- Warmup ---
    async warmup() {
        if (!this.available) return;
        // Skip warmup if no direct HTTP and on Android — save the slot for real work
        if (!this.useDirectHTTP && this.useNativeBridge) {
            L('[LLM] Skipping warmup (bridge-only mode)');
            return;
        }
        try {
            await this.generate({
                prompt: 'Hi',
                options: { num_predict: 1 },
                timeout: 30000
            });
            L('[LLM] Model warmed up');
        } catch (e) {
            L('[LLM] Warmup failed:', e.message);
        }
    }

    // --- Streaming generation (direct HTTP with ReadableStream) ---
    async streamGenerate(opts, onToken) {
        const model = this.resolvedModel || this.model;
        const body = {
            model,
            prompt: opts.prompt,
            stream: true,
            ...(opts.system && { system: opts.system }),
            ...(opts.options && { options: opts.options })
        };

        // Try direct HTTP streaming first
        if (this.useDirectHTTP || !this.useNativeBridge) {
            return this._enqueue(async () => {
                const resp = await fetch(this.endpoint + '/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(180000),
                    body: JSON.stringify(body)
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);

                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // keep incomplete line in buffer

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const obj = JSON.parse(line);
                            if (obj.response) {
                                fullText += obj.response;
                                if (onToken) onToken(obj.response);
                            }
                        } catch (e) { /* skip malformed lines */ }
                    }
                }
                // Process any remaining buffer
                if (buffer.trim()) {
                    try {
                        const obj = JSON.parse(buffer);
                        if (obj.response) {
                            fullText += obj.response;
                            if (onToken) onToken(obj.response);
                        }
                    } catch (e) { /* skip */ }
                }

                return fullText;
            });
        }

        // Fall back to Android bridge streaming
        if (this.useNativeBridge && typeof AndroidBridge !== 'undefined' && AndroidBridge.streamGemma) {
            let fullText = '';
            await this._enqueue(() => AndroidBridge.streamGemma({
                prompt: opts.prompt,
                model,
                system: opts.system || ''
            }, (token) => {
                fullText += token;
                if (onToken) onToken(token);
            }));
            return fullText;
        }

        throw new Error('No streaming backend available');
    }

    // --- Non-streaming generation (direct HTTP preferred) ---
    async generate(opts) {
        const model = this.resolvedModel || this.model;
        const body = {
            model,
            prompt: opts.prompt,
            stream: false,
            ...(opts.system && { system: opts.system }),
            ...(opts.options && { options: opts.options })
        };

        return this._enqueue(async () => {
            // Try direct HTTP first
            if (this.useDirectHTTP || !this.useNativeBridge) {
                const resp = await fetch(this.endpoint + '/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(opts.timeout || 30000),
                    body: JSON.stringify(body)
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                return data.response || '';
            }

            // Fall back to bridge
            if (this.useNativeBridge && typeof AndroidBridge !== 'undefined') {
                const data = await AndroidBridge.askGemma({
                    prompt: opts.prompt,
                    model,
                    system: opts.system || ''
                });
                return data.response || '';
            }

            throw new Error('No LLM backend available');
        });
    }

    // --- Port Prompt (Android only — user enters port from ollama4android) ---
    _showPortPrompt() {
        const el = document.createElement('div');
        el.id = 'ollama-port-prompt';
        el.className = 'fixed inset-0 z-[95] flex items-center justify-center p-4';
        el.innerHTML = `
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
            <div class="relative bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 w-full max-w-sm overflow-hidden transform transition-all duration-300 scale-95 opacity-0" id="port-prompt-inner">
                <div class="bg-gradient-to-br from-cyan-500 to-indigo-500 p-5 text-center">
                    <div class="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-2">
                        <i class="ph-duotone ph-plugs-connected text-3xl text-white"></i>
                    </div>
                    <h2 class="text-lg font-black text-white">Connect to Ollama</h2>
                    <p class="text-xs text-white/80 mt-1">Enter the port shown in ollama4android</p>
                </div>
                <div class="p-5 space-y-4">
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-neutral-800 rounded-xl p-3">
                        <i class="ph-bold ph-info text-cyan-500 text-lg"></i>
                        <p class="text-[11px] text-slate-500 dark:text-neutral-400">Open <b>ollama4android</b> and check the port number displayed on its main screen.</p>
                    </div>
                    <div>
                        <label class="text-xs font-bold text-slate-600 dark:text-neutral-300 block mb-1.5">Port number</label>
                        <input id="ollama-port-input" type="number" inputmode="numeric" placeholder="e.g. 43577"
                            class="w-full px-4 py-3 text-lg font-black text-center rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 focus:border-cyan-500 focus:outline-none transition-colors"
                            min="1024" max="65535" />
                        <p id="ollama-port-error" class="text-[11px] text-rose-500 font-bold mt-1 hidden"></p>
                    </div>
                </div>
                <div class="flex gap-2 px-5 pb-5">
                    <button id="ollama-port-skip" class="flex-1 py-3 rounded-2xl text-xs font-bold text-slate-400 bg-slate-100 dark:bg-neutral-800 active:scale-95 transition-transform">Skip</button>
                    <button id="ollama-port-connect" class="flex-1 py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">Connect</button>
                </div>
            </div>`;

        document.body.appendChild(el);

        const input = document.getElementById('ollama-port-input');
        const errorEl = document.getElementById('ollama-port-error');
        const connectBtn = document.getElementById('ollama-port-connect');

        const closePrompt = () => {
            const inner = document.getElementById('port-prompt-inner');
            if (inner) { inner.style.scale = '0.95'; inner.style.opacity = '0'; }
            setTimeout(() => el.remove(), 300);
        };

        document.getElementById('ollama-port-skip').onclick = closePrompt;

        connectBtn.onclick = async () => {
            const port = parseInt(input.value);
            if (!port || port < 1024 || port > 65535) {
                errorEl.textContent = 'Enter a valid port (1024-65535)';
                errorEl.classList.remove('hidden');
                return;
            }

            connectBtn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> Connecting...';
            connectBtn.disabled = true;
            errorEl.classList.add('hidden');

            try {
                await AndroidBridge.connectToPort(port);
                localStorage.setItem('vm_ollama_port', String(port));
                this.endpoint = 'http://localhost:' + port;
                AndroidBridge.setPort(port);
                L('[LLM] Connected via port prompt:', port);
                closePrompt();
                // Re-run autoDetect now that port is set
                this.autoDetect();
            } catch (e) {
                errorEl.textContent = 'Could not connect — is ollama4android serving on this port?';
                errorEl.classList.remove('hidden');
                connectBtn.innerHTML = 'Retry';
                connectBtn.disabled = false;
            }
        };

        // Auto-focus input
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const inner = document.getElementById('port-prompt-inner');
            if (inner) { inner.style.scale = '1'; inner.style.opacity = '1'; }
            input.focus();
        }));
    }

    // --- Setup Prompt (Ollama not found) ---
    _showSetupPrompt() {
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isMobile = /Mobi|Android/i.test(navigator.userAgent);

        const steps = isAndroid ? `
            <div class="space-y-2 text-left text-xs text-slate-600 dark:text-neutral-300 mt-4">
                <p class="font-bold text-sm">Android Setup:</p>
                <div class="flex items-start gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-[10px] font-black text-cyan-600">1</span><span>Install <b>Termux</b> from <b>F-Droid</b></span></div>
                <div class="flex items-start gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-[10px] font-black text-cyan-600">2</span><span>Run: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded">pkg install ollama</code></span></div>
                <div class="flex items-start gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-[10px] font-black text-cyan-600">3</span><span>Run: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded">ollama serve</code></span></div>
                <div class="flex items-start gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-[10px] font-black text-cyan-600">4</span><span>New session: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded">ollama pull gemma3:1b</code></span></div>
                <p class="text-[10px] text-slate-400 mt-2">Only ~500MB download. Works on 4GB+ RAM devices.</p>
            </div>` : `
            <div class="space-y-2 text-left text-xs text-slate-600 dark:text-neutral-300 mt-4">
                <p class="font-bold text-sm">Desktop Setup:</p>
                <div class="flex items-start gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-[10px] font-black text-cyan-600">1</span><span>Download <b>Ollama</b> from <b>ollama.com</b></span></div>
                <div class="flex items-start gap-2"><span class="shrink-0 w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-[10px] font-black text-cyan-600">2</span><span>Open terminal: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded">ollama pull gemma3:1b</code></span></div>
                <p class="text-[10px] text-slate-400 mt-2">Only ~500MB. Ollama runs automatically in the background.</p>
            </div>`;

        this._showBanner({
            icon: 'ph-brain',
            iconColor: 'text-cyan-500',
            title: 'Power Up with AI',
            subtitle: 'Install Ollama to enable smart fill-in-the-blank for conjugated words in Japanese, Korean, and Chinese.',
            body: steps,
            primaryBtn: { text: 'Retry Connection', action: () => this._retryFromBanner() },
            secondaryBtn: { text: 'Maybe Later', action: () => this._dismissBanner(true) }
        });
    }

    // --- Model Prompt (Ollama found, model missing) ---
    _showModelPrompt() {
        const modelCmd = `ollama pull ${this.model}`;
        this._showBanner({
            icon: 'ph-download-simple',
            iconColor: 'text-emerald-500',
            title: 'Ollama Detected!',
            subtitle: `Download the Gemma 3 model to enable AI-powered cloze.`,
            body: `<div class="mt-3 text-left text-xs text-slate-600 dark:text-neutral-300">
                <p>Run this in your terminal:</p>
                <div class="mt-2 bg-slate-200 dark:bg-neutral-600 rounded-lg p-2 font-mono text-[11px] flex items-center justify-between">
                    <code>${modelCmd}</code>
                    <button onclick="navigator.clipboard.writeText('${modelCmd}');this.innerHTML='<i class=\\'ph-bold ph-check\\'></i>'" class="text-cyan-500 ml-2 shrink-0"><i class="ph-bold ph-copy"></i></button>
                </div>
                <p class="text-[10px] text-slate-400 mt-2">~500MB download. Then come back and tap Retry.</p>
            </div>`,
            primaryBtn: { text: 'Retry', action: () => this._retryFromBanner() },
            secondaryBtn: { text: 'Dismiss', action: () => this._dismissBanner(false) }
        });
    }

    // --- Shared Banner UI ---
    _showBanner(opts) {
        // Remove any existing banner
        const existing = document.getElementById('llm-banner');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'llm-banner';
        el.className = 'fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4';
        el.innerHTML = `
            <div class="absolute inset-0 bg-black/30" onclick="app.llm._dismissBanner(false)"></div>
            <div class="relative bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 w-full max-w-sm p-6 transform transition-transform duration-300 translate-y-4 opacity-0" id="llm-banner-inner">
                <div class="text-center">
                    <div class="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center mx-auto mb-3">
                        <i class="ph-duotone ${opts.icon} text-3xl ${opts.iconColor}"></i>
                    </div>
                    <h3 class="text-lg font-black text-slate-800 dark:text-neutral-100">${opts.title}</h3>
                    <p class="text-xs text-slate-500 dark:text-neutral-400 mt-1">${opts.subtitle}</p>
                </div>
                ${opts.body}
                <div class="flex gap-2 mt-5">
                    <button id="llm-banner-secondary" class="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 dark:bg-neutral-800 active:scale-95 transition-transform">${opts.secondaryBtn.text}</button>
                    <button id="llm-banner-primary" class="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-cyan-500 active:scale-95 transition-transform">${opts.primaryBtn.text}</button>
                </div>
            </div>`;

        document.body.appendChild(el);

        // Wire buttons
        document.getElementById('llm-banner-primary').onclick = opts.primaryBtn.action;
        document.getElementById('llm-banner-secondary').onclick = opts.secondaryBtn.action;

        // Animate in
        requestAnimationFrame(() => {
            const inner = document.getElementById('llm-banner-inner');
            if (inner) { inner.style.transform = 'translateY(0)'; inner.style.opacity = '1'; }
        });
    }

    _dismissBanner(remember) {
        if (remember) localStorage.setItem('vm_llm_dismissed', '1');
        const el = document.getElementById('llm-banner');
        if (el) {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.2s';
            setTimeout(() => el.remove(), 200);
        }
    }

    async _retryFromBanner() {
        const btn = document.getElementById('llm-banner-primary');
        if (btn) { btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> Checking...'; btn.disabled = true; }

        const ok = await this.checkConnection();
        if (ok) {
            const wanted = this.model.replace(/[:\-_]/g, '').toLowerCase();
            const preferredMatch = this.availableModels.find(m => (m || '').replace(/[:\-_]/g, '').toLowerCase().includes(wanted));
            this.resolvedModel = preferredMatch || this.availableModels[0] || null;
            this.hasModel = !!this.resolvedModel;
            if (this.hasModel) {
                this._dismissBanner(false);
                this.warmup();
                this._showToast(`AI enabled — ${this.resolvedModel}`, 'ph-check-circle', 'text-emerald-500');
                if (app && !app.game) app.goHome(false);
            } else {
                this._dismissBanner(false);
                this._showModelPrompt();
            }
        } else {
            if (btn) { btn.innerHTML = 'Not Found — Retry'; btn.disabled = false; }
        }
    }

    _showToast(message, icon, colorClass) {
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[95] bg-white dark:bg-neutral-800 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 border border-slate-200 dark:border-neutral-700 transition-all duration-300 opacity-0 -translate-y-2';
        toast.innerHTML = `<i class="ph-bold ${icon} ${colorClass}"></i><span class="text-xs font-bold text-slate-700 dark:text-neutral-200">${escapeHtml(message)}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // --- AI Welcome / Guided Tour ---
    _showAIWelcome() {
        // Only show once per install
        if (localStorage.getItem('vm_ai_welcomed')) {
            this._showToast(`AI enabled — ${this.resolvedModel}`, 'ph-check-circle', 'text-emerald-500');
            return;
        }

        const modelList = this.availableModels.map(m =>
            `<span class="inline-block bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">${m}</span>`
        ).join(' ');

        const el = document.createElement('div');
        el.id = 'ai-welcome';
        el.className = 'fixed inset-0 z-[95] flex items-center justify-center p-4';
        el.innerHTML = `
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
            <div class="relative bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 w-full max-w-sm overflow-hidden transform transition-all duration-300 scale-95 opacity-0" id="ai-welcome-inner">

                <!-- Header gradient -->
                <div class="bg-gradient-to-br from-cyan-500 via-indigo-500 to-purple-500 p-6 text-center">
                    <div class="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-3 shadow-lg">
                        <i class="ph-duotone ph-brain text-4xl text-white"></i>
                    </div>
                    <h2 class="text-xl font-black text-white">AI Enabled</h2>
                    <p class="text-xs text-white/80 mt-1">Powered by Gemma running on your device</p>
                </div>

                <div class="p-5 space-y-4">
                    <!-- Models detected -->
                    <div class="flex items-start gap-3">
                        <div class="shrink-0 w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                            <i class="ph-bold ph-check-circle text-emerald-500"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-slate-700 dark:text-neutral-200">Models detected</p>
                            <div class="flex flex-wrap gap-1 mt-1">${modelList}</div>
                        </div>
                    </div>

                    <!-- Feature: Smart Cloze -->
                    <div class="flex items-start gap-3">
                        <div class="shrink-0 w-8 h-8 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                            <i class="ph-bold ph-text-aa text-cyan-500"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-slate-700 dark:text-neutral-200">Smart Cloze</p>
                            <p class="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">AI identifies conjugated words in sentences so fill-in-the-blank works accurately for Japanese, Korean & Chinese.</p>
                        </div>
                    </div>

                    <!-- Feature: Ask Gemma (coming soon) -->
                    <div class="flex items-start gap-3 opacity-60">
                        <div class="shrink-0 w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <i class="ph-bold ph-chat-circle-text text-purple-500"></i>
                        </div>
                        <div>
                            <p class="text-xs font-bold text-slate-700 dark:text-neutral-200">Ask Gemma <span class="text-[9px] font-bold text-purple-400 ml-1">COMING SOON</span></p>
                            <p class="text-[11px] text-slate-500 dark:text-neutral-400 mt-0.5">AI-generated stories using your vocab words. Read, comprehend, and answer questions — all in your target language.</p>
                        </div>
                    </div>

                    <!-- Privacy note -->
                    <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 flex items-start gap-2">
                        <i class="ph-bold ph-shield-check text-sm text-slate-400 mt-0.5"></i>
                        <p class="text-[10px] text-slate-400 dark:text-neutral-500">100% on-device. No data leaves your phone. Gemma runs locally via ollama4android.</p>
                    </div>
                </div>

                <!-- CTA -->
                <div class="px-5 pb-5">
                    <button id="ai-welcome-ok" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">
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

    // --- Core: Find cloze match ---
    async findClozeMatch(sentence, target, langCode, level) {
        // 1. Check cache
        const cached = await this.getFromCache(sentence, target, langCode);
        if (cached !== null && cached !== '') return cached;

        // 2. Availability guard
        if (!this.available || !this.hasModel) return null;

        // 3. Build level-aware prompt
        let levelHint = '';
        if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
            const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level];
            levelHint = `\nThe learner is at ${difficulty} level. Focus on base forms and common conjugations typical for that level.`;
        }

        try {
            const prompt = `Sentence: ${sentence}
Word: ${target}${levelHint}
The part of the sentence to blank out is: {"match":"`;

            const raw = await this.generate({
                prompt,
                system: 'Complete the JSON. Output only the value and closing brackets. No explanation.',
                options: { temperature: 0, num_predict: 64 },
                timeout: 30000
            });

            L('[LLM] Raw response:', raw);
            const match = this._parseResponse(raw, sentence);
            L('[LLM] Parsed match:', match, 'for target:', target);

            if (match) await this.setCache(sentence, target, langCode, match);
            return match;
        } catch (e) {
            L('[LLM] Request failed:', e.message);
            return null;
        }
    }

    // --- Response parsing ---
    _parseResponse(raw, sentence) {
        if (!raw) return null;
        try {
            // Try full JSON first
            let jsonMatch = raw.match(/\{[\s\S]*?"match"[\s\S]*?\}/);
            if (!jsonMatch) {
                // Model may have just completed the value from our partial prompt
                // e.g. raw = '帯びていた"}' or '帯びていた"}\n'
                const valMatch = raw.match(/^([^"}\n]+)/);
                if (valMatch && valMatch[1].trim()) {
                    const candidate = valMatch[1].trim();
                    if (sentence.includes(candidate)) {
                        L('[LLM] Parsed from completion:', candidate);
                        return candidate;
                    }
                }
                return null;
            }
            const parsed = JSON.parse(jsonMatch[0]);
            const match = parsed.match;
            if (!match || match === '') return null;
            if (!sentence.includes(match)) {
                L('[LLM] Hallucinated match:', match);
                return null;
            }
            return match;
        } catch (e) {
            L('[LLM] Parse error:', e.message, 'Raw:', raw);
            return null;
        }
    }

    // --- Listening comprehension ---
    buildListeningPrompt(words, langCode, level) {
        const langName = this._getLangName(langCode);
        const joined = words.join(', ');
        let levelHint = '';
        if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
            const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level];
            levelHint = `\nThe learner is at ${difficulty} level. Use simpler vocabulary and shorter sentences for lower levels; more natural, idiomatic expressions for higher levels.`;
        }

        return `Write a short listening passage (3-5 sentences) in ${langName} using these words: ${joined}${levelHint}

The passage should use natural spoken language that a learner would hear in everyday conversation.

After the passage, write 1 comprehension question with exactly 3 answer choices (A, B, C) and mark the correct answer.

Format exactly like this:
PASSAGE:
(the passage text in ${langName})

QUESTION:
(the question in ${langName})
A) ...
B) ...
C) ...
ANSWER: (letter)`;
    }

    async getListeningPassage(words, langCode, level) {
        if (!this.available || !this.hasModel) return null;
        try {
            const prompt = this.buildListeningPrompt(words, langCode, level);
            const raw = await this.generate({
                prompt,
                system: 'You are a language learning assistant. Write natural, conversational text suitable for listening practice. Follow the format exactly.',
                options: { temperature: 0.5, num_predict: 384 },
                timeout: 45000
            });
            if (!raw) return null;
            const passage = this._extractListeningPassage(raw);
            const question = this._extractListeningQuestion(raw);
            return { passage, question, raw };
        } catch (e) {
            L('[LLM] Listening passage failed:', e.message);
            return null;
        }
    }

    _extractListeningPassage(raw) {
        const m = raw.match(/PASSAGE:\s*\n([\s\S]*?)(?=\n\s*QUESTION:)/i);
        return m ? m[1].trim() : null;
    }

    _extractListeningQuestion(raw) {
        const m = raw.match(/QUESTION:\s*\n([\s\S]*?)(?=\n\s*ANSWER:)/i);
        if (!m) return null;
        const block = m[1].trim();
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        const question = lines[0] || '';
        const choices = lines.slice(1).filter(l => /^[A-C]\)/i.test(l));
        const answerMatch = raw.match(/ANSWER:\s*([A-C])/i);
        const answer = answerMatch ? answerMatch[1].toUpperCase() : null;
        return { question, choices, answer };
    }

    // --- Grammar explanation ---
    buildGrammarExplanationPrompt(word, context, langCode, level) {
        const langName = this._getLangName(langCode);
        let levelHint = '';
        if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
            const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level];
            levelHint = `\nThe learner is at ${difficulty} level. Adjust the explanation accordingly — keep it simple for beginners, more detailed for advanced learners.`;
        }

        return `Explain the grammar of the word "${word}" as used in this ${langName} sentence: "${context}"${levelHint}

Provide your answer in this exact format:
GRAMMAR: (the grammar rule or pattern this word demonstrates)
USAGE: (how the word is used in the given sentence, in 1-2 sentences)
EXAMPLE: (a simpler ${langName} example sentence using the same grammar pattern, at the learner's level)`;
    }

    async getGrammarExplanation(word, context, langCode, level) {
        if (!this.available || !this.hasModel) return null;
        try {
            const prompt = this.buildGrammarExplanationPrompt(word, context, langCode, level);
            const raw = await this.generate({
                prompt,
                system: 'You are a language learning assistant. Give concise, accurate grammar explanations. Follow the format exactly.',
                options: { temperature: 0.3, num_predict: 256 },
                timeout: 30000
            });
            if (!raw) return null;
            const parsed = this._extractGrammarExplanation(raw);
            if (parsed) {
                let result = '';
                if (parsed.grammar) result += 'GRAMMAR: ' + parsed.grammar;
                if (parsed.usage) result += (result ? '\n' : '') + 'USAGE: ' + parsed.usage;
                if (parsed.example) result += (result ? '\n' : '') + 'EXAMPLE: ' + parsed.example;
                return result || raw.trim();
            }
            return raw.trim();
        } catch (e) {
            L('[LLM] Grammar explanation failed:', e.message);
            return null;
        }
    }

    _extractGrammarExplanation(raw) {
        if (!raw) return null;
        const grammar = raw.match(/GRAMMAR:\s*([\s\S]*?)(?=USAGE:|$)/i);
        const usage = raw.match(/USAGE:\s*([\s\S]*?)(?=EXAMPLE:|$)/i);
        const example = raw.match(/EXAMPLE:\s*([\s\S]*?)$/i);
        if (!grammar && !usage && !example) return null;
        return {
            grammar: grammar ? grammar[1].trim() : null,
            usage: usage ? usage[1].trim() : null,
            example: example ? example[1].trim() : null
        };
    }

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
