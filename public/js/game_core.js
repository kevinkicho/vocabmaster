/* js/game_core.js */
class GameMode {
    constructor(key) {
        this.key = key;
        console.log(`[GameMode] Init: ${key}`);
        this.i = app.store.getLoc(key);
        this.list = app.data.list;
        this.root = document.getElementById('app-view');
        this.busy = false;
        this.answered = false;
        this.timeouts = []; 
        this.uiTimer = null; 
        this.selectedEl = null; 
        
        // Caching DOM elements to avoid querySelector re-runs
        this.dom = {}; 

        this.historyStack = [];
        this.historyPtr = -1;
        if (this.list && this.list.length > 0) {
             this.historyStack.push(this.i);
             this.historyPtr = 0;
        }
        
        this.onWindowResize = () => {
            if(this.resizeTimeout) clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                app.fitter.fitAll();
                if(typeof this.handleResize === 'function') this.handleResize();
            }, 100);
        };
        window.addEventListener('resize', this.onWindowResize);
        this.bindKeys();
    }
    
    // --- INPUT HANDLING ---
    handleInput(el, text, lang, onConfirm) {
        if (this.busy || this.answered) return;
        const mode = app.store.prefs.globalClickMode || 'double';

        if (mode === 'single') {
            onConfirm();
        } else {
            if (this.selectedEl === el) {
                onConfirm();
                this.selectedEl = null;
            } else {
                if (this.selectedEl) {
                    this.selectedEl.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
                }
                this.selectedEl = el;
                el.classList.add('ring-4', 'ring-indigo-400', 'scale-95', 'transition-transform');
                if(text && lang) app.audio.play(text, lang, null, 0);
            }
        }
    }
    
    bindKeys() {
        this.boundHandleKey = (e) => this.handleKey(e);
        document.addEventListener('keydown', this.boundHandleKey);
    }
    unbindKeys() { document.removeEventListener('keydown', this.boundHandleKey); }
    handleKey(e) {
        if (document.getElementById('modal-note') && !document.getElementById('modal-note').classList.contains('hidden')) return;
        if (document.getElementById('modal-settings') && !document.getElementById('modal-settings').classList.contains('hidden')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        const k = e.key.toLowerCase();
        if (['arrowright', 'enter', ' ', 'd', 'w'].includes(k)) { e.preventDefault(); this.triggerAction('next'); }
        else if (['arrowleft', 'backspace', 'a', 's'].includes(k)) { e.preventDefault(); this.triggerAction('prev'); }
        else if (k === 'arrowup') { e.preventDefault(); this.triggerAction('up'); }
        else if (k === 'arrowdown') { e.preventDefault(); this.triggerAction('down'); }
    }
    triggerAction(action) { if (action === 'next' || action === 'up') this.nav(1); else if (action === 'prev' || action === 'down') this.nav(-1); }
    
    // --- NAVIGATION ---
    nav(d) { 
        if(this.busy) return;
        if(app.ui) app.ui.hideTooltip();
        this.selectedEl = null; 

        const p = app.store.prefs;
        const rnd = (p[`${this.key}Random`] === true) || (this.key === 'match' && false); 
        
        if (rnd) { 
            if (d > 0) {
                if (this.historyPtr < this.historyStack.length - 1) {
                    this.historyPtr++;
                    this.i = this.historyStack[this.historyPtr];
                } else {
                    let newItem;
                    let safety = 0;
                    do { newItem = Math.floor(Math.random() * this.list.length); safety++; } 
                    while (newItem === this.i && this.list.length > 1 && safety < 10);
                    this.i = newItem;
                    this.historyStack.push(this.i);
                    this.historyPtr++;
                }
            } else {
                if (this.historyPtr > 0) {
                    this.historyPtr--;
                    this.i = this.historyStack[this.historyPtr];
                } else { return; }
            }
        } else { 
            this.i = (this.i + d + this.list.length) % this.list.length; 
        }
        
        this.save(); 
        history.pushState({ view: 'game', mode: this.key, index: this.i }, ''); 
        
        // OPTIMIZATION: If update() exists, use it. Otherwise fallback to full render().
        if (typeof this.update === 'function') {
            this.update();
        } else {
            this.render(); 
        }
    }
    
    jump(val) { 
        const n = parseInt(val); 
        if(n>0 && n<=this.list.length) { 
            this.i = n-1; this.save(); 
            history.pushState({ view: 'game', mode: this.key, index: this.i }, '');
            if (typeof this.update === 'function') this.update(); else this.render();
        } 
    }
    rand() { 
        this.i = Math.floor(Math.random() * this.list.length); 
        this.historyStack.push(this.i);
        this.historyPtr = this.historyStack.length - 1;
        this.save(); 
        if (typeof this.update === 'function') this.update(); else this.render();
    }
    
    save() { app.store.setLoc(this.key, this.i); }
    restoreState(index) { 
        this.i = index; this.save(); 
        if (typeof this.update === 'function') this.update(); else this.render();
    }
    setTimeout(fn, delay) { const id = window.setTimeout(fn, delay); this.timeouts.push(id); return id; }
    
    score(pts=10) { 
        app.score += pts; 
        const el = document.querySelector('.score-display'); 
        if(el) el.innerText = app.score; 
        if(app.data) app.data.recordScore(pts, this.key);
    }

    async waitAndNav(audioPromise, fallbackDelay = 1500) {
        const wait = app.store.prefs.audioWait;
        if (wait && audioPromise) {
            await audioPromise;
        } else {
            await new Promise(r => setTimeout(r, fallbackDelay));
        }
        this.busy = false; 
        this.nav(1);
    }

    // --- RENDER HELPERS ---
    wrapHanzi(text) {
        if (!text) return "";
        return text.replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF])/g, '<span class="hanzi-char cursor-help transition-colors" data-char="$1">$1</span>');
    }

    toggle(el, w, r, ex, srcEx, orig) {
        if(this.answered) return;
        const target = el.classList.contains('fit-target') ? el : el.querySelector('.fit-target');
        if(!target) return;
        const currentTxt = target.innerText.trim();
        const isValid = (txt) => txt && txt.trim() !== "" && txt !== orig;

        if (currentTxt === orig) {
            if (isValid(r)) { 
                target.innerHTML = this.wrapHanzi(r); 
                target.classList.add('text-indigo-600', 'dark:text-indigo-400');
            } else if (isValid(ex)) { 
                this.renderExample(target, ex, srcEx); 
                this.tryPlayExampleAudio(); 
            }
        } 
        else if (currentTxt === r) {
            if (isValid(ex)) { 
                this.renderExample(target, ex, srcEx); 
                this.tryPlayExampleAudio(); 
            } else { this.resetToOrig(target, orig); }
        }
        else { this.resetToOrig(target, orig); }
        
        app.fitter.fit(target);
        if(app.notes) app.notes.attachTooltipListeners();
    }

    renderExample(target, ex, srcEx) {
        let html = `<div class="flex flex-col items-center justify-center gap-1 leading-tight"><span>${this.wrapHanzi(ex)}</span>`;
        if (srcEx && srcEx.trim() !== "") { html += `<span class="text-[0.5em] text-slate-400 dark:text-neutral-500 font-bold opacity-80 font-sans">${this.wrapHanzi(srcEx)}</span>`; }
        html += `</div>`;
        target.innerHTML = html;
        target.classList.remove('text-indigo-600', 'dark:text-indigo-400');
        target.classList.add('text-emerald-600', 'dark:text-emerald-400');
    }

    resetToOrig(target, orig) {
        target.innerHTML = this.wrapHanzi(orig);
        target.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'text-emerald-600', 'dark:text-emerald-400');
    }
    
    highlightQBox(el, isCorrect) {
         if(this.uiTimer) clearTimeout(this.uiTimer);
         const classes = ['bg-emerald-500', 'border-emerald-500', 'bg-rose-500', 'border-rose-500', 'bg-white', 'dark:bg-neutral-900', 'border-slate-100', 'dark:border-neutral-800'];
         el.classList.remove(...classes);
         el.classList.add(...(isCorrect ? ['bg-emerald-500', 'border-emerald-500'] : ['bg-rose-500', 'border-rose-500']));
         if(app.store.prefs.anim) el.classList.add(isCorrect ? 'anim-pulse-green' : 'anim-pulse-red');
         const txt = el.querySelector('.fit-target');
         if(txt) {
             txt.classList.remove('text-slate-800', 'dark:text-neutral-200', 'text-indigo-600', 'dark:text-indigo-400', 'text-emerald-600', 'dark:text-emerald-400');
             txt.classList.add('text-white');
         }
    }

    getDistractors(correctId, count) {
        let pool = [this.list.find(x => x.id === correctId)];
        let safety = 0;
        while(pool.length < count && safety < 100) { 
            const r = app.data.rand(); 
            if(r.id !== correctId && !pool.find(x => x.id === r.id)) { pool.push(r); }
            safety++;
        }
        return pool.sort(()=>Math.random()-0.5);
    }

    tryPlayExampleAudio() {
        const p = app.store.prefs;
        const mode = this.key;
        if ((mode === 'quiz' && p.quizPlayEx) || (mode === 'tf' && p.tfPlayEx) || (mode === 'voice' && p.voicePlayEx)) {
            let mainKey = p[`${mode}ExMain`] || 'ja';
            const item = this.list[this.i];
            let exText = "";
            if (typeof LANG_CONFIG !== 'undefined') {
                const conf = LANG_CONFIG.find(l => l.key === mainKey);
                if (conf && conf.exKey) exText = item[conf.exKey];
            }
            if (exText) app.audio.play(exText, mainKey, null, 0);
        }
    }

    playSmartAudio(langKey) {
        const item = this.list[this.i];
        const p = app.store.prefs;
        const mode = this.key;

        let exText = "";
        let conf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l => l.key === langKey) : null;
        if (conf && conf.exKey) exText = item[conf.exKey];

        // Specific logic for Sentences mode
        if (mode === 'sentences') {
            if (exText) {
                 const targetWord = item[langKey] || ""; 
                 if (targetWord) {
                     const separators = /[·・,;、\/|]/g;
                     const variants = targetWord.split(separators).map(s => s.trim()).filter(s => s);
                     variants.sort((a, b) => b.length - a.length);
                     const matchedVariant = variants.find(v => exText.toLowerCase().includes(v.toLowerCase()));
                     if (matchedVariant) {
                         const escapedWord = matchedVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                         const regex = new RegExp(escapedWord, 'gi');
                         const isAsian = ['ja', 'zh', 'ko'].some(k => langKey.startsWith(k));
                         const pauseChar = isAsian ? '、' : ' ; ... '; 
                         return app.audio.play(exText.replace(regex, pauseChar), langKey, null, 0);
                     }
                 }
                 return app.audio.play(exText, langKey);
            }
        }

        const showExQuiz = (mode === 'quiz' && p.quizShowEx);
        const showExTF = (mode === 'tf' && p.tfShowEx);
        
        let isExampleVisible = false;
        // Optimization: Only look in this.root
        const targets = this.root.querySelectorAll('.fit-target');
        targets.forEach(t => { if(exText && exText.trim().length > 0 && t.innerText.includes(exText.trim())) { isExampleVisible = true; } });

        if (isExampleVisible || showExQuiz || showExTF) {
             if (exText && exText.trim().length > 0) {
                 return app.audio.play(exText, langKey, null, 0);
             }
        }

        let text = item[langKey];
        let actualKey = langKey;
        if(conf && conf.visualOnly && conf.audioSrc) { text = item[conf.audioSrc]; actualKey = conf.audioSrc; }
        
        return app.audio.play(text, actualKey, null, 0);
    }
    
    autoPlay(context) { 
        const p = app.store.prefs;
        const item = this.list[this.i];
        let isOn = false;
        let sourceKey = 'ja';
        
        if (context === 'flash') { isOn = p.flashAuto; sourceKey = p.flashAudioSrc; }
        else if (context === 'quiz') { isOn = p.quizAuto; sourceKey = p.quizAudioSrc; }
        else if (context === 'tf') { isOn = p.tfAuto; sourceKey = p.tfAudioSrc; }
        else if (context === 'voice') { isOn = p.voiceAuto; sourceKey = p.voiceAudioTarget; }
        else if (context === 'sentences') { isOn = p.sentencesAuto; sourceKey = p.sentencesAudioSrc; }

        if(isOn && sourceKey) { 
            let text = item[sourceKey];
            let actualKey = sourceKey;
            if(typeof LANG_CONFIG !== 'undefined') {
                const conf = LANG_CONFIG.find(l => l.key === sourceKey);
                if(conf && conf.visualOnly && conf.audioSrc) { text = item[conf.audioSrc]; actualKey = conf.audioSrc; }
            }
            if(text) this.setTimeout(() => app.audio.play(text, actualKey, context, 300), 0); 
        }
    }
    
    resolveAudioText(item, langKey) {
        let text = item[langKey];
        let actualLangKey = langKey;
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === langKey);
            if(conf && conf.visualOnly && conf.audioSrc) { text = item[conf.audioSrc]; actualLangKey = conf.audioSrc; }
        }
        return { text, key: actualLangKey };
    }

    destroy() {
        this.timeouts.forEach(id => clearTimeout(id));
        if(this.uiTimer) clearTimeout(this.uiTimer);
        this.timeouts = [];
        window.removeEventListener('resize', this.onWindowResize);
        this.unbindKeys();
        if(app.ui) app.ui.hideTooltip(); 
    }
    
    async afterRender() { 
        await app.fitter.fitAll();
        if(this.list && this.list[this.i] && app.notes) { 
            if (this.key !== 'match') {
                app.notes.check(this.list[this.i].id); 
            }
        }
        // Optimization: scope querySelector to this.root
        const targets = this.root.querySelectorAll('.fit-target');
        targets.forEach(el => { if (el.innerHTML.indexOf('<span class="hanzi-char') === -1) { el.innerHTML = this.wrapHanzi(el.innerText); } });
        if(app.notes) app.notes.attachTooltipListeners();
        
        // Use requestAnimationFrame for smoother visibility toggle
        requestAnimationFrame(() => { if(this.root) this.root.classList.add('visible'); });
    }
}
