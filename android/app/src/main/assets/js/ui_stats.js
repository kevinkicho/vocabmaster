// Extracted Stats Logic from ui.js
Object.assign(UIManager.prototype, {
    async openStatsModal() {
        const modal = document.getElementById('modal-stats');
        modal.classList.remove('hidden');
        // Reset heatmap cache so it refreshes on next view
        const heatmapView = document.getElementById('weekly-heatmap-view');
        if (heatmapView) heatmapView.dataset.loaded = '';
        const canvas = document.getElementById('stats-chart');
        const ctx = canvas.getContext('2d');
        if(window.myStatsChart) window.myStatsChart.destroy();
        const stats = await app.data.getStats();
        const dailyData = (stats && stats.daily) ? stats.daily : {};
        const labels = ['M', 'T', 'W', 'R', 'F', 'S', 'S'];
        const curr = new Date();
        const day = curr.getDay(); 
        const diffToMon = curr.getDate() - day + (day === 0 ? -6 : 1);
        const mondayDate = new Date(curr.setDate(diffToMon));
        const modes = ['flash', 'quiz', 'tf', 'match', 'voice', 'sentences'];
        const colors = { 'flash': '#818cf8', 'quiz': '#f472b6', 'tf': '#34d399', 'match': '#94a3b8', 'voice': '#38bdf8', 'sentences': '#8b5cf6' };
        const datasets = modes.map(mode => {
            const values = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(mondayDate); d.setDate(mondayDate.getDate() + i);
                const key = d.toISOString().split('T')[0];
                let val = 0;
                if (dailyData[key] && typeof dailyData[key] === 'object') {
                    val = dailyData[key][mode] || 0;
                }
                values.push(val);
            }
            return { label: mode.toUpperCase(), data: values, backgroundColor: colors[mode], borderRadius: 4, stack: 'Stack 0' };
        });
        let maxVal = 0;
        for(let i=0; i<7; i++) {
            const d = new Date(mondayDate); d.setDate(mondayDate.getDate() + i);
            const key = d.toISOString().split('T')[0];
            if(dailyData[key]) {
               const entry = dailyData[key];
               const sum = (typeof entry === 'number') ? entry : Object.values(entry).reduce((a,b)=>a+b, 0);
               if(sum > maxVal) maxVal = sum;
            }
        }
        let yMax = 1000;
        if (maxVal > 900) yMax = 5000;
        if (maxVal > 4500) yMax = 10000;
        if (maxVal > 9000) yMax = 20000;
        window.myStatsChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false, callbacks: { label: function(context) { return context.parsed.y > 0 ? context.parsed.y : ""; } } } },
                scales: { y: { beginAtZero: true, max: yMax, grid: { color: 'rgba(156, 163, 175, 0.1)' }, stacked: true }, x: { grid: { display: false }, ticks: { color: (c) => c.index === 6 ? '#f43f5e' : '#64748b', font: { weight: 'bold' } }, stacked: true } }
            }
        });
    },

    showWeeklyView(view) {
        const chartView = document.getElementById('weekly-chart-view');
        const heatmapView = document.getElementById('weekly-heatmap-view');
        const chartBtn = document.getElementById('wv-chart');
        const heatmapBtn = document.getElementById('wv-heatmap');
        const legend = document.getElementById('heatmap-legend');
        const activeClass = 'weekly-view-btn py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider transition-all bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm';
        const inactiveClass = 'weekly-view-btn py-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-wider transition-all text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300';

        if (view === 'chart') {
            if (chartView) chartView.classList.remove('hidden');
            if (heatmapView) heatmapView.classList.add('hidden');
            if (chartBtn) chartBtn.className = activeClass;
            if (heatmapBtn) heatmapBtn.className = inactiveClass;
            if (legend) { legend.classList.add('hidden'); legend.classList.remove('flex'); }
        } else {
            if (chartView) chartView.classList.add('hidden');
            if (heatmapView) heatmapView.classList.remove('hidden');
            if (chartBtn) chartBtn.className = inactiveClass;
            if (heatmapBtn) heatmapBtn.className = activeClass;
            if (legend) { legend.classList.remove('hidden'); legend.classList.add('flex'); }
            this.renderHeatmap();
        }
    },

    async renderHeatmap() {
        const container = document.getElementById('weekly-heatmap-view');
        if (!container) return;
        if (container.dataset.loaded === '1') return;

        container.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        // Wait for layout so clientWidth is accurate
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        // Fetch both data sources
        const [weeklyStats, analyticsData] = await Promise.all([
            app.data.getStats(),
            app.analytics ? app.analytics.getAnalytics() : null
        ]);

        const weeklyDaily = (weeklyStats && weeklyStats.daily) ? weeklyStats.daily : {};
        const analyticsDaily = (analyticsData && analyticsData.daily) ? analyticsData.daily : {};

        const today = new Date();
        const todayOffset = today.getTimezoneOffset() * 60000;
        const todayKey = (new Date(today - todayOffset)).toISOString().slice(0, 10);
        const year = today.getFullYear();

        // Full year: Jan 1 to Dec 31
        const jan1 = new Date(year, 0, 1);
        const dec31 = new Date(year, 11, 31);

        // Grid starts on the Monday on or before Jan 1
        const jan1Day = jan1.getDay(); // 0=Sun
        const startOffset = jan1Day === 0 ? 6 : jan1Day - 1; // days to go back to Monday
        const gridStart = new Date(jan1);
        gridStart.setDate(jan1.getDate() - startOffset);

        // Grid ends on the Sunday on or after Dec 31
        const dec31Day = dec31.getDay();
        const endOffset = dec31Day === 0 ? 0 : 7 - dec31Day;
        const gridEnd = new Date(dec31);
        gridEnd.setDate(dec31.getDate() + endOffset);

        // Count weeks
        const totalDays = Math.round((gridEnd - gridStart) / (1000 * 60 * 60 * 24)) + 1;
        const WEEKS = Math.ceil(totalDays / 7);

        // Build dateList in column-major order (Mon..Sun per week)
        const dateList = [];
        for (let w = 0; w < WEEKS; w++) {
            for (let d = 0; d < 7; d++) {
                const date = new Date(gridStart);
                date.setDate(gridStart.getDate() + w * 7 + d);
                const off = date.getTimezoneOffset() * 60000;
                dateList.push((new Date(date - off)).toISOString().slice(0, 10));
            }
        }

        // Determine which dates are within the current year
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        // Compute activity values
        let maxVal = 0;
        const activityMap = {};
        for (const key of dateList) {
            let val = 0;
            if (weeklyDaily[key]) {
                const entry = weeklyDaily[key];
                val += (typeof entry === 'number') ? entry : Object.values(entry).reduce((a, b) => a + b, 0);
            } else if(analyticsDaily[key]) {
                val += (analyticsDaily[key].correct || 0) + (analyticsDaily[key].incorrect || 0);
            }
            activityMap[key] = val;
            if (key <= todayKey && val > maxVal) maxVal = val;
        }

        const dayLabels = ['M', '', 'W', '', 'F', '', 'S'];
        const getLevel = (val) => {
            if (val === 0 || maxVal === 0) return 0;
            const ratio = val / maxVal;
            if (ratio <= 0.15) return 1;
            if (ratio <= 0.40) return 2;
            if (ratio <= 0.70) return 3;
            return 4;
        };

        // Inline styles since these classes may not be in compiled Tailwind
        const isDark = document.documentElement.classList.contains('dark');
        const levelColors = isDark ? {
            0: '#262626', // neutral-800
            1: 'rgba(6,78,59,0.6)', // emerald-900/60
            2: '#047857', // emerald-700
            3: '#10b981', // emerald-500
            4: '#34d399'  // emerald-400
        } : {
            0: '#f1f5f9', // slate-100
            1: '#a7f3d0', // emerald-200
            2: '#34d399', // emerald-400
            3: '#10b981', // emerald-500
            4: '#059669'  // emerald-600
        };

        // Build cells
        let cellsHtml = '';
        for (const key of dateList) {
            const val = activityMap[key] || 0;
            const isToday = key === todayKey;
            const isFuture = key > todayKey;
            const isOutOfYear = key < yearStart || key > yearEnd;
            const todayClass = isToday ? 'hm-today' : '';
            const parts = key.split('-');

            if (isOutOfYear) {
                cellsHtml += `<div class="hm-cell" style="visibility:hidden"></div>`;
            } else {
                const level = getLevel(val);
                const color = levelColors[isFuture ? 0 : level];
                const futureClass = isFuture ? 'hm-future' : '';
                const tooltip = isFuture ? `${parts[1]}/${parts[2]}` : `${parts[1]}/${parts[2]}: ${val > 0 ? val + ' pts' : 'No activity'}`;
                cellsHtml += `<div class="hm-cell ${todayClass} ${futureClass}" style="background:${color}" title="${tooltip}"></div>`;
            }
        }

        // Month labels — find the first week column where each month appears
        let monthLabels = '';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let lastMonth = -1;
        for (let w = 0; w < WEEKS; w++) {
            // Check all 7 days in this week column — find first in-year date
            for (let d = 0; d < 7; d++) {
                const key = dateList[w * 7 + d];
                if (key >= yearStart && key <= yearEnd) {
                    const m = parseInt(key.split('-')[1]) - 1;
                    if (m !== lastMonth) {
                        monthLabels += `<span class="text-[9px] font-bold text-slate-400 dark:text-neutral-500" style="grid-column:${w + 1}">${months[m]}</span>`;
                        lastMonth = m;
                    }
                    break;
                }
            }
        }

        // Measure container to compute square cells that fill full width
        const labelColW = 20;
        const flexGap = 8;
        const containerW = container.clientWidth || 300;
        const gridW = containerW - labelColW - flexGap;
        const MIN_CELL = 8;
        const gap = 2;
        let cellSize = Math.max(MIN_CELL, (gridW - (WEEKS - 1) * gap) / WEEKS);
        const cs = Math.floor(cellSize * 100) / 100;
        const actualGridW = cs * WEEKS + gap * (WEEKS - 1);
        const needsScroll = actualGridW > gridW;

        container.innerHTML = `
            <div class="flex w-full" style="gap:${flexGap}px">
                <div class="shrink-0" style="display:grid; grid-template-rows:repeat(7, ${cs}px); gap:${gap}px; padding-top:${14 + gap}px; width:${labelColW}px;">
                    ${dayLabels.map(l => `<div class="flex items-center justify-end"><span class="text-[9px] font-bold text-slate-400 dark:text-neutral-500">${l}</span></div>`).join('')}
                </div>
                <div style="${needsScroll ? 'overflow-x:auto;' : ''} flex:1; min-width:0;">
                    <div style="display:grid; grid-template-columns:repeat(${WEEKS}, ${cs}px); gap:${gap}px; margin-bottom:${gap}px; height:14px; align-items:end;${needsScroll ? ' width:max-content;' : ''}">
                        ${monthLabels}
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(${WEEKS}, ${cs}px); grid-template-rows:repeat(7, ${cs}px); grid-auto-flow:column; gap:${gap}px;${needsScroll ? ' width:max-content;' : ''}">
                        ${cellsHtml}
                    </div>
                </div>
            </div>
        `;

        container.dataset.loaded = '1';
    },

    showStatsTab(tab) {
        // Toggle panels
        document.querySelectorAll('.stats-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById(`tab-${tab}`);
        if (panel) panel.classList.remove('hidden');

        // Toggle tab button styles
        document.querySelectorAll('.stats-tab').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.className = 'stats-tab flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-sm';
            } else {
                btn.className = 'stats-tab flex-1 py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300';
            }
        });

        // Lazy-load tab content
        if (tab === 'accuracy') this.renderAccuracyTab();
        else if (tab === 'words') this.renderWordsTab();
        else if (tab === 'activity') this.renderActivityTab();
    },

    async renderAccuracyTab() {
        const panel = document.getElementById('tab-accuracy');
        if (!panel) return;
        if (!app.analytics) { panel.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Analytics not available.</p>'; return; }

        panel.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        const [dailyData, modeData] = await Promise.all([
            app.analytics.getDailyAccuracy(7),
            app.analytics.getAccuracyByMode()
        ]);

        const hasDailyData = dailyData.some(d => d.total > 0);
        const hasModeData = Object.keys(modeData).length > 0;

        if (!hasDailyData && !hasModeData) {
            panel.innerHTML = '<div class="flex-1 flex items-center justify-center"><div class="text-center"><i class="ph-duotone ph-chart-line text-5xl text-slate-200 dark:text-neutral-700 mb-3"></i><p class="text-sm font-bold text-slate-400">No accuracy data yet.</p><p class="text-xs text-slate-300 dark:text-neutral-600 mt-1">Play some games to see your accuracy trends!</p></div></div>';
            return;
        }

        panel.innerHTML = `
            <div class="flex-1 flex flex-col min-h-0">
                ${hasDailyData ? '<div class="flex-1 flex flex-col min-h-[180px] mb-4"><h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 shrink-0">7-Day Accuracy Trend</h3><div class="relative flex-1 min-h-0"><canvas id="accuracy-trend-chart"></canvas></div></div>' : ''}
                ${hasModeData ? '<div class="shrink-0"><h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Accuracy by Mode</h3><div id="mode-accuracy-bars"></div></div>' : ''}
            </div>
        `;

        // Daily accuracy line chart
        if (hasDailyData) {
            const ctx = document.getElementById('accuracy-trend-chart');
            if (ctx) {
                if (window._accTrendChart) window._accTrendChart.destroy();
                const labels = dailyData.map(d => { const parts = d.date.split('-'); return `${parts[1]}/${parts[2]}`; });
                window._accTrendChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Accuracy %',
                            data: dailyData.map(d => d.accuracy),
                            borderColor: '#818cf8',
                            backgroundColor: 'rgba(129, 140, 248, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: '#818cf8'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y}%` } } },
                        scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(156, 163, 175, 0.1)' }, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } }
                    }
                });
            }
        }

        // Mode accuracy bars (HTML-based for flexibility)
        if (hasModeData) {
            const container = document.getElementById('mode-accuracy-bars');
            if (container) {
                const modeNames = { flash: 'Flashcards', quiz: 'Quiz', tf: 'True/False', match: 'Matching', voice: 'Voice', sentences: 'Sentences' };
                const modeColors = { flash: '#818cf8', quiz: '#f472b6', tf: '#34d399', match: '#94a3b8', voice: '#38bdf8', sentences: '#8b5cf6' };
                let html = '<div class="space-y-3">';
                for (const [mode, data] of Object.entries(modeData)) {
                    const name = modeNames[mode] || mode;
                    const color = modeColors[mode] || '#818cf8';
                    html += `
                        <div>
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-xs font-bold text-slate-600 dark:text-neutral-300">${name}</span>
                                <span class="text-xs font-black" style="color:${color}">${data.accuracy}%</span>
                            </div>
                            <div class="w-full h-2 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                <div class="h-full rounded-full transition-all duration-500" style="width:${data.accuracy}%;background:${color}"></div>
                            </div>
                            <div class="flex justify-between mt-0.5">
                                <span class="text-[10px] text-slate-300 dark:text-neutral-600">${data.correct} correct</span>
                                <span class="text-[10px] text-slate-300 dark:text-neutral-600">${data.incorrect} wrong</span>
                            </div>
                        </div>`;
                }
                html += '</div>';
                container.innerHTML = html;
            }
        }
    },

    async renderWordsTab() {
        const panel = document.getElementById('tab-words');
        if (!panel) return;
        if (!app.analytics) { panel.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Analytics not available.</p>'; return; }

        panel.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        const missed = await app.analytics.getMostMissedWords(15);

        if (!missed || missed.length === 0) {
            panel.innerHTML = '<div class="flex-1 flex items-center justify-center"><div class="text-center"><i class="ph-duotone ph-books text-5xl text-slate-200 dark:text-neutral-700 mb-3"></i><p class="text-sm font-bold text-slate-400">No word data yet.</p><p class="text-xs text-slate-300 dark:text-neutral-600 mt-1">Words you get wrong will appear here for review.</p></div></div>';
            return;
        }

        const frontKey = app.store.prefs.flashFront || 'ja';
        const backKey = app.store.prefs.flashBack1 || 'en';

        let html = '<h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Most Missed Words</h3><div class="space-y-2">';
        missed.forEach((w, idx) => {
            const c = w.c || 0;
            const wrong = w.w || 0;
            const total = c + wrong;
            const acc = total > 0 ? Math.round(c / total * 100) : 0;
            const word = w.vocab ? (w.vocab[frontKey] || w.vocab.ja || '') : `#${w.id}`;
            const meaning = w.vocab ? (w.vocab[backKey] || w.vocab.en || '') : '';
            const lastDate = w.last ? new Date(w.last).toLocaleDateString() : '';

            html += `
                <div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-neutral-800 rounded-xl border border-slate-100 dark:border-neutral-700">
                    <span class="text-xs font-black text-slate-300 dark:text-neutral-600 w-5 text-right shrink-0">${idx + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span class="font-black text-sm text-slate-700 dark:text-neutral-200 truncate">${escapeHtml(word)}</span>
                            <span class="text-xs text-slate-400 dark:text-neutral-500 truncate">${escapeHtml(meaning)}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="flex-1 h-1.5 bg-slate-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                <div class="h-full rounded-full ${acc >= 70 ? 'bg-emerald-400' : acc >= 40 ? 'bg-amber-400' : 'bg-rose-400'}" style="width:${acc}%"></div>
                            </div>
                            <span class="text-[10px] font-bold ${acc >= 70 ? 'text-emerald-500' : acc >= 40 ? 'text-amber-500' : 'text-rose-500'} w-8 text-right">${acc}%</span>
                        </div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-[10px] font-bold"><span class="text-emerald-500">${c}</span><span class="text-slate-300 dark:text-neutral-600 mx-0.5">/</span><span class="text-rose-400">${wrong}</span></div>
                        ${lastDate ? `<div class="text-[9px] text-slate-300 dark:text-neutral-600">${lastDate}</div>` : ''}
                    </div>
                </div>`;
        });
        html += '</div>';
        panel.innerHTML = html;
    },

    async renderActivityTab() {
        const panel = document.getElementById('tab-activity');
        if (!panel) return;
        if (!app.analytics) { panel.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Analytics not available.</p>'; return; }

        panel.innerHTML = '<div class="flex items-center justify-center py-8"><i class="ph-bold ph-spinner animate-spin text-2xl text-slate-400"></i></div>';

        const analytics = await app.analytics.getAnalytics();

        if (!analytics) {
            panel.innerHTML = '<div class="flex-1 flex items-center justify-center"><div class="text-center"><i class="ph-duotone ph-fire text-5xl text-slate-200 dark:text-neutral-700 mb-3"></i><p class="text-sm font-bold text-slate-400">No activity data yet.</p><p class="text-xs text-slate-300 dark:text-neutral-600 mt-1">Start playing to track your streaks!</p></div></div>';
            return;
        }

        const streak = analytics.streak || { current: 0, best: 0 };
        const lifetime = analytics.lifetime || {};
        const totalCorrect = lifetime.correct || 0;
        const totalIncorrect = lifetime.incorrect || 0;
        const totalAttempts = totalCorrect + totalIncorrect;
        const overallAcc = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;

        // Count sessions
        const sessions = analytics.sessions || {};
        const sessionCount = Object.keys(sessions).length;

        // Calculate total session time
        let totalTime = 0;
        Object.values(sessions).forEach(s => {
            if (s.start && s.end) totalTime += (s.end - s.start);
        });
        const avgTime = sessionCount > 0 ? Math.round(totalTime / sessionCount / 1000) : 0;
        const formatTime = (secs) => {
            if (secs < 60) return `${secs}s`;
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return s > 0 ? `${m}m ${s}s` : `${m}m`;
        };

        panel.innerHTML = `
            <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-4 border border-amber-100 dark:border-amber-900/30 text-center">
                    <div class="text-4xl font-black text-amber-500 mb-1">${streak.current}</div>
                    <div class="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Day Streak</div>
                </div>
                <div class="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-2xl p-4 border border-violet-100 dark:border-violet-900/30 text-center">
                    <div class="text-4xl font-black text-violet-500 mb-1">${streak.best}</div>
                    <div class="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Best Streak</div>
                </div>
            </div>
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Lifetime Stats</h3>
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black text-slate-700 dark:text-neutral-200">${totalAttempts.toLocaleString()}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Total Attempts</div>
                </div>
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black ${overallAcc >= 70 ? 'text-emerald-500' : overallAcc >= 40 ? 'text-amber-500' : 'text-rose-500'}">${overallAcc}%</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Accuracy</div>
                </div>
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black text-slate-700 dark:text-neutral-200">${sessionCount}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Sessions</div>
                </div>
                <div class="bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                    <div class="text-2xl font-black text-slate-700 dark:text-neutral-200">${formatTime(avgTime)}</div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Avg Session</div>
                </div>
            </div>
            <div class="flex items-center gap-3 bg-slate-50 dark:bg-neutral-800 rounded-xl p-3 border border-slate-100 dark:border-neutral-700">
                <div class="flex-1">
                    <div class="flex justify-between mb-1">
                        <span class="text-[10px] font-bold text-emerald-500">${totalCorrect.toLocaleString()} correct</span>
                        <span class="text-[10px] font-bold text-rose-400">${totalIncorrect.toLocaleString()} wrong</span>
                    </div>
                    <div class="w-full h-2.5 bg-slate-200 dark:bg-neutral-700 rounded-full overflow-hidden flex">
                        ${totalAttempts > 0 ? `<div class="h-full bg-emerald-400 rounded-l-full" style="width:${overallAcc}%"></div><div class="h-full bg-rose-400 rounded-r-full" style="width:${100 - overallAcc}%"></div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }
});
