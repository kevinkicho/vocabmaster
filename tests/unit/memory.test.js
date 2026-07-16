import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..', '..');
const fsrsSrc = readFileSync(join(root, 'public', 'js', 'fsrs.js'), 'utf8');
const memorySrc = readFileSync(join(root, 'public', 'js', 'memory.js'), 'utf8');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2024, 0, 1, 12, 0, 0);

let MIGRATE_CONFIG, bootstrapCardFromStats, createNewMemoryCard;
let selectTopWordStatsForMigrate, isMemoryEngineEnabled;
let MemoryService, FSRS, MEMORY_CONFIG;

// Minimal localStorage / env for MemoryService
function makeLocalStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => { store.clear(); }
    };
}

beforeAll(() => {
    const win = {
        MEMORY_ENGINE_ENABLED: false,
        addEventListener: () => {}
    };
    // Provide localStorage on globalThis for MemoryService constructor
    globalThis.localStorage = makeLocalStorage();
    globalThis.L = () => {};
    globalThis.document = { addEventListener: () => {}, visibilityState: 'visible' };
    try {
        Object.defineProperty(globalThis, 'navigator', {
            value: { onLine: true },
            configurable: true,
            writable: true
        });
    } catch (_) {
        // Node may expose a non-configurable navigator; online tests use default
    }

    const fn = new Function(
        'window',
        fsrsSrc +
            '\n' +
            memorySrc +
            '\nreturn { MIGRATE_CONFIG, bootstrapCardFromStats, createNewMemoryCard, selectTopWordStatsForMigrate, isMemoryEngineEnabled, MemoryService, FSRS, MEMORY_CONFIG, MEMORY_ENGINE_ENABLED: window.MEMORY_ENGINE_ENABLED };'
    );
    const result = fn(win);
    MIGRATE_CONFIG = result.MIGRATE_CONFIG;
    bootstrapCardFromStats = result.bootstrapCardFromStats;
    createNewMemoryCard = result.createNewMemoryCard;
    selectTopWordStatsForMigrate = result.selectTopWordStatsForMigrate;
    isMemoryEngineEnabled = result.isMemoryEngineEnabled;
    MemoryService = result.MemoryService;
    FSRS = result.FSRS;
    MEMORY_CONFIG = result.MEMORY_CONFIG;
    // Re-bind globals used inside MemoryService methods when run via new Function
    globalThis.window = win;
    win.FSRS = FSRS;
    win.MEMORY_CONFIG = MEMORY_CONFIG;
    win.MemoryService = MemoryService;
    win.MEMORY_ENGINE_ENABLED = false;
});

beforeEach(() => {
    globalThis.localStorage = makeLocalStorage();
    delete globalThis.window.MEMORY_ENGINE_ENABLED;
    globalThis.app = undefined;
    globalThis.auth = undefined;
    globalThis.db = undefined;
});

describe('MIGRATE_CONFIG', () => {
    it('has expected v1 constants', () => {
        expect(MIGRATE_CONFIG.maxBootstrapCards).toBe(200);
        expect(MIGRATE_CONFIG.staggerDays).toBe(7);
        expect(MIGRATE_CONFIG.virtualReviewIfAccuracyGte).toBe(0.8);
        expect(MIGRATE_CONFIG.virtualReviewMinTotal).toBe(5);
    });
});

describe('bootstrapCardFromStats', () => {
    it('returns new card for zero total', () => {
        const card = bootstrapCardFromStats(42, { c: 0, w: 0 }, T0);
        expect(card.wordId).toBe(42);
        expect(card.state).toBe('new');
        expect(card.source).toBe('bootstrap');
        expect(card.introducedAt).toBeNull();
    });

    it('sets state review and source migrated for practiced words', () => {
        const card = bootstrapCardFromStats(7, { c: 3, w: 2, last: T0 - MS_PER_DAY }, T0);
        expect(card.state).toBe('review');
        expect(card.source).toBe('migrated');
        expect(card.reps).toBe(5);
        expect(card.lapses).toBe(2);
        expect(card.introducedAt).toBe(T0 - MS_PER_DAY);
    });

    it('virtual-reviews high accuracy so not immediately due', () => {
        const card = bootstrapCardFromStats(
            10,
            { c: 8, w: 2, last: T0 - 30 * MS_PER_DAY },
            T0
        );
        // accuracy 0.8, total 10 → virtual review: due = now + stability*day
        expect(card.due).toBeGreaterThan(T0);
        expect(card.stability).toBe(14);
    });

    it('staggers overdue low-accuracy cards by wordId % staggerDays', () => {
        const last = T0 - 60 * MS_PER_DAY;
        const card0 = bootstrapCardFromStats(0, { c: 1, w: 4, last }, T0);
        const card1 = bootstrapCardFromStats(1, { c: 1, w: 4, last }, T0);
        // Both overdue; idStagger differs by 1 day
        expect(card0.due).toBe(T0); // 0 % 7 = 0
        expect(card1.due).toBe(T0 + MS_PER_DAY); // 1 % 7 = 1
    });

    it('sets difficulty lower for high accuracy', () => {
        const high = bootstrapCardFromStats(1, { c: 9, w: 1 }, T0);
        const low = bootstrapCardFromStats(2, { c: 1, w: 9 }, T0);
        expect(high.difficulty).toBeLessThan(low.difficulty);
    });
});

describe('selectTopWordStatsForMigrate', () => {
    it('ranks by c+w and caps at max', () => {
        const stats = {
            1: { c: 1, w: 0 },
            2: { c: 5, w: 5 },
            3: { c: 0, w: 0 },
            4: { c: 3, w: 1 }
        };
        const rows = selectTopWordStatsForMigrate(stats, 2);
        expect(rows).toHaveLength(2);
        expect(rows[0].wordId).toBe(2);
        expect(rows[0].total).toBe(10);
        expect(rows[1].wordId).toBe(4);
    });

    it('returns empty for null/empty', () => {
        expect(selectTopWordStatsForMigrate(null)).toEqual([]);
        expect(selectTopWordStatsForMigrate({})).toEqual([]);
    });
});

describe('isMemoryEngineEnabled', () => {
    it('defaults false when window flag unset', () => {
        delete globalThis.window.MEMORY_ENGINE_ENABLED;
        expect(isMemoryEngineEnabled()).toBe(false);
    });

    it('reads window flag when boolean', () => {
        globalThis.window.MEMORY_ENGINE_ENABLED = true;
        expect(isMemoryEngineEnabled()).toBe(true);
        globalThis.window.MEMORY_ENGINE_ENABLED = false;
        expect(isMemoryEngineEnabled()).toBe(false);
    });

    it('falls back to prefs when window flag unset', () => {
        delete globalThis.window.MEMORY_ENGINE_ENABLED;
        globalThis.app = { store: { prefs: { memoryEngineEnabled: true } } };
        expect(isMemoryEngineEnabled()).toBe(true);
        globalThis.app = undefined;
    });
});

describe('MemoryService core', () => {
    let mem;

    beforeEach(() => {
        globalThis.localStorage = makeLocalStorage();
        // no auth/db
        globalThis.auth = undefined;
        globalThis.db = undefined;
        mem = new MemoryService();
    });

    it('ensureCard creates new card', () => {
        const c = mem.ensureCard(99);
        expect(c.wordId).toBe(99);
        expect(c.state).toBe('new');
        expect(mem.getCard(99)).toBe(c);
    });

    it('introduce sets introducedAt without scheduling', () => {
        const c = mem.introduce(5, T0);
        expect(c.introducedAt).toBe(T0);
        expect(c.state).toBe('new');
        expect(c.lastReview).toBeNull();
    });

    it('review Good schedules via FSRS and marks dirty', () => {
        const c = mem.review(11, 3, 'quiz', T0);
        expect(c).toBeTruthy();
        expect(c.source).toBe('fsrs');
        expect(c.lastRating).toBe(3);
        expect(c.lastMode).toBe('quiz');
        expect(c.introducedAt).toBe(T0);
        expect(c.due).toBeGreaterThanOrEqual(T0);
        expect(mem.dirty.has(11)).toBe(true);
    });

    it('getDueCards excludes sessionHold', () => {
        mem.review(1, 1, 'quiz', T0); // Again free-practice → short due
        // Force a held card
        const held = mem.ensureCard(2);
        held.due = T0 - 1000;
        held.state = 'review';
        held.sessionHold = true;
        held.introducedAt = T0 - MS_PER_DAY;
        mem.cards.set(2, held);

        const due = mem.getDueCards(T0 + 20 * 60 * 1000);
        const ids = due.map((c) => c.wordId);
        expect(ids).toContain(1);
        expect(ids).not.toContain(2);
    });

    it('finalizeSessionRating clears hold and sets post-session due', () => {
        const card = mem.ensureCard(3);
        card.sessionHold = true;
        card.sessionHoldAt = T0;
        card.sessionHoldRating = 1;
        card.due = T0 - 5000;
        mem.cards.set(3, card);

        mem.finalizeSessionRating(3, T0);
        const after = mem.getCard(3);
        expect(after.sessionHold).toBeUndefined();
        expect(after.due).toBe(T0 + MEMORY_CONFIG.postSessionAgainDueMs);
    });

    it('getNewCandidates skips introduced words', () => {
        mem.introduce(1, T0);
        const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const candidates = mem.getNewCandidates(list, { limit: 10 });
        expect(candidates.map((x) => x.id)).toEqual([2, 3]);
    });

    it('bootstrapFromWordStats does not overwrite source fsrs', () => {
        mem.review(8, 3, 'quiz', T0);
        expect(mem.getCard(8).source).toBe('fsrs');
        const n = mem.bootstrapFromWordStats({ 8: { c: 10, w: 0, last: T0 } }, T0);
        expect(n).toBe(0);
        expect(mem.getCard(8).source).toBe('fsrs');
    });

    it('bootstrapFromWordStats creates migrated cards for top stats', () => {
        const stats = {
            1: { c: 5, w: 1, last: T0 },
            2: { c: 2, w: 2, last: T0 }
        };
        const n = mem.bootstrapFromWordStats(stats, T0);
        expect(n).toBe(2);
        expect(mem.getCard(1).source).toBe('migrated');
        expect(mem.getCard(1).state).toBe('review');
    });

    it('maybeMigrate is offline no-op', async () => {
        const orig = mem._isOnline.bind(mem);
        mem._isOnline = () => false;
        const result = await mem.maybeMigrate();
        expect(result.status).toBe('pending');
        expect(result.reason).toBe('offline');
        expect(mem.meta.migrationStatus).toBe('pending');
        mem._isOnline = orig;
    });

    it('maybeMigrate leaves pending when words read throws', async () => {
        globalThis.auth = { currentUser: { uid: 'u1' } };
        globalThis.db = {
            ref: () => ({
                once: async () => { throw new Error('network'); }
            })
        };
        mem._uid = 'u1';
        mem._isOnline = () => true;
        const result = await mem.maybeMigrate();
        expect(result.status).toBe('pending');
        expect(result.reason).toBe('stats-failed');
        expect(mem.meta.migrationStatus).toBe('pending');
    });

    it('maybeMigrate marks done only on successful empty words snapshot', async () => {
        globalThis.auth = { currentUser: { uid: 'u1' } };
        globalThis.db = {
            ref: (path) => ({
                once: async () => ({ val: () => null }),
                update: async () => {},
                set: async () => {}
            })
        };
        // flush/meta writes also use db.ref().update
        globalThis.db.ref = function (path) {
            return {
                once: async () => ({ val: () => null }),
                update: async () => {},
                set: async () => {}
            };
        };
        // Multi-path update: db.ref().update
        const rootRef = {
            update: async () => {},
            once: async () => ({ val: () => null }),
            set: async () => {}
        };
        globalThis.db.ref = function () { return rootRef; };
        mem._uid = 'u1';
        mem._isOnline = () => true;
        const result = await mem.maybeMigrate();
        expect(result.status).toBe('done');
        expect(result.migrated).toBe(0);
        expect(mem.meta.migrationStatus).toBe('done');
    });

    it('countDue excludes holds', () => {
        const held = mem.ensureCard(20);
        held.due = T0 - 1;
        held.state = 'review';
        held.introducedAt = T0;
        held.sessionHold = true;
        mem.cards.set(20, held);

        const open = mem.ensureCard(21);
        open.due = T0 - 1;
        open.state = 'review';
        open.introducedAt = T0;
        mem.cards.set(21, open);

        expect(mem.countDue(T0)).toBe(1);
    });

    it('session Again sets sessionHold without short-due', () => {
        globalThis.app = {
            dailySession: { isActive: () => true, _ownsMemoryReviews: true }
        };
        const before = mem.ensureCard(30);
        before.due = T0 + 5 * MS_PER_DAY;
        before.state = 'review';
        before.stability = 5;
        before.difficulty = 5;
        before.reps = 3;
        before.lapses = 0;
        before.lastReview = T0 - MS_PER_DAY;
        before.introducedAt = T0 - 10 * MS_PER_DAY;
        mem.cards.set(30, before);
        const prevDue = before.due;

        const c = mem.review(30, 1, 'quiz', T0);
        expect(c.sessionHold).toBe(true);
        expect(c.sessionHoldRating).toBe(1);
        expect(c.due).toBe(prevDue);
        expect(c.lapses).toBe(1);
        // Not in due set while held
        expect(mem.getDueCards(T0 + 1).map((x) => x.wordId)).not.toContain(30);

        // Later Good clears hold and sets real due
        const good = mem.review(30, 3, 'quiz', T0 + 1000);
        expect(good.sessionHold).toBeUndefined();
        expect(good.due).toBeGreaterThan(T0);

        globalThis.app = undefined;
    });

    it('orphan-hold recovery defers offline (does not finalize)', async () => {
        const held = mem.ensureCard(40);
        held.sessionHold = true;
        held.sessionHoldAt = T0;
        held.sessionHoldRating = 1;
        held.due = T0 - 1000;
        held.state = 'review';
        held.introducedAt = T0;
        mem.cards.set(40, held);

        mem._isOnline = () => false;
        mem._uid = 'u1';
        await mem._maybeRecoverOrphanHolds();
        expect(mem.getCard(40).sessionHold).toBe(true);
    });

    it('orphan-hold recovery defers when status read fails', async () => {
        const held = mem.ensureCard(41);
        held.sessionHold = true;
        held.due = T0 - 1000;
        held.state = 'review';
        held.introducedAt = T0;
        mem.cards.set(41, held);

        mem._isOnline = () => true;
        mem._uid = 'u1';
        globalThis.db = {
            ref: () => ({
                once: async () => { throw new Error('rtdb down'); }
            })
        };
        await mem._maybeRecoverOrphanHolds();
        expect(mem.getCard(41).sessionHold).toBe(true);
    });

    it('orphan-hold recovery keeps holds when plan status is active', async () => {
        const held = mem.ensureCard(42);
        held.sessionHold = true;
        held.due = T0 - 1000;
        held.state = 'review';
        held.introducedAt = T0;
        mem.cards.set(42, held);

        mem._isOnline = () => true;
        mem._uid = 'u1';
        globalThis.db = {
            ref: () => ({
                once: async () => ({ val: () => 'active' })
            })
        };
        await mem._maybeRecoverOrphanHolds();
        expect(mem.getCard(42).sessionHold).toBe(true);
    });

    it('orphan-hold recovery finalizes when status known non-active', async () => {
        const held = mem.ensureCard(43);
        held.sessionHold = true;
        held.due = T0 - 1000;
        held.state = 'review';
        held.introducedAt = T0;
        mem.cards.set(43, held);

        mem._isOnline = () => true;
        mem._uid = 'u1';
        globalThis.db = {
            ref: () => ({
                once: async () => ({ val: () => 'completed' }),
                update: async () => {}
            })
        };
        // flush uses db.ref().update
        globalThis.db.ref = function () {
            return {
                once: async () => ({ val: () => 'completed' }),
                update: async () => {}
            };
        };
        await mem._maybeRecoverOrphanHolds();
        expect(mem.getCard(43).sessionHold).toBeUndefined();
    });

    it('uid mismatch clears dirty localStorage', () => {
        globalThis.localStorage.setItem('vm_memory_cache_v1', JSON.stringify({
            uid: 'old-user',
            meta: { migrationStatus: 'done' },
            cards: { 1: { wordId: 1, state: 'review', due: T0, stability: 1, difficulty: 5 } }
        }));
        globalThis.localStorage.setItem('vm_memory_dirty_v1', JSON.stringify({
            uid: 'old-user',
            ids: [1, 2, 3]
        }));
        mem._recoverLocalCache('new-user');
        expect(mem.cards.size).toBe(0);
        expect(mem.dirty.size).toBe(0);
        expect(globalThis.localStorage.getItem('vm_memory_cache_v1')).toBeNull();
        expect(globalThis.localStorage.getItem('vm_memory_dirty_v1')).toBeNull();
    });
});
