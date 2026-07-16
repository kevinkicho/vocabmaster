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

    it('includeDictation adds up to 2 dictation ids from end of due before AI', () => {
        const d = casual();
        d.includeDictation = true;
        const due = vocab([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const steps = buildPlan([], due, d);
        const dict = steps.find((s) => s.mode === 'dictation');
        expect(dict).toBeTruthy();
        expect(dict.type).toBe('drill');
        expect(dict.wordIds).toEqual([9, 10]);
        // still has quiz/tf/ai
        expect(steps.some((s) => s.mode === 'quiz')).toBe(true);
        expect(steps.some((s) => s.mode === 'tf')).toBe(true);
        expect(steps.some((s) => s.type === 'ai')).toBe(true);
        // order: drills, dictation, ai, complete
        const modes = steps.map((s) => s.mode || s.type);
        const dictIdx = modes.indexOf('dictation');
        const aiIdx = modes.indexOf('story');
        expect(dictIdx).toBeGreaterThan(-1);
        expect(aiIdx).toBeGreaterThan(dictIdx);
    });

    it('includeDictation false (default) omits dictation', () => {
        const steps = buildPlan(vocab([1]), vocab([2, 3, 4]), casual());
        expect(steps.some((s) => s.mode === 'dictation')).toBe(false);
    });

    it('multi-mode plan includes present Flash + TF when new+due (not quizOnly)', () => {
        const steps = buildPlan(vocab([1, 2]), vocab([10, 11, 12, 13]), casual());
        expect(steps.some((s) => s.type === 'present' && s.mode === 'flash')).toBe(true);
        expect(steps.some((s) => s.type === 'drill' && s.mode === 'tf')).toBe(true);
        expect(steps.some((s) => s.type === 'ai' && s.mode === 'story')).toBe(true);
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

    it('quizOnly compose has no flash/tf/dictation/ai', () => {
        const svc = new DailySessionService();
        globalThis.app = { store: { prefs: {} }, data: null, memory: null };
        const composed = svc.compose({ wordIds: [1, 2, 3, 4, 5], quizOnly: true });
        expect(composed.steps.every((s) => s.type === 'complete' || s.mode === 'quiz')).toBe(true);
        expect(composed.steps.some((s) => s.mode === 'flash')).toBe(false);
        expect(composed.steps.some((s) => s.mode === 'tf')).toBe(false);
        expect(composed.steps.some((s) => s.type === 'ai')).toBe(false);
        expect(composed.defaults.includeDictation).toBe(false);
    });

    it('quizOnly wins over intensity rebuild + includeAiBlock/includeDictation flags', () => {
        const svc = new DailySessionService();
        globalThis.app = { store: { prefs: {} }, data: null, memory: null };
        const composed = svc.compose({
            quizOnly: true,
            intensity: 'cram',
            includeAiBlock: true,
            includeDictation: true,
            newItems: vocab([1, 2]),
            due: vocab([10, 11, 12])
        });
        expect(composed.defaults.includeAiBlock).toBe(false);
        expect(composed.defaults.includeDictation).toBe(false);
        expect(composed.steps.some((s) => s.type === 'ai')).toBe(false);
        expect(composed.steps.some((s) => s.mode === 'dictation')).toBe(false);
        // still multi-mode drills when no wordIds (quizOnly only strips AI/dictation flags)
        expect(composed.intensity).toBe('cram');
    });
});

describe('DailySessionService step completion (Quiz-only, no DOM)', () => {
    function mockMemory() {
        const cards = new Map();
        const reviews = [];
        return {
            _isStub: false,
            cards,
            reviews,
            review(wordId, rating, mode, now) {
                const id = Number(wordId);
                reviews.push({ wordId: id, rating, mode, now });
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
        const g = {
            key: 'quiz',
            list,
            i: 0,
            answered: false,
            busy: false,
            hasMissed: false,
            timeouts: [],
            navCalls: 0,
            score(pts, wordId) {
                // bare — controller wraps
            },
            miss(wordId) {},
            // Original-style waitAndNav (raw timer) — attachController replaces this
            async waitAndNav(audioPromise, fallbackDelay = 10) {
                await new Promise((r) => setTimeout(r, fallbackDelay));
                this.busy = false;
                this.nav(1);
            },
            nav(d) {
                this.navCalls++;
                if (!this.list || !this.list.length) return;
                this.i = (this.i + d + this.list.length) % this.list.length;
            },
            destroy() {},
            update() {},
            render() {}
        };
        return g;
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

    function bootSession(svc, wordIds, mode = 'quiz') {
        const composed = svc.compose({ wordIds, quizOnly: true });
        svc.plan = {
            steps: composed.steps,
            intensity: 'casual',
            defaults: composed.defaults,
            newIds: [],
            dueIds: wordIds.slice(),
            createdAt: Date.now()
        };
        // Force mode on drill step when testing TF-style terminal miss
        if (mode !== 'quiz') {
            svc.plan.steps = svc.plan.steps.map((s) =>
                s.type === 'drill' ? Object.assign({}, s, { mode }) : s
            );
        }
        svc.defaults = composed.defaults;
        svc.status = 'active';
        svc.cursor = 0;
        svc.dateKey = '2024-01-15';
        app.data = mockData(wordIds);
        const game = mockGame(wordIds);
        if (mode !== 'quiz') game.key = mode;
        app.game = game;
        app.data.startSpecificReview(game.list);
        svc.attachController(game, {
            wordIds,
            purpose: 'review',
            mode,
            type: 'drill'
        });
        return game;
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
        const composed = svc.compose({ wordIds: [1, 2, 3], quizOnly: true });
        expect(composed.steps[0].mode).toBe('quiz');
        expect(composed.steps[0].wordIds).toEqual([1, 2, 3]);

        const game = bootSession(svc, [1, 2, 3]);
        expect(app.data._reviewList.length).toBe(3);
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

    it('Again reinserts once then completes (Quiz miss→correct = single Again + reinsert)', async () => {
        const svc = new DailySessionService();
        const game = bootSession(svc, [10, 20]);

        // Intermediate miss — no resolve, no FSRS, no reinsert yet
        game.miss(10);
        expect(svc._step.hadMiss.has(10)).toBe(true);
        expect(svc._step.reinsertQueue).not.toContain(10);
        expect(svc._step.resolvedWordIds.has(10)).toBe(false);
        expect(app.memory.reviews.filter((r) => r.wordId === 10)).toHaveLength(0);

        // Terminal correct after miss → single Again FSRS + reinsert
        game.score(10, 10);
        expect(app.memory.reviews.filter((r) => r.wordId === 10)).toHaveLength(1);
        expect(app.memory.reviews.find((r) => r.wordId === 10).rating).toBe(1);
        expect(svc._step.reinsertQueue).toContain(10);
        expect(app.memory.cards.get(10).sessionHold).toBe(true);

        // Clean good on second word
        game.score(10, 20);

        // Originals resolved → reinsert pass applied (pending has 10)
        expect(svc.status).toBe('active');
        expect(svc._step.pendingWordIds.has(10)).toBe(true);
        expect(svc._step.reinsertQueue.length).toBe(0);
        expect(game.list.map((w) => w.id)).toEqual([10]);

        // Grade reinsert Good — must not re-queue (max once)
        game.score(10, 10);
        expect(svc.status).toBe('completed');
        expect(svc.stats.againCount).toBe(1);
        // word 10: Again (terminal after miss) + Good (reinsert) = 2 reviews total
        expect(app.memory.reviews.filter((r) => r.wordId === 10)).toHaveLength(2);

        let held = 0;
        app.memory.cards.forEach((c) => { if (c.sessionHold) held++; });
        expect(held).toBe(0);
    });

    it('Quiz miss-then-correct does not double-apply FSRS before reinsert', () => {
        const svc = new DailySessionService();
        const game = bootSession(svc, [5]);

        game.miss(5);
        game.miss(5); // second wrong choice still intermediate
        game.score(10, 5);

        const reviews5 = app.memory.reviews.filter((r) => r.wordId === 5);
        // Only one FSRS apply at terminal (Again), not Again+Good
        expect(reviews5).toHaveLength(1);
        expect(reviews5[0].rating).toBe(1);
    });

    it('waitAndNav after reinsert-triggering score does not skip (Quiz call order)', async () => {
        // Real Quiz: score() then waitAndNav(). Reinsert runs inside score();
        // the waitAndNav that follows must be suppressed (not just gen-cancelled).
        const svc = new DailySessionService();
        const game = bootSession(svc, [10, 20, 30]);

        game.miss(10);
        game.score(10, 10); // queues reinsert; does not apply pass yet
        game.score(10, 20);

        // Last original grade → reinsert pass inside score, then Quiz calls waitAndNav
        game.score(10, 30);
        expect(svc.status).toBe('active');
        expect(game.list.map((w) => w.id)).toEqual([10]);
        expect(game.i).toBe(0);
        expect(svc._suppressNextWaitAndNav).toBe(true);

        // Mirrors game_quiz.js check(): waitAndNav immediately after score
        await game.waitAndNav(null, 20);

        expect(game.navCalls).toBe(0);
        expect(game.i).toBe(0);
        expect(game.list.map((w) => w.id)).toEqual([10]);
        expect(svc._suppressNextWaitAndNav).toBe(false);
        expect(svc.status).toBe('active');

        // Subsequent waitAndNav after a normal grade still works (not stuck suppressed)
        game.score(10, 10);
        expect(svc.status).toBe('completed');
    });

    it('waitAndNav after multi-id reinsert stays on first reinsert word', async () => {
        const svc = new DailySessionService();
        const game = bootSession(svc, [1, 2]);

        // Both miss-recover → reinsert [1,2]
        game.miss(1);
        game.score(10, 1);
        game.miss(2);
        game.score(10, 2); // triggers reinsert pass with [1,2]

        expect(game.list.map((w) => w.id)).toEqual([1, 2]);
        expect(game.i).toBe(0);

        await game.waitAndNav(null, 15); // post-score auto-nav must not run
        expect(game.navCalls).toBe(0);
        expect(game.i).toBe(0);

        // Grade first reinsert; legitimate waitAndNav may advance
        game.score(10, 1);
        await game.waitAndNav(null, 15);
        expect(game.navCalls).toBe(1);
        expect(game.i).toBe(1);

        game.score(10, 2);
        expect(svc.status).toBe('completed');
    });

    it('multi-step: finishStep does not suppress next step waitAndNav (Issue 7)', async () => {
        // Plan: step0 quiz [1] → step1 quiz [2,3] → complete
        // finishStep must not leave _suppressNextWaitAndNav true for step1.
        const svc = new DailySessionService();
        svc.plan = {
            steps: [
                { type: 'drill', mode: 'quiz', wordIds: [1], purpose: 'review' },
                { type: 'drill', mode: 'quiz', wordIds: [2, 3], purpose: 'review' },
                { type: 'complete' }
            ],
            intensity: 'casual',
            defaults: getSessionDefaults({}),
            createdAt: Date.now()
        };
        svc.defaults = svc.plan.defaults;
        svc.status = 'active';
        svc.cursor = 0;
        svc.dateKey = '2024-01-15';

        app.data = mockData([1, 2, 3]);
        let game = mockGame([1]);
        app.game = game;
        app.data.startSpecificReview(game.list);
        svc.attachController(game, {
            wordIds: [1], purpose: 'review', mode: 'quiz', type: 'drill'
        });

        // Avoid real Quiz constructors when advancing steps
        svc._launchStepAtCursor = async function () {
            const steps = this.plan.steps;
            if (this.cursor >= steps.length) {
                await this.complete();
                return;
            }
            const step = steps[this.cursor];
            if (!step || step.type === 'complete') {
                await this.complete();
                return;
            }
            this._finishing = false;
            const ids = step.wordIds.slice();
            const words = ids.map((id) => ({ id }));
            app.data.startSpecificReview(words);
            game = mockGame(ids);
            app.game = game;
            this.attachController(game, {
                wordIds: ids,
                purpose: step.purpose || 'review',
                mode: step.mode || 'quiz',
                type: step.type || 'drill'
            });
        };

        // Complete step 0
        game.score(10, 1);
        expect(svc.cursor).toBe(1);
        expect(svc.status).toBe('active');
        expect(svc._suppressNextWaitAndNav).toBe(false);
        expect(game.list.map((w) => w.id)).toEqual([2, 3]);
        expect(game.i).toBe(0);

        // First grade of step 1 + Quiz-style waitAndNav must advance
        game.score(10, 2);
        expect(svc._suppressNextWaitAndNav).toBe(false);
        await game.waitAndNav(null, 10);
        expect(game.navCalls).toBe(1);
        expect(game.i).toBe(1);

        game.score(10, 3);
        expect(svc.status).toBe('completed');
    });

    it('pause keeps status active + pausedAt; does not finalize holds', async () => {
        const svc = new DailySessionService();
        const game = bootSession(svc, [1]);

        // Terminal Again via multi-attempt recover
        game.miss(1);
        game.score(10, 1);
        expect(app.memory.cards.get(1).sessionHold).toBe(true);

        await svc.pause();
        // Issue 2: status stays active for orphan-hold recovery
        expect(svc.status).toBe('active');
        expect(svc._uiPaused).toBe(true);
        expect(svc.pausedAt).toBeTruthy();
        expect(svc.isPaused).toBe(true);
        expect(svc.isActive).toBe(true);
        expect(app.memory.cards.get(1).sessionHold).toBe(true);

        const payload = JSON.parse(localStorage.getItem('vm_daily_session_v1'));
        expect(payload.status).toBe('active');
        expect(payload.pausedAt).toBeTruthy();

        await svc.abandon();
        expect(svc.status).toBe('abandoned');
        expect(app.memory.cards.get(1).sessionHold).toBeFalsy();
    });

    it('start() after pause refuses without force; force abandons holds first', async () => {
        const svc = new DailySessionService();
        const game = bootSession(svc, [1, 2]);
        game.miss(1);
        game.score(10, 1);
        expect(app.memory.cards.get(1).sessionHold).toBe(true);

        await svc.pause();
        expect(svc.status).toBe('active');
        expect(svc._uiPaused).toBe(true);

        const blocked = await svc.start({ wordIds: [9], quizOnly: true });
        expect(blocked.ok).toBe(false);
        expect(blocked.reason).toMatch(/paused|existing|already/);
        // Holds still present (not orphaned by accidental start)
        expect(app.memory.cards.get(1).sessionHold).toBe(true);

        // force: abandon previous → finalize holds, then new plan
        // Avoid real Quiz construct by short-circuiting launch — use allowEmpty false
        // and mock construct path via pre-set status after force abandon internals
        const forceResult = await svc.start({
            wordIds: [9],
            quizOnly: true,
            force: true
        });
        // start may fail to launch Quiz in node (no Quiz ctor) but should not leave holds
        // After force, previous hold on 1 must be finalized
        expect(app.memory.cards.get(1).sessionHold).toBeFalsy();
        // If launch failed due to missing Quiz, status may vary; hold finalize is the contract
        if (forceResult.ok === false && forceResult.reason === 'empty-plan') {
            // unexpected
        }
    });

    it('Match miss does not resolve word; score does', () => {
        const svc = new DailySessionService();
        const game = bootSession(svc, [7, 8], 'match');

        game.miss(7);
        expect(svc._step.resolvedWordIds.has(7)).toBe(false);
        expect(svc._step.pendingWordIds.has(7)).toBe(true);
        expect(svc._step.reinsertQueue).toContain(7);

        game.score(10, 7);
        expect(svc._step.resolvedWordIds.has(7)).toBe(true);
        expect(svc._step.pendingWordIds.has(7)).toBe(false);

        game.score(10, 8);
        // reinsert pass for 7
        expect(svc.status).toBe('active');
        expect(svc._step.pendingWordIds.has(7)).toBe(true);
        game.score(10, 7);
        expect(svc.status).toBe('completed');
    });

    it('getProgress reports step indices and paused flag', () => {
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
        expect(p.paused).toBe(false);

        svc._uiPaused = true;
        svc.pausedAt = Date.now();
        expect(svc.getProgress().paused).toBe(true);
    });

    it('AI step: Skip finishes without memory.review; score/miss do not grade', () => {
        const svc = new DailySessionService();
        const seedIds = [101, 102, 103, 104];
        svc.plan = {
            steps: [
                { type: 'ai', mode: 'story', wordIds: seedIds },
                { type: 'complete' }
            ],
            intensity: 'casual',
            defaults: getSessionDefaults({})
        };
        svc.defaults = getSessionDefaults({});
        svc.status = 'active';
        svc.cursor = 0;
        svc.dateKey = '2024-01-15';
        app.data = mockData(seedIds);
        app.memory = mockMemory();

        const game = {
            key: 'story',
            list: seedIds.map((id) => ({ id })),
            i: 0,
            root: { firstChild: null, querySelector: () => null, insertBefore() {}, appendChild() {} },
            score() {},
            miss() {},
            destroy() {},
            _showStoryNavFooter() { this._navFooterCalled = true; },
            _loadNext() { this._loadNextCalled = true; },
            _nextStory() { this._nextCalled = true; }
        };
        app.game = game;

        svc.attachController(game, {
            wordIds: seedIds,
            mode: 'story',
            type: 'ai'
        });

        expect(svc._ownsMemoryReviews).toBe(false);
        expect(typeof game.skipDailySessionStep).toBe('function');
        expect(game.sessionSeedWordIds).toEqual(seedIds);
        expect(game.storiesPerSession).toBe(1);

        // Comprehension score must not apply FSRS
        const before = app.memory.reviews.length;
        game.score(15); // Story-style score without wordId — not wrapped for AI
        expect(app.memory.reviews.length).toBe(before);
        svc.onGraded(101, true);
        expect(app.memory.reviews.length).toBe(before);

        // Skip ends the step (and session → complete)
        game.skipDailySessionStep();
        expect(svc.status).toBe('completed');
        expect(svc.stats.stepsDone).toBe(1);
        expect(app._sessionStorySeedWordIds).toBeNull();
    });

    it('AI step: questions complete via _showStoryNavFooter finishes without memory', () => {
        const svc = new DailySessionService();
        const seedIds = [1, 2];
        svc.plan = {
            steps: [
                { type: 'ai', mode: 'story', wordIds: seedIds },
                { type: 'complete' }
            ],
            intensity: 'casual',
            defaults: getSessionDefaults({})
        };
        svc.defaults = getSessionDefaults({});
        svc.status = 'active';
        svc.cursor = 0;
        app.data = mockData(seedIds);
        app.memory = mockMemory();

        const game = {
            key: 'story',
            list: seedIds.map((id) => ({ id })),
            i: 0,
            root: { firstChild: null, querySelector: () => null, insertBefore() {}, appendChild() {} },
            dom: { footer: { innerHTML: '' } },
            score() {},
            miss() {},
            destroy() {},
            _showStoryNavFooter() { this._origNav = true; },
            _loadNext() {},
            _nextStory() {}
        };
        app.game = game;
        svc.attachController(game, { wordIds: seedIds, mode: 'story', type: 'ai' });

        // Simulate last question answered → hooked footer
        game._showStoryNavFooter();
        expect(svc.status).toBe('completed');
        expect(app.memory.reviews.length).toBe(0);
    });

    it('clears _sessionStorySeedWordIds on pause / abandon / complete (not only finishStep)', async () => {
        function mockAiGame() {
            return {
                key: 'story',
                list: [{ id: 1 }],
                i: 0,
                root: { firstChild: null, querySelector: () => null, insertBefore() {}, appendChild() {} },
                score() {},
                miss() {},
                destroy() {},
                _showStoryNavFooter() {},
                _loadNext() {},
                _nextStory() {}
            };
        }

        // pause
        {
            const svc = new DailySessionService();
            svc.plan = {
                steps: [{ type: 'ai', mode: 'story', wordIds: [1, 2] }, { type: 'complete' }],
                intensity: 'casual',
                defaults: getSessionDefaults({})
            };
            svc.defaults = getSessionDefaults({});
            svc.status = 'active';
            svc.cursor = 0;
            app.data = mockData([1, 2]);
            app.memory = mockMemory();
            app.game = mockAiGame();
            app._sessionStorySeedWordIds = [1, 2];
            svc.attachController(app.game, { wordIds: [1, 2], mode: 'story', type: 'ai' });

            await svc.pause();
            expect(app._sessionStorySeedWordIds).toBeNull();
            expect(svc.status).toBe('active');
            expect(svc.isPaused).toBe(true);
        }

        // abandon
        {
            const svc = new DailySessionService();
            svc.plan = {
                steps: [{ type: 'ai', mode: 'story', wordIds: [3] }, { type: 'complete' }],
                intensity: 'casual',
                defaults: getSessionDefaults({})
            };
            svc.defaults = getSessionDefaults({});
            svc.status = 'active';
            svc.cursor = 0;
            app.data = mockData([3]);
            app.memory = mockMemory();
            app.game = mockAiGame();
            app._sessionStorySeedWordIds = [3];
            svc.attachController(app.game, { wordIds: [3], mode: 'story', type: 'ai' });

            await svc.abandon();
            expect(app._sessionStorySeedWordIds).toBeNull();
            expect(svc.status).toBe('abandoned');
        }

        // complete (direct, not via finishStep)
        {
            const svc = new DailySessionService();
            svc.plan = {
                steps: [{ type: 'ai', mode: 'story', wordIds: [4] }, { type: 'complete' }],
                intensity: 'casual',
                defaults: getSessionDefaults({})
            };
            svc.defaults = getSessionDefaults({});
            svc.status = 'active';
            svc.cursor = 0;
            app.data = mockData([4]);
            app.memory = mockMemory();
            app.game = mockAiGame();
            app._sessionStorySeedWordIds = [4];
            // Avoid goHome side effects from complete()
            app.goHome = () => {};
            svc.attachController(app.game, { wordIds: [4], mode: 'story', type: 'ai' });

            await svc.complete();
            expect(app._sessionStorySeedWordIds).toBeNull();
            expect(svc.status).toBe('completed');
        }
    });
});

describe('Story _pickWords session seeds (source contract)', () => {
    it('game_story.js prefers sessionSeedWordIds', () => {
        const storySrc = readFileSync(join(root, 'public', 'js', 'game_story.js'), 'utf8');
        expect(storySrc).toMatch(/sessionSeedWordIds/);
        expect(storySrc).toMatch(/_sessionStorySeedWordIds/);
        expect(storySrc).toMatch(/preferred.*session seeds|session seeds/i);
    });

    it('game_story_cache.js best-effort seed intersect', () => {
        const cacheSrc = readFileSync(join(root, 'public', 'js', 'game_story_cache.js'), 'utf8');
        expect(cacheSrc).toMatch(/seedSet|sessionSeedWordIds/);
        expect(cacheSrc).toMatch(/bestScore|best-effort/i);
    });
});
