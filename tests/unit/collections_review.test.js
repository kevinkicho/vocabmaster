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
/** Production assignGameList extracted from game_core.js (not a hand copy). */
let assignGameListFromSrc;
/** Production miss() extracted from game_core.js. */
let missFromSrc;

/** Extract a top-level or method function body by brace matching from a start marker. */
function extractFunctionBlock(src, startMarker) {
    const start = src.indexOf(startMarker);
    if (start < 0) throw new Error('marker not found: ' + startMarker);
    const braceStart = src.indexOf('{', start);
    if (braceStart < 0) throw new Error('no { after ' + startMarker);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error('unbalanced braces for ' + startMarker);
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

    // Load real assignGameList from production source
    const assignBlock = extractFunctionBlock(gameCoreSrc, 'function assignGameList(game)');
    const assignFactory = new Function(
        'app',
        'window',
        assignBlock + '\nwindow.assignGameList = assignGameList;\nreturn assignGameList;'
    );
    const fakeWindow = {};
    assignGameListFromSrc = assignFactory(mockAppForData, fakeWindow);

    // Load real miss() from production source
    const missBlock = extractFunctionBlock(gameCoreSrc, 'miss(wordId=null)');
    const missFactory = new Function('app', 'return { ' + missBlock + ' };');
    missFromSrc = missFactory(mockAppForData).miss;
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

        // Production assignGameList from game_core.js (extracted, not mirrored)
        const game = { list: null };
        assignGameListFromSrc(game);
        expect(game.list).toHaveLength(2);
        expect(game.list.map(w => w.id)).toEqual([10, 11]);
        // Full filtered list is larger — proves we did not expand to it
        expect(data.getFilteredList().length).toBeGreaterThan(2);

        data.endReviewSession();
        assignGameListFromSrc(game);
        expect(game.list.length).toBe(data.list.length);
    });

    it('assignGameList (from production source) keeps _reviewList on filter reassign', () => {
        const reviewWords = [
            { id: 10, tags: ['N3'], en: 'a' },
            { id: 11, tags: ['N3'], en: 'b' },
        ];
        data.startSpecificReview(reviewWords);
        const game = { list: null };
        assignGameListFromSrc(game);
        expect(game.list).toHaveLength(2);
        expect(game.list.map(w => w.id)).toEqual([10, 11]);

        // Simulate settings/filter reassign while review active
        mockAppForData.store.prefs.levelFilter = ['N5'];
        assignGameListFromSrc(game);
        expect(game.list).toHaveLength(2);
        expect(game.list.map(w => w.id)).toEqual([10, 11]);

        data.endReviewSession();
        mockAppForData.store.prefs.levelFilter = ['all'];
        assignGameListFromSrc(game);
        expect(game.list.length).toBe(data.list.length);
    });
});

describe('GameMode.miss analytics contract (production source)', () => {
    it('miss(wordId) calls analytics.recordAttempt(id, mode, false)', () => {
        const calls = [];
        mockAppForData.analytics = {
            getMostMissedWords: async () => [],
            recordAttempt: (id, mode, ok) => { calls.push({ id, mode, ok }); }
        };
        // Re-bind miss against current mockAppForData.analytics
        const missBlock = extractFunctionBlock(gameCoreSrc, 'miss(wordId=null)');
        const miss = new Function('app', 'return { ' + missBlock + ' };')(mockAppForData).miss;

        const ctx = { key: 'match', list: [{ id: 7 }, { id: 8 }], i: 0 };
        miss.call(ctx, 42);
        expect(calls).toEqual([{ id: 42, mode: 'match', ok: false }]);

        // Default wordId from list[i]
        calls.length = 0;
        miss.call(ctx, null);
        expect(calls).toEqual([{ id: 7, mode: 'match', ok: false }]);
    });
});

describe('GameMode / Match list scoping (source + review contract)', () => {
    it('game_core prefers _reviewList via assignGameList with early-return body', () => {
        expect(gameCoreSrc).toMatch(/function\s+assignGameList\s*\(/);
        expect(gameCoreSrc).toMatch(/window\.assignGameList\s*=\s*assignGameList/);
        expect(gameCoreSrc).toMatch(/assignGameList\s*\(\s*this\s*\)/);
        // Body: early return on non-empty _reviewList before getFilteredList
        const assignBlock = extractFunctionBlock(gameCoreSrc, 'function assignGameList(game)');
        expect(assignBlock).toMatch(/_reviewList\s*&&\s*app\.data\._reviewList\.length/);
        const reviewIdx = assignBlock.indexOf('_reviewList');
        const filteredIdx = assignBlock.indexOf('getFilteredList');
        expect(reviewIdx).toBeGreaterThanOrEqual(0);
        expect(filteredIdx).toBeGreaterThan(reviewIdx);
        expect(assignBlock.slice(0, filteredIdx)).toMatch(/return/);
    });

    it('saveSettings and applyPresetSettings both call window.assignGameList', () => {
        const saveIdx = storeSrc.indexOf('saveSettings()');
        const applyIdx = storeSrc.indexOf('applyPresetSettings(');
        expect(saveIdx).toBeGreaterThanOrEqual(0);
        expect(applyIdx).toBeGreaterThan(saveIdx);

        const saveBlock = storeSrc.slice(saveIdx, applyIdx);
        expect(saveBlock).toMatch(/window\.assignGameList/);
        // Fallback must still honor _reviewList when assignGameList missing
        expect(saveBlock).toMatch(/_reviewList/);

        const applyEnd = storeSrc.indexOf('setTheme(', applyIdx);
        const applyBlock = storeSrc.slice(applyIdx, applyEnd > applyIdx ? applyEnd : applyIdx + 800);
        expect(applyBlock).toMatch(/window\.assignGameList/);
        expect(applyBlock).toMatch(/_reviewList/);
    });

    it('toggleLevel and toggleTag both call window.assignGameList', () => {
        const levelIdx = homeSrc.indexOf('UIManager.prototype.toggleLevel');
        const tagIdx = homeSrc.indexOf('UIManager.prototype.toggleTag');
        expect(levelIdx).toBeGreaterThanOrEqual(0);
        expect(tagIdx).toBeGreaterThan(levelIdx);

        const levelBlock = homeSrc.slice(levelIdx, tagIdx);
        expect(levelBlock).toMatch(/window\.assignGameList/);
        expect(levelBlock).toMatch(/_reviewList/);

        const tagBlock = homeSrc.slice(tagIdx, tagIdx + 1200);
        expect(tagBlock).toMatch(/window\.assignGameList/);
        expect(tagBlock).toMatch(/_reviewList/);
    });

    it('Match clears matchState only under _reviewList and miss() on fail', () => {
        // clearMatch must sit inside a _reviewList guard (bounded window)
        expect(matchSrc).toMatch(
            /_reviewList[\s\S]{0,160}clearMatch\s*\(/
        );
        expect(matchSrc).toMatch(/this\.miss\s*\(\s*parseInt\s*\(\s*match\s*\)\s*\)/);
        // Fail path must not use bare recordAttempt
        expect(matchSrc).not.toMatch(
            /recordAttempt\s*\(\s*parseInt\s*\(\s*match\s*\)\s*,\s*['"]match['"]\s*,\s*false\s*\)/
        );
    });
});
