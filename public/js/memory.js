/* js/memory.js
 *
 * MemoryService — per-user, per-word FSRS card state with RTDB + localStorage.
 *
 * Depends on: window.FSRS / MEMORY_CONFIG (fsrs.js), auth, db (Firebase), L().
 * Multi-script: class MemoryService + window.MemoryService; pure migrate helpers
 * exported on window for unit tests.
 *
 * PR3a: load/save/dirty/migrate/sessionHold API only — no analytics hook.
 */

var MEMORY_CACHE_KEY = 'vm_memory_cache_v1';
var MEMORY_DIRTY_KEY = 'vm_memory_dirty_v1';
var MEMORY_SCHEMA_VERSION = 1;
var MEMORY_FLUSH_INTERVAL_MS = 30000;
var MEMORY_MIGRATE_CHUNK = 100;
var MS_PER_DAY_MEM = 24 * 60 * 60 * 1000;

/** @type {Readonly<{
 *   maxBootstrapCards: number,
 *   staggerDays: number,
 *   virtualReviewIfAccuracyGte: number,
 *   virtualReviewMinTotal: number
 * }>} */
var MIGRATE_CONFIG = Object.freeze({
    maxBootstrapCards: 200,
    staggerDays: 7,
    virtualReviewIfAccuracyGte: 0.8,
    virtualReviewMinTotal: 5
});

/**
 * Feature flag: MEMORY_ENGINE_ENABLED default false.
 * Prefers explicit window.MEMORY_ENGINE_ENABLED when set (boolean).
 * Else optional prefs.memoryEngineEnabled. Does not force-write window.
 * @returns {boolean}
 */
function isMemoryEngineEnabled() {
    if (typeof window !== 'undefined' && typeof window.MEMORY_ENGINE_ENABLED === 'boolean') {
        return window.MEMORY_ENGINE_ENABLED;
    }
    try {
        if (typeof app !== 'undefined' && app && app.store && app.store.prefs &&
            typeof app.store.prefs.memoryEngineEnabled === 'boolean') {
            return app.store.prefs.memoryEngineEnabled;
        }
    } catch (_) { /* app not ready */ }
    return false;
}

/**
 * Empty new memory card (not yet introduced / graded).
 * @param {number|string} wordId
 * @param {number} [nowMs]
 * @returns {object}
 */
function createNewMemoryCard(wordId, nowMs) {
    var t = nowMs == null ? Date.now() : nowMs;
    var fsrs = (typeof window !== 'undefined' && window.FSRS) ? window.FSRS : null;
    var base = fsrs && fsrs.createEmptyCard
        ? fsrs.createEmptyCard(t)
        : {
            due: t,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 'new',
            lastReview: null
        };
    return {
        wordId: Number(wordId),
        stability: base.stability,
        difficulty: base.difficulty,
        elapsedDays: base.elapsedDays,
        scheduledDays: base.scheduledDays,
        reps: base.reps,
        lapses: base.lapses,
        state: base.state,
        lastReview: base.lastReview,
        due: base.due,
        introducedAt: null,
        lastRating: null,
        lastMode: null,
        source: 'bootstrap',
        version: MEMORY_SCHEMA_VERSION
    };
}

/**
 * Bootstrap a card from analytics word stats (c/w/last).
 * Pure: no I/O. Used by maybeMigrate and unit tests.
 * Stagger is id-based only: wordId % MIGRATE_CONFIG.staggerDays (stable across re-runs).
 *
 * @param {number|string} wordId
 * @param {{c?:number,w?:number,last?:number}} stats
 * @param {number} now
 * @returns {object}
 */
function bootstrapCardFromStats(wordId, stats, now) {
    var c = (stats && stats.c) || 0;
    var w = (stats && stats.w) || 0;
    var last = (stats && stats.last) || 0;
    var total = c + w;
    var id = Number(wordId);
    if (total === 0) {
        return createNewMemoryCard(id, now);
    }

    var accuracy = c / total;
    var difficulty = Math.min(10, Math.max(1, 5 + (0.5 - accuracy) * 6));

    var stability = 1;
    if (accuracy >= 0.8 && total >= 5) stability = 14;
    else if (accuracy >= 0.6 && total >= 3) stability = 5;
    else if (accuracy >= 0.4) stability = 2;

    var lastReview = last || now;
    var due;
    if (accuracy >= MIGRATE_CONFIG.virtualReviewIfAccuracyGte &&
        total >= MIGRATE_CONFIG.virtualReviewMinTotal) {
        // Virtual review today: not immediately due
        due = now + stability * MS_PER_DAY_MEM;
    } else {
        var natural = lastReview + stability * MS_PER_DAY_MEM;
        var idStagger = (Math.abs(id) % MIGRATE_CONFIG.staggerDays) * MS_PER_DAY_MEM;
        // Overdue → stagger from now so mass-due is spread
        if (natural <= now) {
            due = now + idStagger;
        } else {
            due = natural + idStagger;
        }
    }

    return {
        wordId: id,
        stability: stability,
        difficulty: difficulty,
        elapsedDays: 0,
        scheduledDays: stability,
        reps: total,
        lapses: w,
        state: 'review',
        lastReview: lastReview,
        due: due,
        introducedAt: lastReview,
        lastRating: null,
        lastMode: null,
        source: 'migrated',
        version: MEMORY_SCHEMA_VERSION
    };
}

/**
 * Select top-N word stats by activity (c+w) for migration.
 * @param {object} wordStats RTDB users/{uid}/words map
 * @param {number} [maxN]
 * @returns {Array<{wordId:number,c:number,w:number,last:number,total:number}>}
 */
function selectTopWordStatsForMigrate(wordStats, maxN) {
    var limit = maxN == null ? MIGRATE_CONFIG.maxBootstrapCards : maxN;
    if (!wordStats || typeof wordStats !== 'object') return [];
    var rows = [];
    var keys = Object.keys(wordStats);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var row = wordStats[k] || {};
        var c = row.c || 0;
        var w = row.w || 0;
        var total = c + w;
        if (total <= 0) continue;
        rows.push({
            wordId: Number(k),
            c: c,
            w: w,
            last: row.last || 0,
            total: total
        });
    }
    rows.sort(function (a, b) {
        if (b.total !== a.total) return b.total - a.total;
        return a.wordId - b.wordId;
    });
    return rows.slice(0, limit);
}

class MemoryService {
    constructor() {
        /** @type {Map<number, object>} */
        this.cards = new Map();
        /** @type {Set<number>} */
        this.dirty = new Set();
        this.meta = {
            schemaVersion: MEMORY_SCHEMA_VERSION,
            migrationStatus: 'pending',
            migratedAt: null,
            migratedCards: 0,
            lastSync: null,
            lastError: null
        };
        this._loaded = false;
        this._uid = null;
        this._flushTimer = null;
        this._flushing = false;
        this._metaDirty = false;
        this._bindLifecycle();
        // Flag default is false via isMemoryEngineEnabled() — do not force-write
        // window.MEMORY_ENGINE_ENABLED so prefs.memoryEngineEnabled remains usable.
    }

    // --- Feature flag (read-only helper for callers) ---
    isEnabled() {
        return isMemoryEngineEnabled();
    }

    // --- Load / cache ---

    /**
     * Load cards from RTDB (preferred) or localStorage fallback.
     * Runs orphan-hold recovery when no active daily session.
     */
    async load() {
        var uid = this._resolveUid();
        if (!uid) {
            this._recoverLocalCache(null);
            this._loaded = true;
            return;
        }
        this._uid = uid;
        this._recoverLocalCache(uid);

        if (typeof db === 'undefined' || !db || !this._isOnline()) {
            // Offline / no db: keep local cache; still try orphan recovery offline
            await this._maybeRecoverOrphanHolds();
            this._loaded = true;
            return;
        }

        try {
            var base = 'users/' + uid;
            var memSnap = await db.ref(base + '/memory').once('value');
            var metaSnap = await db.ref(base + '/memoryMeta').once('value');
            var remote = memSnap.val() || {};
            var remoteMeta = metaSnap.val();

            if (remoteMeta && typeof remoteMeta === 'object') {
                this.meta = Object.assign({}, this.meta, remoteMeta);
            }

            // Merge remote over local (RTDB wins for clean keys; dirty local wins)
            var keys = Object.keys(remote);
            for (var i = 0; i < keys.length; i++) {
                var wid = Number(keys[i]);
                if (!Number.isFinite(wid)) continue;
                if (this.dirty.has(wid)) continue; // keep dirty local
                var card = this._normalizeCard(remote[keys[i]], wid);
                if (card) this.cards.set(wid, card);
            }

            this.meta.lastSync = Date.now();
            this._persistLocalCache();
            await this._maybeRecoverOrphanHolds();
            this._loaded = true;
            L('[Memory] Loaded', this.cards.size, 'cards; migrationStatus=', this.meta.migrationStatus);
        } catch (e) {
            L('[Memory] Load failed, using local cache', e);
            this.meta.lastError = String(e && e.message ? e.message : e);
            await this._maybeRecoverOrphanHolds();
            this._loaded = true;
        }
    }

    getCard(wordId) {
        var id = Number(wordId);
        if (!Number.isFinite(id)) return null;
        return this.cards.get(id) || null;
    }

    /**
     * Ensure a card exists (state 'new', introducedAt null). Does not mark dirty unless created.
     * @returns {object}
     */
    ensureCard(wordId) {
        var id = Number(wordId);
        var existing = this.cards.get(id);
        if (existing) return existing;
        var card = createNewMemoryCard(id);
        this.cards.set(id, card);
        this._markDirty(id);
        return card;
    }

    /**
     * First surface: set introducedAt if null. Does NOT schedule.
     */
    introduce(wordId, now) {
        var t = now == null ? Date.now() : now;
        var id = Number(wordId);
        var card = this.ensureCard(id);
        if (card.introducedAt == null) {
            card.introducedAt = t;
            if (card.source === 'bootstrap' && card.state === 'new') {
                // keep source bootstrap until first graded review
            }
            this.cards.set(id, card);
            this._markDirty(id);
        }
        return card;
    }

    /**
     * Grade a card via FSRS.schedule. Session Again sets sessionHold without short-due.
     * @param {number|string} wordId
     * @param {number|string} rating 1–4 or name
     * @param {string|null} mode
     * @param {number} [now]
     * @returns {object|null}
     */
    review(wordId, rating, mode, now) {
        var t = now == null ? Date.now() : now;
        var id = Number(wordId);
        if (!Number.isFinite(id)) return null;

        var fsrs = typeof window !== 'undefined' ? window.FSRS : null;
        if (!fsrs || typeof fsrs.schedule !== 'function') {
            L('[Memory] FSRS unavailable; review skipped');
            return null;
        }

        var card = this.ensureCard(id);
        var prevDue = card.due;
        var g;
        try {
            g = fsrs.normalizeRating ? fsrs.normalizeRating(rating) : Number(rating);
        } catch (e) {
            L('[Memory] Invalid rating', rating, e);
            return null;
        }

        // Build FSRS-shaped input
        var fsrsCard = {
            due: card.due,
            stability: card.stability,
            difficulty: card.difficulty,
            elapsedDays: card.elapsedDays,
            scheduledDays: card.scheduledDays,
            reps: card.reps,
            lapses: card.lapses,
            state: card.state,
            lastReview: card.lastReview
        };

        var next;
        try {
            next = fsrs.schedule(fsrsCard, g, t);
        } catch (e) {
            L('[Memory] schedule failed, reset to empty and retry', e);
            // Corrupt card: emergency reset (SM-2-style fallback per design)
            var empty = fsrs.createEmptyCard(t);
            next = fsrs.schedule(empty, g, t);
            card.source = 'fsrs';
        }

        var inSession = this._isDailySessionActive();
        var again = g === 1 || (fsrs.RATING && g === fsrs.RATING.Again);

        // Merge FSRS fields
        card.stability = next.stability;
        card.difficulty = next.difficulty;
        card.elapsedDays = next.elapsedDays;
        card.scheduledDays = next.scheduledDays;
        card.reps = next.reps;
        card.lapses = next.lapses;
        card.state = next.state;
        card.lastReview = next.lastReview;
        card.lastRating = g;
        card.lastMode = mode != null ? String(mode) : null;
        card.source = 'fsrs';
        card.version = MEMORY_SCHEMA_VERSION;
        if (card.introducedAt == null) card.introducedAt = t;

        if (again && inSession) {
            // Session Again: update S/D/reps/lapses/state but do NOT short-due
            card.due = prevDue;
            card.sessionHold = true;
            card.sessionHoldAt = t;
            card.sessionHoldRating = 1;
        } else {
            card.due = next.due;
            // Clear any prior hold on successful grade (or free-practice Again)
            if (card.sessionHold) {
                delete card.sessionHold;
                delete card.sessionHoldAt;
                delete card.sessionHoldRating;
            }
        }

        this.cards.set(id, card);
        this._markDirty(id);
        return card;
    }

    /**
     * Finalize all session-held cards (complete / abandon / orphan recovery).
     */
    finalizeSessionHolds(now) {
        var t = now == null ? Date.now() : now;
        var self = this;
        var held = [];
        this.cards.forEach(function (card, id) {
            if (card && card.sessionHold) held.push(id);
        });
        for (var i = 0; i < held.length; i++) {
            self.finalizeSessionRating(held[i], t);
        }
        return held.length;
    }

    /**
     * Clear hold on one card; set post-session Again due.
     */
    finalizeSessionRating(wordId, now) {
        var t = now == null ? Date.now() : now;
        var id = Number(wordId);
        var card = this.cards.get(id);
        if (!card || !card.sessionHold) return null;

        var cfg = (typeof window !== 'undefined' && window.MEMORY_CONFIG)
            ? window.MEMORY_CONFIG
            : (typeof MEMORY_CONFIG !== 'undefined' ? MEMORY_CONFIG : null);
        var postMs = (cfg && cfg.postSessionAgainDueMs) || (10 * 60 * 1000);

        delete card.sessionHold;
        delete card.sessionHoldAt;
        delete card.sessionHoldRating;
        card.due = t + postMs;
        card.scheduledDays = 0;
        this.cards.set(id, card);
        this._markDirty(id);
        return card;
    }

    /**
     * Due cards with due <= now, excluding sessionHold.
     * @param {number} [now]
     * @param {{limit?:number, filterFn?:function}} [opts]
     * @returns {object[]}
     */
    getDueCards(now, opts) {
        var t = now == null ? Date.now() : now;
        opts = opts || {};
        var limit = opts.limit;
        var filterFn = opts.filterFn;
        var out = [];
        this.cards.forEach(function (card) {
            if (!card || card.sessionHold) return;
            if (card.state === 'new' && card.introducedAt == null) return;
            if (card.due == null || card.due > t) return;
            if (filterFn && !filterFn(card)) return;
            out.push(card);
        });
        out.sort(function (a, b) {
            if (a.due !== b.due) return a.due - b.due;
            return a.wordId - b.wordId;
        });
        if (limit != null && limit >= 0) out = out.slice(0, limit);
        return out;
    }

    /**
     * Candidates never introduced from a vocab list.
     * @param {Array} list vocab items with .id
     * @param {{limit?:number}} [opts]
     * @returns {Array}
     */
    getNewCandidates(list, opts) {
        opts = opts || {};
        var limit = opts.limit;
        var out = [];
        if (!list || !list.length) return out;
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item || item.id == null) continue;
            var id = Number(item.id);
            var card = this.cards.get(id);
            if (!card || (card.introducedAt == null && (card.state === 'new' || !card.lastReview))) {
                out.push(item);
                if (limit != null && out.length >= limit) break;
            }
        }
        return out;
    }

    countDue(now, filterFn) {
        return this.getDueCards(now, { filterFn: filterFn }).length;
    }

    countNew(list) {
        return this.getNewCandidates(list || []).length;
    }

    /**
     * Apply wordStats map into memory (used by tests / force migrate path).
     * Does not write meta status; maybeMigrate owns that.
     * @param {object} wordStats
     * @param {number} [now]
     * @returns {number} cards created/updated
     */
    bootstrapFromWordStats(wordStats, now) {
        var t = now == null ? Date.now() : now;
        var rows = selectTopWordStatsForMigrate(wordStats, MIGRATE_CONFIG.maxBootstrapCards);
        var n = 0;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var existing = this.cards.get(row.wordId);
            // Never overwrite live FSRS cards
            if (existing && existing.source === 'fsrs') continue;
            var card = bootstrapCardFromStats(row.wordId, row, t);
            this.cards.set(row.wordId, card);
            this._markDirty(row.wordId);
            n++;
        }
        return n;
    }

    /**
     * Staggered migration from users/{uid}/words. Offline / read fail → leave pending.
     * Uses direct RTDB read (not analytics.getWordStats, which swallows errors as null).
     * Only mark done with 0 cards when the snapshot succeeds and history is empty.
     */
    async maybeMigrate() {
        if (this.meta.migrationStatus === 'done') return { status: 'done', migrated: 0 };

        if (!this._isOnline()) {
            L('[Memory] maybeMigrate offline no-op');
            return { status: 'pending', migrated: 0, reason: 'offline' };
        }

        var uid = this._resolveUid();
        if (!uid || typeof db === 'undefined' || !db) {
            return { status: 'pending', migrated: 0, reason: 'no-auth' };
        }

        var wordStats = null;
        try {
            // Direct RTDB: errors throw into catch → leave pending (do not treat as empty history).
            // analytics.getWordStats() returns null on failure and would falsely mark done.
            var snap = await db.ref('users/' + uid + '/words').once('value');
            wordStats = snap.val();
        } catch (e) {
            L('[Memory] maybeMigrate words read failed', e);
            this.meta.migrationStatus = 'pending';
            this.meta.lastError = String(e && e.message ? e.message : e);
            this._persistLocalCache();
            return { status: 'pending', migrated: 0, reason: 'stats-failed' };
        }

        // Successful read, no history (null or non-object empty)
        if (wordStats == null || typeof wordStats !== 'object' ||
            Object.keys(wordStats).length === 0) {
            this.meta.migrationStatus = 'done';
            this.meta.migratedAt = Date.now();
            this.meta.migratedCards = 0;
            this.meta.lastError = null;
            this._markMetaDirty();
            await this.flush();
            return { status: 'done', migrated: 0 };
        }

        this.meta.migrationStatus = 'pending';
        this._markMetaDirty();

        try {
            var n = this.bootstrapFromWordStats(wordStats, Date.now());
            // Chunked flush of dirty cards
            await this._flushDirtyChunked(MEMORY_MIGRATE_CHUNK);

            this.meta.migrationStatus = 'done';
            this.meta.migratedAt = Date.now();
            this.meta.migratedCards = (this.meta.migratedCards || 0) + n;
            this.meta.lastError = null;
            this._markMetaDirty();
            await this.flush();
            L('[Memory] Migration done:', n, 'cards');
            return { status: 'done', migrated: n };
        } catch (e) {
            L('[Memory] Migration failed', e);
            this.meta.migrationStatus = 'failed';
            this.meta.lastError = String(e && e.message ? e.message : e);
            this._markMetaDirty();
            this._persistLocalCache();
            return { status: 'failed', migrated: 0, error: this.meta.lastError };
        }
    }

    /**
     * Push dirty cards + meta to RTDB; always refresh localStorage.
     */
    async flush() {
        if (this._flushing) return;
        this._persistLocalCache();
        if (this.dirty.size === 0 && !this._metaDirty) return;

        var uid = this._resolveUid();
        if (!uid || typeof db === 'undefined' || !db || !this._isOnline()) {
            return; // stay dirty for later
        }

        this._flushing = true;
        try {
            await this._flushDirtyChunked(MEMORY_MIGRATE_CHUNK);
            if (this._metaDirty) {
                await db.ref('users/' + uid + '/memoryMeta').update(this._metaForWrite());
                this._metaDirty = false;
            }
            this.meta.lastSync = Date.now();
            this._persistLocalCache();
        } catch (e) {
            L('[Memory] Flush failed', e);
            this.meta.lastError = String(e && e.message ? e.message : e);
            this._persistLocalCache();
        } finally {
            this._flushing = false;
        }
    }

    /**
     * Admin/dev: wipe all memory cards; keep analytics c/w.
     */
    async resetAllKeepAnalytics() {
        var uid = this._resolveUid();
        this.cards.clear();
        this.dirty.clear();
        this.meta = {
            schemaVersion: MEMORY_SCHEMA_VERSION,
            migrationStatus: 'pending',
            migratedAt: null,
            migratedCards: 0,
            lastSync: null,
            lastError: null
        };
        this._metaDirty = true;
        try {
            localStorage.removeItem(MEMORY_CACHE_KEY);
            localStorage.removeItem(MEMORY_DIRTY_KEY);
        } catch (_) { /* ignore */ }

        if (uid && typeof db !== 'undefined' && db) {
            try {
                await db.ref('users/' + uid + '/memory').remove();
                await db.ref('users/' + uid + '/memoryMeta').set(this._metaForWrite());
            } catch (e) {
                L('[Memory] resetAllKeepAnalytics RTDB failed', e);
            }
        }
        this._persistLocalCache();
        L('[Memory] Reset complete (analytics preserved)');
    }

    /**
     * Admin/dev: re-run migration even if status is already 'done'.
     * Resets migrationStatus to pending, then calls maybeMigrate().
     * Does not wipe existing FSRS cards (bootstrapFromWordStats skips source:'fsrs').
     * @returns {Promise<{status:string,migrated:number,reason?:string,error?:string}>}
     */
    async forceMigrate() {
        this.meta.migrationStatus = 'pending';
        this.meta.lastError = null;
        this._markMetaDirty();
        this._persistLocalCache();
        L('[Memory] forceMigrate: status reset to pending');
        return await this.maybeMigrate();
    }

    /**
     * Admin/dev snapshot for Settings → Developer Memory panel.
     * Pure read of in-memory state + FSRS.REFERENCE; no I/O.
     * @returns {object}
     */
    getDebugSnapshot() {
        var now = Date.now();
        var byState = { new: 0, learning: 0, relearning: 0, review: 0, other: 0 };
        var bySource = { fsrs: 0, migrated: 0, bootstrap: 0, other: 0 };
        var sessionHold = 0;
        this.cards.forEach(function (c) {
            if (!c) return;
            if (c.sessionHold) sessionHold++;
            if (Object.prototype.hasOwnProperty.call(byState, c.state)) byState[c.state]++;
            else byState.other++;
            var src = c.source || 'other';
            if (Object.prototype.hasOwnProperty.call(bySource, src)) bySource[src]++;
            else bySource.other++;
        });
        var ref = null;
        try {
            if (typeof window !== 'undefined' && window.FSRS && window.FSRS.REFERENCE) {
                ref = window.FSRS.REFERENCE;
            }
        } catch (_) { /* ignore */ }
        return {
            fsrs: ref,
            engineEnabled: this.isEnabled(),
            schemaVersion: this.meta.schemaVersion || MEMORY_SCHEMA_VERSION,
            migrationStatus: this.meta.migrationStatus || 'pending',
            migratedAt: this.meta.migratedAt || null,
            migratedCards: this.meta.migratedCards || 0,
            lastSync: this.meta.lastSync || null,
            lastError: this.meta.lastError || null,
            cardCount: this.cards.size,
            byState: byState,
            bySource: bySource,
            sessionHoldCount: sessionHold,
            dirtyCount: this.dirty.size,
            metaDirty: !!this._metaDirty,
            dueCount: this.countDue(now),
            loaded: !!this._loaded
        };
    }

    // --- Internals ---

    _resolveUid() {
        try {
            if (typeof auth !== 'undefined' && auth && auth.currentUser) {
                return auth.currentUser.uid;
            }
        } catch (_) { /* ignore */ }
        return this._uid;
    }

    _isOnline() {
        try {
            if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
                return false;
            }
        } catch (_) { /* ignore */ }
        return true;
    }

    _isDailySessionActive() {
        try {
            if (typeof app === 'undefined' || !app || !app.dailySession) return false;
            var ds = app.dailySession;
            if (ds._isStub) return false;
            if (ds._ownsMemoryReviews) return true;
            if (typeof ds.isActive === 'function') return !!ds.isActive();
            if (ds.isActive) return true;
        } catch (_) { /* ignore */ }
        return false;
    }

    _markDirty(wordId) {
        this.dirty.add(Number(wordId));
        this._persistDirtySet();
        this._persistLocalCache();
    }

    _markMetaDirty() {
        this._metaDirty = true;
        this._persistLocalCache();
    }

    _metaForWrite() {
        return {
            schemaVersion: this.meta.schemaVersion || MEMORY_SCHEMA_VERSION,
            migrationStatus: this.meta.migrationStatus || 'pending',
            migratedAt: this.meta.migratedAt || null,
            migratedCards: this.meta.migratedCards || 0,
            lastSync: this.meta.lastSync || null,
            lastError: this.meta.lastError || null
        };
    }

    _normalizeCard(raw, wordId) {
        if (!raw || typeof raw !== 'object') return null;
        var id = wordId != null ? Number(wordId) : Number(raw.wordId);
        if (!Number.isFinite(id)) return null;
        var card = {
            wordId: id,
            stability: Number(raw.stability) || 0,
            difficulty: Number(raw.difficulty) || 0,
            elapsedDays: Number(raw.elapsedDays) || 0,
            scheduledDays: Number(raw.scheduledDays) || 0,
            reps: Number(raw.reps) || 0,
            lapses: Number(raw.lapses) || 0,
            state: raw.state || 'new',
            lastReview: raw.lastReview == null ? null : Number(raw.lastReview),
            due: raw.due != null ? Number(raw.due) : Date.now(),
            introducedAt: raw.introducedAt == null ? null : Number(raw.introducedAt),
            lastRating: raw.lastRating == null ? null : Number(raw.lastRating),
            lastMode: raw.lastMode == null ? null : String(raw.lastMode),
            source: raw.source || 'bootstrap',
            version: raw.version || MEMORY_SCHEMA_VERSION
        };
        if (raw.sessionHold) {
            card.sessionHold = true;
            card.sessionHoldAt = raw.sessionHoldAt != null ? Number(raw.sessionHoldAt) : null;
            card.sessionHoldRating = raw.sessionHoldRating != null ? Number(raw.sessionHoldRating) : 1;
        }
        return card;
    }

    _persistLocalCache() {
        try {
            var uid = this._resolveUid();
            var obj = { uid: uid, meta: this._metaForWrite(), cards: {}, savedAt: Date.now() };
            this.cards.forEach(function (card, id) {
                obj.cards[id] = card;
            });
            localStorage.setItem(MEMORY_CACHE_KEY, JSON.stringify(obj));
        } catch (e) { /* quota / private mode */ }
    }

    _persistDirtySet() {
        try {
            var payload = {
                uid: this._resolveUid() || null,
                ids: Array.from(this.dirty)
            };
            localStorage.setItem(MEMORY_DIRTY_KEY, JSON.stringify(payload));
        } catch (e) { /* ignore */ }
    }

    _recoverLocalCache(uid) {
        try {
            var raw = localStorage.getItem(MEMORY_CACHE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (uid && parsed.uid && parsed.uid !== uid) {
                        // Different user — drop cache + dirty for previous owner
                        this.cards.clear();
                        this.dirty.clear();
                        try {
                            localStorage.removeItem(MEMORY_CACHE_KEY);
                            localStorage.removeItem(MEMORY_DIRTY_KEY);
                        } catch (_) { /* ignore */ }
                        return;
                    }
                    if (parsed.meta) this.meta = Object.assign({}, this.meta, parsed.meta);
                    if (parsed.cards && typeof parsed.cards === 'object') {
                        var keys = Object.keys(parsed.cards);
                        for (var i = 0; i < keys.length; i++) {
                            var card = this._normalizeCard(parsed.cards[keys[i]], keys[i]);
                            if (card) this.cards.set(card.wordId, card);
                        }
                    }
                }
            }
            var dirtyRaw = localStorage.getItem(MEMORY_DIRTY_KEY);
            if (dirtyRaw) {
                var dirtyParsed = JSON.parse(dirtyRaw);
                var dirtyIds = null;
                if (Array.isArray(dirtyParsed)) {
                    // Legacy bare array
                    dirtyIds = dirtyParsed;
                } else if (dirtyParsed && typeof dirtyParsed === 'object') {
                    if (uid && dirtyParsed.uid && dirtyParsed.uid !== uid) {
                        try { localStorage.removeItem(MEMORY_DIRTY_KEY); } catch (_) { /* ignore */ }
                        dirtyIds = null;
                    } else {
                        dirtyIds = Array.isArray(dirtyParsed.ids) ? dirtyParsed.ids : null;
                    }
                }
                if (dirtyIds) {
                    for (var j = 0; j < dirtyIds.length; j++) {
                        var did = Number(dirtyIds[j]);
                        if (Number.isFinite(did)) this.dirty.add(did);
                    }
                }
            }
        } catch (e) { /* ignore parse errors */ }
    }

    async _flushDirtyChunked(chunkSize) {
        var uid = this._resolveUid();
        if (!uid || typeof db === 'undefined' || !db) return;
        var ids = Array.from(this.dirty);
        if (ids.length === 0) return;

        var size = chunkSize || MEMORY_MIGRATE_CHUNK;
        for (var offset = 0; offset < ids.length; offset += size) {
            var slice = ids.slice(offset, offset + size);
            var updates = {};
            for (var i = 0; i < slice.length; i++) {
                var id = slice[i];
                var card = this.cards.get(id);
                if (!card) {
                    this.dirty.delete(id);
                    continue;
                }
                // Firebase rejects undefined; strip hold fields when false
                var payload = {
                    wordId: card.wordId,
                    stability: card.stability,
                    difficulty: card.difficulty,
                    elapsedDays: card.elapsedDays,
                    scheduledDays: card.scheduledDays,
                    reps: card.reps,
                    lapses: card.lapses,
                    state: card.state,
                    lastReview: card.lastReview == null ? null : card.lastReview,
                    due: card.due,
                    introducedAt: card.introducedAt == null ? null : card.introducedAt,
                    lastRating: card.lastRating == null ? null : card.lastRating,
                    lastMode: card.lastMode == null ? null : card.lastMode,
                    source: card.source || 'fsrs',
                    version: card.version || MEMORY_SCHEMA_VERSION
                };
                if (card.sessionHold) {
                    payload.sessionHold = true;
                    payload.sessionHoldAt = card.sessionHoldAt || null;
                    payload.sessionHoldRating = card.sessionHoldRating || 1;
                } else {
                    // Clear hold fields in RTDB if previously set
                    payload.sessionHold = null;
                    payload.sessionHoldAt = null;
                    payload.sessionHoldRating = null;
                }
                updates['users/' + uid + '/memory/' + id] = payload;
            }
            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
            }
            for (var k = 0; k < slice.length; k++) this.dirty.delete(slice[k]);
            this._persistDirtySet();
        }
    }

    /**
     * Orphan-hold recovery: finalize sessionHold cards only when we positively know
     * today's plan is not active. Fail closed when offline or status read fails —
     * leave holds for Continue / later online load (design §1.6).
     */
    async _maybeRecoverOrphanHolds() {
        var hasHold = false;
        this.cards.forEach(function (c) {
            if (c && c.sessionHold) hasHold = true;
        });
        if (!hasHold) return;

        if (this._isDailySessionActive()) return;

        // Fail closed: cannot prove plan is inactive offline or without db
        var uid = this._resolveUid();
        if (!uid || typeof db === 'undefined' || !db || !this._isOnline()) {
            L('[Memory] orphan-hold recovery deferred (offline/unknown plan status)');
            return;
        }

        var status = undefined;
        try {
            var today = this._getTodayKey();
            var snap = await db.ref('users/' + uid + '/dailySessions/' + today + '/status').once('value');
            status = snap.val(); // null if no session row; 'active'|'completed'|'abandoned'
        } catch (e) {
            L('[Memory] orphan-hold dailySession check failed; leaving holds', e);
            return;
        }

        // Keep holds while plan is still active (pause leaves status active)
        if (status === 'active') return;

        var n = this.finalizeSessionHolds(Date.now());
        if (n > 0) {
            L('[Memory] Orphan-hold recovery finalized', n, 'cards');
            await this.flush();
        }
    }

    _getTodayKey() {
        var d = new Date();
        var offset = d.getTimezoneOffset() * 60000;
        return (new Date(d - offset)).toISOString().slice(0, 10);
    }

    _bindLifecycle() {
        var self = this;
        this._flushTimer = setInterval(function () {
            self.flush();
        }, MEMORY_FLUSH_INTERVAL_MS);

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'hidden') {
                    self._persistLocalCache();
                    self.flush();
                }
            });
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', function () {
                self._persistLocalCache();
            });
        }
    }
}

// Multi-script exports (explicit window — AGENTS.md / design §3.6)
// Do not force-write MEMORY_ENGINE_ENABLED here; default false via isMemoryEngineEnabled().
if (typeof window !== 'undefined') {
    window.MemoryService = MemoryService;
    window.MIGRATE_CONFIG = MIGRATE_CONFIG;
    window.bootstrapCardFromStats = bootstrapCardFromStats;
    window.createNewMemoryCard = createNewMemoryCard;
    window.selectTopWordStatsForMigrate = selectTopWordStatsForMigrate;
    window.isMemoryEngineEnabled = isMemoryEngineEnabled;
}
