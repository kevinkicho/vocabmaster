/* js/store.js */
class Store {
    constructor() {
        this.STORAGE_KEY = 'vm_prefs_v1195_STABLE'; 

        // Build defaults from the preference registry (preferences_registry.js)
        const defaults = (typeof buildDefaultsFromSchema === 'function' && typeof LANG_CONFIG !== 'undefined')
            ? buildDefaultsFromSchema(LANG_CONFIG)
            : (typeof GET_DEFAULTS === 'function' ? GET_DEFAULTS() : {});

        if (typeof buildDefaultsFromSchema !== 'function') {
            // Fallback: legacy customDefaults (will be removed after registry migration)
            const customDefaults = {
                ...defaults,
                flashAudioSrc: 'ja',
                sentencesBottomLang: 'en',
                sentencesBottomDisp: 'sentence',
                font: 'sans',
                quizPlayAnswer: true,
                showAudioBtns: true,
                quizShowEx: false,
                sentencesReadWhole: false,
                selectedVoices: {}
            };
            try {
                const stored = JSON.parse(localStorage.getItem(this.STORAGE_KEY));
                this.prefs = stored ? { ...customDefaults, ...stored } : customDefaults;
            } catch (e) {
                this.prefs = customDefaults;
            }
        } else {
            try {
                const stored = JSON.parse(localStorage.getItem(this.STORAGE_KEY));
                this.prefs = stored ? { ...defaults, ...stored } : defaults;
            } catch (e) {
                this.prefs = defaults;
            }
        }

        try { this.locs = JSON.parse(localStorage.getItem('vm_locs')) || {}; } catch (e) { this.locs = {}; }
        try { this.matchState = JSON.parse(localStorage.getItem('vm_match_state_final')) || null; } catch (e) { this.matchState = null; }

        setTimeout(() => this.applyTheme(), 0);
    }
    
    cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    saveSettings() {
        const prevClickMode = this.prefs.globalClickMode;

        // Read all DOM-bound preferences using the registry (single source via readPrefFromDom)
        if (typeof getAllPrefs === 'function') {
            const allPrefs = getAllPrefs(typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG : []);
            for (const entry of allPrefs) {
                try {
                    if (!entry.domId) continue;
                    let val;
                    if (typeof readPrefFromDom === 'function') {
                        val = readPrefFromDom(entry);
                    } else {
                        const el = document.getElementById(entry.domId);
                        if (!el) continue;
                        switch (entry.type) {
                            case 'bool':   val = el.checked; break;
                            case 'radio': {
                                const checked = document.querySelector('input[name="' + entry.domId + '"]:checked');
                                val = checked ? checked.value : this.prefs[entry.key];
                                break;
                            }
                            default:       val = el.value; break;
                        }
                    }
                    if (val !== null && val !== undefined) {
                        this.prefs[entry.key] = val;
                    }
                } catch (e) { /* per-entry robustness */ }
            }
        }

        // Voice Selection (not in registry — dynamic per-language selects)
        if (typeof LANG_CONFIG !== 'undefined') {
            LANG_CONFIG.forEach(l => {
                if (!l.visualOnly) {
                    const el = document.getElementById('voice-select-' + l.key);
                    if (el) this.prefs.selectedVoices[l.key] = el.value;
                }
            });
        }

        // LLM connection re-sync
        if (window.app && window.app.llm) {
            app.llm.loadPrefs();
            app.llm.checkConnection().then(ok => {
                if (app.ui) app.ui.updateLLMStatus(ok && app.llm.hasModel);
            });
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.prefs));
        this.applyTheme();
        
        if(window.app && window.app.game) {
            const game = window.app.game;
            // Keep review/session scope when _reviewList is set (do not expand to full filter)
            if (typeof window.assignGameList === 'function') {
                window.assignGameList(game);
            } else {
                game.list = app.data.getFilteredList();
                if (game.list.length === 0) game.list = app.data.activeList;
            }
            if (game.i >= game.list.length) game.i = 0;
            game.historyStack = [game.i];
            game.historyPtr = 0;
            game.save();
            if (game.resizeGame) { game.startNewGame(game.state.pairs); } 
            else if (game.update) { game.update(); }
            else { game.render(); }
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
            const game = window.app.game;
            // Keep review/session scope when _reviewList is set (do not expand to full filter)
            if (typeof window.assignGameList === 'function') {
                window.assignGameList(game);
            } else {
                game.list = app.data.getFilteredList();
                if (game.list.length === 0) game.list = app.data.activeList;
            }
            if (game.i >= game.list.length) game.i = 0;
            game.historyStack = [game.i];
            game.historyPtr = 0;
            game.save();
            if (game.resizeGame) { game.state.matched = []; game.startNewGame(game.state.pairs); } 
            else if (game.update) { game.update(); }
            else { game.render(); }
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
