/* js/game_placement.js — Formal placement quiz (FSRS-safe)
 *
 * Extends Quiz. Uses mode key 'placement' and always passes
 * { applyMemory: false, skipMemory: true } so FSRS is never written.
 * On finish: maps per-tier accuracy → recommended tier within framework.
 */

class Placement extends Quiz {
    constructor() {
        this._placementCorrect = 0;
        this._placementTotal = 0;
        this._placementTarget = 12;
        this._placementDone = false;
        this._levels = ['A1', 'A2', 'B1', 'B2'];
        /** @type {Record<string,{c:number,t:number}>} */
        this._byTier = {};
        this._itemTiers = []; // parallel to this.list: which tier tag each item came from
        super('placement');
        this._buildPlacementList();
        this.i = 0;
        this.historyStack = [0];
        this.historyPtr = 0;
        this.update();
    }

    _buildPlacementList() {
        var list = (app.data && app.data.list) || [];
        var path = app.learningPath && app.learningPath.getProfile ? app.learningPath.getProfile() : null;
        var framework = (path && path.framework) || 'jlpt';
        var levels = [];
        if (typeof LEVEL_CONFIG !== 'undefined' && LEVEL_CONFIG.groups) {
            for (var g = 0; g < LEVEL_CONFIG.groups.length; g++) {
                if (LEVEL_CONFIG.groups[g].key === framework) {
                    levels = LEVEL_CONFIG.groups[g].levels.slice();
                    break;
                }
            }
        }
        if (!levels.length) levels = ['A1', 'A2', 'B1', 'B2'];
        // Cap sampling to first 5 tiers so a short quiz stays informative
        if (levels.length > 5) levels = levels.slice(0, 5);

        var picked = [];
        var itemTiers = [];
        var perTier = Math.max(2, Math.ceil(this._placementTarget / levels.length));
        for (var li = 0; li < levels.length && picked.length < this._placementTarget; li++) {
            var tier = levels[li];
            var pool = list.filter(function (item) {
                return item && item.tags && item.tags.indexOf(tier) !== -1;
            });
            pool = pool.slice().sort(function () { return Math.random() - 0.5; });
            for (var j = 0; j < pool.length && j < perTier && picked.length < this._placementTarget; j++) {
                picked.push(pool[j]);
                itemTiers.push(tier);
            }
        }
        if (picked.length < 4) {
            picked = list.slice().sort(function () { return Math.random() - 0.5; }).slice(0, this._placementTarget);
            itemTiers = picked.map(function () { return levels[0]; });
        }
        this.list = picked;
        this._itemTiers = itemTiers;
        this._levels = levels;
        this._byTier = {};
        for (var t = 0; t < levels.length; t++) {
            this._byTier[levels[t]] = { c: 0, t: 0 };
        }
    }

    _recordTier(correct) {
        var tier = this._itemTiers[this.i];
        if (!tier) return;
        if (!this._byTier[tier]) this._byTier[tier] = { c: 0, t: 0 };
        this._byTier[tier].t++;
        if (correct) this._byTier[tier].c++;
    }

    /**
     * Recommend highest tier where user still scores ≥ 55% (with floor fallback).
     * Prefers per-tier rates when we have samples; falls back to overall rate.
     */
    _recommendTier() {
        var levels = this._levels || ['A1', 'A2', 'B1', 'B2'];
        var overall = this._placementTotal > 0 ? this._placementCorrect / this._placementTotal : 0;
        var best = levels[0];
        var sawAny = false;
        for (var i = 0; i < levels.length; i++) {
            var st = this._byTier[levels[i]];
            if (!st || st.t < 1) continue;
            sawAny = true;
            var rate = st.c / st.t;
            // Unlock this tier if rate is at least 0.55; push higher when ≥ 0.75
            if (rate >= 0.55) best = levels[i];
            if (rate >= 0.75 && i + 1 < levels.length) {
                // peek one higher only if next has samples and is not disastrous
                var next = this._byTier[levels[i + 1]];
                if (!next || next.t === 0 || next.c / next.t >= 0.4) {
                    best = levels[i + 1];
                }
            }
        }
        if (!sawAny) {
            var idx = 0;
            if (overall >= 0.9) idx = Math.min(levels.length - 1, 3);
            else if (overall >= 0.75) idx = Math.min(levels.length - 1, 2);
            else if (overall >= 0.55) idx = Math.min(levels.length - 1, 1);
            best = levels[idx];
        }
        return best;
    }

    score(pts, wordId, meta) {
        this._placementCorrect++;
        this._placementTotal++;
        this._recordTier(true);
        meta = Object.assign({}, meta || {}, { applyMemory: false, skipMemory: true, skipTutor: true });
        if (app.analytics) {
            var wId = wordId != null ? wordId : (this.list[this.i] && this.list[this.i].id);
            app.analytics.recordAttempt(wId, 'placement', true, meta);
        }
        this._maybeFinish();
    }

    miss(wordId, meta) {
        this._placementTotal++;
        this._recordTier(false);
        meta = Object.assign({}, meta || {}, { applyMemory: false, skipMemory: true, skipTutor: true });
        if (app.analytics) {
            var wId = wordId != null ? wordId : (this.list[this.i] && this.list[this.i].id);
            app.analytics.recordAttempt(wId, 'placement', false, meta);
        }
        this._maybeFinish();
    }

    async check(btn, isCorrect) {
        if (this.busy || this.answered || this._placementDone) return;
        var btnWrap = btn.parentElement;
        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        if (btnWrap) btnWrap.className = btnWrap.className.replace(/\b(hover:border-indigo-200|dark:hover:border-indigo-500\/50)\b/g, '');
        var span = btn.querySelector('span');
        if (span) {
            span.classList.replace('text-slate-600', 'text-white');
            span.classList.replace('dark:text-white', 'text-white');
        }
        if (this.dom.front) {
            this.dom.front.classList.remove('bg-white', 'dark:bg-neutral-900', 'border-slate-100', 'dark:border-neutral-800');
            if (isCorrect) {
                this.dom.front.classList.add('bg-emerald-500', 'border-emerald-500');
            } else {
                this.dom.front.classList.add('bg-rose-500', 'border-rose-500');
            }
        }
        if (btnWrap) {
            btnWrap.classList.remove('bg-white', 'dark:bg-neutral-900', 'border-slate-100', 'dark:border-neutral-800');
            btnWrap.classList.add(isCorrect ? 'bg-emerald-500' : 'bg-rose-500', isCorrect ? 'border-emerald-500' : 'border-rose-500');
        }
        this.answered = true;
        this.busy = true;
        if (isCorrect) {
            this.score(10);
            if (app.celebration) app.celebration.play();
        } else {
            this.miss();
        }
        var self = this;
        setTimeout(function () {
            if (self._placementDone) return;
            self.busy = false;
            self.answered = false;
            self.hasMissed = false;
            // Linear through placement list (no modulo infinite loop)
            if (self.i + 1 < self.list.length && self._placementTotal < self._placementTarget) {
                self.i = self.i + 1;
                self.update();
            }
        }, 900);
    }

    _maybeFinish() {
        if (this._placementDone) return;
        // Finish when target count reached or list exhausted
        if (this._placementTotal < this._placementTarget && this._placementTotal < this.list.length) return;
        this._placementDone = true;
        var rate = this._placementTotal > 0 ? this._placementCorrect / this._placementTotal : 0;
        var tier = this._recommendTier();
        try {
            if (app.learningPath) {
                var p = app.learningPath.getProfile();
                p.placementStatus = 'done';
                p.pathMode = 'guided';
                p.currentTier = tier;
                p.currentUnitId = null;
                p.placementResult = {
                    accuracy: rate,
                    correct: this._placementCorrect,
                    total: this._placementTotal,
                    byTier: this._byTier,
                    recommendedTier: tier,
                    finishedAt: Date.now()
                };
                app.learningPath.ensureUnit(0);
                app.learningPath.saveLocal();
                app.learningPath.flush();
            }
        } catch (e) {
            L('[Placement] finish failed', e);
        }
        try {
            if (window.EngagementService) EngagementService.increment('placementCompleted', 1);
        } catch (_) {}
        if (app.ui && app.ui.showToast) {
            app.ui.showToast(
                'Placement complete · starting at ' + tier + ' (' + Math.round(rate * 100) + '% correct)',
                'success'
            );
        }
        var self = this;
        setTimeout(function () {
            if (app.goHome) app.goHome(false);
        }, 1200);
    }

    update() {
        if (this._placementDone) return;
        Quiz.prototype.update.call(this);
        try {
            var h = this.root.querySelector('#qz-header');
            if (h) {
                var bar = document.createElement('div');
                bar.className = 'text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest px-2 py-1';
                bar.textContent =
                    'Placement ' +
                    this._placementTotal +
                    '/' +
                    this._placementTarget +
                    ' · no effect on review schedule';
                if (!this.root.querySelector('#placement-badge')) {
                    bar.id = 'placement-badge';
                    h.parentNode.insertBefore(bar, h.nextSibling);
                } else {
                    this.root.querySelector('#placement-badge').textContent = bar.textContent;
                }
                // Skip control
                if (!this.root.querySelector('#placement-skip')) {
                    var skip = document.createElement('button');
                    skip.id = 'placement-skip';
                    skip.type = 'button';
                    skip.className =
                        'text-[10px] font-bold text-slate-400 underline px-2 py-1 mt-1';
                    skip.textContent = 'Skip placement';
                    skip.onclick = function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (app.learningPath && typeof app.learningPath.skipPlacement === 'function') {
                            app.learningPath.skipPlacement();
                        } else if (app.goHome) {
                            app.goHome(false);
                        }
                    };
                    var badge = this.root.querySelector('#placement-badge');
                    if (badge && badge.parentNode) badge.parentNode.insertBefore(skip, badge.nextSibling);
                }
            }
        } catch (_) {}
    }
}

window.Placement = Placement;
