#!/usr/bin/env node
/**
 * F1 — Cloze blank hit-rate scan (offline).
 *
 * Usage:
 *   node scripts/cloze-metrics.js [path/to/vocab.json]
 *   node scripts/cloze-metrics.js data/tier1_enriched.json
 *
 * Writes:
 *   reports/cloze-metrics-YYYY-MM-DD.json
 *   reports/cloze-metrics-YYYY-MM-DD.md
 *
 * Measures exact-headword-only baseline vs SentenceUtils.findBlankSpan.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DATA = path.join(ROOT, 'data', 'tier1_enriched.json');
const LANGS = ['ja', 'en', 'zh', 'ko', 'es', 'fr', 'de'];

function loadSentenceUtils() {
    const code = fs.readFileSync(path.join(ROOT, 'public/js/sentence_utils.js'), 'utf8');
    const ctx = { window: {}, console };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    if (!ctx.window.SentenceUtils) throw new Error('SentenceUtils not loaded');
    return ctx.window.SentenceUtils;
}

function loadVocab(file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw : Object.values(raw);
}

function exactMatch(item, lang) {
    const head = String(item[lang] || '').replace(/[（(][^）)]*[）)]/g, '').trim();
    const conf = { ja: 'ja_ex', en: 'en_ex', zh: 'zh_ex', ko: 'ko_ex', es: 'es_ex', fr: 'fr_ex', de: 'de_ex' };
    const exKey = conf[lang] || lang + '_ex';
    const ex = String(item[exKey] || '');
    if (!head || !ex) return null;
    // multi-gloss exact of whole string only (old bug surface)
    return ex.indexOf(head) !== -1;
}

function main() {
    const dataPath = path.resolve(process.argv[2] || DEFAULT_DATA);
    if (!fs.existsSync(dataPath)) {
        console.error('Data file not found:', dataPath);
        process.exit(1);
    }
    const SU = loadSentenceUtils();
    const vocab = loadVocab(dataPath);
    const day = new Date().toISOString().slice(0, 10);
    const byLang = {};

    for (const lang of LANGS) {
        let total = 0;
        let exactHits = 0;
        let utilsHits = 0;
        const misses = [];
        for (const item of vocab) {
            const conf = { ja: 'ja_ex', en: 'en_ex', zh: 'zh_ex', ko: 'ko_ex', es: 'es_ex', fr: 'fr_ex', de: 'de_ex' };
            const exKey = conf[lang] || lang + '_ex';
            if (!item[lang] || !item[exKey]) continue;
            total++;
            if (exactMatch(item, lang)) exactHits++;
            const span = SU.findBlankSpan(item[exKey], item, lang);
            if (span) utilsHits++;
            else if (misses.length < 8) {
                misses.push({
                    head: item[lang],
                    furi: item.ja_furi || item.zh_pin || item.ko_roma || null,
                    ex: item[exKey]
                });
            }
        }
        byLang[lang] = {
            total,
            exactHits,
            exactRate: total ? +(exactHits / total).toFixed(4) : null,
            utilsHits,
            utilsRate: total ? +(utilsHits / total).toFixed(4) : null,
            sampleMisses: misses
        };
    }

    const report = {
        date: day,
        corpus: path.relative(ROOT, dataPath).replace(/\\/g, '/'),
        method: {
            exact:
                'Headword field after paren-strip must appear as exact substring of *\_ex. Multi-gloss whole string (e.g. 静か・閑か) counts only if fully present — matches pre-SentenceUtils Sentences.generateCloze primary path.',
            utils:
                'SentenceUtils.findBlankSpan: candidates from headword + secondary readings + multi-gloss splits + light JA conjugation; exact / Latin morph / CJK longest substring ≥2.'
        },
        languages: byLang,
        summary: {
            ja_exact: byLang.ja && byLang.ja.exactRate,
            ja_utils: byLang.ja && byLang.ja.utilsRate,
            en_exact: byLang.en && byLang.en.exactRate,
            en_utils: byLang.en && byLang.en.utilsRate
        }
    };

    const outDir = path.join(ROOT, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `cloze-metrics-${day}.json`);
    const mdPath = path.join(outDir, `cloze-metrics-${day}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    let md = `# Cloze metrics ${day}\n\n`;
    md += `Corpus: \`${report.corpus}\`\n\n`;
    md += `| Lang | N | Exact rate | SentenceUtils rate |\n|------|---|------------|--------------------|\n`;
    for (const lang of LANGS) {
        const r = byLang[lang];
        if (!r || !r.total) continue;
        md += `| ${lang} | ${r.total} | ${(r.exactRate * 100).toFixed(1)}% | ${(r.utilsRate * 100).toFixed(1)}% |\n`;
    }
    md += `\n## Method\n\n- **Exact:** ${report.method.exact}\n- **Utils:** ${report.method.utils}\n`;
    md += `\n## Sample JA misses (utils)\n\n`;
    (byLang.ja && byLang.ja.sampleMisses || []).forEach((m) => {
        md += `- \`${m.head}\` / furi=\`${m.furi}\` · ${m.ex}\n`;
    });
    fs.writeFileSync(mdPath, md);

    console.log(JSON.stringify(report.summary, null, 2));
    console.log('Wrote', path.relative(ROOT, jsonPath));
    console.log('Wrote', path.relative(ROOT, mdPath));
}

main();
