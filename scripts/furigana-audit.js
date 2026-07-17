#!/usr/bin/env node
/**
 * F2 — Furigana / multi-gloss data quality audit (read-only report).
 * Flags rows where ja_furi does not appear in ja_ex and headword does not either.
 *
 *   node scripts/furigana-audit.js data/tier1_enriched.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const dataPath = path.resolve(process.argv[2] || path.join(ROOT, 'data/tier1_enriched.json'));
const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const arr = Array.isArray(raw) ? raw : Object.values(raw);
const bad = [];
for (const w of arr) {
    if (!w.ja || !w.ja_ex) continue;
    const head = String(w.ja).replace(/[（(][^）)]*[）)]/g, '').trim();
    const furi = String(w.ja_furi || '').trim();
    const ex = String(w.ja_ex);
    const headIn = head && ex.indexOf(head) !== -1;
    const furiIn = furi && ex.indexOf(furi) !== -1;
    if (!headIn && !furiIn) {
        bad.push({ ja: w.ja, ja_furi: w.ja_furi || '', ja_ex: w.ja_ex, tags: w.tags || [] });
    }
}
const day = new Date().toISOString().slice(0, 10);
const outDir = path.join(ROOT, 'reports');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `furigana-audit-${day}.json`);
fs.writeFileSync(out, JSON.stringify({ date: day, corpus: path.relative(ROOT, dataPath), count: bad.length, sample: bad.slice(0, 50) }, null, 2));
console.log('Suspect rows (neither head nor furi in example):', bad.length);
console.log('Wrote', out);
