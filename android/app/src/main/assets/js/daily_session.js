/* js/daily_session.js
 *
 * DailySessionService — compose a finite Today plan and run steps with
 * score/miss wrapping for step completion.
 *
 * Depends on: app.data, app.memory, game constructors (Quiz, TF, …), L().
 * Multi-script: window.DailySessionService + pure helpers for unit tests.
 *
 * PR5: compose/buildPlan, attachController, onGraded → memory.review with
 * _ownsMemoryReviews so PR3b analytics hook skips; Again reinsert once;
 * complete/abandon → finalizeSessionHolds + endReviewSession.
 *
 * PR8: multi-mode plan (Flash present / Quiz / TF / optional Dictation / AI
 * Story); launch AI steps with sessionSeedWordIds; AI ends on questions
 * complete or Skip; no Story auto-memory.
 */

var DAILY_SESSION_LS_KEY = 'vm_daily_session_v1';

/** Intensity presets — compose() resolves active defaults from prefs.sessionIntensity */
var SESSION_INTENSITY_PRESETS = Object.freeze({
    casual: Object.freeze({
        targetTotal: 15,
        maxNew: 5,
        maxDue: 12,
        preferDueRatio: 0.7,
        includeAiBlock: true,
        aiBlock: 'story',
        aiWordCount: 4,
        reinsertLapses: true,
        estimatedMinutes: 8,
        backlogCopy: 'catch_up_cap'
    }),
    cram: Object.freeze({
        targetTotal: 25,
        maxNew: 8,
        maxDue: 20,
        preferDueRatio: 0.75,
        includeAiBlock: true,
        aiBlock: 'story',
        aiWordCount: 4,
        reinsertLapses: true,
        estimatedMinutes: 15,
        backlogCopy: 'catch_up_cap'
    })
});

/** Back-compat alias: SESSION_DEFAULTS === casual preset */
var SESSION_DEFAULTS = SESSION_INTENSITY_PRESETS.casual;

/**
 * Runtime defaults for compose/buildPlan from prefs.sessionIntensity.
 * Default intensity = casual (15/5/12) when intensity not yet set.
 * @param {object|null|undefined} prefs
 * @returns {object}
 */
function getSessionDefaults(prefs) {
    var key = (prefs && prefs.sessionIntensity) === 'cram' ? 'cram' : 'casual';
    var base = SESSION_INTENSITY_PRESETS[key] || SESSION_INTENSITY_PRESETS.casual;
    // Shallow copy so callers can override without mutating frozen preset
    return {
        targetTotal: base.targetTotal,
        maxNew: base.maxNew,
        maxDue: base.maxDue,
        preferDueRatio: base.preferDueRatio,
        includeAiBlock: base.includeAiBlock,
        aiBlock: base.aiBlock,
        aiWordCount: base.aiWordCount,
        reinsertLapses: base.reinsertLapses,
        estimatedMinutes: base.estimatedMinutes,
        backlogCopy: base.backlogCopy,
        includeDictation: !!(prefs && prefs.includeDictation)
    };
}

/**
 * Deterministic plan builder (design §2.2.1).
 * @param {Array<{id:number}>} newItems length ≤ maxNew, stable order
 * @param {Array<{id:number}>} due length ≤ maxDue, selection order
 * @param {object} d session defaults (getSessionDefaults result)
 * @returns {Array<object>} PlanStep[]
 */
function buildPlan(newItems, due, d) {
    var steps = [];
    var newIds = (newItems || []).map(function (w) { return Number(w.id != null ? w.id : w); })
        .filter(function (id) { return Number.isFinite(id); });
    var dueIds = (due || []).map(function (w) { return Number(w.id != null ? w.id : w.wordId != null ? w.wordId : w); })
        .filter(function (id) { return Number.isFinite(id); });

    d = d || SESSION_DEFAULTS;

    // --- New segment: Flash present (if any new) then Quiz for same new ids ---
    if (newIds.length > 0) {
        steps.push({ type: 'present', mode: 'flash', wordIds: newIds.slice(), purpose: 'new' });
        steps.push({ type: 'drill', mode: 'quiz', wordIds: newIds.slice(), purpose: 'new' });
    }

    // --- Due segment: Quiz 70% then TF 30% (by count, ceil quiz) ---
    // Multi-mode when not quizOnly (compose uses buildQuizOnlyPlan for quizOnly).
    if (dueIds.length > 0) {
        var nQuiz = Math.ceil(dueIds.length * 0.7);
        var quizDue = dueIds.slice(0, nQuiz);
        var tfDue = dueIds.slice(nQuiz);
        if (quizDue.length) {
            steps.push({ type: 'drill', mode: 'quiz', wordIds: quizDue, purpose: 'review' });
        }
        if (tfDue.length) {
            steps.push({ type: 'drill', mode: 'tf', wordIds: tfDue, purpose: 'review' });
        }
    }

    // --- Listening spice (default OFF; enable only if d.includeDictation) ---
    // Up to 2 ids from end of due (prefer), else new — not a separate pool.
    if (d.includeDictation) {
        var dictSource = dueIds.length ? dueIds : newIds;
        var dictIds = dictSource.slice(Math.max(0, dictSource.length - 2));
        if (dictIds.length) {
            steps.push({
                type: 'drill',
                mode: 'dictation',
                wordIds: dictIds.slice(),
                purpose: 'review'
            });
        }
    }

    // --- AI block: first min(aiWordCount, due+new) ids preferring due then new ---
    if (d.includeAiBlock && d.aiBlock === 'story') {
        var seed = dueIds.concat(newIds).slice(0, d.aiWordCount || 4);
        if (seed.length > 0) {
            steps.push({ type: 'ai', mode: 'story', wordIds: seed });
        }
    }

    steps.push({ type: 'complete' });
    return steps;
}

/**
 * Build a Quiz-only plan (acceptance / debug). No flash, tf, or AI.
 * @param {number[]} wordIds
 * @param {'new'|'review'} [purpose]
 * @returns {Array<object>}
 */
function buildQuizOnlyPlan(wordIds, purpose) {
    var ids = (wordIds || []).map(Number).filter(function (id) { return Number.isFinite(id); });
    var steps = [];
    if (ids.length > 0) {
        steps.push({
            type: 'drill',
            mode: 'quiz',
            wordIds: ids.slice(),
            purpose: purpose || 'review'
        });
    }
    steps.push({ type: 'complete' });
    return steps;
}

function _dailySessionTodayKey() {
    try {
        if (typeof app !== 'undefined' && app && app.data && typeof app.data.getTodayKey === 'function') {
            return app.data.getTodayKey();
        }
    } catch (_) { /* ignore */ }
    var d = new Date();
    var offset = d.getTimezoneOffset() * 60000;
    return (new Date(d - offset)).toISOString().slice(0, 10);
}

function _resolveUidForSession() {
    try {
        if (typeof auth !== 'undefined' && auth && auth.currentUser) return auth.currentUser.uid;
    } catch (_) { /* ignore */ }
    try {
        if (typeof app !== 'undefined' && app && app.auth && app.auth.currentUser) {
            return app.auth.currentUser.uid;
        }
    } catch (_) { /* ignore */ }
    return null;
}

/**
 * Map wordIds → vocab objects from data lists.
 * @param {number[]} wordIds
 * @returns {Array}
 */
function wordsFromIds(wordIds) {
    var ids = (wordIds || []).map(Number).filter(function (id) { return Number.isFinite(id); });
    var byId = new Map();
    var sources = [];
    try {
        if (typeof app !== 'undefined' && app && app.data) {
            if (app.data.list && app.data.list.length) sources.push(app.data.list);
            if (app.data.activeList && app.data.activeList.length) sources.push(app.data.activeList);
            try {
                var filtered = app.data.getFilteredList && app.data.getFilteredList();
                if (filtered && filtered.length) sources.push(filtered);
            } catch (_) { /* ignore */ }
        }
    } catch (_) { /* ignore */ }

    for (var s = 0; s < sources.length; s++) {
        var list = sources[s];
        for (var i = 0; i < list.length; i++) {
            var w = list[i];
            if (!w || w.id == null) continue;
            var id = Number(w.id);
            if (!byId.has(id)) byId.set(id, w);
        }
    }

    var out = [];
    for (var j = 0; j < ids.length; j++) {
        var vid = ids[j];
        if (byId.has(vid)) out.push(byId.get(vid));
        else out.push({ id: vid }); // minimal stub so list length still works
    }
    return out;
}

/**
 * Modes where miss is intermediate (user stays on card until correct).
 * Terminal grade = eventual score. Defer resolve/reinsert/FSRS until then.
 */
var MULTI_ATTEMPT_MODES = { quiz: true, dictation: true };

/**
 * Modes where miss must not alone resolve the word for step completion
 * (Match: success-only resolve per §2.4.3).
 */
var RESOLVE_ON_SUCCESS_ONLY = { match: true };

class DailySessionService {
    constructor() {
        /** When true, PR3b analytics hook skips memory.review; controller onGraded calls it. */
        this._ownsMemoryReviews = false;
        /**
         * Canonical plan status for RTDB / orphan-hold recovery.
         * Pause keeps 'active' (with pausedAt) so MemoryService does not finalize holds.
         * @type {'idle'|'active'|'completed'|'abandoned'}
         */
        this.status = 'idle';
        /** UI pause flag — true after Home mid-session; status remains 'active'. */
        this._uiPaused = false;
        this.pausedAt = null;
        this.plan = null;
        this.cursor = 0;
        this.defaults = null;
        this.intensity = 'casual';
        this.dateKey = null;
        this.stats = { correct: 0, incorrect: 0, againCount: 0, stepsDone: 0 };
        /** @type {object|null} live step runner state */
        this._step = null;
        this._game = null;
        this._finishing = false;
        this._startedAt = null;
        this._updatedAt = null;
        /** Bumped to cancel in-flight waitAndNav after reinsert / step end. */
        this._navGen = 0;
        /**
         * One-shot: next waitAndNav no-ops (Quiz calls score() then waitAndNav;
         * reinsert inside score must suppress that post-score auto-nav).
         */
        this._suppressNextWaitAndNav = false;
    }

    /** @returns {boolean} true while plan is live (including UI-paused). */
    get isActive() {
        return this.status === 'active';
    }

    /** @returns {boolean} true when user left mid-session but plan is still active. */
    get isPaused() {
        return this.status === 'active' && !!this._uiPaused;
    }

    /**
     * Compose selection + buildPlan → { steps, newItems, due, defaults, intensity }.
     * Options:
     *   - quizOnly + wordIds: force Quiz-only plan (acceptance / debug)
     *   - steps: prebuilt steps
     *   - newItems / due: force selection arrays
     *   - defaults: override intensity defaults
     *   - includeAiBlock: override
     * @param {object} [options]
     * @returns {{steps:Array, newItems:Array, due:Array, defaults:object, intensity:string}}
     */
    compose(options) {
        options = options || {};
        var prefs = (typeof app !== 'undefined' && app && app.store && app.store.prefs)
            ? app.store.prefs
            : {};
        var d = options.defaults
            ? Object.assign({}, getSessionDefaults(prefs), options.defaults)
            : getSessionDefaults(prefs);

        if (options.includeAiBlock != null) d.includeAiBlock = !!options.includeAiBlock;
        if (options.includeDictation != null) d.includeDictation = !!options.includeDictation;
        if (options.quizOnly) {
            // Quiz-only plans: no Flash/TF/Dictation/AI (buildQuizOnlyPlan or stripped flags)
            d.includeAiBlock = false;
            d.includeDictation = false;
        }

        var intensity = (prefs && prefs.sessionIntensity) === 'cram' ? 'cram' : 'casual';
        if (options.intensity === 'cram' || options.intensity === 'casual') {
            intensity = options.intensity;
            d = Object.assign({}, getSessionDefaults({ sessionIntensity: intensity }), options.defaults || {});
            if (options.quizOnly) {
                d.includeAiBlock = false;
                d.includeDictation = false;
            }
            if (options.includeAiBlock != null) d.includeAiBlock = !!options.includeAiBlock;
            if (options.includeDictation != null) d.includeDictation = !!options.includeDictation;
        }

        // Prebuilt steps win
        if (options.steps && options.steps.length) {
            return {
                steps: options.steps.slice(),
                newItems: options.newItems || [],
                due: options.due || [],
                defaults: d,
                intensity: intensity
            };
        }

        // Explicit word list → quiz-only plan (debug / acceptance)
        if (options.wordIds && options.wordIds.length) {
            var purpose = options.purpose || 'review';
            var steps = options.quizOnly !== false
                ? buildQuizOnlyPlan(options.wordIds, purpose)
                : buildPlan([], options.wordIds.map(function (id) { return { id: Number(id) }; }), d);
            return {
                steps: steps,
                newItems: [],
                due: options.wordIds.map(function (id) { return { id: Number(id) }; }),
                defaults: d,
                intensity: intensity
            };
        }

        var pool = [];
        try {
            if (typeof app !== 'undefined' && app && app.data) {
                pool = app.data.getFilteredList ? app.data.getFilteredList() : (app.data.list || []);
                if (!pool || !pool.length) pool = app.data.list || [];
            }
        } catch (_) {
            pool = [];
        }

        var now = options.now != null ? options.now : Date.now();
        var dueCards = options.due || null;
        var newItems = options.newItems || null;
        var mem = (typeof app !== 'undefined' && app) ? app.memory : null;

        if (!dueCards && mem && typeof mem.getDueCards === 'function') {
            var filteredIds = new Set();
            for (var i = 0; i < pool.length; i++) {
                if (pool[i] && pool[i].id != null) filteredIds.add(Number(pool[i].id));
            }
            var cards = mem.getDueCards(now, {
                limit: d.maxDue,
                filterFn: function (card) {
                    if (!card) return false;
                    return filteredIds.has(Number(card.wordId));
                }
            });
            // Map cards → vocab
            dueCards = [];
            var byId = new Map();
            for (var p = 0; p < pool.length; p++) {
                if (pool[p] && pool[p].id != null) byId.set(Number(pool[p].id), pool[p]);
            }
            for (var c = 0; c < (cards || []).length; c++) {
                var card = cards[c];
                var vocab = byId.get(Number(card.wordId));
                if (vocab) dueCards.push(vocab);
                else dueCards.push({ id: Number(card.wordId) });
            }
        }
        if (!dueCards) dueCards = [];

        if (!newItems && mem && typeof mem.getNewCandidates === 'function') {
            newItems = mem.getNewCandidates(pool, { limit: d.maxNew }) || [];
        }
        if (!newItems) newItems = [];

        // Cap new so total preference is soft (due already limited by maxDue)
        if (newItems.length > d.maxNew) newItems = newItems.slice(0, d.maxNew);

        var planSteps = buildPlan(newItems, dueCards, d);
        return {
            steps: planSteps,
            newItems: newItems,
            due: dueCards,
            defaults: d,
            intensity: intensity
        };
    }

    /** Pure alias for tests / external callers. */
    buildPlan(newItems, due, d) {
        return buildPlan(newItems, due, d);
    }

    /**
     * Start a new Daily Session.
     * Temporary debug: app.dailySession.start({ wordIds: [1,2,3], quizOnly: true })
     * If a live/paused plan exists, refuses unless options.force (then abandon first).
     * @param {object} [options]
     * @returns {Promise<{ok:boolean, reason?:string, plan?:object}>}
     */
    async start(options) {
        options = options || {};

        // In-memory live session (including UI-paused active plan)
        if (this.status === 'active' && this.plan && !options.force) {
            var why = this._uiPaused ? 'paused-use-continue' : 'already-active';
            L('[DailySession] start blocked:', why, '— use continue() or force:true');
            return { ok: false, reason: why, plan: this.plan };
        }

        // Persisted plan for today (process restart / second start without force)
        if (!options.force) {
            var existing = await this._loadPersistedPlan();
            if (existing && existing.plan && existing.plan.steps &&
                existing.status !== 'completed' && existing.status !== 'abandoned') {
                L('[DailySession] start blocked: existing-session — use continue() or force:true');
                return {
                    ok: false,
                    reason: 'existing-session',
                    plan: existing.plan,
                    suggest: 'continue'
                };
            }
        }

        // force: finalize prior holds so they are not orphaned across sessions
        if (options.force) {
            await this._finalizePreviousSessionBeforeStart();
        }

        var composed = this.compose(options);
        var steps = composed.steps || [];
        // Empty drills only → complete immediately
        var hasWork = steps.some(function (s) {
            return s && s.type !== 'complete' && s.wordIds && s.wordIds.length;
        });
        if (!hasWork && !options.allowEmpty) {
            L('[DailySession] no words for plan');
            try {
                if (typeof app !== 'undefined' && app && app.ui && app.ui.showToast) {
                    app.ui.showToast('No words due — adjust filters or add vocabulary', 'warning');
                }
            } catch (_) { /* ignore */ }
            return { ok: false, reason: 'empty-plan', plan: { steps: steps } };
        }

        this.plan = {
            steps: steps,
            intensity: composed.intensity,
            defaults: composed.defaults,
            newIds: (composed.newItems || []).map(function (w) { return Number(w.id); }),
            dueIds: (composed.due || []).map(function (w) { return Number(w.id != null ? w.id : w.wordId); }),
            createdAt: Date.now()
        };
        this.defaults = composed.defaults;
        this.intensity = composed.intensity;
        this.cursor = 0;
        this.stats = { correct: 0, incorrect: 0, againCount: 0, stepsDone: 0 };
        this.status = 'active';
        this._uiPaused = false;
        this.pausedAt = null;
        this.dateKey = _dailySessionTodayKey();
        this._startedAt = Date.now();
        this._updatedAt = this._startedAt;
        this._finishing = false;
        this._step = null;
        this._ownsMemoryReviews = false;
        this._navGen = 0;
        this._suppressNextWaitAndNav = false;

        await this._persistPlan();
        L('[DailySession] start', this.plan.steps.length, 'steps', 'intensity=', this.intensity);

        await this._launchStepAtCursor();
        return { ok: true, plan: this.plan };
    }

    /**
     * Continue a paused session (or active after reload).
     * Prefers RTDB plan when online; falls back to localStorage.
     */
    async continue() {
        if (this.status === 'active' && this._game && !this._uiPaused) {
            L('[DailySession] already running');
            return { ok: true, plan: this.plan };
        }

        var loaded = await this._loadPersistedPlan();
        if (!loaded || !loaded.plan || !loaded.plan.steps) {
            // In-memory paused plan without reload
            if (this.status === 'active' && this.plan && this._uiPaused) {
                loaded = this._planPayload();
            } else {
                return { ok: false, reason: 'no-saved-plan' };
            }
        }
        if (loaded.status === 'completed' || loaded.status === 'abandoned') {
            return { ok: false, reason: 'session-' + loaded.status };
        }
        // Accept 'active' (canonical pause) and legacy 'paused' rows
        if (loaded.status && loaded.status !== 'active' && loaded.status !== 'paused') {
            return { ok: false, reason: 'session-' + loaded.status };
        }

        this.plan = loaded.plan;
        this.cursor = loaded.cursor || 0;
        this.defaults = (loaded.plan && loaded.plan.defaults) || getSessionDefaults(
            (typeof app !== 'undefined' && app && app.store) ? app.store.prefs : {}
        );
        this.intensity = loaded.plan.intensity || 'casual';
        this.stats = loaded.stats || this.stats;
        this.dateKey = loaded.dateKey || _dailySessionTodayKey();
        this.status = 'active';
        this._uiPaused = false;
        this.pausedAt = null;
        this._finishing = false;

        // Restore step meta for partial step if present
        var savedStep = loaded.stepMeta || null;
        await this._launchStepAtCursor(savedStep);
        return { ok: true, plan: this.plan };
    }

    /**
     * Progress snapshot for UI / tests.
     * @returns {object}
     */
    getProgress() {
        var steps = (this.plan && this.plan.steps) || [];
        var workSteps = steps.filter(function (s) { return s && s.type !== 'complete'; });
        var resolvedInStep = 0;
        var pendingInStep = 0;
        if (this._step) {
            resolvedInStep = this._step.resolvedWordIds ? this._step.resolvedWordIds.size : 0;
            pendingInStep = this._step.pendingWordIds ? this._step.pendingWordIds.size : 0;
        }
        return {
            status: this.status,
            paused: this.isPaused,
            pausedAt: this.pausedAt,
            stepIndex: this.cursor,
            stepsTotal: workSteps.length,
            resolvedInStep: resolvedInStep,
            pendingInStep: pendingInStep,
            plan: this.plan,
            stats: Object.assign({}, this.stats),
            intensity: this.intensity
        };
    }

    /**
     * Wrap game.score / game.miss / waitAndNav → onGraded; set _ownsMemoryReviews.
     * @param {object} game GameMode instance
     * @param {object} stepMeta
     */
    attachController(game, stepMeta) {
        if (!game) return;
        var self = this;
        this._game = game;
        this._uiPaused = false;
        // Never carry suppress across step boundaries (Issue 7)
        this._suppressNextWaitAndNav = false;

        var wordIds = (stepMeta && stepMeta.wordIds) || [];
        var purpose = (stepMeta && stepMeta.purpose) || 'review';
        var mode = (stepMeta && stepMeta.mode) || game.key || 'quiz';
        var type = (stepMeta && stepMeta.type) || 'drill';

        // AI steps: no auto-memory (Story/Grammar not on allowlist path via controller)
        this._ownsMemoryReviews = type !== 'ai';

        // Restore or init step state
        var resolved = new Set();
        if (stepMeta && stepMeta.resolvedWordIds) {
            (stepMeta.resolvedWordIds || []).forEach(function (id) { resolved.add(Number(id)); });
        }
        var reinsertQueue = (stepMeta && stepMeta.reinsertQueue)
            ? stepMeta.reinsertQueue.map(Number)
            : [];
        var reinsertCount = new Map();
        if (stepMeta && stepMeta.reinsertCount) {
            Object.keys(stepMeta.reinsertCount).forEach(function (k) {
                reinsertCount.set(Number(k), Number(stepMeta.reinsertCount[k]) || 0);
            });
        }
        var hadMiss = new Set();
        if (stepMeta && stepMeta.hadMiss) {
            (stepMeta.hadMiss || []).forEach(function (id) { hadMiss.add(Number(id)); });
        }

        var pending = new Set();
        wordIds.forEach(function (id) {
            var n = Number(id);
            if (!resolved.has(n)) pending.add(n);
        });
        // If we were mid-reinsert pass, pending may be reinsert set
        if (stepMeta && stepMeta.pendingWordIds && stepMeta.pendingWordIds.length) {
            pending = new Set(stepMeta.pendingWordIds.map(Number));
        }

        this._step = {
            wordIds: wordIds.map(Number),
            purpose: purpose,
            mode: mode,
            type: type,
            resolvedWordIds: resolved,
            reinsertQueue: reinsertQueue,
            reinsertCount: reinsertCount,
            pendingWordIds: pending,
            hadMiss: hadMiss,
            shownWordIds: new Set(
                (stepMeta && stepMeta.shownWordIds) ? stepMeta.shownWordIds.map(Number) : []
            ),
            reinsertLapses: this.defaults
                ? this.defaults.reinsertLapses !== false
                : true
        };

        // Prefer linear order during session
        try {
            if (typeof app !== 'undefined' && app && app.store && app.store.prefs) {
                game._sessionRandomPrev = app.store.prefs[mode + 'Random'];
                app.store.prefs[mode + 'Random'] = false;
            }
        } catch (_) { /* ignore */ }

        // Cancel token for waitAndNav race (Issue 1)
        this._navGen = (this._navGen || 0) + 1;
        var attachedGen = this._navGen;
        game._sessionNavGen = attachedGen;

        // AI steps: no grade→memory; completion = questions done or Skip
        if (type === 'ai') {
            game.skipDailySessionStep = function () {
                self.finishStep();
            };
            self._attachAiStepHooks(game, mode, wordIds);
            L('[DailySession] attachController AI', mode, 'seed=', wordIds.length);
            return;
        }

        var origScore = game.score.bind(game);
        game.score = function (pts, wordId) {
            origScore(pts, wordId);
            var id = wordId != null ? wordId : (game.list && game.list[game.i] ? game.list[game.i].id : null);
            if (id != null) self.onGraded(id, true);
        };
        var origMiss = game.miss.bind(game);
        game.miss = function (wordId) {
            origMiss(wordId);
            var id = wordId != null ? wordId : (game.list && game.list[game.i] ? game.list[game.i].id : null);
            if (id != null) self.onGraded(id, false);
        };

        // Replace waitAndNav with cancelable version (raw setTimeout in GameMode is not clearable)
        self._installCancelableWaitAndNav(game, attachedGen);

        // Present/Flash: track shown cards via introduce + nav override
        if (type === 'present' || mode === 'flash') {
            self._attachPresentHooks(game);
        }

        L('[DailySession] attachController', mode, 'words=', wordIds.length, 'pending=', pending.size);
    }

    /**
     * Session-path grade handler.
     * Quiz multi-attempt: intermediate miss defers FSRS/resolve/reinsert until terminal correct.
     * Match: miss does not resolve; only score resolves (§2.4.3).
     * @param {number|string} wordId
     * @param {boolean} correct
     */
    onGraded(wordId, correct) {
        if (!this._step || this._finishing) return;
        // AI steps never auto-FSRS; completion is questions/Skip only
        if (this._step.type === 'ai') return;
        var id = Number(wordId);
        if (!Number.isFinite(id)) return;

        var step = this._step;
        var mode = step.mode || 'quiz';
        var multiAttempt = !!MULTI_ATTEMPT_MODES[mode];
        var successOnly = !!RESOLVE_ON_SUCCESS_ONLY[mode];

        // --- Intermediate miss (Quiz/Dictation): defer resolve/reinsert/FSRS ---
        if (multiAttempt && !correct) {
            if (!step.hadMiss) step.hadMiss = new Set();
            step.hadMiss.add(id);
            this.stats.incorrect++;
            this._updatedAt = Date.now();
            this._persistPlanDebounced();
            // Stay on card; no maybeFinishStep
            return;
        }

        // --- Match miss: analytics/memory/reinsert but do not resolve ---
        if (successOnly && !correct) {
            this.stats.incorrect++;
            this._applyMemoryReview(id, 1, mode);
            this._queueReinsert(step, id);
            this._updatedAt = Date.now();
            this._persistPlanDebounced();
            // do not resolve; do not maybeFinishStep from miss alone
            return;
        }

        // --- Terminal grade ---
        var recovered = multiAttempt && correct && step.hadMiss && step.hadMiss.has(id);
        // Quiz recovered after miss: single Again + reinsert once (no double FSRS)
        // Clean correct: Good. Terminal miss (TF etc.): Again + reinsert.
        var rating;
        var treatAsAgain = false;
        if (correct) {
            if (recovered) {
                rating = 1; // Again — single FSRS for the card cycle
                treatAsAgain = true;
            } else {
                rating = 3; // Good
            }
            this.stats.correct++;
        } else {
            rating = 1;
            treatAsAgain = true;
            this.stats.incorrect++;
        }

        this._applyMemoryReview(id, rating, mode);

        // Resolve for step completion
        step.resolvedWordIds.add(id);
        step.pendingWordIds.delete(id);
        if (step.hadMiss) step.hadMiss.delete(id);

        // Again / recovered-as-Again: reinsert once max
        if (treatAsAgain && step.reinsertLapses) {
            this._queueReinsert(step, id);
        }

        this._updatedAt = Date.now();
        this._persistPlanDebounced();
        this.maybeFinishStep();
    }

    _applyMemoryReview(wordId, rating, mode) {
        if (typeof window === 'undefined' || !window.MEMORY_ENGINE_ENABLED) return;
        try {
            var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
            if (mem && typeof mem.review === 'function' && !mem._isStub) {
                mem.review(wordId, rating, mode, Date.now());
            }
        } catch (e) {
            L('[DailySession] memory.review failed', e);
        }
    }

    _queueReinsert(step, id) {
        if (!step || !step.reinsertLapses) return;
        var prev = step.reinsertCount.get(id) || 0;
        if (prev >= 1) return;
        step.reinsertCount.set(id, prev + 1);
        if (step.reinsertQueue.indexOf(id) === -1) {
            step.reinsertQueue.push(id);
            this.stats.againCount++;
            L('[DailySession] reinsert queued', id);
        }
    }

    /**
     * If all original wordIds resolved and reinsertQueue empty → finishStep.
     * If reinsertQueue non-empty after originals done → apply reinsert pass once.
     */
    maybeFinishStep() {
        if (!this._step || this._finishing) return;
        var step = this._step;
        if (step.type === 'present' || step.mode === 'flash') {
            // Present completion handled by present hooks
            return;
        }
        if (step.type === 'ai') {
            // AI completion via skip / mode-specific (not auto on grade)
            return;
        }

        // All original wordIds resolved?
        var allResolved = true;
        for (var i = 0; i < step.wordIds.length; i++) {
            if (!step.resolvedWordIds.has(Number(step.wordIds[i]))) {
                allResolved = false;
                break;
            }
        }
        // Also require pending empty (reinsert pass pending)
        if (!allResolved && step.pendingWordIds.size > 0) return;
        if (!allResolved) return;

        if (step.reinsertQueue.length > 0) {
            this._applyReinsertPass();
            return;
        }

        // pending empty and no reinsert
        if (step.pendingWordIds.size === 0) {
            this.finishStep();
        }
    }

    /**
     * Reinsert Again words once: suppress post-score waitAndNav, repoint list index.
     *
     * Quiz order is score() then waitAndNav(). Reinsert runs *inside* score(), so
     * canceling by gen alone fails — check() still schedules a *new* waitAndNav with
     * the post-reinstall gen. One-shot _suppressNextWaitAndNav covers that call.
     */
    _applyReinsertPass() {
        var step = this._step;
        if (!step || !step.reinsertQueue.length) return;
        var ids = step.reinsertQueue.slice();
        step.reinsertQueue = [];
        step.pendingWordIds = new Set(ids);
        // Keep resolved of originals; reinsert words will be graded again but
        // reinsertCount already ≥1 so they will not re-queue.
        if (step.hadMiss) {
            ids.forEach(function (id) { step.hadMiss.delete(id); });
        }

        // Issue 1: cancel any prior in-flight waitAndNav + suppress the one Quiz
        // will call immediately after this score() returns.
        this._cancelPendingNav();
        this._suppressNextWaitAndNav = true;

        var words = wordsFromIds(ids);
        try {
            if (typeof app !== 'undefined' && app && app.data) {
                app.data.startSpecificReview(words);
            }
        } catch (_) { /* ignore */ }

        var game = this._game;
        if (game) {
            game.list = words;
            game.i = 0;
            game.answered = false;
            game.busy = false;
            game.hasMissed = false;
            // Keep cancelable waitAndNav (same gen after cancel bump)
            this._installCancelableWaitAndNav(game, this._navGen);
            try {
                if (typeof game.update === 'function') game.update();
                else if (typeof game.render === 'function') game.render();
            } catch (e) {
                L('[DailySession] reinsert render failed; restarting mode', e);
                this._restartCurrentStepWithWords(ids);
            }
        } else {
            this._restartCurrentStepWithWords(ids);
        }
        L('[DailySession] reinsert pass', ids, 'suppressNextWaitAndNav=true');
        this._persistPlanDebounced();
    }

    /**
     * Bump nav generation so in-flight waitAndNav resolves but no-ops (does not nav).
     * Do not clearTimeout those timers without resolving — that hangs the Promise.
     */
    _cancelPendingNav() {
        this._navGen = (this._navGen || 0) + 1;
        var game = this._game;
        if (!game) return;
        game._sessionNavGen = this._navGen;
        try {
            if (typeof app !== 'undefined' && app && app.audio && typeof app.audio.cancel === 'function') {
                app.audio.cancel();
            }
        } catch (_) { /* ignore */ }
    }

    /**
     * Install waitAndNav that:
     * 1) one-shot suppresses post-reinsert auto-nav (Quiz score→waitAndNav order)
     * 2) respects _navGen so earlier in-flight waits no-op after cancel
     */
    _installCancelableWaitAndNav(game, genAtInstall) {
        if (!game) return;
        var self = this;
        var gen = genAtInstall != null ? genAtInstall : this._navGen;
        game._sessionNavGen = gen;
        game.waitAndNav = async function (audioPromise, fallbackDelay) {
            // One-shot after reinsert-triggering score: Quiz always calls waitAndNav
            // after score(); that must not advance off the first reinsert card.
            if (self._suppressNextWaitAndNav) {
                self._suppressNextWaitAndNav = false;
                game.busy = false;
                game.answered = false;
                L('[DailySession] waitAndNav suppressed (post-reinsert)');
                return;
            }

            var myGen = game._sessionNavGen;
            var wait = false;
            try {
                wait = !!(typeof app !== 'undefined' && app && app.store && app.store.prefs &&
                    app.store.prefs.audioWait);
            } catch (_) { /* ignore */ }
            try {
                if (wait && audioPromise) {
                    await audioPromise;
                } else {
                    var delay = fallbackDelay != null ? fallbackDelay : 1500;
                    await new Promise(function (resolve) {
                        var tid = setTimeout(resolve, delay);
                        if (!game.timeouts) game.timeouts = [];
                        game.timeouts.push(tid);
                    });
                }
            } catch (e) {
                L('[DailySession] waitAndNav audio error', e);
            }
            // Cancelled by reinsert / finishStep / destroy (in-flight only)
            if (self._navGen !== myGen || game._sessionNavGen !== myGen) return;
            if (self._finishing || !self._step || self._uiPaused) return;
            if (self.status !== 'active') return;
            // Defense: if reinsert pending list is showing and we somehow still
            // have suppress... already cleared. Stay put if list was just reset.
            game.busy = false;
            if (typeof game.nav === 'function') game.nav(1);
        };
    }

    _restartCurrentStepWithWords(ids) {
        var step = this._step;
        if (!step) return;
        // Preserve resolved / reinsert counts
        var meta = this._serializeStepMeta();
        meta.wordIds = (step.wordIds || []).slice();
        meta.pendingWordIds = ids.slice();
        meta.reinsertQueue = [];
        this._destroyGameSoft();
        this._startDrillOrPresent(step.type, step.mode, step.purpose, step.wordIds, meta);
    }

    /**
     * Finish current step; advance cursor or complete().
     */
    finishStep() {
        if (this._finishing) return;
        this._finishing = true;
        this.stats.stepsDone++;

        // Do NOT set _suppressNextWaitAndNav here — destroy() noops waitAndNav on
        // the finishing game; a leftover suppress would leak into the next step
        // and eat its first auto-nav (Issue 7). Suppress is reinsert-only.
        this._cancelPendingNav();
        this._destroyGameSoft();
        this._suppressNextWaitAndNav = false;
        this._ownsMemoryReviews = false;
        this._step = null;
        // Clear Story seed so free-play Story does not inherit session seeds
        try {
            if (typeof app !== 'undefined' && app) app._sessionStorySeedWordIds = null;
        } catch (_) { /* ignore */ }
        this.cursor++;
        this._updatedAt = Date.now();
        this._persistPlan(); // fire-and-forget ok

        var steps = (this.plan && this.plan.steps) || [];
        if (this.cursor >= steps.length) {
            this.complete();
            return;
        }
        var next = steps[this.cursor];
        if (!next || next.type === 'complete') {
            this.complete();
            return;
        }

        this._finishing = false;
        this._launchStepAtCursor();
    }

    /**
     * Pause: persist plan + step meta; flush memory holds (flags); do NOT finalize holds.
     * Keeps status === 'active' (with pausedAt) so Memory orphan-hold recovery leaves holds.
     */
    async pause() {
        if (this.status !== 'active') return;
        if (this._uiPaused) {
            // Idempotent re-pause (e.g. double goHome)
            this._updatedAt = Date.now();
            await this._persistPlan();
            return;
        }

        this._uiPaused = true;
        this.pausedAt = Date.now();
        // status stays 'active' — required for orphan-hold recovery (memory.js)
        this._cancelPendingNav();
        this._ownsMemoryReviews = false;
        this._destroyGameSoft();
        try {
            if (typeof app !== 'undefined' && app && app.data) {
                app.data.endReviewSession();
            }
        } catch (_) { /* ignore */ }

        // Flush dirty cards so sessionHold flags survive (do not finalize)
        try {
            var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
            if (mem && typeof mem.flush === 'function' && !mem._isStub) {
                await mem.flush();
            }
        } catch (e) {
            L('[DailySession] pause flush failed', e);
        }

        this._updatedAt = Date.now();
        await this._persistPlan();
        L('[DailySession] paused (status=active) at cursor', this.cursor);
    }

    /**
     * Complete session: finalizeSessionHolds, endReviewSession, persist stats.
     */
    async complete() {
        this._finishing = true;
        this.status = 'completed';
        this._uiPaused = false;
        this.pausedAt = null;
        this._cancelPendingNav();
        this._ownsMemoryReviews = false;
        this._destroyGameSoft();

        try {
            if (typeof app !== 'undefined' && app && app.data) {
                app.data.endReviewSession();
            }
        } catch (_) { /* ignore */ }

        try {
            var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
            if (mem && typeof mem.finalizeSessionHolds === 'function' && !mem._isStub) {
                mem.finalizeSessionHolds(Date.now());
                if (typeof mem.flush === 'function') await mem.flush();
            }
        } catch (e) {
            L('[DailySession] complete finalize failed', e);
        }

        this._updatedAt = Date.now();
        await this._persistPlan();

        L('[DailySession] completed', this.stats);
        try {
            if (typeof app !== 'undefined' && app && app.ui && app.ui.showToast) {
                var s = this.stats;
                app.ui.showToast(
                    'Session complete · ' + (s.correct || 0) + ' correct · ' + (s.incorrect || 0) + ' miss',
                    'success'
                );
            }
        } catch (_) { /* ignore */ }

        // Return home so UI is not stuck on destroyed game view
        try {
            if (typeof app !== 'undefined' && app && typeof app.goHome === 'function') {
                // Avoid re-entrant pause: status already completed
                app.goHome(false);
            }
        } catch (_) { /* ignore */ }
    }

    /**
     * Abandon: finalize holds, mark abandoned.
     */
    async abandon() {
        this._finishing = true;
        this.status = 'abandoned';
        this._uiPaused = false;
        this.pausedAt = null;
        this._cancelPendingNav();
        this._ownsMemoryReviews = false;
        this._destroyGameSoft();

        try {
            if (typeof app !== 'undefined' && app && app.data) {
                app.data.endReviewSession();
            }
        } catch (_) { /* ignore */ }

        try {
            var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
            if (mem && typeof mem.finalizeSessionHolds === 'function' && !mem._isStub) {
                mem.finalizeSessionHolds(Date.now());
                if (typeof mem.flush === 'function') await mem.flush();
            }
        } catch (e) {
            L('[DailySession] abandon finalize failed', e);
        }

        this._updatedAt = Date.now();
        await this._persistPlan();
        L('[DailySession] abandoned');
    }

    /**
     * Before force-start: abandon in-memory or persisted live plan so holds finalize.
     */
    async _finalizePreviousSessionBeforeStart() {
        // Load persisted into this if we only have local/RTDB state
        if (!(this.plan && this.status === 'active')) {
            var loaded = await this._loadPersistedPlan();
            if (loaded && loaded.plan &&
                loaded.status !== 'completed' && loaded.status !== 'abandoned') {
                this.plan = loaded.plan;
                this.cursor = loaded.cursor || 0;
                this.stats = loaded.stats || this.stats;
                this.dateKey = loaded.dateKey || _dailySessionTodayKey();
                this.status = 'active';
                this._step = null;
            }
        }
        if (this.status === 'active' && this.plan) {
            L('[DailySession] force start — abandoning previous plan to finalize holds');
            await this.abandon();
        } else {
            // No plan object but cards may still hold — finalize orphan holds anyway
            try {
                var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
                if (mem && typeof mem.finalizeSessionHolds === 'function' && !mem._isStub) {
                    mem.finalizeSessionHolds(Date.now());
                    if (typeof mem.flush === 'function') await mem.flush();
                }
            } catch (e) {
                L('[DailySession] force-start finalize orphan holds failed', e);
            }
        }
        // Reset so start() can rebuild
        this._finishing = false;
        this.status = 'idle';
        this.plan = null;
        this._step = null;
        this._uiPaused = false;
        this.pausedAt = null;
        this._ownsMemoryReviews = false;
    }

    // --- Internals ---

    async _launchStepAtCursor(savedStepMeta) {
        var steps = (this.plan && this.plan.steps) || [];
        if (this.cursor >= steps.length) {
            await this.complete();
            return;
        }
        var step = steps[this.cursor];
        if (!step || step.type === 'complete') {
            await this.complete();
            return;
        }

        var wordIds = (step.wordIds || []).map(Number);
        if ((!wordIds || !wordIds.length) && step.type !== 'complete') {
            // Skip empty step
            this.cursor++;
            return this._launchStepAtCursor();
        }

        this._finishing = false;

        if (step.type === 'ai') {
            await this._startAiStep(step.mode, wordIds, savedStepMeta);
            return;
        }

        await this._startDrillOrPresent(step.type, step.mode, step.purpose, wordIds, savedStepMeta);
    }

    /**
     * Launch AI step (Story v1). Seeds via sessionSeedWordIds; no auto-memory.
     * Ends on comprehension questions complete or Skip.
     */
    async _startAiStep(mode, wordIds, savedStepMeta) {
        // Clear review list so Story free-pick uses filtered list + seeds (not quiz list)
        try {
            if (typeof app !== 'undefined' && app && app.data && typeof app.data.endReviewSession === 'function') {
                app.data.endReviewSession();
            }
        } catch (_) { /* ignore */ }

        try {
            if (typeof app !== 'undefined' && app && app.game) {
                try { app.game.destroy(); } catch (_) { /* ignore */ }
                app.game = null;
            }
        } catch (_) { /* ignore */ }

        // Seed before construct — Story render starts async load immediately
        var seedIds = (wordIds || []).map(Number).filter(function (id) {
            return Number.isFinite(id);
        });
        try {
            if (typeof app !== 'undefined' && app) {
                app._sessionStorySeedWordIds = seedIds.slice();
            }
        } catch (_) { /* ignore */ }

        var game = this._constructMode(mode || 'story');
        if (!game) {
            L('[DailySession] AI mode unavailable — skipping step', mode);
            try {
                if (typeof app !== 'undefined' && app) app._sessionStorySeedWordIds = null;
            } catch (_) { /* ignore */ }
            this.cursor++;
            this.stats.stepsDone++;
            await this._persistPlan();
            return this._launchStepAtCursor();
        }

        // Also on instance (constructor may have already copied from app)
        game.sessionSeedWordIds = seedIds.slice();
        game.storiesPerSession = 1; // one story then session advances via finishStep

        try {
            if (typeof app !== 'undefined' && app) app.game = game;
        } catch (_) { /* ignore */ }

        var meta = savedStepMeta || {
            wordIds: wordIds,
            purpose: 'ai',
            mode: mode || 'story',
            type: 'ai'
        };
        meta.wordIds = meta.wordIds || wordIds;
        meta.mode = meta.mode || mode || 'story';
        meta.type = 'ai';

        this.attachController(game, meta);

        try {
            history.pushState({ view: 'game', mode: mode || 'story', index: 0, dailySession: true }, '');
        } catch (_) { /* ignore */ }

        this._updatedAt = Date.now();
        await this._persistPlan();
        L('[DailySession] AI step launched', mode, 'seed=', game.sessionSeedWordIds);
    }

    /**
     * Story (AI) completion hooks: finish when all questions answered; Skip button.
     * No memory.review for story comprehension grades.
     */
    _attachAiStepHooks(game, mode, wordIds) {
        var self = this;
        if (!game) return;

        // Prefer seeds on the instance (also set in _startAiStep before attach)
        if (wordIds && wordIds.length && !game.sessionSeedWordIds) {
            game.sessionSeedWordIds = wordIds.map(Number);
        }
        game.storiesPerSession = 1;

        if (mode === 'story' || game.key === 'story') {
            // When last comprehension question is answered, Story calls _showStoryNavFooter.
            // In session, that means the AI step is done — do not start another story.
            if (typeof game._showStoryNavFooter === 'function') {
                var origNavFooter = game._showStoryNavFooter.bind(game);
                game._showStoryNavFooter = function () {
                    if (self._finishing || !self._step || self._step.type !== 'ai') {
                        return origNavFooter();
                    }
                    L('[DailySession] Story questions complete → finish AI step');
                    // Brief "done" footer then advance
                    try {
                        if (game.dom && game.dom.footer) {
                            game.dom.footer.innerHTML =
                                '<div class="text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 py-3">' +
                                '<i class="ph-bold ph-check-circle mr-1"></i> Story complete</div>';
                        }
                    } catch (_) { /* ignore */ }
                    self.finishStep();
                };
            }

            // Block infinite next-story while session AI step is active
            if (typeof game._loadNext === 'function') {
                var origLoadNext = game._loadNext.bind(game);
                game._loadNext = function () {
                    if (self._step && self._step.type === 'ai' && !self._finishing) {
                        L('[DailySession] Story _loadNext during AI step → finish');
                        self.finishStep();
                        return;
                    }
                    return origLoadNext();
                };
            }
            if (typeof game._nextStory === 'function') {
                game._nextStory = function () {
                    if (self._step && self._step.type === 'ai' && !self._finishing) {
                        self.finishStep();
                        return;
                    }
                };
            }
        }

        // Inject Skip AI control (header strip or body) after first paint
        var injectSkip = function () {
            try {
                if (!game.root || self._finishing) return;
                if (game.root.querySelector('[data-daily-session-skip-ai]')) return;
                var bar = document.createElement('div');
                bar.setAttribute('data-daily-session-skip-ai', '1');
                bar.className = 'shrink-0 px-3 pt-1';
                bar.innerHTML =
                    '<button type="button" class="w-full py-2 rounded-xl text-xs font-bold ' +
                    'text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-800 ' +
                    'border border-slate-200 dark:border-neutral-700 active:scale-95 transition-transform">' +
                    '<i class="ph-bold ph-skip-forward mr-1"></i> Skip AI</button>';
                var btn = bar.querySelector('button');
                if (btn) {
                    btn.onclick = function () {
                        L('[DailySession] Skip AI tapped');
                        if (typeof game.skipDailySessionStep === 'function') {
                            game.skipDailySessionStep();
                        } else {
                            self.finishStep();
                        }
                    };
                }
                // Prefer top of story shell
                if (game.root.firstChild) {
                    game.root.insertBefore(bar, game.root.firstChild);
                } else {
                    game.root.appendChild(bar);
                }
            } catch (e) {
                L('[DailySession] Skip AI inject failed', e);
            }
        };
        // Constructor render is sync shell + async load — inject now and once more shortly
        injectSkip();
        setTimeout(injectSkip, 50);
        setTimeout(injectSkip, 400);
    }

    async _startDrillOrPresent(type, mode, purpose, wordIds, savedStepMeta) {
        var words = wordsFromIds(wordIds);
        try {
            if (typeof app !== 'undefined' && app && app.data) {
                app.data.startSpecificReview(words);
            }
        } catch (e) {
            L('[DailySession] startSpecificReview failed', e);
        }

        // Clear match free-play state when launching match
        if (mode === 'match') {
            try {
                if (typeof app !== 'undefined' && app && app.store) {
                    app.store.matchState = null;
                }
            } catch (_) { /* ignore */ }
        }

        // Destroy any existing game first
        try {
            if (typeof app !== 'undefined' && app && app.game) {
                try { app.game.destroy(); } catch (_) { /* ignore */ }
                app.game = null;
            }
        } catch (_) { /* ignore */ }

        var game = this._constructMode(mode);
        if (!game) {
            L('[DailySession] unknown mode', mode, '— skipping step');
            this.cursor++;
            return this._launchStepAtCursor();
        }

        try {
            if (typeof app !== 'undefined' && app) {
                app.game = game;
            }
        } catch (_) { /* ignore */ }

        var meta = savedStepMeta || {
            wordIds: wordIds,
            purpose: purpose,
            mode: mode,
            type: type
        };
        // Ensure wordIds/mode on meta
        meta.wordIds = meta.wordIds || wordIds;
        meta.purpose = meta.purpose || purpose;
        meta.mode = meta.mode || mode;
        meta.type = meta.type || type;

        this.attachController(game, meta);

        try {
            history.pushState({ view: 'game', mode: mode, index: game.i || 0, dailySession: true }, '');
        } catch (_) { /* ignore */ }

        // Present step: introduce current card immediately
        if (type === 'present' || mode === 'flash') {
            this._introduceCurrent(game);
        }

        this._updatedAt = Date.now();
        await this._persistPlan();
    }

    _constructMode(mode) {
        try {
            if (mode === 'flash' && typeof Flashcard !== 'undefined') return new Flashcard('flash');
            if (mode === 'quiz' && typeof Quiz !== 'undefined') return new Quiz('quiz');
            if (mode === 'tf' && typeof TF !== 'undefined') return new TF('tf');
            if (mode === 'match' && typeof Match !== 'undefined') return new Match('match');
            if (mode === 'voice' && typeof Voice !== 'undefined') return new Voice('voice');
            if (mode === 'sentences' && typeof Sentences !== 'undefined') return new Sentences('sentences');
            if (mode === 'dictation' && typeof Dictation !== 'undefined') return new Dictation('dictation');
            if (mode === 'story' && typeof Story !== 'undefined') return new Story('story');
            if (mode === 'grammar' && typeof Grammar !== 'undefined') return new Grammar('grammar');
            if (mode === 'context' && typeof Context !== 'undefined') return new Context('context');
        } catch (e) {
            L('[DailySession] construct mode failed', mode, e);
        }
        // Fallback via app.launchGameMode
        try {
            if (typeof app !== 'undefined' && app && typeof app.launchGameMode === 'function') {
                app.launchGameMode(mode);
                return app.game;
            }
        } catch (e2) {
            L('[DailySession] launchGameMode failed', mode, e2);
        }
        return null;
    }

    _attachPresentHooks(game) {
        var self = this;
        var origNav = game.nav.bind(game);
        game.nav = function (d) {
            // After forward from last card → finishStep
            if (d > 0 && game.list && game.i >= game.list.length - 1) {
                // introduce last if needed
                self._introduceCurrent(game);
                // Mark all shown
                if (self._step) {
                    for (var i = 0; i < game.list.length; i++) {
                        var w = game.list[i];
                        if (w && w.id != null) self._step.shownWordIds.add(Number(w.id));
                    }
                    // Resolve all for present
                    self._step.wordIds.forEach(function (id) {
                        self._step.resolvedWordIds.add(Number(id));
                        self._step.pendingWordIds.delete(Number(id));
                    });
                }
                self.finishStep();
                return;
            }
            origNav(d);
            self._introduceCurrent(game);
            // If all shown after nav
            if (self._step && self._step.shownWordIds.size >= self._step.wordIds.length) {
                // wait for last next
            }
        };
        // Also introduce on first paint
        self._introduceCurrent(game);
    }

    _introduceCurrent(game) {
        if (!game || !game.list || !game.list[game.i]) return;
        var w = game.list[game.i];
        var id = w && w.id != null ? Number(w.id) : null;
        if (id == null || !Number.isFinite(id)) return;
        if (this._step) this._step.shownWordIds.add(id);
        try {
            var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
            if (mem && typeof mem.introduce === 'function' && !mem._isStub) {
                if (typeof window !== 'undefined' && window.MEMORY_ENGINE_ENABLED) {
                    mem.introduce(id, Date.now());
                }
            }
        } catch (e) {
            L('[DailySession] introduce failed', e);
        }
    }

    _destroyGameSoft() {
        var game = this._game;
        this._game = null;
        if (game) {
            // Prevent pending waitAndNav from navigating after step end
            try {
                this._navGen = (this._navGen || 0) + 1;
                game._sessionNavGen = this._navGen;
                game.busy = true;
                game.nav = function () {};
                game.waitAndNav = async function () {};
            } catch (_) { /* ignore */ }
            // Restore random pref if we overrode it
            try {
                if (game._sessionRandomPrev !== undefined &&
                    typeof app !== 'undefined' && app && app.store && app.store.prefs) {
                    var key = (game.key || 'quiz') + 'Random';
                    app.store.prefs[key] = game._sessionRandomPrev;
                }
            } catch (_) { /* ignore */ }
            try { game.destroy(); } catch (_) { /* ignore */ }
        }
        try {
            if (typeof app !== 'undefined' && app && app.game === game) {
                app.game = null;
            }
        } catch (_) { /* ignore */ }
    }

    _serializeStepMeta() {
        var step = this._step;
        if (!step) return null;
        var reinsertCountObj = {};
        if (step.reinsertCount && typeof step.reinsertCount.forEach === 'function') {
            step.reinsertCount.forEach(function (v, k) { reinsertCountObj[k] = v; });
        }
        return {
            wordIds: (step.wordIds || []).slice(),
            purpose: step.purpose,
            mode: step.mode,
            type: step.type,
            resolvedWordIds: Array.from(step.resolvedWordIds || []),
            reinsertQueue: (step.reinsertQueue || []).slice(),
            reinsertCount: reinsertCountObj,
            pendingWordIds: Array.from(step.pendingWordIds || []),
            shownWordIds: Array.from(step.shownWordIds || []),
            hadMiss: Array.from(step.hadMiss || [])
        };
    }

    _planPayload() {
        return {
            dateKey: this.dateKey || _dailySessionTodayKey(),
            // Always persist canonical status; UI pause uses pausedAt (status stays active)
            status: this.status,
            pausedAt: this._uiPaused ? (this.pausedAt || Date.now()) : null,
            cursor: this.cursor,
            plan: this.plan,
            stats: this.stats,
            stepMeta: this._serializeStepMeta(),
            intensity: this.intensity,
            updatedAt: this._updatedAt || Date.now(),
            startedAt: this._startedAt || null
        };
    }

    async _persistPlan() {
        var payload = this._planPayload();
        // localStorage mirror always
        try {
            localStorage.setItem(DAILY_SESSION_LS_KEY, JSON.stringify(payload));
        } catch (e) {
            L('[DailySession] localStorage persist failed', e);
        }

        var uid = _resolveUidForSession();
        if (!uid || typeof db === 'undefined' || !db) return;
        try {
            var path = 'users/' + uid + '/dailySessions/' + payload.dateKey;
            await db.ref(path).update({
                status: payload.status,
                pausedAt: payload.pausedAt,
                cursor: payload.cursor,
                plan: payload.plan,
                stats: payload.stats,
                stepMeta: payload.stepMeta,
                intensity: payload.intensity,
                updatedAt: payload.updatedAt,
                startedAt: payload.startedAt
            });
        } catch (e) {
            L('[DailySession] RTDB persist failed', e);
        }
    }

    _persistPlanDebounced() {
        var self = this;
        if (this._persistTimer) clearTimeout(this._persistTimer);
        this._persistTimer = setTimeout(function () {
            self._persistPlan();
        }, 400);
    }

    async _loadPersistedPlan() {
        var dateKey = _dailySessionTodayKey();
        var uid = _resolveUidForSession();
        var remote = null;
        var local = null;

        try {
            var raw = localStorage.getItem(DAILY_SESSION_LS_KEY);
            if (raw) local = JSON.parse(raw);
        } catch (_) { /* ignore */ }

        if (uid && typeof db !== 'undefined' && db) {
            try {
                var snap = await db.ref('users/' + uid + '/dailySessions/' + dateKey).once('value');
                if (snap && snap.exists()) remote = snap.val();
            } catch (e) {
                L('[DailySession] RTDB load failed', e);
            }
        }

        // Prefer RTDB when online and present; else local if same date
        var chosen = null;
        if (remote && remote.plan) {
            chosen = remote;
            if (local && local.updatedAt && remote.updatedAt && local.updatedAt > remote.updatedAt) {
                // Local newer (offline edits) — prefer local
                chosen = local;
            }
        } else if (local && local.dateKey === dateKey && local.plan) {
            chosen = local;
        }

        if (chosen) {
            chosen.dateKey = chosen.dateKey || dateKey;
        }
        return chosen;
    }
}

// Multi-script exports (explicit window — AGENTS.md)
if (typeof window !== 'undefined') {
    window.DailySessionService = DailySessionService;
    window.SESSION_INTENSITY_PRESETS = SESSION_INTENSITY_PRESETS;
    window.SESSION_DEFAULTS = SESSION_DEFAULTS;
    window.getSessionDefaults = getSessionDefaults;
    window.buildPlan = buildPlan;
    window.buildQuizOnlyPlan = buildQuizOnlyPlan;
    window.wordsFromIds = wordsFromIds;
    window.DAILY_SESSION_LS_KEY = DAILY_SESSION_LS_KEY;
}
