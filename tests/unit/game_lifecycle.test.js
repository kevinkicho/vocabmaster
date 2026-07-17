/**
 * Cornerstone GameMode lifecycle: destroy, bindKeys idempotent, waitAndNav cancel.
 * Node environment with minimal document stub (no jsdom dependency).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const coreSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'game_core.js'), 'utf8');

function loadGameMode() {
    const listeners = [];
    const appView = {
        classList: { add: () => {}, remove: () => {} },
        querySelectorAll: () => [],
        querySelector: () => null
    };
    const addEventListener = (type, fn) => { listeners.push({ type, fn }); };
    const removeEventListener = (type, fn) => {
        const i = listeners.findIndex((x) => x.type === type && x.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
    };
    const document = {
        getElementById: (id) => {
            if (id === 'app-view') return appView;
            // Modals: treat as hidden so keys not blocked
            return { classList: { contains: (c) => c === 'hidden' }, innerHTML: '' };
        },
        addEventListener,
        removeEventListener,
        querySelectorAll: () => [],
        querySelector: () => null
    };
    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: (fn) => setTimeout(fn, 0),
        getComputedStyle: () => ({ position: 'static' }),
        document,
        window: null,
        history: { replaceState: () => {}, pushState: () => {} },
        addEventListener,
        removeEventListener,
        L: () => {},
        escapeHtml: (s) => String(s || ''),
        LANG_MAP: new Map(),
        app: {
            store: {
                getLoc: () => 0,
                setLoc: () => {},
                prefs: { globalClickMode: 'single', audioWait: false }
            },
            data: {
                list: [{ id: 1, ja: 'あ', en: 'a' }],
                activeList: [{ id: 1, ja: 'あ', en: 'a' }],
                getFilteredList: () => [{ id: 1, ja: 'あ', en: 'a' }],
                getFilteredListStrict: () => [{ id: 1, ja: 'あ', en: 'a' }],
                recordScore: () => {}
            },
            analytics: {
                startSession: () => {},
                endSession: () => {},
                recordAttempt: () => {}
            },
            score: 0,
            learningLoop: null,
            fitter: null,
            ui: { hideTooltip: () => {} },
            audio: { play: () => Promise.resolve(), cancel: () => {} },
            learningPath: null
        },
        _listeners: listeners
    };
    ctx.window = ctx;
    // window.* event APIs used by GameMode resize + keys
    ctx.window.addEventListener = addEventListener;
    ctx.window.removeEventListener = removeEventListener;
    vm.createContext(ctx);
    vm.runInContext(coreSrc, ctx);
    return ctx;
}

describe('GameMode lifecycle (game_core)', () => {
    let ctx;

    beforeEach(() => {
        ctx = loadGameMode();
    });

    it('bindKeys is idempotent (single keydown listener)', () => {
        const game = new ctx.GameMode('quiz');
        const count = () => ctx._listeners.filter((l) => l.type === 'keydown').length;
        expect(count()).toBe(1);
        game.bindKeys();
        game.bindKeys();
        game.bindKeys();
        expect(count()).toBe(1);
        game.destroy();
        expect(count()).toBe(0);
    });

    it('destroy makes score/miss no-ops and bumps lifecycle gen', async () => {
        const game = new ctx.GameMode('quiz');
        const gen0 = game._lifecycleGen;
        game.destroy();
        expect(game._destroyed).toBe(true);
        expect(game._lifecycleGen).toBe(gen0 + 1);
        const scoreBefore = ctx.app.score;
        game.score(10);
        expect(ctx.app.score).toBe(scoreBefore);
        game.miss();
        await game.waitAndNav(null, 5);
    });

    it('waitAndNav no-ops after destroy mid-flight', async () => {
        const game = new ctx.GameMode('quiz');
        const p = game.waitAndNav(null, 40);
        game.destroy();
        await p;
        expect(game._destroyed).toBe(true);
    });

    it('isGameKeyChromeBlocking is exported', () => {
        expect(typeof ctx.isGameKeyChromeBlocking).toBe('function');
        expect(ctx.isGameKeyChromeBlocking()).toBe(false);
    });
});
