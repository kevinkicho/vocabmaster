# Sensitivity Analysis Implementation Plan

## Overview
Systematically vary tunable parameters and measure their impact on app behavior, performance, and user experience. Each area follows the same pattern: **parameterize → measure → visualize → recommend**.

---

## 1. Match Grid Layout Optimization

**Goal:** Find the `calcLayout()` scoring formula that maximizes card size without overlap across all viewports.

### Parameters
| Variable | File:Line | Current Value |
|---|---|---|
| `ratioScore` weight | `game_match.js:72` | `-Math.abs(ratio - 1.4) * 80` |
| `areaScore` weight | `game_match.js:75` | `Math.min(cellW, 180) + Math.min(cellH, 120)` |
| `orientScore` bonuses | `game_match.js:79-87` | Portrait: `cols=2→+60`, `cols=3→+30`, `cols≥5→-80`; Landscape: `cols 3-5→+40`, `cols=4→+20`, `rows≤3→+15` |
| `minCellW` / `minCellH` | `game_match.js:52-53` | `56` / `40` |
| Aspect ratio target | `game_match.js:72` | `1.4` |
| Starting pair count threshold | `game_match.js:15` | `window.innerHeight > 800 → 8, else 6` |

### Approach
1. **Extract scoring into a pure function** `scoreLayout(cols, rows, cellW, cellH, viewportW, viewportH, isPortrait)` returning a score — no DOM dependency.
2. **Create benchmark harness** (`tests/match_layout_benchmark.js`) that iterates over:
   - Viewport sizes: 360×640, 375×667, 390×844, 414×896, 430×932, 768×1024, 1024×768, 1280×800, 1920×1080
   - Pair counts: 2, 4, 6, 8, 10, 12
   - Sweep `ratioScore` multiplier [-50, -200] step 10
   - Sweep `areaScore` formula variants (linear, sqrt, capped at different limits)
   - Sweep `orientScore` bonus ranges
3. **Metrics per configuration:**
   - Cell size (cellW × cellH)
   - Grid coverage ratio (total cell area / viewport area)
   - Whether cells exceed viewport bounds
   - Number of cells below readability threshold (< 40×28)
4. **Output:** Table of top-10 scoring formulas per viewport category (phone portrait, phone landscape, tablet, desktop).
5. **Validation:** Screenshot top 3 candidates at 6 viewports, compare visually.

### Deliverables
- `tests/match_layout_benchmark.js` — standalone Node.js script (no DOM needed)
- `SENSITIVITY_MATCH.md` — results with recommendations
- Updated `game_match.js` with best formula

---

## 2. Auto-Advance Delay Optimization

**Goal:** Determine optimal wait times after answering (correct vs. wrong) per game mode.

### Parameters
| Mode | Correct Delay | Wrong Delay | File:Line |
|---|---|---|---|
| Flashcards | 0 (manual nav) | 0 (manual nav) | — |
| Quiz | `pAudio`(variable) | `2500ms` | `game_quiz.js` |
| True/False | `waitAndNav(pAudio, 2500)` | `2500ms` | `game_tf.js` |
| Match | 0 (grid resets) | 0 (grid resets) | `game_match.js` |
| Voice | `waitAndNav(null, 1500)` | `waitAndNav(null, 2000)` | `game_voice.js` |
| Sentences | `waitAndNav(pAudio, 2500)` | `waitAndNav(null, 3000)` | `game_sentences.js` |

### Approach
1. **Unify all delays into preference-controlled values** in `PREFERENCE_SCHEMA`:
   - `delayCorrect: { type: 'range', default: 2000, min: 500, max: 5000, step: 250 }`
   - `delayWrong: { type: 'range', default: 2500, min: 500, max: 5000, step: 250 }`
   - (Gate behind debug flag, not shown in normal settings)
2. **Create Playwright test** (`test/e2e/sensitivity_delays.spec.js`) that:
   - Loads each game mode
   - Sets delay via pref override
   - Answers correctly/wrongly
   - Measures time between answer submission and next question appearing (via `MutationObserver` on game container)
   - Runs at delays: 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000ms
3. **Mock data:** Fixed 10-item CSV with known answers so tests are deterministic.
4. **Metrics:**
   - Actual delay vs. configured delay (accuracy)
   - Whether animation completes before next question
   - Audio overlap (if audio_wait enabled)

### Deliverables
- `test/e2e/sensitivity_delays.spec.js`
- `SENSITIVITY_DELAYS.md` — accuracy tables per mode
- Optional: integration into settings for user customization

---

## 3. LLM Temperature & Token Budget Tuning

**Goal:** Measure how temperature and num_predict affect output quality across LLM features.

### Parameters
| Feature | Temperature | num_predict | Timeout | File:Line |
|---|---|---|---|---|
| Cloze fill | `0` | `64` | `30000` | `llm.js:603-604` |
| Listening passage | `0.5` | `384` | `30000` | `llm.js:687-688` |
| Grammar explanation | `0.3` | `256` | `30000` | `llm.js:741-742` |
| Story (streaming) | `0.7` | `512` | `180000` | `generator.js:182,220` |
| Story + validator | `0.5` | `1024` | `45000` | `llm.js:947-948` |

### Approach
1. **Extract prompt configs into a `PromptConfig` record** with fields: `temperature, num_predict, timeout, systemPrompt, userPrompt`.
2. **Create test harness** (`tests/llm_sensitivity.test.js`) that:
   - Mock LLM endpoint (local or recorded responses)
   - Sweep temperature: `[0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]`
   - Sweep num_predict: `[32, 64, 128, 256, 384, 512, 1024, 2048]`
   - For each combo, run 5 generations with same input
3. **Quality metrics (automated):**
   - Response length variance (higher = less deterministic)
   - Valid JSON parse rate (for structured outputs)
   - Response time (for timeout sensitivity)
   - Contains expected keywords (domain-specific check)
4. **Quality metrics (human review sample):**
   - For top-5 candidate configs, have 3 raters score 1-5 for relevance and coherence
   - Inter-rater reliability score
5. **Precision vs. creativity curve:** Plot temperature vs. output variance — find the knee where variance increases without quality gain.

### Deliverables
- `tests/llm_sensitivity.test.js`
- `SENSITIVITY_LLM.md` — recommended configs per feature
- Updated `llm.js` with evidence-based defaults

---

## 4. Scoring & Reward Sensitivity

**Goal:** Determine if uniform 10pt scoring is optimal or if mode-specific rewards affect engagement.

### Parameters
| Mode | Points per correct | File:Line |
|---|---|---|
| Flashcard | `10` | `game_core.js:169` |
| Quiz | `10` | `game_quiz.js` |
| True/False | `10` | `game_tf.js` |
| Match | `10` | `game_match.js:207` |
| Voice | `10` | `game_voice.js` |
| Sentences | `10` | `game_sentences.js` |
| Story questions | `15` | `story_ui.js:162` |

### Approach
1. **Parameterize scoring** via `PREFERENCE_SCHEMA`:
   - `scoreFlash: { default: 10 }`, `scoreQuiz: { default: 10 }`, etc.
   - (Debug-only, not in normal settings UI)
2. **Create analysis script** (`tests/score_sensitivity.js`):
   - Sweep values: `[5, 10, 15, 20, 25]` per mode
   - For each mode + point value:
     - Run 100 simulated games (fixed answer patterns: 70% correct, 30% wrong)
     - Record total score, score rate (pts/sec), leaderboard impact
3. **Metrics:**
   - Score distribution (mean, median, stddev, max) per config
   - Time to reach milestones (100pts, 500pts, 1000pts)
   - Leaderboard rank sensitivity (if scores inflate, leaderboard becomes meaningless)
4. **Analysis:**
   - Compare variance across modes: does Match (10 pair attempts) score differently than Voice (single answer)?
   - Recommend point parity or deliberate differentiation

### Deliverables
- `tests/score_sensitivity.js`
- `SENSITIVITY_SCORING.md` — tables and recommendations
- Optional: per-mode scoring config in preferences

---

## 5. Difficulty Threshold Calibration

**Goal:** Validate the `adaptive.js` difficulty cutoffs (`0.8` for easy, `0.5` for hard) against actual user data.

### Parameters
| Parameter | File:Line | Current Value |
|---|---|---|
| Easy threshold | `adaptive.js:8` | `rate >= 0.8` |
| Hard threshold | `adaptive.js:9` | `rate < 0.5` |
| Review session count | `adaptive.js` | `10` or `12` |
| Spacing intervals | `learning_loop.js` | 90-day retention cutoff |

### Approach
1. **Log actual accuracy** per difficulty bucket:
   - For each answered word, log: `{ wordId, difficulty (adaptive.rate), correct, mode, timestamp }`
2. **Analyze historical data** from the existing analytics RTDB path (`users/{uid}/analytics/daily/` + `words/`):
   - Query all attempted words with their `rate` values
   - Group by rate bucket: `[0-0.1), [0.1-0.2), ..., [0.9-1.0]`
   - For each bucket: compute actual accuracy rate
3. **Find optimal cutoffs:**
   - Sweep thresholds: easy `[0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]`, hard `[0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]`
   - For each combo: compute classification accuracy (does the bucket's actual accuracy match the label?)
   - Find thresholds that minimize classification error
4. **Output:**
   - Confusion matrix per threshold combo
   - Precision-recall curve for "hard word" identification
   - Recommended new thresholds with confidence interval

### Deliverables
- `tests/difficulty_calibration.js` — pulls from RTDB analytics
- `SENSITIVITY_DIFFICULTY.md` — results and recommendations
- Updated `adaptive.js` thresholds if analysis warrants

---

## Infrastructure Needed

### Preference-based Parameter Control
Add a `debugPrefs` section to `PREFERENCE_SCHEMA` for tunable parameters not shown in settings UI:
```js
{ key: '_debugDelayCorrect', type: 'range', default: 2000, min: 500, max: 5000, step: 250, section: '_debug' }
```
Only applied when `localStorage.getItem('_debug_mode') === 'true'`.

### Benchmark Utility (`tests/lib/benchmark.js`)
Shared helpers:
- `time(fn, iterations)` — returns mean, median, p95, p99
- `sweep(params, configFn, measureFn)` — grid search over parameter space
- `report(results)` — markdown table output

### Playwright Sensitivity Harness
- `test/e2e/lib/sensitivity.js` — helpers for parameterized Playwright tests
- Ability to inject custom prefs via `page.evaluate()` before game load

---

## Order of Implementation

| Phase | Area | Effort | Impact | Dependencies |
|---|---|---|---|---|
| 1 | Match grid layout | Small | High (visual quality) | None (pure function) |
| 2 | Auto-advance delays | Small | Medium (UX pacing) | Playwright test infra |
| 3 | Difficulty thresholds | Medium | High (learning outcomes) | RTDB analytics data |
| 4 | Scoring sensitivity | Medium | Medium (engagement) | Score parameterization |
| 5 | LLM tuning | Large | High (output quality) | Mock LLM endpoint |

---

## Success Criteria
- Each area produces a document with clear, evidence-based recommendations
- At least 2 areas result in code changes (updated defaults)
- Benchmark tests are reusable for future parameter changes
- No regression in existing Playwright screenshots
