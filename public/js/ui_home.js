/* js/ui_home.js — Home screen filter UI (level filter + tag filter)
 *
 * Extracted from ui.js (R3). Extends UIManager.prototype with the home-screen
 * level/tag filter renderers and their toggle handlers. Loaded after ui.js.
 *
 * Methods:
 *   renderLevelFilter()  — renders the level filter chips on the home screen
 *   toggleLevel(level)   — handles level chip clicks, updates prefs + game list
 *   renderTagFilter()    — renders the tag filter chips (JLPT/HSK/CEFR/TOPIK/Frequency)
 *   toggleTag(tag)        — handles tag chip clicks, updates prefs + game list
 *
 * Depends on: UIManager (from ui.js), LEVEL_CONFIG (from config.js),
 *             app.data (from data.js), app.store (from store.js).
 */

// renderLevelFilter — renders the level filter chips on the home screen
UIManager.prototype.renderLevelFilter = function() {
    const container = document.getElementById('level-filter-container');
    if (!container) return;
    const p = this.store.prefs;
    if (typeof LEVEL_CONFIG === 'undefined') return;
    const selected = p.levelFilter || ['all'];
    const hasLevelData = app.data.list.some(item => item.level || item.tags);
    if (!hasLevelData) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    const allBtnClass = selected.includes('all') ? 'bg-violet-500 text-white border-violet-500' : 'bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-600';
    let html = `<p class="text-[9px] uppercase font-bold text-violet-500 mb-2 flex items-center gap-1"><i class="ph-bold ph-barbell"></i> Level Filter</p>
        <div class="flex flex-wrap gap-1.5 mb-2">
        <button data-level="all" class="level-filter-btn px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${allBtnClass}">All</button>`;
    for (const group of LEVEL_CONFIG.groups) {
        var isRelevant = group.langs.some(l => l === this._getActiveLang());
        if (!isRelevant) continue;
        html += `<span class="text-[9px] font-black text-slate-400 mx-1">${group.label}</span>`;
        for (const lvl of group.levels) {
            const isActive = selected.includes(lvl);
            const color = LEVEL_CONFIG.colors[lvl] || '#6366f1';
            const btnClass = isActive ? 'text-white border-transparent shadow-sm' : 'bg-white dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 border-slate-200 dark:border-neutral-700';
            const style = isActive ? `background:${color}; border-color:${color}` : '';
            html += `<button data-level="${lvl}" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 whitespace-nowrap ${btnClass}" style="${style}">${lvl}</button>`;
        }
    }
    const unassignedActive = selected.includes('unassigned');
    const unClass = unassignedActive ? 'bg-slate-600 text-white border-slate-600' : 'bg-white dark:bg-neutral-700 text-slate-400 dark:text-neutral-500 border-slate-200 dark:border-neutral-600';
    html += `<button data-level="unassigned" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${unClass}">Untagged</button>`;
    html += `</div><p class="text-[10px] text-slate-400 dark:text-neutral-500"><span class="font-bold text-violet-500">${app.data.getFilteredList().length}</span> of ${app.data.list.length} words selected</p></div>`;
    container.innerHTML = html;
    container.querySelectorAll('.level-filter-btn').forEach(btn => {
        btn.onclick = () => { this.toggleLevel(btn.dataset.level); };
    });
};

// toggleLevel — handles level chip clicks
UIManager.prototype.toggleLevel = function(level) {
    const p = this.store.prefs;
    let selected = [...(p.levelFilter || ['all'])];
    if (level === 'all') { selected = ['all']; }
    else {
        selected = selected.filter(l => l !== 'all');
        if (selected.includes(level)) { selected = selected.filter(l => l !== level); if (selected.length === 0) selected = ['all']; }
        else { selected.push(level); }
    }
    p.levelFilter = selected;
    localStorage.setItem(this.store.STORAGE_KEY, JSON.stringify(p));
    this.renderLevelFilter();
    if (app.game) {
        // Keep review/session scope when _reviewList is set (do not expand to full filter)
        if (typeof window.assignGameList === 'function') {
            window.assignGameList(app.game);
            if (!app.data._reviewList && app.game.list.length === 0) {
                app.game.list = app.data.activeList; p.levelFilter = ['all'];
            }
        } else {
            app.game.list = app.data.getFilteredList();
            if (app.game.list.length === 0) { app.game.list = app.data.activeList; p.levelFilter = ['all']; }
        }
        if (app.game.i >= app.game.list.length) app.game.i = 0;
        if (app.game.update) app.game.update(); else app.game.render();
    }
};

// renderTagFilter — renders the tag filter chips (JLPT/HSK/CEFR/TOPIK/Frequency)
UIManager.prototype.renderTagFilter = function() {
    const section = document.getElementById('tag-filter-section');
    if (!section || !app.data) return;
    const allTags = app.data.getAllTags();
    if (!allTags || allTags.length === 0) { section.innerHTML = ''; return; }
    const p = this.store.prefs;
    const selected = p.tagFilter || ['all'];
    const allBtnClass = selected.includes('all') ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 border-slate-200 dark:border-neutral-600';
    var currentLang = this._getActiveLang();
    var allGroups = [
        { label: 'JLPT', tags: ['N5','N4','N3','N2','N1'], langs: ['ja','ja_furi','ja_roma'] },
        { label: 'HSK', tags: ['HSK1','HSK2','HSK3','HSK4','HSK5','HSK6'], langs: ['zh','zh_pin'], stripPrefix: 'HSK' },
        { label: 'CEFR', tags: ['A1','A2','B1','B2','C1'], langs: ['en','es','fr','de','it','pt','ru','ru_tr'] },
        { label: 'TOPIK', tags: ['TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','TOPIK6'], langs: ['ko','ko_roma'], stripPrefix: 'TOPIK' },
        { label: 'Frequency', tags: ['common','uncommon','rare'], langs: null },
    ];
    var groups = allGroups.filter(g => !g.langs || g.langs.indexOf(currentLang) !== -1);
    let html = `<div class="bg-white dark:bg-neutral-900 rounded-2xl p-3 border border-slate-200 dark:border-neutral-800">
        <p class="text-[9px] uppercase font-bold text-indigo-500 mb-2 flex items-center gap-1"><i class="ph-bold ph-exam"></i> Exam Level <span class="text-[7px] text-slate-300 dark:text-neutral-600 italic font-normal normal-case">(Basic → Advanced)</span> <i class="ph-bold ph-info text-slate-400 cursor-pointer relative" id="exam-level-info"></i></p>
        <div id="exam-level-tooltip" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-4 py-3 shadow-lg max-w-[280px] w-auto leading-relaxed">
          <p class="mb-1"><strong class="text-indigo-300">JLPT</strong> — Japanese-Language Proficiency Test (N5→N1)</p>
          <p class="mb-1"><strong class="text-indigo-300">HSK</strong> — Hanyu Shuiping Kaoshi (HSK1→HSK6)</p>
          <p class="mb-1"><strong class="text-indigo-300">TOPIK</strong> — Test of Proficiency in Korean (TOPIK1→TOPIK6)</p>
          <p class="mb-1"><strong class="text-indigo-300">CEFR</strong> — Common European Framework (A1→C2)</p>
          <p class="text-slate-400 mt-1">Not all entries have every framework tag.</p>
        </div>
        <div class="flex items-center justify-between mb-3">
            <p class="text-[10px] text-slate-400 dark:text-neutral-500"><span class="font-bold text-indigo-500">${app.data.getFilteredList().length}</span> of ${app.data.list.length} words selected</p>
            <button data-tag="all" class="tag-filter-btn px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${allBtnClass}">All</button>
        </div>`;
    for (const group of groups) {
        const existingTags = group.tags.filter(t => allTags.includes(t));
        if (existingTags.length === 0) continue;
        html += `<div class="w-full flex items-start gap-2 mt-1">
            <span class="text-[9px] font-black text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap mt-1.5 min-w-[52px]">${group.label}</span>
            <div class="flex flex-wrap gap-1.5 items-center">`;
        for (const tag of existingTags) {
            const isActive = selected.includes(tag);
            const btnClass = isActive ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 border-slate-200 dark:border-neutral-700';
            const display = group.stripPrefix ? tag.replace(group.stripPrefix, '') : tag;
            html += `<button data-tag="${tag}" class="tag-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${btnClass}">${display}</button>`;
        }
        html += `</div></div>`;
    }
    html += `</div>
    </div>`;
    section.innerHTML = html;
    const infoIcon = document.getElementById('exam-level-info');
    if (infoIcon) {
        infoIcon.onclick = function(e) {
            e.stopPropagation();
            var tooltip = document.getElementById('exam-level-tooltip');
            if (!tooltip) return;
            tooltip.classList.toggle('hidden');
            if (tooltip.classList.contains('hidden')) return;
            requestAnimationFrame(function() {
                var rect = infoIcon.getBoundingClientRect();
                var tw = tooltip.offsetWidth;
                var th = tooltip.offsetHeight;
                var left = rect.left + rect.width / 2 - tw / 2;
                var top = rect.bottom + 4;
                if (left + tw > window.innerWidth) left = window.innerWidth - tw - 8;
                if (left < 8) left = 8;
                if (top + th > window.innerHeight) top = rect.top - th - 4;
                if (top < 8) top = 8;
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
                tooltip.style.transform = 'none';
            });
        };
        document.addEventListener('click', function _closeExamTooltip(e) {
            const tooltip = document.getElementById('exam-level-tooltip');
            if (tooltip && !tooltip.classList.contains('hidden') && !e.target.closest('#exam-level-info')) {
                tooltip.classList.add('hidden');
            }
        });
    }
    section.querySelectorAll('.tag-filter-btn').forEach(btn => {
        btn.onclick = () => { this.toggleTag(btn.dataset.tag); };
    });
};

// toggleTag — handles tag chip clicks
UIManager.prototype.toggleTag = function(tag) {
    const p = this.store.prefs;
    let selected = [...(p.tagFilter || ['all'])];
    if (tag === 'all') { selected = ['all']; }
    else {
        selected = selected.filter(t => t !== 'all');
        if (selected.includes(tag)) { selected = selected.filter(t => t !== tag); if (selected.length === 0) selected = ['all']; }
        else { selected.push(tag); }
    }
    p.tagFilter = selected;
    localStorage.setItem(this.store.STORAGE_KEY, JSON.stringify(p));
    this.renderTagFilter();
    if (app.game) {
        // Keep review/session scope when _reviewList is set (do not expand to full filter)
        if (typeof window.assignGameList === 'function') {
            window.assignGameList(app.game);
            if (!app.data._reviewList && app.game.list.length === 0) {
                app.game.list = app.data.activeList; p.tagFilter = ['all'];
            }
        } else {
            app.game.list = app.data.getFilteredList();
            if (app.game.list.length === 0) { app.game.list = app.data.activeList; p.tagFilter = ['all']; }
        }
        if (app.game.i >= app.game.list.length) app.game.i = 0;
        if (app.game.update) app.game.update(); else app.game.render();
    }
};