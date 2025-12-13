class Match extends GameMode {
    constructor(k) { 
        super(k); 
        this.state = app.store.matchState || { cards: [], pairs: 0, matched: [] };
        
        if(this.state.cards.length > 0) {
            this.state.matched = [];
            this.state.cards.sort(() => Math.random() - 0.5);
            app.store.saveMatch(this.state);
        }

        if(this.state.cards.length === 0) { 
            const count = (window.innerHeight > 800) ? 8 : 6;
            this.startNewGame(count); 
        } else { 
            this.handleResize(); 
        }
    }
    
    restorePrev() {
        if (this.prevCards) {
            this.state.cards = JSON.parse(JSON.stringify(this.prevCards));
            this.state.pairs = this.prevPairs;
            this.state.matched = [];
            this.shuffleGrid();
        } else {
            this.startNewGame(this.state.pairs);
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
        if(this.state && this.state.cards.length > 0) {
            this.prevCards = JSON.parse(JSON.stringify(this.state.cards));
            this.prevPairs = this.state.pairs;
        }

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
            ${app.ui.header(null, this.list.length, app.score, {mode:'match', pairs:this.state.pairs, allowedPairs:this.allowedPairs, hasPrev:!!this.prevCards})}
            <div class="grid gap-2 flex-1 w-full pb-2" style="grid-template-columns: repeat(${c}, minmax(0, 1fr));">
                ${this.state.cards.map(c => {
                    const isM = this.state.matched.includes(c.id); 
                    const isS = this.sel && this.sel.id === c.id;
                    const className = `${baseClass} ${isM ? matchedClass : (isS ? selectedClass : defaultClass)}`;
                    return `<div id="${c.id}" onclick="app.game.tap('${c.id}','${c.match}','${c.type}')" class="${className}"><div class="fit-box w-full h-full"><span class="fit-target font-black">${c.txt}</span></div></div>`;
                }).join('')}
            </div>
        </div>`;
        this.afterRender();
    }
    
    tap(id, match, type) {
        if(this.busy || this.state.matched.includes(id)) return;
        const el = document.getElementById(id);
        if(!el) return;

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
