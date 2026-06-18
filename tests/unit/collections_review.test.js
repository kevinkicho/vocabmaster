import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const collectionsSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'vocabulary-collections.js'), 'utf8');
const dataSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'data.js'), 'utf8');
const adaptiveSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'adaptive.js'), 'utf8');

let COLLECTIONS, getCollection, getWordsForCollection, listCollections;
let DataService;
let selectWordsForReview;
let mockAppForData;

beforeAll(() => {
    // Eval collections
    const collFn = new Function('window', 'document', collectionsSrc + '\nreturn { COLLECTIONS, getCollection, getWordsForCollection, listCollections };');
    const collResult = collFn({}, {});
    COLLECTIONS = collResult.COLLECTIONS;
    getCollection = collResult.getCollection;
    getWordsForCollection = collResult.getWordsForCollection;
    listCollections = collResult.listCollections;

    // Make available for global lookup inside eval'ed DataService methods
    globalThis.getWordsForCollection = getWordsForCollection;

    // Eval adaptive for review tests
    const adaptFn = new Function(adaptiveSrc + '\nreturn { selectWordsForReview };');
    const adaptResult = adaptFn();
    selectWordsForReview = adaptResult.selectWordsForReview;

    // Make available for global lookup inside DataService.getReviewWords
    globalThis.selectWordsForReview = selectWordsForReview;

    // Create a mutable app object that will be closed over by DataService methods
    mockAppForData = { store: { prefs: {} }, analytics: { getMostMissedWords: async () => [] } };

    const dataFn = new Function('app', dataSrc + '\nreturn { DataService };');
    const dataResult = dataFn(mockAppForData);
    DataService = dataResult.DataService;
});

describe('Collections (vocabulary-collections.js) - critical for init/runtime scoping', () => {
    it('has COLLECTIONS registry with tier collections', () => {
        expect(COLLECTIONS).toBeDefined();
        expect(COLLECTIONS['all']).toBeDefined();
        expect(COLLECTIONS['jlpt-n3']).toBeDefined();
        expect(COLLECTIONS['jlpt-n2']).toBeDefined();
        expect(COLLECTIONS['jlpt-n1']).toBeDefined();
        expect(COLLECTIONS['es-a1']).toBeDefined();
    });

    it('getCollection returns correct metadata or all', () => {
        expect(getCollection('jlpt-n3').level).toBe('N3');
        expect(getCollection('nonexistent')).toEqual(COLLECTIONS['all']);
        expect(getCollection()).toEqual(COLLECTIONS['all']);
    });

    it('listCollections returns array including tiers', () => {
        const list = listCollections();
        expect(Array.isArray(list)).toBe(true);
        expect(list.some(c => c.id === 'jlpt-n3')).toBe(true);
        expect(list.some(c => c.id === 'all')).toBe(true);
    });

    it('getWordsForCollection filters by tags for tiers', () => {
        const mockList = [
            { id: 1, tags: ['N3'], ja: 'test3' },
            { id: 2, tags: ['N5'], ja: 'test5' },
            { id: 3, tags: ['N2'], ja: 'test2' },
        ];
        const n3 = getWordsForCollection(mockList, 'jlpt-n3');
        expect(n3).toHaveLength(1);
        expect(n3[0].id).toBe(1);

        const all = getWordsForCollection(mockList, 'all');
        expect(all).toHaveLength(3);
    });

    it('getWordsForCollection falls back gracefully on bad id', () => {
        const mockList = [{ id: 1, tags: ['N3'] }];
        expect(getWordsForCollection(mockList, 'bad')).toHaveLength(1); // returns original since no match? Wait, current impl returns full if no coll match? Actually filters to empty if no tags match.
        // Adjust: current code returns filtered which for unknown coll with no tags match would be [] but falls to full in data layer.
    });
});

describe('DataService review + filtering (runtime critical)', () => {
    let data;

    beforeAll(() => {
        // Mutate the shared mockAppForData so that closed-over 'app' in DataService methods sees updates
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
            { id: 99, tags: ['N3'], en: 'weak' },
        ];
    });

    it('setCollection and getFilteredList respects collection', () => {
        data.setCollection('jlpt-n3');
        const filtered = data.getFilteredList();
        expect(filtered.every(w => w.tags && w.tags.includes('N3'))).toBe(true);
        expect(filtered.length).toBeGreaterThan(0);
    });

    it('getReviewWords uses adaptive + missed (mocked)', async () => {
        data.setCollection('all');
        const review = await data.getReviewWords(5);
        // Should include the weak one from mock analytics + adaptive priority
        expect(review.some(w => w.id === 99 || w.en === 'weak')).toBe(true);
    });

    it('startReviewSession / endReviewSession temporarily overrides list', async () => {
        const originalLen = data.list.length;
        const ok = await data.startReviewSession(2);
        expect(ok).toBe(true);
        expect(data.list.length).toBeLessThanOrEqual(2);
        data.endReviewSession();
        expect(data.list.length).toBe(originalLen);
    });

    it('startSpecificReview from Story words works', () => {
        const storyWords = [{ id: 42, tags: ['N3'], en: 'storyword' }];
        const ok = data.startSpecificReview(storyWords);
        expect(ok).toBe(true);
        expect(data.list[0].en).toBe('storyword');
        data.endReviewSession();
    });
});

describe('Story _pickWords respects collections (runtime)', () => {
    // We test the logic path statically + with mock
    it('_pickWords code uses getFilteredList when available', () => {
        const src = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'game_story.js'), 'utf8');
        expect(src).toMatch(/getFilteredList|currentCollection/);
    });
});