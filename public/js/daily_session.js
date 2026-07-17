/* js/daily_session.js
 *
 * DailySessionService — compose a finite Today plan and run steps with
 * score/miss wrapping for step completion (Quiz-first v1).
 *
 * Depends on: app.data, app.memory, game constructors (Quiz, TF, …), L().
 * Multi-script: window.DailySessionService + pure helpers for unit tests.
 *
 * PR5: compose/buildPlan, attachController, onGraded → memory.review with
 * _ownsMemoryReviews so PR3b analytics hook skips; Again reinsert once;
 * complete/abandon → finalizeSessionHolds + endReviewSession.
 *
 * PR7: In-session progress chrome (Today · n/N + mode chip) and completion
 * summary screen (correct/incorrect, new introduced, due cleared). User-facing
 * copy only — never FSRS / schedule internals.
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

/** User-facing mode labels for progress chrome (no jargon). */
var SESSION_MODE_LABELS = Object.freeze({
    quiz: 'Quiz',
    flash: 'Flashcards',
    tf: 'True / False',
    match: 'Match',
    voice: 'Voice',
    dictation: 'Dictation',
    sentences: 'Sentences',
    sentence_build: 'Sentence Build',
    story: 'Story',
    grammar: 'Grammar',
    context: 'Context',
    present: 'Learn',
    ai: 'Story'
});

/**
 * Whether a drill/AI mode is included in Today compose (F6b prefs).
 * Defaults ON when pref missing. Flash present always allowed for new words.
 * @param {string} mode
 * @param {object|null} prefs
 * @returns {boolean}
 */
function isSessionModeIncluded(mode, prefs) {
    prefs = prefs || {};
    // Speaking family
    if (mode === 'voice' || mode === 'dictation') {
        return prefs.sessionIncludeSpeaking !== false;
    }
    var map = {
        quiz: 'sessionIncludeQuiz',
        tf: 'sessionIncludeTf',
        sentences: 'sessionIncludeSentences',
        sentence_build: 'sessionIncludeSentenceBuild',
        match: 'sessionIncludeMatch',
        story: 'sessionIncludeStory',
        ai: 'sessionIncludeStory',
        flash: null, // always for new present
        present: null
    };
    var key = map[mode];
    if (key == null) return true;
    return prefs[key] !== false;
}

/** Empty session stats shape (persisted on dailySessions/{date}.stats). */
function emptySessionStats() {
    return {
        correct: 0,
        incorrect: 0,
        againCount: 0,
        stepsDone: 0,
        newIntroduced: 0,
        dueCleared: 0,
        dueAtStart: 0
    };
}

function sessionModeLabel(mode) {
    if (!mode) return 'Practice';
    return SESSION_MODE_LABELS[mode] || String(mode);
}

/**
 * Count work units (words) across plan steps for progress n/N.
 * Skips terminal `complete` steps; AI steps count their seed wordIds if present.
 * @param {Array<object>|null} steps
 * @returns {number}
 */
function countPlanWordUnits(steps) {
    var total = 0;
    (steps || []).forEach(function (s) {
        if (!s || s.type === 'complete') return;
        var ids = s.wordIds || [];
        total += ids.length;
    });
    return total;
}

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
        includeDictation: !!(prefs && prefs.includeDictation),
        // F6b: pass prefs through so buildPlan can filter modes
        _prefs: prefs || null
    };
}

/**
 * Enabled review drill modes for due-segment rotation (F6b).
 * Order is stable for determinism.
 */
function enabledDueModes(prefs) {
    var candidates = ['quiz', 'tf', 'sentences', 'sentence_build', 'match', 'dictation', 'voice'];
    var out = [];
    for (var i = 0; i < candidates.length; i++) {
        if (isSessionModeIncluded(candidates[i], prefs)) out.push(candidates[i]);
    }
    // Always keep at least quiz if everything disabled (safety net)
    if (!out.length) out.push('quiz');
    return out;
}

/**
 * Deterministic plan builder (design §2.2.1 + F6/F6b mode prefs).
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
    var prefs = d._prefs || null;

    // --- New segment: Flash present always, then Quiz (if included) for same new ids ---
    if (newIds.length > 0) {
        steps.push({ type: 'present', mode: 'flash', wordIds: newIds.slice(), purpose: 'new' });
        if (isSessionModeIncluded('quiz', prefs)) {
            steps.push({ type: 'drill', mode: 'quiz', wordIds: newIds.slice(), purpose: 'new' });
        } else {
            // Prefer first enabled drill for new reinforcement
            var alts = enabledDueModes(prefs);
            steps.push({ type: 'drill', mode: alts[0], wordIds: newIds.slice(), purpose: 'new' });
        }
    }

    // --- Due segment: rotate across enabled modes (not quiz-only) ---
    if (dueIds.length > 0) {
        var modes = enabledDueModes(prefs);
        // Round-robin assign each due id to a mode for variety
        var buckets = {};
        var m;
        for (m = 0; m < modes.length; m++) buckets[modes[m]] = [];
        for (var di = 0; di < dueIds.length; di++) {
            buckets[modes[di % modes.length]].push(dueIds[di]);
        }
        // Emit in mode priority order so chrome is stable
        for (m = 0; m < modes.length; m++) {
            var mid = modes[m];
            if (buckets[mid] && buckets[mid].length) {
                steps.push({ type: 'drill', mode: mid, wordIds: buckets[mid], purpose: 'review' });
            }
        }
    }

    // --- AI block: Story when enabled in prefs ---
    if (d.includeAiBlock && d.aiBlock === 'story' && isSessionModeIncluded('story', prefs)) {
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
var MULTI_ATTEMPT_MODES = { quiz: true, dictation: true, sentence_build: true };

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
        this.stats = emptySessionStats();
        /** @type {object|null} live step runner state */
        this._step = null;
        this._game = null;
        this._finishing = false;
        this._startedAt = null;
        this._updatedAt = null;
        this._completedAt = null;
        /** Bumped to cancel in-flight waitAndNav after reinsert / step end. */
        this._navGen = 0;
        /**
         * One-shot: next waitAndNav no-ops (Quiz calls score() then waitAndNav;
         * reinsert inside score must suppress that post-score auto-nav).
         */
        this._suppressNextWaitAndNav = false;
        /** Session-wide unique wordIds introduced / cleared (for summary stats). */
        this._introducedIds = new Set();
        this._dueClearedIds = new Set();
        /** Word units completed in finished steps (for progress n/N). */
        this._wordsDoneBeforeStep = 0;
        /**
         * True while completion owns the view (set at start of complete(), before awaits).
         * Prevents goHome from racing and being repainted by showCompleteSummary.
         */
        this._showingSummary = false;
        /** User left via Home during/after complete — do not repaint summary over home. */
        this._summaryDismissed = false;
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
        if (options.quizOnly) {
            d.includeAiBlock = false;
        }

        var intensity = (prefs && prefs.sessionIntensity) === 'cram' ? 'cram' : 'casual';
        if (options.intensity === 'cram' || options.intensity === 'casual') {
            intensity = options.intensity;
            d = Object.assign({}, getSessionDefaults({ sessionIntensity: intensity }), options.defaults || {});
            if (options.quizOnly) d.includeAiBlock = false;
            if (options.includeAiBlock != null) d.includeAiBlock = !!options.includeAiBlock;
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

        var now = options.now != null ? options.now : Date.now();
        var dueCards = options.due || null;
        var newItems = options.newItems || null;
        var pathMeta = null;

        // Dual-universe path compose (unit new + multi-pass due) when LearningPath available
        var path = (typeof app !== 'undefined' && app) ? app.learningPath : null;
        if ((!dueCards || !newItems) && path && typeof path.selectTodayItems === 'function' && path.getProfile) {
            try {
                var prof = path.getProfile();
                if (prof && prof.pathMode === 'guided') {
                    var sel = path.selectTodayItems(d, now);
                    if (!newItems) newItems = sel.newItems || [];
                    if (!dueCards) dueCards = sel.due || [];
                    pathMeta = sel.meta || null;
                }
            } catch (e) {
                if (typeof L === 'function') L('[Session] path selectTodayItems failed', e);
            }
        }

        // Free-path / fallback: filtered list universe (legacy single-pool)
        if (!dueCards || !newItems) {
            var pool = [];
            try {
                if (typeof app !== 'undefined' && app && app.data) {
                    if (app.data.getFilteredListStrict) pool = app.data.getFilteredListStrict();
                    else if (app.data.getFilteredList) pool = app.data.getFilteredList();
                    else pool = app.data.list || [];
                    if ((!pool || !pool.length) && app.data.list) pool = app.data.list;
                }
            } catch (_) {
                pool = [];
            }
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
            if (!newItems && mem && typeof mem.getNewCandidates === 'function') {
                newItems = mem.getNewCandidates(pool, { limit: d.maxNew }) || [];
            }
        }
        if (!dueCards) dueCards = [];
        if (!newItems) newItems = [];

        // Cap new so total preference is soft (due already limited by maxDue)
        if (newItems.length > d.maxNew) newItems = newItems.slice(0, d.maxNew);

        var planSteps = buildPlan(newItems, dueCards, d);
        return {
            steps: planSteps,
            newItems: newItems,
            due: dueCards,
            defaults: d,
            intensity: intensity,
            meta: pathMeta
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
        this.stats = emptySessionStats();
        this.stats.dueAtStart = (this.plan.dueIds || []).length;
        this.status = 'active';
        this._uiPaused = false;
        this.pausedAt = null;
        this.dateKey = _dailySessionTodayKey();
        this._startedAt = Date.now();
        this._updatedAt = this._startedAt;
        this._completedAt = null;
        this._finishing = false;
        this._step = null;
        this._ownsMemoryReviews = false;
        this._navGen = 0;
        this._suppressNextWaitAndNav = false;
        this._introducedIds = new Set();
        this._dueClearedIds = new Set();
        this._wordsDoneBeforeStep = 0;
        this._showingSummary = false;
        this._summaryDismissed = false;

        try {
            if (window.EngagementService) EngagementService.increment('sessionStarted', 1);
        } catch (_) {}

        await this._persistPlan();
        L('[DailySession] start', this.plan.steps.length, 'steps', 'intensity=', this.intensity);

        this.updateProgressChrome();
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
        this.stats = Object.assign(emptySessionStats(), loaded.stats || {});
        if (!this.stats.dueAtStart && this.plan && this.plan.dueIds) {
            this.stats.dueAtStart = this.plan.dueIds.length;
        }
        this.dateKey = loaded.dateKey || _dailySessionTodayKey();
        this.status = 'active';
        this._uiPaused = false;
        this.pausedAt = null;
        this._finishing = false;
        this._showingSummary = false;
        this._summaryDismissed = false;
        // F1: rehydrate unique-id sets so complete() does not wipe pre-pause counts
        this._introducedIds = this._rehydrateIdSet(
            loaded.introducedIds,
            this.stats.newIntroduced
        );
        this._dueClearedIds = this._rehydrateIdSet(
            loaded.dueClearedIds,
            this.stats.dueCleared
        );
        // Keep stats floors aligned with rehydrated sets (never shrink on resume)
        this.stats.newIntroduced = Math.max(
            this.stats.newIntroduced || 0,
            this._introducedIds.size
        );
        this.stats.dueCleared = Math.max(
            this.stats.dueCleared || 0,
            this._dueClearedIds.size
        );
        // Rebuild words-done baseline from finished steps (cursor = next to run)
        this._wordsDoneBeforeStep = 0;
        var steps = (this.plan && this.plan.steps) || [];
        for (var si = 0; si < this.cursor && si < steps.length; si++) {
            var st = steps[si];
            if (st && st.type !== 'complete' && st.wordIds) {
                this._wordsDoneBeforeStep += st.wordIds.length;
            }
        }

        // Restore step meta for partial step if present
        var savedStep = loaded.stepMeta || null;
        this.updateProgressChrome();
        await this._launchStepAtCursor(savedStep);
        return { ok: true, plan: this.plan };
    }

    /**
     * Rebuild a session Set from persisted id arrays.
     * When only a count floor is available (legacy payloads), seed opaque placeholders
     * so size-based stats never drop on resume until real ids re-accumulate.
     * @param {Array|null|undefined} ids
     * @param {number} countFloor
     * @returns {Set<number>}
     */
    _rehydrateIdSet(ids, countFloor) {
        var set = new Set();
        if (ids && ids.length) {
            for (var i = 0; i < ids.length; i++) {
                var n = Number(ids[i]);
                if (Number.isFinite(n)) set.add(n);
            }
        }
        var floor = Number(countFloor) || 0;
        // Legacy: stats had counts but ids were not persisted — preserve size only.
        // Negative sentinel ids never collide with real vocab wordIds (>= 0).
        var pad = 0;
        while (set.size < floor) {
            pad++;
            set.add(-pad);
        }
        return set;
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
        var stepMode = null;
        var stepType = null;
        if (this._step) {
            resolvedInStep = this._step.resolvedWordIds ? this._step.resolvedWordIds.size : 0;
            pendingInStep = this._step.pendingWordIds ? this._step.pendingWordIds.size : 0;
            stepMode = this._step.mode || null;
            stepType = this._step.type || null;
        } else if (steps[this.cursor] && steps[this.cursor].type !== 'complete') {
            stepMode = steps[this.cursor].mode || null;
            stepType = steps[this.cursor].type || null;
        }

        var wordsTotal = countPlanWordUnits(steps);
        var wordsDone = (this._wordsDoneBeforeStep || 0) + resolvedInStep;
        if (wordsDone > wordsTotal) wordsDone = wordsTotal;

        // 1-based step display; clamp when on terminal complete step
        var stepDisplay = workSteps.length === 0
            ? 0
            : Math.min(this.cursor + 1, workSteps.length);

        return {
            status: this.status,
            paused: this.isPaused,
            pausedAt: this.pausedAt,
            stepIndex: this.cursor,
            stepDisplay: stepDisplay,
            stepsTotal: workSteps.length,
            resolvedInStep: resolvedInStep,
            pendingInStep: pendingInStep,
            wordsDone: wordsDone,
            wordsTotal: wordsTotal,
            mode: stepMode,
            modeLabel: sessionModeLabel(stepMode || stepType),
            plan: this.plan,
            stats: Object.assign({}, this.stats),
            intensity: this.intensity
        };
    }

    /**
     * User-facing completion summary (from dailySessions stats).
     * @returns {object}
     */
    getSummary() {
        var s = Object.assign(emptySessionStats(), this.stats || {});
        var graded = (s.correct || 0) + (s.incorrect || 0);
        var accuracy = graded > 0 ? Math.round((s.correct / graded) * 100) : 0;
        return {
            correct: s.correct || 0,
            incorrect: s.incorrect || 0,
            accuracy: accuracy,
            newIntroduced: s.newIntroduced || 0,
            dueCleared: s.dueCleared || 0,
            dueAtStart: s.dueAtStart || 0,
            stepsDone: s.stepsDone || 0,
            againCount: s.againCount || 0,
            intensity: this.intensity || 'casual',
            completedAt: this._completedAt || null
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
        this._ownsMemoryReviews = true;
        this._game = game;
        this._uiPaused = false;
        // Never carry suppress across step boundaries (Issue 7)
        this._suppressNextWaitAndNav = false;

        var wordIds = (stepMeta && stepMeta.wordIds) || [];
        var purpose = (stepMeta && stepMeta.purpose) || 'review';
        var mode = (stepMeta && stepMeta.mode) || game.key || 'quiz';
        var type = (stepMeta && stepMeta.type) || 'drill';

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

        // In-session skip (F6b) — finish step without permanent pref change
        game.skipDailySessionStep = function () {
            self.finishStep();
        };
        // Soft chrome: skip chip when progress UI is shown
        try {
            var chrome = document.getElementById('daily-session-progress');
            if (chrome && !chrome.querySelector('#ds-skip-step')) {
                var skipBtn = document.createElement('button');
                skipBtn.id = 'ds-skip-step';
                skipBtn.type = 'button';
                skipBtn.className = 'ml-2 text-[10px] font-bold text-slate-400 underline';
                skipBtn.textContent = 'Skip activity';
                skipBtn.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (game.skipDailySessionStep) game.skipDailySessionStep();
                };
                chrome.appendChild(skipBtn);
            }
        } catch (_) {}

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
            this.updateProgressChrome();
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
            this.updateProgressChrome();
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

        // Due cleared: unique due words that received a terminal resolve this session
        this._markDueCleared(id);

        // Again / recovered-as-Again: reinsert once max
        if (treatAsAgain && step.reinsertLapses) {
            this._queueReinsert(step, id);
        }

        this._updatedAt = Date.now();
        this._persistPlanDebounced();
        this.updateProgressChrome();
        this.maybeFinishStep();
    }

    /** Count unique due word as cleared when it is first resolved this session. */
    _markDueCleared(wordId) {
        var id = Number(wordId);
        if (!Number.isFinite(id)) return;
        var dueIds = (this.plan && this.plan.dueIds) || [];
        var isDue = false;
        for (var i = 0; i < dueIds.length; i++) {
            if (Number(dueIds[i]) === id) { isDue = true; break; }
        }
        if (!isDue) return;
        if (!this._dueClearedIds) this._dueClearedIds = new Set();
        if (this._dueClearedIds.has(id)) return;
        this._dueClearedIds.add(id);
        // Never shrink below a restored/persisted floor (Home → Continue safety)
        this.stats.dueCleared = Math.max(this.stats.dueCleared || 0, this._dueClearedIds.size);
    }

    _applyMemoryReview(wordId, rating, mode) {
        if (typeof window === 'undefined') return;
        var memOn = (typeof window.isMemoryEngineEnabled === 'function')
            ? window.isMemoryEngineEnabled()
            : !!window.MEMORY_ENGINE_ENABLED;
        if (!memOn) return;
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
     * Async so complete() is awaited (F3: avoids fire-and-forget race with goHome).
     * Callers may still fire-and-forget finishStep(); complete() still sets
     * _showingSummary synchronously before its first await.
     */
    async finishStep() {
        if (this._finishing) return;
        this._finishing = true;
        this.stats.stepsDone++;

        // Credit finished-step word units toward session progress
        if (this._step && this._step.wordIds && this._step.wordIds.length) {
            this._wordsDoneBeforeStep = (this._wordsDoneBeforeStep || 0) + this._step.wordIds.length;
            // Present/flash resolve all words here — mark due cleared if any due
            var self = this;
            this._step.wordIds.forEach(function (wid) {
                if (self._step.resolvedWordIds && self._step.resolvedWordIds.has(Number(wid))) {
                    self._markDueCleared(wid);
                }
            });
        }

        // Do NOT set _suppressNextWaitAndNav here — destroy() noops waitAndNav on
        // the finishing game; a leftover suppress would leak into the next step
        // and eat its first auto-nav (Issue 7). Suppress is reinsert-only.
        this._cancelPendingNav();
        this._destroyGameSoft();
        this._suppressNextWaitAndNav = false;
        this._ownsMemoryReviews = false;
        this._step = null;
        this.cursor++;
        this._updatedAt = Date.now();
        this._persistPlan(); // fire-and-forget ok
        this.updateProgressChrome();

        var steps = (this.plan && this.plan.steps) || [];
        if (this.cursor >= steps.length) {
            await this.complete();
            return;
        }
        var next = steps[this.cursor];
        if (!next || next.type === 'complete') {
            await this.complete();
            return;
        }

        this._finishing = false;
        await this._launchStepAtCursor();
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
        this.hideProgressChrome();
        L('[DailySession] paused (status=active) at cursor', this.cursor);
    }

    /**
     * Complete session: finalizeSessionHolds, endReviewSession, persist stats,
     * show completion summary (PR7).
     *
     * Sets _showingSummary synchronously before any await so goHome can see that
     * completion owns the view (F3 race). If user already dismissed via Home,
     * skips painting the summary over home.
     */
    async complete() {
        this._finishing = true;
        this.status = 'completed';
        this._uiPaused = false;
        this.pausedAt = null;
        this._completedAt = Date.now();
        // F3: claim the view before first await (goHome will not pause; may dismiss)
        this._showingSummary = true;
        this._cancelPendingNav();
        this._ownsMemoryReviews = false;
        this._destroyGameSoft();
        this.hideProgressChrome();

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

        // F1: sync from sets without shrinking restored floors
        if (this._introducedIds) {
            this.stats.newIntroduced = Math.max(
                this.stats.newIntroduced || 0,
                this._introducedIds.size
            );
        }
        if (this._dueClearedIds) {
            this.stats.dueCleared = Math.max(
                this.stats.dueCleared || 0,
                this._dueClearedIds.size
            );
        }

        this._updatedAt = Date.now();
        await this._persistPlan();

        L('[DailySession] completed', this.stats);

        try {
            if (window.EngagementService) EngagementService.increment('sessionCompleted', 1);
        } catch (_) {}

        // User already left via Home during finalize/persist — do not repaint summary
        if (this._summaryDismissed) {
            this._showingSummary = false;
            return;
        }

        // PR7: full summary screen (user-facing only). Optional confetti.
        try {
            if (typeof app !== 'undefined' && app && app.celebration &&
                typeof app.celebration.play === 'function') {
                app.celebration.play();
            }
        } catch (_) { /* ignore */ }

        this.showCompleteSummary();
    }

    /**
     * Leave completion UI via header Home (or Done). Restores status-bar; marks
     * summary dismissed so in-flight complete() will not repaint over home (F2/F3).
     */
    dismissSummaryUi() {
        this._summaryDismissed = true;
        this._showingSummary = false;
        this.hideProgressChrome();
        this._restoreStatusBarAfterSummary();
    }

    _restoreStatusBarAfterSummary() {
        if (typeof document === 'undefined') return;
        try {
            var bar = document.getElementById('status-bar');
            if (!bar) return;
            if (bar.dataset.origText) {
                bar.innerText = bar.dataset.origText;
            } else {
                bar.innerText = 'Ready';
            }
            bar.classList.remove('text-rose-500', 'text-emerald-500', 'text-indigo-500', 'font-bold');
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
        this.hideProgressChrome();
        this._showingSummary = false;

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
            this.updateProgressChrome();
            return this._launchStepAtCursor();
        }

        this._finishing = false;

        if (step.type === 'ai') {
            // v1: best-effort skip AI block so Quiz-first plans never block.
            // Multi-mode AI launch can be enabled later (PR8).
            if (typeof step.skip === 'boolean' && step.skip === false) {
                // reserved
            }
            L('[DailySession] AI step auto-skip (v1 Quiz-first)');
            // Credit seed words toward progress so bar does not stall on auto-skip
            if (wordIds && wordIds.length) {
                this._wordsDoneBeforeStep = (this._wordsDoneBeforeStep || 0) + wordIds.length;
            }
            this.cursor++;
            this.stats.stepsDone++;
            await this._persistPlan();
            this.updateProgressChrome();
            return this._launchStepAtCursor();
        }

        await this._startDrillOrPresent(step.type, step.mode, step.purpose, wordIds, savedStepMeta);
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
        this.updateProgressChrome();
    }

    _constructMode(mode) {
        try {
            if (mode === 'flash' && typeof Flashcard !== 'undefined') return new Flashcard('flash');
            if (mode === 'quiz' && typeof Quiz !== 'undefined') return new Quiz('quiz');
            if (mode === 'tf' && typeof TF !== 'undefined') return new TF('tf');
            if (mode === 'match' && typeof Match !== 'undefined') return new Match('match');
            if (mode === 'voice' && typeof Voice !== 'undefined') return new Voice('voice');
            if (mode === 'sentences' && typeof Sentences !== 'undefined') return new Sentences('sentences');
            if (mode === 'sentence_build' && typeof SentenceBuild !== 'undefined') {
                return new SentenceBuild('sentence_build');
            }
            if (mode === 'dictation' && typeof Dictation !== 'undefined') return new Dictation('dictation');
            if (mode === 'story' && typeof Story !== 'undefined') return new Story('story');
            if (mode === 'grammar' && typeof Grammar !== 'undefined') return new Grammar('grammar');
            if (mode === 'context' && typeof Context !== 'undefined') return new Context('context');
            if (mode === 'chat' && typeof Chat !== 'undefined') return new Chat('chat');
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

        // Track new words for completion summary (unique)
        var isNewPurpose = this._step && this._step.purpose === 'new';
        var newIds = (this.plan && this.plan.newIds) || [];
        var inNewPlan = false;
        for (var ni = 0; ni < newIds.length; ni++) {
            if (Number(newIds[ni]) === id) { inNewPlan = true; break; }
        }
        if (isNewPurpose || inNewPlan) {
            if (!this._introducedIds) this._introducedIds = new Set();
            if (!this._introducedIds.has(id)) {
                this._introducedIds.add(id);
                // Never shrink below a restored/persisted floor (Home → Continue)
                this.stats.newIntroduced = Math.max(
                    this.stats.newIntroduced || 0,
                    this._introducedIds.size
                );
            }
        }

        try {
            var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
            if (mem && typeof mem.introduce === 'function' && !mem._isStub) {
                var engOn = (typeof window !== 'undefined') && (
                    (typeof window.isMemoryEngineEnabled === 'function')
                        ? window.isMemoryEngineEnabled()
                        : !!window.MEMORY_ENGINE_ENABLED
                );
                if (engOn) {
                    mem.introduce(id, Date.now());
                }
            }
        } catch (e) {
            L('[DailySession] introduce failed', e);
        }
        this.updateProgressChrome();
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
            startedAt: this._startedAt || null,
            completedAt: this._completedAt || null,
            // F1: persist unique id lists so Continue rehydrates sets (not empty wipe)
            introducedIds: Array.from(this._introducedIds || []).filter(function (id) {
                return Number(id) >= 0; // drop legacy placeholder sentinels
            }),
            dueClearedIds: Array.from(this._dueClearedIds || []).filter(function (id) {
                return Number(id) >= 0;
            })
        };
    }

    // --- PR7: Progress chrome + completion summary (user-facing UI only) ---

    /**
     * Ensure #session-progress-chrome exists between app header and #app-view.
     * @returns {HTMLElement|null}
     */
    _ensureProgressChromeEl() {
        if (typeof document === 'undefined') return null;
        var el = document.getElementById('session-progress-chrome');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'session-progress-chrome';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.className = 'shrink-0 px-3 py-2 border-b border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900';
        el.style.display = 'none';
        var header = document.querySelector('body > header') || document.querySelector('header');
        var main = document.getElementById('app-view');
        if (main && main.parentNode) {
            main.parentNode.insertBefore(el, main);
        } else if (header && header.parentNode) {
            if (header.nextSibling) header.parentNode.insertBefore(el, header.nextSibling);
            else header.parentNode.appendChild(el);
        } else if (document.body) {
            document.body.appendChild(el);
        }
        return el;
    }

    /**
     * Show / refresh in-session progress: "Today · 7/15" + mode chip + bar.
     * Safe no-op when not active or in non-DOM (unit test) contexts.
     */
    updateProgressChrome() {
        if (typeof document === 'undefined') return;
        if (this.status !== 'active' || this._uiPaused || this._showingSummary) {
            this.hideProgressChrome();
            return;
        }
        var el = this._ensureProgressChromeEl();
        if (!el) return;

        var p = this.getProgress();
        var wordsTotal = p.wordsTotal || 0;
        var wordsDone = p.wordsDone || 0;
        // Prefer word units; fall back to steps when plan has no wordIds yet
        var n, N, unitLabel;
        if (wordsTotal > 0) {
            n = wordsDone;
            N = wordsTotal;
            unitLabel = 'words';
        } else {
            n = p.stepDisplay || 0;
            N = p.stepsTotal || 0;
            unitLabel = 'steps';
        }
        var pct = N > 0 ? Math.min(100, Math.round((n / N) * 100)) : 0;
        var modeLabel = p.modeLabel || 'Practice';
        var stepHint = '';
        if (p.stepsTotal > 0) {
            stepHint = 'Step ' + (p.stepDisplay || 1) + ' of ' + p.stepsTotal;
        }

        el.style.display = '';
        el.innerHTML =
            '<div class="flex items-center justify-between gap-2 mb-1.5">' +
                '<div class="flex items-center gap-2 min-w-0">' +
                    '<span class="text-[11px] font-black text-slate-700 dark:text-neutral-200 tracking-tight whitespace-nowrap">' +
                        'Today · ' + n + '/' + N +
                    '</span>' +
                    '<span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 whitespace-nowrap">' +
                        this._escapeHtml(modeLabel) +
                    '</span>' +
                '</div>' +
                (stepHint
                    ? '<span class="text-[9px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider whitespace-nowrap">' +
                        this._escapeHtml(stepHint) +
                      '</span>'
                    : '') +
            '</div>' +
            '<div class="w-full h-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden" aria-hidden="true">' +
                '<div class="h-full rounded-full bg-indigo-600 transition-all duration-300" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<p class="sr-only">Session progress: ' + n + ' of ' + N + ' ' + unitLabel + ', ' + this._escapeHtml(modeLabel) + '</p>';
    }

    /** Hide and clear the progress chrome (pause / complete / abandon / home). */
    hideProgressChrome() {
        if (typeof document === 'undefined') return;
        var el = document.getElementById('session-progress-chrome');
        if (!el) return;
        el.style.display = 'none';
        el.innerHTML = '';
    }

    /**
     * Render session complete summary into #app-view (user-facing stats only).
     * Uses dailySessions stats: correct/incorrect, new introduced, due cleared.
     */
    showCompleteSummary() {
        if (typeof document === 'undefined') return;
        this._showingSummary = true;
        this.hideProgressChrome();

        var summary = this.getSummary();
        var view = document.getElementById('app-view');
        if (!view) {
            // Fallback toast if no view
            try {
                if (typeof app !== 'undefined' && app && app.ui && app.ui.showToast) {
                    app.ui.showToast(
                        'Session complete · ' + summary.correct + ' correct · ' + summary.incorrect + ' miss',
                        'success'
                    );
                }
            } catch (_) { /* ignore */ }
            return;
        }

        try {
            if (typeof app !== 'undefined' && app) {
                app.game = null;
            }
        } catch (_) { /* ignore */ }

        var dueLine = '';
        if (summary.dueAtStart > 0) {
            dueLine =
                '<div class="flex justify-between items-center py-2 border-b border-slate-100 dark:border-neutral-800">' +
                    '<span class="text-sm font-bold text-slate-500 dark:text-neutral-400">Reviews done</span>' +
                    '<span class="text-sm font-black text-slate-800 dark:text-neutral-100">' +
                        summary.dueCleared + ' of ' + summary.dueAtStart +
                    '</span>' +
                '</div>';
        } else {
            dueLine =
                '<div class="flex justify-between items-center py-2 border-b border-slate-100 dark:border-neutral-800">' +
                    '<span class="text-sm font-bold text-slate-500 dark:text-neutral-400">Reviews done</span>' +
                    '<span class="text-sm font-black text-slate-800 dark:text-neutral-100">' +
                        summary.dueCleared +
                    '</span>' +
                '</div>';
        }

        view.classList.remove('visible');
        var wrapId = 'session-wrapup-text';
        view.innerHTML =
            '<div class="flex flex-col items-center justify-center w-full h-full pb-8 overflow-y-auto pt-4 px-3">' +
                '<div class="w-full max-w-md bg-white dark:bg-neutral-900 rounded-[2rem] p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-neutral-800">' +
                    '<div class="text-center mb-6">' +
                        '<div class="text-5xl mb-3" aria-hidden="true">✓</div>' +
                        '<h2 class="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Session complete</h2>' +
                        '<p class="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest mt-2">Today\'s practice</p>' +
                        '<p id="' + wrapId + '" class="text-sm text-slate-600 dark:text-neutral-300 mt-3 leading-relaxed min-h-[2.5rem]"></p>' +
                    '</div>' +
                    '<div class="grid grid-cols-2 gap-3 mb-4">' +
                        '<div class="rounded-2xl bg-emerald-50 dark:bg-emerald-950 p-4 text-center border border-emerald-100 dark:border-emerald-900">' +
                            '<p class="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Correct</p>' +
                            '<p class="text-3xl font-black text-emerald-700 dark:text-emerald-300">' + summary.correct + '</p>' +
                        '</div>' +
                        '<div class="rounded-2xl bg-rose-50 dark:bg-rose-950 p-4 text-center border border-rose-100 dark:border-rose-900">' +
                            '<p class="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1">Missed</p>' +
                            '<p class="text-3xl font-black text-rose-700 dark:text-rose-300">' + summary.incorrect + '</p>' +
                        '</div>' +
                    '</div>' +
                    '<div class="rounded-2xl bg-slate-50 dark:bg-neutral-800 p-4 mb-4 text-center">' +
                        '<p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accuracy</p>' +
                        '<p class="text-4xl font-black text-indigo-600 dark:text-indigo-400">' + summary.accuracy + '%</p>' +
                    '</div>' +
                    '<div class="flex flex-col gap-0 mb-6">' +
                        '<div class="flex justify-between items-center py-2 border-b border-slate-100 dark:border-neutral-800">' +
                            '<span class="text-sm font-bold text-slate-500 dark:text-neutral-400">New words</span>' +
                            '<span class="text-sm font-black text-slate-800 dark:text-neutral-100">' + summary.newIntroduced + '</span>' +
                        '</div>' +
                        dueLine +
                    '</div>' +
                    '<button type="button" onclick="app.dailySession && app.dailySession.dismissSummary && app.dailySession.dismissSummary()" ' +
                        'class="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm tracking-wide shadow-md active:scale-95 transition-all">' +
                        'Done' +
                    '</button>' +
                '</div>' +
            '</div>';

        requestAnimationFrame(function () {
            view.classList.add('visible');
        });

        try {
            history.pushState({ view: 'session-complete' }, '');
        } catch (_) { /* ignore */ }

        // Keep status-bar friendly
        try {
            var bar = document.getElementById('status-bar');
            if (bar) {
                bar.dataset.origText = bar.dataset.origText || bar.innerText;
                bar.innerText = 'Session complete';
            }
        } catch (_) { /* ignore */ }

        // AI coach wrap-up (non-blocking)
        try {
            if (window.TutorMoments && typeof TutorMoments.sessionWrapUp === 'function') {
                var wrapEl = document.getElementById(wrapId);
                if (wrapEl) wrapEl.textContent = '…';
                TutorMoments.sessionWrapUp(summary).then(function (text) {
                    var el = document.getElementById(wrapId);
                    if (!el) return;
                    el.textContent = text || 'Great work — come back tomorrow for more reviews.';
                }).catch(function () {
                    var el2 = document.getElementById(wrapId);
                    if (el2) el2.textContent = 'Great work — come back tomorrow for more reviews.';
                });
            }
        } catch (_) { /* ignore */ }

        try {
            if (window.ChatFAB) window.ChatFAB.syncVisibility({ view: 'session-complete' });
        } catch (_) {}
    }

    /**
     * Dismiss completion summary and return home.
     * Bound from the Done button on the summary screen.
     */
    dismissSummary() {
        this.dismissSummaryUi();
        try {
            if (typeof app !== 'undefined' && app && typeof app.goHome === 'function') {
                app.goHome(false);
            }
        } catch (_) { /* ignore */ }
    }

    _escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
                startedAt: payload.startedAt,
                completedAt: payload.completedAt,
                introducedIds: payload.introducedIds,
                dueClearedIds: payload.dueClearedIds
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
    window.SESSION_MODE_LABELS = SESSION_MODE_LABELS;
    window.getSessionDefaults = getSessionDefaults;
    window.buildPlan = buildPlan;
    window.buildQuizOnlyPlan = buildQuizOnlyPlan;
    window.wordsFromIds = wordsFromIds;
    window.countPlanWordUnits = countPlanWordUnits;
    window.emptySessionStats = emptySessionStats;
    window.sessionModeLabel = sessionModeLabel;
    window.isSessionModeIncluded = isSessionModeIncluded;
    window.enabledDueModes = enabledDueModes;
    window.DAILY_SESSION_LS_KEY = DAILY_SESSION_LS_KEY;
    window.MULTI_ATTEMPT_MODES = MULTI_ATTEMPT_MODES;
}
