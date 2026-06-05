import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(__dirname, '..', 'public', 'js', 'vocabulary-collections.js'), 'utf8');

let SPANISH_A1, SPANISH_A2, SPANISH_B1, SPANISH_B2, FRENCH_A1, FRENCH_A2, FRENCH_B1, FRENCH_B2, GERMAN_A1, GERMAN_A2, GERMAN_B1, GERMAN_B2, ITALIAN_A1, ITALIAN_A2, ITALIAN_B1, ITALIAN_B2, PORTUGUESE_A1, PORTUGUESE_A2, PORTUGUESE_B1, PORTUGUESE_B2, JAPANESE_N5, CHINESE_HSK1, KOREAN_TOPIK1, RUSSIAN_A1, RUSSIAN_A2, JAPANESE_N4, CHINESE_HSK2, KOREAN_TOPIK2;
beforeAll(() => {
    const fn = new Function('window', 'document', src + '\nreturn { SPANISH_A1, SPANISH_A2, SPANISH_B1, SPANISH_B2, FRENCH_A1, FRENCH_A2, FRENCH_B1, FRENCH_B2, GERMAN_A1, GERMAN_A2, GERMAN_B1, GERMAN_B2, ITALIAN_A1, ITALIAN_A2, ITALIAN_B1, ITALIAN_B2, PORTUGUESE_A1, PORTUGUESE_A2, PORTUGUESE_B1, PORTUGUESE_B2, JAPANESE_N5, CHINESE_HSK1, KOREAN_TOPIK1, RUSSIAN_A1, RUSSIAN_A2, JAPANESE_N4, CHINESE_HSK2, KOREAN_TOPIK2 };');
    const result = fn({}, {});
    SPANISH_A1 = result.SPANISH_A1;
    SPANISH_A2 = result.SPANISH_A2;
    SPANISH_B1 = result.SPANISH_B1;
    SPANISH_B2 = result.SPANISH_B2;
    FRENCH_A1 = result.FRENCH_A1;
    FRENCH_A2 = result.FRENCH_A2;
    FRENCH_B1 = result.FRENCH_B1;
    FRENCH_B2 = result.FRENCH_B2;
    GERMAN_A1 = result.GERMAN_A1;
    GERMAN_A2 = result.GERMAN_A2;
    GERMAN_B1 = result.GERMAN_B1;
    GERMAN_B2 = result.GERMAN_B2;
    ITALIAN_A1 = result.ITALIAN_A1;
    ITALIAN_A2 = result.ITALIAN_A2;
    ITALIAN_B1 = result.ITALIAN_B1;
    ITALIAN_B2 = result.ITALIAN_B2;
    PORTUGUESE_A1 = result.PORTUGUESE_A1;
    PORTUGUESE_A2 = result.PORTUGUESE_A2;
    PORTUGUESE_B1 = result.PORTUGUESE_B1;
    PORTUGUESE_B2 = result.PORTUGUESE_B2;
    JAPANESE_N5 = result.JAPANESE_N5;
    CHINESE_HSK1 = result.CHINESE_HSK1;
    KOREAN_TOPIK1 = result.KOREAN_TOPIK1;
    RUSSIAN_A1 = result.RUSSIAN_A1;
    RUSSIAN_A2 = result.RUSSIAN_A2;
    JAPANESE_N4 = result.JAPANESE_N4;
    CHINESE_HSK2 = result.CHINESE_HSK2;
    KOREAN_TOPIK2 = result.KOREAN_TOPIK2;
});

describe('SPANISH_A1', () => {
    it('has approximately 50 words', () => {
        expect(SPANISH_A1.length).toBeGreaterThanOrEqual(48);
        expect(SPANISH_A1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of SPANISH_A1) {
            expect(word).toHaveProperty('es');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('es_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.es).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.es_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.es.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.es_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A1', () => {
        for (const word of SPANISH_A1) {
            expect(word.level).toBe('A1');
        }
    });

    it('all words are lang es', () => {
        for (const word of SPANISH_A1) {
            expect(word.lang).toBe('es');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < SPANISH_A1.length; i++) {
            expect(SPANISH_A1[i].id).toBe(i);
        }
    });

    it('covers basic vocabulary categories', () => {
        const words = SPANISH_A1.map(w => w.en);
        const hasGreeting = words.some(w => ['hello', 'goodbye', 'good morning', 'good night'].includes(w));
        const hasFamily = words.some(w => ['mother', 'father', 'brother', 'sister'].includes(w));
        const hasFood = words.some(w => ['water', 'bread', 'milk', 'apple', 'rice'].includes(w));
        const hasColor = words.some(w => ['red', 'blue', 'green', 'yellow', 'white'].includes(w));
        const hasDay = words.some(w => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(w));
        expect(hasGreeting).toBe(true);
        expect(hasFamily).toBe(true);
        expect(hasFood).toBe(true);
        expect(hasColor).toBe(true);
        expect(hasDay).toBe(true);
    });
});

describe('SPANISH_A2', () => {
    it('has approximately 50 words', () => {
        expect(SPANISH_A2.length).toBeGreaterThanOrEqual(48);
        expect(SPANISH_A2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of SPANISH_A2) {
            expect(word).toHaveProperty('es');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('es_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.es).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.es_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.es.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.es_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A2', () => {
        for (const word of SPANISH_A2) {
            expect(word.level).toBe('A2');
        }
    });

    it('all words are lang es', () => {
        for (const word of SPANISH_A2) {
            expect(word.lang).toBe('es');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < SPANISH_A2.length; i++) {
            expect(SPANISH_A2[i].id).toBe(i);
        }
    });

    it('covers A2 vocabulary categories', () => {
        const words = SPANISH_A2.map(w => w.en);
        const hasPastTense = words.some(w => ['I ate', 'I went', 'I had'].includes(w));
        const hasRoutine = words.some(w => ['I get up', 'I shower', 'I have breakfast'].includes(w));
        const hasShopping = words.some(w => ['to buy', 'store', 'price', 'cheap', 'expensive'].includes(w));
        const hasDirections = words.some(w => ['to the right', 'to the left', 'straight ahead', 'near', 'far'].includes(w));
        expect(hasPastTense).toBe(true);
        expect(hasRoutine).toBe(true);
        expect(hasShopping).toBe(true);
        expect(hasDirections).toBe(true);
    });
});

describe('SPANISH_B1', () => {
    it('has approximately 50 words', () => {
        expect(SPANISH_B1.length).toBeGreaterThanOrEqual(48);
        expect(SPANISH_B1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of SPANISH_B1) {
            expect(word).toHaveProperty('es');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('es_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.es).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.es_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.es.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.es_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B1', () => {
        for (const word of SPANISH_B1) {
            expect(word.level).toBe('B1');
        }
    });

    it('all words are lang es', () => {
        for (const word of SPANISH_B1) {
            expect(word.lang).toBe('es');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < SPANISH_B1.length; i++) {
            expect(SPANISH_B1[i].id).toBe(i);
        }
    });

    it('covers intermediate vocabulary categories', () => {
        const words = SPANISH_B1.map(w => w.en);
        const hasWorkplace = words.some(w => ['interview', 'meeting', 'proposal', 'development', 'employee'].includes(w));
        const hasAbstract = words.some(w => ['knowledge', 'opportunity', 'experience', 'responsibility', 'opinion'].includes(w));
        const hasConnector = words.some(w => ['furthermore', 'however', 'therefore', 'although'].includes(w));
        const hasMedia = words.some(w => ['news', 'article', 'debate', 'influence'].includes(w));
        expect(hasWorkplace).toBe(true);
        expect(hasAbstract).toBe(true);
        expect(hasConnector).toBe(true);
        expect(hasMedia).toBe(true);
    });
});

describe('SPANISH_B2', () => {
    it('has approximately 50 words', () => {
        expect(SPANISH_B2.length).toBeGreaterThanOrEqual(48);
        expect(SPANISH_B2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of SPANISH_B2) {
            expect(word).toHaveProperty('es');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('es_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.es).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.es_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.es.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.es_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B2', () => {
        for (const word of SPANISH_B2) {
            expect(word.level).toBe('B2');
        }
    });

    it('all words are lang es', () => {
        for (const word of SPANISH_B2) {
            expect(word.lang).toBe('es');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < SPANISH_B2.length; i++) {
            expect(SPANISH_B2[i].id).toBe(i);
        }
    });

    it('covers upper-intermediate vocabulary categories', () => {
        const words = SPANISH_B2.map(w => w.en);
        const hasIdiomatic = words.some(w => ['to tackle', 'to entail', 'to put into practice', 'to take into account', 'to cope with'].includes(w));
        const hasFormal = words.some(w => ['nevertheless', 'consequently', 'ultimately', 'in spite of', 'in advance'].includes(w));
        const hasSophisticated = words.some(w => ['approach', 'perspective', 'implication', 'significance', 'coherence'].includes(w));
        const hasSocial = words.some(w => ['investment', 'growth', 'sustainability', 'diversity', 'globalization'].includes(w));
        expect(hasIdiomatic).toBe(true);
        expect(hasFormal).toBe(true);
        expect(hasSophisticated).toBe(true);
        expect(hasSocial).toBe(true);
    });
});

describe('FRENCH_A1', () => {
    it('has approximately 50 words', () => {
        expect(FRENCH_A1.length).toBeGreaterThanOrEqual(48);
        expect(FRENCH_A1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of FRENCH_A1) {
            expect(word).toHaveProperty('fr');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('fr_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.fr).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.fr_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.fr.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.fr_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A1', () => {
        for (const word of FRENCH_A1) {
            expect(word.level).toBe('A1');
        }
    });

    it('all words are lang fr', () => {
        for (const word of FRENCH_A1) {
            expect(word.lang).toBe('fr');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < FRENCH_A1.length; i++) {
            expect(FRENCH_A1[i].id).toBe(i);
        }
    });

    it('covers basic vocabulary categories', () => {
        const words = FRENCH_A1.map(w => w.en);
        const hasGreeting = words.some(w => ['hello', 'goodbye', 'thank you', 'please'].includes(w));
        const hasFamily = words.some(w => ['mother', 'father', 'brother', 'sister'].includes(w));
        const hasFood = words.some(w => ['water', 'bread', 'milk', 'apple', 'cheese'].includes(w));
        const hasColor = words.some(w => ['red', 'blue', 'green', 'yellow', 'white'].includes(w));
        const hasDay = words.some(w => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(w));
        const hasVerb = words.some(w => ['to be', 'to have', 'to go', 'to do'].includes(w));
        expect(hasGreeting).toBe(true);
        expect(hasFamily).toBe(true);
        expect(hasFood).toBe(true);
        expect(hasColor).toBe(true);
        expect(hasDay).toBe(true);
        expect(hasVerb).toBe(true);
    });
});

describe('FRENCH_A2', () => {
    it('has approximately 50 words', () => {
        expect(FRENCH_A2.length).toBeGreaterThanOrEqual(48);
        expect(FRENCH_A2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of FRENCH_A2) {
            expect(word).toHaveProperty('fr');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('fr_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.fr).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.fr_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.fr.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.fr_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A2', () => {
        for (const word of FRENCH_A2) {
            expect(word.level).toBe('A2');
        }
    });

    it('all words are lang fr', () => {
        for (const word of FRENCH_A2) {
            expect(word.lang).toBe('fr');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < FRENCH_A2.length; i++) {
            expect(FRENCH_A2[i].id).toBe(i);
        }
    });

    it('covers A2 vocabulary categories', () => {
        const words = FRENCH_A2.map(w => w.en);
        const hasPastTense = words.some(w => ['I ate', 'I went', 'I had'].includes(w));
        const hasRoutine = words.some(w => ['I get up', 'I shower', 'I have breakfast'].includes(w));
        const hasShopping = words.some(w => ['to buy', 'store', 'price', 'cheap', 'expensive'].includes(w));
        const hasDirections = words.some(w => ['to the right', 'to the left', 'straight ahead', 'near', 'far'].includes(w));
        const hasTravel = words.some(w => ['airport', 'ticket', 'luggage', 'vacation'].includes(w));
        expect(hasPastTense).toBe(true);
        expect(hasRoutine).toBe(true);
        expect(hasShopping).toBe(true);
        expect(hasDirections).toBe(true);
        expect(hasTravel).toBe(true);
    });
});

describe('FRENCH_B1', () => {
    it('has approximately 50 words', () => {
        expect(FRENCH_B1.length).toBeGreaterThanOrEqual(48);
        expect(FRENCH_B1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of FRENCH_B1) {
            expect(word).toHaveProperty('fr');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('fr_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.fr).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.fr_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.fr.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.fr_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B1', () => {
        for (const word of FRENCH_B1) {
            expect(word.level).toBe('B1');
        }
    });

    it('all words are lang fr', () => {
        for (const word of FRENCH_B1) {
            expect(word.lang).toBe('fr');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < FRENCH_B1.length; i++) {
            expect(FRENCH_B1[i].id).toBe(i);
        }
    });

    it('covers intermediate vocabulary categories', () => {
        const words = FRENCH_B1.map(w => w.en);
        const hasWorkplace = words.some(w => ['interview', 'meeting', 'proposal', 'development', 'employee'].includes(w));
        const hasAbstract = words.some(w => ['knowledge', 'opportunity', 'experience', 'responsibility', 'opinion'].includes(w));
        const hasConnector = words.some(w => ['furthermore', 'however', 'therefore', 'although'].includes(w));
        const hasMedia = words.some(w => ['news', 'article', 'debate', 'influence'].includes(w));
        expect(hasWorkplace).toBe(true);
        expect(hasAbstract).toBe(true);
        expect(hasConnector).toBe(true);
        expect(hasMedia).toBe(true);
    });
});

describe('FRENCH_B2', () => {
    it('has approximately 50 words', () => {
        expect(FRENCH_B2.length).toBeGreaterThanOrEqual(48);
        expect(FRENCH_B2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of FRENCH_B2) {
            expect(word).toHaveProperty('fr');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('fr_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.fr).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.fr_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.fr.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.fr_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B2', () => {
        for (const word of FRENCH_B2) {
            expect(word.level).toBe('B2');
        }
    });

    it('all words are lang fr', () => {
        for (const word of FRENCH_B2) {
            expect(word.lang).toBe('fr');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < FRENCH_B2.length; i++) {
            expect(FRENCH_B2[i].id).toBe(i);
        }
    });

    it('covers upper-intermediate vocabulary categories', () => {
        const words = FRENCH_B2.map(w => w.en);
        const hasIdiomatic = words.some(w => ['to tackle', 'to entail', 'to put into practice', 'to take into account', 'to cope with'].includes(w));
        const hasFormal = words.some(w => ['nevertheless', 'consequently', 'ultimately', 'in spite of', 'in advance'].includes(w));
        const hasSophisticated = words.some(w => ['approach', 'perspective', 'implication', 'significance', 'coherence'].includes(w));
        const hasSocial = words.some(w => ['investment', 'growth', 'sustainability', 'diversity', 'globalization'].includes(w));
        expect(hasIdiomatic).toBe(true);
        expect(hasFormal).toBe(true);
        expect(hasSophisticated).toBe(true);
        expect(hasSocial).toBe(true);
    });
});

describe('GERMAN_A1', () => {
    it('has approximately 50 words', () => {
        expect(GERMAN_A1.length).toBeGreaterThanOrEqual(48);
        expect(GERMAN_A1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of GERMAN_A1) {
            expect(word).toHaveProperty('de');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('de_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.de).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.de_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.de.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.de_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A1', () => {
        for (const word of GERMAN_A1) {
            expect(word.level).toBe('A1');
        }
    });

    it('all words are lang de', () => {
        for (const word of GERMAN_A1) {
            expect(word.lang).toBe('de');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < GERMAN_A1.length; i++) {
            expect(GERMAN_A1[i].id).toBe(i);
        }
    });

    it('covers basic vocabulary categories', () => {
        const words = GERMAN_A1.map(w => w.en);
        const hasGreeting = words.some(w => ['hello', 'goodbye', 'thank you', 'please'].includes(w));
        const hasFamily = words.some(w => ['mother', 'father', 'brother', 'sister'].includes(w));
        const hasFood = words.some(w => ['water', 'bread', 'milk', 'apple', 'cheese'].includes(w));
        const hasColor = words.some(w => ['red', 'blue', 'green', 'yellow', 'white'].includes(w));
        const hasDay = words.some(w => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(w));
        const hasVerb = words.some(w => ['to be', 'to have', 'to go', 'to do'].includes(w));
        expect(hasGreeting).toBe(true);
        expect(hasFamily).toBe(true);
        expect(hasFood).toBe(true);
        expect(hasColor).toBe(true);
        expect(hasDay).toBe(true);
        expect(hasVerb).toBe(true);
    });
});

describe('GERMAN_A2', () => {
    it('has approximately 50 words', () => {
        expect(GERMAN_A2.length).toBeGreaterThanOrEqual(48);
        expect(GERMAN_A2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of GERMAN_A2) {
            expect(word).toHaveProperty('de');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('de_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.de).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.de_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.de.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.de_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A2', () => {
        for (const word of GERMAN_A2) {
            expect(word.level).toBe('A2');
        }
    });

    it('all words are lang de', () => {
        for (const word of GERMAN_A2) {
            expect(word.lang).toBe('de');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < GERMAN_A2.length; i++) {
            expect(GERMAN_A2[i].id).toBe(i);
        }
    });

    it('covers A2 vocabulary categories', () => {
        const words = GERMAN_A2.map(w => w.en);
        const hasPastTense = words.some(w => ['I ate', 'I went', 'I had'].includes(w));
        const hasRoutine = words.some(w => ['to get up', 'to shower', 'to have breakfast'].includes(w));
        const hasShopping = words.some(w => ['to buy', 'store', 'price', 'cheap', 'expensive'].includes(w));
        const hasDirections = words.some(w => ['to the right', 'to the left', 'straight ahead', 'near', 'far'].includes(w));
        const hasTravel = words.some(w => ['airport', 'ticket', 'luggage', 'vacation'].includes(w));
        const hasConnectors = words.some(w => ['while', 'after', 'before', 'always', 'never'].includes(w));
        expect(hasPastTense).toBe(true);
        expect(hasRoutine).toBe(true);
        expect(hasShopping).toBe(true);
        expect(hasDirections).toBe(true);
        expect(hasTravel).toBe(true);
        expect(hasConnectors).toBe(true);
    });
});

describe('GERMAN_B1', () => {
    it('has approximately 50 words', () => {
        expect(GERMAN_B1.length).toBeGreaterThanOrEqual(48);
        expect(GERMAN_B1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of GERMAN_B1) {
            expect(word).toHaveProperty('de');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('de_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.de).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.de_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.de.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.de_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B1', () => {
        for (const word of GERMAN_B1) {
            expect(word.level).toBe('B1');
        }
    });

    it('all words are lang de', () => {
        for (const word of GERMAN_B1) {
            expect(word.lang).toBe('de');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < GERMAN_B1.length; i++) {
            expect(GERMAN_B1[i].id).toBe(i);
        }
    });

    it('covers intermediate vocabulary categories', () => {
        const words = GERMAN_B1.map(w => w.en);
        const hasWorkplace = words.some(w => ['interview', 'meeting', 'proposal', 'development', 'employee'].includes(w));
        const hasAbstract = words.some(w => ['knowledge', 'opportunity', 'experience', 'responsibility', 'opinion'].includes(w));
        const hasConnector = words.some(w => ['furthermore', 'however', 'therefore', 'although'].includes(w));
        const hasMedia = words.some(w => ['news', 'article', 'debate', 'influence'].includes(w));
        expect(hasWorkplace).toBe(true);
        expect(hasAbstract).toBe(true);
        expect(hasConnector).toBe(true);
        expect(hasMedia).toBe(true);
    });
});

describe('GERMAN_B2', () => {
    it('has approximately 50 words', () => {
        expect(GERMAN_B2.length).toBeGreaterThanOrEqual(48);
        expect(GERMAN_B2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of GERMAN_B2) {
            expect(word).toHaveProperty('de');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('de_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.de).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.de_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.de.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.de_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B2', () => {
        for (const word of GERMAN_B2) {
            expect(word.level).toBe('B2');
        }
    });

    it('all words are lang de', () => {
        for (const word of GERMAN_B2) {
            expect(word.lang).toBe('de');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < GERMAN_B2.length; i++) {
            expect(GERMAN_B2[i].id).toBe(i);
        }
    });

    it('covers upper-intermediate vocabulary categories', () => {
        const words = GERMAN_B2.map(w => w.en);
        const hasIdiomatic = words.some(w => ['to tackle', 'to entail', 'to put into practice', 'to take into account', 'to cope with'].includes(w));
        const hasFormal = words.some(w => ['nevertheless', 'consequently', 'ultimately', 'in spite of', 'in advance'].includes(w));
        const hasSophisticated = words.some(w => ['approach', 'perspective', 'implication', 'significance', 'coherence'].includes(w));
        const hasSocial = words.some(w => ['investment', 'growth', 'sustainability', 'diversity', 'globalization'].includes(w));
        expect(hasIdiomatic).toBe(true);
        expect(hasFormal).toBe(true);
        expect(hasSophisticated).toBe(true);
        expect(hasSocial).toBe(true);
    });
});

describe('ITALIAN_A1', () => {
    it('has approximately 50 words', () => {
        expect(ITALIAN_A1.length).toBeGreaterThanOrEqual(48);
        expect(ITALIAN_A1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of ITALIAN_A1) {
            expect(word).toHaveProperty('it');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('it_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.it).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.it_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.it.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.it_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A1', () => {
        for (const word of ITALIAN_A1) {
            expect(word.level).toBe('A1');
        }
    });

    it('all words are lang it', () => {
        for (const word of ITALIAN_A1) {
            expect(word.lang).toBe('it');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < ITALIAN_A1.length; i++) {
            expect(ITALIAN_A1[i].id).toBe(i);
        }
    });

    it('covers basic vocabulary categories', () => {
        const words = ITALIAN_A1.map(w => w.en);
        const hasGreeting = words.some(w => ['hello', 'goodbye', 'thank you', 'please'].includes(w));
        const hasFamily = words.some(w => ['mother', 'father', 'brother', 'sister'].includes(w));
        const hasFood = words.some(w => ['water', 'bread', 'milk', 'apple', 'cheese'].includes(w));
        const hasColor = words.some(w => ['red', 'blue', 'green', 'yellow', 'white'].includes(w));
        const hasDay = words.some(w => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(w));
        const hasVerb = words.some(w => ['to be', 'to have', 'to go', 'to do'].includes(w));
        expect(hasGreeting).toBe(true);
        expect(hasFamily).toBe(true);
        expect(hasFood).toBe(true);
        expect(hasColor).toBe(true);
        expect(hasDay).toBe(true);
        expect(hasVerb).toBe(true);
    });
});

describe('ITALIAN_A2', () => {
    it('has approximately 50 words', () => {
        expect(ITALIAN_A2.length).toBeGreaterThanOrEqual(48);
        expect(ITALIAN_A2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of ITALIAN_A2) {
            expect(word).toHaveProperty('it');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('it_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.it).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.it_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.it.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.it_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A2', () => {
        for (const word of ITALIAN_A2) {
            expect(word.level).toBe('A2');
        }
    });

    it('all words are lang it', () => {
        for (const word of ITALIAN_A2) {
            expect(word.lang).toBe('it');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < ITALIAN_A2.length; i++) {
            expect(ITALIAN_A2[i].id).toBe(i);
        }
    });

    it('covers A2 vocabulary categories', () => {
        const words = ITALIAN_A2.map(w => w.en);
        const hasPastTense = words.some(w => ['I ate', 'I went', 'I had'].includes(w));
        const hasRoutine = words.some(w => ['to get up', 'to shower', 'to have breakfast'].includes(w));
        const hasShopping = words.some(w => ['to buy', 'store', 'price', 'cheap', 'expensive'].includes(w));
        const hasDirections = words.some(w => ['to the right', 'to the left', 'straight ahead', 'near', 'far'].includes(w));
        const hasTravel = words.some(w => ['airport', 'ticket', 'luggage', 'vacation'].includes(w));
        const hasConnectors = words.some(w => ['while', 'after', 'before', 'always', 'never'].includes(w));
        expect(hasPastTense).toBe(true);
        expect(hasRoutine).toBe(true);
        expect(hasShopping).toBe(true);
        expect(hasDirections).toBe(true);
        expect(hasTravel).toBe(true);
        expect(hasConnectors).toBe(true);
    });
});

describe('ITALIAN_B1', () => {
    it('has approximately 50 words', () => {
        expect(ITALIAN_B1.length).toBeGreaterThanOrEqual(48);
        expect(ITALIAN_B1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of ITALIAN_B1) {
            expect(word).toHaveProperty('it');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('it_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.it).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.it_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.it.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.it_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B1', () => {
        for (const word of ITALIAN_B1) {
            expect(word.level).toBe('B1');
        }
    });

    it('all words are lang it', () => {
        for (const word of ITALIAN_B1) {
            expect(word.lang).toBe('it');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < ITALIAN_B1.length; i++) {
            expect(ITALIAN_B1[i].id).toBe(i);
        }
    });

    it('covers intermediate vocabulary categories', () => {
        const words = ITALIAN_B1.map(w => w.en);
        const hasWorkplace = words.some(w => ['interview', 'meeting', 'proposal', 'development', 'employee'].includes(w));
        const hasAbstract = words.some(w => ['knowledge', 'opportunity', 'experience', 'responsibility', 'opinion'].includes(w));
        const hasConnector = words.some(w => ['furthermore', 'however', 'therefore', 'although'].includes(w));
        const hasMedia = words.some(w => ['news', 'article', 'debate', 'influence'].includes(w));
        expect(hasWorkplace).toBe(true);
        expect(hasAbstract).toBe(true);
        expect(hasConnector).toBe(true);
        expect(hasMedia).toBe(true);
    });
});

describe('ITALIAN_B2', () => {
    it('has approximately 50 words', () => {
        expect(ITALIAN_B2.length).toBeGreaterThanOrEqual(48);
        expect(ITALIAN_B2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of ITALIAN_B2) {
            expect(word).toHaveProperty('it');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('it_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.it).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.it_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.it.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.it_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B2', () => {
        for (const word of ITALIAN_B2) {
            expect(word.level).toBe('B2');
        }
    });

    it('all words are lang it', () => {
        for (const word of ITALIAN_B2) {
            expect(word.lang).toBe('it');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < ITALIAN_B2.length; i++) {
            expect(ITALIAN_B2[i].id).toBe(i);
        }
    });

    it('covers upper-intermediate vocabulary categories', () => {
        const words = ITALIAN_B2.map(w => w.en);
        const hasIdiomatic = words.some(w => ['to tackle', 'to entail', 'to put into practice', 'to take into account', 'to cope with'].includes(w));
        const hasFormal = words.some(w => ['nevertheless', 'consequently', 'ultimately', 'in spite of', 'in advance'].includes(w));
        const hasSophisticated = words.some(w => ['approach', 'perspective', 'implication', 'significance', 'coherence'].includes(w));
        const hasSocial = words.some(w => ['investment', 'growth', 'sustainability', 'diversity', 'globalization'].includes(w));
        expect(hasIdiomatic).toBe(true);
        expect(hasFormal).toBe(true);
        expect(hasSophisticated).toBe(true);
        expect(hasSocial).toBe(true);
    });
});

describe('PORTUGUESE_A1', () => {
    it('has approximately 50 words', () => {
        expect(PORTUGUESE_A1.length).toBeGreaterThanOrEqual(48);
        expect(PORTUGUESE_A1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of PORTUGUESE_A1) {
            expect(word).toHaveProperty('pt');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('pt_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.pt).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.pt_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.pt.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.pt_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A1', () => {
        for (const word of PORTUGUESE_A1) {
            expect(word.level).toBe('A1');
        }
    });

    it('all words are lang pt', () => {
        for (const word of PORTUGUESE_A1) {
            expect(word.lang).toBe('pt');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < PORTUGUESE_A1.length; i++) {
            expect(PORTUGUESE_A1[i].id).toBe(i);
        }
    });

    it('covers basic vocabulary categories', () => {
        const words = PORTUGUESE_A1.map(w => w.en);
        const hasGreeting = words.some(w => ['hello', 'goodbye', 'good morning', 'good night'].includes(w));
        const hasFamily = words.some(w => ['mother', 'father', 'brother', 'sister'].includes(w));
        const hasFood = words.some(w => ['water', 'bread', 'milk', 'apple', 'rice'].includes(w));
        const hasColor = words.some(w => ['red', 'blue', 'green', 'yellow', 'white'].includes(w));
        const hasDay = words.some(w => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(w));
        expect(hasGreeting).toBe(true);
        expect(hasFamily).toBe(true);
        expect(hasFood).toBe(true);
        expect(hasColor).toBe(true);
        expect(hasDay).toBe(true);
    });
});

describe('PORTUGUESE_A2', () => {
    it('has approximately 50 words', () => {
        expect(PORTUGUESE_A2.length).toBeGreaterThanOrEqual(48);
        expect(PORTUGUESE_A2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of PORTUGUESE_A2) {
            expect(word).toHaveProperty('pt');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('pt_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.pt).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.pt_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.pt.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.pt_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A2', () => {
        for (const word of PORTUGUESE_A2) {
            expect(word.level).toBe('A2');
        }
    });

    it('all words are lang pt', () => {
        for (const word of PORTUGUESE_A2) {
            expect(word.lang).toBe('pt');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < PORTUGUESE_A2.length; i++) {
            expect(PORTUGUESE_A2[i].id).toBe(i);
        }
    });

    it('covers A2 vocabulary categories', () => {
        const words = PORTUGUESE_A2.map(w => w.en);
        const hasPastTense = words.some(w => ['I ate', 'I went', 'I had'].includes(w));
        const hasRoutine = words.some(w => ['I get up', 'I shower', 'I have breakfast'].includes(w));
        const hasShopping = words.some(w => ['to buy', 'store', 'price', 'cheap', 'expensive'].includes(w));
        const hasDirections = words.some(w => ['to the right', 'to the left', 'straight ahead', 'near', 'far'].includes(w));
        const hasTravel = words.some(w => ['airport', 'ticket', 'luggage', 'vacation'].includes(w));
        const hasConnectors = words.some(w => ['while', 'after', 'before', 'always', 'never'].includes(w));
        expect(hasPastTense).toBe(true);
        expect(hasRoutine).toBe(true);
        expect(hasShopping).toBe(true);
        expect(hasDirections).toBe(true);
        expect(hasTravel).toBe(true);
        expect(hasConnectors).toBe(true);
    });
});

describe('PORTUGUESE_B1', () => {
    it('has approximately 50 words', () => {
        expect(PORTUGUESE_B1.length).toBeGreaterThanOrEqual(48);
        expect(PORTUGUESE_B1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of PORTUGUESE_B1) {
            expect(word).toHaveProperty('pt');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('pt_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.pt).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.pt_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.pt.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.pt_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B1', () => {
        for (const word of PORTUGUESE_B1) {
            expect(word.level).toBe('B1');
        }
    });

    it('all words are lang pt', () => {
        for (const word of PORTUGUESE_B1) {
            expect(word.lang).toBe('pt');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < PORTUGUESE_B1.length; i++) {
            expect(PORTUGUESE_B1[i].id).toBe(i);
        }
    });

    it('covers intermediate vocabulary categories', () => {
        const words = PORTUGUESE_B1.map(w => w.en);
        const hasWorkplace = words.some(w => ['interview', 'meeting', 'proposal', 'development', 'employee'].includes(w));
        const hasAbstract = words.some(w => ['knowledge', 'opportunity', 'experience', 'responsibility', 'opinion'].includes(w));
        const hasConnector = words.some(w => ['furthermore', 'however', 'therefore', 'although'].includes(w));
        const hasMedia = words.some(w => ['news', 'article', 'debate', 'influence'].includes(w));
        expect(hasWorkplace).toBe(true);
        expect(hasAbstract).toBe(true);
        expect(hasConnector).toBe(true);
        expect(hasMedia).toBe(true);
    });
});

describe('PORTUGUESE_B2', () => {
    it('has approximately 50 words', () => {
        expect(PORTUGUESE_B2.length).toBeGreaterThanOrEqual(48);
        expect(PORTUGUESE_B2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of PORTUGUESE_B2) {
            expect(word).toHaveProperty('pt');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('pt_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.pt).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.pt_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.pt.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.pt_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level B2', () => {
        for (const word of PORTUGUESE_B2) {
            expect(word.level).toBe('B2');
        }
    });

    it('all words are lang pt', () => {
        for (const word of PORTUGUESE_B2) {
            expect(word.lang).toBe('pt');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < PORTUGUESE_B2.length; i++) {
            expect(PORTUGUESE_B2[i].id).toBe(i);
        }
    });

    it('covers upper-intermediate vocabulary categories', () => {
        const words = PORTUGUESE_B2.map(w => w.en);
        const hasIdiomatic = words.some(w => ['to tackle', 'to entail', 'to put into practice', 'to take into account', 'to cope with'].includes(w));
        const hasFormal = words.some(w => ['nevertheless', 'consequently', 'ultimately', 'in spite of', 'in advance'].includes(w));
        const hasSophisticated = words.some(w => ['approach', 'perspective', 'implication', 'significance', 'coherence'].includes(w));
        const hasSocial = words.some(w => ['investment', 'growth', 'sustainability', 'diversity', 'globalization'].includes(w));
        expect(hasIdiomatic).toBe(true);
        expect(hasFormal).toBe(true);
        expect(hasSophisticated).toBe(true);
        expect(hasSocial).toBe(true);
    });
});

describe('JAPANESE_N5', () => {
    it('has approximately 50 words', () => {
        expect(JAPANESE_N5.length).toBeGreaterThanOrEqual(48);
        expect(JAPANESE_N5.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of JAPANESE_N5) {
            expect(word).toHaveProperty('ja');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('ja_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.ja).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.ja_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.ja.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.ja_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level N5', () => {
        for (const word of JAPANESE_N5) {
            expect(word.level).toBe('N5');
        }
    });

    it('all words are lang ja', () => {
        for (const word of JAPANESE_N5) {
            expect(word.lang).toBe('ja');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < JAPANESE_N5.length; i++) {
            expect(JAPANESE_N5[i].id).toBe(i);
        }
    });

    it('covers basic JLPT N5 vocabulary categories', () => {
        const words = JAPANESE_N5.map(w => w.en);
        const hasGreeting = words.some(w => ['hello', 'goodbye', 'good morning', 'good evening', 'thank you'].includes(w));
        const hasFamily = words.some(w => ['mother', 'father', 'older brother', 'older sister'].includes(w));
        const hasNouns = words.some(w => ['water', 'book', 'house', 'school', 'station'].includes(w));
        const hasAdjectives = words.some(w => ['big', 'small', 'new', 'old', 'delicious'].includes(w));
        const hasVerbs = words.some(w => ['to go', 'to eat', 'to drink', 'to see', 'to read'].includes(w));
        expect(hasGreeting).toBe(true);
        expect(hasFamily).toBe(true);
        expect(hasNouns).toBe(true);
        expect(hasAdjectives).toBe(true);
        expect(hasVerbs).toBe(true);
    });
});

describe('CHINESE_HSK1', () => {
    it('has approximately 50 words', () => {
        expect(CHINESE_HSK1.length).toBeGreaterThanOrEqual(48);
        expect(CHINESE_HSK1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of CHINESE_HSK1) {
            expect(word).toHaveProperty('zh');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('zh_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.zh).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.zh_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.zh.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.zh_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level HSK1', () => {
        for (const word of CHINESE_HSK1) {
            expect(word.level).toBe('HSK1');
        }
    });

    it('all words are lang zh', () => {
        for (const word of CHINESE_HSK1) {
            expect(word.lang).toBe('zh');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < CHINESE_HSK1.length; i++) {
            expect(CHINESE_HSK1[i].id).toBe(i);
        }
    });

    it('covers basic HSK 1 vocabulary categories', () => {
        const words = CHINESE_HSK1.map(w => w.en);
        const hasPronouns = words.some(w => ['I', 'you', 'he', 'she', 'we'].includes(w));
        const hasGreetings = words.some(w => ['hello', 'thank you', 'goodbye'].includes(w));
        const hasNouns = words.some(w => ['person', 'friend', 'teacher', 'student', 'school'].includes(w));
        const hasAdjectives = words.some(w => ['big', 'small', 'good', 'many', 'few'].includes(w));
        const hasVerbs = words.some(w => ['to eat', 'to drink', 'to go', 'to like', 'to want'].includes(w));
        expect(hasPronouns).toBe(true);
        expect(hasGreetings).toBe(true);
        expect(hasNouns).toBe(true);
        expect(hasAdjectives).toBe(true);
        expect(hasVerbs).toBe(true);
    });
});

describe('KOREAN_TOPIK1', () => {
    it('has approximately 50 words', () => {
        expect(KOREAN_TOPIK1.length).toBeGreaterThanOrEqual(48);
        expect(KOREAN_TOPIK1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of KOREAN_TOPIK1) {
            expect(word).toHaveProperty('ko');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('ko_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.ko).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.ko_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.ko.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.ko_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level TOPIK1', () => {
        for (const word of KOREAN_TOPIK1) {
            expect(word.level).toBe('TOPIK1');
        }
    });

    it('all words are lang ko', () => {
        for (const word of KOREAN_TOPIK1) {
            expect(word.lang).toBe('ko');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < KOREAN_TOPIK1.length; i++) {
            expect(KOREAN_TOPIK1[i].id).toBe(i);
        }
    });

    it('covers basic TOPIK 1 vocabulary categories', () => {
        const words = KOREAN_TOPIK1.map(w => w.en);
        const hasGreetings = words.some(w => ['hello', 'thank you', 'sorry'].includes(w));
        const hasPronouns = words.some(w => ['I', 'person', 'friend'].includes(w));
        const hasNouns = words.some(w => ['teacher', 'student', 'school', 'house', 'book'].includes(w));
        const hasAdjectives = words.some(w => ['big', 'small', 'good', 'many', 'few'].includes(w));
        const hasVerbs = words.some(w => ['to go', 'to eat', 'to drink', 'to study', 'to like'].includes(w));
        expect(hasGreetings).toBe(true);
        expect(hasPronouns).toBe(true);
        expect(hasNouns).toBe(true);
        expect(hasAdjectives).toBe(true);
        expect(hasVerbs).toBe(true);
    });
});

describe('RUSSIAN_A1', () => {
    it('has approximately 50 words', () => {
        expect(RUSSIAN_A1.length).toBeGreaterThanOrEqual(48);
        expect(RUSSIAN_A1.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of RUSSIAN_A1) {
            expect(word).toHaveProperty('ru');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('ru_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.ru).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.ru_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.ru.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.ru_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A1', () => {
        for (const word of RUSSIAN_A1) {
            expect(word.level).toBe('A1');
        }
    });

    it('all words are lang ru', () => {
        for (const word of RUSSIAN_A1) {
            expect(word.lang).toBe('ru');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < RUSSIAN_A1.length; i++) {
            expect(RUSSIAN_A1[i].id).toBe(i);
        }
    });

    it('covers basic vocabulary categories', () => {
        const words = RUSSIAN_A1.map(w => w.en);
        const hasGreeting = words.some(w => ['hello', 'goodbye', 'thank you', 'please'].includes(w));
        const hasFamily = words.some(w => ['mother', 'father', 'brother', 'sister'].includes(w));
        const hasFood = words.some(w => ['water', 'bread', 'milk', 'apple'].includes(w));
        const hasColor = words.some(w => ['red', 'blue'].includes(w));
        const hasVerbs = words.some(w => ['to work', 'to eat', 'to drink', 'to read', 'to write'].includes(w));
        expect(hasGreeting).toBe(true);
        expect(hasFamily).toBe(true);
        expect(hasFood).toBe(true);
        expect(hasColor).toBe(true);
        expect(hasVerbs).toBe(true);
    });
});

describe('RUSSIAN_A2', () => {
    it('has approximately 50 words', () => {
        expect(RUSSIAN_A2.length).toBeGreaterThanOrEqual(48);
        expect(RUSSIAN_A2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of RUSSIAN_A2) {
            expect(word).toHaveProperty('ru');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('ru_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.ru).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.ru_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.ru.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.ru_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level A2', () => {
        for (const word of RUSSIAN_A2) {
            expect(word.level).toBe('A2');
        }
    });

    it('all words are lang ru', () => {
        for (const word of RUSSIAN_A2) {
            expect(word.lang).toBe('ru');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < RUSSIAN_A2.length; i++) {
            expect(RUSSIAN_A2[i].id).toBe(i);
        }
    });

    it('covers A2 vocabulary categories', () => {
        const words = RUSSIAN_A2.map(w => w.en);
        const hasMeals = words.some(w => ['breakfast', 'lunch', 'dinner'].includes(w));
        const hasShopping = words.some(w => ['store', 'price', 'expensive', 'cheap'].includes(w));
        const hasDirections = words.some(w => ['to the right', 'to the left', 'straight ahead', 'near', 'far'].includes(w));
        const hasConnectors = words.some(w => ['while', 'after', 'before', 'always', 'never'].includes(w));
        const hasTravel = words.some(w => ['airport', 'ticket', 'luggage', 'vacation'].includes(w));
        expect(hasMeals).toBe(true);
        expect(hasShopping).toBe(true);
        expect(hasDirections).toBe(true);
        expect(hasConnectors).toBe(true);
        expect(hasTravel).toBe(true);
    });
});

describe('JAPANESE_N4', () => {
    it('has approximately 50 words', () => {
        expect(JAPANESE_N4.length).toBeGreaterThanOrEqual(48);
        expect(JAPANESE_N4.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of JAPANESE_N4) {
            expect(word).toHaveProperty('ja');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('ja_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.ja).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.ja_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.ja.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.ja_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level N4', () => {
        for (const word of JAPANESE_N4) {
            expect(word.level).toBe('N4');
        }
    });

    it('all words are lang ja', () => {
        for (const word of JAPANESE_N4) {
            expect(word.lang).toBe('ja');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < JAPANESE_N4.length; i++) {
            expect(JAPANESE_N4[i].id).toBe(i);
        }
    });

    it('covers intermediate JLPT N4 vocabulary categories', () => {
        const words = JAPANESE_N4.map(w => w.en);
        const hasAbstract = words.some(w => ['research', 'experience', 'environment', 'culture', 'health'].includes(w));
        const hasConnectors = words.some(w => ['however', 'therefore', 'if', 'and then'].includes(w));
        const hasWorkplace = words.some(w => ['interview', 'meeting', 'proposal', 'presentation'].includes(w));
        const hasActions = words.some(w => ['to continue', 'to decide', 'to find', 'to collect'].includes(w));
        expect(hasAbstract).toBe(true);
        expect(hasConnectors).toBe(true);
        expect(hasWorkplace).toBe(true);
        expect(hasActions).toBe(true);
    });
});

describe('CHINESE_HSK2', () => {
    it('has approximately 50 words', () => {
        expect(CHINESE_HSK2.length).toBeGreaterThanOrEqual(48);
        expect(CHINESE_HSK2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of CHINESE_HSK2) {
            expect(word).toHaveProperty('zh');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('zh_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.zh).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.zh_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.zh.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.zh_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level HSK2', () => {
        for (const word of CHINESE_HSK2) {
            expect(word.level).toBe('HSK2');
        }
    });

    it('all words are lang zh', () => {
        for (const word of CHINESE_HSK2) {
            expect(word.lang).toBe('zh');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < CHINESE_HSK2.length; i++) {
            expect(CHINESE_HSK2[i].id).toBe(i);
        }
    });

    it('covers HSK 2 vocabulary categories', () => {
        const words = CHINESE_HSK2.map(w => w.en);
        const hasActions = words.some(w => ['to study', 'to work', 'to help', 'to prepare'].includes(w));
        const hasConnectors = words.some(w => ['although', 'because', 'therefore', 'if'].includes(w));
        const hasPlaces = words.some(w => ['hospital', 'bank', 'supermarket', 'airport'].includes(w));
        const hasAdjectives = words.some(w => ['important', 'convenient', 'safe', 'clean'].includes(w));
        expect(hasActions).toBe(true);
        expect(hasConnectors).toBe(true);
        expect(hasPlaces).toBe(true);
        expect(hasAdjectives).toBe(true);
    });
});

describe('KOREAN_TOPIK2', () => {
    it('has approximately 50 words', () => {
        expect(KOREAN_TOPIK2.length).toBeGreaterThanOrEqual(48);
        expect(KOREAN_TOPIK2.length).toBeLessThanOrEqual(52);
    });

    it('every word has required fields', () => {
        for (const word of KOREAN_TOPIK2) {
            expect(word).toHaveProperty('ko');
            expect(word).toHaveProperty('en');
            expect(word).toHaveProperty('ko_ex');
            expect(word).toHaveProperty('en_ex');
            expect(word).toHaveProperty('level');
            expect(word).toHaveProperty('lang');
            expect(typeof word.ko).toBe('string');
            expect(typeof word.en).toBe('string');
            expect(typeof word.ko_ex).toBe('string');
            expect(typeof word.en_ex).toBe('string');
            expect(word.ko.length).toBeGreaterThan(0);
            expect(word.en.length).toBeGreaterThan(0);
            expect(word.ko_ex.length).toBeGreaterThan(0);
            expect(word.en_ex.length).toBeGreaterThan(0);
        }
    });

    it('all words are level TOPIK2', () => {
        for (const word of KOREAN_TOPIK2) {
            expect(word.level).toBe('TOPIK2');
        }
    });

    it('all words are lang ko', () => {
        for (const word of KOREAN_TOPIK2) {
            expect(word.lang).toBe('ko');
        }
    });

    it('ids are sequential starting from 0', () => {
        for (let i = 0; i < KOREAN_TOPIK2.length; i++) {
            expect(KOREAN_TOPIK2[i].id).toBe(i);
        }
    });

    it('covers TOPIK 2 vocabulary categories', () => {
        const words = KOREAN_TOPIK2.map(w => w.en);
        const hasAbstract = words.some(w => ['research', 'experience', 'environment', 'culture'].includes(w));
        const hasConnectors = words.some(w => ['however', 'therefore', 'if', 'but'].includes(w));
        const hasWorkplace = words.some(w => ['interview', 'meeting', 'proposal', 'presentation'].includes(w));
        const hasActions = words.some(w => ['to continue', 'to decide', 'to find', 'to deliver'].includes(w));
        expect(hasAbstract).toBe(true);
        expect(hasConnectors).toBe(true);
        expect(hasWorkplace).toBe(true);
        expect(hasActions).toBe(true);
    });
});