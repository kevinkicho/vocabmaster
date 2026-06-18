# Sensitivity Analysis: Scoring & Rewards

**Date:** 2026-06-12  
**Script:** `tests/score_sensitivity.js`  
**Simulation:** 10,000 Monte Carlo sessions per config, 70% accuracy, 5s per question

---

## Current Scoring

| Mode | Points | Per Session | Per Question | Notes |
|---|---|---|---|---|
| Flashcards | 10 | 140 | 7.0 | 20 questions/session |
| Quiz | 10 | 140 | 7.0 | 20 questions/session |
| True/False | 10 | 140 | 7.0 | 20 questions/session |
| Match | 10 | **60** | **5.0** | 12 cards (6 pairs) — deterministic |
| Voice | 10 | 140 | 7.0 | 20 questions/session |
| Sentences | 10 | 140 | 7.0 | 20 questions/session |
| Story | **15** | 105 | **10.5** | 10 questions/session |

---

## Finding 1: Match mode is an outlier

Match scores only **60 pts/session** vs 140 for other modes because:
- It has fewer total items (6 pairs = 12 cards vs 20 questions)
- Wrong taps don't cost points — you keep tapping until correct
- Score is deterministic: `pairs × pts` every time (stddev = 0)

**If Match should be comparable to other modes**, increase per-match points to ~25 or increase pair count.

---

## Finding 2: Story mode pays more per question

At 15pts × 10 questions = 105 pts/session, Story gives **10.5 pts/question** vs 7.0 for other modes. This is intentional (comprehension is harder) and reasonable.

---

## Finding 3: Scoring is linear — no magic numbers

| Points | Avg Score (20 Qs) | Qs to 100pts | Qs to 500pts |
|---|---|---|---|
| 5 | 70 | 29 | 143 |
| **10** | **140** | **15** | **72** |
| 15 | 211 | 10 | 48 |
| 20 | 280 | 8 | 36 |
| 25 | 351 | 6 | 29 |
| 30 | 419 | 5 | 24 |

Doubling pts doubles score. Halving pts halves score. There are no non-linear effects or reward thresholds — the system is pure arithmetic.

---

## Finding 4: Leaderboard is highly inflation-sensitive

| Avg Player Score | Rank 1 | Rank 10 | Rank 50 | Rank 100 |
|---|---|---|---|---|
| 500 | 932 | 731 | 504 | 135 |
| 1,000 | 1,541 | 1,307 | 1,001 | 41 |
| 5,000 | 9,251 | 7,194 | 5,106 | 609 |
| 10,000 | 17,238 | 13,310 | 9,883 | 1,785 |

At high average scores, the spread widens dramatically. Rank 100 at 10,000 avg still has 1,785 points — 5x the bottom. **If points are doubled, the leaderboard resets are needed more frequently** or the leaderboard becomes meaningless (new players can never catch up).

---

## Finding 5: Mode-specific scoring can balance session totals

Different scoring schemes produce similar total session points but redistribute where they come from:

| Scheme | Flash | Quiz | TF | Match | Voice | Sents | Story | **Total** |
|---|---|---|---|---|---|---|---|---|
| Uniform 10 | 140 | 139 | 140 | 60 | 140 | 140 | 105 | **864** |
| **Mode-specific** | **71** | **140** | **113** | **90** | **168** | **140** | **140** | **862** |
| Doubled | 139 | 283 | 281 | 120 | 281 | 281 | 208 | **1,593** |
| Flat 15 | 210 | 209 | 210 | 90 | 210 | 211 | 140 | **1,280** |

The **mode-specific** scheme (Flash=5, TF=8, Match=15, Voice=12, Story=20, Quiz/Sentences=10) produces nearly identical session total (862 vs 864) while better reflecting the difficulty of each mode.

---

## Recommendation: Keep current values, or adopt mode-specific differentiation

**Option A (no change):** Current 10pts (15 for Story) is simple and works. Players understand it intuitively.

**Option B (mode-specific):** Differentiate points by mode difficulty:

| Mode | Current | Proposed | Rationale |
|---|---|---|---|
| Flashcards | 10 | **5** | Recognition — easiest |
| Quiz | 10 | 10 | Unchanged |
| True/False | 10 | **8** | Guessing possible |
| Match | 10 | **15** | Requires two-step matching |
| Voice | 10 | **12** | Production skill |
| Sentences | 10 | 10 | Unchanged |
| Story | 15 | **20** | Comprehension — hardest |

This keeps session totals comparable (~860 vs 864) while better rewarding harder modes.

**If implementing option B**, add per-mode score prefs to `PREFERENCE_SCHEMA` and update each game's `score()` call to read from prefs rather than using hardcoded values. The `_debugDelayMs` pattern is a good model.
