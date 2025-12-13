class Sentences extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
    }
    
    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col">
                    <div id="sn-header"></div>
                    <div id="s-box" class="bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm flex-1 flex flex-col items-center justify-center p-6 text-center relative mb-2 landscape:mb-2 overflow-hidden">
                         <div class="flex-1 w-full flex items-center justify-center overflow-y-auto thin-scroll">
                            <p id="sn-text" class="text-xl sm:text-2xl font-black text-slate-800 dark:text-neutral-100 leading-relaxed"></p>
                         </div>
                         <div id="sn-bottom-disp"></div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between landscape:pt-2 min-h-0">
                    <div id="sn-audio" class="mt-auto landscape:mt-0"></div>
                    <div class="grid grid-cols-2 gap-2 sm:gap-3 shrink-0 mb-1 mt-1 flex-1 min-h-0">
                        ${[0,1,2,3].map(i => `
                            <div class="w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-violet-200 dark:hover:border-violet-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix">
                                <button id="sn-btn-${i}" class="absolute inset-0 w-full h-full fit-box z-10">
                                    <span class="fit-target font-black text-slate-600 dark:text-neutral-400"></span>
                                </button>
                            </div>`).join('')}
                    </div>
                    <div id="sn-nav"></div>
                </div>
            </div>`;

        this.dom.header = this.root.querySelector('#sn-header');
        this.dom.sBox = this.root.querySelector('#s-box');
        this.dom.text = this.root.querySelector('#sn-text');
        this.dom.bottomDisp = this.root.querySelector('#sn-bottom-disp');
        this.dom.audio = this.root.querySelector('#sn-audio');
        this.dom.btns = [0,1,2,3].map(i => this.root.querySelector(`#sn-btn-${i}`));
        
        this.root.querySelector('#sn-nav').innerHTML = app.ui.nav();
    }

    update() {
        this.busy = false; 
        this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.sentencesQ || 'ja'; 
        const aKey = p.sentencesA || 'ja'; 
        
        const bottomKey = p.sentencesBottomLang || 'en';
        
        const createMask = (word) => {
            const id = 'main-blank-' + Math.random().toString(36).substr(2, 5);
            return `<span id="${id}" data-word="${word}" class="main-blank inline-block px-1 mx-1 border-b-2 border-violet-400 bg-violet-100 dark:bg-violet-900/50 rounded text-transparent select-none transition-all duration-300 min-w-[2em] text-center align-bottom">${word}</span>`;
        };

        let exKey = '';
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === qKey);
            if(conf && conf.exKey) exKey = conf.exKey;
        }
        const sentenceRaw = c[exKey] || "No example available.";
        let maskedSentence = sentenceRaw;
        
        // --- 1. Parentheses Logic ---
        const parenRegex = /\(([^)]+)\)/g;
        if (typeof sentenceRaw === 'string' && sentenceRaw.match(parenRegex)) {
             maskedSentence = sentenceRaw.replace(parenRegex, (match, p1) => createMask(p1));
             const isAsian = ['ja', 'zh', 'ko'].some(k => qKey.startsWith(k));
             const pauseChar = isAsian ? '、' : ' ... '; 
             this.maskedAudioText = sentenceRaw.replace(parenRegex, pauseChar);
             
        } else {
             // --- 2. Scatter/Split Logic ---
             const targetWord = c[qKey] || "";
             const separators = /[·・,;、\/|\s]/g; // Split by space too
             let tokens = targetWord.split(separators).map(s => s.trim()).filter(s => s);
             tokens.sort((a, b) => b.length - a.length); // Longest first
             
             let tempSentence = sentenceRaw;
             let foundAny = false;

             tokens.forEach(token => {
                 if(token.length < 2 && !['a','I'].includes(token)) return; 
                 const reg = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                 if(tempSentence.match(reg)) {
                     tempSentence = tempSentence.replace(reg, (match) => createMask(match));
                     foundAny = true;
                 }
             });

             if(foundAny) {
                 maskedSentence = tempSentence;
                 this.maskedAudioText = sentenceRaw; 
             } else {
                 if(sentenceRaw.includes(targetWord)) {
                     const reg = new RegExp(targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                     maskedSentence = sentenceRaw.replace(reg, createMask(targetWord));
                 }
             }
        }

        let bottomHtml = '';
        const dispMode = p.sentencesBottomDisp || 'sentence'; 

        if (dispMode !== 'none') {
            let bottomText = '';
            const sourceText = c[bottomKey]; 

            if (dispMode === 'sentence') {
                let bExKey = bottomKey;
                const bConf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l => l.key === bottomKey) : null;
                if (bConf && bConf.exKey) bExKey = bConf.exKey;
                const transSent = c[bExKey]; 
                
                if (transSent && sourceText) {
                    const separators = /[·・,;、\/|]/g;
                    const tv = sourceText.split(separators).map(s => s.trim()).filter(s => s);
                    tv.sort((a,b) => b.length - a.length);
                    const tm = tv.find(v => transSent.toLowerCase().includes(v.toLowerCase()));
                    if (tm) {
                        const tReg = new RegExp(tm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                        bottomText = transSent.replace(tReg, `<span id="trans-blank" class="inline-block px-1 mx-1 border-b-2 border-violet-400 bg-violet-100 dark:bg-violet-900/50 rounded text-transparent select-none transition-all duration-300 min-w-[2em] text-center align-bottom">${tm}</span>`);
                    } else { bottomText = transSent; }
                } else { bottomText = transSent || sourceText || ""; }
            } else {
                if (sourceText) bottomText = `<span id="trans-blank" class="inline-block px-1 mx-1 border-b-2 border-violet-400 bg-violet-100 dark:bg-violet-900/50 rounded text-transparent select-none transition-all duration-300 min-w-[2em] text-center align-bottom">${sourceText}</span>`;
            }
            if(bottomText) bottomHtml = `<div class="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800 w-full"><p class="text-sm font-black text-slate-400 dark:text-neutral-500">${bottomText}</p></div>`;
        }

        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.text) this.dom.text.innerHTML = maskedSentence;
        if(this.dom.bottomDisp) this.dom.bottomDisp.innerHTML = bottomHtml;
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);
        
        if(this.dom.sBox) {
            this.highlightQBox(this.dom.sBox, false);
            this.dom.sBox.classList.remove('bg-emerald-500', 'border-emerald-500', 'bg-rose-500', 'border-rose-500');
        }

        const distractors = this.getDistractors(c.id, 4);
        this.dom.btns.forEach((btn, idx) => {
             const o = distractors[idx];
             if(o) {
                 const span = btn.querySelector('span');
                 span.innerText = o[aKey];
                 const wrap = btn.parentElement;
                 wrap.className = "w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-violet-200 dark:hover:border-violet-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix";
                 btn.className = "absolute inset-0 w-full h-full fit-box z-10";
                 span.className = "fit-target font-black text-slate-600 dark:text-neutral-400"; // FORCE BOLD
                 
                 btn.onclick = () => app.game.handleInput(wrap, o[aKey].replace(/'/g,"\\'"), aKey, () => app.game.check(btn, o.id===c.id));
             }
        });

        this.afterRender();
        this.runCustomAutoPlay(c);
    }

    runCustomAutoPlay(c) {
        if(!app.store.prefs.sentencesAuto) return;
        const qKey = app.store.prefs.sentencesQ || 'ja';
        let audioLang = (LANG_CONFIG.find(l=>l.key===qKey)||{}).audioSrc || qKey;
        app.audio.play(this.maskedAudioText, audioLang, 'sentences', 0);
    }

    async check(btn, isCorrect) {
        if(this.busy || this.answered) return;
        const btnWrap = btn.parentElement;
        
        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        btnWrap.className = btnWrap.className.replace(/\b(bg-white|dark:bg-neutral-900|hover:border-violet-200|dark:hover:border-violet-500\/50)\b/g, '');
        
        const span = btn.querySelector('span');
        span.classList.replace('text-slate-600', 'text-white');
        span.classList.replace('dark:text-neutral-400', 'text-white');
        
        this.highlightQBox(this.dom.sBox, isCorrect);
        
        if(isCorrect) {
            this.answered = true; this.busy = true; this.score(20);
            btnWrap.classList.add('bg-emerald-500', 'border-emerald-500');
            app.celebration.play();
            
            // REVEAL ALL BLANKS (Main & Bottom)
            const reveal = (el, colorClass) => {
                if(el) {
                    el.classList.remove('text-transparent', 'bg-violet-100', 'dark:bg-violet-900/50', 'border-b-2', 'border-violet-400');
                    el.classList.add(colorClass); 
                    if(el.classList.contains('main-blank')) el.classList.add('bg-emerald-500', 'px-2', 'rounded');
                    else el.classList.add('text-indigo-500', 'dark:text-indigo-400');
                }
            };

            const mainBlanks = this.root.querySelectorAll('.main-blank');
            mainBlanks.forEach(el => reveal(el, 'text-white'));

            const transBlank = this.root.querySelector('#trans-blank');
            if(transBlank) reveal(transBlank, 'text-indigo-500');

            let pAudio = null;
            if(app.store.prefs.sentencesPlayCorrect) {
                const qKey = app.store.prefs.sentencesQ || 'ja';
                let exKey = (LANG_CONFIG.find(l=>l.key===qKey)||{}).exKey;
                const fullText = this.list[this.i][exKey];
                let audioLang = (LANG_CONFIG.find(l=>l.key===qKey)||{}).audioSrc || qKey;
                
                if(fullText) {
                    pAudio = app.audio.play(fullText, audioLang, 'sentences', 0);
                }
            }
            
            this.waitAndNav(pAudio, 2500);

        } else {
            btnWrap.classList.add('bg-rose-500', 'border-rose-500');
        }
    }
}
