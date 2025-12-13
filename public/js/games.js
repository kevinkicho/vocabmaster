/* js/games.js */

class Flashcard extends GameMode {
    constructor(k) { super(k); this.render(); }
    
    triggerAction(action) {
        if (action === 'next') this.nav(1);
        else if (action === 'prev') this.nav(-1);
        else if (action === 'up' || action === 'down') {
            const card = this.root.querySelector('.perspective-\\[1000px\\]');
            if(card && card.firstElementChild) card.firstElementChild.classList.toggle('[transform:rotateY(180deg)]');
        }
    }

    render() {
        this.busy = false;
        const item = this.list[this.i];
        const p = app.store.prefs;
        const dur = p.flashSpeed || "700";
        
        const frontText = item[p.flashFront || 'ja'];
        const backs = [item[p.flashBack1], item[p.flashBack2], item[p.flashBack3], item[p.flashBack4]].filter(t => t && t.trim()); 

        let backHtml = backs.length <= 2 
            ? backs.map((txt, idx) => `<div class="flex-1 flex flex-col items-center justify-center p-4 ${idx===0 && backs.length>1 ? 'border-b landscape:border-b-0 landscape:border-r border-slate-600/50' : ''} overflow-hidden"><div class="flex-1 w-full fit-box"><span class="fit-target font-bold">${txt}</span></div></div>`).join('')
            : `<div class="grid grid-cols-1 landscape:grid-cols-2 grid-rows-4 landscape:grid-rows-2 w-full h-full">${backs.map(txt => `<div class="flex items-center justify-center p-2 overflow-hidden"><div class="w-full h-full fit-box"><span class="fit-target font-bold text-sm">${txt}</span></div></div>`).join('')}</div>`;
        
        if(backs.length <= 2) backHtml = `<div class="flex flex-col landscape:flex-row w-full h-full">${backHtml}</div>`;

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-1 landscape:flex-1 flex flex-col min-h-0 relative z-10">
                    ${app.ui.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div class="perspective-[1000px] w-full flex-1 min-h-0 cursor-pointer group select-none relative pb-2" onclick="if(!event.target.closest('button')) this.firstElementChild.classList.toggle('[transform:rotateY(180deg)]')">
                        <div class="[transform-style:preserve-3d] w-full h-full relative rounded-[2rem] shadow-soft transition-transform" style="transition-duration: ${dur}ms">
                            <div class="absolute inset-0 [backface-visibility:hidden] [transform:translateZ(1px)] bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 flex flex-col shadow-sm z-10 overflow-hidden gpu-fix">
                                <div class="flex-1 w-full h-full fit-box"><span class="fit-target font-black text-slate-800 dark:text-neutral-200 tracking-tight">${frontText}</span></div>
                                <div class="h-10 shrink-0 w-full text-center text-slate-300 dark:text-neutral-600 text-sm font-bold uppercase tracking-widest flex items-center justify-center">Tap to Flip</div>
                            </div>
                            <div class="absolute inset-0 [backface-visibility:hidden] bg-slate-800 dark:bg-black text-white rounded-[2rem] [transform:rotateY(180deg)_translateZ(1px)] flex flex-col border border-slate-700 dark:border-neutral-800 shadow-2xl z-10 overflow-hidden gpu-fix">${backHtml}</div>
                        </div>
                    </div>
                </div>
                <div class="shrink-0 landscape:w-1/2 flex flex-col justify-center landscape:justify-center landscape:pt-2">${app.ui.audioBar(item)}${app.ui.nav()}</div>
            </div>`;
        this.afterRender();
        this.autoPlay('flash');
    }
}

class Quiz extends GameMode {
    constructor(k) { super(k); this.render(); }
    render() {
        this.busy = false; this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.quizQ || 'ja'; const aKey = p.quizA || 'en';
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

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[30%] landscape:h-full landscape:flex-1 flex flex-col">
                    ${app.ui.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div id="q-box" class="bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm flex-1 flex flex-col relative mb-2 landscape:mb-2 overflow-hidden cursor-pointer select-none gpu-fix" onclick="app.game.toggle(this, '${qText.replace(/'/g,"\\'")}', '${qSec.replace(/'/g,"\\'")}', '${qEx.replace(/'/g,"\\'")}', '${qExSrc.replace(/'/g,"\\'")}', '${qText.replace(/'/g,"\\'")}')">
                         <div class="fit-box flex-col"><span class="fit-target font-black text-slate-800 dark:text-neutral-200 transition-colors duration-300">${qText}</span>${exHtml}</div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between landscape:pt-2 min-h-0">
                    <div class="mt-auto landscape:mt-0">${app.ui.audioBar(c)}</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 shrink-0 mb-1 mt-1 flex-1 min-h-0">
                        ${this.getDistractors(c.id, 4).map(p => `<div class="w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix"><button onclick="app.game.handleInput(this.parentElement, '${p[aKey].replace(/'/g,"\\'")}', '${aKey}', () => app.game.check(this, ${p.id===c.id}))" class="absolute inset-0 w-full h-full fit-box z-10"><span class="fit-target font-bold text-slate-600 dark:text-neutral-400">${p[aKey]}</span></button></div>`).join('')}
                    </div>
                    ${app.ui.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.autoPlay('quiz');
    }
    
    async check(btnWrap, isCorrect) {
        if(this.busy || this.answered) return;
        const btn = btnWrap.closest('div');
        const qBox = document.getElementById('q-box');
        
        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        btn.className = btn.className.replace(/\b(bg-white|dark:bg-neutral-900|hover:border-indigo-200|dark:hover:border-indigo-500\/50)\b/g, '');
        btn.querySelector('span').classList.replace('text-slate-600', 'text-white');
        btn.querySelector('span').classList.replace('dark:text-neutral-400', 'text-white');
        this.highlightQBox(qBox, isCorrect);
        
        if(isCorrect) {
            this.answered = true; this.busy = true; this.score(10);
            btn.classList.add('bg-emerald-500', 'border-emerald-500');
            app.celebration.play();
            
            let pAudio = null;
            if (app.store.prefs.quizPlayCorrect) {
                pAudio = this.playSmartAudio(app.store.prefs.quizQ || 'ja');
            }
            this.waitAndNav(pAudio, 2500); 
        } else {
            btn.classList.add('bg-rose-500', 'border-rose-500');
        }
    }
}

class TF extends GameMode {
    constructor(k) { super(k); this.render(); }
    render() {
        this.busy = false; this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const frontKey = p.tfFront || 'ja'; const backKey = p.tfBack || 'en';
        
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

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[55%] landscape:h-full landscape:flex-1 flex flex-col">
                    ${app.ui.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div id="tf-c" class="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-sm border-4 border-transparent flex-1 flex flex-col items-center justify-center p-2 text-center transition-all duration-300 relative overflow-hidden mb-2 landscape:mb-2 gpu-fix">
                        <div class="h-[45%] w-full fit-box cursor-pointer select-none flex-col" onclick="app.game.toggle(this, '${c[frontKey].replace(/'/g,"\\'")}', '${fSec.replace(/'/g,"\\'")}', '${fEx.replace(/'/g,"\\'")}', '${fExSrc.replace(/'/g,"\\'")}', '${c[frontKey].replace(/'/g,"\\'")}')">
                            <span class="fit-target font-black text-slate-800 dark:text-neutral-200 transition-colors duration-300">${c[frontKey]}</span>${exHtml}
                        </div>
                        <div class="h-[10%] w-full flex flex-col items-center justify-center shrink-0"><div class="w-12 h-1 bg-slate-100 dark:bg-neutral-800 rounded-full mb-1"></div><p id="tf-lbl" class="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Matches?</p></div>
                        <div class="h-[45%] w-full fit-box"><span id="tf-m" class="fit-target font-bold text-slate-600 dark:text-neutral-400 transition-colors">${this.dispBack}</span></div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:pt-2">
                    <div class="mt-auto landscape:mt-0">${app.ui.audioBar(c)}</div>
                    <div class="grid grid-cols-2 gap-2 mb-2 mt-2 flex-1 min-h-[100px]">
                        <button onclick="app.game.check(this, false)" class="bg-rose-100 dark:bg-rose-900/20 hover:bg-rose-200 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-2xl font-black text-2xl border-b-4 border-rose-200 dark:border-rose-800 active:scale-95 active:border-b-0 transition-all h-full shadow-sm flex items-center justify-center">NO</button>
                        <button onclick="app.game.check(this, true)" class="bg-emerald-100 dark:bg-emerald-900/20 hover:bg-emerald-200 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl font-black text-2xl border-b-4 border-emerald-200 dark:border-emerald-800 active:scale-95 active:border-b-0 transition-all h-full shadow-sm flex items-center justify-center">YES</button>
                    </div>
                    ${app.ui.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.autoPlay('tf');
    }
    
    check(btn, userChoice) {
        if(this.busy) return; this.answered = true;
        const mText = document.getElementById('tf-m');
        if (!this.truth) { mText.innerText = this.list[this.i][app.store.prefs.tfBack || 'en']; app.fitter.fit(mText); }
        this.busy = true; const win = (userChoice === this.truth);
        this.highlightQBox(document.getElementById('tf-c'), win);
        document.getElementById('tf-lbl').innerText = ""; 
        
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

class Match extends GameMode {
    constructor(k) { 
        super(k); 
        this.state = app.store.matchState || { cards: [], pairs: 0, matched: [] };
        if(this.state.cards.length === 0) { 
            const count = (window.innerHeight > 800) ? 8 : 6;
            this.startNewGame(count); 
        } else { this.handleResize(); }
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
        // console.log("Starting new matching game with", count);
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
    
    // Explicitly expose newGame for UI button
    newGame() { this.startNewGame(this.state.pairs); }

    render() {
        this.busy = false; const c = (this.configMap && this.configMap[this.state.pairs])?.cols || 3;
        this.root.innerHTML = `<div class="flex flex-col h-full w-full">${app.ui.header(null, this.list.length, app.score, {mode:'match', pairs:this.state.pairs, allowedPairs:this.allowedPairs, hasPrev:!!this.lastState})}<div class="grid gap-2 flex-1 w-full pb-2" style="grid-template-columns: repeat(${c}, minmax(0, 1fr));">${this.state.cards.map(c => {
            const isM = this.state.matched.includes(c.id); const isS = this.sel && this.sel.id===c.id;
            return `<div id="${c.id}" onclick="app.game.tap('${c.id}','${c.match}','${c.type}')" class="${isM?'invisible pointer-events-none':''} border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none active:scale-95 gpu-fix overflow-hidden ${isS ? "bg-slate-700 border-slate-700 text-white ring-2 ring-indigo-400" : "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-indigo-400 shadow-sm"}"><div class="fit-box w-full h-full"><span class="fit-target font-bold">${c.txt}</span></div></div>`;
        }).join('')}</div></div>`;
        this.afterRender();
    }
    
    tap(id, match, type) {
        if(this.busy) return;
        const el = document.getElementById(id);
        if(this.sel && this.sel.id === id) { this.sel = null; this.render(); return; }
        if(app.store.prefs[`matchAudio_${type}`] !== false) {
            const { text, key } = this.resolveAudioText(this.list.find(x=>x.id==match), type);
            app.audio.play(text, key, 'match', 0);
        }
        
        if(!this.sel) { this.sel = { id, match }; this.render(); }
        else {
            this.busy = true; const prev = document.getElementById(this.sel.id);
            const success = String(this.sel.match) === String(match);
            
            el.className = prev.className = `rounded-xl w-full h-full flex flex-col items-center justify-center text-center border-2 text-white transition-all scale-105 z-10 ${success ? 'bg-emerald-500 border-emerald-500' : 'bg-rose-500 border-rose-500'}`;
            
            if(success) {
                this.score(10); app.celebration.play();
                this.setTimeout(() => {
                    this.state.matched.push(id, this.sel.id); app.store.saveMatch(this.state);
                    this.sel = null; this.busy = false;
                    if(this.state.matched.length === this.state.cards.length) setTimeout(() => this.startNewGame(this.state.pairs), 300);
                    else this.render();
                }, 250);
            } else {
                if(app.store.prefs.matchHint) {
                    const m = this.state.cards.find(c => String(c.match) === String(this.sel.match) && c.id !== this.sel.id)?.id;
                    if(m) { const h = document.getElementById(m); if(h) h.classList.add('bg-yellow-100', 'dark:bg-yellow-900', 'border-yellow-400'); }
                }
                this.setTimeout(() => { this.sel = null; this.busy = false; this.render(); }, 500);
            }
        }
    }
}

class Voice extends GameMode {
    constructor(k) { super('voice'); this.render(); }
    render() {
        this.busy = false; const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(!Speech) return (this.root.innerHTML = `<div class="p-10 text-center font-bold text-slate-400 flex items-center justify-center h-full"><div>Voice Not Supported</div><button onclick="app.goHome()" class="mt-4 px-4 py-2 bg-indigo-100 text-indigo-600 rounded-lg">Back</button></div>`);
        
        const c = this.list[this.i]; const p = app.store.prefs;
        const front = c[p.voiceDispFront||'en']; const back = c[p.voiceDispBack||'ja'];
        
        let fSec="", fEx="", fExSrc="";
        const dispFrontKey = p.voiceDispFront||'en';
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === dispFrontKey);
            if(conf) {
                if(conf.secondary) fSec = c[conf.secondary] || "";
                if(conf.exKey) fEx = c[conf.exKey] || "";
            }
            const bConf = LANG_CONFIG.find(l => l.key === (p.voiceDispBack||'ja'));
            if(bConf && bConf.exKey) fExSrc = c[bConf.exKey] || "";
        }

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col">
                    ${app.ui.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div id="v-c" class="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-neutral-800 flex-1 mb-2 landscape:mb-2 flex flex-col items-center justify-center p-2 text-center relative overflow-hidden group hover:border-sky-200 transition-colors gpu-fix">
                        <div class="absolute top-0 left-0 w-full h-1 bg-sky-400"></div>
                        <div class="flex-1 w-full fit-box cursor-pointer select-none" onclick="app.game.toggle(this, '${front.replace(/'/g,"\\'")}', '', '${fEx.replace(/'/g,"\\'")}', '', '${front.replace(/'/g,"\\'")}')">
                            <span class="fit-target font-black text-slate-800 dark:text-neutral-200">${front}</span>
                        </div>
                        <div id="v-res" class="absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-400 transition-all opacity-0 scale-90">Listening...</div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:pt-2">
                    <div class="mt-auto landscape:mt-0">${app.ui.audioBar(c)}</div>
                    <div class="flex justify-center h-32 items-center relative mb-4 shrink-0 mt-2">
                        <div id="mic-ring" class="absolute w-24 h-24 rounded-full bg-sky-500 opacity-0"></div>
                        <button onclick="app.game.handleInput(this, null, null, () => app.game.listen())" class="w-24 h-24 bg-white dark:bg-neutral-800 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all border-4 border-white dark:border-neutral-700 ring-4 ring-sky-100 dark:ring-sky-900/30 z-10 hover:shadow-2xl hover:scale-105"><i class="ph-bold ph-microphone text-4xl text-sky-500"></i></button>
                    </div>
                    ${app.ui.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.autoPlay('voice');
    }
    listen() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new Speech();
        const targetKey = app.store.prefs.voiceAudioTarget || 'ja';
        const langConf = LANG_CONFIG.find(l=>l.key===targetKey);
        rec.lang = langConf ? langConf.tts : 'ja-JP'; rec.maxAlternatives = 1;
        
        const ring = document.getElementById('mic-ring'); const res = document.getElementById('v-res');
        ring.classList.add('animate-pulse-ring', 'opacity-100');
        res.innerText = "Listening..."; res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-800 dark:bg-neutral-600 text-white shadow-lg opacity-100 scale-100";
        
        rec.onresult = (e) => {
            ring.classList.remove('animate-pulse-ring', 'opacity-100');
            const txt = e.results[0][0].transcript.toLowerCase().replace(/\s|[,.!?]/g, '');
            const { text } = this.resolveAudioText(this.list[this.i], targetKey);
            
            if(txt.includes(text.toLowerCase().replace(/\s/g, ''))) {
                this.score(30); res.innerHTML = `<i class="ph-bold ph-check"></i> "${txt}"`;
                res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-emerald-500 text-white shadow-lg transform scale-110";
                document.getElementById('v-c').classList.add('border-emerald-400', 'ring-2', 'ring-emerald-100');
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
                document.getElementById('v-c').classList.add('border-rose-400');
            }
        };
        rec.onerror = () => { ring.classList.remove('animate-pulse-ring'); res.innerText = "Error"; };
        rec.start();
    }
}

class Sentences extends GameMode {
    constructor(k) { super(k); this.render(); }
    render() {
        this.busy = false; this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.sentencesQ || 'ja'; const aKey = p.sentencesA || 'ja'; const transKey = p.sentencesTrans || 'en';
        
        // Helper
        const createMask = (word, id) => `<span id="${id}" class="inline-block px-1 mx-1 border-b-2 border-violet-400 bg-violet-100 dark:bg-violet-900/50 rounded text-transparent select-none transition-all duration-300 min-w-[2em] text-center align-bottom">${word}</span>`;

        // 1. Question (Top)
        let exKey = '';
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === qKey);
            if(conf && conf.exKey) exKey = conf.exKey;
        }
        const sentenceRaw = c[exKey] || "No example available.";
        const targetWord = c[qKey] || "";
        let maskedSentence = sentenceRaw;
        
        const separators = /[·・,;、\/|]/g;
        const variants = targetWord.split(separators).map(s => s.trim()).filter(s => s);
        variants.sort((a, b) => b.length - a.length);
        
        let match = variants.find(v => sentenceRaw.toLowerCase().includes(v.toLowerCase()));
        
        // NEW: Fuzzy Matching for Japanese Conjugations
        const isJa = (qKey === 'ja' || qKey.startsWith('ja_'));
        if (!match && isJa && typeof sentenceRaw === 'string') {
            for (const v of variants) {
                if (v.length > 1 && /[ぁ-ん]$/.test(v)) { 
                    const stem = v.slice(0, -1); 
                    const safeStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const fuzzyReg = new RegExp(safeStem + '[\\u3040-\\u309F]?', 'i');
                    const found = sentenceRaw.match(fuzzyReg);
                    if (found) {
                        match = found[0]; 
                        break;
                    }
                }
            }
        }

        if (match) {
            const reg = new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            maskedSentence = sentenceRaw.replace(reg, createMask(match, 'main-blank'));
        }

        // 2. Translation (Bottom)
        let bottomHtml = '';
        const dispMode = p.sentencesBottomDisp || 'sentence'; 

        if (dispMode !== 'none') {
            let bottomText = '';
            
            if (dispMode === 'sentence') {
                let tExKey = transKey;
                const transConf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l => l.key === transKey) : null;
                if (transConf && transConf.exKey) tExKey = transConf.exKey;
                
                const transSent = c[tExKey]; 
                const transWord = c[transKey]; 
                
                if (transSent && transWord) {
                    const tv = transWord.split(separators).map(s => s.trim()).filter(s => s);
                    tv.sort((a,b) => b.length - a.length);
                    const tm = tv.find(v => transSent.toLowerCase().includes(v.toLowerCase()));
                    
                    if (tm) {
                        const tReg = new RegExp(tm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                        bottomText = transSent.replace(tReg, createMask(tm, 'trans-blank'));
                    } else {
                        bottomText = transSent;
                    }
                } else {
                    bottomText = transSent || transWord || "";
                }
            } else {
                const w = c[transKey];
                if (w) bottomText = createMask(w, 'trans-blank');
            }
            
            if(bottomText) {
                bottomHtml = `<div class="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800 w-full"><p class="text-sm font-bold text-slate-400 dark:text-neutral-500">${bottomText}</p></div>`;
            }
        }

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col">
                    ${app.ui.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div id="s-box" class="bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm flex-1 flex flex-col items-center justify-center p-6 text-center relative mb-2 landscape:mb-2 overflow-hidden">
                         <div class="flex-1 w-full flex items-center justify-center overflow-y-auto thin-scroll">
                            <p class="text-xl sm:text-2xl font-black text-slate-800 dark:text-neutral-100 leading-relaxed">${maskedSentence}</p>
                         </div>
                         ${bottomHtml}
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between landscape:pt-2 min-h-0">
                    <div class="mt-auto landscape:mt-0">${app.ui.audioBar(c)}</div>
                    <div class="grid grid-cols-2 gap-2 sm:gap-3 shrink-0 mb-1 mt-1 flex-1 min-h-0">
                        ${this.getDistractors(c.id, 4).map(o => `<div class="w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-violet-200 dark:hover:border-violet-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix"><button onclick="app.game.handleInput(this.parentElement, '${o[aKey].replace(/'/g,"\\'")}', '${aKey}', () => app.game.check(this, ${o.id===c.id}))" class="absolute inset-0 w-full h-full fit-box z-10"><span class="fit-target font-bold text-slate-600 dark:text-neutral-400">${o[aKey]}</span></button></div>`).join('')}
                    </div>
                    ${app.ui.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.runCustomAutoPlay(c);
    }

    runCustomAutoPlay(c) {
        if(!app.store.prefs.sentencesAuto) return;
        this.playSmartAudio(app.store.prefs.sentencesQ || 'ja');
    }

    async check(btnWrap, isCorrect) {
        if(this.busy || this.answered) return;
        const btn = btnWrap.closest('div');
        const sBox = document.getElementById('s-box');
        
        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        btn.className = btn.className.replace(/\b(bg-white|dark:bg-neutral-900|hover:border-violet-200|dark:hover:border-violet-500\/50)\b/g, '');
        btn.querySelector('span').classList.replace('text-slate-600', 'text-white');
        btn.querySelector('span').classList.replace('dark:text-neutral-400', 'text-white');
        this.highlightQBox(sBox, isCorrect);
        
        if(isCorrect) {
            this.answered = true; this.busy = true; this.score(20);
            btn.classList.add('bg-emerald-500', 'border-emerald-500');
            app.celebration.play();
            
            const reveal = (id, colorClass) => {
                const el = document.getElementById(id);
                if(el) {
                    el.classList.remove('text-transparent', 'bg-violet-100', 'dark:bg-violet-900/50', 'border-b-2', 'border-violet-400');
                    el.classList.add(colorClass); 
                    if(id === 'main-blank') el.classList.add('bg-emerald-500', 'px-2', 'rounded');
                    else el.classList.add('text-indigo-500', 'dark:text-indigo-400');
                }
            };

            reveal('main-blank', 'text-white');
            reveal('trans-blank', 'text-indigo-500');

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
            btn.classList.add('bg-rose-500', 'border-rose-500');
        }
    }
}
