import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dataSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'data.js'), 'utf8');
const adaptiveSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'adaptive.js'), 'utf8');
const gameCoreSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'game_core.js'), 'utf8');
const storeSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'store.js'), 'utf8');
const homeSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'ui_home.js'), 'utf8');
const matchSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'game_match.js'), 'utf8');

let DataService;
let selectWordsForReview;
let mockAppForData;

/** Mirrors public/js/game_core.js assignGameList (kept in sync via source assertions). */
function makeAssignGameList(app) {
    return function assignGameList(game) {
        if (!game || !app || !app.data) return;
        if (app.data._reviewList && app.data._reviewList.length) {
            game.list = app.data._reviewList;
            return;
        }
        game.list = app.data.getFilteredList();
        if (!game.list || game.list.length === 0) {
            game.list = app.data.activeList || [];
        }
    };
}

beforeAll(() => {
    const adaptFn = new Function(adaptiveSrc + '\nreturn { selectWordsForReview };');
    const adaptResult = adaptFn();
    selectWordsForReview = adaptResult.selectWordsForReview;
    globalThis.selectWordsForReview = selectWordsForReview;

    mockAppForData = { store: { prefs: {} }, analytics: { getMostMissedWords: async () => [] } };

    const dataFn = new Function('app', dataSrc + '\nreturn { DataService };');
    const dataResult = dataFn(mockAppForData);
    DataService = dataResult.DataService;
});

describe('DataService review + filtering (runtime critical)', () => {
    let data;

    beforeAll(() => {
        mockAppForData.store = { prefs: { levelFilter: ['all'] } };
        mockAppForData.analytics = {
            getMostMissedWords: async (n) => [
                { id: 99, c: 0, w: 5, vocab: { id: 99, tags: ['N3'], en: 'weak' } }
            ]
        };
        mockAppForData.data = null;

        data = new DataService();
        mockAppForData.data = data;
        data.list = [
            { id: 1, tags: ['N3'], en: 'cat' },
            { id: 2, tags: ['N5'], en: 'dog' },
            { id: 3, tags: ['N3'], en: 'bird' },
            { id: 4, tags: ['N4'], en: 'fish' },
            { id: 99, tags: ['N3'], en: 'weak' },
        ];
    });

    it('getFilteredList respects level filter', () => {
        mockAppForData.store.prefs.levelFilter = ['N3'];
        const filtered = data.getFilteredList();
        expect(filtered.every(w => w.tags && w.tags.includes('N3'))).toBe(true);
        expect(filtered.length).toBeGreaterThan(0);
        mockAppForData.store.prefs.levelFilter = ['all'];
    });

    it('getReviewWords uses adaptive + missed (mocked)', async () => {
        const review = await data.getReviewWords(5);
        expect(review.some(w => w.id === 99 || w.en === 'weak')).toBe(true);
    });

    it('startReviewSession / endReviewSession sets _reviewList scope', async () => {
        const originalLen = data.list.length;
        const ok = await data.startReviewSession(2);
        expect(ok).toBe(true);
        expect(data._reviewList).toBeTruthy();
        expect(data._reviewList.length).toBeLessThanOrEqual(2);
        expect(data.activeList.length).toBeLessThanOrEqual(2);
        // data.list itself is not mutated
        expect(data.list.length).toBe(originalLen);
        data.endReviewSession();
        expect(data._reviewList == null).toBe(true);
        expect(data.list.length).toBe(originalLen);
    });

    it('startSpecificReview from Story words works', () => {
        const storyWords = [{ id: 42, tags: ['N3'], en: 'storyword' }];
        const ok = data.startSpecificReview(storyWords);
        expect(ok).toBe(true);
        expect(data._reviewList[0].en).toBe('storyword');
        expect(data.activeList[0].en).toBe('storyword');
        data.endReviewSession();
    });

    it('after startReviewSession / _reviewList, GameMode list length equals review count', () => {
        const reviewWords = [
            { id: 10, tags: ['N3'], en: 'a' },
            { id: 11, tags: ['N3'], en: 'b' },
        ];
        const ok = data.startSpecificReview(reviewWords);
        expect(ok).toBe(true);
        expect(data._reviewList).toHaveLength(2);

        // Same pick logic as game_core assignGameList / GameMode ctor
        const gameList = (data._reviewList && data._reviewList.length)
            ? data._reviewList
            : data.getFilteredList();
        expect(gameList).toHaveLength(2);
        expect(gameList.map(w => w.id)).toEqual([10, 11]);
        // Full filtered list is larger — proves we did not expand to it
        expect(data.getFilteredList().length).toBeGreaterThan(2);

        data.endReviewSession();
        const after = (data._reviewList && data._reviewList.length)
            ? data._reviewList
            : data.getFilteredList();
        expect(after.length).toBe(data.list.length);
    });

    it('assignGameList keeps _reviewList and does not expand on filter reassign', () => {
        const assignGameList = makeAssignGameList(mockAppForData);

        const reviewWords = [
            { id: 10, tags: ['N3'], en: 'a' },
            { id: 11, tags: ['N3'], en: 'b' },
        ];
        data.startSpecificReview(reviewWords);
        const game = { list: null };
        assignGameList(game);
        expect(game.list).toHaveLength(2);
        expect(game.list.map(w => w.id)).toEqual([10, 11]);

        // Simulate settings/filter reassign while review active
        mockAppForData.store.prefs.levelFilter = ['N5'];
        assignGameList(game);
        expect(game.list).toHaveLength(2);
        expect(game.list.map(w => w.id)).toEqual([10, 11]);

        data.endReviewSession();
        mockAppForData.store.prefs.levelFilter = ['all'];
        assignGameList(game);
        expect(game.list.length).toBe(data.list.length);
    });
});

describe('GameMode / Match list scoping (source + review contract)', () => {
    it('game_core prefers _reviewList via assignGameList', () => {
        expect(gameCoreSrc).toMatch(/function\s+assignGameList\s*\(/);
        expect(gameCoreSrc).toMatch(/window\.assignGameList\s*=\s*assignGameList/);
        expect(gameCoreSrc).toMatch(/_reviewList/);
        expect(gameCoreSrc).toMatch(/assignGameList\s*\(\s*this\s*\)/);
    });

    it('store and ui_home use assignGameList (do not wipe review scope)', () => {
        expect(storeSrc).toMatch(/window\.assignGameList/);
        expect(homeSrc).toMatch(/window\.assignGameList/);
    });

    it('Match clears matchState under review and miss() on fail', () => {
        expect(matchSrc).toMatch(/clearMatch\s*\(/);
        expect(matchSrc).toMatch(/_reviewList/);
        expect(matchSrc).toMatch(/this\.miss\s*\(\s*parseInt\s*\(\s*match\s*\)\s*\)/);
        // Fail path must not use bare recordAttempt
        expect(matchSrc).not.toMatch(/recordAttempt\s*\(\s*parseInt\s*\(\s*match\s*\)\s*,\s*['"]match['"]\s*,\s*false\s*\)/);
    });
});
