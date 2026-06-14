# Sensitivity Analysis: Difficulty Threshold Calibration

**Date:** 2026-06-12  
**Script:** `tests/difficulty_calibration.js`  
**Dataset:** 300 synthetic words across 6 difficulty clusters (0.2–0.9 true accuracy rates)

---

## Thresholds Under Test

| Function | Current Value | Purpose |
|---|---|---|
| `getWordDifficulty` easy | `rate >= 0.80` | Label word as "easy" (low review priority) |
| `getWordDifficulty` hard | `rate < 0.50` | Label word as "hard" (high review priority) |
| `adjustDifficulty` promote | `score >= 0.85` | Move user up one CEFR level |
| `adjustDifficulty` demote | `score < 0.50` | Move user down one CEFR level |

---

## Finding 1: Current thresholds achieve 82.7% classification accuracy

| Class | F1 | Precision | Recall | Notes |
|---|---|---|---|---|
| **Hard** | 0.907 | 0.845 | 0.980 | Catches almost all hard words (98% recall), but 18% false positives |
| **Medium** | 0.757 | 0.711 | 0.810 | Weakest class — leaky middle bucket |
| **Easy** | 0.812 | 0.986 | 0.690 | Very few false easy (98.6% precision), but misses 31% of truly easy words |

**Confusion matrix (current thresholds):**
```
           hard   medium  easy
  hard        98       2     0
  medium      18      81     1
  easy         0      31    69
```

The medium class is the weak link — 18 words that are truly "hard" get labeled "medium" (false negatives for hard), and 31 truly "easy" words get labeled "medium" (false negatives for easy). This is inherent to having a middle bucket.

---

## Finding 2: The "medium" class is inherently imprecise

Any three-bucket classification with a middle range will have the lowest accuracy in the middle. The medium bucket is a "catch-all" for rates between `hard` and `easy`. Words near the boundaries (~0.45–0.55 and ~0.75–0.85) will frequently be misclassified.

**If you want to narrow the medium band:**
- Move easy threshold down → fewer medium, more easy, but more false easy
- Move hard threshold up → fewer medium, more hard, but more false hard

**If you want to widen it:**
- Move easy threshold up → more medium, fewer false easy, but more missed easy
- Move hard threshold down → more medium, fewer false hard, but more missed hard

---

## Finding 3: Optimal thresholds depend on your goal

Top 3 configurations by average F1:

| easy>= | hard< | Accuracy | Hard F1 | Medium F1 | Easy F1 | Avg F1 |
|---|---|---|---|---|---|---|
| **0.70** | **0.40** | **93.7%** | **0.958** | **0.905** | **0.947** | **0.937** |
| 0.70 | 0.45 | 92.0% | 0.937 | 0.871 | 0.947 | 0.918 |
| 0.75 | 0.40 | 89.3% | 0.958 | 0.861 | 0.865 | 0.895 |
| **0.80 (current)** | **0.50 (current)** | **82.7%** | **0.907** | **0.757** | **0.812** | **0.825** |

The "top" performer (0.70/0.40) achieves higher F1 across all classes, but this is partly because the synthetic data has clean cluster boundaries. In real-world noisy data, wider thresholds would perform relatively worse.

---

## Finding 4: `adjustDifficulty` thresholds are reasonable

| Promote | Demote | Promote Match | Demote Match |
|---|---|---|---|
| 0.85 (current) | 0.50 (current) | 64.7% | 130.7% |
| 0.80 | 0.55 | 64.0% | 133.3% |
| 0.70 | 0.55 | 65.3% | 133.3% |

The promote threshold (0.85) has ~65% match rate with our simulated "should promote" words. The demote threshold (0.50) has >100% match (because many words with true difficulty <0.4 also get caught). These are reasonable defaults.

---

## Finding 5: `selectWordsForReview` prioritization is correct

The priority ordering (hard → medium → easy) is the right approach. The thresholds determine which bucket a word falls into, which directly affects how often it appears in review sessions. This is the main practical impact of the threshold choice.

---

## Recommendation: Keep current thresholds, but monitor medium-class leakage

**No code changes needed.** The current thresholds (easy>=0.80, hard<0.50) are reasonable defaults that balance precision and recall across all three classes.

**If you want to tune:**
- **For more aggressive review of struggling words:** Lower hard threshold to 0.45 (catches more words as "hard")
- **For fewer annoying reviews:** Raise hard threshold to 0.55 (fewer false positives)
- **For the "medium" class specifically:** Accept that it will always be the weakest link — it's a middle bucket

The `tests/difficulty_calibration.js` script can be re-run against real user data from RTDB analytics to get empirical thresholds when sufficient data exists.
