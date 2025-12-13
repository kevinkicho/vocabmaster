/* --- UI UTILS --- */
const UI = {
    header: (curr, total, score, opts = {}) => {
        const isMatch = opts.mode === 'match';
        let inputHtml;
        const btnClass = "w-9 h-9 bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-500 dark:text-neutral-400 hover:text-indigo-600 rounded-full flex items-center justify-center active:scale-90 transition-all border border-slate-200 dark:border-neutral-700 shadow-sm mr-2";
        
        if (isMatch) {
            const allowed = opts.allowedPairs || [2,4,6];
            const options = allowed.map(n => `<option value="${n}" ${n==opts.pairs?'selected':''}>${n}</option>`).join('');
            inputHtml = `
            <div class="flex items-center bg-white dark:bg-neutral-800 rounded-full px-4 py-2 shadow-sm border border-slate-200 dark:border-neutral-700 mr-auto relative">
                <span class="text-[10px] font-bold text-slate-400 mr-2 uppercase">Pairs</span>
                <div class="relative">
                    <select onchange="app.game.setPairs(this.value)" class="w-12 bg-transparent font-black text-indigo-600 dark:text-indigo-400 outline-none text-sm appearance-none pr-3 text-center z-10 relative cursor-pointer">${options}</select>
                    <i class="ph-bold ph-caret-down absolute right-0 top-1/2 -translate-y-1/2 text-xs text-indigo-400 pointer-events-none"></i>
                </div>
            </div>`;
        } else {
            inputHtml = (curr !== null) ? `
            <div class="flex items-center bg-white dark:bg-neutral-800 rounded-full px-4 py-2 shadow-sm border border-slate-200 dark:border-neutral-700 mr-auto">
                 <input type="number" value="${curr + 1}" min="1" max="${total}" onchange="app.game.jump(this.value)" onclick="this.select()" class="w-12 text-center font-black text-indigo-600 dark:text-indigo-400 bg-transparent outline-none p-0 text-sm appearance-none rounded" />
                 <span class="text-[10px] font-bold text-slate-400 ml-1">/ ${total}</span>
            </div>` : `<div class="flex-1"></div>`;
        }

        const standardControls = (!isMatch && opts.showDice) ? `<button onclick="app.game.rand()" class="${btnClass}"><i class="ph-bold ph-dice-five text-lg"></i></button>` : '';
        const matchControls = isMatch ? `
            <button onclick="app.game.restorePrev()" class="${btnClass} ${!opts.hasPrev?'opacity-50 cursor-not-allowed':''}"><i class="ph-bold ph-arrow-u-up-left text-lg"></i></button>
            <button onclick="app.game.shuffleGrid()" class="${btnClass}"><i class="ph-bold ph-arrows-clockwise text-lg"></i></button>
            <button onclick="app.game.newGame()" class="${btnClass}"><i class="ph-bold ph-dice-five text-lg"></i></button>` : '';

        return `
        <div class="flex justify-between items-center mb-2 shrink-0 w-full px-1 min-h-[50px]">
            ${inputHtml}
            <div class="flex items-center">
                ${standardControls}
                ${matchControls}
                <div class="flex items-center gap-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-full px-3 py-1.5 shadow-md text-[11px] font-bold border border-slate-700 mr-2">
                    <span class="text-slate-400">PTS</span><span class="score-display">${score}</span>
                </div>
                <button onclick="app.goHome()" class="w-9 h-9 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300"><i class="ph-bold ph-x"></i></button>
            </div>
        </div>`;
    },
    
    btnAudio: (txt, lang, icon) => `<button onclick="event.stopPropagation();app.game.playAudio('${txt}','${lang}')" class="w-12 h-12 rounded-full border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-indigo-400 hover:text-indigo-600 text-2xl flex items-center justify-center active:scale-95 transition-all text-slate-700 dark:text-neutral-300 select-none shadow-sm">${icon}</button>`,
    
    audioBar: (item) => {
        if (!app.store.prefs.showAudioBtns) return ''; 
        const buttons = LANG_CONFIG
            .filter(l => !l.visualOnly && item[l.key] && item[l.key] !== "" && app.store.prefs[`btnAudio_${l.key}`])
            .map(l => UI.btnAudio(item[l.key].replace(/'/g, "\\'"), l.key, l.icon))
            .join('');

        return `
        <div class="flex w-full items-center justify-center gap-4 shrink-0 mb-1 mt-1 landscape:mb-0 landscape:mt-0 flex-wrap">
            ${buttons}
        </div>`
    },

    nav: () => `
        <div class="grid grid-cols-2 gap-3 h-14 shrink-0 mt-auto w-full pt-1">
            <button onclick="app.game.nav(-1)" class="bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700 shadow-sm rounded-2xl text-2xl active:scale-95 transition-all"><i class="ph-bold ph-caret-left"></i></button>
            <button onclick="app.game.nav(1)" class="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-200 dark:shadow-none rounded-2xl text-2xl active:scale-95 transition-all"><i class="ph-bold ph-caret-right"></i></button>
        </div>`
};

/* --- BASE GAME CLASS --- */
class GameMode {
    constructor(key) {
        this.key = key;
        this.i = app.store.getLoc(key);
        this.list = app.data.list;
        this.root = document.getElementById('app-view');
        this.busy = false;
        this.answered = false;
        this.timeouts = []; 
        this.uiTimer = null; 
        
        this.onWindowResize = () => {
            if(this.resizeTimeout) clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                app.fitter.fitAll();
                if(typeof this.handleResize === 'function') this.handleResize();
            }, 100);
        };
        window.addEventListener('resize', this.onWindowResize);
    }
    
    setTimeout(fn, delay) {
        const id = window.setTimeout(fn, delay);
        this.timeouts.push(id);
        return id;
    }

    save() { app.store.setLoc(this.key, this.i); }
    
    nav(d) { 
        let rnd = false;
        const p = app.store.prefs;
        if (this.key === 'flash') rnd = p.flashRandom;
        else if (this.key === 'quiz') rnd = p.quizRandom;
        else if (this.key === 'tf') rnd = p.tfRandom;
        
        if (rnd) { this.rand(); } 
        else { this.i = (this.i + d + this.list.length) % this.list.length; this.save(); this.render(); } 
    }
    
    jump(val) { const n = parseInt(val); if(n>0 && n<=this.list.length) { this.i = n-1; this.save(); this.render(); } }
    rand() { this.i = Math.floor(Math.random() * this.list.length); this.save(); this.render(); }
    score(pts=10) { app.score += pts; const el = document.querySelector('.score-display'); if(el) el.innerText = app.score; }
    
    toggle(el, w, r, orig) {
        if(this.answered) return;
        const target = el.classList.contains('fit-target') ? el : el.querySelector('.fit-target');
        if(!target) return;
        const isR = target.innerText === r;
        target.innerText = isR ? orig : r;
        if (!isR) target.classList.add('text-indigo-600', 'dark:text-indigo-400');
        else target.classList.remove('text-indigo-600', 'dark:text-indigo-400');
        app.fitter.fit(target);
    }
    
    highlightQBox(el, isCorrect) {
         if(this.uiTimer) clearTimeout(this.uiTimer);
         const classes = ['bg-emerald-500', 'border-emerald-500', 'bg-rose-500', 'border-rose-500', 'bg-white', 'dark:bg-neutral-900', 'border-slate-100', 'dark:border-neutral-800'];
         el.classList.remove(...classes);
         el.classList.add(...(isCorrect ? ['bg-emerald-500', 'border-emerald-500'] : ['bg-rose-500', 'border-rose-500']));
         if(app.store.prefs.anim) el.classList.add(isCorrect ? 'anim-pulse-green' : 'anim-pulse-red');
         const txt = el.querySelector('.fit-target');
         if(txt) {
             txt.classList.remove('text-slate-800', 'dark:text-neutral-200', 'text-indigo-600', 'dark:text-indigo-400');
             txt.classList.add('text-white');
         }
    }

    getDistractors(correctId, count) {
        let pool = [this.list.find(x => x.id === correctId)];
        let safety = 0;
        while(pool.length < count && safety < 100) { 
            const r = app.data.rand(); 
            if(r.id !== correctId && !pool.find(x => x.id === r.id)) {
                pool.push(r); 
            }
            safety++;
        }
        return pool.sort(()=>Math.random()-0.5);
    }

    // HELPER: Resolves text for Audio (Visual Column -> Audio Column)
    resolveAudioText(item, langKey) {
        let text = item[langKey];
        let actualLangKey = langKey;
        
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === langKey);
            if(conf && conf.visualOnly && conf.audioSrc) {
                text = item[conf.audioSrc];
                actualLangKey = conf.audioSrc;
            }
        }
        return { text, key: actualLangKey };
    }

    playAudio(text, langKey) {
        app.audio.play(text, langKey, null, 0); 
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
        
        if(isOn && sourceKey) {
             const { text, key } = this.resolveAudioText(item, sourceKey);
             if(text) this.setTimeout(() => app.audio.play(text, key, context, 300), 0);
        }
    }
    
    destroy() {
        this.timeouts.forEach(id => clearTimeout(id));
        if(this.uiTimer) clearTimeout(this.uiTimer);
        this.timeouts = [];
        window.removeEventListener('resize', this.onWindowResize);
    }
    afterRender() { setTimeout(() => app.fitter.fitAll(), 10); }
}

/* --- GAME MODES --- */

class Flashcard extends GameMode {
    constructor(k) { super(k); this.render(); }
    render() {
        const item = this.list[this.i];
        const p = app.store.prefs;
        const dur = p.flashSpeed || "700";
        
        const frontType = p.flashFront || 'ja';
        const frontText = item[frontType];
        const backTopText = item[p.flashBackTop || 'ja_furi'];
        const backBtmText = item[p.flashBackBottom || 'en'];

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-1 landscape:flex-1 flex flex-col min-h-0 relative z-10">
                    ${UI.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div class="perspective-[1000px] w-full flex-1 min-h-0 cursor-pointer group select-none relative pb-2" onclick="if(!event.target.closest('button')) this.firstElementChild.classList.toggle('[transform:rotateY(180deg)]')">
                        <div class="[transform-style:preserve-3d] w-full h-full relative rounded-[2rem] shadow-soft transition-transform" style="transition-duration: ${dur}ms">
                            <div class="absolute inset-0 [backface-visibility:hidden] bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 flex flex-col shadow-sm z-10 overflow-hidden gpu-fix">
                                <div class="flex-1 w-full h-full fit-box"><span class="fit-target font-black text-slate-800 dark:text-neutral-200 tracking-tight">${frontText}</span></div>
                                <div class="h-10 shrink-0 w-full text-center text-slate-300 dark:text-neutral-600 text-sm font-bold uppercase tracking-widest flex items-center justify-center">Tap to Flip</div>
                            </div>
                            <div class="absolute inset-0 [backface-visibility:hidden] bg-slate-800 dark:bg-black text-white rounded-[2rem] [transform:rotateY(180deg)] flex flex-col border border-slate-700 dark:border-neutral-800 shadow-2xl z-10 overflow-hidden gpu-fix">
                                <div class="flex flex-col landscape:flex-row w-full h-full">
                                    <div class="flex-1 flex flex-col items-center justify-center p-4 border-b landscape:border-b-0 landscape:border-r border-slate-600/50 overflow-hidden">
                                        <div class="flex-1 w-full fit-box"><span class="fit-target font-bold">${backTopText}</span></div>
                                    </div>
                                    <div class="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
                                        <div class="flex-1 w-full fit-box"><span class="fit-target font-bold">${backBtmText}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="shrink-0 landscape:w-1/2 flex flex-col justify-center landscape:justify-center landscape:pt-2">
                    ${UI.audioBar(item)}
                    ${UI.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.autoPlay('flash');
    }
}

class Quiz extends GameMode {
    constructor(k) { super(k); this.render(); }
    render() {
        this.busy = false;
        this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.quizQ || 'ja'; 
        const aKey = p.quizA || 'en'; 
        const qText = c[qKey]; 
        const pool = this.getDistractors(c.id, 4);
        
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[30%] landscape:h-full landscape:flex-1 flex flex-col">
                    ${UI.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div id="q-box" class="bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm flex-1 flex flex-col relative mb-2 landscape:mb-2 overflow-hidden cursor-pointer select-none gpu-fix" onclick="app.game.toggle(this, '${c.ja}', '${c.ja_furi}', '${c.ja}')">
                         <div class="fit-box"><span class="fit-target font-black text-slate-800 dark:text-neutral-200 transition-colors duration-300">${qText}</span></div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between landscape:pt-2 min-h-0">
                    <div class="mt-auto landscape:mt-0">${UI.audioBar(c)}</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 shrink-0 mb-1 mt-1 flex-1 min-h-0">
                        ${pool.map(p => {
                            return `<div class="w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix">
                                <button onclick="app.game.check(this, ${p.id===c.id})" class="absolute inset-0 w-full h-full fit-box z-10"><span class="fit-target font-bold text-slate-600 dark:text-neutral-400">${p[aKey]}</span></button>
                            </div>`;
                        }).join('')}
                    </div>
                    ${UI.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.autoPlay('quiz');
    }
    check(btnWrap, isCorrect) {
        if(this.busy) return; 
        this.answered = true;
        const btn = btnWrap.closest('div');
        const qBox = document.getElementById('q-box');
        
        btn.className = btn.className.replace(/\b(bg-white|dark:bg-neutral-900|hover:border-indigo-200|dark:hover:border-indigo-500\/50)\b/g, '');
        btn.querySelector('span').classList.remove('text-slate-600', 'dark:text-neutral-400');
        btn.querySelector('span').classList.add('text-white');
        this.highlightQBox(qBox, isCorrect);
        
        if(isCorrect) {
            this.busy = true; 
            this.score(10);
            btn.classList.add('bg-emerald-500', 'border-emerald-500');
            app.celebration.play();
            this.setTimeout(() => this.nav(1), 1000);
        } else {
            btn.classList.add('bg-rose-500', 'border-rose-500');
        }
    }
}

class TF extends GameMode {
    constructor(k) { super(k); this.render(); }
    render() {
        this.busy = false;
        this.answered = false;
        const c = this.list[this.i];
        const p = app.store.prefs;
        const frontKey = p.tfFront || 'ja';
        const backKey = p.tfBack || 'en';
        
        this.truth = Math.random() > 0.5;
        this.dispBack = this.truth ? c[backKey] : (() => { let w; do{w=app.data.rand()}while(w.id===c.id); return w[backKey]; })();
        
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[55%] landscape:h-full landscape:flex-1 flex flex-col">
                    ${UI.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div id="tf-c" class="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-sm border-4 border-transparent flex-1 flex flex-col items-center justify-center p-2 text-center transition-all duration-300 relative overflow-hidden mb-2 landscape:mb-2 gpu-fix">
                        <div class="h-[45%] w-full fit-box cursor-pointer select-none" onclick="app.game.toggle(this, '${c.ja}', '${c.ja_furi}', '${c.ja}')">
                            <span class="fit-target font-black text-slate-800 dark:text-neutral-200 transition-colors duration-300">${c[frontKey]}</span>
                        </div>
                        
                        <div class="h-[10%] w-full flex flex-col items-center justify-center shrink-0">
                             <div class="w-12 h-1 bg-slate-100 dark:bg-neutral-800 rounded-full mb-1"></div>
                             <p id="tf-lbl" class="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Matches?</p>
                        </div>

                        <div class="h-[45%] w-full fit-box">
                            <span id="tf-m" class="fit-target font-bold text-slate-600 dark:text-neutral-400 transition-colors">${this.dispBack}</span>
                        </div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:pt-2">
                    <div class="mt-auto landscape:mt-0">${UI.audioBar(c)}</div>
                    <div class="grid grid-cols-2 gap-2 mb-2 mt-2 flex-1 min-h-[100px]">
                        <button onclick="app.game.check(this, false)" class="bg-rose-100 dark:bg-rose-900/20 hover:bg-rose-200 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-2xl font-black text-2xl border-b-4 border-rose-200 dark:border-rose-800 active:scale-95 active:border-b-0 transition-all h-full shadow-sm flex items-center justify-center">NO</button>
                        <button onclick="app.game.check(this, true)" class="bg-emerald-100 dark:bg-emerald-900/20 hover:bg-emerald-200 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-2xl font-black text-2xl border-b-4 border-emerald-200 dark:border-emerald-800 active:scale-95 active:border-b-0 transition-all h-full shadow-sm flex items-center justify-center">YES</button>
                    </div>
                    ${UI.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.autoPlay('tf');
    }
    check(btn, userChoice) {
        if(this.busy) return; 
        this.answered = true; 
        const mText = document.getElementById('tf-m');
        const lbl = document.getElementById('tf-lbl');
        const p = app.store.prefs;
        const backKey = p.tfBack || 'en';

        if (!this.truth) { mText.innerText = this.list[this.i][backKey]; app.fitter.fit(mText); }
        this.busy = true;
        const win = (userChoice === this.truth);
        const card = document.getElementById('tf-c');
        this.highlightQBox(card, win);
        lbl.innerText = ""; 
        if(win) {
            this.score(10);
            mText.classList.remove('text-slate-600', 'dark:text-neutral-400');
            mText.classList.add('text-emerald-100', 'font-black'); 
            app.celebration.play();
            this.setTimeout(() => this.nav(1), 1000); 
        } else {
            mText.classList.remove('text-slate-600', 'dark:text-neutral-400');
            mText.classList.add('text-rose-100', 'font-black'); 
            this.setTimeout(() => this.nav(1), 2500);
        }
    }
}

class Match extends GameMode {
    constructor(k) { 
        super(k); 
        this.state = app.store.matchState || { cards: [], pairs: 0, matched: [] };
        this.lastState = null;
        this.sel = null; 
        if(this.state.cards.length === 0) { this.startNewGame(6); } else { this.handleResize(true); }
    }
    
    handleResize(isInit = false) {
        const layout = this.calcLayout();
        this.allowedPairs = layout.allowedPairs;
        this.configMap = layout.map;
        this.sel = null;
        if(!this.allowedPairs.includes(this.state.pairs)) {
             const nearest = this.allowedPairs.reduce((prev, curr) => Math.abs(curr - this.state.pairs) < Math.abs(prev - this.state.pairs) ? curr : prev);
             if(nearest !== this.state.pairs) { this.resizeGame(nearest); return; }
        }
        this.render();
    }
    
    calcLayout() {
        const el = document.getElementById('app-view');
        if (!el) return { allowedPairs: [2,4,6], map: {} };
        const isLandscape = window.innerWidth > window.innerHeight;
        const headerH = 60;
        const h = el.clientHeight - headerH - 10; 
        const w = el.clientWidth - 16; 
        const GAP = 6; 
        const MIN_W = 80; 
        const MIN_H = 60; 
        const validPairs = new Set();
        const configMap = {}; 
        for(let c = 2; c <= 8; c++) {
            for(let r = 2; r <= 10; r++) {
                const gapsW = (c - 1) * GAP;
                const gapsH = (r - 1) * GAP;
                if( ((c * MIN_W) + gapsW) <= w && ((r * MIN_H) + gapsH) <= h ) {
                    const totalCells = c * r;
                    if(totalCells % 2 === 0 && totalCells >= 4) {
                        const p = totalCells / 2;
                        validPairs.add(p);
                        const availCellW = (w - gapsW) / c;
                        let score = availCellW; 
                        if(isLandscape && c < 4) score -= 9999; 
                        if(!configMap[p] || score > configMap[p].score) { configMap[p] = { cols: c, rows: r, score: score }; }
                    }
                }
            }
        }
        const sortedPairs = Array.from(validPairs).sort((a,b)=>a-b);
        if(sortedPairs.length === 0) { sortedPairs.push(2,4); configMap[2]={cols:2}; configMap[4]={cols:2}; }
        return { allowedPairs: sortedPairs, map: configMap };
    }
    
    resizeGame(newPairs) { this.sel = null; this.startNewGame(newPairs); }

    startNewGame(count) {
        if (this.state && this.state.cards.length > 0) {
            this.lastState = { cards: [...this.state.cards], pairs: this.state.pairs, matched: [] };
        }
        const p = parseInt(count);
        const pool = [];
        const indices = new Set();
        while(indices.size < p) { indices.add(Math.floor(Math.random() * this.list.length)); }
        indices.forEach(idx => pool.push(this.list[idx]));
        
        const s = app.store.prefs;
        const typeOptions = [];
        
        LANG_CONFIG.forEach(l => {
             const prefKey = `matchShow${app.store.cap(l.key)}`;
             if(s[prefKey] !== false) typeOptions.push(l.key);
        });
        
        if (typeOptions.length < 2) { typeOptions.push('ja', 'en'); }

        const cards = pool.flatMap(x => {
            // FIX: Only pick types that have non-empty text
            const validTypes = typeOptions.filter(t => x[t] && x[t] !== "");
            if(validTypes.length < 2) return []; // Skip invalid items

            const shuffledTypes = validTypes.sort(() => Math.random() - 0.5).slice(0, 2);
            return shuffledTypes.map(t => {
                let txt = x[t];
                return { id: `${t}-${x.id}`, txt: txt, match: x.id, type: t };
            });
        }).sort(() => Math.random() - 0.5);

        // If pool filtering resulted in fewer cards, retry with lower pair count or accept it
        const finalPairs = cards.length / 2;
        this.state = { cards: cards, pairs: finalPairs, matched: [] };
        app.store.saveMatch(this.state);
        this.sel = null;
        const layout = this.calcLayout();
        this.configMap = layout.map;
        this.allowedPairs = layout.allowedPairs;
        this.render();
    }
    
    restorePrev() {
        if (!this.lastState) return;
        this.state = { cards: [...this.lastState.cards], pairs: this.lastState.pairs, matched: [] };
        app.store.saveMatch(this.state);
        this.sel = null;
        this.handleResize();
    }

    newGame() { this.startNewGame(this.state.pairs); }
    shuffleGrid() { this.state.cards.sort(() => Math.random() - 0.5); app.store.saveMatch(this.state); this.render(); }
    setPairs(val) { this.startNewGame(val); }
    render() {
        this.busy = false;
        const bestConfig = (this.configMap && this.configMap[this.state.pairs]) || { cols: 3 };
        const cols = bestConfig.cols;
        const rows = (this.state.pairs * 2) / cols;
        const opts = { mode:'match', pairs:this.state.pairs, allowedPairs: this.allowedPairs, hasPrev: !!this.lastState };
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full">
                 ${UI.header(null, this.list.length, app.score, opts)}
                 <div class="grid gap-2 flex-1 w-full pb-2" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, minmax(0, 1fr));">
                    ${this.state.cards.map(c => {
                        const isMatched = this.state.matched.includes(c.id);
                        const isSel = this.sel && this.sel.id === c.id;
                        const invisible = isMatched ? 'invisible pointer-events-none' : '';
                        const style = isSel 
                            ? "bg-slate-700 border-slate-700 text-white shadow-inner ring-2 ring-indigo-400" 
                            : "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-indigo-400 hover:shadow-md shadow-sm";
                        return `
                        <div id="${c.id}" onclick="app.game.tap('${c.id}', '${c.match}', this.dataset.txt, '${c.type}')" data-txt="${c.txt}" 
                             class="${invisible} border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center p-1 cursor-pointer transition-all duration-200 select-none overflow-hidden active:scale-95 gpu-fix ${style}">
                            <div class="fit-box"><span class="fit-target font-bold">${c.txt}</span></div>
                        </div>`
                    }).join('')}
                 </div>
            </div>`;
        this.afterRender();
    }
    
    tap(id, match, txt, type) {
        if(this.busy) return; 
        const el = document.getElementById(id);
        if(!el || el.classList.contains('invisible')) return;
        
        const resetCard = (element) => {
            element.className = "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-indigo-400 hover:shadow-md border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center p-1 cursor-pointer transition-all select-none shadow-sm overflow-hidden active:scale-95 gpu-fix";
        };

        if (this.sel && this.sel.id === id) {
            this.sel = null;
            resetCard(el);
            return;
        }
        
        // Match Audio Check
        // Logic: if visual, resolve to parent.
        // User can toggle specific columns.
        // If user turned OFF Pinyin audio, it shouldn't play.
        // If Pinyin is ON, play parent (Chinese).
        
        const audioToggle = app.store.prefs[`matchAudio_${type}`];
        if(audioToggle !== false) { // Default True
            const item = this.list.find(x => x.id == match); 
            if(item) {
                 const { text, key } = this.resolveAudioText(item, type);
                 app.audio.play(text, key, 'match', 0);
            }
        }
        
        if(!this.sel) {
            this.sel = { id, match, el };
            el.className = "bg-slate-800 dark:bg-black border-2 border-slate-800 dark:border-neutral-700 rounded-xl w-full h-full flex flex-col items-center justify-center text-center p-1 text-white ring-4 ring-indigo-200/50 dark:ring-indigo-500/30 transition-all shadow-md overflow-hidden transform scale-105 z-10 gpu-fix";
        } else {
            this.busy = true;
            const prev = document.getElementById(this.sel.id);
            if(!prev) { this.sel = null; this.busy = false; return; }

            const baseClass = "rounded-xl w-full h-full flex flex-col items-center justify-center text-center p-1 transition-all shadow-md overflow-hidden z-20 scale-105 border-2 gpu-fix"; 
            
            if(String(this.sel.match) === String(match)) {
                this.score(10);
                const successClass = `${baseClass} border-emerald-500 bg-emerald-500 text-white`;
                el.className = successClass;
                prev.className = successClass;
                app.celebration.play();
                
                this.setTimeout(() => {
                    this.state.matched.push(id, this.sel.id);
                    app.store.saveMatch(this.state);
                    el.classList.add('invisible', 'pointer-events-none');
                    prev.classList.add('invisible', 'pointer-events-none');
                    this.sel = null; 
                    this.busy = false; 
                    if(this.state.matched.length === this.state.cards.length) setTimeout(() => { this.newGame(); }, 300);
                }, 250);
            } else {
                const failClass = `${baseClass} border-rose-500 bg-rose-500 text-white`;
                el.className = failClass;
                prev.className = failClass;
                
                if (app.store.prefs.matchHint) {
                    const correctMatchId = this.state.cards.find(c => String(c.match) === String(this.sel.match) && c.id !== this.sel.id)?.id;
                    if(correctMatchId) {
                        const hintEl = document.getElementById(correctMatchId);
                        if(hintEl && !hintEl.classList.contains('invisible')) {
                             hintEl.classList.add('bg-yellow-100', 'dark:bg-yellow-900', 'border-yellow-400');
                             setTimeout(() => {
                                 hintEl.classList.remove('bg-yellow-100', 'dark:bg-yellow-900', 'border-yellow-400');
                             }, 400);
                        }
                    }
                }
                this.setTimeout(() => { 
                    resetCard(el);
                    resetCard(prev);
                    this.sel = null; 
                    this.busy = false; 
                }, 500);
            }
        }
    }
}

class Voice extends GameMode {
    constructor(mode) { super(`voice`); this.render(); }
    render() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(!Speech) return (this.root.innerHTML = `<div class="p-10 text-center font-bold text-slate-400 flex flex-col items-center justify-center h-full"><div>Voice not supported on this browser</div><button onclick="app.goHome()" class="mt-4 px-4 py-2 bg-indigo-100 text-indigo-600 rounded-lg text-sm font-bold">Go Back</button></div>`);
        
        const c = this.list[this.i];
        const p = app.store.prefs;
        
        const targetKey = p.voiceAudioTarget || 'ja'; 
        const dispFrontKey = p.voiceDispFront || 'en';
        const dispBackKey = p.voiceDispBack || 'ja';

        const disp = c[dispFrontKey];
        const col = 'sky';

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col">
                    ${UI.header(this.i, this.list.length, app.score, {showDice:true})}
                    <div id="v-c" class="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-neutral-800 flex-1 mb-2 landscape:mb-2 flex flex-col items-center justify-center p-2 text-center relative overflow-hidden group hover:border-${col}-200 transition-colors gpu-fix">
                        <div class="absolute top-0 left-0 w-full h-1 bg-${col}-400"></div>
                        <div class="flex-1 w-full fit-box cursor-pointer select-none" onclick="app.game.toggle(this, '', '${c[dispBackKey]}', '${disp}')">
                            <span class="fit-target font-black text-slate-800 dark:text-neutral-200">${disp}</span>
                        </div>
                        <div id="v-res" class="absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-400 transition-all opacity-0 scale-90">Listening...</div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:pt-2">
                    <div class="mt-auto landscape:mt-0">${UI.audioBar(c)}</div>
                    <div class="flex justify-center h-32 items-center relative mb-4 shrink-0 mt-2">
                        <div id="mic-ring" class="absolute w-24 h-24 rounded-full bg-${col}-500 opacity-0"></div>
                        <button onclick="app.game.listen()" class="w-24 h-24 bg-white dark:bg-neutral-800 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all border-4 border-white dark:border-neutral-700 ring-4 ring-${col}-100 dark:ring-${col}-900/30 z-10 hover:shadow-2xl hover:scale-105">
                             <i class="ph-bold ph-microphone text-4xl text-${col}-500"></i>
                        </button>
                    </div>
                    ${UI.nav()}
                </div>
            </div>`;
        this.afterRender();
        this.autoPlay('voice');
    }
    listen() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new Speech(); 
        
        // DETERMINE GRADING LANGUAGE
        // Based on voiceAudioTarget setting
        const targetKey = app.store.prefs.voiceAudioTarget || 'ja';
        // Need to look up the TTS code for this target (or its parent)
        let langCode = 'ja-JP';
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === targetKey);
            if(conf) {
                // Use TTS code as proxy for Recognition code (they usually match)
                langCode = conf.tts; 
                if(conf.visualOnly && conf.audioSrc) {
                    const parent = LANG_CONFIG.find(l => l.key === conf.audioSrc);
                    if(parent) langCode = parent.tts;
                }
            }
        }
        rec.lang = langCode;
        rec.maxAlternatives = 1;
        
        const ring = document.getElementById('mic-ring');
        const res = document.getElementById('v-res');
        ring.classList.add('animate-pulse-ring', 'opacity-100');
        res.innerText = "Listening..."; res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-800 dark:bg-neutral-600 text-white shadow-lg opacity-100 scale-100";
        
        rec.onresult = (e) => {
            ring.classList.remove('animate-pulse-ring', 'opacity-100');
            const txt = e.results[0][0].transcript.toLowerCase().replace(/\s|[,.!?]/g, '');
            
            // Resolve target text (e.g. if target is romaji, we might want to match against Japanese? 
            // Or if user selected Romaji as target, do they speak English letters? No, usually speaking the language.
            // Prompt says: "voice engine to grade user's voice input is already chosen"
            // So we compare against the audio-resolved text.
            const { text } = this.resolveAudioText(this.list[this.i], targetKey);
            const tgt = text.toLowerCase().replace(/\s/g, '');
            
            if(txt.includes(tgt)) {
                this.score(30);
                res.innerHTML = `<i class="ph-bold ph-check"></i> "${txt}"`;
                res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-emerald-500 text-white shadow-lg transform scale-110";
                document.getElementById('v-c').classList.add('border-emerald-400', 'ring-2', 'ring-emerald-100');
                app.celebration.play();
                app.audio.play(text, targetKey, 'voice', 0);
                this.setTimeout(() => this.nav(1), 1200);
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

/* --- MAIN APP --- */
class App {
    constructor() {
        this.score = 0;
        this.store = new Store();
        this.audio = new AudioService();
        this.data = new DataService();
        this.fitter = new TextFitter(); 
        this.celebration = new CelebrationService();
        this.game = null;
        setTimeout(() => this.init(), 10);
    }
    async init() {
        const btn = document.getElementById('btn-init');
        const statusBar = document.getElementById('status-bar');
        btn.innerText = "Loading Data...";
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        const count = await this.data.load();
        btn.innerText = "Preparing Emojis...";
        await this.celebration.preloadShapes();
        statusBar.innerText = `${count} Words Ready`;
        btn.innerText = "Start";
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.onclick = () => { 
            this.audio.unlock();
            document.getElementById('overlay-init').classList.add('opacity-0', 'pointer-events-none', 'transition-opacity', 'duration-500');
            setTimeout(() => document.getElementById('overlay-init').remove(), 500);
        };
        this.store.loadSettings();
        this.goHome();
    }
    goHome() {
        if(this.game) this.game.destroy();
        this.game = null;
        app.audio.cancel(); 
        document.getElementById('app-view').innerHTML = `
            <div class="flex flex-col gap-4 sm:gap-6 w-full h-full pb-8 overflow-y-auto pt-2 px-2">
                <div class="bg-gradient-to-r from-white to-slate-100 dark:from-neutral-900 dark:to-black rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-neutral-800 flex justify-between relative overflow-hidden w-full shrink-0 group">
                    <div class="relative z-10"><p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Session Score</p><p class="text-6xl sm:text-7xl font-black text-slate-800 dark:text-neutral-200 tracking-tighter">${this.score}</p></div>
                    <div class="text-9xl opacity-10 grayscale absolute -right-6 -bottom-6 rotate-12 select-none group-hover:scale-110 transition-transform duration-500">🏆</div>
                </div>
                <div class="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                    ${this.btn('Flashcards', 'ph-cards', 'indigo', ()=>new Flashcard('flash'))}
                    ${this.btn('True / False', 'ph-check-circle', 'emerald', ()=>new TF('tf'))}
                    ${this.btn('Quiz', 'ph-question', 'pink', ()=>new Quiz('quiz'))}
                    ${this.btn('Matching', 'ph-squares-four', 'slate', ()=>new Match('match'))}
                </div>
                <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 pl-2">Speaking</h3>
                <div class="grid grid-cols-1 gap-3 sm:gap-4 w-full">
                    ${this.btn('Voice Challenge', 'ph-microphone', 'sky', ()=>new Voice('voice'))}
                </div>
            </div>`;
    }
    btn(t, i, c, fn) {
        const colors = {
            indigo: 'from-indigo-500 to-violet-600 shadow-indigo-200 dark:shadow-none',
            emerald: 'from-emerald-400 to-teal-500 shadow-emerald-200 dark:shadow-none',
            pink: 'from-pink-500 to-rose-500 shadow-pink-200 dark:shadow-none',
            slate: 'from-slate-700 to-slate-800 shadow-slate-300 dark:shadow-none',
            sky: 'from-sky-400 to-blue-500 shadow-sky-200 dark:shadow-none',
            violet: 'from-violet-500 to-purple-600 shadow-violet-200 dark:shadow-none',
        }
        return `<button onclick="app.launch(${c === 'slate' ? 'app.game' : 'null'}, ${String(fn)})" class="bg-gradient-to-br ${colors[c]} text-white p-4 rounded-[2rem] h-32 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all relative overflow-hidden group hover:shadow-xl border border-white/20"><div class="mb-2 transform group-hover:scale-110 group-hover:-translate-y-1 transition-transform duration-300"><i class="ph-duotone ${i} text-5xl text-white"></i></div><span class="font-bold text-sm tracking-wide">${t}</span></button>`;
    }
    launch(curr, fn) { if(this.game) this.game.destroy(); this.game = fn(); }
    toggleFull() { !document.fullscreenElement ? document.documentElement.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); }
    modal(show) { document.getElementById('modal-settings').classList.toggle('hidden', !show); if(show) this.store.loadSettings(); }
}
window.app = new App();
