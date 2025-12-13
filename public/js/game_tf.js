class TF extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
    }

    playSmartAudio(langKey) {
        if (!app.store.prefs.tfAuto) return;

        const item = this.list[this.i];
        const p = app.store.prefs;
        const frontKey = p.tfFront || 'ja'; 
        
        let isExampleVisible = false;
        const conf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l=>l.key===frontKey) : null;
        let exText = "";
        if (conf && conf.exKey) exText = item[conf.exKey];

        if (this.dom.front && exText && this.dom.front.innerText.includes(exText)) {
            isExampleVisible = true;
        }

        if (isExampleVisible) {
            app.audio.play(exText, frontKey, 'tf', 0);
        } else {
            let text = item[frontKey];
            let audioLang = frontKey;
            if(conf && conf.visualOnly && conf.audioSrc) {
                text = item[conf.audioSrc];
                audioLang = conf.audioSrc;
            }
            app.audio.play(text, audioLang, 'tf', 0);
        }
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[55%] landscape:h-full landscape:flex-1 flex flex-col">
                    <div id="tf-header"></div>
                    <div id="tf-c" class="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-sm border-4 border-transparent flex-1 flex flex-col items-center justify-center p-2 text-center transition-all duration-300 relative overflow-hidden mb-2 landscape:mb-2 gpu-fix">
                        <div id="tf-top-click" class="h-[45%] w-full fit-box cursor-pointer select-none flex-col">
                            <span id="tf-front" class="fit-target font-black text-slate-800 dark:text-neutral-200 transition-colors duration-300"></span>
                            <div id="tf-ex-container"></div>
                        </div>
                        <div class="h-[10%] w-full flex flex-col items-center justify-center shrink-0"><div class="w-12 h-1 bg-slate-100 dark:bg-neutral-800 rounded-full mb-1"></div><p id="tf-lbl" class="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Matches?</p></div>
                        <div class="h-[45%] w-full fit-box"><span id="tf-m" class="fit-target font-black text-slate-600 dark:text-neutral-400 transition-colors"></span></div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:pt-2">
                    <div id="tf-audio" class="mt-auto landscape:mt-0"></div>
                    <div class="grid grid-cols-2 gap-2 mb-2 mt-2 flex-1 min-h-[100px]">
                        <button onclick="app.game.check(this, false)" class="bg-rose-100 dark:bg-rose-900/20 hover:bg-rose-200 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-2xl font-black text-2xl border-b-4 border-rose-200 dark:border-rose-800 active:scale-95 active:border-b-0 transition-all h-full shadow-sm flex items-center justify-center">NO</button>
                        <button onclick="app.game.check(this, true)" class="bg-emerald-100 dark:bg-emerald-900/20 hover:bg-emerald-200 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl font-black text-2xl border-b-4 border-emerald-200 dark:border-emerald-800 active:scale-95 active:border-b-0 transition-all h-full shadow-sm flex items-center justify-center">YES</button>
                    </div>
                    <div id="tf-nav"></div>
                </div>
            </div>`;
            
        this.dom.header = this.root.querySelector('#tf-header');
        this.dom.card = this.root.querySelector('#tf-c');
        this.dom.topClick = this.root.querySelector('#tf-top-click');
        this.dom.front = this.root.querySelector('#tf-front');
        this.dom.exContainer = this.root.querySelector('#tf-ex-container');
        this.dom.lbl = this.root.querySelector('#tf-lbl');
        this.dom.matchText = this.root.querySelector('#tf-m');
        this.dom.audio = this.root.querySelector('#tf-audio');
        
        this.root.querySelector('#tf-nav').innerHTML = app.ui.nav();
    }

    update() {
        this.busy = false; 
        this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const frontKey = p.tfFront || 'ja'; 
        const backKey = p.tfBack || 'en';
        
        this.truth = Math.random() > 0.5;
        this.dispBack = this.truth ? c[backKey] : (() => { let w; do{w=app.data.rand()}while(w.id===c.id); return w[backKey]; })();
        
        let fSec="", fEx="", fExSrc="";
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l=>l.key===frontKey); if(conf) { fSec=c[conf.secondary]||""; fEx=c[conf.exKey]||""; }
            const bConf = LANG_CONFIG.find(l=>l.key===backKey); if(bConf) fExSrc=c[bConf.exKey]||"";
        }

        let exHtml = '';
        if (p.tfShowEx) {
            const exMain = c[p.tfExMain] || (LANG_CONFIG.find(l=>l.key===p.tfExMain)?.exKey ? c[LANG_CONFIG.find(l=>l.key===p.tfExMain).exKey] : '');
            const exSub = c[p.tfExSub] || (LANG_CONFIG.find(l=>l.key===p.tfExSub)?.exKey ? c[LANG_CONFIG.find(l=>l.key===p.tfExSub).exKey] : '');
            if(exMain||exSub) exHtml = `<div class="mt-2 pt-2 border-t border-slate-100 dark:border-neutral-800 w-full text-center">${exMain?`<p class="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1 leading-tight">${exMain}</p>`:''}${exSub?`<p class="text-[10px] text-slate-400 dark:text-neutral-500 leading-tight">${exSub}</p>`:''}</div>`;
        }

        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.front) { this.dom.front.innerText = c[frontKey]; this.dom.front.innerHTML = c[frontKey]; }
        if(this.dom.exContainer) this.dom.exContainer.innerHTML = exHtml;
        
        if(this.dom.topClick) this.dom.topClick.onclick = () => {
            app.game.toggle(this.dom.topClick, c[frontKey].replace(/'/g,"\\'"), fSec.replace(/'/g,"\\'"), fEx.replace(/'/g,"\\'"), fExSrc.replace(/'/g,"\\'"), c[frontKey].replace(/'/g,"\\'"));
            this.playSmartAudio(frontKey);
        };
        
        if(this.dom.lbl) this.dom.lbl.innerText = "Matches?";
        if(this.dom.matchText) {
            this.dom.matchText.innerText = this.dispBack;
            this.dom.matchText.className = "fit-target font-black text-slate-600 dark:text-neutral-400 transition-colors";
        }
        
        if(this.dom.card) {
            this.dom.card.classList.remove('bg-emerald-500', 'border-emerald-500', 'bg-rose-500', 'border-rose-500');
            this.dom.card.classList.add('bg-white', 'dark:bg-neutral-900', 'border-transparent');
        }
        
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);

        this.afterRender();
        this.playSmartAudio(frontKey);
    }
    
    check(btn, userChoice) {
        if(this.busy) return; this.answered = true;
        const mText = this.dom.matchText;
        if (!this.truth) { mText.innerText = this.list[this.i][app.store.prefs.tfBack || 'en']; app.fitter.fit(mText); }
        this.busy = true; const win = (userChoice === this.truth);
        
        this.highlightQBox(this.dom.card, win);
        
        if(this.dom.lbl) this.dom.lbl.innerText = ""; 
        
        mText.classList.remove('text-slate-600', 'dark:text-neutral-400');
        mText.classList.add(win ? 'text-emerald-100' : 'text-rose-100', 'font-black');
        if(win) { 
            this.score(10); app.celebration.play(); 
            this.waitAndNav(null, 2500);
        } else { 
            this.waitAndNav(null, 2500); 
        }
    }
}
