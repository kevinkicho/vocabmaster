/* js/fsrs.js
 *
 * Pure FSRS-4.5-compatible scheduler (client-side, no npm).
 *
 * Reference pin:
 *   open-spaced-repetition/ts-fsrs v3.5.7 (FSRS-4.5 family)
 *   https://github.com/open-spaced-repetition/ts-fsrs/tree/v3.5.7
 *   Algorithm notes: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm#fsrs-45
 *   Default weights from ts-fsrs/src/fsrs/default.ts (17 params, FSRS-4.5).
 *
 * Intentional simplifications (v1):
 *   - No personal parameter training / optimizer (fixed default w).
 *   - No same-day review fuzz (enable_fuzz always off).
 *   - Short learning/relearning intervals use MEMORY_CONFIG ms constants
 *     (again/hard outside session); Daily Session reinsert/sessionHold policy
 *     lives in memory.js / daily_session.js — not here.
 *   - Max interval capped at MEMORY_CONFIG.maxIntervalDays (180), not 36500.
 *   - Card state uses ms epoch + string states for RTDB-friendly plain objects.
 *
 * Multi-script: assigns window.FSRS. Top-level function/var names are global
 * in classic <script> tags (not const/let).
 */

/** @type {Readonly<{
 *   maxIntervalDays: number,
 *   againDueMsOutsideSession: number,
 *   hardDueMsOutsideSession: number,
 *   sessionAgainPolicy: string,
 *   reinsertMaxPerWordPerSession: number,
 *   postSessionAgainDueMs: number,
 *   requestRetention: number
 * }>} */
var MEMORY_CONFIG = {
    maxIntervalDays: 180,
    // Free-practice / outside Daily Session learning shortcuts:
    againDueMsOutsideSession: 10 * 60 * 1000, // 10 min
    hardDueMsOutsideSession: 10 * 60 * 1000,
    // Documented for consumers; pure scheduler does not apply session policy:
    sessionAgainPolicy: 'reinsert',
    reinsertMaxPerWordPerSession: 1,
    postSessionAgainDueMs: 10 * 60 * 1000,
    requestRetention: 0.9
};

/** FSRS ratings: 1 Again, 2 Hard, 3 Good, 4 Easy */
var FSRS_RATING = {
    Again: 1,
    Hard: 2,
    Good: 3,
    Easy: 4
};

/** Pinned reference metadata for admin debug / tests */
var FSRS_REFERENCE = {
    name: 'ts-fsrs',
    version: '3.5.7',
    family: 'FSRS-4.5',
    url: 'https://github.com/open-spaced-repetition/ts-fsrs/tree/v3.5.7'
};

// FSRS-4.5 default parameters (ts-fsrs v3.5.7)
var FSRS_W = [
    0.5701, 1.4436, 4.1386, 10.9355, 5.1443, 1.2006, 0.8627, 0.0362, 1.629,
    0.1342, 1.0166, 2.1174, 0.0839, 0.3204, 1.4676, 0.219, 2.8237
];

var FSRS_DECAY = -0.5;
/** FACTOR = 0.9^(1/DECAY) - 1 = 19/81 */
var FSRS_FACTOR = 19 / 81;
var MS_PER_DAY = 24 * 60 * 60 * 1000;
var MS_PER_MINUTE = 60 * 1000;

/**
 * Interval modifier so R(requestRetention) maps stability → days.
 * At requestRetention=0.9, this equals 1.
 */
function _intervalModifier(requestRetention) {
    var r = requestRetention == null ? MEMORY_CONFIG.requestRetention : requestRetention;
    return (Math.pow(r, 1 / FSRS_DECAY) - 1) / FSRS_FACTOR;
}

function _constrainDifficulty(d) {
    return Math.min(Math.max(+Number(d).toFixed(8), 1), 10);
}

function _initStability(g) {
    return Math.max(FSRS_W[g - 1], 0.1);
}

/** D0(G) = w4 - (G-3)*w5, clamped to [1,10] */
function _initDifficulty(g) {
    return _constrainDifficulty(FSRS_W[4] - (g - 3) * FSRS_W[5]);
}

function _meanReversion(init, current) {
    return +(FSRS_W[7] * init + (1 - FSRS_W[7]) * current).toFixed(8);
}

/** next_d = D - w6*(G-3); then mean-revert toward w4 */
function _nextDifficulty(d, g) {
    var nextD = d - FSRS_W[6] * (g - 3);
    return _constrainDifficulty(_meanReversion(FSRS_W[4], nextD));
}

/**
 * R(t,S) = (1 + FACTOR * t / S)^DECAY
 * Power-law forgetting curve (FSRS-4.5).
 */
function forgettingCurve(elapsedDays, stability) {
    if (!stability || stability <= 0) return 0;
    return +Math.pow(1 + (FSRS_FACTOR * elapsedDays) / stability, FSRS_DECAY).toFixed(8);
}

/** S' after successful recall (Hard/Good/Easy) */
function _nextRecallStability(d, s, r, g) {
    var hardPenalty = g === FSRS_RATING.Hard ? FSRS_W[15] : 1;
    var easyBound = g === FSRS_RATING.Easy ? FSRS_W[16] : 1;
    return +(
        s *
        (1 +
            Math.exp(FSRS_W[8]) *
                (11 - d) *
                Math.pow(s, -FSRS_W[9]) *
                (Math.exp((1 - r) * FSRS_W[10]) - 1) *
                hardPenalty *
                easyBound)
    ).toFixed(8);
}

/** S' after forget (Again) */
function _nextForgetStability(d, s, r) {
    return +(
        FSRS_W[11] *
        Math.pow(d, -FSRS_W[12]) *
        (Math.pow(s + 1, FSRS_W[13]) - 1) *
        Math.exp((1 - r) * FSRS_W[14])
    ).toFixed(8);
}

/** Days until next review from stability; min 1, max maxIntervalDays. No fuzz. */
function nextIntervalDays(stability, requestRetention) {
    var mod = _intervalModifier(requestRetention);
    var ivl = Math.round(stability * mod);
    return Math.min(Math.max(1, ivl), MEMORY_CONFIG.maxIntervalDays);
}

function _elapsedDays(card, nowMs) {
    if (card.state === 'new' || card.lastReview == null) return 0;
    return Math.max(0, Math.floor((nowMs - card.lastReview) / MS_PER_DAY));
}

function _cloneCard(card) {
    return {
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        lastReview: card.lastReview == null ? null : card.lastReview
    };
}

/**
 * Create an empty (new) FSRS card due immediately.
 * @param {number} [nowMs=Date.now()]
 * @returns {{due:number,stability:number,difficulty:number,elapsedDays:number,scheduledDays:number,reps:number,lapses:number,state:string,lastReview:null}}
 */
function createEmptyCard(nowMs) {
    var t = nowMs == null ? Date.now() : nowMs;
    return {
        due: t,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 'new',
        lastReview: null
    };
}

/**
 * Map binary correctness to FSRS rating (Good / Again).
 * @param {boolean} isCorrect
 * @returns {1|3}
 */
function ratingFromBinary(isCorrect) {
    return isCorrect ? FSRS_RATING.Good : FSRS_RATING.Again;
}

/**
 * Normalize rating input: number 1–4 or case-insensitive name.
 * @param {number|string} rating
 * @returns {1|2|3|4}
 */
function normalizeRating(rating) {
    if (typeof rating === 'number' && rating >= 1 && rating <= 4) {
        return /** @type {1|2|3|4} */ (rating | 0);
    }
    if (typeof rating === 'string') {
        var key = rating.charAt(0).toUpperCase() + rating.slice(1).toLowerCase();
        if (key in FSRS_RATING) return FSRS_RATING[key];
    }
    throw new Error('Invalid FSRS rating: ' + rating);
}

/**
 * Schedule next review for a card given a rating.
 * Pure: returns a new card object; does not mutate input.
 * Does not apply Daily Session sessionHold policy.
 *
 * @param {object} card
 * @param {number|string} rating 1=Again, 2=Hard, 3=Good, 4=Easy
 * @param {number} [nowMs=Date.now()]
 * @returns {object} next card state
 */
function schedule(card, rating, nowMs) {
    var g = normalizeRating(rating);
    var now = nowMs == null ? Date.now() : nowMs;
    var elapsed = _elapsedDays(card, now);
    var next = _cloneCard(card);
    next.reps = (card.reps || 0) + 1;
    next.lastReview = now;
    next.elapsedDays = elapsed;

    var againMs = MEMORY_CONFIG.againDueMsOutsideSession;
    var hardMs = MEMORY_CONFIG.hardDueMsOutsideSession;
    // New "Good" short step aligns with reference (~10 min learning) / hard shortcut
    var goodLearnMs = hardMs;

    if (card.state === 'new') {
        next.stability = _initStability(g);
        next.difficulty = _initDifficulty(g);
        if (g === FSRS_RATING.Easy) {
            next.state = 'review';
            next.scheduledDays = nextIntervalDays(next.stability);
            next.due = now + next.scheduledDays * MS_PER_DAY;
        } else if (g === FSRS_RATING.Again) {
            next.state = 'learning';
            next.scheduledDays = 0;
            next.due = now + againMs;
        } else if (g === FSRS_RATING.Hard) {
            next.state = 'learning';
            next.scheduledDays = 0;
            next.due = now + hardMs;
        } else {
            // Good → short learning step
            next.state = 'learning';
            next.scheduledDays = 0;
            next.due = now + goodLearnMs;
        }
        return next;
    }

    if (card.state === 'learning' || card.state === 'relearning') {
        // Learning/relearning steps do not recompute S/D (ts-fsrs v3.5.7).
        next.stability = card.stability;
        next.difficulty = card.difficulty;
        if (g === FSRS_RATING.Again) {
            next.state = card.state;
            next.scheduledDays = 0;
            next.due = now + againMs;
        } else if (g === FSRS_RATING.Hard) {
            next.state = card.state;
            next.scheduledDays = 0;
            next.due = now + hardMs;
        } else if (g === FSRS_RATING.Good) {
            next.state = 'review';
            next.scheduledDays = nextIntervalDays(next.stability);
            next.due = now + next.scheduledDays * MS_PER_DAY;
        } else {
            // Easy
            var goodIvl = nextIntervalDays(next.stability);
            var easyIvl = Math.max(nextIntervalDays(next.stability), goodIvl + 1);
            // Note: same S for good/easy in learning; easy is at least good+1 day
            next.state = 'review';
            next.scheduledDays = easyIvl;
            next.due = now + easyIvl * MS_PER_DAY;
        }
        return next;
    }

    // Review
    var lastD = card.difficulty;
    var lastS = card.stability;
    var r = forgettingCurve(elapsed, lastS);
    next.difficulty = _nextDifficulty(lastD, g);

    if (g === FSRS_RATING.Again) {
        next.stability = _nextForgetStability(lastD, lastS, r);
        next.lapses = (card.lapses || 0) + 1;
        next.state = 'relearning';
        next.scheduledDays = 0;
        next.due = now + againMs;
        return next;
    }

    next.stability = _nextRecallStability(lastD, lastS, r, g);
    next.state = 'review';

    var hardIvl = nextIntervalDays(g === FSRS_RATING.Hard
        ? next.stability
        : _nextRecallStability(lastD, lastS, r, FSRS_RATING.Hard));
    var goodIvlR = nextIntervalDays(g === FSRS_RATING.Good
        ? next.stability
        : _nextRecallStability(lastD, lastS, r, FSRS_RATING.Good));
    var easyIvlR = nextIntervalDays(g === FSRS_RATING.Easy
        ? next.stability
        : _nextRecallStability(lastD, lastS, r, FSRS_RATING.Easy));

    // ts-fsrs ordering constraints: hard <= good, easy >= good+1
    hardIvl = Math.min(hardIvl, goodIvlR);
    goodIvlR = Math.max(goodIvlR, hardIvl + 1);
    easyIvlR = Math.max(easyIvlR, goodIvlR + 1);

    if (g === FSRS_RATING.Hard) {
        next.scheduledDays = hardIvl;
    } else if (g === FSRS_RATING.Good) {
        next.scheduledDays = goodIvlR;
    } else {
        next.scheduledDays = easyIvlR;
    }
    // Ordering (good >= hard+1) can push past cap when S is huge; re-clamp.
    next.scheduledDays = Math.min(
        Math.max(1, next.scheduledDays),
        MEMORY_CONFIG.maxIntervalDays
    );
    next.due = now + next.scheduledDays * MS_PER_DAY;
    return next;
}

/** Alias used in design docs */
var initCard = createEmptyCard;

var FSRS = {
    MEMORY_CONFIG: MEMORY_CONFIG,
    RATING: FSRS_RATING,
    REFERENCE: FSRS_REFERENCE,
    W: FSRS_W,
    createEmptyCard: createEmptyCard,
    initCard: initCard,
    schedule: schedule,
    ratingFromBinary: ratingFromBinary,
    normalizeRating: normalizeRating,
    forgettingCurve: forgettingCurve,
    nextIntervalDays: nextIntervalDays
};

if (typeof window !== 'undefined') {
    window.FSRS = FSRS;
    window.MEMORY_CONFIG = MEMORY_CONFIG;
}
