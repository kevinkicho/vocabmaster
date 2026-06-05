import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(__dirname, '..', 'public', 'js', 'escape.js'), 'utf8')
    + '\n' + readFileSync(join(__dirname, '..', 'public', 'js', 'config.js'), 'utf8');

let LEVEL_CONFIG, CEFR_LEVELS, mapLevelToCEFR;
beforeAll(() => {
    const fn = new Function('window', 'document', src + '\nreturn { LEVEL_CONFIG, CEFR_LEVELS, mapLevelToCEFR };');
    const result = fn({}, {});
    LEVEL_CONFIG = result.LEVEL_CONFIG;
    CEFR_LEVELS = result.CEFR_LEVELS;
    mapLevelToCEFR = result.mapLevelToCEFR;
});

describe('LEVEL_CONFIG groups', () => {
    it('has exactly 4 level groups', () => {
        expect(LEVEL_CONFIG.groups).toHaveLength(4);
    });

    it('CEFR levels are A1,A2,B1,B2,C1,C2', () => {
        const cefr = LEVEL_CONFIG.groups.find(g => g.key === 'cefr');
        expect(cefr).toBeDefined();
        expect(cefr.levels).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
    });

    it('JLPT levels are N5,N4,N3,N2,N1', () => {
        const jlpt = LEVEL_CONFIG.groups.find(g => g.key === 'jlpt');
        expect(jlpt).toBeDefined();
        expect(jlpt.levels).toEqual(['N5', 'N4', 'N3', 'N2', 'N1']);
    });

    it('HSK levels are HSK1-HSK6', () => {
        const hsk = LEVEL_CONFIG.groups.find(g => g.key === 'hsk');
        expect(hsk).toBeDefined();
        expect(hsk.levels).toEqual(['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6']);
    });

    it('TOPIK levels are TOPIK1-6', () => {
        const topik = LEVEL_CONFIG.groups.find(g => g.key === 'topik');
        expect(topik).toBeDefined();
        expect(topik.levels).toEqual(['TOPIK1', 'TOPIK2', 'TOPIK3', 'TOPIK4', 'TOPIK5', 'TOPIK6']);
    });

    it('JLPT maps to Japanese languages', () => {
        const jlpt = LEVEL_CONFIG.groups.find(g => g.key === 'jlpt');
        expect(jlpt.langs).toEqual(['ja', 'ja_furi', 'ja_roma']);
    });

    it('HSK maps to Chinese languages', () => {
        const hsk = LEVEL_CONFIG.groups.find(g => g.key === 'hsk');
        expect(hsk.langs).toEqual(['zh', 'zh_pin']);
    });

    it('TOPIK maps to Korean languages', () => {
        const topik = LEVEL_CONFIG.groups.find(g => g.key === 'topik');
        expect(topik.langs).toEqual(['ko', 'ko_roma']);
    });

    it('CEFR maps to European languages', () => {
        const cefr = LEVEL_CONFIG.groups.find(g => g.key === 'cefr');
        expect(cefr.langs).toEqual(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ru_tr']);
    });
});

describe('CEFR_LEVELS', () => {
    it('has all 6 CEFR levels', () => {
        expect(Object.keys(CEFR_LEVELS)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
    });

    it('each level has label, description, and wordCountRange', () => {
        for (const key of Object.keys(CEFR_LEVELS)) {
            const level = CEFR_LEVELS[key];
            expect(level).toHaveProperty('label');
            expect(level).toHaveProperty('description');
            expect(level).toHaveProperty('wordCountRange');
            expect(typeof level.label).toBe('string');
            expect(typeof level.description).toBe('string');
            expect(typeof level.wordCountRange).toBe('string');
            expect(level.label.length).toBeGreaterThan(0);
            expect(level.description.length).toBeGreaterThan(0);
            expect(level.wordCountRange).toMatch(/^\d+-\d+$/);
        }
    });
});

describe('mapLevelToCEFR', () => {
    it('maps JLPT levels to CEFR for Japanese', () => {
        expect(mapLevelToCEFR('N5', 'ja')).toBe('A1');
        expect(mapLevelToCEFR('N4', 'ja')).toBe('A2');
        expect(mapLevelToCEFR('N3', 'ja')).toBe('B1');
        expect(mapLevelToCEFR('N2', 'ja')).toBe('B2');
        expect(mapLevelToCEFR('N1', 'ja')).toBe('C1');
    });

    it('maps HSK levels to CEFR for Chinese', () => {
        expect(mapLevelToCEFR('HSK1', 'zh')).toBe('A1');
        expect(mapLevelToCEFR('HSK2', 'zh')).toBe('A2');
        expect(mapLevelToCEFR('HSK3', 'zh')).toBe('B1');
        expect(mapLevelToCEFR('HSK4', 'zh')).toBe('B2');
        expect(mapLevelToCEFR('HSK5', 'zh')).toBe('C1');
        expect(mapLevelToCEFR('HSK6', 'zh')).toBe('C2');
    });

    it('maps TOPIK levels to CEFR for Korean', () => {
        expect(mapLevelToCEFR('TOPIK1', 'ko')).toBe('A1');
        expect(mapLevelToCEFR('TOPIK2', 'ko')).toBe('A1');
        expect(mapLevelToCEFR('TOPIK3', 'ko')).toBe('A2');
        expect(mapLevelToCEFR('TOPIK4', 'ko')).toBe('B1');
        expect(mapLevelToCEFR('TOPIK5', 'ko')).toBe('B2');
        expect(mapLevelToCEFR('TOPIK6', 'ko')).toBe('C1');
    });

    it('returns CEFR levels directly for European languages', () => {
        expect(mapLevelToCEFR('A1', 'en')).toBe('A1');
        expect(mapLevelToCEFR('B2', 'fr')).toBe('B2');
        expect(mapLevelToCEFR('C2', 'de')).toBe('C2');
    });

    it('falls back without langCode', () => {
        expect(mapLevelToCEFR('N5', undefined)).toBe('A1');
        expect(mapLevelToCEFR('HSK3', undefined)).toBe('B1');
        expect(mapLevelToCEFR('A2', undefined)).toBe('A2');
    });

    it('returns null for unknown levels', () => {
        expect(mapLevelToCEFR(null, 'ja')).toBeNull();
        expect(mapLevelToCEFR('UNKNOWN', 'en')).toBeNull();
    });
});