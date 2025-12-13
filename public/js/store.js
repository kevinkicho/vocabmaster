/* js/store.js */
class Store {
    constructor() {
        const defaults = (typeof GET_DEFAULTS === 'function') ? GET_DEFAULTS() : {};
        this.STORAGE_KEY = 'vm_prefs_v1175_STABLE'; 

        const customDefaults = {
            ...defaults,
            flashAudioSrc: 'ja', 
            sentencesBottomLang: 'en',
            sentencesBottomDisp: 'sentence',
            font: 'sans',
            quizPlayAnswer: true // NEW DEFAULT
        };

        try {
            const stored = JSON.parse(localStorage.getItem(this.STORAGE_KEY));
            this.prefs = stored ? { ...customDefaults, ...stored } : customDefaults;
        } catch (e) {
            this.prefs = customDefaults;
        }

        try { this.locs = JSON.parse(localStorage.getItem('vm_locs')) || {}; } catch (e) { this.locs = {}; }
        try { this.matchState = JSON.parse(localStorage.getItem('vm_match_state_final')) || null; } catch (e) { this.matchState = null; }

        setTimeout(() => this.applyTheme(), 0);
    }
    
    cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    saveSettings() {
        const getChk = (id, currentVal) => { 
            const el = document.getElementById(id); 
            return el ? el.checked : currentVal; 
        };
        const getVal = (id, currentVal) => { 
            const el = document.getElementById(id); 
            return el ? el.value : currentVal; 
        };
        const getRad = (name, currentVal) => { 
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            return checked ? checked.value : currentVal;
        };

        const prevClickMode = this.prefs.globalClickMode;

        // Global
        this.prefs.globalClickMode = getRad('global-click-mode', this.prefs.globalClickMode);
        this.prefs.dark = getChk('toggle-dark', this.prefs.dark);
        this.prefs.anim = getChk('toggle-anim', this.prefs.anim);
        this.prefs.showAudioBtns = getChk('toggle-show-audio-btns', this.prefs.showAudioBtns);
        this.prefs.masterAudio = getChk('toggle-master-audio', this.prefs.masterAudio);
        this.prefs.audioWait = getChk('toggle-audio-wait', this.prefs.audioWait);
        this.prefs.font = getVal('app-font', this.prefs.font);

        // Flash
        this.prefs.flashSpeed = getVal('flash-speed', this.prefs.flashSpeed);
        this.prefs.flashRandom = getChk('flash-random', this.prefs.flashRandom);
        this.prefs.flashAuto = getChk('flash-auto', this.prefs.flashAuto);
        this.prefs.flashFront = getVal('flash-front', this.prefs.flashFront);
        this.prefs.flashBack1 = getVal('flash-back-1', this.prefs.flashBack1);
        this.prefs.flashBack2 = getVal('flash-back-2', this.prefs.flashBack2);
        this.prefs.flashBack3 = getVal('flash-back-3', this.prefs.flashBack3); 
        this.prefs.flashBack4 = getVal('flash-back-4', this.prefs.flashBack4); 
        this.prefs.flashAudioSrc = getVal('flash-audio-src', this.prefs.flashAudioSrc);

        // Quiz
        this.prefs.quizQ = getVal('quiz-q-type', this.prefs.quizQ);
        this.prefs.quizA = getVal('quiz-a-type', this.prefs.quizA);
        this.prefs.quizRandom = getChk('quiz-random', this.prefs.quizRandom);
        this.prefs.quizAuto = getChk('quiz-auto', this.prefs.quizAuto);
        this.prefs.quizAudioSrc = getVal('quiz-audio-src', this.prefs.quizAudioSrc);
        this.prefs.quizShowEx = getChk('quiz-show-ex', this.prefs.quizShowEx);
        this.prefs.quizExMain = getVal('quiz-ex-main', this.prefs.quizExMain);
        this.prefs.quizExSub = getVal('quiz-ex-sub', this.prefs.quizExSub);
        this.prefs.quizPlayEx = getChk('quiz-play-ex', this.prefs.quizPlayEx); 
        this.prefs.quizPlayCorrect = getChk('quiz-play-correct', this.prefs.quizPlayCorrect);
        this.prefs.quizPlayAnswer = getChk('quiz-play-answer', this.prefs.quizPlayAnswer);

        // TF
        this.prefs.tfRandom = getChk('tf-random', this.prefs.tfRandom);
        this.prefs.tfAuto = getChk('tf-auto', this.prefs.tfAuto);
        this.prefs.tfFront = getVal('tf-front', this.prefs.tfFront);
        this.prefs.tfBack = getVal('tf-back', this.prefs.tfBack);
        this.prefs.tfAudioSrc = getVal('tf-audio-src', this.prefs.tfAudioSrc);
        this.prefs.tfShowEx = getChk('tf-show-ex', this.prefs.tfShowEx);
        this.prefs.tfExMain = getVal('tf-ex-main', this.prefs.tfExMain);
        this.prefs.tfExSub = getVal('tf-ex-sub', this.prefs.tfExSub);
        this.prefs.tfPlayEx = getChk('tf-play-ex', this.prefs.tfPlayEx);

        // Match
        if(typeof LANG_CONFIG !== 'undefined') {
            LANG_CONFIG.forEach(l => {
                const showKey = `matchShow${this.cap(l.key)}`;
                this.prefs[showKey] = getChk(`match-show-${l.key}`, this.prefs[showKey]);
                if(!l.visualOnly) {
                    const audKey = `matchAudio_${l.key}`;
                    const btnKey = `btnAudio_${l.key}`;
                    this.prefs[audKey] = getChk(`matchAudio-${l.key}`, this.prefs[audKey]);
                    this.prefs[btnKey] = getChk(`btnAudio-${l.key}`, this.prefs[btnKey]);
                }
            });
        }
        this.prefs.matchHint = getChk('match-hint', this.prefs.matchHint);

        // Voice
        this.prefs.voiceAuto = getChk('voice-auto', this.prefs.voiceAuto);
        this.prefs.voiceRandom = getChk('voice-random', this.prefs.voiceRandom); 
        this.prefs.voiceDispFront = getVal('voice-disp-front', this.prefs.voiceDispFront);
        this.prefs.voiceDispBack = getVal('voice-disp-back', this.prefs.voiceDispBack);
        this.prefs.voiceAudioTarget = getVal('voice-audio-target', this.prefs.voiceAudioTarget);
        this.prefs.voicePlayEx = getChk('voice-play-ex', this.prefs.voicePlayEx);
        this.prefs.voiceExMain = getVal('voice-ex-main', this.prefs.voiceExMain);
        this.prefs.voicePlayCorrect = getChk('voice-play-correct', this.prefs.voicePlayCorrect);
        
        // Sentences
        this.prefs.sentencesQ = getVal('sentences-q', this.prefs.sentencesQ);
        this.prefs.sentencesA = getVal('sentences-a', this.prefs.sentencesA);
        this.prefs.sentencesTrans = getVal('sentences-trans', this.prefs.sentencesTrans);
        this.prefs.sentencesBottomDisp = getVal('sentences-bottom-disp', this.prefs.sentencesBottomDisp);
        this.prefs.sentencesBottomLang = getVal('sentences-bottom-lang', this.prefs.sentencesBottomLang);
        
        this.prefs.sentencesAuto = getChk('sentences-auto', this.prefs.sentencesAuto);
        this.prefs.sentencesRandom = getChk('sentences-random', this.prefs.sentencesRandom);
        this.prefs.sentencesAudioSrc = getVal('sentences-audio-src', this.prefs.sentencesAudioSrc);
        this.prefs.sentencesPlayCorrect = getChk('sentences-play-correct', this.prefs.sentencesPlayCorrect);

        // Hanzi
        this.prefs.hanziEnableTooltip = getChk('hanzi-enable-tooltip', this.prefs.hanziEnableTooltip !== false);
        this.prefs.hanziAutoClose = getVal('hanzi-tooltip-timer', this.prefs.hanziAutoClose);
        this.prefs.hanziShowTrad = getChk('hanzi-show-trad', this.prefs.hanziShowTrad !== false);
        this.prefs.hanziShowSimp = getChk('hanzi-show-simp', this.prefs.hanziShowSimp !== false);
        this.prefs.hanziShowPinyin = getChk('hanzi-show-pinyin', this.prefs.hanziShowPinyin !== false);
        this.prefs.hanziShowKr = getChk('hanzi-show-kr', this.prefs.hanziShowKr !== false);
        this.prefs.hanziShowEn = getChk('hanzi-show-en', this.prefs.hanziShowEn !== false);

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.prefs));
        this.applyTheme();
        
        if(window.app && window.app.game) {
            if (window.app.game.resizeGame) { window.app.game.startNewGame(window.app.game.state.pairs); } 
            else if (window.app.game.update) { window.app.game.update(); }
            else { window.app.game.render(); }
        }
        if(window.app && window.app.notes && window.app.notes.currentWordId) {
            window.app.notes.check(window.app.notes.currentWordId);
        }

        if (prevClickMode !== this.prefs.globalClickMode) {
            if(confirm("Click Mode Changed: Reload App to apply?")) {
                location.reload();
            }
        }
    }

    applyPresetSettings(newPrefs) {
        this.prefs = newPrefs;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.prefs));
        if(window.app && window.app.ui) window.app.ui.loadSettings();
        if(window.app && window.app.game) {
            if (window.app.game.resizeGame) { window.app.game.state.matched = []; window.app.game.startNewGame(window.app.game.state.pairs); } 
            else if (window.app.game.update) { window.app.game.update(); }
            else { window.app.game.render(); }
        }
        this.applyTheme();
    }

    setTheme(name) { this.prefs.theme = name; this.saveSettings(); }
    
    applyTheme() { 
        document.documentElement.classList.toggle('dark', this.prefs.dark); 
        document.body.classList.toggle('no-anim', !this.prefs.anim);
        document.documentElement.setAttribute('data-theme', this.prefs.theme || 'classic');
        
        const fontMode = this.prefs.font || 'sans';
        document.documentElement.setAttribute('data-font', fontMode);
        if (fontMode === 'serif') {
            document.body.classList.remove('font-sans');
            document.body.classList.add('font-serif');
        } else {
            document.body.classList.remove('font-serif');
            document.body.classList.add('font-sans');
        }
    }
    
    getLoc(mode) { return this.locs[mode] || 0; }
    setLoc(mode, idx) { this.locs[mode] = idx; localStorage.setItem('vm_locs', JSON.stringify(this.locs)); }
    saveMatch(state) { this.matchState = state; localStorage.setItem('vm_match_state_final', JSON.stringify(state)); }
    clearMatch() { this.matchState = null; localStorage.removeItem('vm_match_state_final'); }
    toggleCeleb(name, btn, active, inactive) {
        let list = this.prefs.allowedCelebs || [];
        if(list.includes(name)) { list = list.filter(x => x !== name); btn.className = btn.className.replace(active, inactive); } 
        else { list.push(name); btn.className = btn.className.replace(inactive, active); }
        this.prefs.allowedCelebs = list;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.prefs));
    }
    setAllCelebs(enable) {
        if(enable && window.app && window.app.celebration) { this.prefs.allowedCelebs = Object.keys(window.app.celebration.effects); } 
        else { this.prefs.allowedCelebs = []; }
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.prefs));
        window.app.ui.renderCelebGrid(); 
    }
}
