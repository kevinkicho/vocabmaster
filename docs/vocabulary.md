# Vocabulary Enrichment

## Current State (June 2026)
- **13,833 entries**, all 100% tagged across 5 frameworks
- Primary language: Japanese (every entry has `ja` field)
- 10-language translations: ja, zh, ko, en, es, pt, it, fr, de, ru
- Pinyin corrected for all entries using `pypinyin`

## Framework Coverage

| Level | Framework | JLPT | CEFR | TOPIK | Entries |
|-------|-----------|:----:|:----:|:-----:|:-------:|
| Beginner | N5 | ✓ | A1 | 1 | 565 |
| Elementary | N4 | ✓ | A2 | 2 | 1,286 |
| Intermediate | N3 | ✓ | B1 | 3 | 1,641 |
| Upper-Int | N2 | ✓ | B2 | 4 | 3,145 |
| Advanced | N1 | ✓ | C1 | 5 | 4,420 |
| Freq-tier | JMdict | — | — | — | 2,776 |

| Framework | Source | Words | In DB | Coverage |
|-----------|--------|:-----:|:-----:|:--------:|
| JLPT N5 | polyglot-bundles | 556 | 565* | 100% |
| JLPT N4 | polyglot-bundles | 1,246 | 1,286* | 100% |
| JLPT N3 | polyglot-bundles | 1,570 | 1,641* | 100% |
| JLPT N2 | polyglot-bundles | 2,919 | 3,145* | 100% |
| JLPT N1 | polyglot-bundles | 4,064 | 4,420* | 100% |
| HSK 1-6 | gigacool/hsk | 4,993 | 1,604 | 32% |
| JMdict common | jmdict | 18,029 | 3,628 | 20% |

\* Totals exceed framework word counts because entries are shared across levels and duplicates are preserved.

## Enrichment Progress

| Tier | Framework | Words Added | Date | Status |
|------|-----------|:-----------:|------|:------:|
| 1 | N5 / A1 / TOPIK1 | 498 | Jun 2026 | Done |
| 2 | N4 / A2 / TOPIK2 | 1,059 | Jun 2026 | Done |
| 3 | N3 / B1 / TOPIK3 | 1,223 | Jun 2026 | Done |
| 4 | N2 / B2 / TOPIK4 | 1,466+594 | Jun 2026 | Done |
| 5 | N1 / C1 / TOPIK5 | 2,955 | Jun 2026 | Done |
| 6 | HSK 1-6 | 3,389 | — | Planned |

## Entry Schema

```json
{
  "id": 6537,
  "ja": "日本語",
  "ja_furi": "にほんご",
  "ja_roma": "nihongo",
  "ja_ex": "日本語を勉強しています。",
  "en": "Japanese language",
  "en_ex": "I am studying Japanese.",
  "zh": "日语",
  "zh_pin": "rì yǔ",
  "zh_ex": "我在学习日语。",
  "ko": "일본어",
  "ko_roma": "ilboneo",
  "ko_ex": "일본어를 공부하고 있습니다.",
  "es": "japonés",
  "es_ex": "Estoy estudiando japonés.",
  "pt": "japonês",
  "pt_ex": "Estou estudando japonês.",
  "it": "giapponese",
  "it_ex": "Sto studiando giapponese.",
  "fr": "japonais",
  "fr_ex": "J'étudie le japonais.",
  "de": "Japanisch",
  "de_ex": "Ich lerne Japanisch.",
  "ru": "японский язык",
  "ru_tr": "yaponskiy yazyk",
  "ru_ex": "Я изучаю японский язык.",
  "level": "N5",
  "tags": ["N5", "A1", "TOPIK1"]
}
```

## Tagging Rules

- **level**: Primary JLPT level (N5-N1) or "unassigned"
- **tags**: Array of all applicable framework tags
  - JLPT: N5, N4, N3, N2, N1
  - HSK: HSK1-HSK6 (from Chinese translation match)
  - CEFR: A1-C1 (approximated from JLPT level)
  - TOPIK: TOPIK1-TOPIK5 (approximated from JLPT level)
  - JMdict: common, uncommon, rare (frequency tiers)

## Word List Sources

| Framework | Source |
|-----------|--------|
| JLPT N5-N1 | `@polyglot-bundles/ja-jlpt-syllabi` npm (10,169 words) |
| JLPT N5 | Project `generate-jlpt-data.js` (556 words) |
| HSK 1-6 | `github.com/gigacool/hanyu-shuiping-kaoshi` (4,993 words) |
| JMdict common | `scripts/jmdict-eng-common-3.6.2.json` (18,029 words) |
| CEFR | Mapped from JLPT (approximation) |
| TOPIK | Mapped from JLPT (approximation) |

## Fixes Applied

| Fix | Entries | Date |
|-----|:-------:|------|
| Pinyin correction (zh_pin) | 6,038 | Jun 2026 |
| JLPT framework tags | 13,833 | Jun 2026 |
| HSK framework tags | 4,253 | Jun 2026 |
| CEFR framework tags | 13,057 | Jun 2026 |
| TOPIK framework tags | 13,057 | Jun 2026 |
| JMdict frequency tiers | 2,776 | Jun 2026 |
| Template sentences replaced | 498 (N5) | Jun 2026 |
| Template sentences replaced | 594 (N2) | Jun 2026 |
| _ex field gaps filled | 37 | Jun 2026 |

## Example Sentences by Level

- N5: です/ます form, 5-10 words, basic grammar
- N4: です/ます form, te-form, potential, 8-15 words
- N3: Plain form, conditionals, passives, 10-20 words
- N2: Mixed politeness, keigo, abstract, 15-25 words
- N1: Formal/academic, complex, 20+ words
