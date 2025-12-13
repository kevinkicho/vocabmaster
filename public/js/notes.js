/* js/notes.js */
class NoteService {
    constructor() {
        this.currentWordId = null;
        this.isAdmin = false;
        this.adminEmail = 'kevinkicho@gmail.com';
        
        this.dragState = {
            active: false,
            currentX: 0, currentY: 0,
            initialX: 0, initialY: 0,
            xOffset: 0, yOffset: 0
        };
        this.isDragging = false; 
        this.isTouchInteraction = false; 
    }

    setUser(user) {
        if (user && user.email.toLowerCase() === this.adminEmail.toLowerCase()) {
            this.isAdmin = true;
            const btn = document.getElementById('btn-login');
            if(btn) btn.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full">`;
        } else {
            this.isAdmin = false;
            const btn = document.getElementById('btn-login');
            if(btn) btn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
        }
        
        const devTab = document.getElementById('details-developer');
        if (devTab) {
            if (this.isAdmin) devTab.classList.remove('hidden');
            else devTab.classList.add('hidden');
        }
        
        if(this.currentWordId !== null) this.check(this.currentWordId);
        if(window.app && window.app.game && typeof window.app.game.render === 'function') {
            window.app.game.render();
        }
    }

    check(wordId) {
        this.currentWordId = (wordId !== undefined && wordId !== null) ? wordId : null;
        if (this.currentWordId === null) { this.updateUI(null); return; }
        const item = app.data.list.find(w => w.id === this.currentWordId);
        const hasContent = (item && item.html) || (item && Object.keys(item).some(k => k.startsWith('ch')));
        this.updateUI(hasContent);
    }

    updateUI(hasContent) {
        const fab = document.getElementById('fab-container');
        if(!fab) return;

        // FIX 1: Hide FAB in Matching Mode
        if (window.app && window.app.game && window.app.game.key === 'match') {
            fab.innerHTML = '';
            return;
        }
        
        if (this.isAdmin || hasContent) {
            const icon = this.isAdmin ? 'ph-note-pencil' : 'ph-notebook';
            const bg = hasContent ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400';
            const hover = hasContent ? 'hover:bg-indigo-500' : 'hover:bg-slate-300';
            const pointer = 'pointer-events-auto';
            fab.innerHTML = `<button id="fab-btn" onclick="if(!app.notes.isDragging) app.notes.openModal()" class="w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform active:scale-90 ${pointer} ${bg} ${hover} z-50 touch-none select-none"><i class="ph-bold ${icon} text-2xl"></i></button>`;
            this.initDraggable();
        } else {
            fab.innerHTML = '';
        }
    }

    /* --- TOOLTIP LISTENERS --- */
    attachTooltipListeners() {
        if (!app.ui) return;
        const chars = document.querySelectorAll('.hanzi-char');
        
        chars.forEach(el => {
            if(el.dataset.hasTooltip) return;
            el.dataset.hasTooltip = "true";
            
            const char = el.dataset.char;

            // 1. MOUSE EVENTS
            el.addEventListener('mouseenter', (e) => {
                if (this.isTouchInteraction) return; 
                el.classList.add('text-indigo-600');
                app.ui.showTooltip(e, char, false);
            });
            el.addEventListener('mouseleave', (e) => {
                if (this.isTouchInteraction) return;
                el.classList.remove('text-indigo-600');
                app.ui.hideTooltip();
            });

            // 2. TOUCH EVENTS
            let pressTimer;
            el.addEventListener('touchstart', (e) => {
                this.isTouchInteraction = true; 
                el.classList.add('text-indigo-600');
                clearTimeout(pressTimer);
                pressTimer = setTimeout(() => {
                    app.ui.showTooltip(e, char, true);
                    el.classList.remove('text-indigo-600');
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 500); 
            }, { passive: true });

            el.addEventListener('touchend', (e) => {
                clearTimeout(pressTimer); 
                el.classList.remove('text-indigo-600');
                setTimeout(() => { this.isTouchInteraction = false; }, 1000);
            });
            el.addEventListener('touchmove', () => {
                clearTimeout(pressTimer);
                el.classList.remove('text-indigo-600');
            });
        });
    }

    /* --- UTILS --- */
    copyToClipboard(text) {
        if (!text) return;
        if (!navigator.clipboard) {
            const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        } else { navigator.clipboard.writeText(text); }
        const bar = document.getElementById('status-bar'); const orig = bar.innerText; bar.innerText = `Copied: ${text}`; bar.classList.add('text-indigo-500'); setTimeout(() => { bar.innerText = orig; bar.classList.remove('text-indigo-500'); }, 1500);
    }
    playAudio(text) { if (!text) return; if (window.app && window.app.audio) { window.app.audio.play(text, 'zh', null, 0); } }

    /* --- DRAGGABLE LOGIC --- */
    initDraggable() {
        const container = document.getElementById('fab-container');
        const btn = document.getElementById('fab-btn');
        if(!container || !btn) return;
        if(this.dragState.xOffset !== 0 || this.dragState.yOffset !== 0) { this.setTranslate(this.dragState.xOffset, this.dragState.yOffset, container); }
        btn.onmousedown = (e) => this.dragStart(e);
        btn.ontouchstart = (e) => this.dragStart(e);
    }
    dragStart(e) {
        const container = document.getElementById('fab-container');
        if (!container) return;
        if (e.type === "touchstart") { this.dragState.initialX = e.touches[0].clientX - this.dragState.xOffset; this.dragState.initialY = e.touches[0].clientY - this.dragState.yOffset; } else { this.dragState.initialX = e.clientX - this.dragState.xOffset; this.dragState.initialY = e.clientY - this.dragState.yOffset; }
        if (e.target.closest('#fab-btn')) { this.dragState.active = true; this.boundDrag = (ev) => this.drag(ev); this.boundDragEnd = (ev) => this.dragEnd(ev); document.addEventListener("mouseup", this.boundDragEnd); document.addEventListener("touchend", this.boundDragEnd); document.addEventListener("mousemove", this.boundDrag); document.addEventListener("touchmove", this.boundDrag, { passive: false }); }
    }
    dragEnd(e) { this.dragState.initialX = this.dragState.currentX; this.dragState.initialY = this.dragState.currentY; this.dragState.active = false; document.removeEventListener("mouseup", this.boundDragEnd); document.removeEventListener("touchend", this.boundDragEnd); document.removeEventListener("mousemove", this.boundDrag); document.removeEventListener("touchmove", this.boundDrag); setTimeout(() => { this.isDragging = false; }, 50); }
    drag(e) {
        if (this.dragState.active) { e.preventDefault(); this.isDragging = true; const container = document.getElementById('fab-container');
            if (e.type === "touchmove") { this.dragState.currentX = e.touches[0].clientX - this.dragState.initialX; this.dragState.currentY = e.touches[0].clientY - this.dragState.initialY; } else { this.dragState.currentX = e.clientX - this.dragState.initialX; this.dragState.currentY = e.clientY - this.dragState.initialY; }
            this.dragState.xOffset = this.dragState.currentX; this.dragState.yOffset = this.dragState.currentY; this.setTranslate(this.dragState.currentX, this.dragState.currentY, container);
        }
    }
    setTranslate(xPos, yPos, el) { el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`; }

    /* --- EDITOR LOGIC --- */
    openModal() {
        const modal = document.getElementById('modal-note'); const body = document.getElementById('note-body'); const item = app.data.list.find(w => w.id === this.currentWordId);
        const htmlContent = (item && item.html) ? item.html : ''; const chKeys = item ? Object.keys(item).filter(k => k.startsWith('ch') && !isNaN(k.substring(2))) : []; const hasRich = !!htmlContent && htmlContent.trim() !== ""; const hasHanzi = chKeys.length > 0;
        const richContainer = document.getElementById('rich-container'); const hanziContainer = document.getElementById('hanzi-container');
        richContainer.className = "flex flex-col overflow-y-auto bg-white dark:bg-neutral-900 transition-all"; hanziContainer.className = "flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-neutral-800 bg-slate-100/50 dark:bg-neutral-900/50 overflow-y-auto transition-all";
        if (this.isAdmin || (hasRich && hasHanzi)) { richContainer.classList.add('w-full', 'lg:w-1/2'); hanziContainer.classList.add('w-full', 'lg:w-1/2'); richContainer.classList.remove('hidden'); hanziContainer.classList.remove('hidden'); } else if (hasHanzi) { hanziContainer.classList.add('w-full'); richContainer.classList.add('hidden'); hanziContainer.classList.remove('hidden'); } else if (hasRich) { richContainer.classList.add('w-full'); hanziContainer.classList.add('hidden'); richContainer.classList.remove('hidden'); } else { richContainer.classList.add('hidden'); hanziContainer.classList.add('hidden'); }
        body.innerHTML = htmlContent;
        if (this.isAdmin) { body.contentEditable = "true"; body.innerHTML = htmlContent; document.getElementById('note-toolbar').classList.remove('hidden'); document.getElementById('note-footer').classList.remove('hidden'); document.getElementById('btn-add-row').classList.remove('hidden'); } else { body.contentEditable = "false"; document.getElementById('note-toolbar').classList.add('hidden'); document.getElementById('note-footer').classList.add('hidden'); document.getElementById('btn-add-row').classList.add('hidden'); }
        this.renderHanziGrid(item); modal.classList.remove('hidden');
    }
    closeModal() { document.getElementById('modal-note').classList.add('hidden'); }
    renderHanziGrid(item) {
        const container = document.getElementById('hanzi-rows'); container.innerHTML = '';
        const chKeys = item ? Object.keys(item).filter(k => k.startsWith('ch') && !isNaN(k.substring(2))).sort((a,b) => parseInt(a.substring(2)) - parseInt(b.substring(2))) : [];
        if (chKeys.length === 0) { if (this.isAdmin) this.addHanziRow(); return; }
        chKeys.forEach(key => { const parts = (item[key] || "").split('\\'); const cardHTML = this.createCardHTML(parts, this.isAdmin); const wrapper = document.createElement('div'); wrapper.innerHTML = cardHTML; container.appendChild(wrapper.firstElementChild); });
        if (this.isAdmin && chKeys.length === 0) { this.addHanziRow(); }
    }
    createCardHTML(values, isAdmin) {
        const v = (i) => values[i] || "";
        if (isAdmin) {
            return `<div class="flex bg-white dark:bg-black rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-neutral-800 relative group hanzi-card"><button onclick="this.closest('.hanzi-card').remove()" class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center text-rose-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full transition-colors opacity-0 group-hover:opacity-100 z-20"><i class="ph-bold ph-x"></i></button><div class="w-24 bg-slate-900 flex flex-col items-center justify-center border-r border-slate-800 shrink-0 gap-1 p-1"><input type="text" value="${v(0)}" placeholder="Trad" class="text-4xl font-serif text-white font-black bg-transparent w-full text-center outline-none focus:bg-white/10 transition-colors h-12"><div class="w-8 h-px bg-slate-700"></div><input type="text" value="${v(1)}" placeholder="Simp" class="text-xl font-serif text-slate-400 font-bold bg-transparent w-full text-center outline-none focus:bg-white/10 transition-colors"></div><div class="flex-1 p-4 flex flex-col justify-center min-w-0"><div class="flex flex-col mb-2"><span class="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-0.5">Pinyin</span><input type="text" value="${v(2)}" placeholder="..." class="text-lg font-bold text-slate-800 dark:text-white leading-none font-serif bg-transparent w-full outline-none focus:border-b border-indigo-500"></div><div class="h-px bg-slate-100 dark:bg-neutral-800 w-full mb-2"></div><div class="grid grid-cols-1 gap-2"><div class="flex items-baseline gap-2"><span class="text-[10px] font-bold text-indigo-500 w-6 shrink-0">KR</span><input type="text" value="${v(3)}" placeholder="..." class="text-sm font-bold text-slate-600 dark:text-neutral-300 w-full bg-transparent outline-none focus:border-b border-indigo-500"></div><div class="flex items-baseline gap-2"><span class="text-[10px] font-bold text-emerald-500 w-6 shrink-0">EN</span><input type="text" value="${v(4)}" placeholder="..." class="text-sm font-bold text-slate-600 dark:text-neutral-300 w-full bg-transparent outline-none focus:border-b border-indigo-500"></div></div></div></div>`;
        } else {
            const trad = v(0) || "?"; const simp = v(1) || ""; const pinyin = v(2) || ""; const ko = v(3) || ""; const en = v(4) || "";
            return `<div class="flex bg-white dark:bg-black rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-neutral-800 hanzi-card"><div onclick="app.notes.copyToClipboard('${trad}')" class="w-24 bg-slate-900 flex flex-col items-center justify-center border-r border-slate-800 shrink-0 cursor-pointer active:bg-slate-800 hover:bg-slate-800/80 transition-colors p-1" title="Copy"><span class="text-4xl font-serif text-white font-black select-none leading-none mb-1">${trad}</span>${simp ? `<span class="text-lg font-serif text-slate-500 select-none leading-none">${simp}</span>` : ''}</div><div class="flex-1 p-4 flex flex-col justify-center min-w-0"><div onclick="app.notes.playAudio('${trad}')" class="flex flex-col mb-2 cursor-pointer group" title="Play Audio"><div class="flex justify-between"><span class="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-0.5">Pinyin</span><i class="ph-bold ph-speaker-high text-slate-300 group-hover:text-indigo-500 text-xs"></i></div><span class="text-lg font-bold text-slate-800 dark:text-white leading-none font-serif group-active:scale-95 transition-transform origin-left">${pinyin}</span></div><div class="h-px bg-slate-100 dark:bg-neutral-800 w-full mb-2"></div><div class="grid grid-cols-1 gap-1"><div onclick="app.notes.copyToClipboard('${ko}')" class="flex items-baseline gap-2 cursor-pointer active:opacity-60 transition-opacity" title="Copy"><span class="text-[10px] font-bold text-indigo-500 w-6 shrink-0">KR</span><span class="text-sm font-bold text-slate-600 dark:text-neutral-300 truncate">${ko}</span></div><div class="flex items-baseline gap-2"><span class="text-[10px] font-bold text-emerald-500 w-6 shrink-0">EN</span><span class="text-sm font-bold text-slate-600 dark:text-neutral-300 truncate">${en}</span></div></div></div></div>`;
        }
    }
    addHanziRow(values = ['', '', '', '', '']) { const container = document.getElementById('hanzi-rows'); const cardHTML = this.createCardHTML(values, true); const wrapper = document.createElement('div'); wrapper.innerHTML = cardHTML; container.appendChild(wrapper.firstElementChild); }
    async saveCurrent() {
        if (!this.isAdmin || this.currentWordId === null || this.currentWordId === undefined) return;
        const btn = document.querySelector('#note-footer button'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Saving...`; btn.disabled = true;
        try {
            const currentItem = app.data.list.find(w => w.id === this.currentWordId); if(!currentItem) throw new Error("Word not found");
            const updates = { ...currentItem }; Object.keys(updates).forEach(k => { if (k.startsWith('ch') && !isNaN(k.substring(2))) delete updates[k]; });
            const html = document.getElementById('note-body').innerHTML; updates.html = html;
            const rows = document.querySelectorAll('.hanzi-card'); if (rows.length > 0) { rows.forEach((row, index) => { const inputs = row.querySelectorAll('input'); const vals = Array.from(inputs).map(inp => inp.value.trim()); if (vals.some(v => v !== "")) { updates[`ch${index + 1}`] = vals.join('\\'); } }); }
            await app.data.saveCorrection(updates); this.check(this.currentWordId); this.closeModal(); const bar = document.getElementById('status-bar'); bar.innerText = "Saved!"; bar.classList.add('text-emerald-500'); setTimeout(() => bar.classList.remove('text-emerald-500'), 2000);
        } catch (e) { console.error(e); alert("Error: " + e.message); } finally { btn.innerHTML = origText; btn.disabled = false; }
    }
}
