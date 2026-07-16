import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dataSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'data.js'), 'utf8');
const adaptiveSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'adaptive.js'), 'utf8');
const mainSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'main.js'), 'utf8');

let DataService;
let selectWordsForReview;
let mockAppForData;

beforeAll(() => {
    // Eval adaptive for review tests
    const adaptFn = new Function(adaptiveSrc + '\nreturn { selectWordsForReview };');
    const adaptResult = adaptFn();
    selectWordsForReview = adaptResult.selectWordsForReview;

    // Make available for global lookup inside DataService.getReviewWords
    globalThis.selectWordsForReview = selectWordsForReview;

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

function makeDueCard(wordId, due) {
    return {
        wordId,
        due,
        state: 'review',
        stability: 1,
        difficulty: 5,
        introducedAt: due - 86400000
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
});

describe('DataService getReviewWords — memory due-first (PR4)', () => {
    let data;
    const NOW = 1_700_000_000_000;

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
        mockAppForData.memory = {
            isEnabled: () => true,
            getDueCards: (now, opts) => {
                expect(opts.limit).toBe(5);
                let cards = dueCards;
                if (opts.filterFn) cards = cards.filter(opts.filterFn);
                return cards.slice(0, opts.limit);
            }
        };

        const review = await data.getReviewWords(5);
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
});

describe('launchSmartReview still wired (main.js)', () => {
    it('defines launchSmartReview and startReviewSession path', () => {
        expect(mainSrc).toMatch(/async launchSmartReview\s*\(/);
        expect(mainSrc).toMatch(/startReviewSession\s*\(\s*12\s*\)/);
        expect(mainSrc).toMatch(/Smart Review/);
    });
});
