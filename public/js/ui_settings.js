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
            this.renderPresetsUI(); this.renderThemeGrid(); this.renderLevelFilter();
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
                                    if (rad) rad.checked = true;
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
            settingsList.insertBefore(div, settingsList.firstChild);
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
    renderPresetsUI() { const container = document.getElementById('preset-container'); if(!container) return; if(!window.app.presets) return; const langs = window.app.presets.languages; const opts = langs.map(l => `<option value="${l.key}">${l.label} ${l.icon}</option>`).join(''); const p = this.store.prefs; const curSource = p.presetSource || 'en'; const curTarget = p.presetTarget || 'ja'; container.innerHTML = `<div class="grid grid-cols-2 gap-3 mb-3"><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I know...</span><select id="preset-source" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200">${opts}</select></div><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I want to learn...</span><select id="preset-target" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200"><option value="" disabled selected>Select...</option>${opts}</select></div></div><button onclick="app.presets.apply(document.getElementById('preset-source').value, document.getElementById('preset-target').value)" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 rounded-xl text-sm shadow-md active:scale-95 transition-all">Apply Preset</button>`; const src = document.getElementById('preset-source'); const tgt = document.getElementById('preset-target'); if(src) src.value = curSource; if(tgt) tgt.value = curTarget; },
    renderLevelFilter() {
        const container = document.getElementById('level-filter-container');
        if (!container) return;
        const p = this.store.prefs;
        if (typeof LEVEL_CONFIG === 'undefined') return;
        const selected = p.levelFilter || ['all'];
        const hasLevelData = app.data.list.some(item => item.tags && item.tags.length > 0);
        if (!hasLevelData) { container.classList.add('hidden'); return; }
        container.classList.remove('hidden');
        const allBtnClass = selected.includes('all') ? 'bg-violet-500 text-white border-violet-500' : 'bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-200 border-slate-200 dark:border-neutral-600';
        let html = `<p class="text-[9px] uppercase font-bold text-violet-500 mb-2 flex items-center gap-1"><i class="ph-bold ph-barbell"></i> Level Filter</p>
            <div class="flex flex-wrap gap-1.5 mb-2">
            <button data-level="all" class="level-filter-btn px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${allBtnClass}">All</button>`;
        for (const group of LEVEL_CONFIG.groups) {
            const isRelevant = group.langs.some(l => p.flashFront === l || p.flashBack1 === l || p.flashBack2 === l || p.sentencesQ === l || p.quizQ === l || p.tfFront === l || p.voiceDispFront === l);
            if (!isRelevant) continue;
            html += `<span class="text-[9px] font-black text-slate-400 mx-1">${group.label}</span>`;
            for (const lvl of group.levels) {
                const isActive = selected.includes(lvl);
                const color = LEVEL_CONFIG.colors[lvl] || '#6366f1';
                const btnClass = isActive ? 'text-white border-transparent shadow-sm' : 'bg-white dark:bg-neutral-800 text-slate-500 dark:text-neutral-200 border-slate-200 dark:border-neutral-700';
                const style = isActive ? `background:${color}; border-color:${color}` : '';
                html += `<button data-level="${lvl}" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${btnClass}" style="${style}">${lvl}</button>`;
            }
        }
        const unassignedActive = selected.includes('unassigned');
        const unClass = unassignedActive ? 'bg-slate-600 text-white border-slate-600' : 'bg-white dark:bg-neutral-700 text-slate-400 dark:text-neutral-300 border-slate-200 dark:border-neutral-600';
        html += `<button data-level="unassigned" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${unClass}">Untagged</button>`;
        html += `</div><p class="text-[10px] text-slate-400 dark:text-neutral-500"><span class="font-bold text-violet-500">${app.data.getFilteredList().length}</span> of ${app.data.list.length} words selected</p>`;
        html += `<p class="text-[8px] text-slate-400 dark:text-neutral-600 mt-1 italic">TOPIK &amp; CEFR levels are approximated from JLPT proficiency</p></div>`;
        container.innerHTML = html;
        container.querySelectorAll('.level-filter-btn').forEach(btn => {
            btn.onclick = () => { this.toggleLevel(btn.dataset.level); };
        });
    },
    toggleLevel(level) {
        const p = this.store.prefs;
        let selected = [...(p.levelFilter || ['all'])];
        if (level === 'all') { selected = ['all']; }
        else {
            selected = selected.filter(l => l !== 'all');
            if (selected.includes(level)) { selected = selected.filter(l => l !== level); if (selected.length === 0) selected = ['all']; }
            else { selected.push(level); }
        }
        p.levelFilter = selected;
        localStorage.setItem(this.store.STORAGE_KEY, JSON.stringify(p));
        this.renderLevelFilter();
        if (app.game) {
            app.game.list = app.data.getFilteredList();
            if (app.game.list.length === 0) { app.game.list = app.data.activeList; p.levelFilter = ['all']; }
            if(app.game.i >= app.game.list.length) app.game.i = 0;
            if (app.game.update) app.game.update(); else app.game.render();
        }
    },
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
            // Insert in good visual position: after level-filter if present, else after global visual card, else append
            const level = document.getElementById('level-filter-container');
            const anchor = level && level.parentNode ? level : document.querySelector('#settings-list > div.bg-slate-100');
            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore( (function(){ const t=document.createElement('div'); t.innerHTML=html; return t.firstChild; })() , anchor.nextSibling );
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
            const isAdmin = window.app && window.app.auth && window.app.auth.userRole === 'admin';
            if (isAdmin) devDetails.classList.remove('hidden');
            if (!document.getElementById('rtdb-log-status')) {
                const container = devDetails.querySelector('.p-4');
                if (container) {
                    const debugHTML = `<div class="h-px bg-slate-200 dark:bg-neutral-700 w-full mt-1"></div>
<div class="text-[9px] leading-snug flex flex-wrap items-center gap-x-2 gap-y-1 ${isAdmin ? '' : 'hidden'}">
  <span class="uppercase font-bold text-emerald-500">RTDB</span>
  <button onclick="if(app) app.flushLogsToRTDB && app.flushLogsToRTDB()" class="underline text-emerald-600 active:text-emerald-800">push</button>
  <button onclick="app.ui && app.ui.fetchAndShowRTDBLogs && app.ui.fetchAndShowRTDBLogs()" class="underline text-slate-500 active:text-slate-700">fetch</button>
  <button onclick="app.ui && app.ui.downloadRTDBLogs && app.ui.downloadRTDBLogs()" class="underline text-indigo-600 active:text-indigo-800">dl</button>
  <button onclick="app.ui && app.ui.clearRemoteLogs && app.ui.clearRemoteLogs()" class="underline text-rose-600 active:text-rose-800">clear</button>
  <span id="rtdb-log-status" class="text-slate-500 dark:text-neutral-400 font-mono">loading…</span>
</div>
<textarea id="rtdb-log-area" readonly class="w-full h-16 bg-black text-emerald-400 text-[8px] font-mono p-1 rounded border border-slate-700 resize-y focus:outline-none hidden mt-1"></textarea>`;
                    container.insertAdjacentHTML('beforeend', debugHTML);
                }
            }
        }

        const logArea = document.getElementById('debug-log-area');
        if (logArea && window.logBuffer) logArea.value = window.logBuffer.join('\n');

        // Initial status for the new RTDB section
        if (typeof this.updateRemoteLogStatus === 'function') {
            this.updateRemoteLogStatus();
        }
    },
    copyLogs() { const el = document.getElementById('debug-log-area'); if(!el) return; navigator.clipboard.writeText(el.value); const btn = el.previousElementSibling.querySelector('button'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-check"></i> Copied`; setTimeout(() => btn.innerHTML = origText, 1500); },
    downloadLogs() {
        if (!window.logBuffer || window.logBuffer.length === 0) { app.ui.showToast('No logs captured yet.', 'warning'); return; }
        const content = window.logBuffer.join('\n') + '\n\n--- End of VocabMaster debug log (' + new Date().toISOString() + ') ---';
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
        window.logBuffer = [];
        try { localStorage.removeItem('vm_log_buffer'); } catch(e){}
        const el = document.getElementById('debug-log-area');
        if (el) el.value = '';
    },

    // --- RTDB remote log helpers (for developer analysis without device pulls) ---
    updateRemoteLogStatus() {
        const statusEl = document.getElementById('rtdb-log-status');
        if (!statusEl) return;

        const sess = (window.VM_SESSION_ID || 'unknown').slice(0, 18);
        let last = '';
        try {
            const lp = localStorage.getItem('vm_last_rtdb_push');
            if (lp) last = ' last push ' + new Date(parseInt(lp,10)).toLocaleTimeString();
        } catch(e) {}

        const uid = (auth && auth.currentUser && auth.currentUser.uid) ? auth.currentUser.uid.slice(-6) : 'no-auth';
        statusEl.innerHTML = `sess <b>${sess}</b> • uid…${uid}${last}<br>RTDB path: <span class="text-emerald-400">/users/${uid ? auth.currentUser.uid : '...'}/debug_logs/sessions/${window.VM_SESSION_ID || '...'}</span>`;
        statusEl.title = 'Open Firebase Console → Realtime Database and browse to the path above to inspect raw logs (even from previous runs).';
    },

    async fetchAndShowRTDBLogs() {
        const area = document.getElementById('rtdb-log-area');
        const statusEl = document.getElementById('rtdb-log-status');
        if (!area || !db || !auth || !auth.currentUser) {
            app.ui.showToast('RTDB logs not available (no auth or no db).', 'warning');
            return;
        }
        try {
            area.classList.remove('hidden');
            area.value = 'Fetching from RTDB...';
            const uid = auth.currentUser.uid;
            const sess = window.VM_SESSION_ID || 'default';
            const snap = await db.ref(`users/${uid}/debug_logs/sessions/${sess}/batches`).limitToLast(8).once('value');
            const val = snap.val() || {};
            const batches = Object.values(val);
            let text = '';
            batches.forEach(b => {
                if (b && b.lines) {
                    text += (b.lines || []).join('\n') + '\n--- batch ---\n';
                }
            });
            if (!text.trim()) text = '(no batches stored for this session yet — tap Push now or wait for timer/error flush)';
            area.value = text + `\n\n( fetched ${batches.length} batches • session ${sess} )`;
            if (statusEl) statusEl.textContent = 'Fetched ' + batches.length + ' batches from RTDB';
        } catch(e) {
            if (area) area.value = 'Fetch error: ' + (e.message || e);
        }
    },

    async downloadRTDBLogs() {
        if (!db || !auth || !auth.currentUser) { app.ui.showToast('Cannot reach RTDB (no current user).', 'error'); return; }
        try {
            const uid = auth.currentUser.uid;
            const sess = window.VM_SESSION_ID || 'default';
            const snap = await db.ref(`users/${uid}/debug_logs/sessions/${sess}/batches`).limitToLast(12).once('value');
            const val = snap.val() || {};
            const batches = Object.values(val);
            let content = `VocabMaster RTDB debug log export\nSession: ${sess}\nUser (tail uid): ${uid.slice(-8)}\nExported: ${new Date().toISOString()}\n\n`;
            batches.forEach((b, i) => {
                content += `--- batch ${i+1} @ ${b.at || ''} ---\n`;
                content += (b.lines || []).join('\n') + '\n';
            });
            if (batches.length === 0) content += '(no remote batches)\n';

            // Also append whatever is in the current local buffer for completeness
            if (window.logBuffer && window.logBuffer.length) {
                content += '\n\n=== CURRENT LOCAL BUFFER (newest first) ===\n' + window.logBuffer.join('\n');
            }

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vocabmaster-rtdb-${sess}-${Date.now()}.log`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch(e) {
            app.ui.showToast('RTDB download failed: ' + (e.message || e), 'error');
        }
    },

    async clearRemoteLogs() {
        if (!confirm('Delete ALL your debug_logs in RTDB for this account? (This only affects the debug node, not scores or stories.)')) return;
        if (!db || !auth || !auth.currentUser) return;
        try {
            const uid = auth.currentUser.uid;
            await db.ref(`users/${uid}/debug_logs`).remove();
            const area = document.getElementById('rtdb-log-area');
            if (area) { area.value = ''; area.classList.add('hidden'); }
            const st = document.getElementById('rtdb-log-status');
            if (st) st.textContent = 'Remote logs cleared for this uid.';
            try { localStorage.removeItem('vm_last_rtdb_push'); } catch(e) {}
        } catch(e) {
            app.ui.showToast('Clear remote failed: ' + (e.message || e), 'error');
        }
    },

    renderCelebGrid() { const grid = document.getElementById('celeb-grid'); if(!grid || !window.app || !window.app.celebration) return; grid.innerHTML = ''; const allEffects = Object.keys(window.app.celebration.effects); const userAllowed = this.store.prefs.allowedCelebs || []; const labelMap = { 'Confetti': '🎉', 'Stars': '⭐', 'Discs': '💿', 'Coin': '🪙', 'Money': '💸', 'Red Env': '🧧', 'Sushi': '🍣', 'Kimono': '👘', 'Carp': '🎏', 'Torii': '⛩️', 'Sake': '🍶', 'Bento': '🍱', 'Dragon': '🐲' }; allEffects.forEach(name => { const isEnabled = userAllowed.includes(name); const btn = document.createElement('button'); const baseClass = "text-2xl font-bold py-2 rounded-xl transition-all active:scale-95 border-2 shadow-sm truncate px-1 flex items-center justify-center"; const activeClass = "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/50"; const inactiveClass = "bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-transparent hover:border-slate-200 dark:hover:border-neutral-700 grayscale opacity-60"; btn.className = `${baseClass} ${isEnabled ? activeClass : inactiveClass}`; btn.innerText = labelMap[name] || name; btn.onclick = () => this.store.toggleCeleb(name, btn, activeClass, inactiveClass); grid.appendChild(btn); }); }
});
