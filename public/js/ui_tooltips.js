/* js/ui_tooltips.js — Hanzi character tooltip UI
 *
 * Extracted from ui.js (R3). Extends UIManager.prototype with the Hanzi
 * character dictionary lookup tooltip (show/position/hide). Loaded after ui.js.
 *
 * Methods:
 *   showTooltip(e, char, isLongPress)  — shows the Hanzi tooltip, fetches dict data
 *   positionTooltip(tooltip, e, isLongPress) — positions the tooltip near cursor/touch
 *   hideTooltip(force)                 — hides the tooltip with optional delay
 *
 * Depends on: UIManager (from ui.js), app.data.getKanji (from data.js),
 *             app.store.prefs.hanzi* (from store.js), escapeHtml (from escape.js).
 *
 * Instance state used: this.hideTimer, this.autoCloseTimer, this.trackTooltip.
 * These are initialized lazily (checked for null before clearing).
 */

UIManager.prototype.showTooltip = function(e, char, isLongPress = false) {
    if (app.store.prefs.hanziEnableTooltip === false) return;
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this.autoCloseTimer) { clearTimeout(this.autoCloseTimer); this.autoCloseTimer = null; }

    const tooltip = document.getElementById('hanzi-tooltip');
    if(!tooltip) return;

    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    tooltip.classList.remove('hidden', 'opacity-0');

    if (!char) return;

    tooltip.innerHTML = `
        <div class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-slate-200 dark:border-neutral-700 p-4 min-w-[120px] relative z-[100]">
             <div class="flex items-center gap-2 text-slate-400">
                <i class="ph-bold ph-spinner animate-spin"></i> <span class="text-xs font-bold">Loading...</span>
             </div>
    </div>`;
    this.positionTooltip(tooltip, e, isLongPress);

    const failTimer = setTimeout(() => {
        if(tooltip.innerHTML.includes('ph-spinner')) {
            tooltip.innerHTML = `<div class="bg-white dark:bg-neutral-800 rounded-xl p-3 shadow-2xl border border-slate-200 dark:border-neutral-700"><p class="text-xs font-bold text-rose-500">Not Found</p></div>`;
        }
    }, 3000);

    app.data.getKanji(char).then(data => {
        clearTimeout(failTimer);
        if(!data) {
            this.hideTooltip(true);
            return;
        }
        const { t:trad, s:simp, p:pinyin, k:kr, e:en } = data;
        const p = app.store.prefs;

        tooltip.innerHTML = `
        <div class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-slate-200 dark:border-neutral-700 p-3 min-w-[150px] max-w-xs pointer-events-auto z-[100] relative" onclick="event.stopPropagation()">
            <button onclick="app.ui.hideTooltip(true)" class="absolute -top-3 -right-3 w-7 h-7 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform border border-white dark:border-neutral-600 z-[101]">
                <i class="ph-bold ph-x text-xs"></i>
            </button>
            <div class="flex items-center gap-3 mb-2 border-b border-slate-100 dark:border-neutral-700 pb-2">
                ${p.hanziShowTrad!==false ? `<span class="text-3xl font-serif text-slate-800 dark:text-white font-black leading-none">${escapeHtml(trad)}</span>` : ''}
                ${p.hanziShowSimp!==false && simp && simp !== trad ? `<span class="text-lg font-serif text-slate-400 leading-none">${escapeHtml(simp)}</span>` : ''}
            </div>
            <div class="space-y-1">
                ${p.hanziShowPinyin!==false ? `<p class="text-sm font-bold text-indigo-500 font-serif">${escapeHtml(pinyin)}</p>` : ''}
                ${p.hanziShowKr!==false ? `<p class="text-xs text-slate-600 dark:text-neutral-300">🇰🇷 ${escapeHtml(kr)}</p>` : ''}
                ${p.hanziShowEn!==false ? `<p class="text-xs text-slate-600 dark:text-neutral-300">🇺🇸 ${escapeHtml(en)}</p>` : ''}
            </div>
        </div>`;
        this.positionTooltip(tooltip, e, isLongPress);
    }).catch(() => {
        clearTimeout(failTimer);
        this.hideTooltip(true);
    });

    const closeTime = parseInt(app.store.prefs.hanziAutoClose || "0");
    if (closeTime > 0) {
        this.autoCloseTimer = setTimeout(() => { this.hideTooltip(true); }, closeTime);
    }

    if (!isLongPress) {
        if(this.trackTooltip) document.removeEventListener('mousemove', this.trackTooltip);
        this.trackTooltip = (ev) => {
            const offset = 20;
            let lx = ev.clientX + offset;
            let ly = ev.clientY + offset;
            if (lx + 200 > window.innerWidth) lx = window.innerWidth - 220;
            if (ly + 150 > window.innerHeight) ly = window.innerHeight - 170;
            tooltip.style.left = `${lx}px`;
            tooltip.style.top = `${ly}px`;
        };
        document.addEventListener('mousemove', this.trackTooltip);
    }
};

UIManager.prototype.positionTooltip = function(tooltip, e, isLongPress) {
    requestAnimationFrame(() => {
        const rect = tooltip.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const offset = 20;
        let left, top;
        if (isLongPress) {
            const touch = e.touches[0];
            left = touch.clientX - (w / 2);
            top = touch.clientY - h - 30;
        } else {
            left = e.clientX + offset;
            top = e.clientY + offset;
        }
        if (left + w > window.innerWidth) left = window.innerWidth - w - 10;
        if (left < 10) left = 10;
        if (top + h > window.innerHeight) top = window.innerHeight - h - 10;
        if (top < 10) top = 10;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    });
};

UIManager.prototype.hideTooltip = function(force = false) {
    if (this.autoCloseTimer) { clearTimeout(this.autoCloseTimer); this.autoCloseTimer = null; }
    const delay = force ? 0 : 200;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
        const tooltip = document.getElementById('hanzi-tooltip');
        if(tooltip) {
            tooltip.classList.add('opacity-0');
            setTimeout(() => {
                tooltip.classList.add('hidden');
                tooltip.style.left = '-9999px';
            }, 200);
        }
    }, delay);
    if(this.trackTooltip) {
        document.removeEventListener('mousemove', this.trackTooltip);
        this.trackTooltip = null;
    }
};