/* js/game_quiz.js */
class Quiz extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
    }

    playSmartAudio(langKey) {
        const item = this.list[this.i];
        let targetKey = langKey || app.store.prefs.quizQ || 'ja'; 
        let textToPlay = "";
        
        const isFlipped = this.dom.qBox && this.dom.qBox.classList.contains('rotate-y-180');

        if (isFlipped) {
            if (langKey) {
                const btnConf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(langKey) || null : null;
                if (btnConf && btnConf.exKey && item[btnConf.exKey]) {
                    textToPlay = item[btnConf.exKey];
                    targetKey = langKey; 
                } else {
                    textToPlay = item[langKey];
                }
            } else {
                const mainExKey = app.store.prefs.quizExMain || 'ja';
                const exConf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(mainExKey) || null : null;
                if(exConf && exConf.exKey) {
                     textToPlay = item[exConf.exKey];
                     targetKey = mainExKey;
                } else {
                     textToPlay = item[mainExKey];
                     targetKey = mainExKey;
                }
            }
        } else {
            targetKey = langKey || app.store.prefs.quizQ || 'ja';
            const tConf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(targetKey) || null : null;
            if(tConf && tConf.visualOnly && tConf.audioSrc) {
                textToPlay = item[tConf.audioSrc];
                targetKey = tConf.audioSrc;
            } else {
                textToPlay = item[targetKey];
            }
        }

        if (textToPlay) {
            app.audio.play(textToPlay, targetKey, 'quiz', 0);
        }
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[30%] landscape:h-full landscape:flex-1 flex flex-col perspective-1000 mb-2 landscape:mb-0">
                    <div id="qz-header"></div>
                    <div id="q-box" class="preserve-3d relative flex-1 w-full transition-transform duration-500 cursor-pointer select-none">
                        <div id="qz-front" class="absolute inset-0 backface-hidden bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm flex flex-col items-center justify-center overflow-hidden gpu-fix z-10">
                            <div class="fit-box flex-col w-full h-full px-6 py-8">
                                <span id="qz-q-text" class="fit-target font-black text-slate-800 dark:text-neutral-200 transition-colors duration-300"></span>
                            </div>
                        </div>
                        <div id="qz-back" class="absolute inset-0 backface-hidden rotate-y-180 bg-slate-50 dark:bg-neutral-800 text-slate-800 dark:text-white rounded-[2rem] border border-slate-200 dark:border-neutral-700 shadow-xl flex flex-col items-center justify-center p-6 overflow-hidden gpu-fix z-10">
                             <div id="qz-ex-container" class="w-full h-full flex flex-col items-center justify-center"></div>
                        </div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between landscape:pt-2 min-h-0">
                    <div id="qz-audio" class="mt-auto landscape:mt-0"></div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 shrink-0 mb-1 mt-1 flex-1 min-h-0">
                        ${[0,1,2,3].map(i => `
                            <div class="w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix">
                                <button id="qz-btn-${i}" class="absolute inset-0 w-full h-full fit-box px-3 py-2 z-10">
                                    <span class="fit-target font-black text-slate-600 dark:text-neutral-400 whitespace-nowrap"></span>
                                </button>
                            </div>`).join('')}
                    </div>
                    <div id="qz-nav"></div>
                </div>
            </div>`;
        
        this.dom.header = this.root.querySelector('#qz-header');
        this.dom.qBox = this.root.querySelector('#q-box');
        this.dom.front = this.root.querySelector('#qz-front');
        this.dom.qText = this.root.querySelector('#qz-q-text');
        this.dom.exContainer = this.root.querySelector('#qz-ex-container');
        this.dom.audio = this.root.querySelector('#qz-audio');
        this.dom.btns = [0,1,2,3].map(i => this.root.querySelector(`#qz-btn-${i}`));
        
        this.root.querySelector('#qz-nav').innerHTML = app.ui.nav();
        this.setupHeader();
    }

    update() {
        this.busy = false; 
        this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.quizQ || 'ja'; 
        const aKey = p.quizA || 'en';
        
        const qText = c[qKey];
        
        const getEx = (key) => {
            if(!key) return "";
            const conf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(key) || null : null;
            if(conf && conf.exKey && c[conf.exKey]) return c[conf.exKey];
            return c[key] || "";
        };

        const exMainTxt = getEx(p.quizExMain);
        const exSubTxt = getEx(p.quizExSub);

        let exHtml = '<p class="text-sm text-slate-400">No examples.</p>';
        if(exMainTxt || exSubTxt) {
            exHtml = `
                <div class="flex-1 w-full flex items-center justify-center relative min-h-0">
                    ${exMainTxt ? `<p id="qz-ex-main" class="fit-smart font-black text-indigo-500 dark:text-indigo-400 leading-tight p-2 w-full text-center">${exMainTxt}</p>` : ''}
                </div>
                ${exMainTxt && exSubTxt ? `<div class="w-16 h-px bg-slate-300 dark:bg-neutral-600 my-2 shrink-0"></div>` : ''}
                ${exSubTxt ? `<div class="flex-none w-full text-center pb-2"><p class="text-sm sm:text-base font-bold text-slate-500 dark:text-slate-400">${exSubTxt}</p></div>` : ''}
            `;
        }

        this.updateHeader();
        
        if(this.dom.qBox) {
            this.dom.qBox.classList.remove('rotate-y-180');
            if(this.dom.front) {
                this.dom.front.classList.remove('bg-emerald-500', 'bg-rose-500', 'border-emerald-500', 'border-rose-500');
                this.dom.front.classList.add('bg-white', 'dark:bg-neutral-900', 'border-slate-100', 'dark:border-neutral-800');
            }
            this.dom.qBox.dataset.wid = c.id; 

            this.dom.qBox.onclick = () => {
                this.dom.qBox.classList.toggle('rotate-y-180');
                if(p.quizPlayEx) this.playSmartAudio(); 
            };
        }
        
        if(this.dom.qText) {
             this.dom.qText.innerText = qText; 
             this.dom.qText.innerHTML = qText; 
             this.dom.qText.classList.remove('text-white');
             this.dom.qText.classList.add('text-slate-800', 'dark:text-neutral-200');
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
                wrapper.dataset.wid = pData.id;

                btn.className = "absolute inset-0 w-full h-full fit-box px-3 py-2 z-10";
                span.className = "fit-target font-black text-slate-600 dark:text-neutral-400 whitespace-nowrap";
                
                btn.onclick = () => {
                    const doPlay = app.store.prefs.quizPlayAnswer !== false; 
                    app.game.handleInput(wrapper, doPlay ? txt.replace(/'/g,"\\'") : null, doPlay ? aKey : null, () => app.game.check(btn, pData.id===c.id));
                }
            }
        });

        this.afterRender();
        this.autoPlay('quiz');
    }
    
    async afterRender() {
        super.afterRender();
        const exEl = this.root.querySelector('#qz-ex-main');
        if(exEl && app.fitter) app.fitter.fitSmart(exEl);
    }
    
    async check(btn, isCorrect) {
        if(this.busy || this.answered) return;
        const btnWrap = btn.parentElement;
        
        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        btnWrap.className = btnWrap.className.replace(/\b(hover:border-indigo-200|dark:hover:border-indigo-500\/50)\b/g, '');
        
        const span = btn.querySelector('span');
        span.classList.replace('text-slate-600', 'text-white');
        span.classList.replace('dark:text-neutral-400', 'text-white');
        
        if(this.dom.front) {
            this.dom.front.classList.remove('bg-white', 'dark:bg-neutral-900', 'border-slate-100', 'dark:border-neutral-800');
            if(isCorrect) {
                this.dom.front.classList.add('bg-emerald-500', 'border-emerald-500');
                if(this.dom.qText) this.dom.qText.classList.replace('text-slate-800', 'text-white');
                if(this.dom.qText) this.dom.qText.classList.replace('dark:text-neutral-200', 'text-white');
            } else {
                this.dom.front.classList.add('bg-rose-500', 'border-rose-500');
            }
        }
        
        btnWrap.classList.remove('bg-white', 'dark:bg-neutral-900', 'border-slate-100', 'dark:border-neutral-800');
        if (isCorrect) {
            btnWrap.classList.add('bg-emerald-500', 'border-emerald-500');
        } else {
            btnWrap.classList.add('bg-rose-500', 'border-rose-500');
        }
        
        if(isCorrect) {
            this.answered = true; this.busy = true; this.score(10);
            app.celebration.play();
            
            let pAudio = null;
            if (app.store.prefs.quizPlayCorrect) {
                const qKey = app.store.prefs.quizQ || 'ja';
                pAudio = app.audio.play(this.list[this.i][qKey], qKey, 'quiz', 0);
            }
            this.waitAndNav(pAudio, 2500); 
        }
    }
}
