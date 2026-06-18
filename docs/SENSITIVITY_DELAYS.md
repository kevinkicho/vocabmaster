# Sensitivity Analysis: Auto-Advance Delays

**Date:** 2026-06-12  
**Test:** `test/e2e/sensitivity_delays.spec.js`  
**Delays tested:** 500–5000ms, both `_debugDelayMs` override and `fallbackDelay` paths

---

## Finding 1: The delay mechanism is trivially accurate

Both the `_debugDelayMs` override and native `fallbackDelay` achieve measured delays within `setTimeout` jitter (±150ms).

| Target | Measured (_debug) | Error | Measured (fallback) | Error |
|---|---|---|---|---|
| 500 | 501 | +1 | 500 | 0 |
| 1000 | 1144 | +144 | 1117 | +117 |
| 1500 | 1507 | +7 | 1500 | 0 |
| 2000 | 2000 | 0 | 2000 | 0 |
| 2500 | 2500 | 0 | 2500 | 0 |
| 3000 | 3000 | 0 | 3000 | 0 |
| 4000 | 4000 | 0 | — | — |
| 5000 | 5000 | 0 | — | — |

All well within tolerance. The deviation at 1000ms is normal `setTimeout` jitter (event loop scheduling).

---

## Finding 2: Current delay values vary inconsistently by mode

| Mode | Correct Delay | Wrong Delay | Rationale (from code) |
|---|---|---|---|
| Flashcards | — | — | Manual nav |
| Quiz | 2500ms | 2500ms | Generic pause |
| True/False | 2500ms | 2500ms | Generic pause |
| Voice | 1500ms | 2000ms | Shorter — voice feedback is instant |
| Sentences | 2500ms | 3000ms | Longer wrong — shows grammar explanation |
| **Match** | — | — | Grid resets, no auto-advance |

The variation is intentional per mode, but the specific values (1500/2000/2500/3000) have no empirical justification.

---

## Finding 3: The `audioWait` feature adds a variable second delay

When `audioWait` is true and an audio promise is provided, `waitAndNav` awaits the audio playback first, then falls through. This means the total delay = audio duration + 0 (if audio exists) or `fallbackDelay` (if no audio). The `_debugDelayMs` override correctly adds on top of audio when enabled.

---

## Finding 4: No "optimal" value can be determined without user testing

The sensitivity analysis confirms the timing mechanism is sound. The "best" delay depends on:
- **Reading speed** — slower readers need longer wrong-answer delays to see corrections
- **Mode context** — Voice mode feedback is instantaneous; Sentences needs time to read grammar explanations
- **Audio playback** — when `audioWait` is on, audio length dominates the perceived wait

---

## Recommendation

**No code changes needed.** The current values are reasonable defaults:

| Mode | Correct | Wrong | Reasoning |
|---|---|---|---|
| Quiz | 2500ms | 2500ms | Symmetric pause for reading feedback |
| TF | 2500ms | 2500ms | Same as Quiz |
| Voice | 1500ms | 2000ms | Faster feedback; slightly longer on error |
| Sentences | 2500ms | 3000ms | Extra time to read grammar explanation |

If user testing reveals pacing issues in the future, the `_debugDelayMs` pref (added for this analysis) makes it trivial to A/B test different values by just changing a single number.

---

## Infrastructure Added

- `_debugDelayMs` pref in `PREFERENCE_SCHEMA` — when set > 0, overrides all `waitAndNav` delays
- Updated `waitAndNav()` in `game_core.js:194-210` — reads `_debugDelayMs` and applies it
- `test/e2e/sensitivity_delays.spec.js` — Playwright test harness for future delay validation
