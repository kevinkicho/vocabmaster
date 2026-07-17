/* js/game_placement.js — Formal placement quiz (FSRS-safe)
 *
 * Extends Quiz. Uses mode key 'placement' and always passes
 * { applyMemory: false, skipMemory: true } so FSRS is never written.
 * On finish: maps accuracy → tier within current framework and sets guided path.
 */

class Placement extends Quiz {
    constructor() {
        // Build list before super so GameMode/Quiz see the right list length
        this._placementCorrect = 0;
        this._placementTotal = 0;
        this._placementTarget = 12;
        this._placementDone = false;
        this._levels = ['A1', 'A2', 'B1', 'B2'];
        this._preList = null;
        // Force key so analytics session is 'placement'
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

        var picked = [];
        var perTier = Math.max(2, Math.ceil(this._placementTarget / levels.length));
        for (var li = 0; li < levels.length && picked.length < this._placementTarget; li++) {
            var tier = levels[li];
            var pool = list.filter(function (item) {
                return item && item.tags && item.tags.indexOf(tier) !== -1;
            });
            // shuffle sample
            pool = pool.slice().sort(function () { return Math.random() - 0.5; });
            for (var j = 0; j < pool.length && j < perTier && picked.length < this._placementTarget; j++) {
                picked.push(pool[j]);
            }
        }
        if (picked.length < 4) {
            picked = list.slice().sort(function () { return Math.random() - 0.5; }).slice(0, this._placementTarget);
        }
        this.list = picked;
        this._levels = levels;
    }

    // Override analytics/FSRS hooks
    score(pts, wordId, meta) {
        this._placementCorrect++;
        this._placementTotal++;
        meta = Object.assign({}, meta || {}, { applyMemory: false, skipMemory: true, skipTutor: true });
        // Do not call super.score (would award points + memory path) — recordAttempt only if needed for telemetry without memory
        if (app.analytics) {
            var wId = wordId != null ? wordId : (this.list[this.i] && this.list[this.i].id);
            app.analytics.recordAttempt(wId, 'placement', true, meta);
        }
        this._maybeFinish();
    }

    miss(wordId, meta) {
        this._placementTotal++;
        meta = Object.assign({}, meta || {}, { applyMemory: false, skipMemory: true, skipTutor: true });
        if (app.analytics) {
            var wId = wordId != null ? wordId : (this.list[this.i] && this.list[this.i].id);
            app.analytics.recordAttempt(wId, 'placement', false, meta);
        }
        this._maybeFinish();
    }

    async check(btn, isCorrect) {
        // Clone Quiz.check but route score/miss through our overrides and stop at target count
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
            self.i = (self.i + 1) % Math.max(1, self.list.length);
            self.update();
        }, 900);
    }

    _maybeFinish() {
        if (this._placementDone) return;
        if (this._placementTotal < this._placementTarget) return;
        this._placementDone = true;
        var rate = this._placementTotal > 0 ? this._placementCorrect / this._placementTotal : 0;
        var levels = this._levels || ['A1', 'A2', 'B1', 'B2', 'C1'];
        // Map accuracy to tier index (higher accuracy → higher tier)
        var idx = 0;
        if (rate >= 0.9) idx = Math.min(levels.length - 1, 3);
        else if (rate >= 0.75) idx = Math.min(levels.length - 1, 2);
        else if (rate >= 0.55) idx = Math.min(levels.length - 1, 1);
        else idx = 0;
        var tier = levels[idx];
        try {
            if (app.learningPath) {
                var p = app.learningPath.getProfile();
                p.placementStatus = 'done';
                p.pathMode = 'guided';
                p.currentTier = tier;
                p.currentUnitId = null;
                app.learningPath.ensureUnit(0);
                app.learningPath.saveLocal();
                app.learningPath.flush();
            }
        } catch (e) {
            L('[Placement] finish failed', e);
        }
        if (app.ui && app.ui.showToast) {
            app.ui.showToast('Placement complete · starting at ' + tier + ' (' + Math.round(rate * 100) + '% correct)', 'success');
        }
        var self = this;
        setTimeout(function () {
            if (app.goHome) app.goHome(false);
        }, 1200);
    }

    update() {
        if (this._placementDone) return;
        // Header badge
        Quiz.prototype.update.call(this);
        try {
            var h = this.root.querySelector('#qz-header');
            if (h) {
                var bar = document.createElement('div');
                bar.className = 'text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest px-2 py-1';
                bar.textContent = 'Placement ' + this._placementTotal + '/' + this._placementTarget + ' · no effect on review schedule';
                if (!this.root.querySelector('#placement-badge')) {
                    bar.id = 'placement-badge';
                    h.parentNode.insertBefore(bar, h.nextSibling);
                } else {
                    this.root.querySelector('#placement-badge').textContent = bar.textContent;
                }
            }
        } catch (_) {}
    }
}

window.Placement = Placement;
