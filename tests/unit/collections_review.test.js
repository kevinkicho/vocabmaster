import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..', '..');
const dataSrc = readFileSync(join(root, 'public', 'js', 'data.js'), 'utf8');
const adaptiveSrc = readFileSync(join(root, 'public', 'js', 'adaptive.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'public', 'js', 'main.js'), 'utf8');
const fsrsSrc = readFileSync(join(root, 'public', 'js', 'fsrs.js'), 'utf8');
const memorySrc = readFileSync(join(root, 'public', 'js', 'memory.js'), 'utf8');

let DataService;
let selectWordsForReview;
let MemoryService;
let mockAppForData;
const NOW = 1_700_000_000_000;

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
    // Eval adaptive for review tests
    const adaptFn = new Function(adaptiveSrc + '\nreturn { selectWordsForReview };');
    const adaptResult = adaptFn();
    selectWordsForReview = adaptResult.selectWordsForReview;

    // Make available for global lookup inside DataService.getReviewWords
    globalThis.selectWordsForReview = selectWordsForReview;

    // Load FSRS + MemoryService for integration-style tests
    globalThis.localStorage = makeLocalStorage();
    globalThis.L = () => {};
    globalThis.document = { addEventListener: () => {}, visibilityState: 'visible' };
    const win = {
        MEMORY_ENGINE_ENABLED: false,
        addEventListener: () => {}
    };
    const memFn = new Function(
        'window',
        fsrsSrc + '\n' + memorySrc + '\nreturn { MemoryService, FSRS };'
    );
    const memResult = memFn(win);
    MemoryService = memResult.MemoryService;
    win.FSRS = memResult.FSRS;
    win.MemoryService = MemoryService;
    globalThis.window = win;

    // Create a mutable app object that will be closed over by DataService methods
    mockAppForData = {
        store: { prefs: { levelFilter: ['all'] } },
        analytics: { getMostMissedWords: async () => [] },
        memory: null
    };
    // DataService methods close over `app` from the Function param
    globalThis.app = mockAppForData;

    const dataFn = new Function('app', dataSrc + '\nreturn { DataService };');
    const dataResult = dataFn(mockAppForData);
    DataService = dataResult.DataService;
});

function makeDueCard(wordId, due, extra = {}) {
    return {
        wordId,
        due,
        state: 'review',
        stability: 1,
        difficulty: 5,
        introducedAt: due - 86400000,
        ...extra
    };
}

describe('DataService filtering (level / tag)', () => {
    let data;

    beforeEach(() => {
        mockAppForData.store = { prefs: { levelFilter: ['all'] } };
        mockAppForData.analytics = { getMostMissedWords: async () => [] };
        mockAppForData.memory = null;
        globalThis.window = globalThis.window || {};
        globalThis.window.MEMORY_ENGINE_ENABLED = false;
        globalThis.selectWordsForReview = selectWordsForReview;

        data = new DataService();
        mockAppForData.data = data;
        data.list = [
            { id: 1, tags: ['N3'], en: 'cat' },
            { id: 2, tags: ['N5'], en: 'dog' },
            { id: 99, tags: ['N3'], en: 'weak' }
        ];
    });

    it('getFilteredList returns full list when levelFilter is all', () => {
        const filtered = data.getFilteredList();
        expect(filtered).toHaveLength(3);
    });

    it('getFilteredList respects levelFilter', () => {
        mockAppForData.store.prefs.levelFilter = ['N3'];
        const filtered = data.getFilteredList();
        expect(filtered.every(w => w.tags && w.tags.includes('N3'))).toBe(true);
        expect(filtered.map(w => w.id).sort()).toEqual([1, 99]);
    });
});

describe('DataService getReviewWords — adaptive / most-missed fallback', () => {
    let data;

    beforeEach(() => {
        mockAppForData.store = { prefs: { levelFilter: ['all'] } };
        mockAppForData.analytics = {
            getMostMissedWords: async () => [
                { id: 99, c: 0, w: 5, vocab: { id: 99, tags: ['N3'], en: 'weak' } }
            ]
        };
        mockAppForData.memory = null;
        globalThis.window = globalThis.window || {};
        globalThis.window.MEMORY_ENGINE_ENABLED = false;
        globalThis.selectWordsForReview = selectWordsForReview;

        data = new DataService();
        mockAppForData.data = data;
        data.list = [
            { id: 1, tags: ['N3'], en: 'cat' },
            { id: 2, tags: ['N5'], en: 'dog' },
            { id: 99, tags: ['N3'], en: 'weak' }
        ];
    });

    it('getReviewWords uses adaptive + missed when memory off', async () => {
        const review = await data.getReviewWords(5);
        expect(review.some(w => w.id === 99 || w.en === 'weak')).toBe(true);
        expect(review.length).toBeGreaterThan(0);
        expect(review.length).toBeLessThanOrEqual(5);
    });

    it('startReviewSession / endReviewSession set and clear _reviewList', async () => {
        const ok = await data.startReviewSession(2);
        expect(ok).toBe(true);
        expect(Array.isArray(data._reviewList)).toBe(true);
        expect(data._reviewList.length).toBeGreaterThan(0);
        expect(data._reviewList.length).toBeLessThanOrEqual(2);
        expect(data.activeList).toBe(data._reviewList);
        data.endReviewSession();
        expect(data._reviewList).toBeNull();
        expect(data.activeList).toBe(data.list);
    });

    it('startSpecificReview from Story words works', () => {
        const storyWords = [{ id: 42, tags: ['N3'], en: 'storyword' }];
        const ok = data.startSpecificReview(storyWords);
        expect(ok).toBe(true);
        expect(data._reviewList[0].en).toBe('storyword');
        expect(data.activeList[0].en).toBe('storyword');
        data.endReviewSession();
    });

    it('most-missed fallback without adaptive stays in filtered universe', async () => {
        // Simulate adaptive.js not loaded
        const saved = globalThis.selectWordsForReview;
        delete globalThis.selectWordsForReview;

        mockAppForData.store.prefs.levelFilter = ['N3'];
        mockAppForData.analytics = {
            getMostMissedWords: async () => [
                // Out of universe (N5) — must not appear
                { id: 2, c: 0, w: 9, vocab: { id: 2, tags: ['N5'], en: 'dog' } },
                // In universe
                { id: 99, c: 0, w: 5, vocab: { id: 99, tags: ['N3'], en: 'weak' } },
                { id: 1, c: 1, w: 3, vocab: { id: 1, tags: ['N3'], en: 'cat' } }
            ]
        };

        try {
            const review = await data.getReviewWords(5);
            const ids = review.map(w => Number(w.id));
            expect(ids).toContain(99);
            expect(ids).toContain(1);
            expect(ids).not.toContain(2);
            expect(new Set(ids).size).toBe(ids.length);
        } finally {
            globalThis.selectWordsForReview = saved;
        }
    });
});

describe('DataService getReviewWords — memory due-first (PR4)', () => {
    let data;

    beforeEach(() => {
        mockAppForData.store = { prefs: { levelFilter: ['all'] } };
        mockAppForData.analytics = {
            getMostMissedWords: async () => [
                { id: 99, c: 0, w: 5, vocab: { id: 99, tags: ['N3'], en: 'weak' } },
                { id: 2, c: 1, w: 4, vocab: { id: 2, tags: ['N5'], en: 'dog' } }
            ]
        };
        globalThis.window = globalThis.window || {};
        globalThis.window.MEMORY_ENGINE_ENABLED = true;
        globalThis.selectWordsForReview = selectWordsForReview;

        data = new DataService();
        mockAppForData.data = data;
        data.list = [
            { id: 1, tags: ['N3'], en: 'cat' },
            { id: 2, tags: ['N5'], en: 'dog' },
            { id: 3, tags: ['N3'], en: 'bird' },
            { id: 99, tags: ['N3'], en: 'weak' }
        ];
    });

    it('prefers FSRS due cards when memory is enabled', async () => {
        const dueCards = [
            makeDueCard(3, NOW - 1000),
            makeDueCard(1, NOW - 500)
        ];
        let filterFnSeen = null;
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: (now, opts) => {
                expect(opts.limit).toBe(5);
                expect(typeof opts.filterFn).toBe('function');
                filterFnSeen = opts.filterFn;
                // filterFn receives card objects (wordId), not bare ids
                expect(opts.filterFn(makeDueCard(3, NOW))).toBe(true);
                expect(opts.filterFn(3)).toBe(false);
                let cards = dueCards;
                if (opts.filterFn) cards = cards.filter(opts.filterFn);
                return cards.slice(0, opts.limit);
            }
        };

        const review = await data.getReviewWords(5);
        expect(filterFnSeen).toBeTypeOf('function');
        // Due cards first (order preserved from getDueCards), then fill with adaptive
        expect(review[0].id).toBe(3);
        expect(review[1].id).toBe(1);
        expect(review.map(w => w.id)).toContain(99); // fill remaining via most-missed
        expect(review.length).toBeLessThanOrEqual(5);
        // No duplicates
        expect(new Set(review.map(w => w.id)).size).toBe(review.length);
    });

    it('filters due cards to getFilteredList universe', async () => {
        mockAppForData.store.prefs.levelFilter = ['N3'];
        // id 2 is N5 — should be excluded even if due
        const dueCards = [
            makeDueCard(2, NOW - 2000),
            makeDueCard(1, NOW - 1000),
            makeDueCard(99, NOW - 500)
        ];
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: (now, opts) => {
                let cards = dueCards;
                if (opts.filterFn) cards = cards.filter(opts.filterFn);
                return cards.slice(0, opts.limit ?? cards.length);
            }
        };

        const review = await data.getReviewWords(10);
        const ids = review.map(w => w.id);
        expect(ids).toContain(1);
        expect(ids).toContain(99);
        expect(ids).not.toContain(2);
    });

    it('fills remaining slots when fewer due than count', async () => {
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: () => [makeDueCard(1, NOW - 100)]
        };

        const review = await data.getReviewWords(3);
        expect(review[0].id).toBe(1);
        expect(review.length).toBe(3);
        // Remaining filled from adaptive/most-missed pool
        expect(review.slice(1).some(w => w.id === 99 || w.id === 2)).toBe(true);
    });

    it('falls back fully when memory disabled even if getDueCards exists', async () => {
        mockAppForData.memory = {
            isEnabled: () => false,
            getDueCards: () => {
                throw new Error('should not call getDueCards when disabled');
            }
        };

        const review = await data.getReviewWords(5);
        expect(review.some(w => w.id === 99)).toBe(true);
    });

    it('falls back when memory has no due cards', async () => {
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: () => []
        };

        const review = await data.getReviewWords(5);
        expect(review.some(w => w.id === 99)).toBe(true);
    });

    it('falls back when memory throws', async () => {
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: () => {
                throw new Error('memory boom');
            }
        };
        const review = await data.getReviewWords(5);
        expect(review.some(w => w.id === 99)).toBe(true);
    });

    it('falls back when getDueCards returns non-array', async () => {
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: () => undefined
        };
        const review = await data.getReviewWords(5);
        expect(review.some(w => w.id === 99)).toBe(true);
    });

    it('normalizes string vocab ids against numeric wordId (no duplicates)', async () => {
        data.list = [
            { id: '1', tags: ['N3'], en: 'cat' },
            { id: '2', tags: ['N5'], en: 'dog' },
            { id: '99', tags: ['N3'], en: 'weak' }
        ];
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: (now, opts) => {
                const cards = [makeDueCard(1, NOW - 1000)]; // numeric wordId
                return (opts.filterFn ? cards.filter(opts.filterFn) : cards);
            }
        };
        mockAppForData.analytics = {
            getMostMissedWords: async () => [
                { id: '1', c: 0, w: 9, vocab: { id: '1', tags: ['N3'], en: 'cat' } },
                { id: '99', c: 0, w: 5, vocab: { id: '99', tags: ['N3'], en: 'weak' } }
            ]
        };

        const review = await data.getReviewWords(5);
        // First is due card (string-id vocab row matched via Number)
        expect(Number(review[0].id)).toBe(1);
        // No duplicate of id 1 from fill path
        expect(review.filter(w => Number(w.id) === 1)).toHaveLength(1);
        expect(review.some(w => Number(w.id) === 99)).toBe(true);
    });

    it('uses real MemoryService: due sort, sessionHold exclude, filter-before-limit', async () => {
        globalThis.localStorage = makeLocalStorage();
        const mem = new MemoryService();
        // Force enabled regardless of window flag path
        mem.isEnabled = () => true;

        // Overdue held card — must be excluded
        const held = mem.ensureCard(2);
        held.due = NOW - 5000;
        held.state = 'review';
        held.introducedAt = NOW - 86400000;
        held.sessionHold = true;
        mem.cards.set(2, held);

        // Two due cards: later due first in insertion, sort should put older due first
        const late = mem.ensureCard(3);
        late.due = NOW - 100;
        late.state = 'review';
        late.introducedAt = NOW - 86400000;
        mem.cards.set(3, late);

        const early = mem.ensureCard(1);
        early.due = NOW - 9000;
        early.state = 'review';
        early.introducedAt = NOW - 86400000;
        mem.cards.set(1, early);

        // Not yet due
        const future = mem.ensureCard(99);
        future.due = NOW + 86400000;
        future.state = 'review';
        future.introducedAt = NOW - 86400000;
        mem.cards.set(99, future);

        mockAppForData.memory = mem;
        mockAppForData.store.prefs.levelFilter = ['N3']; // excludes id 2 even if not held
        mockAppForData.analytics = {
            getMostMissedWords: async () => [
                { id: 99, c: 0, w: 5, vocab: { id: 99, tags: ['N3'], en: 'weak' } }
            ]
        };

        const review = await data.getReviewWords(2);
        // Only 1 and 3 are due+in-universe; held 2 excluded; 99 not due
        expect(review.map(w => w.id)).toEqual([1, 3]);
        // Real service sort: earlier due first
        expect(review[0].id).toBe(1);
        expect(review[1].id).toBe(3);
    });
});

describe('Smart Review home UX removed (PR10)', () => {
    it('does not define launchSmartReview or Smart Review button', () => {
        expect(mainSrc).not.toMatch(/async launchSmartReview\s*\(/);
        expect(mainSrc).not.toMatch(/Smart Review/);
        expect(mainSrc).not.toMatch(/launchSmartReview/);
    });

    it('keeps getReviewWords / startReviewSession for internal use (data.js)', () => {
        expect(dataSrc).toMatch(/async getReviewWords\s*\(/);
        expect(dataSrc).toMatch(/async startReviewSession\s*\(/);
        expect(dataSrc).toMatch(/endReviewSession\s*\(/);
    });
});
