/* js/game_match.js */
class Match extends GameMode {
    constructor(k) { 
        super(k); 
        this.sel = null;
        // Review/session Match must not restore free-play board (stale cards/word set)
        if (app.data && app.data._reviewList && app.data._reviewList.length) {
            app.store.clearMatch();
        }
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
            this.sel = null;
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
        const el = document.getElementById('app-view');
        if (!el) return { allowedPairs: [2, 4, 6], map: {} };

        const gap = 8;          // Tailwind gap-2 = 0.5rem = 8px
        const headerH = 58;     // header min-h (50px) + mb-2 (8px)
        const padBottom = 8;    // pb-2
        const h = Math.max(el.clientHeight, window.innerHeight - 80) - headerH - padBottom;
        const w = el.clientWidth - 8;
        const isPortrait = w < h;
        const minCellW = 56;
        const minCellH = 40;

        const validPairs = new Set();
        const configMap = {};

        for (let cols = 2; cols <= 8; cols++) {
            for (let rows = 2; rows <= 12; rows++) {
                if (cols * minCellW + (cols - 1) * gap > w) continue;
                if (rows * minCellH + (rows - 1) * gap > h) continue;

                const total = cols * rows;
                if (total % 2 !== 0 || total < 4) continue;
                const pairs = total / 2;

                const cellW = (w - (cols - 1) * gap) / cols;
                const cellH = (h - (rows - 1) * gap) / rows;

                // Prefer cell aspect ratios near 1.4:1 (slightly wider than tall)
                const ratio = cellW / cellH;
                const ratioScore = -Math.abs(ratio - 1.4) * 80;

                // Prefer larger cells
                const areaScore = Math.min(cellW, 180) + Math.min(cellH, 120);

                // Orientation-aware column preferences
                let orientScore = 0;
                if (isPortrait) {
                    if (cols === 2) orientScore += 60;
                    else if (cols === 3) orientScore += 30;
                    if (cols >= 5) orientScore -= 80;
                } else {
                    if (cols >= 3 && cols <= 5) orientScore += 40;
                    if (cols === 4) orientScore += 20;
                    if (rows <= 3) orientScore += 15;
                }

                const score = ratioScore + areaScore + orientScore;

                if (!configMap[pairs] || score > configMap[pairs].score) {
                    configMap[pairs] = { cols, rows, score };
                }
                validPairs.add(pairs);
            }
        }

        return { allowedPairs: Array.from(validPairs).sort((a, b) => a - b), map: configMap };
    }
    
    startNewGame(count) {
        if(this.state && this.state.cards.length > 0) {
            this.prevCards = JSON.parse(JSON.stringify(this.state.cards));
            this.prevPairs = this.state.pairs;
        }

        const pool = []; const indices = new Set();
        const maxCount = Math.min(count, this.list.length);
        while(indices.size < maxCount) indices.add(Math.floor(Math.random() * this.list.length));
        indices.forEach(idx => pool.push(this.list[idx]));
        
        const typeOptions = LANG_CONFIG.filter(l => app.store.prefs[`matchShow${app.store.cap(l.key)}`]).map(l=>l.key);
        if(typeOptions.length < 2) typeOptions.push('ja','en');

        const cards = pool.flatMap(x => {
            const types = typeOptions.filter(t => x[t]).sort(()=>Math.random()-0.5).slice(0,2);
            return types.map(t => ({ id: `${t}-${x.id}`, txt: x[t], match: x.id, type: t }));
        }).sort(()=>Math.random()-0.5);

        this.state = { cards, pairs: cards.length/2, matched: [] };
        this.sel = null; 
        app.store.saveMatch(this.state);
        this.handleResize();
    }
    
    setPairs(v) { this.startNewGame(v); }
    shuffleGrid() { this.state.cards.sort(()=>Math.random()-0.5); app.store.saveMatch(this.state); this.render(); }
    newGame() { this.startNewGame(this.state.pairs); }

    render() {
        this.busy = false;
        const config = this.configMap && this.configMap[this.state.pairs];
        const cols = config?.cols || 3;
        const rows = config?.rows || Math.ceil(this.state.cards.length / cols);

        const baseClass = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none active:scale-95 gpu-fix overflow-hidden";
        const defaultClass = "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-indigo-400 shadow-sm";
        const selectedClass = "bg-slate-700 border-slate-700 text-white ring-2 ring-indigo-400";
        const matchedClass = "invisible pointer-events-none";

        this.root.innerHTML = `
        <div class="flex flex-col h-full w-full">
            ${app.ui.header(null, this.list.length, app.score, {mode:'match', pairs:this.state.pairs, allowedPairs:this.allowedPairs, hasPrev:!!this.prevCards})}
            <div class="grid gap-2 flex-1 w-full pb-2" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, minmax(0, 1fr));">
                ${this.state.cards.map(c => {
                    const isM = this.state.matched.includes(c.id);
                    const isS = this.sel && this.sel.id === c.id;
                    const className = `${baseClass} ${isM ? matchedClass : (isS ? selectedClass : defaultClass)}`;
                    return `<div id="${escapeHtml(c.id)}" data-wid="${escapeHtml(c.match)}" onclick="event.stopPropagation(); app.game.tap('${escapeHtml(c.id)}','${escapeHtml(c.match)}','${escapeHtml(c.type)}')" class="${className}"><div class="fit-box w-full h-full"><span class="fit-target font-black">${escapeHtml(c.txt)}</span></div></div>`;
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
        if(app.store.prefs[prefKey] !== false) {
            const item = this.list.find(x => String(x.id) === String(match));
            if(item) {
                let audioKey = type;
                const conf = LANG_MAP.get(type);
                if(conf && conf.audioSrc) audioKey = conf.audioSrc;
                app.audio.play(item[audioKey] || item[type], audioKey, 'match', 0);
            }
        }

        const resetStyle = (element) => {
            if(!element) return;
            element.className = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none active:scale-95 gpu-fix overflow-hidden bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-indigo-400 shadow-sm";
        };
        const setSelectStyle = (element) => {
            if(!element) return;
            element.className = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none active:scale-95 gpu-fix overflow-hidden bg-slate-700 border-slate-700 text-white ring-2 ring-indigo-400";
        };
        const setSuccessStyle = (element) => {
             if(!element) return;
             element.className = "border-2 rounded-xl w-full h-full flex flex-col items-center justify-center text-center transition-all scale-105 z-10 bg-emerald-500 border-emerald-500 text-white";
        };
        const setFailStyle = (element) => {
             if(!element) return;
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
                this.score(10, parseInt(match)); app.celebration.play();
                
                this.setTimeout(() => {
                    this.state.matched.push(id, this.sel.id); 
                    app.store.saveMatch(this.state);
                    if(el) el.classList.add('invisible', 'pointer-events-none');
                    if(prevEl) prevEl.classList.add('invisible', 'pointer-events-none');
                    this.sel = null; this.busy = false;
                    if(this.state.matched.length === this.state.cards.length) {
                        this.setTimeout(() => this.startNewGame(this.state.pairs), 300);
                    }
                }, 250);
            } else {
                setFailStyle(el);
                setFailStyle(prevEl);
                // Route through miss() so session controllers / analytics stay consistent
                this.miss(parseInt(match));
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
