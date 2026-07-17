# Cloze metrics 2026-07-17

Corpus: `data/tier1_enriched.json`

| Lang | N | Exact rate | SentenceUtils rate |
|------|---|------------|--------------------|
| ja | 498 | 3.8% | 98.2% |
| en | 498 | 37.4% | 87.8% |
| zh | 498 | 59.2% | 70.9% |
| ko | 498 | 50.0% | 67.9% |
| es | 498 | 48.4% | 63.2% |
| fr | 498 | 52.2% | 67.7% |
| de | 498 | 50.4% | 67.1% |

## Method

- **Exact:** Headword field after paren-strip must appear as exact substring of *_ex. Multi-gloss whole string (e.g. 静か・閑か) counts only if fully present — matches pre-SentenceUtils Sentences.generateCloze primary path.
- **Utils:** SentenceUtils.findBlankSpan: candidates from headword + secondary readings + multi-gloss splits + light JA conjugation; exact / Latin morph / CJK longest substring ≥2.

## Sample JA misses (utils)

- `家` / furi=`け` · わたしのいえはあかいやねです。
- `外` / furi=`がい` · そとであそびましょう。
- `さらい` / furi=`さらい` · あさって、ともだちにいます。
- `力` / furi=`りょく` · かのじょはちからがつよいです。
- `山` / furi=`やま` · きょねん、ふじさんにのぼりました。
- `子` / furi=`ね` · あのこはまいにちがっこうへいきます。
- `下` / furi=`もと` · いすのしたにねこがいます。
- `心` / furi=`しん` · こころをこめててがみをかきました。
