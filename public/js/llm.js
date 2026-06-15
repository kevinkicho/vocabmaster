/* js/llm.js */
class LLMService {
    constructor() {
        // Always local: ollama4android on http://127.0.0.1:11434
        // ollama_config.js sets window.OLLAMA_ENDPOINT, but we always default to local for APK
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
        this._queue = Promise.resolve();
        this._initDB();
        if (typeof this.initValidator === 'function') this.initValidator();
        L('[LLM] Endpoint configured:', this.endpoint);
    }

    _pickBestLocalModel() {
        const cands = this.availableModels || [];
        const preferred = 'gemma4:31b-cloud';
        const found = cands.find(m => m.toLowerCase() === preferred);
        if (found) return found;
        if (cands.length === 0) return preferred;
        if (this.resolvedModel && this.resolvedModel === preferred) return preferred;
        const localCands = cands.filter(m => !m.toLowerCase().includes('cloud') && !m.includes('ollama.com'));
        if (localCands.length > 0) {
            const prefOrder = ['gemma2:27b', 'llama3.1:70b', 'mistral-nemo:12b'];
            for (const p of prefOrder) {
                const match = localCands.find(m => m.toLowerCase() === p);
                if (match) return match;
            }
            return localCands[0];
        }
        return cands[0];
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
        // Always false for APK — we connect directly to ollama4android
        return false;
    }

    /**
     * Unified Ollama call — direct HTTP to local endpoint
     */
    async _ollamaRequest(path, payload, { stream = false, timeout = 45000, method = null, signal = null } = {}) {
        const useProxy = false;

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
            signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : signal) : AbortSignal.timeout(timeout)
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
        this.endpoint = 'http://127.0.0.1:11434';
        this.useCloud = false;
        this.apiKey = null;
        const p = (typeof app !== 'undefined' && app && app.store && app.store.prefs) ? app.store.prefs : {};
        this.model = p.llmModel || '';
    }

    // --- Auto-detect: always probe on startup ---
    async autoDetect() {
        L('[LLM] autoDetect endpoint:', this.endpoint);

        const ok = await this.checkConnection();
        L('[LLM] checkConnection result:', ok, 'models:', JSON.stringify(this.availableModels));

        const preferred = 'gemma4:31b-cloud';
        const inTags = this.availableModels.some(m => m.toLowerCase() === preferred);

        if (ok && this.availableModels.length > 0) {
            if (inTags) {
                this.resolvedModel = preferred;
                this.hasModel = true;
                L('[LLM] Found', preferred, 'in tags');
            } else {
                // gemma4 not listed in tags. Try generating with it directly
                // (ollama4android cloud models may be loaded in memory but not listed)
                L('[LLM]', preferred, 'not in tags — probing directly...');
                try {
                    const resp = await this._ollamaRequest('/api/generate', {
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
        const next = this._queue.then(() => fn(), () => fn());
        this._queue = next.catch(() => {});
        return next;
    }

    // --- Non-streaming generation ---
    async generate(opts) {
        let model = this.resolvedModel || this.model;
        if (!model && this.availableModels && this.availableModels.length > 0) {
            model = this._pickBestLocalModel();
            this.resolvedModel = model;
        }
        
        const body = {
            model: model || 'gemma4:31b-cloud',
            prompt: opts.prompt,
            stream: false,
            ...(opts.system && { system: opts.system }),
            ...(opts.options && { options: opts.options })
        };

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
        });
    }

    // --- Streaming generation (for Story mode) ---
    async streamGenerate(opts, onToken) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HttpProxy) {
            L('[LLM] Capacitor HttpProxy detected, falling back to non-streaming generate to avoid crashes.');
            const fullText = await this.generate(opts);
            if (onToken) onToken(fullText);
            return;
        }

        let model = this.resolvedModel || this.model;
        if (!model && this.availableModels && this.availableModels.length > 0) {
            model = this._pickBestLocalModel();
            this.resolvedModel = model;
        }

        const body = {
            model: model || 'gemma4:31b-cloud',
            prompt: opts.prompt,
            stream: true,
            ...(opts.system && { system: opts.system }),
            ...(opts.options && { options: opts.options })
        };

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
                            if (fullText.length < 10) throw new Error(obj.error);
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
        // Brief toast only — the full-screen welcome dialog is too intrusive on first launch
        // and appears behind the splash overlay (z-[100]) then becomes visible after it fades.
        const label = this.useCloud ? this.resolvedModel : 'local (ollama4android)';
        this._showToast(`AI enabled — ${label}`, 'ph-check-circle', 'text-emerald-500');
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

    static GRAMMAR_LABEL_PAIRS = {
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
        exhortation: ['Encouraging', 'Too pushy'],
    };

    static resolveLabels(type, answer) {
        const pair = LLMService.GRAMMAR_LABEL_PAIRS[type];
        if (!pair) return { labelA: '', labelB: '' };
        const [pos, neg] = pair;
        if (answer === 'A') return { labelA: pos, labelB: neg };
        return { labelA: neg, labelB: pos };
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
// Extracted Cache methods for LLMService
Object.assign(LLMService.prototype, {
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
    },

    _cacheKey(sentence, target, lang) {
        return `${sentence}|||${target}|||${lang}`;
    },

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
    },

    async setCache(sentence, target, lang, match) {
        const key = this._cacheKey(sentence, target, lang);
        this.cache.set(key, match);
        if (!this.db) return;
        try {
            const tx = this.db.transaction('cloze_cache', 'readwrite');
            const store = tx.objectStore('cloze_cache');
            store.put({ match, ts: Date.now() }, key);
        } catch (e) { L('[LLM] Cache write failed:', e); }
    },

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
    },

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
});
// Extracted Prompts and Features for LLMService
Object.assign(LLMService.prototype, {
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
            L('[LLM] Request failed for', this.endpoint, 'model', this.resolvedModel || this.model, ':', e.message || e, 'stack:', e.stack);
            return null;
        }
    },

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
    },

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
    },

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
    },

    _extractListeningPassage(raw) {
        const m = raw.match(/PASSAGE:\s*\n([\s\S]*?)(?=\n\s*QUESTION:)/i);
        return m ? m[1].trim() : null;
    },

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
    },

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
    },

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
    },

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
});
/* js/llm_response_validator.js
 * Unified response validation & self-correction for LLM outputs.
 * Ensures structured, parseable responses that hardcoded scripts can rely on.
 */

class LLMResponseValidator {
    constructor(llmService) {
        this.llm = llmService;
        this.maxRetries = 2;
        this.criticThreshold = 70; // overall score threshold
        this.criticMinCriterion = 50; // no single criterion below this
        this.maxCriticRetries = 2; // max regenerations with critic feedback
        this.criticTimeout = llmService.useCloud ? 15000 : 30000; // faster timeout for cloud
    }

    // ============================================================
    // SCHEMA DEFINITIONS — single source of truth for each feature
    // ============================================================


    // ============================================================
    // PROMPT BUILDERS — produce JSON-only prompts with schema hints
    // ============================================================


    // ============================================================
    // VALIDATION & SELF-CORRECTION
    // ============================================================

    validate(json, schemaName) {
        const schema = LLMResponseValidator.SCHEMAS[schemaName];
        if (!schema) return { valid: false, error: `Unknown schema: ${schemaName}` };

        try {
            // Basic JSON structure check
            if (typeof json !== 'object' || json === null) {
                return { valid: false, error: 'Response is not a JSON object' };
            }

            // Required fields
            for (const field of schema.required) {
                if (!(field in json) || json[field] === undefined || json[field] === null) {
                    return { valid: false, error: `Missing required field: ${field}` };
                }
            }

            // Type checks
            for (const [key, rules] of Object.entries(schema.properties)) {
                const val = json[key];
                if (val === undefined) continue;

                if (rules.type === 'string') {
                    if (typeof val !== 'string') return { valid: false, error: `${key} must be string` };
                    
                    // Auto-sanitize markdown bold tags that small models frequently leak into JSON
                    if (val.includes('**')) {
                        json[key] = val.replace(/\*\*/g, '');
                    }
                    
                    if (rules.minLength && json[key].length < rules.minLength) {
                        return { valid: false, error: `${key} too short (min ${rules.minLength})` };
                    }
                    if (rules.enum && !rules.enum.includes(json[key])) {
                        return { valid: false, error: `${key} must be one of ${rules.enum.join('/')}` };
                    }
                }
                if (rules.type === 'number') {
                    if (typeof val !== 'number') return { valid: false, error: `${key} must be number` };
                    if (rules.minimum !== undefined && val < rules.minimum) {
                        return { valid: false, error: `${key} below minimum ${rules.minimum}` };
                    }
                    if (rules.maximum !== undefined && val > rules.maximum) {
                        return { valid: false, error: `${key} exceeds maximum ${rules.maximum}` };
                    }
                }
                if (rules.type === 'boolean') {
                    if (typeof val !== 'boolean') return { valid: false, error: `${key} must be boolean` };
                }
                if (rules.type === 'array') {
                    if (!Array.isArray(val)) return { valid: false, error: `${key} must be array` };
                    if (rules.minItems && val.length < rules.minItems) {
                        return { valid: false, error: `${key} needs at least ${rules.minItems} items` };
                    }
                    if (rules.maxItems && val.length > rules.maxItems) {
                        return { valid: false, error: `${key} exceeds max ${rules.maxItems} items` };
                    }
                    // Validate array items (only check required fields + present fields)
                    if (rules.items && rules.items.properties) {
                        const itemRequired = rules.items.required || [];
                        for (let i = 0; i < val.length; i++) {
                            const item = val[i];
                            for (const [itemKey, itemRules] of Object.entries(rules.items.properties)) {
                                const isRequired = itemRequired.includes(itemKey);
                                if (isRequired && !(itemKey in item)) return { valid: false, error: `${key}[${i}].${itemKey} missing` };
                                if (!(itemKey in item)) continue;
                                if (itemRules.enum && !itemRules.enum.includes(item[itemKey])) {
                                    return { valid: false, error: `${key}[${i}].${itemKey} must be ${itemRules.enum.join('/')}` };
                                }
                            }
                        }
                    }
                }
            }

            // No extra properties
            if (!schema.additionalProperties) {
                for (const key of Object.keys(json)) {
                    if (!(key in schema.properties)) {
                        return { valid: false, error: `Unexpected field: ${key}` };
                    }
                }
            }

            return { valid: true, data: json };
        } catch (e) {
            return { valid: false, error: `Validation error: ${e.message}` };
        }
    }

    // Extract JSON from model output (handles partial, markdown-wrapped, etc.)
    extractJSON(raw) {
        if (!raw) return null;

        // Clean common LLM trailing commas before closing braces/brackets
        const cleanJSON = (str) => {
            try {
                return str.replace(/,\s*([\]}])/g, '$1');
            } catch(e) { return str; }
        };

        // 1. Try direct JSON parse
        try {
            return JSON.parse(cleanJSON(raw));
        } catch (e) {}

        // 2. Try to find JSON object in text (handles ```json``` fences)
        const fenceMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (fenceMatch) {
            try { return JSON.parse(cleanJSON(fenceMatch[1])); } catch (e) {}
        }

        // 3. Find first complete { ... } block
        let depth = 0, start = -1;
        for (let i = 0; i < raw.length; i++) {
            if (raw[i] === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (raw[i] === '}') {
                depth--;
                if (depth === 0 && start !== -1) {
                    const candidate = raw.slice(start, i + 1);
                    try { return JSON.parse(cleanJSON(candidate)); } catch (e) {}
                }
            }
        }

        // 4. For cloze: model may complete partial prompt like '...{"match":' → extract value
        const completionMatch = raw.match(/"match"\s*:\s*"([^"]+)"/);
        if (completionMatch) return { match: completionMatch[1] };

        return null;
    }

    // Main entry: generate → validate → retry with feedback → return validated data
    async generateValidated(schemaName, promptBuilder, ...promptArgs) {
        let lastError = '';
        const isStory = schemaName === 'storyWithQuestions';
        const isGrammar = schemaName === 'grammarExercise';
        const baseTokens = isStory ? 1024 : isGrammar ? 2048 : 384;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            const isRetry = attempt > 0;
            const prompt = promptBuilder(...promptArgs, isRetry, lastError);

            try {
                const raw = await this.llm.generate({
                    prompt,
                    system: 'Output ONLY valid JSON matching the specified schema. No extra text.',
                    options: { temperature: 0, num_predict: isRetry ? (baseTokens * 1.5) : baseTokens }, // deterministic, more tokens on retry
                    timeout: 45000
                });

                const json = this.extractJSON(raw);
                if (!json) {
                    lastError = 'No valid JSON found in response';
                    L(`[Validator] Attempt ${attempt + 1}: ${lastError} | Raw: ${raw?.slice(0, 200)}`);
                    continue;
                }

                const result = this.validate(json, schemaName);
                if (result.valid) {
                    if (isRetry) L(`[Validator] Self-correction succeeded on attempt ${attempt + 1}`);
                    return result.data;
                }

                lastError = result.error;
                L(`[Validator] Attempt ${attempt + 1} validation failed: ${lastError} | Parsed: ${JSON.stringify(json).slice(0, 300)}`);
            } catch (e) {
                lastError = e.message;
                L(`[Validator] Attempt ${attempt + 1} error: ${lastError}`);
            }
        }

        L(`[Validator] All ${this.maxRetries + 1} attempts failed for ${schemaName}: ${lastError}`);
        return null;
    }

    // ============================================================
    // LAYER 2: AI CRITIC — Semantic Validation
    // ============================================================

    buildCriticPrompt(generatedContent, role, level, langCode) {
        const langName = this.llm._getLangName(langCode);
        const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level] || level;
        const contentStr = JSON.stringify(generatedContent, null, 2);

        return `You are a language learning content critic for VocabMaster. Evaluate this generated content for a ${difficulty} learner of ${langName}.

ROLE: ${role}
GENERATED CONTENT:
${contentStr}

CRITERIA (score 0-100 each):
1. levelAppropriate: Vocabulary/grammar matches ${difficulty}. No structures above level.
2. pedagogicalValue: Teaches something useful. Not too easy, not overwhelming.
3. naturalness: Sounds like a native speaker would actually say/write this.
4. diversity: Varied sentence structures, not repetitive patterns.
5. culturalAccuracy: Culturally appropriate. No hallucinated customs or unnatural phrases.
6. engagement: Interesting, relevant to learner's likely goals (daily life, travel, etc.).

OUTPUT ONLY THIS JSON (no extra text, no markdown):
{
  "overallScore": 85,
  "criteria": {
    "levelAppropriate": 90,
    "pedagogicalValue": 85,
    "naturalness": 88,
    "diversity": 75,
    "culturalAccuracy": 92,
    "engagement": 80
  },
  "issues": ["Specific issue 1", "Specific issue 2"],
  "suggestedFix": "Concrete instruction for regeneration (e.g., 'Simplify sentence 3 to use only -ta past tense. Vary sentence openings.')",
  "approve": false
}

RULES:
- Be strict: score < 50 on any criterion = do not approve
- overallScore = average of 6 criteria
- approve = true ONLY if overallScore >= 70 AND no criterion < 50
- issues: list specific, actionable problems (empty if approve)
- suggestedFix: one clear sentence the generator can follow`;
    }

    async criticEvaluate(generatedContent, role, level, langCode) {
        if (!this.llm.available || !this.llm.hasModel) {
            // No critic available, auto-approve with moderate score
            return { overallScore: 75, criteria: {}, issues: [], suggestedFix: '', approve: true };
        }

        const prompt = this.buildCriticPrompt(generatedContent, role, level, langCode);
        const raw = await this.llm.generate({
            prompt,
            system: 'You are a strict language learning content critic. Output ONLY valid JSON.',
            options: { temperature: 0, num_predict: 256 },
            timeout: this.criticTimeout || 30000
        });

        const json = this.extractJSON(raw);
        if (!json) {
            L('[Critic] Failed to parse critic response, auto-approving');
            return { overallScore: 75, criteria: {}, issues: [], suggestedFix: '', approve: true };
        }

        const result = this.validate(json, 'criticEvaluation');
        if (!result.valid) {
            L('[Critic] Invalid critic response:', result.error, 'auto-approving');
            return { overallScore: 75, criteria: {}, issues: [], suggestedFix: '', approve: true };
        }

        return result.data;
    }

    // Main entry with critic: generate → validate → critic → regenerate with critic feedback
    async generateWithCritic(schemaName, promptBuilder, level, langCode, ...promptArgs) {
        let bestData = null;
        let bestScore = 0;
        const onProgress = promptArgs[promptArgs.length - 1];
        const actualArgs = typeof onProgress === 'function' ? promptArgs.slice(0, -1) : promptArgs;

        for (let criticAttempt = 0; criticAttempt <= this.maxCriticRetries; criticAttempt++) {
            if (typeof onProgress === 'function') {
                onProgress(`Generating (attempt ${criticAttempt + 1}/${this.maxCriticRetries + 1})...`);
            }
            const data = await this.generateValidated(schemaName, promptBuilder, ...actualArgs);
            if (!data) {
                L(`[Critic] Attempt ${criticAttempt + 1}: Generation failed`);
                continue;
            }

            if (typeof onProgress === 'function') {
                onProgress(`Critic evaluating...`);
            }
            const critique = await this.criticEvaluate(data, schemaName, level, langCode);
            L(`[Critic] Attempt ${criticAttempt + 1}: score=${critique.overallScore}, approve=${critique.approve}`);

            if (critique.overallScore > bestScore) {
                bestScore = critique.overallScore;
                bestData = data;
            }

            if (critique.approve) {
                if (criticAttempt > 0) L(`[Critic] Approved after ${criticAttempt + 1} attempts`);
                return { data, critiqueScore: critique.overallScore, attempts: criticAttempt + 1 };
            }

            const criticFeedback = critique.issues.length > 0
                ? critique.issues.join('; ') + ' | ' + critique.suggestedFix
                : critique.suggestedFix;

            actualArgs[actualArgs.length - 2] = true;
            actualArgs[actualArgs.length - 1] = criticFeedback;
        }

        L(`[Critic] All ${this.maxCriticRetries + 1} attempts below threshold (best: ${bestScore}). Returning best with warning.`);
        return { data: bestData, critiqueScore: bestScore, attempts: this.maxCriticRetries + 1, warning: 'Below quality threshold' };
    }
}

window.LLMResponseValidator = LLMResponseValidator;
// Extracted schemas for LLMResponseValidator
LLMResponseValidator.SCHEMAS = {
    
        // Smart Cloze: extract exact conjugated form from existing sentence
        clozeMatch: {
            type: 'object',
            properties: {
                match: { type: 'string', minLength: 1 }
            },
            required: ['match'],
            additionalProperties: false
        },

        /**
         * Dynamic AI Cloze Generation
         * Used to generate a novel sentence instead of relying on DB examples.
         */
        generatedCloze: {
            type: 'object',
            properties: {
                sentence: { type: 'string', minLength: 5 },
                match: { type: 'string', minLength: 1 }
            },
            required: ['sentence', 'match'],
            additionalProperties: false
        },

        // Grammar explanation: structured fields
        grammarExplanation: {
            type: 'object',
            properties: {
                grammar: { type: 'string', minLength: 1 },
                usage: { type: 'string', minLength: 1 },
                example: { type: 'string', minLength: 1 }
            },
            required: ['grammar', 'usage', 'example'],
            additionalProperties: false
        },

        // Grammar Gym: explanation + 12 exercises (5 scenario + 7 sentence mood)
        grammarExercise: {
            type: 'object',
            properties: {
                grammar: { type: 'string', minLength: 1 },
                usage: { type: 'string', minLength: 1 },
                example: { type: 'string', minLength: 1 },
                exercises: {
                    type: 'array',
                    minItems: 12,
                    maxItems: 12,
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['text_dm', 'you_decide', 'fix_sign', 'translation_fail', 'culture_check', 'declarative', 'interrogative', 'imperative', 'exclamative', 'operative', 'conditional', 'exhortation'] },
                            question: { type: 'string', minLength: 5 },
                            choices: {
                                type: 'array',
                                minItems: 2,
                                maxItems: 4,
                                items: {
                                    type: 'object',
                                    properties: {
                                        letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                                        text: { type: 'string', minLength: 1 }
                                    },
                                    required: ['letter', 'text'],
                                    additionalProperties: false
                                }
                            },
                            answer: { type: 'string', enum: ['A', 'B'] },
                            explanation: { type: 'string', minLength: 5 }
                        },
                        required: ['type', 'question', 'choices', 'answer', 'explanation']
                    }
                }
            },
            required: ['grammar', 'usage', 'example', 'exercises'],
            additionalProperties: false
        },

        // Listening passage + question
        listeningPassage: {
            type: 'object',
            properties: {
                passage: { type: 'string', minLength: 10 },
                question: { type: 'string', minLength: 5 },
                choices: {
                    type: 'array',
                    minItems: 3,
                    maxItems: 3,
                    items: {
                        type: 'object',
                        properties: {
                            letter: { type: 'string', enum: ['A', 'B', 'C'] },
                            text: { type: 'string', minLength: 1 }
                        },
                        required: ['letter', 'text'],
                        additionalProperties: false
                    }
                },
                answer: { type: 'string', enum: ['A', 'B', 'C'] }
            },
            required: ['passage', 'question', 'choices', 'answer'],
            additionalProperties: false
        },

        // Story + 2 comprehension questions
        storyWithQuestions: {
            type: 'object',
            properties: {
                story: { 
                    type: 'string', 
                    minLength: 50
                },
                questions: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string', minLength: 5 },
                            choices: {
                                type: 'array',
                                minItems: 3,
                                maxItems: 4,
                                items: {
                                    type: 'object',
                                    properties: {
                                        letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                                        text: { type: 'string', minLength: 1 }
                                    },
                                    required: ['letter', 'text'],
                                    additionalProperties: false
                                }
                            },
                            answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] }
                        },
                        required: ['question', 'choices', 'answer'],
                        additionalProperties: false
                    }
                }
            },
            required: ['story', 'questions'],
            additionalProperties: false
        },

        // AI Critic Evaluation
        criticEvaluation: {
            type: 'object',
            properties: {
                overallScore: { type: 'number', minimum: 0, maximum: 100 },
                criteria: {
                    type: 'object',
                    properties: {
                        levelAppropriate: { type: 'number', minimum: 0, maximum: 100 },
                        pedagogicalValue: { type: 'number', minimum: 0, maximum: 100 },
                        naturalness: { type: 'number', minimum: 0, maximum: 100 },
                        diversity: { type: 'number', minimum: 0, maximum: 100 },
                        culturalAccuracy: { type: 'number', minimum: 0, maximum: 100 },
                        engagement: { type: 'number', minimum: 0, maximum: 100 }
                    },
                    required: ['levelAppropriate', 'pedagogicalValue', 'naturalness', 'diversity', 'culturalAccuracy', 'engagement'],
                    additionalProperties: false
                },
                issues: { type: 'array', items: { type: 'string' } },
                suggestedFix: { type: 'string' },
                approve: { type: 'boolean' }
            },
            required: ['overallScore', 'criteria', 'issues', 'suggestedFix', 'approve'],
            additionalProperties: false
        },

        // Paragraph Generator
        paragraph: {
            type: 'object',
            properties: {
                paragraph: { type: 'string', minLength: 100 },
                targetWords: { type: 'array', minItems: 1, items: { type: 'string' } },
                cefrLevel: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1'] },
                topic: { type: 'string' },
                audioCues: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            startMs: { type: 'number', minimum: 0 },
                            endMs: { type: 'number', minimum: 0 }
                        },
                        required: ['text', 'startMs', 'endMs'],
                        additionalProperties: false
                    }
                }
            },
            required: ['paragraph', 'targetWords', 'cefrLevel', 'topic', 'audioCues'],
            additionalProperties: false
        },

        // Quiz Generator
        quiz: {
            type: 'object',
            properties: {
                questions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['multiple_choice', 'fill_blank', 'true_false'] },
                            prompt: { type: 'string', minLength: 5 },
                            choices: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                                        text: { type: 'string', minLength: 1 }
                                    },
                                    required: ['letter', 'text'],
                                    additionalProperties: false
                                }
                            },
                            answer: { type: 'string' },
                            explanation: { type: 'string', minLength: 10 },
                            targetWord: { type: 'string' },
                            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }
                        },
                        required: ['type', 'prompt', 'answer', 'explanation', 'targetWord', 'difficulty'],
                        additionalProperties: false
                    }
                },
                metadata: {
                    type: 'object',
                    properties: {
                        sourceWords: { type: 'array', items: { type: 'string' } },
                        level: { type: 'string' },
                        count: { type: 'number', minimum: 1 }
                    },
                    required: ['sourceWords', 'level', 'count'],
                    additionalProperties: false
                }
            },
            required: ['questions', 'metadata'],
            additionalProperties: false
        },

        // Explanation Generator
        explanation: {
            type: 'object',
            properties: {
                word: { type: 'string', minLength: 1 },
                definition: { type: 'string', minLength: 5 },
                nuance: { type: 'string', minLength: 10 },
                register: { type: 'string', enum: ['formal', 'casual', 'polite', 'slang', 'literary'] },
                collocations: { type: 'array', minItems: 2, items: { type: 'string' } },
                culturalNote: { type: 'string' },
                commonMistakes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            mistake: { type: 'string' },
                            correction: { type: 'string' }
                        },
                        required: ['mistake', 'correction'],
                        additionalProperties: false
                    }
                },
                examples: {
                    type: 'array',
                    minItems: 2,
                    items: {
                        type: 'object',
                        properties: {
                            sentence: { type: 'string' },
                            translation: { type: 'string' }
                        },
                        required: ['sentence', 'translation'],
                        additionalProperties: false
                    }
                }
            },
            required: ['word', 'definition', 'nuance', 'register', 'collocations', 'culturalNote', 'commonMistakes', 'examples'],
            additionalProperties: false
        },

        // Conversation Generator
        conversation: {
            type: 'object',
            properties: {
                scenario: { type: 'string', minLength: 5 },
                turns: {
                    type: 'array',
                    minItems: 4,
                    items: {
                        type: 'object',
                        properties: {
                            speaker: { type: 'string', enum: ['A', 'B'] },
                            text: { type: 'string', minLength: 1 },
                            translation: { type: 'string' },
                            audioHint: { type: 'string', enum: ['polite', 'casual'] }
                        },
                        required: ['speaker', 'text', 'translation', 'audioHint'],
                        additionalProperties: false
                    }
                },
                targetWords: { type: 'array', minItems: 1, items: { type: 'string' } },
                completionExercise: {
                    type: 'object',
                    properties: {
                        missingTurn: { type: 'number', minimum: 1 },
                        options: {
                            type: 'array',
                            minItems: 3,
                            maxItems: 4,
                            items: {
                                type: 'object',
                                properties: {
                                    letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                                    text: { type: 'string' }
                                },
                                required: ['letter', 'text'],
                                additionalProperties: false
                            }
                        },
                        correct: { type: 'string', enum: ['A', 'B', 'C', 'D'] }
                    },
                    required: ['missingTurn', 'options', 'correct'],
                    additionalProperties: false
                }
            },
            required: ['scenario', 'turns', 'targetWords', 'completionExercise'],
            additionalProperties: false
        },

        // Feedback Generator
        feedback: {
            type: 'object',
            properties: {
                summary: { type: 'string', minLength: 20 },
                accuracy: {
                    type: 'object',
                    properties: {
                        overall: { type: 'number', minimum: 0, maximum: 1 },
                        byType: { type: 'object', additionalProperties: { type: 'number' } }
                    },
                    required: ['overall', 'byType'],
                    additionalProperties: false
                },
                weakWords: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            word: { type: 'string' },
                            errors: { type: 'number', minimum: 1 },
                            pattern: { type: 'string' }
                        },
                        required: ['word', 'errors', 'pattern'],
                        additionalProperties: false
                    }
                },
                strongWords: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            word: { type: 'string' },
                            streak: { type: 'number', minimum: 1 }
                        },
                        required: ['word', 'streak'],
                        additionalProperties: false
                    }
                },
                recommendations: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 5,
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['review', 'practice', 'new'] },
                            priority: { type: 'number', minimum: 1, maximum: 5 },
                            description: { type: 'string' },
                            words: { type: 'array', items: { type: 'string' } }
                        },
                        required: ['type', 'priority', 'description', 'words'],
                        additionalProperties: false
                    }
                },
                nextSessionFocus: { type: 'string' }
            },
            required: ['summary', 'accuracy', 'weakWords', 'strongWords', 'recommendations', 'nextSessionFocus'],
            additionalProperties: false
        }
    };
// Extracted prompt builders for LLMResponseValidator
Object.assign(LLMResponseValidator.prototype, {
    buildClozePrompt(sentence, target, langCode, level) {
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        return `Find the EXACT word/phrase from the sentence that corresponds to the target word.
Sentence: "${sentence}"
Target: "${target}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "match": "exact_text_from_sentence"
}

Rules:
- The "match" MUST appear verbatim in the sentence
- For conjugated verbs, return the conjugated form (e.g., "食べた" not "食べる")
- For particles/compounds, return the full surface form
- Case-sensitive for Latin scripts`;
    },

    /**
     * @param {string} target - The vocabulary word to generate a sentence for
     * @param {string} langCode - Language code (e.g., 'es', 'ja')
     * @param {string} level - Optional CEFR level (e.g., 'A1', 'N5')
     */
    buildGeneratedClozePrompt(target, langCode, level) {
        const langName = this.llm._getLangName(langCode);
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}. Ensure grammar and vocabulary are appropriate for this level.`
            : '';
            
        return `Generate a natural, single sentence in ${langName} that logically incorporates the target word/phrase.
Target: "${target}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "sentence": "The full sentence in ${langName}",
  "match": "exact_text_from_sentence"
}

Rules:
- "sentence": Must be entirely in ${langName}. Length should be 1-2 clauses, natural context.
- "match": Must be the exact verbatim string from the generated sentence that corresponds to the target word.
- For conjugated verbs, the "match" must be the conjugated form (e.g., "comió" not "comer").
- Output MUST be valid JSON only.`;
    },

    buildGrammarPrompt(word, context, langCode, level) {
        const langName = this.llm._getLangName(langCode);
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        return `Explain the grammar of "${word}" in this ${langName} sentence: "${context}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "grammar": "grammar rule/pattern name",
  "usage": "how the word functions in this specific sentence (1-2 sentences)",
  "example": "simpler ${langName} sentence using same pattern at learner's level"
}

Rules:
- "grammar": concise rule name (e.g., "Past tense -ta form", "Topic marker は")
- "usage": specific to the given sentence context
- "example": MUST be in ${langName}, simpler than context, same pattern`;
    },

    buildListeningPrompt(words, langCode, level) {
        const langName = this.llm._getLangName(langCode);
        const joined = words.join(', ');
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        return `Write a short listening passage (3-5 sentences) in ${langName} using these words: ${joined}${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "passage": "the passage text in ${langName}",
  "question": "comprehension question in ${langName}",
  "choices": [
    {"letter": "A", "text": "choice A"},
    {"letter": "B", "text": "choice B"},
    {"letter": "C", "text": "choice C"}
  ],
  "answer": "A"

Rules:
- Passage: natural spoken language, 3-5 sentences
- Question: answerable from passage only
- Choices: exactly 3, lettered A/B/C
- Answer: single letter A/B/C matching correct choice`;
    },

    buildGrammarExercisePrompt(word, context, langCode, level) {
        const langName = this.llm._getLangName(langCode);
        let levelHint = '';
        if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
            const d = LLMService.LEVEL_DIFFICULTY_MAP[level];
            const tone = d.startsWith('beginner') || d.startsWith('elementary')
                ? 'light, simple, focused on surviving daily situations (ordering food, asking for prices, greetings)'
                : d.includes('intermediate')
                    ? 'natural conversations, cultural situations, handling minor conflicts or misunderstandings'
                    : 'sophisticated interactions, professional contexts, humor and wordplay';
            levelHint = `\nLearner is ${d}. Tone should match — ${tone}.`;
        }
        return `You are a ${langName} language coach. Generate 12 exercises for the grammar rule "${word}" from "${context}".${levelHint}

Each exercise type must be used exactly once: text_dm, you_decide, fix_sign, translation_fail, culture_check, declarative, interrogative, imperative, exclamative, operative, conditional, exhortation.

Rules:
- The correct answer MUST contain or demonstrate the grammar rule.
- The two choices MUST be different.
- Give each exercise a unique, real-life scenario with stakes.
- Questions and explanations in English. Choices in ${langName}.
- Wrong choices must be plausible.
- ANSWER BALANCE: Exactly 6 of the 12 exercises must have answer="A" and exactly 6 must have answer="B".

Output only JSON with no extra text:
{
  "grammar": "friendly name of the grammar rule",
  "usage": "how the word works (1-2 sentences, English)",
  "example": "one ${langName} example NOT used in any exercise",
  "exercises": [
    {
      "type": "text_dm",
      "question": "Scenario in English (1-3 sentences)",
      "choices": [
        {"letter": "A", "text": "option A in ${langName}"},
        {"letter": "B", "text": "option B in ${langName}"}
      ],
      "answer": "A",
      "explanation": "Why the correct choice works, then the grammar rule in 1 sentence."
    }
  ]
}`;
    },

    buildStoryPrompt(storyWords, langCode, level, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const wordList = storyWords.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        const retryHint = isRetry
            ? `\n\nPREVIOUS RESPONSE WAS INVALID: ${previousError}\nFix the format exactly as specified.`
            : '';

        return `Write a short story in ${langName} using these words: ${wordList}${levelHint}${retryHint}

The story MUST be written entirely in ${langName}. Do not use any other language.

Then write 2 comprehension questions with 3-4 choices each.

Respond with ONLY this JSON (no extra text, no markdown, no **bold**, no *italic*, no code blocks):
{
  "story": "the full story text in ${langName} — plain text only, no formatting",
  "questions": [
    {
      "question": "question 1 in ${langName}",
      "choices": [
        {"letter": "A", "text": "choice A"},
        {"letter": "B", "text": "choice B"},
        {"letter": "C", "text": "choice C"},
        {"letter": "D", "text": "choice D"}
      ],
      "answer": "A"
    }
    {
      "question": "question 2 in ${langName}",
      "choices": [
        {"letter": "A", "text": "choice A"},
        {"letter": "B", "text": "choice B"},
        {"letter": "C", "text": "choice C"},
        {"letter": "D", "text": "choice D"}
      ],
      "answer": "B"
    }
  ]
}

RULES:
- Story: 5-8 sentences, natural flow, all target words used, plain text only (no markdown, no **bold**, no *italic*)
- Questions: answerable from story only, in ${langName}
- Each question: exactly 4 choices (A/B/C/D)
- Answer: single letter A/B/C/D matching correct choice
- IMPORTANT: Randomize which letter is correct for each question — do NOT always use A or B. Vary between A, B, C, D randomly.
- Output MUST be valid JSON only. No extra text, no explanations, no markdown, no code blocks.
- The story MUST be written entirely in ${langName}. No other language allowed.`;
    },

    // ============================================================
    // NEW ROLE PROMPT BUILDERS — App-specific, pedagogically tuned
    // ============================================================

    buildParagraphPrompt(words, langCode, level, topic = 'daily life', sentenceCount = 10, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const cefrMap = { 'N5': 'A1', 'N4': 'A2', 'N3': 'B1', 'N2': 'B2', 'N1': 'C1' };
        const cefr = cefrMap[level] || 'A2';
        const wordList = words.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = `\nLearner level: ${cefr} (${level}). Use vocabulary and grammar appropriate for this level.`;

        return `Write a natural paragraph in ${langName} about "${topic}" for a ${cefr} learner (${level}).
Target words to include naturally: ${wordList}
Sentence count: ${sentenceCount} (varied length, connected flow)${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "paragraph": "full paragraph text in ${langName}, all target words used naturally",
  "targetWords": ["word1", "word2", "word3"],
  "cefrLevel": "${cefr}",
  "topic": "${topic}",
  "audioCues": [
    {"text": "first sentence", "startMs": 0, "endMs": 2000},
    {"text": "second sentence", "startMs": 2000, "endMs": 4000}
  ]
}

RULES:
- Paragraph: ${sentenceCount} sentences, coherent narrative, all target words appear verbatim
- CEFR-appropriate: A1=simple present, short sentences; A2=past tense, connectors; B1=subjunctive, relative clauses; B2=idioms, nuance
- audioCues: one per sentence, realistic timing (approx 150-200 words/min)
- Topic: everyday situations (shopping, travel, work, school, hobbies)
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildQuizPrompt(words, langCode, level, types = ['multiple_choice', 'fill_blank'], count = 5, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const wordList = words.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = level ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level] || level}.` : '';

        return `Generate ${count} quiz questions in ${langName} for ${levelHint} using these words: ${wordList}
Question types: ${types.join(', ')}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "questions": [
    {
      "type": "multiple_choice",
      "prompt": "question or fill-in-the-blank sentence",
      "choices": [{"letter": "A", "text": "choice A"}, {"letter": "B", "text": "choice B"}, {"letter": "C", "text": "choice C"}, {"letter": "D", "text": "choice D"}],
      "answer": "B",
      "explanation": "why this is correct and others are not (1 sentence)",
      "targetWord": "target word from list",
      "difficulty": "medium"
    }
  ],
  "metadata": {"sourceWords": ["word1", "word2"], "level": "${level}", "count": ${count}}
}

RULES:
- multiple_choice: exactly 4 choices (A/B/C/D), one clearly correct
- fill_blank: choices = null, answer = exact word/phrase, prompt has _____ blank
- true_false: choices = [{"letter":"A","text":"True"},{"letter":"B","text":"False"}], answer = A or B
- Explanation: pedagogical, references grammar/usage, not just "correct because..."
- Difficulty distribution: 40% easy, 40% medium, 20% hard
- Each question targets ONE word from the list
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildExplanationPrompt(word, context, langCode, level, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const levelHint = level ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level] || level}.` : '';

        return `Explain the word "${word}" as used in this ${langName} sentence: "${context}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "word": "${word}",
  "definition": "clear 1-sentence definition",
  "nuance": "when to use this vs similar words, connotations, formality level",
  "register": "formal|casual|polite|slang|literary",
  "collocations": ["common phrase 1", "common phrase 2", "common phrase 3"],
  "culturalNote": "cultural context or null if none",
  "commonMistakes": [
    {"mistake": "common error learners make", "correction": "correct form with brief why"}
  ],
  "examples": [
    {"sentence": "simpler example in ${langName}", "translation": "English translation"},
    {"sentence": "another example", "translation": "English translation"}
  ]
}

RULES:
- nuance: specific, not generic (e.g., "implies speaker's emotion" not "has nuance")
- register: single value from enum
- collocations: 3+ natural phrases native speakers use
- culturalNote: null or specific cultural insight (e.g., "used when offering food to guests")
- commonMistakes: real learner errors (particle confusion, wrong conjugation, register mismatch)
- examples: simpler than context, same grammar pattern, at learner's level
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildConversationPrompt(words, langCode, level, scenario = 'daily conversation', isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const wordList = words.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = level ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level] || level}.` : '';

        return `Write a natural dialogue in ${langName} for "${scenario}" at ${levelHint}
Target words to include: ${wordList}
Turns: 6-8 (alternating A/B)

Respond with ONLY this JSON (no extra text, no markdown):
{
  "scenario": "${scenario}",
  "turns": [
    {"speaker": "A", "text": "dialogue line in ${langName}", "translation": "English", "audioHint": "polite"},
    {"speaker": "B", "text": "response in ${langName}", "translation": "English", "audioHint": "casual"}
  ],
  "targetWords": ["word1", "word2"],
  "completionExercise": {
    "missingTurn": 4,
    "options": [
      {"letter": "A", "text": "option A in ${langName}"},
      {"letter": "B", "text": "option B in ${langName}"},
      {"letter": "C", "text": "option C in ${langName}"},
      {"letter": "D", "text": "option D in ${langName}"}
    ],
    "correct": "B"
  }
}

RULES:
- Turns alternate A/B/A/B naturally
- audioHint: "polite" (desu/mas, honorifics) or "casual" (plain form, slang)
- Target words appear naturally in context
- Completion exercise: remove one turn, give 4 options, one correct
- Scenario-appropriate register (shopping=polite, friends=casual)
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildFeedbackPrompt(sessionData, isRetry = false, previousError = '') {
        const { accuracy, interactions, level, langCode } = sessionData;
        const langName = this.llm._getLangName(langCode);

        return `Analyze this ${langName} learning session for a ${level} learner and provide personalized feedback.

SESSION DATA:
- Overall accuracy: ${(accuracy.overall * 100).toFixed(0)}%
- By activity: ${JSON.stringify(accuracy.byType)}
- Interactions: ${interactions.length} total
- Recent patterns: ${this.summarizeInteractions(interactions)}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "summary": "encouraging 2-3 sentence summary highlighting progress and one key insight",
  "accuracy": {"overall": ${accuracy.overall}, "byType": ${JSON.stringify(accuracy.byType)}},
  "weakWords": [
    {"word": "word", "errors": 3, "pattern": "specific error pattern (e.g., confuses に/で)"}
  ],
  "strongWords": [
    {"word": "word", "streak": 5}
  ],
  "recommendations": [
    {"type": "review|practice|new", "priority": 1, "description": "specific actionable recommendation", "words": ["word1", "word2"]}
  ],
  "nextSessionFocus": "one sentence: what to focus on next session"
}

RULES:
- summary: positive, specific, references actual data
- weakWords: max 5, from actual errors, pattern = actionable insight
- strongWords: max 5, from actual streaks
- recommendations: 3-5, prioritized, type = review (revisit), practice (drill), new (learn)
- nextSessionFocus: concrete, one thing
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    summarizeInteractions(interactions) {
        const patterns = {};
        interactions.forEach(i => {
            i.userActions?.forEach(a => {
                const key = `${i.role}:${a.type}`;
                patterns[key] = (patterns[key] || 0) + 1;
            });
        });
        return Object.entries(patterns).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}:${v}`).join(', ');
    }
});
// Extracted LLMService bindings
// Attach to LLMService for easy access
LLMService.prototype.validator = null;
LLMService.prototype.initValidator = function() {
    this.validator = new LLMResponseValidator(this);
};

// Replace existing methods with validated + critic versions
LLMService.prototype.findClozeMatch = async function(sentence, target, langCode, level) {
    if (!this.validator) this.initValidator();
    const cached = await this.getFromCache(sentence, target, langCode);
    if (cached !== null && cached !== '') return cached;
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'clozeMatch',
        this.validator.buildClozePrompt.bind(this.validator),
        level, langCode,
        sentence, target, langCode, level
    );

    if (result.data) await this.setCache(sentence, target, langCode, result.data.match);
    return result.data?.match || null;
};

/**
 * Generates a novel sentence containing the target word, and identifies the exact matched string.
 * @param {string} target - The vocabulary word
 * @param {string} langCode - Language code
 * @param {string} level - Optional CEFR level
 * @returns {Promise<{sentence: string, match: string}|null>}
 */
LLMService.prototype.generateClozeSentence = async function(target, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'generatedCloze',
        this.validator.buildGeneratedClozePrompt.bind(this.validator),
        level, langCode,
        target, langCode, level
    );

    return result.data || null;
};


LLMService.prototype.getGrammarExplanation = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'grammarExplanation',
        this.validator.buildGrammarPrompt.bind(this.validator),
        level, langCode,
        word, context, langCode, level
    );

    if (!result.data) return null;
    return `GRAMMAR: ${result.data.grammar}\nUSAGE: ${result.data.usage}\nEXAMPLE: ${result.data.example}`;
};

LLMService.prototype.getListeningPassage = async function(words, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'listeningPassage',
        this.validator.buildListeningPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level
    );

    if (!result.data) return null;
    return {
        passage: result.data.passage,
        question: {
            text: result.data.question,
            choices: result.data.choices,
            correct: result.data.answer
        },
        raw: JSON.stringify(result.data),
        critiqueScore: result.critiqueScore
    };
};

LLMService.prototype.getGrammarExercise = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    const onProgress = arguments[4];
    const vocabId = arguments[5];
    const result = await this.validator.generateWithCritic(
        'grammarExercise',
        this.validator.buildGrammarExercisePrompt.bind(this.validator),
        level, langCode,
        word, context, langCode, level, onProgress
    );
    if (!result.data) return null;
    const exercises = (result.data.exercises || []).map(ex => {
        const { labelA, labelB } = LLMService.resolveLabels(ex.type, ex.answer);
        return { ...ex, labelA, labelB };
    });
    const data = {
        grammar: result.data.grammar,
        usage: result.data.usage,
        example: result.data.example,
        exercises,
        raw: JSON.stringify(result.data),
        critiqueScore: result.critiqueScore
    };
    if (vocabId && langCode) {
        this.saveGrammarExercise(vocabId, langCode, data).catch(e => L('[Grammar] RTDB save failed:', e.message));
    }
    return data;
};

LLMService.prototype.saveGrammarExercise = async function(vocabId, langCode, data) {
    if (!db) { L('[Grammar] Save skipped: no db'); return; }
    if (!auth) { L('[Grammar] Save skipped: no auth'); return; }
    if (!auth.currentUser) { L('[Grammar] Save skipped: no currentUser'); return; }
    const token = Math.random().toString(36).slice(2, 8);
    const entry = {
        grammar: data.grammar,
        usage: data.usage,
        example: data.example,
        exercises: data.exercises,
        model: this.resolvedModel || 'unknown',
        ts: firebase.database.ServerValue.TIMESTAMP
    };
    try {
        await db.ref(`grammar_exercises/${vocabId}/${langCode}/${token}`).set(entry);
        L('[Grammar] Saved to RTDB:', vocabId, langCode, token);
    } catch(e) {
        L('[Grammar] RTDB save error:', e.message, 'code:', e.code);
    }
};

LLMService.prototype.loadCachedGrammarExercise = async function(vocabId, langCode) {
    if (!db) return null;
    try {
        const snap = await db.ref(`grammar_exercises/${vocabId}/${langCode}`).limitToLast(1).once('value');
        if (!snap.exists()) return null;
        let entry = null;
        snap.forEach(child => { entry = child.val(); });
        if (!entry || !entry.exercises || entry.exercises.length === 0) return null;
        const exercises = entry.exercises.map(ex => {
            const { labelA, labelB } = LLMService.resolveLabels(ex.type, ex.answer);
            return { ...ex, labelA, labelB };
        });
        L('[Grammar] Loaded cached from RTDB:', vocabId, langCode);
        return {
            grammar: entry.grammar,
            usage: entry.usage,
            example: entry.example,
            exercises,
            raw: JSON.stringify(entry),
            critiqueScore: null,
            fromCache: true
        };
    } catch(e) {
        L('[Grammar] Cache load failed:', e.message);
        return null;
    }
};

LLMService.prototype.generateStory = async function(storyWords, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'storyWithQuestions',
        this.validator.buildStoryPrompt.bind(this.validator),
        level, langCode,
        storyWords, langCode, level
    );

    if (result.data) {
        result.data.critiqueScore = result.critiqueScore;
    }
    return result.data;
};

// ============================================================
// NEW ROLE METHODS — App-specific AI roles with critic validation
// ============================================================

LLMService.prototype.generateParagraph = async function(words, langCode, level, topic = 'daily life') {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'paragraph',
        this.validator.buildParagraphPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level, topic
    );

    return result.data;
};

LLMService.prototype.generateQuiz = async function(words, langCode, level, types = ['multiple_choice', 'fill_blank'], count = 5) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'quiz',
        this.validator.buildQuizPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level, types, count
    );

    return result.data;
};

LLMService.prototype.generateExplanation = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'explanation',
        this.validator.buildExplanationPrompt.bind(this.validator),
        level, langCode,
        word, context, langCode, level
    );

    return result.data;
};

LLMService.prototype.generateConversation = async function(words, langCode, level, scenario = 'daily conversation') {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'conversation',
        this.validator.buildConversationPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level, scenario
    );

    return result.data;
};

LLMService.prototype.generateFeedback = async function(sessionData) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'feedback',
        this.validator.buildFeedbackPrompt.bind(this.validator),
        sessionData.level, sessionData.langCode,
        sessionData
    );

    return result.data;
};

// Export for non-module environments
