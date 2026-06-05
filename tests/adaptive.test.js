import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(__dirname, '..', 'public', 'js', 'adaptive.js'), 'utf8');

let getWordDifficulty, selectWordsForReview, adjustDifficulty;
beforeAll(() => {
    const fn = new Function(src + '\nreturn { getWordDifficulty, selectWordsForReview, adjustDifficulty };');
    const result = fn({});
    getWordDifficulty = result.getWordDifficulty;
    selectWordsForReview = result.selectWordsForReview;
    adjustDifficulty = result.adjustDifficulty;
});

describe('getWordDifficulty', () => {
    it('returns medium when userHistory is null', () => {
        expect(getWordDifficulty('hola', null)).toBe('medium');
    });

    it('returns medium when userHistory is undefined', () => {
        expect(getWordDifficulty('hola', undefined)).toBe('medium');
    });

    it('returns medium when word has no history', () => {
        expect(getWordDifficulty('hola', {})).toBe('medium');
    });

    it('returns easy for high accuracy rate (>= 0.8)', () => {
        expect(getWordDifficulty('hola', { hola: { correct: 8, total: 10 } })).toBe('easy');
        expect(getWordDifficulty('hola', { hola: { correct: 4, total: 5 } })).toBe('easy');
    });

    it('returns easy for exactly 0.8 rate', () => {
        expect(getWordDifficulty('hola', { hola: { correct: 8, total: 10 } })).toBe('easy');
        expect(getWordDifficulty('hola', { hola: 0.8 })).toBe('easy');
    });

    it('returns hard for low accuracy rate (< 0.5)', () => {
        expect(getWordDifficulty('hola', { hola: { correct: 2, total: 10 } })).toBe('hard');
        expect(getWordDifficulty('hola', { hola: { correct: 0, total: 5 } })).toBe('hard');
    });

    it('returns medium for moderate accuracy rate (0.5 <= rate < 0.8)', () => {
        expect(getWordDifficulty('hola', { hola: { correct: 5, total: 10 } })).toBe('medium');
        expect(getWordDifficulty('hola', { hola: { correct: 7, total: 10 } })).toBe('medium');
    });

    it('returns hard for exactly 0.49 rate', () => {
        expect(getWordDifficulty('hola', { hola: 0.49 })).toBe('hard');
    });

    it('returns medium for exactly 0.5 rate', () => {
        expect(getWordDifficulty('hola', { hola: 0.5 })).toBe('medium');
    });

    it('returns medium for exactly 0.79 rate', () => {
        expect(getWordDifficulty('hola', { hola: 0.79 })).toBe('medium');
    });

    it('returns hard when total is 0 (rate defaults to 0)', () => {
        expect(getWordDifficulty('hola', { hola: { correct: 0, total: 0 } })).toBe('hard');
    });

    it('handles numeric history value as success rate', () => {
        expect(getWordDifficulty('hola', { hola: 0.9 })).toBe('easy');
        expect(getWordDifficulty('hola', { hola: 0.6 })).toBe('medium');
        expect(getWordDifficulty('hola', { hola: 0.3 })).toBe('hard');
    });

    it('returns medium for unrecognized history value types', () => {
        expect(getWordDifficulty('hola', { hola: 'unknown' })).toBe('medium');
    });
});

describe('selectWordsForReview', () => {
    const words = ['manzana', 'escuela', 'perro', 'gato', 'casa'];
    const easyWord = 'casa';
    const hardWord = 'perro';

    it('returns empty array for empty word list', () => {
        expect(selectWordsForReview([], {})).toEqual([]);
    });

    it('returns empty array for null word list', () => {
        expect(selectWordsForReview(null, {})).toEqual([]);
    });

    it('returns empty array for undefined word list', () => {
        expect(selectWordsForReview(undefined, {})).toEqual([]);
    });

    it('returns all words when count is larger than list', () => {
        const result = selectWordsForReview(words, {}, 10);
        expect(result.length).toBe(5);
    });

    it('returns up to 10 words by default', () => {
        const manyWords = Array.from({ length: 20 }, (_, i) => 'word' + i);
        const result = selectWordsForReview(manyWords, {});
        expect(result.length).toBe(10);
    });

    it('prioritizes hard words over medium and easy', () => {
        const history = { [hardWord]: { correct: 1, total: 10 }, [easyWord]: { correct: 9, total: 10 } };
        const result = selectWordsForReview(words, history, 5);
        expect(result[0]).toBe(hardWord);
    });

    it('puts easy words last', () => {
        const history = { [easyWord]: { correct: 9, total: 10 }, [hardWord]: { correct: 1, total: 10 } };
        const result = selectWordsForReview(words, history, 5);
        expect(result[result.length - 1]).toBe(easyWord);
    });

    it('limits result to count when list has more words', () => {
        const result = selectWordsForReview(words, {}, 3);
        expect(result.length).toBe(3);
    });

    it('returns all words when count equals list length', () => {
        const result = selectWordsForReview(words, {}, 5);
        expect(result.length).toBe(5);
    });

    it('works with null history', () => {
        const result = selectWordsForReview(words, null, 3);
        expect(result.length).toBe(3);
    });

    it('treats unknown words as medium priority', () => {
        const history = { [hardWord]: 0.2, [easyWord]: 0.9 };
        const result = selectWordsForReview(words, history, 5);
        expect(result[0]).toBe(hardWord);
        expect(result[result.length - 1]).toBe(easyWord);
    });
});

describe('adjustDifficulty', () => {
    it('moves up one level when score is >= 0.85', () => {
        expect(adjustDifficulty('A1', 0.85)).toBe('A2');
        expect(adjustDifficulty('A1', 0.9)).toBe('A2');
        expect(adjustDifficulty('A1', 1.0)).toBe('A2');
    });

    it('moves down one level when score is < 0.5', () => {
        expect(adjustDifficulty('A2', 0.49)).toBe('A1');
        expect(adjustDifficulty('A2', 0.3)).toBe('A1');
        expect(adjustDifficulty('A2', 0)).toBe('A1');
    });

    it('stays same when score is in middle range', () => {
        expect(adjustDifficulty('A2', 0.5)).toBe('A2');
        expect(adjustDifficulty('A2', 0.7)).toBe('A2');
        expect(adjustDifficulty('A2', 0.84)).toBe('A2');
    });

    it('does not move above C2', () => {
        expect(adjustDifficulty('C2', 0.95)).toBe('C2');
        expect(adjustDifficulty('C2', 1.0)).toBe('C2');
    });

    it('does not move below A1', () => {
        expect(adjustDifficulty('A1', 0.1)).toBe('A1');
        expect(adjustDifficulty('A1', 0)).toBe('A1');
    });

    it('works for all CEFR levels', () => {
        expect(adjustDifficulty('A1', 0.9)).toBe('A2');
        expect(adjustDifficulty('A2', 0.9)).toBe('B1');
        expect(adjustDifficulty('B1', 0.9)).toBe('B2');
        expect(adjustDifficulty('B2', 0.9)).toBe('C1');
        expect(adjustDifficulty('C1', 0.9)).toBe('C2');
    });

    it('moves down across all levels', () => {
        expect(adjustDifficulty('C2', 0.4)).toBe('C1');
        expect(adjustDifficulty('C1', 0.4)).toBe('B2');
        expect(adjustDifficulty('B2', 0.4)).toBe('B1');
        expect(adjustDifficulty('B1', 0.4)).toBe('A2');
        expect(adjustDifficulty('A2', 0.4)).toBe('A1');
    });

    it('returns current level for unrecognized level', () => {
        expect(adjustDifficulty('N5', 0.9)).toBe('N5');
        expect(adjustDifficulty('unknown', 0.9)).toBe('unknown');
    });

    it('boundary: exactly 0.85 moves up', () => {
        expect(adjustDifficulty('A1', 0.85)).toBe('A2');
    });

    it('boundary: exactly 0.5 stays same', () => {
        expect(adjustDifficulty('A2', 0.5)).toBe('A2');
    });

    it('boundary: 0.84 stays same (just below 0.85)', () => {
        expect(adjustDifficulty('A1', 0.84)).toBe('A1');
    });

    it('boundary: 0.49 moves down', () => {
        expect(adjustDifficulty('A2', 0.49)).toBe('A1');
    });
});