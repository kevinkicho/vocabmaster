// Extracted LLM UI Helpers from ui.js
Object.assign(UIManager.prototype, {
    // --- LLM Settings Helpers ---
    updateLLMStatus(connected) {
        const dot = document.getElementById('llm-status-dot');
        const text = document.getElementById('llm-status-text');
        if (!dot || !text) return;
        if (connected) {
            dot.style.background = '#10b981';
            text.innerText = 'Connected';
            text.style.color = '#10b981';
        } else {
            dot.style.background = '#f43f5e';
            text.innerText = 'Not Reachable';
            text.style.color = '#f43f5e';
        }
    },

    updateLLMCacheCount() {
        const el = document.getElementById('llm-cache-count');
        if (!el || !app.llm) return;
        app.llm.getCacheCount().then(n => { el.innerText = `Cache: ${n} entries`; });
    },

    renderLLMSetupGuide() {
        const el = document.getElementById('llm-setup-guide');
        if (!el) return;
        el.innerHTML = `
            <p class="font-bold text-slate-600 dark:text-neutral-300">Setup (Cloud or Local):</p>
            <p class="text-[9px] mb-1"><b>Local (ollama4android on device, recommended for APK):</b></p>
            <ol class="list-decimal ml-4 space-y-1 text-[9px]">
                <li>Run ollama4android, load your model (e.g. gemma), ensure it listens on port 11434</li>
                <li>In <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[8px]">public/js/ollama_config.js</code> set:
                    <br><code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[8px]">window.OLLAMA_ENDPOINT = "http://127.0.0.1:11434";</code>
                    <br><code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[8px]">window.OLLAMA_USE_CLOUD = false;</code></li>
                <li>Rebuild APK. App will connect directly to local Ollama on device (no internet/key needed for local).</li>
            </ol>
            <p class="text-[9px] mt-2 mb-1"><b>Cloud (for web + parity):</b></p>
            <ol class="list-decimal ml-4 space-y-1 text-[9px]">
                <li>Create free account at <a href="https://ollama.com/cloud" target="_blank" class="underline text-cyan-500">ollama.com/cloud</a></li>
                <li>Get API key</li>
                <li>Set in ollama_config.js: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[8px]">window.OLLAMA_USE_CLOUD = true; window.OLLAMA_API_KEY = "...";</code></li>
            </ol>
            <p class="mt-1 text-[8px] text-slate-400">Config is gitignored. For local on-device, http://127.0.0.1:11434 works from the APK WebView.</p>`;
    },

    dumpVoices() {
        const voices = app.audio ? app.audio.voices : [];
        if (voices.length === 0) { alert('No voices loaded yet. Tap Detect first, then Dump.'); return; }
        const sample = voices.slice(0, 10).map(v => ({
            name: v.name,
            lang: v.lang,
            voiceURI: v.voiceURI,
            localService: v.localService,
            default: v.default
        }));
        const text = JSON.stringify(sample, null, 2)
            + '\n\n--- Total: ' + voices.length + ' voices ---\n'
            + '\nAll voiceURIs:\n' + voices.map(v => v.voiceURI).join('\n');
        L(text);
        const container = document.getElementById('voice-selector-container');
        if (container) {
            const existing = container.querySelector('#voice-raw-dump');
            if (existing) existing.remove();
            container.insertAdjacentHTML('beforeend', `<textarea id="voice-raw-dump" readonly class="w-full h-40 bg-black text-green-400 text-[9px] font-mono p-2 rounded-lg mt-2 resize-none" onclick="this.select()">${text.replace(/</g,'&lt;')}</textarea>`);
        }
    },

    renderVoiceSelector() {
        const container = document.getElementById('voice-selector-container');
        if (!container || container.offsetParent === null) return;
        if (typeof LANG_CONFIG === 'undefined') return;

        const hasSynth = !!(app.audio && (app.audio.synth || app.audio.useNative));
        const voices = app.audio ? app.audio.voices : [];
        const voiceCount = voices.length;

        const selectedVoices = this.store.prefs.selectedVoices || {};
        let html = '';

        html += `<div class="flex items-center justify-between mb-2">
            <span class="text-[10px] text-slate-400"><span id="vox-info">${hasSynth ? (voiceCount ? voiceCount + ' voices found' : '0 voices yet') : 'TTS unavailable'}</span></span>
            <div class="flex gap-1">
            <button onclick="app.audio.forceDetect()" class="text-[10px] font-bold text-pink-500 hover:text-pink-600 bg-pink-50 dark:bg-pink-900/20 px-2 py-1 rounded-lg uppercase active:scale-95 transition-all">Detect</button>
            <button onclick="app.ui.dumpVoices()" class="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-neutral-700 px-2 py-1 rounded-lg uppercase active:scale-95 transition-all">Dump</button>
            </div>
        </div>`;

        if (!hasSynth) {
            html += `<p class="text-[10px] text-rose-400 text-center p-3">Your browser does not support speech synthesis. Try Chrome, Edge, or Samsung Internet.</p>`;
            container.innerHTML = html;
            return;
        } else if(voices.length === 0) {
            html += `<p class="text-[10px] text-slate-400 text-center p-3">Press <b>Detect Voices</b> above. On Android, TTS voices only load after user interaction — tapping the button will trigger detection.</p>
            <p class="text-[10px] text-slate-400 text-center p-2"><b>Note:</b> Also check Settings → General Management → Text-to-speech → tap gear ⚙ → Install voice data. You may need to download language packs for voices to appear.</p>`;
            container.innerHTML = html;
            return;
        }

        const getProviderName = (voice) => {
            if (voice.provider) return voice.provider;
            const uri = (voice.voiceURI || '').toLowerCase();
            const name = (voice.name || '').toLowerCase();
            const combined = uri + ' ' + name;
            if (/google|com\.google\.android\.tts/i.test(combined)) return 'Google';
            if (/samsung|com\.samsung/i.test(combined)) return 'Samsung';
            if (/microsoft|edge.*tts/i.test(combined)) return 'Microsoft';
            if (/apple|com\.apple/i.test(combined)) return 'Apple';
            if (voice.localService) return 'Local';
            return 'Network';
        };

        // Map TTS lang codes to our config lang keys (handles BCP-47, ISO 639-3, etc.)
        const ttsCodeMap = {
            'ja': ['ja'], 'ja-JP': ['ja'],
            'ko': ['ko'], 'ko-KR': ['ko'],
            'en': ['en'], 'en-US': ['en'], 'en-GB': ['en'],
            'zh': ['zh'], 'zh-CN': ['zh'], 'zh-TW': ['zh'], 'zh-HK': ['zh'],
            'cmn': ['zh'], 'yue': ['zh'], 'zho': ['zh'],
            'es': ['es'], 'es-ES': ['es'], 'es-MX': ['es'],
            'pt': ['pt'], 'pt-BR': ['pt'], 'pt-PT': ['pt'],
            'it': ['it'], 'it-IT': ['it'],
            'fr': ['fr'], 'fr-FR': ['fr'], 'fr-CA': ['fr'],
            'de': ['de'], 'de-DE': ['de'],
            'ru': ['ru'], 'ru-RU': ['ru'],
        };

        const matchLang = (voiceLang) => {
            if (!voiceLang) return [];
            const normalized = voiceLang.toLowerCase().replace(/_/g, '-');
            const parts = normalized.split('-');
            const iso1 = parts[0];
            const iso2 = parts.length >= 2 ? parts[0] + '-' + parts[1] : null;
            const results = [];
            if (ttsCodeMap[normalized]) results.push(...ttsCodeMap[normalized]);
            if (iso2 && ttsCodeMap[iso2]) results.push(...ttsCodeMap[iso2]);
            if (ttsCodeMap[iso1]) results.push(...ttsCodeMap[iso1]);
            return [...new Set(results)];
        };

        let anyDropdown = false;
        LANG_CONFIG.filter(l => !l.visualOnly).forEach(l => {
            const langVoices = voices.filter(v => {
                const matched = matchLang(v.lang);
                return matched.includes(l.key);
            });

            anyDropdown = true;
            const currentSelected = selectedVoices[l.key] || '';
            const providerGroups = new Map();
            langVoices.forEach(v => {
                const provider = getProviderName(v);
                if (!providerGroups.has(provider)) providerGroups.set(provider, []);
                providerGroups.get(provider).push(v);
            });
            const useGroups = providerGroups.size > 1;

            html += `<div class="mb-3">
                <div class="flex items-center gap-2 mb-2">
                    <span>${l.icon}</span>
                    <span class="text-xs font-bold text-slate-600 dark:text-neutral-300">${l.label}</span>
                    <span class="text-[9px] text-slate-400">(${langVoices.length})</span>
                </div>
                <select id="voice-select-${l.key}" onchange="if(this.value)app.audio.previewVoice(this.value,'${l.key}')" class="w-full text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-2 py-1.5 outline-none text-slate-700 dark:text-neutral-200">
                    <option value="">Auto (System Default)</option>`;

            if (langVoices.length > 0) {
                if (useGroups) {
                    providerGroups.forEach((providerVoices, provider) => {
                        html += `<optgroup label="${provider}">`;
                        providerVoices.forEach(v => {
                            html += `<option value="${escapeHtml(v.voiceURI)}" ${v.voiceURI === currentSelected ? 'selected' : ''}>${escapeHtml(v.name)} (${v.lang})</option>`;
                        });
                        html += `</optgroup>`;
                    });
                } else {
                    langVoices.forEach(v => {
                        html += `<option value="${escapeHtml(v.voiceURI)}" ${v.voiceURI === currentSelected ? 'selected' : ''}>${escapeHtml(v.name)} (${v.lang})</option>`;
                    });
                }
            }

            html += `</select></div>`;
        });

        // Debug: show all voice lang codes
        const rawLangs = [...new Set(voices.map(v => v.lang))].sort();
        html += `<div class="mt-3 p-2 bg-slate-100 dark:bg-neutral-800 rounded-lg"><p class="text-[9px] font-bold text-slate-400 uppercase mb-1">All detected lang codes (${rawLangs.length})</p><p class="text-[9px] text-slate-500 dark:text-neutral-400 break-all leading-relaxed">${rawLangs.join(', ')}</p></div>`;

        const isAndroid = /Android/i.test(navigator.userAgent);
        const isNative = app.audio && app.audio.useNative;

        if (isNative) {
            html += `<div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg mb-2 border border-emerald-200 dark:border-emerald-900/40">
                <p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Voice selection is managed by Android</p>
                <p class="text-[9px] text-emerald-600 dark:text-emerald-500 mt-1">To change your TTS voice: <b>Settings → General Management → Text-to-speech output → Preferred engine</b>, then tap gear ⚙ to choose a voice.</p>
            </div>`;
        } else if (isAndroid) {
            html += `<div class="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
                <p class="text-[9px] text-amber-700 dark:text-amber-400 font-bold">Android Chrome limitation</p>
                <p class="text-[9px] text-amber-600 dark:text-amber-500 mt-1">Voice selection may not work on Android Chrome. To change your TTS engine, go to: <b>Android Settings → General Management → Text-to-speech output → Preferred engine</b> and pick Google or Samsung TTS.</p>
            </div>`;
        }

        container.innerHTML = html;
    },

    async renderAISettings() {
        // Populate model dropdown from available models
        const modelSelect = document.getElementById('llm-model');
        const modelContainer = modelSelect ? modelSelect.parentElement : null;
        if (app.llm && !app.llm.useCloud) {
            // For local ollama4android, no model choice in app — user selects in ollama4android
            if (modelContainer) modelContainer.style.display = 'none';
        } else if (modelSelect && app.llm && app.llm.availableModels && app.llm.availableModels.length > 0) {
            const current = app.llm.resolvedModel || app.store.prefs.llmModel || '';
            const models = [...new Set(app.llm.availableModels)].sort();
            modelSelect.innerHTML = models.map(m =>
                `<option value="${escapeHtml(m)}" ${m === current ? 'selected' : ''}>${escapeHtml(m)}</option>`
            ).join('');
            modelSelect.onchange = () => {
                app.store.prefs.llmModel = modelSelect.value;
                app.llm.resolvedModel = modelSelect.value;
                app.store.saveSettings();
            };
            if (modelContainer) modelContainer.style.display = '';
        }

        // Update status dot
        const dot = document.getElementById('llm-status-dot');
        const text = document.getElementById('llm-status-text');
        if (dot && text && app.llm) {
            if (app.llm.hasModel) {
                dot.style.background = '#10b981';
                text.textContent = `Ready — ${app.llm.resolvedModel || 'model loaded'}`;
            } else if (app.llm.available) {
                dot.style.background = '#f59e0b';
                text.textContent = 'Connected — no model selected';
            } else {
                dot.style.background = '#94a3b8';
                const ep = (app.llm && app.llm.endpoint) || '';
                const isLocal = ep.includes('127.0.0.1') || ep.includes('localhost') || ep.startsWith('http://');
                text.textContent = isLocal ? 'Local Ollama — checking 11434...' : 'Cloud API — checking...';
            }
        }

        // AI improvement section (existing)
        const aiH3 = Array.from(document.querySelectorAll('#modal-settings details h3')).find(h => h.textContent.includes('AI (CLOZE & STORY)'));
        const aiSection = aiH3 ? aiH3.parentElement.parentElement : null;
        if (!aiSection) return;

        let container = aiSection.querySelector('#ai-improve-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ai-improve-container';
            // Append after the guide to avoid polluting the #llm-setup-guide content (prevents CSS class leakage like space-y-2, dark:text-neutral-400 appearing as text).
            const guide = aiSection.querySelector('#llm-setup-guide');
            if (guide && guide.parentNode) {
                guide.parentNode.insertBefore(container, guide.nextSibling);
            } else {
                const contentDiv = aiSection.querySelector('div.p-4') || aiSection.lastElementChild;
                if (contentDiv) contentDiv.appendChild(container);
            }
        }

        const sessionCount = app.learningLoop ? await app.learningLoop.getSessionCount() : 0;
        const pending = app.learningLoop ? await app.learningLoop.getPendingAdjustments() : [];
        const activePending = pending.filter(a => !a.approved && !a.dismissed);

        let html = '<div class="h-px bg-slate-200 dark:bg-neutral-700 mt-3 mb-2"></div>';
        html += '<h4 class="text-[10px] font-black text-purple-500 uppercase tracking-widest flex items-center gap-1.5 mb-2"><i class="ph-bold ph-sparkle"></i> Improve My AI</h4>';
        html += `<p class="text-[10px] text-slate-400 mb-2">${sessionCount} sessions recorded. AI learns from your interactions to improve future content.</p>`;

        if (activePending.length > 0) {
            html += '<div class="space-y-2 mb-3">';
            html += '<p class="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase">Suggestions awaiting approval</p>';
            activePending.forEach(adj => {
                const changeSummary = adj.changes.map(c => {
                    const label = c.var.replace(/([A-Z])/g, ' $1').toLowerCase();
                    return `${label}: ${c.from} → <b>${c.to}</b>`;
                }).join(', ');
                html += `<div class="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-900/40">
                    <p class="text-[10px] font-bold text-amber-800 dark:text-amber-300 capitalize">${adj.role.replace(/([A-Z])/g,' $1')}</p>
                    <p class="text-[9px] text-amber-600 dark:text-amber-400">${changeSummary}</p>
                    <p class="text-[9px] text-slate-400 italic">${escapeHtml(adj.adjustmentText || '')}</p>
                    <div class="flex gap-2 mt-1.5">
                        <button onclick="app.ui.approveAIAdjustment('${adj.id}')" class="px-2 py-1 rounded text-[9px] font-bold text-white bg-emerald-500 active:scale-95 transition-transform">Apply</button>
                        <button onclick="app.ui.dismissAIAdjustment('${adj.id}')" class="px-2 py-1 rounded text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-neutral-600 active:scale-95 transition-transform">Dismiss</button>
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        html += '<div class="flex gap-2">';
        html += `<button id="btn-run-ai-analysis" onclick="app.ui.runAIAnalysis()" class="flex-1 px-3 py-2 rounded-xl text-[10px] font-bold text-white bg-gradient-to-r from-purple-500 to-indigo-500 active:scale-95 transition-transform shadow">
            <i class="ph-bold ph-magnifying-glass mr-1"></i> Analyze ${sessionCount >= 3 ? 'Now' : 'Need 3+ sessions'}
        </button>`;
        html += `<button id="btn-reset-ai" onclick="app.ui.resetAITemplates()" class="px-3 py-2 rounded-xl text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-neutral-700 active:scale-95 transition-transform">
            <i class="ph-bold ph-arrow-counter-clockwise mr-1"></i> Reset
        </button>`;
        html += '</div>';

        container.innerHTML = html;

        const btn = document.getElementById('btn-run-ai-analysis');
        if (btn && sessionCount < 3) btn.classList.add('opacity-50', 'cursor-not-allowed');
    },

    async runAIAnalysis() {
        if (!app.llm || !app.llm.available || !app.llm.hasModel) {
            alert('AI not connected. For local ollama4android set OLLAMA_ENDPOINT=http://127.0.0.1:11434 in ollama_config.js (no key). For cloud use the key. Then tap Retry or reopen Settings.');
            return;
        }
        const btn = document.getElementById('btn-run-ai-analysis');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin mr-1"></i> Analyzing...'; }
        try {
            const analysis = await app.llm.analyzeLearningPatterns();
            if (!analysis) {
                alert('Not enough data yet. Keep using the app for at least 3 sessions.');
                return;
            } else if(analysis.recommendations && analysis.recommendations.length > 0) {
                const promptAdjustments = {};
                analysis.recommendations.forEach(r => {
                    const role = r.type === 'review' ? 'quiz' : r.type === 'practice' ? 'storyWithQuestions' : 'paragraph';
                    promptAdjustments[role] = r.description;
                });
                await app.llm.applyPromptAdjustments(promptAdjustments);
                alert(`Analysis complete! ${analysis.recommendations.length} suggestions ready for your review.`);
            } else {
                alert('Analysis ran but no adjustments needed. Your AI prompts are well-tuned!');
            }
        } catch(e) {
            L('[AI Settings] Analysis failed:', e);
            alert('Analysis failed: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-magnifying-glass mr-1"></i> Analyze Now'; }
            this.renderAISettings();
        }
    },

    async approveAIAdjustment(id) {
        if (!app.learningLoop) return;
        await app.learningLoop.approveAdjustment(id);
        this.renderAISettings();
    },

    async dismissAIAdjustment(id) {
        if (!app.learningLoop) return;
        await app.learningLoop.dismissAdjustment(id);
        this.renderAISettings();
    },

    async resetAITemplates() {
        if (!confirm('Reset all AI prompt templates to defaults? This cannot be undone.')) return;
        if (!app.learningLoop) return;
        await app.learningLoop.resetAllTemplates();
        this.renderAISettings();
        alert('AI templates reset to defaults.');
    },

    showPromptTuningBanner(changes) {
        if (document.getElementById('prompt-tuning-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'prompt-tuning-banner';
        banner.className = 'fixed top-16 left-0 right-0 z-40 mx-4';
        banner.innerHTML = `<div class="bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-2xl p-3 shadow-lg flex items-center gap-2 active:opacity-90">
            <i class="ph-bold ph-sparkle"></i>
            <span class="text-[11px] font-bold flex-1">AI suggests prompt improvements</span>
            <button id="prompt-tuning-review" class="px-3 py-1 rounded-lg text-[10px] font-black bg-white/20 active:scale-95 transition-transform">Review</button>
        </div>`;
        document.body.appendChild(banner);
        document.getElementById('prompt-tuning-review').onclick = () => {
            banner.remove();
            app.modal(true);
        };
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
    }
});
