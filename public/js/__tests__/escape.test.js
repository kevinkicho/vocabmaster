import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(__dirname, '..', 'escape.js'), 'utf8');

let escapeHtml;
beforeAll(() => {
    const fn = new Function(src + '\nreturn escapeHtml;');
    escapeHtml = fn();
});

describe('escapeHtml', () => {
    it('escapes script tags', () => {
        expect(escapeHtml("<script>alert('xss')</script>")).toBe(
            '&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;'
        );
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes single quotes', () => {
        expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('escapes ampersands', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes less-than and greater-than symbols', () => {
        expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('handles null input', () => {
        expect(escapeHtml(null)).toBe('');
    });

    it('handles undefined input', () => {
        expect(escapeHtml(undefined)).toBe('');
    });

    it('handles non-string input (numbers)', () => {
        expect(escapeHtml(42)).toBe('42');
    });

    it('returns empty string for empty string input', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('leaves plain text unchanged', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });

    it('escapes multiple ampersands', () => {
        expect(escapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
    });

    it('escapes ampersands before other characters to prevent double-escaping', () => {
        expect(escapeHtml('&<')).toBe('&amp;&lt;');
    });
});