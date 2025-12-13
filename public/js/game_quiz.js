class Quiz extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
    }

    playSmartAudio(langKey) {
        if (!app.store.prefs.quizAuto) return; 

        const item = this.list[this.i];
        const qKey = langKey || app.store.prefs.quizQ || 'ja'; 
        
        let isExampleVisible = false;
        
        const qConf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l=>l.key===qKey) : null;
        let exText = "";
        if (qConf && qConf.exKey) exText = item[qConf.exKey];

        if (this.dom.qText && exText && this.dom.qText.innerText.includes(exText)) {
            isExampleVisible = true;
        }

        if (isExampleVisible) {
            app.audio.play(exText, qKey, 'quiz', 0);
        } else {
            let text = item[qKey];
            let audioLang = qKey;
            if(qConf && qConf.visualOnly && qConf.audioSrc) {
                text = item[qConf.audioSrc];
                audioLang = qConf.audioSrc;
            }
            app.audio.play(text, audioLang, 'quiz', 0);
        }
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[30%] landscape:h-full landscape:flex-1 flex flex-col">
                    <div id="qz-header"></div>
                    <div id="q-box" class="bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm flex-1 flex flex-col relative mb-2 landscape:mb-2 overflow-hidden cursor-pointer select-none gpu-fix">
                         <div class="fit-box flex-col">
                            <span id="qz-q-text" class="fit-target font-black text-slate-800 dark:text-neutral-200 transition-colors duration-300"></span>
                            <div id="qz-ex-container" class="w-full text-center"></div>
                         </div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between landscape:pt-2 min-h-0">
                    <div id="qz-audio" class="mt-auto landscape:mt-0"></div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 shrink-0 mb-1 mt-1 flex-1 min-h-0">
                        ${[0,1,2,3].map(i => `
                            <div class="w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix">
                                <button id="qz-btn-${i}" class="absolute inset-0 w-full h-full fit-box z-10">
                                    <span class="fit-target font-black text-slate-600 dark:text-neutral-400"></span>
                                </button>
                            </div>`).join('')}
                    </div>
                    <div id="qz-nav"></div>
                </div>
            </div>`;
        
        this.dom.header = this.root.querySelector('#qz-header');
        this.dom.qBox = this.root.querySelector('#q-box');
        this.dom.qText = this.root.querySelector('#qz-q-text');
        this.dom.exContainer = this.root.querySelector('#qz-ex-container');
        this.dom.audio = this.root.querySelector('#qz-audio');
        this.dom.btns = [0,1,2,3].map(i => this.root.querySelector(`#qz-btn-${i}`));
        
        this.root.querySelector('#qz-nav').innerHTML = app.ui.nav();
    }

    update() {
        this.busy = false; 
        this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.quizQ || 'ja'; 
        const aKey = p.quizA || 'en';
        
        const qText = c[qKey];
        let qSec="", qEx="", qExSrc="";
        if(typeof LANG_CONFIG !== 'undefined') {
            const qConf = LANG_CONFIG.find(l=>l.key===qKey); if(qConf) { qSec=c[qConf.secondary]||""; qEx=c[qConf.exKey]||""; }
            const aConf = LANG_CONFIG.find(l=>l.key===aKey); if(aConf) qExSrc=c[aConf.exKey]||"";
        }

        let exHtml = '';
        if (p.quizShowEx) {
            const exMain = c[p.quizExMain] || (LANG_CONFIG.find(l=>l.key===p.quizExMain)?.exKey ? c[LANG_CONFIG.find(l=>l.key===p.quizExMain).exKey] : '');
            const exSub = c[p.quizExSub] || (LANG_CONFIG.find(l=>l.key===p.quizExSub)?.exKey ? c[LANG_CONFIG.find(l=>l.key===p.quizExSub).exKey] : '');
            if(exMain || exSub) exHtml = `<div class="mt-4 pt-2 border-t border-slate-100 dark:border-neutral-800 w-full text-center">${exMain?`<p class="text-sm font-black text-indigo-600 dark:text-indigo-400 mb-1">${exMain}</p>`:''}${exSub?`<p class="text-xs text-slate-400 dark:text-neutral-500">${exSub}</p>`:''}</div>`;
        }
        
        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.qBox) {
            this.highlightQBox(this.dom.qBox, false); 
            this.dom.qBox.classList.remove('bg-emerald-500', 'bg-rose-500', 'border-emerald-500', 'border-rose-500');
            
            this.dom.qBox.onclick = () => {
                app.game.toggle(this.dom.qBox, qText.replace(/'/g,"\\'"), qSec.replace(/'/g,"\\'"), qEx.replace(/'/g,"\\'"), qExSrc.replace(/'/g,"\\'"), qText.replace(/'/g,"\\'"));
                this.playSmartAudio(qKey);
            };
        }
        if(this.dom.qText) {
             this.dom.qText.innerText = qText; 
             this.dom.qText.innerHTML = qText; 
             this.dom.qText.classList.remove('text-white');
             this.dom.qText.classList.add('text-slate-800', 'dark:text-neutral-200');
             this.dom.qText.classList.add('font-black'); 
        }
        if(this.dom.exContainer) this.dom.exContainer.innerHTML = exHtml;
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);

        const pool = this.getDistractors(c.id, 4);
        this.dom.btns.forEach((btn, idx) => {
            const pData = pool[idx];
            if(pData) {
                const txt = pData[aKey];
                const span = btn.querySelector('span');
                span.innerText = txt;
                
                const wrapper = btn.parentElement;
                wrapper.className = "w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix";
                btn.className = "absolute inset-0 w-full h-full fit-box z-10"; 
                span.className = "fit-target font-black text-slate-600 dark:text-neutral-400"; 
                
                btn.onclick = () => {
                    const doPlay = app.store.prefs.quizPlayAnswer !== false; 
                    app.game.handleInput(wrapper, doPlay ? txt.replace(/'/g,"\\'") : null, doPlay ? aKey : null, () => app.game.check(btn, pData.id===c.id));
                }
            }
        });

        this.afterRender();
        this.playSmartAudio(qKey);
    }
    
    async check(btn, isCorrect) {
        if(this.busy || this.answered) return;
        const btnWrap = btn.parentElement;
        
        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        btnWrap.className = btnWrap.className.replace(/\b(hover:border-indigo-200|dark:hover:border-indigo-500\/50)\b/g, '');
        
        const span = btn.querySelector('span');
        span.classList.replace('text-slate-600', 'text-white');
        span.classList.replace('dark:text-neutral-400', 'text-white');
        
        this.highlightQBox(this.dom.qBox, isCorrect);
        
        if(isCorrect) {
            this.answered = true; this.busy = true; this.score(10);
            btnWrap.classList.add('bg-emerald-500', 'border-emerald-500');
            app.celebration.play();
            
            let pAudio = null;
            if (app.store.prefs.quizPlayCorrect) {
                pAudio = this.playSmartAudio(app.store.prefs.quizQ || 'ja');
            }
            this.waitAndNav(pAudio, 2500); 
        } else {
            btnWrap.classList.add('bg-rose-500', 'border-rose-500');
        }
    }
}
