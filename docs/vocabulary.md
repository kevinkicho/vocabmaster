# Vocabulary Enrichment Plan

## Current State
- **6,536 entries**, all 100% tagged across 5 frameworks
- Primary language: Japanese (every entry has `ja` field)
- 10-language translations: ja, zh, ko, en, es, pt, it, fr, de, ru

## Framework Coverage

| Framework | Total Words | In DB | Missing | Coverage |
|-----------|:----------:|:-----:|:-------:|:--------:|
| N5 / A1 / TOPIK1 | 556 | 565* | 0 | 100% |
| N4 / A2 / TOPIK2 | 1,246 | 227 | 1,019 | 18% |
| N3 / B1 / TOPIK3 | 1,570 | 418 | 1,152 | 27% |
| N2 / B2 / TOPIK4 | 2,919 | 1,085 | 1,834 | 37% |
| N1 / C1 / TOPIK5 | 4,064 | 1,465 | 2,599 | 36% |
| HSK 1-6 | 4,993 | 1,604 | 3,389 | 32% |

*N5 exceeds total because duplicated words across frameworks and enriched 498 words

## Enrichment Tiers

| Tier | Level | Words to Add | Priority |
|------|-------|:-----------:|----------|
| 1 | N5 / A1 | ~~498~~ | Done |
| 2 | N4 / A2 | 1,059 | Current |
| 3 | N3 / B1 | 1,223 | Next |
| 4 | N2 / B2 | 2,067 | |
| 5 | N1 / C1 | 2,955 | |
| 6 | HSK 1-6 | 3,389 | |

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

## Word Lists Sources

| Framework | Source | Format |
|-----------|--------|--------|
| JLPT N5-N1 | `@polyglot-bundles/ja-jlpt-syllabi` npm package | 10,169 words |
| HSK 1-6 | `github.com/gigacool/hanyu-shuiping-kaoshi` | 5,000 words |
| JMdict common | `scripts/jmdict-eng-common-3.6.2.json` | 18,029 words |
| CEFR | Derived from JLPT mapping | Approximation |
| TOPIK | Derived from JLPT mapping | Approximation |

## Example Sentences

- N5 level: です/ます form, 5-10 words, basic grammar
- N4 level: です/ます form, 8-15 words, te-form, potential
- N3 level: Plain form, 10-20 words, conditionals, passives
- N2 level: Mixed politeness, 15-25 words, keigo, abstract topics
- N1 level: Complex structures, 20+ words, formal/academic
