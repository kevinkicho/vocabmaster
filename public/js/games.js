/* js/games.js */

/* --- FLASHCARD MODE --- */
class Flashcard extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
    }
    
    triggerAction(action) {
        if (action === 'next') this.nav(1);
        else if (action === 'prev') this.nav(-1);
        else if (action === 'up' || action === 'down') {
            if(this.dom.card) this.dom.card.classList.toggle('[transform:rotateY(180deg)]');
        }
    }

    setup() {
        const p = app.store.prefs;
        const dur = p.flashSpeed || "700";
        
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-1 landscape:flex-1 flex flex-col min-h-0 relative z-10">
                    <div id="fc-header"></div>
                    <div class="perspective-[1000px] w-full flex-1 min-h-0 cursor-pointer group select-none relative pb-2" onclick="if(!event.target.closest('button')) this.firstElementChild.classList.toggle('[transform:rotateY(180deg)]')">
                        <div id="fc-card" class="[transform-style:preserve-3d] w-full h-full relative rounded-[2rem] shadow-soft transition-transform" style="transition-duration: ${dur}ms">
                            <div class="absolute inset-0 [backface-visibility:hidden] [transform:translateZ(1px)] bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 flex flex-col shadow-sm z-10 overflow-hidden gpu-fix">
                                <div class="flex-1 w-full h-full fit-box"><span id="fc-front" class="fit-target font-black text-slate-800 dark:text-neutral-200 tracking-tight"></span></div>
                                <div class="h-10 shrink-0 w-full text-center text-slate-300 dark:text-neutral-600 text-sm font-bold uppercase tracking-widest flex items-center justify-center">Tap to Flip</div>
                            </div>
                            <div id="fc-back-container" class="absolute inset-0 [backface-visibility:hidden] bg-slate-800 dark:bg-black text-white rounded-[2rem] [transform:rotateY(180deg)_translateZ(1px)] flex flex-col border border-slate-700 dark:border-neutral-800 shadow-2xl z-10 overflow-hidden gpu-fix">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="shrink-0 landscape:w-1/2 flex flex-col justify-center landscape:justify-center landscape:pt-2">
                    <div id="fc-audio"></div>
                    <div id="fc-nav"></div>
                </div>
            </div>`;
        
        this.dom.header = this.root.querySelector('#fc-header');
        this.dom.card = this.root.querySelector('#fc-card');
        this.dom.front = this.root.querySelector('#fc-front');
        this.dom.backContainer = this.root.querySelector('#fc-back-container');
        this.dom.audio = this.root.querySelector('#fc-audio');
        this.dom.nav = this.root.querySelector('#fc-nav');
        
        this.dom.nav.innerHTML = app.ui.nav();
    }

    update() {
        this.busy = false;
        const item = this.list[this.i];
        const p = app.store.prefs;
        
        if(this.dom.card) this.dom.card.classList.remove('[transform:rotateY(180deg)]');
        
        const frontText = item[p.flashFront || 'ja'];
        const backs = [item[p.flashBack1], item[p.flashBack2], item[p.flashBack3], item[p.flashBack4]].filter(t => t && t.trim()); 

        let backHtml = backs.length <= 2 
            ? backs.map((txt, idx) => `<div class="flex-1 flex flex-col items-center justify-center p-4 ${idx===0 && backs.length>1 ? 'border-b landscape:border-b-0 landscape:border-r border-slate-600/50' : ''} overflow-hidden"><div class="flex-1 w-full fit-box"><span class="fit-target font-bold">${txt}</span></div></div>`).join('')
            : `<div class="grid grid-cols-1 landscape:grid-cols-2 grid-rows-4 landscape:grid-rows-2 w-full h-full">${backs.map(txt => `<div class="flex items-center justify-center p-2 overflow-hidden"><div class="w-full h-full fit-box"><span class="fit-target font-bold text-sm">${txt}</span></div></div>`).join('')}</div>`;
        
        if(backs.length <= 2) backHtml = `<div class="flex flex-col landscape:flex-row w-full h-full">${backHtml}</div>`;

        if(this.dom.front) { this.dom.front.innerText = frontText; this.dom.front.innerHTML = frontText; }
        if(this.dom.backContainer) this.dom.backContainer.innerHTML = backHtml;
        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(item);

        this.afterRender();
        this.autoPlay('flash');
    }
}

/* --- QUIZ MODE --- */
class Quiz extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
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
                                    <span class="fit-target font-bold text-slate-600 dark:text-neutral-400"></span>
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
            if(exMain || exSub) exHtml = `<div class="mt-4 pt-2 border-t border-slate-100 dark:border-neutral-800 w-full text-center">${exMain?`<p class="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-1">${exMain}</p>`:''}${exSub?`<p class="text-xs text-slate-400 dark:text-neutral-500">${exSub}</p>`:''}</div>`;
        }
        
        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.qBox) {
            this.highlightQBox(this.dom.qBox, false); 
            this.dom.qBox.classList.remove('bg-emerald-500', 'bg-rose-500', 'border-emerald-500', 'border-rose-500');
            this.dom.qBox.onclick = () => app.game.toggle(this.dom.qBox, qText.replace(/'/g,"\\'"), qSec.replace(/'/g,"\\'"), qEx.replace(/'/g,"\\'"), qExSrc.replace(/'/g,"\\'"), qText.replace(/'/g,"\\'"));
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
                wrapper.classList.remove('bg-emerald-500', 'border-emerald-500', 'bg-rose-500', 'border-rose-500');
                btn.className = "absolute inset-0 w-full h-full fit-box z-10"; 
                span.className = "fit-target font-bold text-slate-600 dark:text-neutral-400";
                
                btn.onclick = () => app.game.handleInput(wrapper, txt.replace(/'/g,"\\'"), aKey, () => app.game.check(btn, pData.id===c.id));
            }
        });

        this.afterRender();
        this.autoPlay('quiz');
    }
    
    async check(btn, isCorrect) {
        if(this.busy || this.answered) return;
        const btnWrap = btn.parentElement;
        
        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        btnWrap.className = btnWrap.className.replace(/\b(bg-white|dark:bg-neutral-900|hover:border-indigo-200|dark:hover:border-indigo-500\/50)\b/g, '');
        
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

/* --- TRUE/FALSE MODE --- */
class TF extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
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
                        <div class="h-[45%] w-full fit-box"><span id="tf-m" class="fit-target font-bold text-slate-600 dark:text-neutral-400 transition-colors"></span></div>
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
        if(this.dom.topClick) this.dom.topClick.onclick = () => app.game.toggle(this.dom.topClick, c[frontKey].replace(/'/g,"\\'"), fSec.replace(/'/g,"\\'"), fEx.replace(/'/g,"\\'"), fExSrc.replace(/'/g,"\\'"), c[frontKey].replace(/'/g,"\\'"));
        if(this.dom.lbl) this.dom.lbl.innerText = "Matches?";
        if(this.dom.matchText) {
            this.dom.matchText.innerText = this.dispBack;
            this.dom.matchText.className = "fit-target font-bold text-slate-600 dark:text-neutral-400 transition-colors";
        }
        if(this.dom.card) {
            this.highlightQBox(this.dom.card, false); 
        }
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);

        this.afterRender();
        this.autoPlay('tf');
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

/* --- MATCH MODE (Grid) --- */
class Match extends GameMode {
    constructor(k) { 
        super(k); 
        this.state = app.store.matchState || { cards: [], pairs: 0, matched: [] };
        
        // Auto-restart if game was completed
        if (this.state.matched.length > 0 && this.state.matched.length === this.state.cards.length) {
             this.startNewGame(this.state.pairs);
        } else if(this.state.cards.length === 0) { 
            const count = (window.innerHeight > 800) ? 8 : 6;
            this.startNewGame(count); 
        } else { 
            this.handleResize(); 
        }
    }
    
    handleResize() {
        const layout = this.calcLayout();
        this.allowedPairs = layout.allowedPairs;
        this.configMap = layout.map;
        if(!this.allowedPairs.includes(this.state.pairs)) this.startNewGame(this.allowedPairs.reduce((prev, curr) => Math.abs(curr - this.state.pairs) < Math.abs(prev - this.state.pairs) ? curr : prev));
        else this.render();
    }
    
    calcLayout() {
        const el = document.getElementById('app-view'); if(!el) return { allowedPairs:[2,4,6], map:{} };
        const h = Math.max(el.clientHeight, window.innerHeight - 80) - 70; 
        const w = el.clientWidth - 16;
        const isPortrait = w < h;
        const validPairs = new Set(); const configMap = {};
        for(let c=2; c<=8; c++) {
            for(let r=2; r<=10; r++) {
                if( ((c*80) + (c-1)*6) <= w && ((r*60) + (r-1)*6) <= h ) {
                    const t = c*r;
                    if(t%2===0 && t>=4) { 
                        const p = t/2; validPairs.add(p); 
                        const availCellW = (w - (c-1)*6) / c;
                        let score = availCellW;
                        if (isPortrait && c === 2) score += 200; 
                        if (isPortrait && c > 3) score -= 100;
                        if(!configMap[p] || score > configMap[p].score) { configMap[p] = { cols: c, rows: r, score: score }; }
                    }
                }
            }
        }
        return { allowedPairs: Array.from(validPairs).sort((a,b)=>a-b), map: configMap };
    }
    
    startNewGame(count) {
        if(this.state.cards.length>0) this.lastState = {...this.state};
        const pool = []; const indices = new Set();
        while(indices.size < count) indices.add(Math.floor(Math.random() * this.list.length));
        indices.forEach(idx => pool.push(this.list[idx]));
        
        const typeOptions = LANG_CONFIG.filter(l => app.store.prefs[`matchShow${app.store.cap(l.key)}`]).map(l=>l.key);
        if(typeOptions.length < 2) typeOptions.push('ja','en');

        const cards = pool.flatMap(x => {
            const types = typeOptions.filter(t => x[t]).sort(()=>Math.random()-0.5).slice(0,2);
            return types.map(t => ({ id: `${t}-${x.id}`, txt: x[t], match: x.id, type: t }));
        }).sort(()=>Math.random()-0.5);

        this.state = { cards, pairs: cards.length/2, matched: [] };
        app.store.saveMatch(this.state); this.sel = null;
        this.handleResize();
    }
    
    restorePrev() { if(this.lastState) { this.state = this.lastState; app.store.saveMatch(this.state); this.sel=null; this.render(); } }
    setPairs(v) { this.startNewGame(v); }
    shuffleGrid() { this.state.cards.sort(()=>Math.random()-0.5); app.store.saveMatch(this.state); this.render(); }
    newGame() { this.startNewGame(this.state.pairs); }

    render() {
        this.busy = false; const c = (this.configMap && this.configMap[this.state.pairs])?.cols || 3;
        
        const baseClass = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none active:scale-95 gpu-fix overflow-hidden";
        const defaultClass = "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-indigo-400 shadow-sm";
        const selectedClass = "bg-slate-700 border-slate-700 text-white ring-2 ring-indigo-400";
        const matchedClass = "invisible pointer-events-none";

        this.root.innerHTML = `
        <div class="flex flex-col h-full w-full">
            ${app.ui.header(null, this.list.length, app.score, {mode:'match', pairs:this.state.pairs, allowedPairs:this.allowedPairs, hasPrev:!!this.lastState})}
            <div class="grid gap-2 flex-1 w-full pb-2" style="grid-template-columns: repeat(${c}, minmax(0, 1fr));">
                ${this.state.cards.map(c => {
                    const isM = this.state.matched.includes(c.id); 
                    const isS = this.sel && this.sel.id === c.id;
                    const className = `${baseClass} ${isM ? matchedClass : (isS ? selectedClass : defaultClass)}`;
                    return `<div id="${c.id}" onclick="app.game.tap('${c.id}','${c.match}','${c.type}')" class="${className}"><div class="fit-box w-full h-full"><span class="fit-target font-bold">${c.txt}</span></div></div>`;
                }).join('')}
            </div>
        </div>`;
        this.afterRender();
    }
    
    tap(id, match, type) {
        if(this.busy || this.state.matched.includes(id)) return;
        const el = document.getElementById(id);
        if(!el) return;

        // FIXED: Strict boolean check
        const prefKey = `matchAudio_${type}`;
        const canPlay = app.store.prefs[prefKey] !== false;
        
        if(canPlay) {
            const item = this.list.find(x => String(x.id) === String(match));
            if(item) {
                const { text, key } = this.resolveAudioText(item, type);
                app.audio.play(text, key, 'match', 0);
            }
        }

        const resetStyle = (element) => {
            element.className = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none active:scale-95 gpu-fix overflow-hidden bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-indigo-400 shadow-sm";
        };
        const setSelectStyle = (element) => {
            element.className = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none active:scale-95 gpu-fix overflow-hidden bg-slate-700 border-slate-700 text-white ring-2 ring-indigo-400";
        };
        const setSuccessStyle = (element) => {
             element.className = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center transition-all scale-105 z-10 bg-emerald-500 border-emerald-500 text-white";
        };
        const setFailStyle = (element) => {
             element.className = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center transition-all bg-rose-500 border-rose-500 text-white";
        };

        if(this.sel && this.sel.id === id) { 
            this.sel = null; 
            resetStyle(el);
            return; 
        }

        if(!this.sel) { 
            this.sel = { id, match }; 
            setSelectStyle(el);
        } 
        else {
            this.busy = true; 
            const prevEl = document.getElementById(this.sel.id);
            const success = String(this.sel.match) === String(match);
            
            if(success) {
                setSuccessStyle(el);
                setSuccessStyle(prevEl);
                this.score(10); app.celebration.play();
                
                this.setTimeout(() => {
                    this.state.matched.push(id, this.sel.id); 
                    app.store.saveMatch(this.state);
                    el.classList.add('invisible', 'pointer-events-none');
                    prevEl.classList.add('invisible', 'pointer-events-none');
                    this.sel = null; this.busy = false;
                    if(this.state.matched.length === this.state.cards.length) {
                        this.setTimeout(() => this.startNewGame(this.state.pairs), 300);
                    }
                }, 250);
            } else {
                setFailStyle(el);
                setFailStyle(prevEl);
                if(app.store.prefs.matchHint) {
                    const m = this.state.cards.find(c => String(c.match) === String(this.sel.match) && c.id !== this.sel.id)?.id;
                    const h = document.getElementById(m); 
                    if(h) h.classList.add('bg-yellow-100', 'dark:bg-yellow-900', 'border-yellow-400');
                }
                this.setTimeout(() => { 
                    resetStyle(el);
                    resetStyle(prevEl);
                    const allCards = document.querySelectorAll('#app-view > div > div > div');
                    allCards.forEach(c => c.classList.remove('bg-yellow-100', 'dark:bg-yellow-900', 'border-yellow-400'));
                    this.sel = null; this.busy = false; 
                }, 500);
            }
        }
    }
}

/* --- VOICE MODE --- */
class Voice extends GameMode {
    constructor(k) { 
        super('voice'); 
        this.setup(); 
        this.update(); 
    }

    setup() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(!Speech) {
            this.root.innerHTML = `<div class="p-10 text-center font-bold text-slate-400 flex items-center justify-center h-full"><div>Voice Not Supported</div><button onclick="app.goHome()" class="mt-4 px-4 py-2 bg-indigo-100 text-indigo-600 rounded-lg">Back</button></div>`;
            return;
        }

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col">
                    <div id="v-header"></div>
                    <div id="v-c" class="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-neutral-800 flex-1 mb-2 landscape:mb-2 flex flex-col items-center justify-center p-2 text-center relative overflow-hidden group hover:border-sky-200 transition-colors gpu-fix">
                        <div class="absolute top-0 left-0 w-full h-1 bg-sky-400"></div>
                        <div id="v-card-click" class="flex-1 w-full fit-box cursor-pointer select-none">
                            <span id="v-front" class="fit-target font-black text-slate-800 dark:text-neutral-200"></span>
                        </div>
                        <div id="v-res" class="absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-400 transition-all opacity-0 scale-90">Listening...</div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:pt-2">
                    <div id="v-audio" class="mt-auto landscape:mt-0"></div>
                    <div class="flex justify-center h-32 items-center relative mb-4 shrink-0 mt-2">
                        <div id="mic-ring" class="absolute w-24 h-24 rounded-full bg-sky-500 opacity-0"></div>
                        <button id="v-mic-btn" class="w-24 h-24 bg-white dark:bg-neutral-800 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all border-4 border-white dark:border-neutral-700 ring-4 ring-sky-100 dark:ring-sky-900/30 z-10 hover:shadow-2xl hover:scale-105">
                            <i class="ph-bold ph-microphone text-4xl text-sky-500"></i>
                        </button>
                    </div>
                    <div id="v-nav"></div>
                </div>
            </div>`;

        this.dom.header = this.root.querySelector('#v-header');
        this.dom.card = this.root.querySelector('#v-c');
        this.dom.front = this.root.querySelector('#v-front');
        this.dom.cardClick = this.root.querySelector('#v-card-click');
        this.dom.res = this.root.querySelector('#v-res');
        this.dom.ring = this.root.querySelector('#mic-ring');
        this.dom.micBtn = this.root.querySelector('#v-mic-btn');
        this.dom.audio = this.root.querySelector('#v-audio');
        
        this.root.querySelector('#v-nav').innerHTML = app.ui.nav();
    }

    update() {
        if(!this.dom.header) return; 

        this.busy = false; 
        const c = this.list[this.i]; 
        const p = app.store.prefs;
        const front = c[p.voiceDispFront||'en']; 
        
        let fSec="", fEx="", fExSrc="";
        const dispFrontKey = p.voiceDispFront||'en';
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === dispFrontKey);
            if(conf) {
                if(conf.secondary) fSec = c[conf.secondary] || "";
                if(conf.exKey) fEx = c[conf.exKey] || "";
            }
        }
        
        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.front) { this.dom.front.innerText = front; this.dom.front.innerHTML = front; }
        if(this.dom.cardClick) this.dom.cardClick.onclick = () => app.game.toggle(this.dom.cardClick, front.replace(/'/g,"\\'"), '', fEx.replace(/'/g,"\\'"), '', front.replace(/'/g,"\\'"));
        if(this.dom.res) {
             this.dom.res.innerText = "Listening..."; 
             this.dom.res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-400 transition-all opacity-0 scale-90";
        }
        if(this.dom.card) {
            this.dom.card.classList.remove('border-emerald-400', 'ring-2', 'ring-emerald-100', 'border-rose-400');
        }
        if(this.dom.micBtn) {
            this.dom.micBtn.onclick = () => app.game.handleInput(this.dom.micBtn, null, null, () => app.game.listen());
        }
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);

        this.afterRender();
        this.autoPlay('voice');
    }

    listen() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new Speech();
        const targetKey = app.store.prefs.voiceAudioTarget || 'ja';
        const langConf = LANG_CONFIG.find(l=>l.key===targetKey);
        rec.lang = langConf ? langConf.tts : 'ja-JP'; rec.maxAlternatives = 1;
        
        const ring = this.dom.ring; 
        const res = this.dom.res;
        
        ring.classList.add('animate-pulse-ring', 'opacity-100');
        res.innerText = "Listening..."; res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-800 dark:bg-neutral-600 text-white shadow-lg opacity-100 scale-100";
        
        rec.onresult = (e) => {
            ring.classList.remove('animate-pulse-ring', 'opacity-100');
            const txt = e.results[0][0].transcript.toLowerCase().replace(/\s|[,.!?]/g, '');
            const { text } = this.resolveAudioText(this.list[this.i], targetKey);
            
            if(txt.includes(text.toLowerCase().replace(/\s/g, ''))) {
                this.score(30); res.innerHTML = `<i class="ph-bold ph-check"></i> "${txt}"`;
                res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-emerald-500 text-white shadow-lg transform scale-110";
                this.dom.card.classList.add('border-emerald-400', 'ring-2', 'ring-emerald-100');
                app.celebration.play(); 
                
                let pAudio = null;
                if(app.store.prefs.voicePlayCorrect) {
                    pAudio = app.audio.play(text, targetKey, 'voice', 0);
                }
                this.busy = true; 
                this.waitAndNav(pAudio, 1500);

            } else {
                res.innerText = `Heard: "${txt}"`;
                res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-rose-500 text-white shadow-lg";
                this.dom.card.classList.add('border-rose-400');
            }
        };
        rec.onerror = () => { ring.classList.remove('animate-pulse-ring'); res.innerText = "Error"; };
        rec.start();
    }
}

/* --- SENTENCES MODE --- */
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
                                    <span class="fit-target font-bold text-slate-600 dark:text-neutral-400"></span>
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
        
        // Multi-blank creation
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
             // Split target phrase into words (e.g. "back of hand" -> ["back", "of", "hand"])
             const separators = /[·・,;、\/|\s]/g; // Added \s for spaces
             let tokens = targetWord.split(separators).map(s => s.trim()).filter(s => s);
             
             // Sort longest first to avoid partial matches inside longer words
             tokens.sort((a, b) => b.length - a.length);
             
             let tempSentence = sentenceRaw;
             let foundAny = false;

             tokens.forEach(token => {
                 if(token.length < 2 && !['a','I'].includes(token)) return; // Skip tiny noise unless common
                 const reg = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                 if(tempSentence.match(reg)) {
                     tempSentence = tempSentence.replace(reg, (match) => createMask(match));
                     foundAny = true;
                 }
             });

             if(foundAny) {
                 maskedSentence = tempSentence;
                 this.maskedAudioText = sentenceRaw; // Simpler to play full or pause, sticking to full for scattered
             } else {
                 // Fallback to strict substring if scattered failed (e.g. Asian languages without spaces)
                 if(sentenceRaw.includes(targetWord)) {
                     const reg = new RegExp(targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                     maskedSentence = sentenceRaw.replace(reg, createMask(targetWord));
                 }
             }
        }

        // Bottom Display
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
            if(bottomText) bottomHtml = `<div class="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800 w-full"><p class="text-sm font-bold text-slate-400 dark:text-neutral-500">${bottomText}</p></div>`;
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
                 span.className = "fit-target font-bold text-slate-600 dark:text-neutral-400";
                 
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
