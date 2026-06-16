/* js/ui.js */
class UIManager {
    constructor(store) {
        this.store = store;
        this.hideTimer = null; 
        this.autoCloseTimer = null; 
        this.initRichTextListeners(); 
    }

    initRichTextListeners() {
        const toolbar = document.getElementById('note-toolbar');
        if (!toolbar) return;
        const btns = toolbar.querySelectorAll('button');
        btns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const cmd = btn.dataset.cmd;
                const val = btn.dataset.val || null;
                if (window.app && window.app.notes) window.app.notes.format(cmd, val);
            };
        });
    }

    toast(msg, type = 'info') {
        const bar = document.getElementById('status-bar');
        if (!bar) return;
        const orig = bar.dataset.origText || bar.innerText;
        bar.dataset.origText = orig;
        bar.innerText = msg;
        const colorClass = type === 'error' ? 'text-rose-500' : (type === 'success' ? 'text-emerald-500' : 'text-indigo-500');
        bar.classList.add(colorClass, 'font-bold');
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            bar.innerText = orig;
            bar.classList.remove('text-rose-500', 'text-emerald-500', 'text-indigo-500', 'font-bold');
        }, 3000);
    }
    
    header(curr, total, score, opts = {}) {
        const isMatch = opts.mode === 'match';
        let inputHtml;
        const btnClass = "w-9 h-9 bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-500 dark:text-neutral-400 hover:text-indigo-600 rounded-full flex items-center justify-center active:scale-90 transition-all border border-slate-200 dark:border-neutral-700 shadow-sm mr-2";
        if (isMatch) {
            const allowed = opts.allowedPairs || [2,4,6]; const options = allowed.map(n => `<option value="${n}" ${n==opts.pairs?'selected':''}>${n}</option>`).join('');
            inputHtml = `<div class="flex items-center bg-white dark:bg-neutral-800 rounded-full px-4 py-2 shadow-sm border border-slate-200 dark:border-neutral-700 mr-auto relative"><span class="text-[10px] font-bold text-slate-400 mr-2 uppercase">Pairs</span><div class="relative"><select onchange="app.game.setPairs(this.value)" class="w-12 bg-transparent font-black text-indigo-600 dark:text-indigo-400 outline-none text-sm appearance-none pr-3 text-center z-10 relative cursor-pointer">${options}</select><i class="ph-bold ph-caret-down absolute right-0 top-1/2 -translate-y-1/2 text-xs text-indigo-400 pointer-events-none"></i></div></div>`;
        } else {
            inputHtml = (curr !== null) ? `<div class="flex items-center bg-white dark:bg-neutral-800 rounded-full px-4 py-2 shadow-sm border border-slate-200 dark:border-neutral-700 mr-auto"><input type="number" value="${curr + 1}" min="1" max="${total}" onchange="app.game.jump(this.value)" onclick="this.select()" class="w-12 text-center font-black text-indigo-600 dark:text-indigo-400 bg-transparent outline-none p-0 text-sm appearance-none rounded" /><span class="text-[10px] font-bold text-slate-400 ml-1">/ ${total}</span></div>` : `<div class="flex-1"></div>`;
        }
        const notes = window.app && window.app.notes;
        const isAdmin = notes && notes.isAdmin === true;
        const editBtn = (isAdmin && !isMatch) ? `<button onclick="app.ui.openEditModal()" class="${btnClass} text-amber-500 border-amber-200 dark:border-amber-900/50 dark:text-amber-500"><i class="ph-bold ph-pencil-simple text-lg"></i></button>` : '';
        const standardControls = (!isMatch && opts.showDice) ? `<button onclick="app.game.rand()" class="${btnClass}"><i class="ph-bold ph-dice-five text-lg"></i></button>` : '';
        const sparkleBtn = (!isMatch && opts.showSparkle) ? `<button onclick="app.game._generateAnew()" class="${btnClass}"><i class="ph-bold ph-sparkle text-lg"></i></button>` : '';
        const matchControls = isMatch ? `<button onclick="app.game.restorePrev()" class="${btnClass} ${!opts.hasPrev?'opacity-50 cursor-not-allowed':''}"><i class="ph-bold ph-arrow-u-up-left text-lg"></i></button><button onclick="app.game.shuffleGrid()" class="${btnClass}"><i class="ph-bold ph-arrows-clockwise text-lg"></i></button><button onclick="app.game.newGame()" class="${btnClass}"><i class="ph-bold ph-dice-five text-lg"></i></button>` : '';
        
        return `<div class="flex justify-between items-center mb-2 shrink-0 w-full px-1 min-h-[50px]">${inputHtml}<div class="flex items-center">${editBtn}${sparkleBtn}${standardControls}${matchControls}<div class="flex items-center gap-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-full px-3 py-1.5 shadow-md text-[11px] font-bold border border-slate-700 mr-2"><span class="text-slate-400">PTS</span><span class="score-display">${score}</span></div><button onclick="app.goBack()" class="w-9 h-9 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300"><i class="ph-bold ph-x"></i></button></div></div>`;
    }
    
    btnAudio(lang, icon) { return `<button onclick="event.stopPropagation();app.game.playSmartAudio('${lang}')" class="w-12 h-12 rounded-full border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-indigo-400 hover:text-indigo-600 text-2xl flex items-center justify-center active:scale-95 transition-all text-slate-700 dark:text-neutral-300 select-none shadow-sm">${icon}</button>`; }
    
    audioBar(item) { 
        if (!this.store.prefs || this.store.prefs.showAudioBtns === false) return ''; 
        if(typeof LANG_CONFIG === 'undefined') return ''; 
        const buttons = LANG_CONFIG.filter(l => {
            const isEnabled = this.store.prefs[`btnAudio_${l.key}`] !== false; 
            const hasContent = item[l.key] && item[l.key] !== "";
            return !l.visualOnly && hasContent && isEnabled;
        }).map(l => this.btnAudio(l.key, l.icon)).join(''); 
        return `<div class="flex w-full items-center justify-center gap-4 shrink-0 mb-1 mt-1 landscape:mb-0 landscape:mt-0 flex-wrap">${buttons}</div>`; 
    }

    nav() { return `<div class="grid grid-cols-2 gap-3 h-14 shrink-0 mt-auto w-full pt-1"><button onclick="app.game.nav(-1)" class="bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700 shadow-sm rounded-2xl text-2xl active:scale-95 transition-all"><i class="ph-bold ph-caret-left"></i></button><button onclick="app.game.nav(1)" class="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-200 dark:shadow-none rounded-2xl text-2xl active:scale-95 transition-all"><i class="ph-bold ph-caret-right"></i></button></div>`; }
    
    loadSettings() {
        const setChk = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; }; 
        const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; }; 
        const setRad = (name, val) => { const el = document.querySelector(`input[name="${name}"][value="${val}"]`); if(el) el.checked = true; };
        const p = this.store.prefs;
        try { 
            const settingsList = document.getElementById('settings-list');
            if (settingsList && settingsList.innerHTML.trim() === '' && window.SETTINGS_HTML) {
                settingsList.innerHTML = window.SETTINGS_HTML;
            }
            this.renderPresetsUI(); this.renderThemeGrid(); this.renderLevelFilter();
            this.renderFontsAccordion();
            setChk('toggle-dark', p.dark); setChk('toggle-anim', p.anim); 
            setChk('toggle-show-audio-btns', p.showAudioBtns); setChk('toggle-master-audio', p.masterAudio); 
            setChk('toggle-audio-wait', p.audioWait);
            setVal('app-font', p.font || 'sans'); 
            setVal('app-font-style', p.fontStyle || 'normal');
            setVal('app-font-weight', p.fontWeight || 'normal');
            this.applyFontSettings();
            this.renderSettingsUI(); 
            setRad('global-click-mode', p.globalClickMode || 'double');
            setVal('flash-speed', p.flashSpeed); setChk('flash-random', p.flashRandom); setChk('flash-auto', p.flashAuto); 
            setChk('hanzi-enable-tooltip', p.hanziEnableTooltip !== false); setVal('hanzi-tooltip-timer', p.hanziAutoClose || "0"); 
            setChk('hanzi-show-trad', p.hanziShowTrad !== false); setChk('hanzi-show-simp', p.hanziShowSimp !== false); 
            setChk('hanzi-show-pinyin', p.hanziShowPinyin !== false); setChk('hanzi-show-kr', p.hanziShowKr !== false); 
            setChk('hanzi-show-en', p.hanziShowEn !== false); 
            setVal('flash-front', p.flashFront); setVal('flash-back-1', p.flashBack1); setVal('flash-back-2', p.flashBack2); 
            setVal('flash-back-3', p.flashBack3); setVal('flash-back-4', p.flashBack4); setVal('flash-audio-src', p.flashAudioSrc); 
            setVal('quiz-q-type', p.quizQ); setVal('quiz-a-type', p.quizA); 
            setChk('quiz-random', p.quizRandom); setChk('quiz-auto', p.quizAuto); setVal('quiz-audio-src', p.quizAudioSrc); 
            setChk('quiz-show-ex', p.quizShowEx); setVal('quiz-ex-main', p.quizExMain); setVal('quiz-ex-sub', p.quizExSub);
            setChk('quiz-play-ex', p.quizPlayEx); setChk('quiz-play-correct', p.quizPlayCorrect); setChk('quiz-play-answer', p.quizPlayAnswer);
            setChk('tf-random', p.tfRandom); setChk('tf-auto', p.tfAuto); 
            setVal('tf-front', p.tfFront); setVal('tf-back', p.tfBack); setVal('tf-audio-src', p.tfAudioSrc); 
            setChk('tf-show-ex', p.tfShowEx); setVal('tf-ex-main', p.tfExMain); setVal('tf-ex-sub', p.tfExSub); setChk('tf-play-ex', p.tfPlayEx); setChk('tf-play-correct', p.tfPlayCorrect);
            setChk('match-hint', p.matchHint); 
            setChk('voice-auto', p.voiceAuto); setChk('voice-random', p.voiceRandom); 
            setVal('voice-disp-front', p.voiceDispFront); setVal('voice-disp-back', p.voiceDispBack); setVal('voice-audio-target', p.voiceAudioTarget); 
            setChk('voice-play-ex', p.voicePlayEx); setVal('voice-ex-main', p.voiceExMain); setChk('voice-play-correct', p.voicePlayCorrect);
            setVal('sentences-q', p.sentencesQ); setVal('sentences-a', p.sentencesA);
            setVal('sentences-trans', p.sentencesTrans); 
            setVal('sentences-bottom-disp', p.sentencesBottomDisp); setVal('sentences-bottom-lang', p.sentencesBottomLang);
            setChk('sentences-auto', p.sentencesAuto); setChk('sentences-random', p.sentencesRandom);
            setVal('sentences-audio-src', p.sentencesAudioSrc); setChk('sentences-play-correct', p.sentencesPlayCorrect); setChk('sentences-read-whole', p.sentencesReadWhole);
            // LLM
            setVal('llm-endpoint', p.llmEndpoint || 'http://localhost:11434'); setVal('llm-model', p.llmModel || 'gemma3:1b'); setChk('story-auto-read', p.storyAutoRead !== false);
            this.renderLLMSetupGuide();
            if (app.llm) { this.updateLLMStatus(app.llm.available && app.llm.hasModel); this.updateLLMCacheCount(); }
            this.renderVoiceSelector();
        } catch(e) { L("Error loading settings UI:", e); }
    }

    renderFontsAccordion() {
        const settingsList = document.getElementById('settings-list');
        if(!document.getElementById('accordion-fonts') && settingsList) {
            const div = document.createElement('div');
            div.id = 'accordion-fonts';
            div.className = "border border-slate-200 dark:border-neutral-700 rounded-2xl overflow-hidden mb-4 bg-white dark:bg-neutral-800";
            div.innerHTML = `
                <button onclick="this.parentElement.classList.toggle('open')" class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-neutral-800/50 hover:bg-slate-100 dark:hover:bg-neutral-700 transition-colors">
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
    }

    applyFontSettings() {
        const p = app.store.prefs;
        document.documentElement.setAttribute('data-font', p.font || 'sans');
        document.body.style.fontStyle = p.fontStyle || 'normal';
        const wMap = { 'lighter': '300', 'normal': '400', 'bold': '700', 'bolder': '900' };
        document.documentElement.style.setProperty('--font-weight-base', wMap[p.fontWeight] || '400');
    }

    renderThemeGrid() { const container = document.getElementById('theme-grid'); if(!container) return; const themes = [{ id: 'classic', color: '#6366f1', label: 'Classic' }, { id: 'sakura',  color: '#ec4899', label: 'Sakura' }, { id: 'ocean',   color: '#14b8a6', label: 'Ocean' }, { id: 'coffee',  color: '#f59e0b', label: 'Coffee' }, { id: 'cyber',   color: '#06b6d4', label: 'Cyber' }]; const cur = this.store.prefs.theme || 'classic'; container.innerHTML = themes.map(t => { const isActive = t.id === cur; const ring = isActive ? `ring-2 ring-offset-2 ring-${t.id === 'classic' ? 'indigo' : 'gray'}-400 dark:ring-offset-neutral-800` : ''; return `<button onclick="app.store.setTheme('${t.id}')" class="flex flex-col items-center gap-1 group"><div class="w-8 h-8 rounded-full shadow-sm border border-slate-200 dark:border-neutral-600 ${ring} transition-all active:scale-95" style="background-color: ${t.color}"></div><span class="text-[9px] font-bold text-slate-500 dark:text-neutral-400 ${isActive?'text-indigo-600 dark:text-indigo-400':''}">${t.label}</span></button>`; }).join(''); }
    renderPresetsUI() { const container = document.getElementById('preset-container'); if(!container || container.childElementCount > 0) return; if(!window.app.presets) return; const langs = window.app.presets.languages; const opts = langs.map(l => `<option value="${l.key}">${l.label} ${l.icon}</option>`).join(''); container.innerHTML = `<div class="grid grid-cols-2 gap-3 mb-3"><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I know...</span><select id="preset-source" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200">${opts}</select></div><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I want to learn...</span><select id="preset-target" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200"><option value="" disabled selected>Select...</option>${opts}</select></div></div><button onclick="app.presets.apply(document.getElementById('preset-source').value, document.getElementById('preset-target').value)" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 rounded-xl text-sm shadow-md active:scale-95 transition-all">Apply Preset</button>`; const src = document.getElementById('preset-source'); const tgt = document.getElementById('preset-target'); if(src) src.value = 'en'; if(tgt) tgt.value = 'ja'; }
    renderLevelFilter() {
        const container = document.getElementById('level-filter-container');
        if (!container) return;
        const p = this.store.prefs;
        if (typeof LEVEL_CONFIG === 'undefined') return;
        const selected = p.levelFilter || ['all'];
        const hasLevelData = app.data.list.some(item => item.level || item.tags);
        if (!hasLevelData) { container.classList.add('hidden'); return; }
        container.classList.remove('hidden');
        const allBtnClass = selected.includes('all') ? 'bg-violet-500 text-white border-violet-500' : 'bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-600';
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
                const btnClass = isActive ? 'text-white border-transparent shadow-sm' : 'bg-white dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 border-slate-200 dark:border-neutral-700';
                const style = isActive ? `background:${color}; border-color:${color}` : '';
                html += `<button data-level="${lvl}" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${btnClass}" style="${style}">${lvl}</button>`;
            }
        }
        const unassignedActive = selected.includes('unassigned');
        const unClass = unassignedActive ? 'bg-slate-600 text-white border-slate-600' : 'bg-white dark:bg-neutral-700 text-slate-400 dark:text-neutral-500 border-slate-200 dark:border-neutral-600';
        html += `<button data-level="unassigned" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${unClass}">Untagged</button>`;
        html += `</div><p class="text-[10px] text-slate-400 dark:text-neutral-500"><span class="font-bold text-violet-500">${app.data.getFilteredList().length}</span> of ${app.data.list.length} words selected</p>`;
        html += `<p class="text-[8px] text-slate-400 dark:text-neutral-600 mt-1 italic">TOPIK &amp; CEFR levels are approximated from JLPT proficiency</p></div>`;
        container.innerHTML = html;
        container.querySelectorAll('.level-filter-btn').forEach(btn => {
            btn.onclick = () => { this.toggleLevel(btn.dataset.level); };
        });
    }
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
            if (app.game.i >= app.game.list.length) app.game.i = 0;
            if (app.game.update) app.game.update(); else app.game.render();
        }
    }
    renderTagFilter() {
        const section = document.getElementById('tag-filter-section');
        if (!section || !app.data) return;
        const allTags = app.data.getAllTags();
        if (!allTags || allTags.length === 0) { section.innerHTML = ''; return; }
        const p = this.store.prefs;
        const selected = p.tagFilter || ['all'];
        const allBtnClass = selected.includes('all') ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-600';
        let html = `<div class="bg-white dark:bg-neutral-900 rounded-2xl p-3 border border-slate-200 dark:border-neutral-800">
            <p class="text-[9px] uppercase font-bold text-indigo-500 mb-2 flex items-center gap-1"><i class="ph-bold ph-funnel"></i> Tag Filter</p>
            <div class="flex flex-wrap gap-1.5 mb-2">
            <button data-tag="all" class="tag-filter-btn px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${allBtnClass}">All</button>`;
        for (const tag of allTags) {
            const isActive = selected.includes(tag);
            const btnClass = isActive ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 border-slate-200 dark:border-neutral-700';
            html += `<button data-tag="${tag}" class="tag-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${btnClass}">${tag}</button>`;
        }
        html += `</div>
            <p class="text-[10px] text-slate-400 dark:text-neutral-500"><span class="font-bold text-indigo-500">${app.data.getFilteredList().length}</span> of ${app.data.list.length} words selected</p>
        </div>`;
        section.innerHTML = html;
        section.querySelectorAll('.tag-filter-btn').forEach(btn => {
            btn.onclick = () => { this.toggleTag(btn.dataset.tag); };
        });
    }
    toggleTag(tag) {
        const p = this.store.prefs;
        let selected = [...(p.tagFilter || ['all'])];
        if (tag === 'all') { selected = ['all']; }
        else {
            selected = selected.filter(t => t !== 'all');
            if (selected.includes(tag)) { selected = selected.filter(t => t !== tag); if (selected.length === 0) selected = ['all']; }
            else { selected.push(tag); }
        }
        p.tagFilter = selected;
        localStorage.setItem(this.store.STORAGE_KEY, JSON.stringify(p));
        this.renderTagFilter();
        if (app.game) {
            app.game.list = app.data.getFilteredList();
            if (app.game.list.length === 0) { app.game.list = app.data.activeList; p.tagFilter = ['all']; }
            if (app.game.i >= app.game.list.length) app.game.i = 0;
            if (app.game.update) app.game.update(); else app.game.render();
        }
    }
    renderSettingsUI() { const p = this.store.prefs; if(typeof LANG_CONFIG === 'undefined') return; const createOpts = (selId, selectedVal, hideVisuals = false) => { const el = document.getElementById(selId); if(!el) return; const list = hideVisuals ? LANG_CONFIG.filter(l => !l.visualOnly) : LANG_CONFIG; let html = '<option value="">(None)</option>'; html += list.map(l => { let str = `<option value="${l.key}" ${l.key===selectedVal?'selected':''}>${l.label}</option>`; if(l.exKey) { str += `<option value="${l.exKey}" ${l.exKey===selectedVal?'selected':''}>↳ ${l.label} (Example)</option>`; } return str; }).join(''); el.innerHTML = html; }; const createGrid = (containerId, prefixKey) => { const el = document.getElementById(containerId); if(!el) return; const list = LANG_CONFIG.filter(l => !l.visualOnly); el.innerHTML = list.map(l => { const id = `${prefixKey}-${l.key}`; const pref = `${prefixKey}_${l.key}`; return `<label class="flex flex-col items-center justify-center p-2 bg-slate-50 dark:bg-neutral-800 rounded border border-slate-200 dark:border-neutral-700 cursor-pointer hover:border-indigo-300 transition-colors"><span class="text-[9px] font-black uppercase mb-1">${l.code.toUpperCase()}</span><div class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="${id}" class="sr-only peer" ${p[pref]!==false ? 'checked' : ''}><div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div></div></label>`; }).join(''); }; createOpts('flash-front', p.flashFront); createOpts('flash-back-1', p.flashBack1); createOpts('flash-back-2', p.flashBack2); createOpts('flash-back-3', p.flashBack3); createOpts('flash-back-4', p.flashBack4); createOpts('flash-audio-src', p.flashAudioSrc, true); createOpts('quiz-q-type', p.quizQ); createOpts('quiz-a-type', p.quizA); createOpts('quiz-audio-src', p.quizAudioSrc, true); createOpts('quiz-ex-main', p.quizExMain, true); createOpts('quiz-ex-sub', p.quizExSub, true); createOpts('tf-front', p.tfFront); createOpts('tf-back', p.tfBack); createOpts('tf-audio-src', p.tfAudioSrc, true); createOpts('tf-ex-main', p.tfExMain, true); createOpts('tf-ex-sub', p.tfExSub, true); createOpts('voice-disp-front', p.voiceDispFront); createOpts('voice-disp-back', p.voiceDispBack); createOpts('voice-audio-target', p.voiceAudioTarget, true); createOpts('voice-ex-main', p.voiceExMain, true); createOpts('sentences-q', p.sentencesQ); createOpts('sentences-a', p.sentencesA); createOpts('sentences-trans', p.sentencesTrans); createOpts('sentences-audio-src', p.sentencesAudioSrc, true); createOpts('sentences-bottom-lang', p.sentencesBottomLang, true); const snDispEl = document.getElementById('sentences-bottom-disp'); if(snDispEl) { snDispEl.innerHTML = `<option value="none">None</option><option value="sentence_masked">Sentence (Masked)</option><option value="sentence_full">Sentence (Full)</option><option value="word_masked">Word (Masked)</option><option value="word_full">Word (Full)</option>`; snDispEl.value = p.sentencesBottomDisp || 'sentence_masked'; } const matchFilterContainer = document.getElementById('container-match-filters'); if(matchFilterContainer) { matchFilterContainer.innerHTML = LANG_CONFIG.map(l => { const id = `match-show-${l.key}`; const prefKey = `matchShow${this.store.cap(l.key)}`; return `<label class="p-2 bg-white dark:bg-neutral-700/30 rounded border border-slate-200 dark:border-neutral-700 flex flex-col items-center cursor-pointer select-none active:scale-95 transition-transform"><span class="text-[9px] font-bold mb-1 truncate w-full text-center">${l.label}</span><input type="checkbox" id="${id}" class="accent-slate-600 w-3 h-3" ${p[prefKey]?'checked':''}></label>`; }).join(''); } createGrid('container-match-audio', 'matchAudio'); createGrid('container-btn-audio', 'btnAudio'); this.renderCelebGrid(); const back2 = document.getElementById('flash-back-2'); if (back2 && !document.getElementById('flash-back-3')) { const parent = back2.parentElement.parentElement; if (parent) { const makeSel = (n) => `<div class="flex flex-col"><span class="text-[9px] uppercase font-bold mb-1">Back ${n}</span><select id="flash-back-${n}" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-1 py-1 outline-none"></select></div>`; parent.insertAdjacentHTML('beforeend', makeSel(3) + makeSel(4)); createOpts('flash-back-3', p.flashBack3); createOpts('flash-back-4', p.flashBack4); } } const sentAudioSrc = document.getElementById('sentences-audio-src'); if(sentAudioSrc && !document.getElementById('sentences-read-whole')) { const parent = sentAudioSrc.parentElement.parentElement; if(parent) { const toggleHtml = `<div class="flex items-center justify-between p-2 bg-slate-50 dark:bg-neutral-800 rounded border border-slate-200 dark:border-neutral-700 col-span-2"><span class="text-[9px] font-bold uppercase text-slate-500">Read Full Sentence</span><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="sentences-read-whole" class="sr-only peer" ${p.sentencesReadWhole ? 'checked' : ''}><div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div></label></div>`; parent.insertAdjacentHTML('beforeend', toggleHtml); } } const devDetails = document.getElementById('details-developer'); if (devDetails && !document.getElementById('debug-log-area')) { const container = devDetails.querySelector('.p-4'); if(container) { const debugHTML = `<div class="h-px bg-slate-200 dark:bg-neutral-700 w-full mt-2"></div><div class="flex flex-col gap-2 mt-2"><div class="flex justify-between items-center"><span class="text-[9px] uppercase font-bold text-slate-400">System Logs</span><button onclick="app.ui.copyLogs()" class="px-2 py-1 bg-slate-200 dark:bg-neutral-700 rounded text-[10px] font-bold text-slate-600 dark:text-neutral-300 active:scale-95 transition-transform flex items-center gap-1 w-fit"><i class="ph-bold ph-copy"></i> Copy</button></div><textarea id="debug-log-area" readonly class="w-full h-32 bg-black text-green-400 text-[10px] font-mono p-2 rounded-xl border border-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-green-500"></textarea></div>`; container.insertAdjacentHTML('beforeend', debugHTML); } } const logArea = document.getElementById('debug-log-area'); if(logArea && window.logBuffer) logArea.value = window.logBuffer.join('\n'); }
    copyLogs() { const el = document.getElementById('debug-log-area'); if(!el) return; navigator.clipboard.writeText(el.value); const btn = el.previousElementSibling.querySelector('button'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-check"></i> Copied`; setTimeout(() => btn.innerHTML = origText, 1500); }
    renderCelebGrid() { const grid = document.getElementById('celeb-grid'); if(!grid || !window.app || !window.app.celebration) return; grid.innerHTML = ''; const allEffects = Object.keys(window.app.celebration.effects); const userAllowed = this.store.prefs.allowedCelebs || []; const labelMap = { 'Confetti': '🎉', 'Stars': '⭐', 'Discs': '💿', 'Coin': '🪙', 'Money': '💸', 'Red Env': '🧧', 'Sushi': '🍣', 'Kimono': '👘', 'Carp': '🎏', 'Torii': '⛩️', 'Sake': '🍶', 'Bento': '🍱', 'Dragon': '🐲' }; allEffects.forEach(name => { const isEnabled = userAllowed.includes(name); const btn = document.createElement('button'); const baseClass = "text-2xl font-bold py-2 rounded-xl transition-all active:scale-95 border-2 shadow-sm truncate px-1 flex items-center justify-center"; const activeClass = "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/50"; const inactiveClass = "bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-transparent hover:border-slate-200 dark:hover:border-neutral-700 grayscale opacity-60"; btn.className = `${baseClass} ${isEnabled ? activeClass : inactiveClass}`; btn.innerText = labelMap[name] || name; btn.onclick = () => this.store.toggleCeleb(name, btn, activeClass, inactiveClass); grid.appendChild(btn); }); }
    
    // UPDATED: NEW TABBED MODAL
    openEditModal() { 
        try {
            if(!app.game || app.game.i === undefined || !app.data || !app.game.list) return; 
            const item = app.game.list[app.game.i]; 
            if(!item) return; 
            
            const container = document.getElementById('edit-form-body'); 
            if(!container) return;
            
            document.getElementById('edit-id').innerText = `#${item.id}`; 
            
            let tabContainer = document.getElementById('edit-tabs');
            if(!tabContainer) {
                container.innerHTML = `
                <div id="edit-tabs" class="flex gap-2 mb-4 border-b border-slate-100 dark:border-neutral-800">
                    <button id="tab-vocab" class="px-4 py-2 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-colors" onclick="app.ui.switchEditTab('vocab')">Vocab</button>
                    <button id="tab-dictionary" class="px-4 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent hover:text-indigo-500 transition-colors" onclick="app.ui.switchEditTab('dictionary')">Dictionary</button>
                </div>
                <div id="view-vocab" class="block h-[60vh] overflow-y-auto thin-scroll pb-4"></div>
                <div id="view-dictionary" class="hidden h-[60vh] overflow-y-auto thin-scroll flex-col gap-4 pb-4"></div>
                `;
            } else {
                app.ui.switchEditTab('vocab');
            }

            const viewVocab = document.getElementById('view-vocab');
            const viewDict = document.getElementById('view-dictionary');
            
            viewVocab.innerHTML = '';
            if(typeof LANG_CONFIG !== 'undefined') { 
                LANG_CONFIG.forEach(conf => { 
                    const val = item[conf.key] || ""; 
                    const exVal = conf.exKey ? (item[conf.exKey] || "") : ""; 
                    const safeVal = escapeHtml(val);
                    const safeEx = escapeHtml(exVal);
                    let html = `<div class="bg-slate-50 dark:bg-neutral-800/50 p-3 rounded-2xl border border-slate-100 dark:border-neutral-800 mb-2"><label class="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-2"><span>${conf.icon}</span> ${conf.label}</label><input type="text" id="edit-field-${conf.key}" value="${safeVal}" placeholder="Word..." class="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-300 mb-2">`; 
                    if(conf.exKey) { html += `<textarea id="edit-field-${conf.exKey}" placeholder="Example Sentence..." rows="2" class="w-full bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 dark:text-neutral-400 outline-none focus:border-indigo-500 transition-all placeholder-slate-400">${safeEx}</textarea>`; } 
                    html += `</div>`; 
                    viewVocab.innerHTML += html; 
                }); 
            }

            viewDict.innerHTML = '<div class="p-8 text-center"><i class="ph-bold ph-spinner animate-spin text-2xl text-indigo-500"></i><p class="text-xs font-bold text-slate-400 mt-2">Scanning...</p></div>';
            this.scanAndRenderDictionary(item);

            document.getElementById('modal-edit').classList.remove('hidden');
            if(viewVocab) viewVocab.scrollTop = 0;
            if(viewDict) viewDict.scrollTop = 0;

        } catch(e) { L("Open Edit Modal Error", e); }
    }

    switchEditTab(tab) {
        const vBtn = document.getElementById('tab-vocab');
        const dBtn = document.getElementById('tab-dictionary');
        const vView = document.getElementById('view-vocab');
        const dView = document.getElementById('view-dictionary');
        
        if (tab === 'vocab') {
            vBtn.className = "px-4 py-2 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-colors";
            dBtn.className = "px-4 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent hover:text-indigo-500 transition-colors";
            vView.classList.remove('hidden');
            dView.classList.add('hidden');
            document.querySelector('#modal-edit button[onclick="app.ui.saveEdit()"]').classList.remove('hidden');
        } else {
            dBtn.className = "px-4 py-2 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-colors";
            vBtn.className = "px-4 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent hover:text-indigo-500 transition-colors";
            dView.classList.remove('hidden');
            vView.classList.add('hidden');
            document.querySelector('#modal-edit button[onclick="app.ui.saveEdit()"]').classList.add('hidden');
        }
    }

    async scanAndRenderDictionary(item) {
        const viewDict = document.getElementById('view-dictionary');
        const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g;
        const charSet = new Set();
        Object.values(item).forEach(val => {
            if (typeof val === 'string') {
                const matches = val.match(cjkRegex);
                if (matches) matches.forEach(c => charSet.add(c));
            }
        });
        const chars = Array.from(charSet);

        if (chars.length === 0) {
            viewDict.innerHTML = '<div class="p-4 text-center text-slate-400">No Characters Found</div>';
            return;
        }

        viewDict.innerHTML = ''; 
        
        const entries = [];
        for (const char of chars) {
            const entry = await app.data.getKanji(char);
            entries.push({ char, data: entry });
        }

        entries.sort((a, b) => {
            if (!a.data && b.data) return -1;
            if (a.data && !b.data) return 1;
            return 0;
        });

        for (const { char, data: entry } of entries) {
            const data = entry || { id: null, s: char, t: char, p: '', k: '', e: '' };
            const isNew = !entry;

            const div = document.createElement('div');
            div.className = `bg-slate-50 dark:bg-neutral-800/50 p-4 rounded-xl border ${isNew ? 'border-amber-300 dark:border-amber-500/50 ring-1 ring-amber-100 dark:ring-amber-900/30' : 'border-slate-200 dark:border-neutral-700'}`;
            
            div.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                        ${escapeHtml(char)}
                        ${isNew ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300">NEW</span>' : ''}
                    </h3>
                    <button class="text-xs bg-indigo-500 text-white px-3 py-1 rounded-lg font-bold active:scale-95" onclick="app.ui.saveDictEntry(this, '${escapeHtml(char)}', ${data.id})">Save</button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Trad</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="t" value="${escapeHtml(data.t || char)}"></div>
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Simp</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="s" value="${escapeHtml(data.s || char)}"></div>
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Pinyin</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="p" value="${escapeHtml(data.p || '')}"></div>
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Korean</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="k" value="${escapeHtml(data.k || '')}"></div>
                    <div class="col-span-2"><span class="text-[9px] uppercase font-bold text-slate-400">English</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="e" value="${escapeHtml(data.e || '')}"></div>
                </div>
            `;
            viewDict.appendChild(div);
        }
    }

    async saveDictEntry(btn, char, id) {
        const parent = btn.closest('div').parentElement;
        const getVal = (f) => parent.querySelector(`input[data-field="${f}"]`).value.trim();
        
        const update = {
            id: id || Date.now(),
            t: getVal('t'),
            s: getVal('s'),
            p: getVal('p'),
            k: getVal('k'),
            e: getVal('e')
        };

        const origText = btn.innerText;
        btn.innerText = "...";
        try {
            await app.data.saveDictionaryEntry(update);
            btn.innerText = "Done";
            btn.classList.add('bg-emerald-500');
            setTimeout(() => { btn.innerText = origText; btn.classList.remove('bg-emerald-500'); }, 1500);
        } catch(e) {
            app.ui.toast("Save failed", "error");
            btn.innerText = origText;
        }
    }
    
    closeEditModal() { document.getElementById('modal-edit').classList.add('hidden'); }
    async saveEdit() { if(!app.game || app.game.i === undefined) return; const currentItem = app.game.list[app.game.i]; const updates = { ...currentItem }; if(typeof LANG_CONFIG !== 'undefined') { LANG_CONFIG.forEach(conf => { const el = document.getElementById(`edit-field-${conf.key}`); if(el) updates[conf.key] = el.value.trim(); if(conf.exKey) { const elEx = document.getElementById(`edit-field-${conf.exKey}`); if(elEx) updates[conf.exKey] = elEx.value.trim(); } }); } const btn = document.querySelector('#modal-edit button[onclick="app.ui.saveEdit()"]'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Saving...`; btn.disabled = true; try { await app.data.saveCorrection(updates); this.closeEditModal(); 
        if (app.game && typeof app.game.update === 'function') { app.game.update(); } 
        const bar = document.getElementById('status-bar'); bar.innerText = "Correction Saved!"; bar.classList.add('text-emerald-500'); setTimeout(() => bar.classList.remove('text-emerald-500'), 2000); } catch(e) { app.ui.toast("Save failed: " + e.message, "error"); } finally { btn.innerHTML = origText; btn.disabled = false; } }

    showTooltip(e, char, isLongPress = false) { 
        if (app.store.prefs.hanziEnableTooltip === false) return; 
        if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; } 
        if (this.autoCloseTimer) { clearTimeout(this.autoCloseTimer); this.autoCloseTimer = null; } 
        
        const tooltip = document.getElementById('hanzi-tooltip'); 
        if(!tooltip) return; 
        
        tooltip.style.left = '-9999px'; 
        tooltip.style.top = '-9999px'; 
        tooltip.classList.remove('hidden', 'opacity-0'); 

        if (!char) return; 

        tooltip.innerHTML = `
            <div class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-slate-200 dark:border-neutral-700 p-4 min-w-[120px] relative z-[100]">
                 <div class="flex items-center gap-2 text-slate-400">
                    <i class="ph-bold ph-spinner animate-spin"></i> <span class="text-xs font-bold">Loading...</span>
                 </div>
            </div>`;
        this.positionTooltip(tooltip, e, isLongPress);

        const failTimer = setTimeout(() => {
            if(tooltip.innerHTML.includes('ph-spinner')) {
                tooltip.innerHTML = `<div class="bg-white dark:bg-neutral-800 rounded-xl p-3 shadow-2xl border border-slate-200 dark:border-neutral-700"><p class="text-xs font-bold text-rose-500">Not Found</p></div>`;
            }
        }, 3000);

        app.data.getKanji(char).then(data => {
            clearTimeout(failTimer);
            if(!data) {
                this.hideTooltip(true);
                return;
            }
            const { t:trad, s:simp, p:pinyin, k:kr, e:en } = data;
            const p = app.store.prefs;
            
            tooltip.innerHTML = `
            <div class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-slate-200 dark:border-neutral-700 p-3 min-w-[150px] max-w-xs pointer-events-auto z-[100] relative" onclick="event.stopPropagation()">
                <button onclick="app.ui.hideTooltip(true)" class="absolute -top-3 -right-3 w-7 h-7 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform border border-white dark:border-neutral-600 z-[101]">
                    <i class="ph-bold ph-x text-xs"></i>
                </button>
                <div class="flex items-center gap-3 mb-2 border-b border-slate-100 dark:border-neutral-700 pb-2">
                    ${p.hanziShowTrad!==false ? `<span class="text-3xl font-serif text-slate-800 dark:text-white font-black leading-none">${escapeHtml(trad)}</span>` : ''}
                    ${p.hanziShowSimp!==false && simp && simp !== trad ? `<span class="text-lg font-serif text-slate-400 leading-none">${escapeHtml(simp)}</span>` : ''}
                </div>
                <div class="space-y-1">
                    ${p.hanziShowPinyin!==false ? `<p class="text-sm font-bold text-indigo-500 font-serif">${escapeHtml(pinyin)}</p>` : ''}
                    ${p.hanziShowKr!==false ? `<p class="text-xs text-slate-600 dark:text-neutral-300">🇰🇷 ${escapeHtml(kr)}</p>` : ''}
                    ${p.hanziShowEn!==false ? `<p class="text-xs text-slate-600 dark:text-neutral-300">🇺🇸 ${escapeHtml(en)}</p>` : ''}
                </div>
            </div>`;
            this.positionTooltip(tooltip, e, isLongPress);
        }).catch(() => {
            clearTimeout(failTimer);
            this.hideTooltip(true);
        });

        const closeTime = parseInt(app.store.prefs.hanziAutoClose || "0"); 
        if (closeTime > 0) { 
            this.autoCloseTimer = setTimeout(() => { this.hideTooltip(true); }, closeTime); 
        }

        if (!isLongPress) { 
            if(this.trackTooltip) document.removeEventListener('mousemove', this.trackTooltip); 
            this.trackTooltip = (ev) => { 
                const offset = 20;
                let lx = ev.clientX + offset; 
                let ly = ev.clientY + offset; 
                if (lx + 200 > window.innerWidth) lx = window.innerWidth - 220; 
                if (ly + 150 > window.innerHeight) ly = window.innerHeight - 170; 
                tooltip.style.left = `${lx}px`; 
                tooltip.style.top = `${ly}px`; 
            }; 
            document.addEventListener('mousemove', this.trackTooltip); 
        } 
    }

    positionTooltip(tooltip, e, isLongPress) {
        requestAnimationFrame(() => { 
            const rect = tooltip.getBoundingClientRect(); 
            const w = rect.width; 
            const h = rect.height; 
            const offset = 20; 
            let left, top; 
            if (isLongPress) { 
                const touch = e.touches[0]; 
                left = touch.clientX - (w / 2); 
                top = touch.clientY - h - 30; 
            } else { 
                left = e.clientX + offset; 
                top = e.clientY + offset; 
            } 
            if (left + w > window.innerWidth) left = window.innerWidth - w - 10; 
            if (left < 10) left = 10; 
            if (top + h > window.innerHeight) top = window.innerHeight - h - 10; 
            if (top < 10) top = 10; 
            tooltip.style.left = `${left}px`; 
            tooltip.style.top = `${top}px`; 
        });
    }

    hideTooltip(force = false) { 
        if (this.autoCloseTimer) { clearTimeout(this.autoCloseTimer); this.autoCloseTimer = null; } 
        const delay = force ? 0 : 200; 
        if (this.hideTimer) clearTimeout(this.hideTimer); 
        this.hideTimer = setTimeout(() => { 
            const tooltip = document.getElementById('hanzi-tooltip'); 
            if(tooltip) { 
                tooltip.classList.add('opacity-0'); 
                setTimeout(() => { 
                    tooltip.classList.add('hidden'); 
                    tooltip.style.left = '-9999px'; 
                }, 200); 
            } 
        }, delay); 
        if(this.trackTooltip) { 
            document.removeEventListener('mousemove', this.trackTooltip); 
            this.trackTooltip = null; 
        } 
    }
    
    openProfileModal() { if (!auth.currentUser) return; const user = auth.currentUser; const modal = document.getElementById('modal-profile'); const container = document.getElementById('profile-content'); const created = new Date(user.metadata.creationTime).toLocaleDateString(); container.innerHTML = `<div class="flex flex-col items-center mb-6"><img src="${escapeHtml(user.photoURL)}" class="w-24 h-24 rounded-full shadow-lg border-4 border-white dark:border-neutral-700 mb-3"><h3 class="text-xl font-black text-slate-800 dark:text-white">${escapeHtml(user.displayName)}</h3><p class="text-xs font-bold text-slate-400">${escapeHtml(user.email)}</p></div><div class="bg-slate-50 dark:bg-neutral-800 rounded-2xl p-4 border border-slate-100 dark:border-neutral-700 mb-6 space-y-2"><div class="flex justify-between text-sm"><span class="text-slate-500 font-bold">Active Since</span><span class="font-bold text-slate-800 dark:text-neutral-300">${escapeHtml(created)}</span></div></div><button onclick="app.auth.logout(); document.getElementById('modal-profile').classList.add('hidden');" class="w-full bg-slate-200 dark:bg-neutral-700 hover:bg-slate-300 text-slate-700 dark:text-neutral-300 font-bold py-3 rounded-xl mb-3">Log Out</button><button onclick="app.data.deleteUserAccount()" class="w-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-200 font-bold py-3 rounded-xl">Delete Account</button>`; modal.classList.remove('hidden'); }
    async openStatsModal() {
        const modal = document.getElementById('modal-stats');
        modal.classList.remove('hidden');
        // Reset heatmap cache so it refreshes on next view
        const heatmapView = document.getElementById('weekly-heatmap-view');
        if (heatmapView) heatmapView.dataset.loaded = '';
        const canvas = document.getElementById('stats-chart');
        const ctx = canvas.getContext('2d');
        if(window.myStatsChart) window.myStatsChart.destroy();
        const stats = await app.data.getStats();
        const dailyData = (stats && stats.daily) ? stats.daily : {};
        const labels = ['M', 'T', 'W', 'R', 'F', 'S', 'S'];
        const curr = new Date();
        const day = curr.getDay(); 
        const diffToMon = curr.getDate() - day + (day === 0 ? -6 : 1);
        const mondayDate = new Date(curr);
        mondayDate.setDate(diffToMon);
        const modes = ['flash', 'quiz', 'tf', 'match', 'voice', 'sentences'];
        const colors = { 'flash': '#818cf8', 'quiz': '#f472b6', 'tf': '#34d399', 'match': '#94a3b8', 'voice': '#38bdf8', 'sentences': '#8b5cf6' };
        const datasets = modes.map(mode => {
            const values = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(mondayDate); d.setDate(mondayDate.getDate() + i);
                const key = d.toISOString().split('T')[0];
                let val = 0;
                if (dailyData[key] && typeof dailyData[key] === 'object') {
                    val = dailyData[key][mode] || 0;
                }
                values.push(val);
            }
            return { label: mode.toUpperCase(), data: values, backgroundColor: colors[mode], borderRadius: 4, stack: 'Stack 0' };
        });
        let maxVal = 0;
        for(let i=0; i<7; i++) {
            const d = new Date(mondayDate); d.setDate(mondayDate.getDate() + i);
            const key = d.toISOString().split('T')[0];
            if(dailyData[key]) {
               const entry = dailyData[key];
               const sum = (typeof entry === 'number') ? entry : Object.values(entry).reduce((a,b)=>a+b, 0);
               if(sum > maxVal) maxVal = sum;
            }
        }
        let yMax = Math.max(10, Math.ceil(maxVal / 10) * 10);
        if (maxVal > 100) yMax = Math.ceil(maxVal / 100) * 100;
        if (maxVal > 1000) yMax = Math.ceil(maxVal / 1000) * 1000;
        if (maxVal > 10000) yMax = Math.ceil(maxVal / 5000) * 5000;
        window.myStatsChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false, callbacks: { label: function(context) { return context.parsed.y > 0 ? context.parsed.y : ""; } } } },
                scales: { y: { beginAtZero: true, max: yMax, grid: { color: 'rgba(156, 163, 175, 0.1)' }, stacked: true }, x: { grid: { display: false }, ticks: { color: (c) => c.index === 6 ? '#f43f5e' : '#64748b', font: { weight: 'bold' } }, stacked: true } }
            }
        });
    }

    showWeeklyView(view) {
        const chartView = document.getElementById('weekly-chart-view');
        const heatmapView = document.getElementById('weekly-heatmap-view');
        const chartBtn = document.getElementById('wv-chart');
        const heatmapBtn = document.getElementById('wv-heatmap');
        const legend = document.getElementById('heatmap-legend');
        const activeClass = 'weekly-view-btn py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider transition-all bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm';
        const inactiveClass = 'weekly-view-btn py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider transition-all text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300';

        if (view === 'chart') {
            if (chartView) chartView.classList.remove('hidden');
            if (heatmapView) heatmapView.classList.add('hidden');
            if (chartBtn) chartBtn.className = activeClass;
            if (heatmapBtn) heatmapBtn.className = inactiveClass;
            if (legend) { legend.classList.add('hidden'); legend.classList.remove('flex'); }
        } else {
            if (chartView) chartView.classList.add('hidden');
            if (heatmapView) heatmapView.classList.remove('hidden');
            if (chartBtn) chartBtn.className = inactiveClass;
            if (heatmapBtn) heatmapBtn.className = activeClass;
            if (legend) { legend.classList.remove('hidden'); legend.classList.add('flex'); }
            this.renderHeatmap();
        }
    }

    async renderHeatmap() {
        const container = document.getElementById('weekly-heatmap-view');
        if (!container) return;
        if (container.dataset.loaded === '1') return;

        container.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        // Wait for layout so clientWidth is accurate
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        // Fetch both data sources
        const [weeklyStats, analyticsData] = await Promise.all([
            app.data.getStats(),
            app.analytics ? app.analytics.getAnalytics() : null
        ]);

        const weeklyDaily = (weeklyStats && weeklyStats.daily) ? weeklyStats.daily : {};
        const analyticsDaily = (analyticsData && analyticsData.daily) ? analyticsData.daily : {};

        const today = new Date();
        const todayOffset = today.getTimezoneOffset() * 60000;
        const todayKey = (new Date(today - todayOffset)).toISOString().slice(0, 10);
        const year = today.getFullYear();

        // Full year: Jan 1 to Dec 31
        const jan1 = new Date(year, 0, 1);
        const dec31 = new Date(year, 11, 31);

        // Grid starts on the Monday on or before Jan 1
        const jan1Day = jan1.getDay(); // 0=Sun
        const startOffset = jan1Day === 0 ? 6 : jan1Day - 1; // days to go back to Monday
        const gridStart = new Date(jan1);
        gridStart.setDate(jan1.getDate() - startOffset);

        // Grid ends on the Sunday on or after Dec 31
        const dec31Day = dec31.getDay();
        const endOffset = dec31Day === 0 ? 0 : 7 - dec31Day;
        const gridEnd = new Date(dec31);
        gridEnd.setDate(dec31.getDate() + endOffset);

        // Count weeks
        const totalDays = Math.round((gridEnd - gridStart) / (1000 * 60 * 60 * 24)) + 1;
        const WEEKS = Math.ceil(totalDays / 7);

        // Build dateList in column-major order (Mon..Sun per week)
        const dateList = [];
        for (let w = 0; w < WEEKS; w++) {
            for (let d = 0; d < 7; d++) {
                const date = new Date(gridStart);
                date.setDate(gridStart.getDate() + w * 7 + d);
                const off = date.getTimezoneOffset() * 60000;
                dateList.push((new Date(date - off)).toISOString().slice(0, 10));
            }
        }

        // Determine which dates are within the current year
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        // Compute activity values
        let maxVal = 0;
        const activityMap = {};
        for (const key of dateList) {
            let val = 0;
            if (weeklyDaily[key]) {
                const entry = weeklyDaily[key];
                val += (typeof entry === 'number') ? entry : Object.values(entry).reduce((a, b) => a + b, 0);
            }
            if (analyticsDaily[key]) {
                val += (analyticsDaily[key].correct || 0) + (analyticsDaily[key].incorrect || 0);
            }
            activityMap[key] = val;
            if (key <= todayKey && val > maxVal) maxVal = val;
        }

        const dayLabels = ['M', '', 'W', '', 'F', '', 'S'];
        const getLevel = (val) => {
            if (val === 0 || maxVal === 0) return 0;
            const ratio = val / maxVal;
            if (ratio <= 0.15) return 1;
            if (ratio <= 0.40) return 2;
            if (ratio <= 0.70) return 3;
            return 4;
        };

        // Inline styles since these classes may not be in compiled Tailwind
        const isDark = document.documentElement.classList.contains('dark');
        const levelColors = isDark ? {
            0: '#262626', // neutral-800
            1: 'rgba(6,78,59,0.6)', // emerald-900/60
            2: '#047857', // emerald-700
            3: '#10b981', // emerald-500
            4: '#34d399'  // emerald-400
        } : {
            0: '#f1f5f9', // slate-100
            1: '#a7f3d0', // emerald-200
            2: '#34d399', // emerald-400
            3: '#10b981', // emerald-500
            4: '#059669'  // emerald-600
        };

        // Build cells
        let cellsHtml = '';
        for (const key of dateList) {
            const val = activityMap[key] || 0;
            const isToday = key === todayKey;
            const isFuture = key > todayKey;
            const isOutOfYear = key < yearStart || key > yearEnd;
            const todayClass = isToday ? 'hm-today' : '';
            const parts = key.split('-');

            if (isOutOfYear) {
                cellsHtml += `<div class="hm-cell" style="visibility:hidden"></div>`;
            } else {
                const level = getLevel(val);
                const color = levelColors[isFuture ? 0 : level];
                const futureClass = isFuture ? 'hm-future' : '';
                const tooltip = isFuture ? `${parts[1]}/${parts[2]}` : `${parts[1]}/${parts[2]}: ${val > 0 ? val + ' pts' : 'No activity'}`;
                cellsHtml += `<div class="hm-cell ${todayClass} ${futureClass}" style="background:${color}" title="${tooltip}"></div>`;
            }
        }

        // Month labels — find the first week column where each month appears
        let monthLabels = '';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let lastMonth = -1;
        for (let w = 0; w < WEEKS; w++) {
            // Check all 7 days in this week column — find first in-year date
            for (let d = 0; d < 7; d++) {
                const key = dateList[w * 7 + d];
                if (key >= yearStart && key <= yearEnd) {
                    const m = parseInt(key.split('-')[1]) - 1;
                    if (m !== lastMonth) {
                        monthLabels += `<span class="text-[9px] font-bold text-slate-400 dark:text-neutral-500" style="grid-column:${w + 1}">${months[m]}</span>`;
                        lastMonth = m;
                    }
                    break;
                }
            }
        }

        // Measure container to compute square cells that fill full width
        const labelColW = 20;
        const flexGap = 8;
        const containerW = container.clientWidth || 300;
        const gridW = containerW - labelColW - flexGap;
        const MIN_CELL = 8;
        const gap = 2;
        let cellSize = Math.max(MIN_CELL, (gridW - (WEEKS - 1) * gap) / WEEKS);
        const cs = Math.floor(cellSize * 100) / 100;
        const actualGridW = cs * WEEKS + gap * (WEEKS - 1);
        const needsScroll = actualGridW > gridW;

        container.innerHTML = `
            <div class="flex w-full" style="gap:${flexGap}px">
                <div class="shrink-0" style="display:grid; grid-template-rows:repeat(7, ${cs}px); gap:${gap}px; padding-top:${14 + gap}px; width:${labelColW}px;">
                    ${dayLabels.map(l => `<div class="flex items-center justify-end"><span class="text-[9px] font-bold text-slate-400 dark:text-neutral-500">${l}</span></div>`).join('')}
                </div>
                <div style="${needsScroll ? 'overflow-x:auto;' : ''} flex:1; min-width:0;">
                    <div style="display:grid; grid-template-columns:repeat(${WEEKS}, ${cs}px); gap:${gap}px; margin-bottom:${gap}px; height:14px; align-items:end;${needsScroll ? ' width:max-content;' : ''}">
                        ${monthLabels}
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(${WEEKS}, ${cs}px); grid-template-rows:repeat(7, ${cs}px); grid-auto-flow:column; gap:${gap}px;${needsScroll ? ' width:max-content;' : ''}">
                        ${cellsHtml}
                    </div>
                </div>
            </div>
        `;

        container.dataset.loaded = '1';
    }

    showStatsTab(tab) {
        // Toggle panels
        document.querySelectorAll('.stats-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById(`tab-${tab}`);
        if (panel) panel.classList.remove('hidden');

        // Toggle tab button styles
        document.querySelectorAll('.stats-tab').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.className = 'stats-tab flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm';
            } else {
                btn.className = 'stats-tab flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300';
            }
        });

        // Lazy-load tab content
        if (tab === 'accuracy') this.renderAccuracyTab();
        else if (tab === 'words') this.renderWordsTab();
        else if (tab === 'activity') this.renderActivityTab();
    }

    async renderAccuracyTab() {
        const panel = document.getElementById('tab-accuracy');
        if (!panel) return;
        if (!app.analytics) { panel.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Analytics not available.</p>'; return; }

        panel.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        const [dailyData, modeData] = await Promise.all([
            app.analytics.getDailyAccuracy(7),
            app.analytics.getAccuracyByMode()
        ]);

        const hasDailyData = dailyData.some(d => d.total > 0);
        const hasModeData = Object.keys(modeData).length > 0;

        if (!hasDailyData && !hasModeData) {
            panel.innerHTML = '<div class="flex-1 flex items-center justify-center"><div class="text-center"><i class="ph-duotone ph-chart-line text-5xl text-slate-200 dark:text-neutral-700 mb-3"></i><p class="text-sm font-bold text-slate-400">No accuracy data yet.</p><p class="text-xs text-slate-300 dark:text-neutral-600 mt-1">Play some games to see your accuracy trends!</p></div></div>';
            return;
        }

        panel.innerHTML = `
            <div class="flex-1 flex flex-col min-h-0">
                ${hasDailyData ? '<div class="flex-1 flex flex-col min-h-[180px] mb-4"><h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 shrink-0">7-Day Accuracy Trend</h3><div class="relative flex-1 min-h-0"><canvas id="accuracy-trend-chart"></canvas></div></div>' : ''}
                ${hasModeData ? '<div class="shrink-0"><h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Accuracy by Mode</h3><div id="mode-accuracy-bars"></div></div>' : ''}
            </div>
        `;

        // Daily accuracy line chart
        if (hasDailyData) {
            const ctx = document.getElementById('accuracy-trend-chart');
            if (ctx) {
                if (window._accTrendChart) window._accTrendChart.destroy();
                const labels = dailyData.map(d => { const parts = d.date.split('-'); return `${parts[1]}/${parts[2]}`; });
                window._accTrendChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Accuracy %',
                            data: dailyData.map(d => d.accuracy),
                            borderColor: '#818cf8',
                            backgroundColor: 'rgba(129, 140, 248, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: '#818cf8'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y}%` } } },
                        scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(156, 163, 175, 0.1)' }, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } }
                    }
                });
            }
        }

        // Mode accuracy bars (HTML-based for flexibility)
        if (hasModeData) {
            const container = document.getElementById('mode-accuracy-bars');
            if (container) {
                const modeNames = { flash: 'Flashcards', quiz: 'Quiz', tf: 'True/False', match: 'Matching', voice: 'Voice', sentences: 'Sentences' };
                const modeColors = { flash: '#818cf8', quiz: '#f472b6', tf: '#34d399', match: '#94a3b8', voice: '#38bdf8', sentences: '#8b5cf6' };
                let html = '<div class="space-y-3">';
                for (const [mode, data] of Object.entries(modeData)) {
                    const name = modeNames[mode] || mode;
                    const color = modeColors[mode] || '#818cf8';
                    html += `
                        <div>
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-xs font-bold text-slate-600 dark:text-neutral-300">${name}</span>
                                <span class="text-xs font-black" style="color:${color}">${data.accuracy}%</span>
                            </div>
                            <div class="w-full h-2 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all duration-500" style="width:${data.accuracy}%;background:${color}"></div>
                            </div>
                            <div class="flex justify-between mt-0.5">
                                <span class="text-[10px] text-slate-300 dark:text-neutral-600">${data.correct} correct</span>
                                <span class="text-[10px] text-slate-300 dark:text-neutral-600">${data.incorrect} wrong</span>
                            </div>
                        </div>`;
                }
                html += '</div>';
                container.innerHTML = html;
            }
        }
    }

    async renderWordsTab() {
        const panel = document.getElementById('tab-words');
        if (!panel) return;
        if (!app.analytics) { panel.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Analytics not available.</p>'; return; }

        panel.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        const missed = await app.analytics.getMostMissedWords(15);

        if (!missed || missed.length === 0) {
            panel.innerHTML = '<div class="flex-1 flex items-center justify-center"><div class="text-center"><i class="ph-duotone ph-books text-5xl text-slate-200 dark:text-neutral-700 mb-3"></i><p class="text-sm font-bold text-slate-400">No word data yet.</p><p class="text-xs text-slate-300 dark:text-neutral-600 mt-1">Words you get wrong will appear here for review.</p></div></div>';
            return;
        }

        const frontKey = app.store.prefs.flashFront || 'ja';
        const backKey = app.store.prefs.flashBack1 || 'en';

        let html = '<h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Most Missed Words</h3><div class="space-y-2">';
        missed.forEach((w, idx) => {
            const c = w.c || 0;
            const wrong = w.w || 0;
            const total = c + wrong;
            const acc = total > 0 ? Math.round(c / total * 100) : 0;
            const word = w.vocab ? (w.vocab[frontKey] || w.vocab.ja || '') : `#${w.id}`;
            const meaning = w.vocab ? (w.vocab[backKey] || w.vocab.en || '') : '';
            const lastDate = w.last ? new Date(w.last).toLocaleDateString() : '';

            html += `
                <div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-neutral-800 rounded-xl border border-slate-100 dark:border-neutral-700">
                    <span class="text-xs font-black text-slate-300 dark:text-neutral-600 w-5 text-right shrink-0">${idx + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span class="font-black text-sm text-slate-700 dark:text-neutral-200 truncate">${escapeHtml(word)}</span>
                            <span class="text-xs text-slate-400 dark:text-neutral-500 truncate">${escapeHtml(meaning)}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="flex-1 h-1.5 bg-slate-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                <div class="h-full rounded-full ${acc >= 70 ? 'bg-emerald-400' : acc >= 40 ? 'bg-amber-400' : 'bg-rose-400'}" style="width:${acc}%"></div>
                            </div>
                            <span class="text-[10px] font-bold ${acc >= 70 ? 'text-emerald-500' : acc >= 40 ? 'text-amber-500' : 'text-rose-500'} w-8 text-right">${acc}%</span>
                        </div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-[10px] font-bold"><span class="text-emerald-500">${c}</span><span class="text-slate-300 dark:text-neutral-600 mx-0.5">/</span><span class="text-rose-400">${wrong}</span></div>
                        ${lastDate ? `<div class="text-[9px] text-slate-300 dark:text-neutral-600">${lastDate}</div>` : ''}
                    </div>
                </div>`;
        });
        html += '</div>';
        panel.innerHTML = html;
    }

    async renderActivityTab() {
        const panel = document.getElementById('tab-activity');
        if (!panel) return;
        if (!app.analytics) { panel.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Analytics not available.</p>'; return; }

        panel.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        const analytics = await app.analytics.getAnalytics();

        if (!analytics) {
            panel.innerHTML = '<div class="flex-1 flex items-center justify-center"><div class="text-center"><i class="ph-duotone ph-fire text-5xl text-slate-200 dark:text-neutral-700 mb-3"></i><p class="text-sm font-bold text-slate-400">No activity data yet.</p><p class="text-xs text-slate-300 dark:text-neutral-600 mt-1">Start playing to track your streaks!</p></div></div>';
            return;
        }

        const streak = analytics.streak || { current: 0, best: 0 };
        const lifetime = analytics.lifetime || {};
        const totalCorrect = lifetime.correct || 0;
        const totalIncorrect = lifetime.incorrect || 0;
        const totalAttempts = totalCorrect + totalIncorrect;
        const overallAcc = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;

        // Count sessions
        const sessions = analytics.sessions || {};
        const sessionCount = Object.keys(sessions).length;

        // Calculate total session time
        let totalTime = 0;
        Object.values(sessions).forEach(s => {
            if (s.start && s.end) totalTime += (s.end - s.start);
        });
        const avgTime = sessionCount > 0 ? Math.round(totalTime / sessionCount / 1000) : 0;
        const formatTime = (secs) => {
            if (secs < 60) return `${secs}s`;
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return s > 0 ? `${m}m ${s}s` : `${m}m`;
        };

        panel.innerHTML = `
            <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-4 border border-amber-100 dark:border-amber-900/30 text-center">
                    <div class="text-4xl font-black text-amber-500 mb-1">${streak.current}</div>
                    <div class="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Day Streak</div>
                </div>
                <div class="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-2xl p-4 border border-violet-100 dark:border-violet-900/30 text-center">
                    <div class="text-4xl font-black text-violet-500 mb-1">${streak.best}</div>
                    <div class="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Best Streak</div>
                </div>
            </div>
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Lifetime Stats</h3>
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black text-slate-700 dark:text-neutral-200">${totalAttempts.toLocaleString()}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Total Attempts</div>
                </div>
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black ${overallAcc >= 70 ? 'text-emerald-500' : overallAcc >= 40 ? 'text-amber-500' : 'text-rose-500'}">${overallAcc}%</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Accuracy</div>
                </div>
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black text-slate-700 dark:text-neutral-200">${sessionCount}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Sessions</div>
                </div>
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black text-slate-700 dark:text-neutral-200">${formatTime(avgTime)}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Avg Session</div>
                </div>
            </div>
            <div class="flex items-center gap-3 bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                <div class="flex-1">
                    <div class="flex justify-between mb-1">
                        <span class="text-[10px] font-bold text-emerald-500">${totalCorrect.toLocaleString()} correct</span>
                        <span class="text-[10px] font-bold text-rose-400">${totalIncorrect.toLocaleString()} wrong</span>
                    </div>
                    <div class="w-full h-2.5 bg-slate-200 dark:bg-neutral-700 rounded-full overflow-hidden flex">
                        ${totalAttempts > 0 ? `<div class="h-full bg-emerald-400 rounded-l-full" style="width:${overallAcc}%"></div><div class="h-full bg-rose-400 rounded-r-full" style="width:${100 - overallAcc}%"></div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

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
    }

    updateLLMCacheCount() {
        const el = document.getElementById('llm-cache-count');
        if (!el || !app.llm) return;
        app.llm.getCacheCount().then(n => { el.innerText = `Cache: ${n} entries`; });
    }

    renderLLMSetupGuide() {
        const el = document.getElementById('llm-setup-guide');
        if (!el) return;
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (isAndroid) {
            el.innerHTML = `
                <p class="font-bold text-slate-600 dark:text-neutral-300">Android Setup (via Termux):</p>
                <ol class="list-decimal ml-4 space-y-1">
                    <li>Install <b>Termux</b> from <b>F-Droid</b> (not Play Store)</li>
                    <li>In Termux run: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[9px]">pkg install ollama</code></li>
                    <li>Start server: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[9px]">ollama serve</code></li>
                    <li>New Termux session: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[9px]">ollama pull gemma3:1b</code></li>
                    <li>Keep Termux running, come back here and tap <b>Test</b></li>
                </ol>
                <p class="mt-2 text-[9px] text-slate-400">Requires ~2GB RAM free. Galaxy S22 Ultra and S7 Tab are supported.</p>`;
        } else {
            el.innerHTML = `
                <p class="font-bold text-slate-600 dark:text-neutral-300">Desktop Setup:</p>
                <ol class="list-decimal ml-4 space-y-1">
                    <li>Download & install <b>Ollama</b> from <b>ollama.com</b></li>
                    <li>Open terminal: <code class="bg-slate-200 dark:bg-neutral-600 px-1 rounded text-[9px]">ollama pull gemma3:1b</code></li>
                    <li>Ollama runs automatically. Come back here and tap <b>Test</b></li>
                </ol>
                <p class="mt-2 text-[9px] text-slate-400">Requires ~2GB RAM. Runs in background automatically.</p>`;
        }
    }

    dumpVoices() {
        const voices = app.audio ? app.audio.voices : [];
        if (voices.length === 0) { app.ui.toast('No voices loaded yet. Tap Detect first, then Dump.', 'error'); return; }
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
    }

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
        }

        if (voices.length === 0) {
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
            html = `<div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-900/40">
                <p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Using Android default TTS engine</p>
                <p class="text-[9px] text-emerald-600 dark:text-emerald-500 mt-1">Voice selection is managed by Android. To change your TTS voice: <b>Settings → General Management → Text-to-speech output → Preferred engine</b>, then tap gear ⚙ to choose a voice.</p>
            </div>`;
        } else if (isAndroid) {
            html += `<div class="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
                <p class="text-[9px] text-amber-700 dark:text-amber-400 font-bold">Android Chrome limitation</p>
                <p class="text-[9px] text-amber-600 dark:text-amber-500 mt-1">Voice selection may not work on Android Chrome. To change your TTS engine, go to: <b>Android Settings → General Management → Text-to-speech output → Preferred engine</b> and pick Google or Samsung TTS.</p>
            </div>`;
        }

        container.innerHTML = html;
    }

}
