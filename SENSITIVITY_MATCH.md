# Sensitivity Analysis: Match Grid Layout

**Date:** 2026-06-12  
**Script:** `tests/match_layout_benchmark.js`  
**Parameter space swept:** 23,625 combinations across 9 viewports

---

## Finding 1: Current formula is near-optimal

Baseline achieves **93–97% viewport coverage** across all tested devices (iPhone SE through desktop 1920×1080). The scoring weights (`ratioScore`, `areaScore`, `orientScore`) serve as tiebreakers between equally feasible layouts — they don't change cell dimensions because those are determined by viewport geometry constraints.

| Viewport | Pairs | Grid | Cell Size | Coverage |
|---|---|---|---|---|
| iPhone SE (375×667) | 4 | 2×4 | 180×144 | 93.9% |
| iPhone 14 (390×844) | 6 | 2×6 | 187×123 | 92.9% |
| iPhone 15 PM (430×932) | 6 | 2×6 | 207×138 | 93.6% |
| Galaxy S24 (412×915) | 6 | 2×6 | 198×135 | 93.4% |
| Tab S7 portrait (800×1280) | 4 | 2×4 | 392×298 | 97.0% |
| Tab S7 landscape (1280×800) | 6 | 4×3 | 312×239 | 96.0% |
| Desktop 1024×768 | 8 | 4×4 | 248×170 | 94.3% |
| Desktop 1440×900 | 6 | 4×3 | 352×273 | 96.4% |
| Desktop 1920×1080 | 6 | 4×3 | 472×333 | 97.2% |

---

## Finding 2: `minCellW`/`minCellH` are not binding

Sweeping `minCellW` from 40→72 and `minCellH` from 30→60 produced **identical results** (avg cell area 65,601, avg pairs 5.8). Actual cells are always much larger than these minima. These constraints never activate.

---

## Finding 3: Gap has marginal effect

| Gap | Avg Area | Avg Pairs | Δ vs baseline |
|---|---|---|---|
| 4px | 66,962 | 5.8 | +2.0% |
| 6px | 66,280 | 5.8 | +1.0% |
| **8px (baseline)** | **65,601** | **5.8** | — |
| 10px | 64,927 | 5.8 | -1.0% |
| 12px | 64,797 | 5.7 | -1.2% |
| 16px | 64,125 | 5.6 | -2.2% |

**Verdict:** Not worth changing. The current 8px (`gap-2` in Tailwind) is a reasonable default.

---

## Finding 4: `areaCapW`/`areaCapH` is the critical design lever

These caps prevent the scorer from being dominated by a few giant cells on large viewports. They determine the **pair count vs cell size tradeoff**.

| Cap (W/H) | Avg Area | Avg Pairs | Notable change |
|---|---|---|---|
| **180/120 (baseline)** | **65,601** | **5.8** | Balanced |
| 180/180 | 70,903 | 5.0 | iPhone SE drops 4→3 pairs |
| 250/180 | 70,903 | 5.0 | Same — capW doesn't bind |
| Uncapped | 190,097 | 2.0 | All viewports forced to 2 pairs |

Increasing `capH` to 180 gives +8% cell area but loses 1 pair on small phones (iPhone SE: 4p→3p, iPhone 14: 6p→4p). This is a valid tradeoff choice but not a clear win.

---

## Finding 5: Starting pair threshold at 800px is reasonable

The current code starts with 8 pairs if `window.innerHeight > 800`, else 6 pairs. All tested phones are >800px tall, so they get 6 pairs. Only the smallest viewport (iPhone SE at 667px) falls below. The threshold is a minor detail since users override it via the dropdown.

---

## Finding 6: All parameter sweep top results match baseline

After sweeping 23,625 combos with a utility metric that balances cell area against pair count, the **top 15 results all produce identical layout to baseline** (0% improvement, same pairs/cells per viewport).

---

## Conclusion: No changes needed

The current `calcLayout()` formula is already optimal for the chosen design goals (maximize cell size while maintaining ≥4 pairs). The scoring weights are tiebreakers that work correctly. No code changes recommended.

**For significantly different behavior**, you'd need to change the *goals* — e.g., prefer 2 large cells over 6 medium ones (uncap the area caps) or tolerate fewer pairs on small phones (raise `areaCapH`). These are product decisions, not optimization problems.
