// Extracted Settings Logic from ui.js
Object.assign(UIManager.prototype, {
    loadSettings() {
        const p = this.store.prefs;
        try {
            // Inject static settings HTML if needed (from settings_html.js)
            const settingsList = document.getElementById('settings-list');
            if (settingsList && settingsList.innerHTML.trim() === '' && window.SETTINGS_HTML) {
                settingsList.innerHTML = window.SETTINGS_HTML;
            }
            this.renderPresetsUI(); this.renderThemeGrid();
            this.renderFontsAccordion();
            this.renderAISettings();
            this.ensureActivitySections();  // generate from schema to reduce HTML bloat
            this.renderSettingsUI(); 

            // Write all DOM-bound preferences using the registry (replaces 60+ setChk/setVal calls)
            // Leverages writePrefToDom helper for single source of truth + robustness
            if (typeof getAllPrefs === 'function') {
                const allPrefs = getAllPrefs(typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG : []);
                for (const entry of allPrefs) {
                    try {
                        if (!entry.domId) continue;
                        const val = p[entry.key];
                        if (val === undefined || val === null) continue;
                        if (typeof writePrefToDom === 'function') {
                            writePrefToDom(entry, val);
                        } else {
                            // Fallback (legacy path)
                            const el = document.getElementById(entry.domId);
                            if (!el) continue;
                            switch (entry.type) {
                                case 'bool': el.checked = val; break;
                                case 'radio': {
                                    const rad = document.querySelector('input[name="' + entry.domId + '"][value="' + val + '"]');
                                    if (rad) {
                                        rad.checked = true;
                                        if (typeof this._syncRadioVisual === 'function') this._syncRadioVisual(entry.domId);
                                    }
                                    break;
                                }
                                default: el.value = val;
                            }
                        }
                    } catch(e) { /* per-pref robustness */ }
                }
            }

            this.applyFontSettings();
            this.renderLLMSetupGuide();
            if (app.llm) { this.updateLLMStatus(app.llm.available && app.llm.hasModel); this.updateLLMCacheCount(); }
            this.renderVoiceSelector();
        } catch(e) { L("Error loading settings UI:", e); }
    },

    // Dev / robustness helper (call from console: app.ui.validateSettingsBindings())
    validateSettingsBindings() {
        if (typeof getAllPrefs !== 'function') { console.warn('No registry'); return; }
        const all = getAllPrefs(typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG : []);
        const missing = [];
        all.forEach(e => {
            if (!e.domId) return;
            if (!document.getElementById(e.domId)) missing.push(e.key + ' (' + e.domId + ')');
        });
        if (missing.length) {
            console.warn('Settings DOM missing for registry keys:', missing);
        } else {
            console.log('All registry-bound DOM ids present in current document.');
        }
        return missing;
    },

    renderFontsAccordion() {
        const settingsList = document.getElementById('settings-list');
        if(!document.getElementById('accordion-fonts') && settingsList) {
            const div = document.createElement('div');
            div.id = 'accordion-fonts';
            div.className = "border border-slate-200 dark:border-neutral-700 rounded-2xl overflow-hidden mb-4 bg-white dark:bg-neutral-800";
            div.innerHTML = `
                <button onclick="this.parentElement.classList.toggle('open')" class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-neutral-800 hover:bg-slate-100 dark:hover:bg-neutral-700 transition-colors">
                    <span class="text-sm font-bold text-slate-600 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-2"><i class="ph-bold ph-text-aa"></i> Fonts</span>
                    <i class="ph-bold ph-caret-down text-slate-400 transition-transform duration-300 transform group-open:rotate-180"></i>
                </button>
                <div class="hidden p-4 space-y-4 border-t border-slate-100 dark:border-neutral-700 content">
                    <div class="flex flex-col">
                        <span class="text-[9px] uppercase font-bold text-slate-400 mb-1">Family</span>
                        <select id="app-font" class="w-full bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200">
                            <option value="sans">Modern (Sans)</option>
                            <option value="serif">Book (Serif)</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col">
                            <span class="text-[9px] uppercase font-bold text-slate-400 mb-1">Style</span>
                            <select id="app-font-style" class="w-full bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200">
                                <option value="normal">Normal</option>
                                <option value="italic">Italic</option>
                                <option value="oblique">Oblique</option>
                            </select>
                        </div>
                        <div class="flex flex-col">
                            <span class="text-[9px] uppercase font-bold text-slate-400 mb-1">Weight</span>
                            <select id="app-font-weight" class="w-full bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200">
                                <option value="lighter">Lighter</option>
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                                <option value="bolder">Bolder</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
            const btn = div.querySelector('button');
            const content = div.querySelector('.content');
            btn.onclick = () => {
                const isOpen = !content.classList.contains('hidden');
                if(isOpen) { content.classList.add('hidden'); btn.querySelector('.ph-caret-down').style.transform = 'rotate(0deg)'; } 
                else { content.classList.remove('hidden'); btn.querySelector('.ph-caret-down').style.transform = 'rotate(180deg)'; }
            };
            div.querySelectorAll('select').forEach(s => {
                s.onchange = () => {
                    if(app.store) {
                        app.store.prefs.font = document.getElementById('app-font').value;
                        app.store.prefs.fontStyle = document.getElementById('app-font-style').value;
                        app.store.prefs.fontWeight = document.getElementById('app-font-weight').value;
                        app.ui.applyFontSettings();
                        app.store.saveSettings();
                    }
                }
            });
            const anchor = settingsList.children[1];
            if (anchor && anchor.nextSibling) {
                settingsList.insertBefore(div, anchor.nextSibling);
            } else {
                settingsList.appendChild(div);
            }
        }
    },

    applyFontSettings() {
        const p = app.store.prefs;
        document.documentElement.setAttribute('data-font', p.font || 'sans');
        document.body.style.fontStyle = p.fontStyle || 'normal';
        const wMap = { 'lighter': '300', 'normal': '400', 'bold': '700', 'bolder': '900' };
        document.documentElement.style.setProperty('--font-weight-base', wMap[p.fontWeight] || '400');
    },

    renderThemeGrid() { const container = document.getElementById('theme-grid'); if(!container) return; const themes = [{ id: 'classic', color: '#6366f1', label: 'Classic' }, { id: 'sakura',  color: '#ec4899', label: 'Sakura' }, { id: 'ocean',   color: '#14b8a6', label: 'Ocean' }, { id: 'coffee',  color: '#f59e0b', label: 'Coffee' }, { id: 'cyber',   color: '#06b6d4', label: 'Cyber' }]; const cur = this.store.prefs.theme || 'classic'; container.innerHTML = themes.map(t => { const isActive = t.id === cur; const ring = isActive ? `ring-2 ring-offset-2 ring-${t.id === 'classic' ? 'indigo' : 'gray'}-400 dark:ring-offset-neutral-800` : ''; return `<button onclick="app.store.setTheme('${t.id}')" class="flex flex-col items-center gap-1 group"><div class="w-8 h-8 rounded-full shadow-sm border border-slate-200 dark:border-neutral-600 ${ring} transition-all active:scale-95" style="background-color: ${t.color}"></div><span class="text-[9px] font-bold text-slate-500 dark:text-neutral-400 ${isActive?'text-indigo-600 dark:text-indigo-400':''}">${t.label}</span></button>`; }).join(''); },
    renderPresetsUI() { const container = document.getElementById('preset-container'); if(!container) return; if(!window.app.presets) return; const langs = window.app.presets.languages; const opts = langs.map(l => `<option value="${l.key}">${l.label} ${l.icon}</option>`).join(''); const p = this.store.prefs; const curSource = p.presetSource || 'en'; const curTarget = p.presetTarget || 'ja'; container.innerHTML = `<div class="grid grid-cols-2 gap-3 mb-3"><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I know...</span><select id="preset-source" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200">${opts}</select></div><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I want to learn...</span><select id="preset-target" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200"><option value="" disabled selected>Select...</option>${opts}</select></div></div><button onclick="app.presets.apply(document.getElementById('preset-source').value, document.getElementById('preset-target').value)" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 rounded-xl text-sm shadow-md active:scale-95 active:bg-indigo-700 active:shadow-inner active:brightness-90 transition-all duration-100">Apply Preset</button>`; const src = document.getElementById('preset-source'); const tgt = document.getElementById('preset-target'); if(src) src.value = curSource; if(tgt) tgt.value = curTarget; },
    // --- Shared helpers for settings dropdowns/grids (used by sub-renderers) ---
    createOpts(selId, selectedVal, hideVisuals = false) {
        const el = document.getElementById(selId);
        if (!el) return;
        const list = hideVisuals ? LANG_CONFIG.filter(l => !l.visualOnly) : LANG_CONFIG;
        let html = '<option value="">(None)</option>';
        html += list.map(l => {
            let str = `<option value="${l.key}" ${l.key===selectedVal?'selected':''}>${l.label}</option>`;
            if (l.exKey) {
                str += `<option value="${l.exKey}" ${l.exKey===selectedVal?'selected':''}>↳ ${l.label} (Example)</option>`;
            }
            return str;
        }).join('');
        el.innerHTML = html;
    },

    createGrid(containerId, prefixKey) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const p = this.store.prefs;
        const list = LANG_CONFIG.filter(l => !l.visualOnly);
        el.innerHTML = list.map(l => {
            const id = `${prefixKey}-${l.key}`;
            const pref = `${prefixKey}_${l.key}`;
            return `<label class="flex flex-col items-center justify-center p-2 bg-slate-50 dark:bg-neutral-800 rounded border border-slate-200 dark:border-neutral-700 cursor-pointer hover:border-indigo-300 transition-colors">
                <span class="text-[9px] font-black uppercase mb-1">${l.code.toUpperCase()}</span>
                <div class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="${id}" class="sr-only peer" ${p[pref]!==false ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </div>
            </label>`;
        }).join('');
    },

    // --- Per-activity settings sections (Phase 1 of registry cleanup) ---
    renderFlashcardSettings(p) {
        this.createOpts('flash-front', p.flashFront);
        this.createOpts('flash-back-1', p.flashBack1);
        this.createOpts('flash-back-2', p.flashBack2);
        this.createOpts('flash-back-3', p.flashBack3);
        this.createOpts('flash-back-4', p.flashBack4);
        this.createOpts('flash-audio-src', p.flashAudioSrc, true);
    },

    renderQuizSettings(p) {
        this.createOpts('quiz-q-type', p.quizQ);
        this.createOpts('quiz-a-type', p.quizA);
        this.createOpts('quiz-audio-src', p.quizAudioSrc, true);
        this.createOpts('quiz-ex-main', p.quizExMain, true);
        this.createOpts('quiz-ex-sub', p.quizExSub, true);
    },

    renderTFSettings(p) {
        this.createOpts('tf-front', p.tfFront);
        this.createOpts('tf-back', p.tfBack);
        this.createOpts('tf-audio-src', p.tfAudioSrc, true);
        this.createOpts('tf-ex-main', p.tfExMain, true);
        this.createOpts('tf-ex-sub', p.tfExSub, true);
    },

    renderVoiceSettings(p) {
        this.createOpts('voice-disp-front', p.voiceDispFront);
        this.createOpts('voice-disp-back', p.voiceDispBack);
        this.createOpts('voice-audio-target', p.voiceAudioTarget, true);
        this.createOpts('voice-ex-main', p.voiceExMain, true);
    },

    renderSentencesSettings(p) {
        this.createOpts('sentences-q', p.sentencesQ);
        this.createOpts('sentences-a', p.sentencesA);
        this.createOpts('sentences-trans', p.sentencesTrans);
        this.createOpts('sentences-audio-src', p.sentencesAudioSrc, true);
        this.createOpts('sentences-bottom-lang', p.sentencesBottomLang, true);

        const snDispEl = document.getElementById('sentences-bottom-disp');
        if (snDispEl) {
            snDispEl.innerHTML = `
                <option value="none">None</option>
                <option value="sentence_masked">Sentence (Masked)</option>
                <option value="sentence_full">Sentence (Full)</option>
                <option value="word_masked">Word (Masked)</option>
                <option value="word_full">Word (Full)</option>`;
            snDispEl.value = p.sentencesBottomDisp || 'sentence_masked';
        }
    },

    renderGrammarSettings(p) {
        this.createOpts('grammar-q', p.grammarQ);
        this.createOpts('grammar-a', p.grammarA);
    },

    renderMatchSettings(p) {
        const matchFilterContainer = document.getElementById('container-match-filters');
        if (matchFilterContainer) {
            matchFilterContainer.innerHTML = LANG_CONFIG.map(l => {
                const id = `match-show-${l.key}`;
                const prefKey = `matchShow${this.store.cap(l.key)}`;
                return `<label class="p-2 bg-white dark:bg-neutral-700 rounded border border-slate-200 dark:border-neutral-700 flex flex-col items-center cursor-pointer select-none active:scale-95 transition-transform">
                    <span class="text-[9px] font-bold mb-1 truncate w-full text-center">${l.label}</span>
                    <input type="checkbox" id="${id}" class="accent-slate-600 w-3 h-3" ${p[prefKey] ? 'checked' : ''}>
                </label>`;
            }).join('');
        }

        this.createGrid('container-match-audio', 'matchAudio');
    },

    renderGlobalAudioGrid(p) {
        this.createGrid('container-btn-audio', 'btnAudio');
    },

    // Phase 2: generate activity sections from schema to reduce static HTML bloat in index.html
    // Data-driven from PREFERENCE_SCHEMA (getPrefsBySection). Robust detection prevents dupes
    // whether static HTML blocks (current) or future fully-generated mode is used.
    ensureActivitySections() {
        const list = document.getElementById('settings-list');
        if (!list) return;
        const activities = [
            { section: 'flash', title: 'Flashcards', icon: 'ph-cards', rep: 'flash-front' },
            { section: 'quiz', title: 'Quiz', icon: 'ph-question', rep: 'quiz-q-type' },
            { section: 'tf', title: 'True / False', icon: 'ph-check-circle', rep: 'tf-front' },
            { section: 'match', title: 'Matching', icon: 'ph-squares-four', rep: 'match-hint' },
            { section: 'voice', title: 'Voice', icon: 'ph-microphone', rep: 'voice-disp-front' },
            { section: 'sentences', title: 'Sentences', icon: 'ph-text-t', rep: 'sentences-q' },
            { section: 'grammar', title: 'Grammar Gym', icon: 'ph-lightbulb', rep: 'grammar-q' },
        ];
        activities.forEach(act => {
            let existing = document.getElementById(`section-${act.section}`);
            if (!existing && act.rep && document.getElementById(act.rep)) {
                existing = true; // static HTML block for this activity is present (has representative control) — skip to avoid dupes
            }
            if(existing) return;

            const prefs = (typeof getPrefsBySection === 'function') ? getPrefsBySection(act.section).filter(p => p.domId) : [];
            let html = `<details id="section-${act.section}" class="group bg-slate-50 dark:bg-neutral-800 rounded-2xl border border-slate-100 dark:border-neutral-700 overflow-hidden">`;
            html += `<summary class="flex justify-between items-center p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-neutral-700 transition-colors"><h3 class="text-xs font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2"><i class="ph-bold ${act.icon}"></i> ${act.title}</h3><i class="ph-bold ph-caret-down group-open:rotate-180 transition-transform"></i></summary>`;
            html += `<div class="p-4 pt-0 space-y-3 border-t border-slate-100 dark:border-neutral-700 mt-2">`;
            prefs.forEach(p => {
                if (p.type === 'select') {
                    html += `<div class="flex justify-between items-center mt-2"><span class="text-xs font-bold">${p.label}</span><select id="${p.domId}" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-2 py-1 outline-none"></select></div>`;
                } else if (p.type === 'bool') {
                    html += `<label class="flex justify-between items-center cursor-pointer mt-2"><span class="text-xs font-bold">${p.label}</span><input type="checkbox" id="${p.domId}" class="w-4 h-4 accent-indigo-600 rounded"></label>`;
                }
            });
            // Special containers needed by render*Settings for complex grids (match pool/audio etc.)
            if (act.section === 'match') {
                html += `<div class="h-px bg-slate-200 dark:bg-neutral-700"></div><p class="text-[10px] uppercase font-bold text-slate-400">Card Content Pool</p><div id="container-match-filters" class="grid grid-cols-3 gap-2"></div>`;
                html += `<div class="h-px bg-slate-200 dark:bg-neutral-700"></div><p class="text-[10px] uppercase font-bold text-slate-400">Enable Audio By Language</p><div id="container-match-audio" class="grid grid-cols-4 gap-2"></div>`;
            }
            html += `</div></details>`;
            // Insert at the end (before Developer section if it exists)
            const devSection = document.getElementById('details-developer');
            if (devSection && devSection.parentNode) {
                devSection.parentNode.insertBefore( (function(){ const t=document.createElement('div'); t.innerHTML=html; return t.firstChild; })() , devSection );
            } else {
                list.insertAdjacentHTML('beforeend', html);
            }
        });
    },


    renderSettingsUI() {
        const p = this.store.prefs;
        if (typeof LANG_CONFIG === 'undefined') return;

        // Clean sub-renderers (much easier to maintain + add new prefs)
        this.renderFlashcardSettings(p);
        this.renderQuizSettings(p);
        this.renderTFSettings(p);
        this.renderVoiceSettings(p);
        this.renderSentencesSettings(p);
        this.renderGrammarSettings(p);
        this.renderMatchSettings(p);
        this.renderGlobalAudioGrid(p);

        this.renderCelebGrid();

        // --- Dynamic / one-time field insertions (kept for compatibility) ---
        // Legacy insertion for back-3/4 kept for static HTML compatibility only.
        // When ensureActivitySections + schema fully owns (section-flash present or no static), these IDs come from generator and this block is a no-op.
        const back2 = document.getElementById('flash-back-2');
        if (back2 && !document.getElementById('flash-back-3')) {
            const parent = back2.parentElement.parentElement;
            if (parent) {
                const makeSel = (n) => `<div class="flex flex-col"><span class="text-[9px] uppercase font-bold mb-1">Back ${n}</span><select id="flash-back-${n}" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-1 py-1 outline-none"></select></div>`;
                parent.insertAdjacentHTML('beforeend', makeSel(3) + makeSel(4));
                this.createOpts('flash-back-3', p.flashBack3);
                this.createOpts('flash-back-4', p.flashBack4);
            }
        }

        const sentAudioSrc = document.getElementById('sentences-audio-src');
        if (sentAudioSrc && !document.getElementById('sentences-read-whole')) {
            const parent = sentAudioSrc.parentElement.parentElement;
            if (parent) {
                const toggleHtml = `<div class="flex items-center justify-between p-2 bg-slate-50 dark:bg-neutral-800 rounded border border-slate-200 dark:border-neutral-700 col-span-2"><span class="text-[9px] font-bold uppercase text-slate-500">Read Full Sentence</span><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="sentences-read-whole" class="sr-only peer" ${p.sentencesReadWhole ? 'checked' : ''}><div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div></label></div>`;
                parent.insertAdjacentHTML('beforeend', toggleHtml);
            }
        }

        const devDetails = document.getElementById('details-developer');
        if (devDetails) {
            if (this._isAdminUser()) devDetails.classList.remove('hidden');
            else devDetails.classList.add('hidden');
        }

        // Admin-only Memory / FSRS debug (inside Developer; no controls for non-admin)
        this.refreshMemoryDebugPanel();

        const logArea = document.getElementById('debug-log-area');
        if (logArea) logArea.value = '';
    },

    /**
     * Same gate as Developer tab / notes.isAdmin: custom claim or admin email.
     * @returns {boolean}
     */
    _isAdminUser() {
        try {
            if (window.app && window.app.auth && window.app.auth.userRole === 'admin') return true;
            if (window.app && window.app.notes && window.app.notes.isAdmin === true) return true;
            var user = (typeof auth !== 'undefined' && auth && auth.currentUser) ? auth.currentUser : null;
            if (user && !user.isAnonymous && user.email === 'kevinkicho@gmail.com') return true;
        } catch (_) { /* ignore */ }
        return false;
    },

    /**
     * Populate admin Memory / FSRS panel. No-op for non-admin (panel lives under hidden Developer).
     */
    refreshMemoryDebugPanel() {
        var panel = document.getElementById('admin-memory-panel');
        var el = document.getElementById('admin-memory-status');
        if (!panel || !el) return;

        if (!this._isAdminUser()) {
            panel.classList.add('hidden');
            el.textContent = '';
            return;
        }
        panel.classList.remove('hidden');

        var mem = window.app && window.app.memory;
        if (!mem || mem._isStub || typeof mem.getDebugSnapshot !== 'function') {
            // Fallback: read FSRS.REFERENCE even if MemoryService missing
            var refOnly = (typeof window !== 'undefined' && window.FSRS && window.FSRS.REFERENCE)
                ? window.FSRS.REFERENCE
                : null;
            var refLine = refOnly
                ? (refOnly.family || 'FSRS') + ' · ' + (refOnly.name || '?') + '@' + (refOnly.version || '?')
                : 'FSRS module not loaded';
            el.innerHTML =
                '<div><span class="text-slate-400">FSRS</span> ' + this._escDebug(refLine) + '</div>' +
                '<div class="text-amber-600 dark:text-amber-400">MemoryService unavailable (stub or not init)</div>';
            return;
        }

        var s;
        try {
            s = mem.getDebugSnapshot();
        } catch (e) {
            el.textContent = 'getDebugSnapshot failed: ' + (e && e.message ? e.message : e);
            return;
        }

        var fsrs = s.fsrs;
        var fsrsLine = fsrs
            ? ((fsrs.family || 'FSRS-4.5') + ' · ' + (fsrs.name || 'ts-fsrs') + '@' + (fsrs.version || '?') +
                (fsrs.url ? ' · ' + fsrs.url : ''))
            : 'FSRS.REFERENCE missing';
        var byState = s.byState || {};
        var bySource = s.bySource || {};
        var stateLine = 'new=' + (byState.new || 0) +
            ' learning=' + (byState.learning || 0) +
            ' relearning=' + (byState.relearning || 0) +
            ' review=' + (byState.review || 0);
        var srcLine = 'fsrs=' + (bySource.fsrs || 0) +
            ' migrated=' + (bySource.migrated || 0) +
            ' bootstrap=' + (bySource.bootstrap || 0);
        var migAt = s.migratedAt ? new Date(s.migratedAt).toISOString() : '—';
        var syncAt = s.lastSync ? new Date(s.lastSync).toISOString() : '—';
        var err = s.lastError ? String(s.lastError) : '—';

        el.innerHTML =
            '<div><span class="text-slate-400">FSRS</span> ' + this._escDebug(fsrsLine) + '</div>' +
            '<div><span class="text-slate-400">engine</span> ' + (s.engineEnabled ? 'ENABLED' : 'disabled') +
            ' · schema v' + this._escDebug(String(s.schemaVersion)) +
            ' · loaded=' + (s.loaded ? 'yes' : 'no') + '</div>' +
            '<div><span class="text-slate-400">migrationStatus</span> <b>' + this._escDebug(String(s.migrationStatus)) + '</b>' +
            ' · migratedCards=' + this._escDebug(String(s.migratedCards)) +
            ' · migratedAt=' + this._escDebug(migAt) + '</div>' +
            '<div><span class="text-slate-400">cards</span> ' + this._escDebug(String(s.cardCount)) +
            ' · due=' + this._escDebug(String(s.dueCount)) +
            ' · sessionHold=' + this._escDebug(String(s.sessionHoldCount)) + '</div>' +
            '<div><span class="text-slate-400">byState</span> ' + this._escDebug(stateLine) + '</div>' +
            '<div><span class="text-slate-400">bySource</span> ' + this._escDebug(srcLine) + '</div>' +
            '<div><span class="text-slate-400">dirty queue</span> ' + this._escDebug(String(s.dirtyCount)) +
            (s.metaDirty ? ' · metaDirty' : '') +
            ' · lastSync=' + this._escDebug(syncAt) + '</div>' +
            '<div><span class="text-slate-400">lastError</span> ' + this._escDebug(err) + '</div>';
    },

    _escDebug(str) {
        if (str == null) return '';
        if (typeof escapeHtml === 'function') return escapeHtml(String(str));
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    async adminFlushMemoryDirty() {
        if (!this._isAdminUser()) return;
        var mem = window.app && window.app.memory;
        if (!mem || typeof mem.flush !== 'function') {
            app.ui.showToast('MemoryService unavailable', 'warning');
            return;
        }
        try {
            var result = await mem.flush();
            var status = result && result.status ? result.status : 'flushed';
            if (status === 'flushed') {
                app.ui.showToast('Memory dirty queue flushed', 'success');
            } else if (status === 'empty') {
                app.ui.showToast('Nothing dirty to flush', 'info');
            } else if (status === 'offline') {
                app.ui.showToast('Flush deferred (offline) — dirty kept local', 'warning');
            } else if (status === 'no-auth') {
                app.ui.showToast('Flush deferred (no auth/db)', 'warning');
            } else if (status === 'busy') {
                app.ui.showToast('Flush already in progress', 'warning');
            } else if (status === 'error') {
                app.ui.showToast('Flush failed: ' + (result.error || 'unknown'), 'error');
            } else {
                app.ui.showToast('Flush: ' + status, 'warning');
            }
        } catch (e) {
            app.ui.showToast('Flush failed: ' + (e && e.message ? e.message : e), 'error');
        }
        this.refreshMemoryDebugPanel();
    },

    async adminForceMemoryMigrate() {
        if (!this._isAdminUser()) return;
        var mem = window.app && window.app.memory;
        if (!mem || typeof mem.forceMigrate !== 'function') {
            app.ui.showToast('MemoryService unavailable', 'warning');
            return;
        }
        if (!window.confirm('Re-run migration from analytics c/w?\n\nExisting FSRS-sourced cards are kept. Migrated/bootstrap cards may be rewritten. Use Reset first for a full wipe.')) {
            return;
        }
        try {
            app.ui.showToast('Force migrate…', 'info');
            var result = await mem.forceMigrate();
            var status = result && result.status ? result.status : '?';
            var n = result && result.migrated != null ? result.migrated : 0;
            if (status === 'done') {
                app.ui.showToast('Migrate done (' + n + ' cards)', 'success');
            } else if (status === 'failed') {
                app.ui.showToast('Migrate failed: ' + (result.error || 'unknown'), 'error');
            } else {
                app.ui.showToast('Migrate ' + status + (result.reason ? ' (' + result.reason + ')' : ''), 'warning');
            }
        } catch (e) {
            app.ui.showToast('Force migrate error: ' + (e && e.message ? e.message : e), 'error');
        }
        this.refreshMemoryDebugPanel();
    },

    async adminResetMemoryKeepAnalytics() {
        if (!this._isAdminUser()) return;
        var mem = window.app && window.app.memory;
        if (!mem || typeof mem.resetAllKeepAnalytics !== 'function') {
            app.ui.showToast('MemoryService unavailable', 'warning');
            return;
        }
        if (!window.confirm('Reset all FSRS memory cards?\n\nAnalytics c/w history is kept. RTDB memory will be wiped if online. Migration will re-run on next load (or use Force migrate).')) {
            return;
        }
        try {
            var result = await mem.resetAllKeepAnalytics();
            if (result && result.remoteCleared) {
                app.ui.showToast('Memory reset (c/w preserved, RTDB cleared)', 'success');
            } else if (result && result.localCleared && result.error === 'no-auth') {
                app.ui.showToast('Local memory cleared (no auth — RTDB not touched)', 'warning');
            } else if (result && result.localCleared && !result.remoteCleared) {
                app.ui.showToast(
                    'Local memory cleared; RTDB wipe failed — reload may restore cards. ' +
                    (result.error || ''),
                    'error'
                );
            } else {
                app.ui.showToast('Memory reset (c/w preserved)', 'success');
            }
        } catch (e) {
            app.ui.showToast('Reset failed: ' + (e && e.message ? e.message : e), 'error');
        }
        this.refreshMemoryDebugPanel();
    },

    copyLogs() { const el = document.getElementById('debug-log-area'); if(!el) return; navigator.clipboard.writeText(el.value); const btn = el.previousElementSibling.querySelector('button'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-check"></i> Copied`; setTimeout(() => btn.innerHTML = origText, 1500); },
    downloadLogs() {
        const area = document.getElementById('debug-log-area');
        if (!area || !area.value) { app.ui.showToast('No logs captured yet.', 'warning'); return; }
        const content = area.value + '\n\n--- End of VocabMaster debug log (' + new Date().toISOString() + ') ---';
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vocabmaster-debug-${Date.now()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    clearLogs() {
        const el = document.getElementById('debug-log-area');
        if (el) el.value = '';
    },

    renderCelebGrid() { const grid = document.getElementById('celeb-grid'); if(!grid || !window.app || !window.app.celebration) return; grid.innerHTML = ''; const allEffects = Object.keys(window.app.celebration.effects); const userAllowed = this.store.prefs.allowedCelebs || []; const labelMap = { 'Confetti': '🎉', 'Stars': '⭐', 'Discs': '💿', 'Coin': '🪙', 'Money': '💸', 'Red Env': '🧧', 'Sushi': '🍣', 'Kimono': '👘', 'Carp': '🎏', 'Torii': '⛩️', 'Sake': '🍶', 'Bento': '🍱', 'Dragon': '🐲' }; allEffects.forEach(name => { const isEnabled = userAllowed.includes(name); const btn = document.createElement('button'); const baseClass = "text-2xl font-bold py-2 rounded-xl transition-all active:scale-95 border-2 shadow-sm truncate px-1 flex items-center justify-center"; const activeClass = "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/50"; const inactiveClass = "bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-transparent hover:border-slate-200 dark:hover:border-neutral-700 grayscale opacity-60"; btn.className = `${baseClass} ${isEnabled ? activeClass : inactiveClass}`; btn.innerText = labelMap[name] || name; btn.onclick = () => this.store.toggleCeleb(name, btn, activeClass, inactiveClass); grid.appendChild(btn); }); }
});
