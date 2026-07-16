import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'public', 'js', 'daily_session.js'), 'utf8');

let SESSION_INTENSITY_PRESETS, SESSION_DEFAULTS, getSessionDefaults;
let buildPlan, buildQuizOnlyPlan, DailySessionService;

function vocab(ids) {
    return ids.map((id) => ({ id }));
}

beforeAll(() => {
    const win = {};
    globalThis.L = () => {};
    const fn = new Function(
        'window',
        src +
            '\nreturn { SESSION_INTENSITY_PRESETS, SESSION_DEFAULTS, getSessionDefaults, buildPlan, buildQuizOnlyPlan, DailySessionService, DAILY_SESSION_LS_KEY };'
    );
    const result = fn(win);
    SESSION_INTENSITY_PRESETS = result.SESSION_INTENSITY_PRESETS;
    SESSION_DEFAULTS = result.SESSION_DEFAULTS;
    getSessionDefaults = result.getSessionDefaults;
    buildPlan = result.buildPlan;
    buildQuizOnlyPlan = result.buildQuizOnlyPlan;
    DailySessionService = result.DailySessionService;
    globalThis.window = win;
});

beforeEach(() => {
    globalThis.app = undefined;
});

describe('SESSION_INTENSITY_PRESETS / getSessionDefaults', () => {
    it('casual is default 15/5/12', () => {
        expect(SESSION_DEFAULTS.targetTotal).toBe(15);
        expect(SESSION_DEFAULTS.maxNew).toBe(5);
        expect(SESSION_DEFAULTS.maxDue).toBe(12);
        expect(SESSION_DEFAULTS.reinsertLapses).toBe(true);
        expect(SESSION_DEFAULTS.includeAiBlock).toBe(true);

        const d = getSessionDefaults({});
        expect(d.maxNew).toBe(5);
        expect(d.maxDue).toBe(12);
        expect(d.targetTotal).toBe(15);

        const d2 = getSessionDefaults(null);
        expect(d2.maxNew).toBe(5);
    });

    it('cram is 25/8/20', () => {
        const d = getSessionDefaults({ sessionIntensity: 'cram' });
        expect(d.targetTotal).toBe(25);
        expect(d.maxNew).toBe(8);
        expect(d.maxDue).toBe(20);
        expect(d.estimatedMinutes).toBe(15);
    });

    it('presets are frozen and getSessionDefaults returns a mutable copy', () => {
        expect(Object.isFrozen(SESSION_INTENSITY_PRESETS.casual)).toBe(true);
        const d = getSessionDefaults({ sessionIntensity: 'casual' });
        d.includeAiBlock = false;
        expect(SESSION_INTENSITY_PRESETS.casual.includeAiBlock).toBe(true);
    });
});

describe('buildPlan golden shapes', () => {
    const casual = () => getSessionDefaults({ sessionIntensity: 'casual' });

    it('(5 new, 10 due): Flash+Quiz new, Quiz 7 + TF 3 review, Story seed 4 due, complete', () => {
        const newItems = vocab([101, 102, 103, 104, 105]);
        const due = vocab([201, 202, 203, 204, 205, 206, 207, 208, 209, 210]);
        const steps = buildPlan(newItems, due, casual());

        expect(steps.map((s) => s.type)).toEqual([
            'present', 'drill', 'drill', 'drill', 'ai', 'complete'
        ]);
        expect(steps[0]).toMatchObject({
            type: 'present', mode: 'flash', purpose: 'new',
            wordIds: [101, 102, 103, 104, 105]
        });
        expect(steps[1]).toMatchObject({
            type: 'drill', mode: 'quiz', purpose: 'new',
            wordIds: [101, 102, 103, 104, 105]
        });
        // ceil(10 * 0.7) = 7
        expect(steps[2]).toMatchObject({
            type: 'drill', mode: 'quiz', purpose: 'review',
            wordIds: [201, 202, 203, 204, 205, 206, 207]
        });
        expect(steps[3]).toMatchObject({
            type: 'drill', mode: 'tf', purpose: 'review',
            wordIds: [208, 209, 210]
        });
        expect(steps[4]).toMatchObject({
            type: 'ai', mode: 'story',
            wordIds: [201, 202, 203, 204]
        });
        expect(steps[5]).toEqual({ type: 'complete' });
    });

    it('(0 new, 12 due): Quiz ceil(12*0.7)=9 + TF 3, Story D1–D4, complete', () => {
        const due = vocab([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        const steps = buildPlan([], due, casual());

        expect(steps.map((s) => [s.type, s.mode])).toEqual([
            ['drill', 'quiz'],
            ['drill', 'tf'],
            ['ai', 'story'],
            ['complete', undefined]
        ]);
        expect(steps[0].wordIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(steps[1].wordIds).toEqual([10, 11, 12]);
        expect(steps[2].wordIds).toEqual([1, 2, 3, 4]);
    });

    it('(5 new, 0 due): Flash+Quiz new only + Story seed from new, complete', () => {
        const newItems = vocab([11, 12, 13, 14, 15]);
        const steps = buildPlan(newItems, [], casual());

        expect(steps.map((s) => s.type)).toEqual([
            'present', 'drill', 'ai', 'complete'
        ]);
        expect(steps[0].wordIds).toEqual([11, 12, 13, 14, 15]);
        expect(steps[1].mode).toBe('quiz');
        expect(steps[1].purpose).toBe('new');
        // due first then new — due empty so seed from new, aiWordCount 4
        expect(steps[2].wordIds).toEqual([11, 12, 13, 14]);
    });

    it('(3 new, 1 due): Flash+Quiz new, Quiz due (ceil(1*0.7)=1), no TF, Story seed', () => {
        const newItems = vocab([1, 2, 3]);
        const due = vocab([9]);
        const steps = buildPlan(newItems, due, casual());

        expect(steps.map((s) => [s.type, s.mode, s.purpose || null])).toEqual([
            ['present', 'flash', 'new'],
            ['drill', 'quiz', 'new'],
            ['drill', 'quiz', 'review'],
            ['ai', 'story', null],
            ['complete', undefined, null]
        ]);
        expect(steps[2].wordIds).toEqual([9]);
        // no TF step (remainder 0)
        expect(steps.filter((s) => s.mode === 'tf')).toHaveLength(0);
        // seed: due first then new → [9,1,2,3]
        expect(steps[3].wordIds).toEqual([9, 1, 2, 3]);
    });

    it('(0,0) empty: only complete (no AI seed)', () => {
        const steps = buildPlan([], [], casual());
        expect(steps).toEqual([{ type: 'complete' }]);
    });

    it('includeAiBlock false omits story step', () => {
        const d = casual();
        d.includeAiBlock = false;
        const steps = buildPlan(vocab([1]), vocab([2, 3]), d);
        expect(steps.some((s) => s.type === 'ai')).toBe(false);
        expect(steps[steps.length - 1].type).toBe('complete');
    });

    it('due accepts memory card-shaped {wordId} and plain ids', () => {
        const steps = buildPlan(
            [],
            [{ wordId: 5 }, { id: 6 }, 7],
            Object.assign(casual(), { includeAiBlock: false })
        );
        // ceil(3*0.7)=3 all quiz
        expect(steps[0].wordIds).toEqual([5, 6, 7]);
        expect(steps[0].mode).toBe('quiz');
        expect(steps.filter((s) => s.mode === 'tf')).toHaveLength(0);
    });

    it('is deterministic for same inputs', () => {
        const a = buildPlan(vocab([1, 2]), vocab([10, 11, 12, 13]), casual());
        const b = buildPlan(vocab([1, 2]), vocab([10, 11, 12, 13]), casual());
        expect(a).toEqual(b);
    });
});

describe('buildQuizOnlyPlan', () => {
    it('3-word Quiz-only plan for acceptance', () => {
        const steps = buildQuizOnlyPlan([1, 2, 3]);
        expect(steps).toEqual([
            { type: 'drill', mode: 'quiz', wordIds: [1, 2, 3], purpose: 'review' },
            { type: 'complete' }
        ]);
    });
});

describe('DailySessionService step completion (Quiz-only, no DOM)', () => {
    function mockMemory() {
        const cards = new Map();
        return {
            _isStub: false,
            cards,
            review(wordId, rating, mode, now) {
                const id = Number(wordId);
                const prev = cards.get(id) || { wordId: id };
                const next = Object.assign({}, prev, {
                    lastRating: rating,
                    lastMode: mode,
                    lastReview: now
                });
                if (rating === 1) {
                    next.sessionHold = true;
                    next.sessionHoldAt = now;
                    next.sessionHoldRating = 1;
                } else if (next.sessionHold) {
                    delete next.sessionHold;
                    delete next.sessionHoldAt;
                    delete next.sessionHoldRating;
                }
                cards.set(id, next);
                return next;
            },
            finalizeSessionHolds() {
                let n = 0;
                cards.forEach((c, id) => {
                    if (c.sessionHold) {
                        delete c.sessionHold;
                        delete c.sessionHoldAt;
                        delete c.sessionHoldRating;
                        cards.set(id, c);
                        n++;
                    }
                });
                return n;
            },
            flush: async () => {},
            introduce: () => {}
        };
    }

    function mockGame(wordIds) {
        const list = wordIds.map((id) => ({ id }));
        return {
            key: 'quiz',
            list,
            i: 0,
            answered: false,
            busy: false,
            hasMissed: false,
            score(pts, wordId) {
                // bare — controller wraps
            },
            miss(wordId) {},
            destroy() {},
            update() {},
            render() {}
        };
    }

    function mockData(wordIds) {
        const list = wordIds.map((id) => ({ id, ja: 'x' + id, en: 'y' + id }));
        return {
            list,
            _reviewList: null,
            startSpecificReview(words) {
                this._reviewList = words;
                return true;
            },
            endReviewSession() {
                this._reviewList = null;
            },
            getFilteredList() {
                return this.list;
            },
            getTodayKey() {
                return '2024-01-15';
            }
        };
    }

    beforeEach(() => {
        globalThis.localStorage = {
            _s: new Map(),
            getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
            setItem(k, v) { this._s.set(k, String(v)); },
            removeItem(k) { this._s.delete(k); }
        };
        // stub db/auth absent
        globalThis.auth = undefined;
        globalThis.db = undefined;
        globalThis.history = { pushState() {}, replaceState() {} };
        // Avoid goHome side effects
        globalThis.app = {
            store: { prefs: {} },
            data: mockData([1, 2, 3]),
            memory: mockMemory(),
            ui: { showToast() {} },
            goHome() {},
            game: null
        };
        globalThis.window.MEMORY_ENGINE_ENABLED = true;
    });

    it('onGraded resolves all 3 words then finishStep → complete; no sessionHold left', async () => {
        const svc = new DailySessionService();
        // Build plan without launching real Quiz constructors
        const composed = svc.compose({ wordIds: [1, 2, 3], quizOnly: true });
        expect(composed.steps[0].mode).toBe('quiz');
        expect(composed.steps[0].wordIds).toEqual([1, 2, 3]);

        svc.plan = {
            steps: composed.steps,
            intensity: 'casual',
            defaults: composed.defaults,
            newIds: [],
            dueIds: [1, 2, 3],
            createdAt: Date.now()
        };
        svc.defaults = composed.defaults;
        svc.status = 'active';
        svc.cursor = 0;
        svc.dateKey = '2024-01-15';

        const game = mockGame([1, 2, 3]);
        app.game = game;
        app.data.startSpecificReview(game.list);
        expect(app.data._reviewList.length).toBe(3);

        svc.attachController(game, {
            wordIds: [1, 2, 3],
            purpose: 'review',
            mode: 'quiz',
            type: 'drill'
        });
        expect(svc._ownsMemoryReviews).toBe(true);
        expect(svc.isActive).toBe(true);

        // Grade all three correct
        game.score(10, 1);
        game.score(10, 2);
        game.score(10, 3);

        // Should have completed
        expect(svc.status).toBe('completed');
        expect(svc._ownsMemoryReviews).toBe(false);
        expect(app.data._reviewList).toBeNull();

        // No sessionHold left
        let held = 0;
        app.memory.cards.forEach((c) => { if (c.sessionHold) held++; });
        expect(held).toBe(0);

        const prog = svc.getProgress();
        expect(prog.status).toBe('completed');
        expect(prog.stats.correct).toBe(3);
    });

    it('Again reinserts once then completes', async () => {
        const svc = new DailySessionService();
        const composed = svc.compose({ wordIds: [10, 20], quizOnly: true });
        svc.plan = {
            steps: composed.steps,
            intensity: 'casual',
            defaults: composed.defaults,
            newIds: [],
            dueIds: [10, 20],
            createdAt: Date.now()
        };
        svc.defaults = composed.defaults;
        svc.status = 'active';
        svc.cursor = 0;

        app.data = mockData([10, 20]);
        const game = mockGame([10, 20]);
        app.game = game;
        app.data.startSpecificReview(game.list);

        svc.attachController(game, {
            wordIds: [10, 20],
            purpose: 'review',
            mode: 'quiz',
            type: 'drill'
        });

        // Miss word 10 → reinsert queued; correct 20
        game.miss(10);
        expect(svc._step.reinsertQueue).toContain(10);
        expect(app.memory.cards.get(10).sessionHold).toBe(true);

        game.score(10, 20);

        // Originals resolved → reinsert pass applied (pending has 10)
        expect(svc.status).toBe('active');
        expect(svc._step.pendingWordIds.has(10)).toBe(true);
        expect(svc._step.reinsertQueue.length).toBe(0);
        // list should now be reinsert-only
        expect(game.list.map((w) => w.id)).toEqual([10]);

        // Grade reinsert Good — must not re-queue (max once)
        game.score(10, 10);
        expect(svc.status).toBe('completed');
        expect(svc.stats.againCount).toBe(1);

        let held = 0;
        app.memory.cards.forEach((c) => { if (c.sessionHold) held++; });
        expect(held).toBe(0);
    });

    it('pause does not finalize holds; complete does', async () => {
        const svc = new DailySessionService();
        const composed = svc.compose({ wordIds: [1], quizOnly: true });
        svc.plan = {
            steps: composed.steps,
            intensity: 'casual',
            defaults: composed.defaults,
            createdAt: Date.now()
        };
        svc.defaults = composed.defaults;
        svc.status = 'active';
        svc.cursor = 0;

        const game = mockGame([1]);
        app.game = game;
        app.data.startSpecificReview(game.list);
        svc.attachController(game, {
            wordIds: [1], purpose: 'review', mode: 'quiz', type: 'drill'
        });

        game.miss(1);
        expect(app.memory.cards.get(1).sessionHold).toBe(true);

        await svc.pause();
        expect(svc.status).toBe('paused');
        expect(app.memory.cards.get(1).sessionHold).toBe(true); // not finalized

        // Simulate re-attach and complete via abandon path finalize
        await svc.abandon();
        expect(svc.status).toBe('abandoned');
        expect(app.memory.cards.get(1).sessionHold).toBeFalsy();
    });

    it('getProgress reports step indices', () => {
        const svc = new DailySessionService();
        svc.plan = {
            steps: buildQuizOnlyPlan([1, 2, 3]),
            intensity: 'casual',
            defaults: getSessionDefaults({})
        };
        svc.status = 'active';
        svc.cursor = 0;
        svc._step = {
            wordIds: [1, 2, 3],
            resolvedWordIds: new Set([1]),
            pendingWordIds: new Set([2, 3]),
            reinsertQueue: [],
            reinsertCount: new Map(),
            mode: 'quiz',
            type: 'drill'
        };
        const p = svc.getProgress();
        expect(p.stepIndex).toBe(0);
        expect(p.stepsTotal).toBe(1);
        expect(p.resolvedInStep).toBe(1);
        expect(p.pendingInStep).toBe(2);
    });
});
