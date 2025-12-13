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
        
        // MATCH CONTROLS: dice calls app.game.newGame()
        const matchControls = isMatch ? `<button onclick="app.game.restorePrev()" class="${btnClass} ${!opts.hasPrev?'opacity-50 cursor-not-allowed':''}"><i class="ph-bold ph-arrow-u-up-left text-lg"></i></button><button onclick="app.game.shuffleGrid()" class="${btnClass}"><i class="ph-bold ph-arrows-clockwise text-lg"></i></button><button onclick="app.game.newGame()" class="${btnClass}"><i class="ph-bold ph-dice-five text-lg"></i></button>` : '';
        
        return `<div class="flex justify-between items-center mb-2 shrink-0 w-full px-1 min-h-[50px]">${inputHtml}<div class="flex items-center">${editBtn}${standardControls}${matchControls}<div class="flex items-center gap-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-full px-3 py-1.5 shadow-md text-[11px] font-bold border border-slate-700 mr-2"><span class="text-slate-400">PTS</span><span class="score-display">${score}</span></div><button onclick="app.goHome()" class="w-9 h-9 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300"><i class="ph-bold ph-x"></i></button></div></div>`;
    }
    
    btnAudio(lang, icon) { return `<button onclick="event.stopPropagation();app.game.playSmartAudio('${lang}')" class="w-12 h-12 rounded-full border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-indigo-400 hover:text-indigo-600 text-2xl flex items-center justify-center active:scale-95 transition-all text-slate-700 dark:text-neutral-300 select-none shadow-sm">${icon}</button>`; }
    audioBar(item) { if (!this.store.prefs.showAudioBtns) return ''; if(typeof LANG_CONFIG === 'undefined') return ''; const buttons = LANG_CONFIG.filter(l => !l.visualOnly && item[l.key] && item[l.key] !== "" && this.store.prefs[`btnAudio_${l.key}`]).map(l => this.btnAudio(l.key, l.icon)).join(''); return `<div class="flex w-full items-center justify-center gap-4 shrink-0 mb-1 mt-1 landscape:mb-0 landscape:mt-0 flex-wrap">${buttons}</div>`; }
    nav() { return `<div class="grid grid-cols-2 gap-3 h-14 shrink-0 mt-auto w-full pt-1"><button onclick="app.game.nav(-1)" class="bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700 shadow-sm rounded-2xl text-2xl active:scale-95 transition-all"><i class="ph-bold ph-caret-left"></i></button><button onclick="app.game.nav(1)" class="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-200 dark:shadow-none rounded-2xl text-2xl active:scale-95 transition-all"><i class="ph-bold ph-caret-right"></i></button></div>`; }
    
    loadSettings() {
        const setChk = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; }; 
        const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; }; 
        
        // FIX: Helper to set radio buttons correctly
        const setRad = (name, val) => { 
            const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
            if(el) el.checked = true;
        };
        
        const p = this.store.prefs;
        try { 
            this.renderPresetsUI(); this.renderThemeGrid(); 
            setChk('toggle-dark', p.dark); setChk('toggle-anim', p.anim); 
            setChk('toggle-show-audio-btns', p.showAudioBtns); setChk('toggle-master-audio', p.masterAudio); 
            setChk('toggle-audio-wait', p.audioWait);

            setVal('app-font', p.font || 'sans'); 
            
            this.renderSettingsUI(); // Render HTML first
            
            // Apply Radio Button State *After* Rendering (or ensure container exists)
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
            setChk('quiz-play-ex', p.quizPlayEx); setChk('quiz-play-correct', p.quizPlayCorrect);

            setChk('tf-random', p.tfRandom); setChk('tf-auto', p.tfAuto); 
            setVal('tf-front', p.tfFront); setVal('tf-back', p.tfBack); setVal('tf-audio-src', p.tfAudioSrc); 
            setChk('tf-show-ex', p.tfShowEx); setVal('tf-ex-main', p.tfExMain); setVal('tf-ex-sub', p.tfExSub);
            setChk('tf-play-ex', p.tfPlayEx); 

            setChk('match-hint', p.matchHint); 
            
            setChk('voice-auto', p.voiceAuto); setChk('voice-random', p.voiceRandom); 
            setVal('voice-disp-front', p.voiceDispFront); setVal('voice-disp-back', p.voiceDispBack); setVal('voice-audio-target', p.voiceAudioTarget); 
            setChk('voice-play-ex', p.voicePlayEx); setVal('voice-ex-main', p.voiceExMain); setChk('voice-play-correct', p.voicePlayCorrect);
            
            setVal('sentences-q', p.sentencesQ); setVal('sentences-a', p.sentencesA);
            setVal('sentences-trans', p.sentencesTrans); 
            setVal('sentences-bottom-disp', p.sentencesBottomDisp);
            setChk('sentences-auto', p.sentencesAuto); setChk('sentences-random', p.sentencesRandom);
            setVal('sentences-audio-src', p.sentencesAudioSrc); setChk('sentences-play-correct', p.sentencesPlayCorrect);

        } catch(e) { console.error("Error loading settings UI:", e); }
    }

    renderThemeGrid() { const container = document.getElementById('theme-grid'); if(!container) return; const themes = [{ id: 'classic', color: '#6366f1', label: 'Classic' }, { id: 'sakura',  color: '#ec4899', label: 'Sakura' }, { id: 'ocean',   color: '#14b8a6', label: 'Ocean' }, { id: 'coffee',  color: '#f59e0b', label: 'Coffee' }, { id: 'cyber',   color: '#06b6d4', label: 'Cyber' }]; const cur = this.store.prefs.theme || 'classic'; container.innerHTML = themes.map(t => { const isActive = t.id === cur; const ring = isActive ? `ring-2 ring-offset-2 ring-${t.id === 'classic' ? 'indigo' : 'gray'}-400 dark:ring-offset-neutral-800` : ''; return `<button onclick="app.store.setTheme('${t.id}')" class="flex flex-col items-center gap-1 group"><div class="w-8 h-8 rounded-full shadow-sm border border-slate-200 dark:border-neutral-600 ${ring} transition-all active:scale-95" style="background-color: ${t.color}"></div><span class="text-[9px] font-bold text-slate-500 dark:text-neutral-400 ${isActive?'text-indigo-600 dark:text-indigo-400':''}">${t.label}</span></button>`; }).join(''); }
    
    renderPresetsUI() { const container = document.getElementById('preset-container'); if(!container || container.childElementCount > 0) return; if(!window.app.presets) return; const langs = window.app.presets.languages; const opts = langs.map(l => `<option value="${l.key}">${l.label} ${l.icon}</option>`).join(''); container.innerHTML = `<div class="grid grid-cols-2 gap-3 mb-3"><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I know...</span><select id="preset-source" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200">${opts}</select></div><div class="flex flex-col"><span class="text-[9px] uppercase font-bold text-slate-400 mb-1">I want to learn...</span><select id="preset-target" class="bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-xl px-3 py-2 text-sm font-bold outline-none shadow-sm text-slate-700 dark:text-neutral-200"><option value="" disabled selected>Select...</option>${opts}</select></div></div><button onclick="app.presets.apply(document.getElementById('preset-source').value, document.getElementById('preset-target').value)" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 rounded-xl text-sm shadow-md active:scale-95 transition-all">Apply Preset</button>`; }
    
    renderSettingsUI() { 
        const p = this.store.prefs; if(typeof LANG_CONFIG === 'undefined') return; 
        const createOpts = (selId, selectedVal, hideVisuals = false) => { const el = document.getElementById(selId); if(!el) return; const list = hideVisuals ? LANG_CONFIG.filter(l => !l.visualOnly) : LANG_CONFIG; let html = '<option value="">(None)</option>'; html += list.map(l => { let str = `<option value="${l.key}" ${l.key===selectedVal?'selected':''}>${l.label}</option>`; if(l.exKey) { str += `<option value="${l.exKey}" ${l.exKey===selectedVal?'selected':''}>↳ ${l.label} (Example)</option>`; } return str; }).join(''); el.innerHTML = html; }; 
        const createGrid = (containerId, prefixKey) => { const el = document.getElementById(containerId); if(!el) return; const list = LANG_CONFIG.filter(l => !l.visualOnly); el.innerHTML = list.map(l => { const id = `${prefixKey}-${l.key}`; const pref = `${prefixKey}_${l.key}`; return `<label class="flex flex-col items-center justify-center p-2 bg-slate-50 dark:bg-neutral-800 rounded border border-slate-200 dark:border-neutral-700 cursor-pointer hover:border-indigo-300 transition-colors"><span class="text-[9px] font-black uppercase mb-1">${l.code.toUpperCase()}</span><div class="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="${id}" class="sr-only peer" ${p[pref]!==false ? 'checked' : ''}><div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div></div></label>`; }).join(''); }; 
        
        createOpts('flash-front', p.flashFront); createOpts('flash-back-1', p.flashBack1); createOpts('flash-back-2', p.flashBack2); createOpts('flash-back-3', p.flashBack3); createOpts('flash-back-4', p.flashBack4); createOpts('flash-audio-src', p.flashAudioSrc, true); 
        
        createOpts('quiz-q-type', p.quizQ); createOpts('quiz-a-type', p.quizA); createOpts('quiz-audio-src', p.quizAudioSrc, true); 
        createOpts('quiz-ex-main', p.quizExMain, true); createOpts('quiz-ex-sub', p.quizExSub, true);

        createOpts('tf-front', p.tfFront); createOpts('tf-back', p.tfBack); createOpts('tf-audio-src', p.tfAudioSrc, true); 
        createOpts('tf-ex-main', p.tfExMain, true); createOpts('tf-ex-sub', p.tfExSub, true);

        createOpts('voice-disp-front', p.voiceDispFront); createOpts('voice-disp-back', p.voiceDispBack); createOpts('voice-audio-target', p.voiceAudioTarget, true); 
        createOpts('voice-ex-main', p.voiceExMain, true);

        createOpts('sentences-q', p.sentencesQ); createOpts('sentences-a', p.sentencesA); 
        createOpts('sentences-trans', p.sentencesTrans); createOpts('sentences-audio-src', p.sentencesAudioSrc, true);

        const matchFilterContainer = document.getElementById('container-match-filters'); if(matchFilterContainer) { matchFilterContainer.innerHTML = LANG_CONFIG.map(l => { const id = `match-show-${l.key}`; const prefKey = `matchShow${this.store.cap(l.key)}`; return `<label class="p-2 bg-white dark:bg-neutral-700/30 rounded border border-slate-200 dark:border-neutral-700 flex flex-col items-center cursor-pointer select-none active:scale-95 transition-transform"><span class="text-[9px] font-bold mb-1 truncate w-full text-center">${l.label}</span><input type="checkbox" id="${id}" class="accent-slate-600 w-3 h-3" ${p[prefKey]?'checked':''}></label>`; }).join(''); } 
        createGrid('container-match-audio', 'matchAudio'); createGrid('container-btn-audio', 'btnAudio'); 
        this.renderCelebGrid(); 
        
        const back2 = document.getElementById('flash-back-2'); if (back2 && !document.getElementById('flash-back-3')) { const parent = back2.parentElement.parentElement; if (parent) { const makeSel = (n) => `<div class="flex flex-col"><span class="text-[9px] uppercase font-bold mb-1">Back ${n}</span><select id="flash-back-${n}" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-1 py-1 outline-none"></select></div>`; parent.insertAdjacentHTML('beforeend', makeSel(3) + makeSel(4)); createOpts('flash-back-3', p.flashBack3); createOpts('flash-back-4', p.flashBack4); } }
        
        const audioSettingsBox = document.querySelector('#modal-settings .space-y-3 > div:nth-child(2)');
        if(audioSettingsBox && !document.getElementById('toggle-audio-wait')) {
             const html = `<label class="flex flex-col items-center justify-center gap-1 cursor-pointer mt-2"><i class="ph-fill ph-timer text-xl text-amber-500"></i><span class="text-[10px] font-black uppercase">Wait Audio</span><input type="checkbox" id="toggle-audio-wait" class="w-4 h-4 accent-amber-600 rounded"></label>`;
             const grid = audioSettingsBox.querySelector('.grid.grid-cols-2');
             if(grid) grid.insertAdjacentHTML('beforeend', html);
        }

        const clickModeHTML = `
            <div class="h-px bg-slate-200 dark:bg-neutral-700 w-full mt-2"></div>
            <p class="text-[9px] uppercase font-bold text-slate-400 text-center mt-2">Input Mode</p>
            <div class="flex justify-between items-center mt-1 p-1 bg-slate-100 dark:bg-neutral-800 rounded-lg border border-slate-200 dark:border-neutral-700">
                <label class="flex-1 text-center cursor-pointer">
                    <input type="radio" name="global-click-mode" value="single" class="peer sr-only">
                    <span class="block py-1 text-[10px] font-bold uppercase text-slate-400 peer-checked:text-slate-700 dark:peer-checked:text-white peer-checked:bg-white dark:peer-checked:bg-neutral-600 rounded shadow-sm transition-all">Single Click</span>
                </label>
                <label class="flex-1 text-center cursor-pointer">
                    <input type="radio" name="global-click-mode" value="double" class="peer sr-only">
                    <span class="block py-1 text-[10px] font-bold uppercase text-slate-400 peer-checked:text-slate-700 dark:peer-checked:text-white peer-checked:bg-white dark:peer-checked:bg-neutral-600 rounded shadow-sm transition-all">Double Click</span>
                </label>
            </div>`;
        const mainSettingsBox = document.querySelector('#modal-settings .space-y-3 > div:nth-child(2)');
        if(mainSettingsBox && !document.querySelector('input[name="global-click-mode"]')) {
            mainSettingsBox.insertAdjacentHTML('beforeend', clickModeHTML);
        }

        const injectExOpts = (mode, detailsIndex) => {
            try {
                const details = document.querySelector(`#modal-settings details:nth-of-type(${detailsIndex})`);
                if(!details) return;
                const contentDiv = details.querySelector('div.p-4');
                if(contentDiv && !document.getElementById(`${mode}-show-ex`)) {
                    const html = `
                    <div class="h-px bg-slate-200 dark:bg-neutral-700 my-2"></div>
                    <label class="flex justify-between items-center cursor-pointer"><span class="text-xs font-bold">Show Example Sentences</span><input type="checkbox" id="${mode}-show-ex" class="w-4 h-4 accent-indigo-600 rounded"></label>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <div class="flex flex-col"><span class="text-[9px] uppercase font-bold mb-1">Main (Big)</span><select id="${mode}-ex-main" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-1 py-1 outline-none"></select></div>
                        <div class="flex flex-col"><span class="text-[9px] uppercase font-bold mb-1">Sub (Small)</span><select id="${mode}-ex-sub" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-1 py-1 outline-none"></select></div>
                    </div>
                    <label class="flex justify-between items-center cursor-pointer mt-2"><span class="text-xs font-bold">Auto-Play Example on Toggle</span><input type="checkbox" id="${mode}-play-ex" class="w-4 h-4 accent-indigo-600 rounded"></label>
                    ${mode === 'quiz' ? `<label class="flex justify-between items-center cursor-pointer mt-2"><span class="text-xs font-bold">Auto-Play on Correct</span><input type="checkbox" id="${mode}-play-correct" class="w-4 h-4 accent-indigo-600 rounded"></label>` : ''}`;
                    
                    contentDiv.insertAdjacentHTML('beforeend', html);
                    createOpts(`${mode}-ex-main`, p[`${mode}ExMain`], true); 
                    createOpts(`${mode}-ex-sub`, p[`${mode}ExSub`], true);
                }
            } catch(e) { console.error("Inject Ex Opts Fail", e); }
        };
        injectExOpts('quiz', 4); 
        injectExOpts('tf', 5); 

        const injectVoiceOpts = () => {
            try {
                const details = document.querySelector(`#modal-settings details:nth-of-type(7)`); 
                if(!details) return;
                const contentDiv = details.querySelector('div.p-4');
                if(contentDiv && !document.getElementById('voice-play-ex')) {
                    const html = `
                    <div class="h-px bg-slate-200 dark:bg-neutral-700 my-2"></div>
                    <label class="flex justify-between items-center cursor-pointer"><span class="text-xs font-bold">Auto-Play Example on Toggle</span><input type="checkbox" id="voice-play-ex" class="w-4 h-4 accent-sky-600 rounded"></label>
                    <div class="flex flex-col mt-2"><span class="text-[9px] uppercase font-bold mb-1">Example Audio Language</span><select id="voice-ex-main" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-1 py-1 outline-none"></select></div>
                    <label class="flex justify-between items-center cursor-pointer mt-2"><span class="text-xs font-bold">Auto-Play on Correct</span><input type="checkbox" id="voice-play-correct" class="w-4 h-4 accent-sky-600 rounded"></label>`;
                    contentDiv.insertAdjacentHTML('beforeend', html);
                    createOpts('voice-ex-main', p.voiceExMain, true);
                    setChk('voice-play-correct', p.voicePlayCorrect);
                }
            } catch(e) { console.error("Inject Voice Opts Fail", e); }
        };
        injectVoiceOpts();

        const injectSentencesOpts = () => {
            try {
                const details = document.querySelector(`#modal-settings details:nth-of-type(8)`); 
                if(!details) return;
                const contentDiv = details.querySelector('div.p-4');
                if(contentDiv && !document.getElementById('sentences-bottom-disp')) {
                    const html = `
                    <div class="flex justify-between items-center mt-2">
                        <span class="text-xs font-bold">Bottom Display</span>
                        <select id="sentences-bottom-disp" class="text-xs font-bold bg-white dark:bg-neutral-700 border border-slate-200 dark:border-neutral-600 rounded-lg px-2 py-1 outline-none">
                            <option value="sentence">Sentence (Masked)</option>
                            <option value="word">Word (Masked)</option>
                            <option value="none">None</option>
                        </select>
                    </div>
                    <label class="flex justify-between items-center cursor-pointer mt-2"><span class="text-xs font-bold">Auto-Play on Correct</span><input type="checkbox" id="sentences-play-correct" class="w-4 h-4 accent-violet-600 rounded"></label>`;
                    contentDiv.insertAdjacentHTML('beforeend', html);
                    setVal('sentences-bottom-disp', p.sentencesBottomDisp);
                    setChk('sentences-play-correct', p.sentencesPlayCorrect);
                }
            } catch(e) { console.error("Inject Sentences Opts Fail", e); }
        };
        injectSentencesOpts();

        const devDetails = document.getElementById('details-developer'); if (devDetails && !document.getElementById('debug-log-area')) { const container = devDetails.querySelector('.p-4'); if(container) { const debugHTML = `<div class="h-px bg-slate-200 dark:bg-neutral-700 w-full mt-2"></div><div class="flex flex-col gap-2 mt-2"><div class="flex justify-between items-center"><span class="text-[9px] uppercase font-bold text-slate-400">System Logs</span><button onclick="app.ui.copyLogs()" class="px-2 py-1 bg-slate-200 dark:bg-neutral-700 rounded text-[10px] font-bold text-slate-600 dark:text-neutral-300 active:scale-95 transition-transform flex items-center gap-1"><i class="ph-bold ph-copy"></i> Copy</button></div><textarea id="debug-log-area" readonly class="w-full h-32 bg-black text-green-400 text-[10px] font-mono p-2 rounded-xl border border-slate-700 resize-none focus:outline-none focus:ring-1 focus:ring-green-500"></textarea></div>`; container.insertAdjacentHTML('beforeend', debugHTML); } } const logArea = document.getElementById('debug-log-area'); if(logArea && window.logBuffer) logArea.value = window.logBuffer.join('\n');
    }
    
    copyLogs() { const el = document.getElementById('debug-log-area'); if(!el) return; el.select(); document.execCommand('copy'); const btn = el.previousElementSibling.querySelector('button'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-check"></i> Copied`; setTimeout(() => btn.innerHTML = origText, 1500); }
    renderCelebGrid() { const grid = document.getElementById('celeb-grid'); if(!grid || !window.app || !window.app.celebration) return; grid.innerHTML = ''; const allEffects = Object.keys(window.app.celebration.effects); const userAllowed = this.store.prefs.allowedCelebs || []; const labelMap = { 'Confetti': '🎉', 'Stars': '⭐', 'Discs': '💿', 'Coin': '🪙', 'Money': '💸', 'Red Env': '🧧', 'Sushi': '🍣', 'Kimono': '👘', 'Carp': '🎏', 'Torii': '⛩️', 'Sake': '🍶', 'Bento': '🍱', 'Dragon': '🐲' }; allEffects.forEach(name => { const isEnabled = userAllowed.includes(name); const btn = document.createElement('button'); const baseClass = "text-2xl font-bold py-2 rounded-xl transition-all active:scale-95 border-2 shadow-sm truncate px-1 flex items-center justify-center"; const activeClass = "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700/50"; const inactiveClass = "bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-transparent hover:border-slate-200 dark:hover:border-neutral-700 grayscale opacity-60"; btn.className = `${baseClass} ${isEnabled ? activeClass : inactiveClass}`; btn.innerText = labelMap[name] || name; btn.onclick = () => this.store.toggleCeleb(name, btn, activeClass, inactiveClass); grid.appendChild(btn); }); }
    
    openEditModal() { 
        console.log("Open Edit Modal Clicked"); 
        try {
            if(!app.game || app.game.i === undefined || !app.data || !app.data.list) return; 
            const item = app.data.list[app.game.i]; 
            if(!item) return; 
            const container = document.getElementById('edit-form-body'); 
            if(!container) return;
            
            document.getElementById('edit-id').innerText = `#${item.id}`; 
            container.innerHTML = ''; 
            
            if(typeof LANG_CONFIG !== 'undefined') { 
                LANG_CONFIG.forEach(conf => { 
                    const val = item[conf.key] || ""; 
                    const exVal = conf.exKey ? (item[conf.exKey] || "") : ""; 
                    const safeVal = String(val).replace(/"/g, '&quot;');
                    const safeEx = String(exVal).replace(/</g, '&lt;');
                    
                    let html = `<div class="bg-slate-50 dark:bg-neutral-800/50 p-3 rounded-2xl border border-slate-100 dark:border-neutral-800"><label class="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-2"><span>${conf.icon}</span> ${conf.label}</label><input type="text" id="edit-field-${conf.key}" value="${safeVal}" placeholder="Word..." class="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-300 mb-2">`; 
                    if(conf.exKey) { html += `<textarea id="edit-field-${conf.exKey}" placeholder="Example Sentence..." rows="2" class="w-full bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 dark:text-neutral-400 outline-none focus:border-indigo-500 transition-all placeholder-slate-400">${safeEx}</textarea>`; } 
                    html += `</div>`; 
                    container.innerHTML += html; 
                }); 
            } 
            document.getElementById('modal-edit').classList.remove('hidden');
        } catch(e) { console.error("Open Edit Modal Error", e); }
    }
    
    closeEditModal() { document.getElementById('modal-edit').classList.add('hidden'); }
    async saveEdit() { if(!app.game || app.game.i === undefined) return; const currentItem = app.data.list[app.game.i]; const updates = { ...currentItem }; if(typeof LANG_CONFIG !== 'undefined') { LANG_CONFIG.forEach(conf => { const el = document.getElementById(`edit-field-${conf.key}`); if(el) updates[conf.key] = el.value.trim(); if(conf.exKey) { const elEx = document.getElementById(`edit-field-${conf.exKey}`); if(elEx) updates[conf.exKey] = elEx.value.trim(); } }); } const btn = document.querySelector('#modal-edit button[onclick="app.ui.saveEdit()"]'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Saving...`; btn.disabled = true; try { await app.data.saveCorrection(updates); this.closeEditModal(); app.game.render(); const bar = document.getElementById('status-bar'); bar.innerText = "Correction Saved!"; bar.classList.add('text-emerald-500'); setTimeout(() => bar.classList.remove('text-emerald-500'), 2000); } catch(e) { alert("Save failed: " + e.message); } finally { btn.innerHTML = origText; btn.disabled = false; } }
    showTooltip(e, char, isLongPress = false) { if (app.store.prefs.hanziEnableTooltip === false) return; if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; } if (this.autoCloseTimer) { clearTimeout(this.autoCloseTimer); this.autoCloseTimer = null; } const tooltip = document.getElementById('hanzi-tooltip'); if(!tooltip) return; tooltip.style.left = '-9999px'; tooltip.style.top = '-9999px'; tooltip.classList.remove('hidden', 'opacity-0'); let data = null; const findInItem = (item) => { if(!item) return null; const chKeys = Object.keys(item).filter(k => k.startsWith('ch') && !isNaN(k.substring(2))); for(const key of chKeys) { const parts = (item[key] || "").split('\\'); if (parts[0] === char || parts[1] === char) return parts; } return null; }; if (app.game && app.game.i !== undefined) { data = findInItem(app.data.list[app.game.i]); } if (!data) { for (const item of app.data.list) { data = findInItem(item); if (data) break; } } if(!data) return; const [trad, simp, pinyin, kr, en] = data; const p = app.store.prefs; tooltip.innerHTML = `<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-slate-200 dark:border-neutral-700 p-3 min-w-[150px] max-w-xs pointer-events-auto z-[100] relative" onclick="event.stopPropagation()"><button onclick="app.ui.hideTooltip(true)" class="absolute -top-3 -right-3 w-7 h-7 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform border border-white dark:border-neutral-600 z-[101]"><i class="ph-bold ph-x text-xs"></i></button><div class="flex items-center gap-3 mb-2 border-b border-slate-100 dark:border-neutral-700 pb-2">${p.hanziShowTrad!==false ? `<span class="text-3xl font-serif text-slate-800 dark:text-white font-black leading-none">${trad}</span>` : ''}${p.hanziShowSimp!==false && simp && simp !== trad ? `<span class="text-lg font-serif text-slate-400 leading-none">${simp}</span>` : ''}</div><div class="space-y-1">${p.hanziShowPinyin!==false ? `<p class="text-sm font-bold text-indigo-500 font-serif">${pinyin}</p>` : ''}${p.hanziShowKr!==false ? `<p class="text-xs text-slate-600 dark:text-neutral-300">🇰🇷 ${kr}</p>` : ''}${p.hanziShowEn!==false ? `<p class="text-xs text-slate-600 dark:text-neutral-300">🇺🇸 ${en}</p>` : ''}</div></div>`; requestAnimationFrame(() => { const rect = tooltip.getBoundingClientRect(); const w = rect.width; const h = rect.height; const offset = 20; let left, top; if (isLongPress) { const touch = e.touches[0]; left = touch.clientX - (w / 2); top = touch.clientY - h - 30; } else { left = e.clientX + offset; top = e.clientY + offset; } if (left + w > window.innerWidth) left = window.innerWidth - w - 10; if (left < 10) left = 10; if (top + h > window.innerHeight) top = window.innerHeight - h - 10; if (top < 10) top = 10; tooltip.style.left = `${left}px`; tooltip.style.top = `${top}px`; const closeTime = parseInt(p.hanziAutoClose || "0"); if (closeTime > 0) { this.autoCloseTimer = setTimeout(() => { this.hideTooltip(true); }, closeTime); } }); if (!isLongPress) { if(this.trackTooltip) document.removeEventListener('mousemove', this.trackTooltip); this.trackTooltip = (ev) => { let lx = ev.clientX + offset; let ly = ev.clientY + offset; if (lx + 200 > window.innerWidth) lx = window.innerWidth - 220; if (ly + 150 > window.innerHeight) ly = window.innerHeight - 170; tooltip.style.left = `${lx}px`; tooltip.style.top = `${ly}px`; }; document.addEventListener('mousemove', this.trackTooltip); } }
    hideTooltip(force = false) { if (this.autoCloseTimer) { clearTimeout(this.autoCloseTimer); this.autoCloseTimer = null; } const delay = force ? 0 : 200; if (this.hideTimer) clearTimeout(this.hideTimer); this.hideTimer = setTimeout(() => { const tooltip = document.getElementById('hanzi-tooltip'); if(tooltip) { tooltip.classList.add('opacity-0'); setTimeout(() => { tooltip.classList.add('hidden'); tooltip.style.left = '-9999px'; }, 200); } }, delay); if(this.trackTooltip) { document.removeEventListener('mousemove', this.trackTooltip); this.trackTooltip = null; } }
    openProfileModal() { if (!auth.currentUser) return; const user = auth.currentUser; const modal = document.getElementById('modal-profile'); const container = document.getElementById('profile-content'); const created = new Date(user.metadata.creationTime).toLocaleDateString(); container.innerHTML = `<div class="flex flex-col items-center mb-6"><img src="${user.photoURL}" class="w-24 h-24 rounded-full shadow-lg border-4 border-white dark:border-neutral-700 mb-3"><h3 class="text-xl font-black text-slate-800 dark:text-white">${user.displayName}</h3><p class="text-xs font-bold text-slate-400">${user.email}</p></div><div class="bg-slate-50 dark:bg-neutral-800 rounded-2xl p-4 border border-slate-100 dark:border-neutral-700 mb-6 space-y-2"><div class="flex justify-between text-sm"><span class="text-slate-500 font-bold">Active Since</span><span class="font-bold text-slate-800 dark:text-neutral-300">${created}</span></div></div><button onclick="app.auth.logout(); document.getElementById('modal-profile').classList.add('hidden');" class="w-full bg-slate-200 dark:bg-neutral-700 hover:bg-slate-300 text-slate-700 dark:text-neutral-300 font-bold py-3 rounded-xl mb-3">Log Out</button><button onclick="app.data.deleteUserAccount()" class="w-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-200 font-bold py-3 rounded-xl">Delete Account</button>`; modal.classList.remove('hidden'); }
    async openStatsModal() {
        const modal = document.getElementById('modal-stats');
        modal.classList.remove('hidden');
        const canvas = document.getElementById('stats-chart');
        const ctx = canvas.getContext('2d');
        if(window.myStatsChart) window.myStatsChart.destroy();
        const stats = await app.data.getStats();
        const dailyData = (stats && stats.daily) ? stats.daily : {};
        const labels = ['M', 'T', 'W', 'R', 'F', 'S', 'S'];
        const curr = new Date();
        const day = curr.getDay(); 
        const diffToMon = curr.getDate() - day + (day === 0 ? -6 : 1);
        const mondayDate = new Date(curr.setDate(diffToMon));
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
        let yMax = 1000;
        if (maxVal > 900) yMax = 5000;
        if (maxVal > 4500) yMax = 10000;
        if (maxVal > 9000) yMax = 20000;
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
}
