/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let SentenceUtils;

beforeAll(() => {
    const code = fs.readFileSync(path.join(root, 'public/js/sentence_utils.js'), 'utf8');
    const ctx = { window: {}, console };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    SentenceUtils = ctx.window.SentenceUtils;
});

describe('SentenceUtils cloze blanks', () => {
    it('matches kana reading when headword is kanji (部屋 → へや)', () => {
        const item = {
            ja: '部屋',
            ja_furi: 'へや',
            ja_ex: 'このへやはとてもひろいです。'
        };
        const span = SentenceUtils.findBlankSpan(item.ja_ex, item, 'ja');
        expect(span).toBeTruthy();
        expect(span.matched).toBe('へや');
    });

    it('matches conjugated verb form from dictionary reading (言う → いいました)', () => {
        const item = {
            ja: '言う',
            ja_furi: 'いう',
            ja_ex: 'かのじょは「ありがとう」といいました。'
        };
        const span = SentenceUtils.findBlankSpan(item.ja_ex, item, 'ja');
        expect(span).toBeTruthy();
        expect(span.matched.length).toBeGreaterThanOrEqual(2);
        expect(item.ja_ex.slice(span.start, span.end)).toBe(span.matched);
    });

    it('generateCloze wraps matched span in mask html', () => {
        const item = { ja: '茶色', ja_furi: 'ちゃいろ', ja_ex: 'この茶色のかばんが好きです。' };
        const cloze = SentenceUtils.generateCloze(item.ja_ex, item, 'ja');
        expect(cloze.matched).toBe('茶色');
        expect(cloze.html).toContain('main-blank');
        expect(cloze.html).toContain('茶色');
        expect(cloze.audio).toContain('...');
    });
});

describe('SentenceUtils chunking', () => {
    it('chunks Japanese with Segmenter into multiple blocks', () => {
        const item = { ja: '茶色', ja_ex: 'この茶色のかばんが好きです。' };
        const blocks = SentenceUtils.chunkSentence(item.ja_ex, 'ja', { item });
        expect(blocks.length).toBeGreaterThanOrEqual(3);
        expect(blocks.length).toBeLessThanOrEqual(8);
        expect(blocks.join('')).toBe(SentenceUtils.normalizeText(item.ja_ex).replace(/\s+/g, '') || blocks.join(''));
        // reconstruction without spaces should equal original without spaces
        const orig = item.ja_ex.replace(/\s+/g, '');
        expect(blocks.join('').replace(/\s+/g, '')).toBe(orig);
    });

    it('anchors vocab as one block', () => {
        const item = { ja: '部屋', ja_furi: 'へや', ja_ex: 'このへやはとてもひろいです。' };
        const blocks = SentenceUtils.chunkSentence(item.ja_ex, 'ja', { item });
        expect(blocks.some((b) => b.includes('へや'))).toBe(true);
    });

    it('shuffles without losing blocks', () => {
        const blocks = ['a', 'b', 'c', 'd'];
        const sh = SentenceUtils.shuffleBlocks(blocks);
        expect(sh.slice().sort().join()).toBe(blocks.slice().sort().join());
        expect(sh.length).toBe(4);
    });

    it('space-splits English', () => {
        const blocks = SentenceUtils.chunkSentence('I like this brown bag.', 'en', {});
        expect(blocks.length).toBeGreaterThanOrEqual(4);
    });

    it('honors curated buildBlocks when they reassemble the sentence (F7)', () => {
        const item = {
            ja: '茶色',
            ja_ex: 'この茶色のかばんが好きです。',
            buildBlocks: ['この', '茶色の', 'かばんが', '好きです。']
        };
        const blocks = SentenceUtils.chunkSentence(item.ja_ex, 'ja', { item });
        expect(blocks).toEqual(item.buildBlocks);
    });

    it('matches Russian with Cyrillic morphology extension (F4)', () => {
        const item = { ru: 'комната', ru_ex: 'Эта комната очень просторная.' };
        const span = SentenceUtils.findBlankSpan(item.ru_ex, item, 'ru');
        expect(span).toBeTruthy();
        expect(span.matched).toContain('комнат');
    });
});
