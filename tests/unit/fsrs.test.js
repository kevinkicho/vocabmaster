import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'fsrs.js'), 'utf8');

let MEMORY_CONFIG, FSRS_RATING, FSRS_REFERENCE, FSRS_W, FSRS;
let createEmptyCard, schedule, ratingFromBinary, normalizeRating;
let forgettingCurve, nextIntervalDays;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2024, 0, 1, 12, 0, 0); // fixed epoch for golden vectors

beforeAll(() => {
    const fn = new Function(
        'window',
        src +
            '\nreturn { MEMORY_CONFIG, FSRS_RATING, FSRS_REFERENCE, FSRS_W, FSRS, createEmptyCard, schedule, ratingFromBinary, normalizeRating, forgettingCurve, nextIntervalDays };'
    );
    const result = fn({});
    MEMORY_CONFIG = result.MEMORY_CONFIG;
    FSRS_RATING = result.FSRS_RATING;
    FSRS_REFERENCE = result.FSRS_REFERENCE;
    FSRS_W = result.FSRS_W;
    FSRS = result.FSRS;
    createEmptyCard = result.createEmptyCard;
    schedule = result.schedule;
    ratingFromBinary = result.ratingFromBinary;
    normalizeRating = result.normalizeRating;
    forgettingCurve = result.forgettingCurve;
    nextIntervalDays = result.nextIntervalDays;
});

describe('FSRS reference pin', () => {
    it('pins ts-fsrs v3.5.7 / FSRS-4.5', () => {
        expect(FSRS_REFERENCE.name).toBe('ts-fsrs');
        expect(FSRS_REFERENCE.version).toBe('3.5.7');
        expect(FSRS_REFERENCE.family).toBe('FSRS-4.5');
        expect(FSRS_REFERENCE.url).toContain('ts-fsrs');
    });

    it('exposes 17 FSRS-4.5 default weights', () => {
        expect(FSRS_W).toHaveLength(17);
        expect(FSRS_W[0]).toBeCloseTo(0.5701, 4);
        expect(FSRS_W[4]).toBeCloseTo(5.1443, 4);
    });

    it('exports window.FSRS shape', () => {
        expect(FSRS.createEmptyCard).toBe(createEmptyCard);
        expect(FSRS.schedule).toBe(schedule);
        expect(FSRS.MEMORY_CONFIG).toBe(MEMORY_CONFIG);
        expect(FSRS.RATING.Good).toBe(3);
    });
});

describe('MEMORY_CONFIG', () => {
    it('caps max interval at 180 days', () => {
        expect(MEMORY_CONFIG.maxIntervalDays).toBe(180);
    });

    it('uses 10 min outside-session Again/Hard shortcuts', () => {
        expect(MEMORY_CONFIG.againDueMsOutsideSession).toBe(10 * 60 * 1000);
        expect(MEMORY_CONFIG.hardDueMsOutsideSession).toBe(10 * 60 * 1000);
        expect(MEMORY_CONFIG.postSessionAgainDueMs).toBe(10 * 60 * 1000);
    });

    it('request retention is 0.9', () => {
        expect(MEMORY_CONFIG.requestRetention).toBe(0.9);
    });
});

describe('createEmptyCard', () => {
    it('returns new card due at now', () => {
        const c = createEmptyCard(T0);
        expect(c.state).toBe('new');
        expect(c.due).toBe(T0);
        expect(c.stability).toBe(0);
        expect(c.difficulty).toBe(0);
        expect(c.reps).toBe(0);
        expect(c.lapses).toBe(0);
        expect(c.lastReview).toBeNull();
        expect(c.elapsedDays).toBe(0);
        expect(c.scheduledDays).toBe(0);
    });
});

describe('rating helpers', () => {
    it('ratingFromBinary maps correct→Good, incorrect→Again', () => {
        expect(ratingFromBinary(true)).toBe(3);
        expect(ratingFromBinary(false)).toBe(1);
    });

    it('normalizeRating accepts numbers and names', () => {
        expect(normalizeRating(1)).toBe(1);
        expect(normalizeRating('good')).toBe(3);
        expect(normalizeRating('Easy')).toBe(4);
        expect(normalizeRating('HARD')).toBe(2);
    });

    it('normalizeRating rejects invalid values', () => {
        expect(() => normalizeRating(0)).toThrow();
        expect(() => normalizeRating('maybe')).toThrow();
    });
});

describe('forgetting curve + interval (formula checks)', () => {
    it('R(t=S) ≈ 0.9 at request retention definition', () => {
        const s = 10;
        const r = forgettingCurve(s, s);
        expect(r).toBeCloseTo(0.9, 5);
    });

    it('nextIntervalDays at R=0.9 is round(stability) clamped', () => {
        expect(nextIntervalDays(4.1386)).toBe(4);
        expect(nextIntervalDays(10.9355)).toBe(11);
        expect(nextIntervalDays(0.2)).toBe(1);
        expect(nextIntervalDays(500)).toBe(180);
    });
});

/**
 * Golden vectors — expected S/D/state/due offsets computed from
 * ts-fsrs v3.5.7 FSRS-4.5 formulas with MEMORY_CONFIG short steps
 * and maxIntervalDays=180 (no fuzz).
 *
 * Tolerances: stability/difficulty to 4 decimal places; due exact ms.
 */
describe('golden vectors', () => {
    const againMs = 10 * 60 * 1000;
    const hardMs = 10 * 60 * 1000;

    it('New → Good: learning short step, S=w2, D=w4', () => {
        const card = createEmptyCard(T0);
        const next = schedule(card, 3, T0);
        // init_stability(Good)=w[2], init_difficulty(Good)=w[4]
        expect(next.stability).toBeCloseTo(4.1386, 4);
        expect(next.difficulty).toBeCloseTo(5.1443, 4);
        expect(next.state).toBe('learning');
        expect(next.reps).toBe(1);
        expect(next.lapses).toBe(0);
        expect(next.scheduledDays).toBe(0);
        expect(next.due).toBe(T0 + hardMs);
        expect(next.lastReview).toBe(T0);
        // pure: does not mutate input
        expect(card.state).toBe('new');
        expect(card.reps).toBe(0);
    });

    it('New → Again: learning, higher D, short again due', () => {
        const next = schedule(createEmptyCard(T0), 1, T0);
        // S0(Again)=w[0]=0.5701; D0=w4-(1-3)*w5=5.1443+2*1.2006=7.5455
        expect(next.stability).toBeCloseTo(0.5701, 4);
        expect(next.difficulty).toBeCloseTo(7.5455, 4);
        expect(next.state).toBe('learning');
        expect(next.due).toBe(T0 + againMs);
        expect(next.lapses).toBe(0); // lapses only on Review→Again
    });

    it('New → Hard: learning short hard due', () => {
        const next = schedule(createEmptyCard(T0), 2, T0);
        // S0=w[1]=1.4436; D0=w4-(2-3)*w5=5.1443+1.2006=6.3449
        expect(next.stability).toBeCloseTo(1.4436, 4);
        expect(next.difficulty).toBeCloseTo(6.3449, 4);
        expect(next.state).toBe('learning');
        expect(next.due).toBe(T0 + hardMs);
    });

    it('New → Easy: graduates to review with day interval', () => {
        const next = schedule(createEmptyCard(T0), 4, T0);
        // S0=w[3]=10.9355; D0=w4-(4-3)*w5=5.1443-1.2006=3.9437
        expect(next.stability).toBeCloseTo(10.9355, 4);
        expect(next.difficulty).toBeCloseTo(3.9437, 4);
        expect(next.state).toBe('review');
        expect(next.scheduledDays).toBe(11); // round(10.9355)
        expect(next.due).toBe(T0 + 11 * MS_PER_DAY);
    });

    it('New → Again → Good: S/D unchanged through learning; Good graduates', () => {
        const t1 = T0 + againMs;
        let card = schedule(createEmptyCard(T0), 'Again', T0);
        expect(card.state).toBe('learning');
        expect(card.stability).toBeCloseTo(0.5701, 4);

        card = schedule(card, 'Good', t1);
        // learning steps do not recompute S/D
        expect(card.stability).toBeCloseTo(0.5701, 4);
        expect(card.difficulty).toBeCloseTo(7.5455, 4);
        expect(card.state).toBe('review');
        expect(card.reps).toBe(2);
        expect(card.scheduledDays).toBe(1); // max(1, round(0.5701))
        expect(card.due).toBe(t1 + 1 * MS_PER_DAY);
    });

    it('New → Good → Good: graduate with scheduledDays from S', () => {
        const t1 = T0 + hardMs;
        let card = schedule(createEmptyCard(T0), 3, T0);
        card = schedule(card, 3, t1);
        expect(card.state).toBe('review');
        expect(card.stability).toBeCloseTo(4.1386, 4);
        expect(card.difficulty).toBeCloseTo(5.1443, 4);
        expect(card.scheduledDays).toBe(4);
        expect(card.due).toBe(t1 + 4 * MS_PER_DAY);
    });

    /**
     * Review golden base: New→Good→Good then review at scheduled due (elapsedDays=4).
     * Prior state: S=4.1386, D=5.1443, state=review.
     * R(4, 4.1386) ≈ 0.90294 with FSRS-4.5 power curve.
     */
    function reviewBaseAtDue() {
        let card = schedule(createEmptyCard(T0), 3, T0);
        const tGrad = T0 + hardMs;
        card = schedule(card, 3, tGrad);
        const tReview = tGrad + 4 * MS_PER_DAY;
        return { card, tReview };
    }

    it('Review → Hard: updates S/D; stays review; interval constraints', () => {
        const { card, tReview } = reviewBaseAtDue();
        expect(card.state).toBe('review');
        expect(card.scheduledDays).toBe(4);

        const next = schedule(card, 2, tReview); // Hard

        expect(next.elapsedDays).toBe(4);
        expect(next.state).toBe('review');
        expect(next.difficulty).toBeCloseTo(5.97577026, 6);
        expect(next.stability).toBeCloseTo(6.45945799, 6);
        expect(next.scheduledDays).toBe(6);
        expect(next.lapses).toBe(0);
        expect(next.reps).toBe(3);
        expect(next.due).toBe(tReview + 6 * MS_PER_DAY);
    });

    it('Review → Good / Easy golden intervals', () => {
        const { card, tReview } = reviewBaseAtDue();
        const hard = schedule(card, 2, tReview);
        const good = schedule(card, 3, tReview);
        const easy = schedule(card, 4, tReview);

        expect(good.stability).toBeCloseTo(14.73612508, 6);
        expect(good.difficulty).toBeCloseTo(5.1443, 4);
        expect(good.scheduledDays).toBe(15);

        expect(easy.stability).toBeCloseTo(34.06283156, 6);
        expect(easy.difficulty).toBeCloseTo(4.31282974, 6);
        expect(easy.scheduledDays).toBe(34);

        expect(easy.scheduledDays).toBeGreaterThan(good.scheduledDays);
        expect(hard.scheduledDays).toBeLessThanOrEqual(good.scheduledDays);
        expect(easy.difficulty).toBeLessThan(good.difficulty);
    });

    it('Review → Again: relearning, lapses++, forget stability, short due', () => {
        const { card, tReview } = reviewBaseAtDue();
        const next = schedule(card, 1, tReview);

        expect(next.state).toBe('relearning');
        expect(next.lapses).toBe(1);
        expect(next.scheduledDays).toBe(0);
        expect(next.due).toBe(tReview + againMs);
        expect(next.stability).toBeCloseTo(1.4674103, 6);
        expect(next.difficulty).toBeCloseTo(6.80724052, 6);
        expect(next.stability).toBeLessThan(card.stability);
        expect(next.difficulty).toBeGreaterThan(card.difficulty);
    });

    it('accepts string rating names', () => {
        const a = schedule(createEmptyCard(T0), 'good', T0);
        const b = schedule(createEmptyCard(T0), 3, T0);
        expect(a.stability).toBe(b.stability);
        expect(a.state).toBe(b.state);
    });

    it('max interval never exceeds 180 days', () => {
        // Synthesize a very stable review card
        const card = {
            due: T0,
            stability: 500,
            difficulty: 3,
            elapsedDays: 0,
            scheduledDays: 180,
            reps: 20,
            lapses: 0,
            state: 'review',
            lastReview: T0 - 180 * MS_PER_DAY
        };
        const next = schedule(card, 3, T0);
        expect(next.scheduledDays).toBeLessThanOrEqual(180);
    });
});
