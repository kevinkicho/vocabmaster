/* tests/grammar_feedback.mjs — Interactive Grammar Gym feedback tool
 *
 * Loads an audit dataset, lets you rate each exercise (like/dislike),
 * records feedback, and supports re-generation of disliked items.
 *
 * Usage:
 *   node tests/grammar_feedback.mjs                    # rate latest dataset
 *   node tests/grammar_feedback.mjs --dataset N         # rate dataset N
 *   node tests/grammar_feedback.mjs --regenerate        # re-gen disliked items
 *   node tests/grammar_feedback.mjs --summary           # summary only
 *
 * Data is stored in audit_data/dataset_XXX.json (auto-incremented by audit),
 * with feedback recorded inline in each dataset file.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(__dirname, 'artifacts', 'data');

// --- Readline wrapper ---
function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, a => { rl.close(); resolve(a.trim()); }));
}

// --- Dataset management ---
function listDatasets() {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .filter(f => f.startsWith('dataset_') && f.endsWith('.json') && !f.includes('_feedback_'))
    .sort();
}

function loadDataset(id) {
  let path;
  if (id) {
    // id can be a number (dataset number) or a filename
    const files = listDatasets();
    const match = files.find(f => f.startsWith(`dataset_${String(id).padStart(3, '0')}`));
    path = match ? join(DATA_DIR, match) : join(DATA_DIR, id.endsWith('.json') ? id : `dataset_${String(id).padStart(3, '0')}.json`);
  } else {
    const datasets = listDatasets();
    if (!datasets.length) {
      console.error('No datasets found in test/audit/artifacts/data/. Run `npm run audit` first.');
      process.exit(1);
    }
    path = join(DATA_DIR, datasets[datasets.length - 1]);
  }
  if (!existsSync(path)) {
    console.error('Dataset not found:', path);
    console.error('Available datasets:', listDatasets().join(', '));
    process.exit(1);
  }
  return { path, data: JSON.parse(readFileSync(path, 'utf8')) };
}

// --- Display helpers ---
const FAILURE_CATEGORIES = [
  { id: 'wrong-answer', label: 'Wrong answer marked (contradicts explanation)' },
  { id: 'duplicate-choices', label: 'Duplicate or identical choices' },
  { id: 'off-grammar', label: "Doesn't test the stated grammar rule" },
  { id: 'lang-error', label: 'Language error (wrong gender, particle, etc.)' },
  { id: 'explanation-poor', label: 'Explanation unclear, wrong, or missing' },
  { id: 'scenario-boring', label: 'Scenario generic or doesn\'t fit type' },
  { id: 'answer-skew', label: 'Too many A or B answers in the set' },
  { id: 'other', label: 'Other issue' },
];

function formatExercise(ex, i, total) {
  const lines = [];
  const bar = '─'.repeat(50);
  lines.push(`${bar}`);
  lines.push(`  Exercise ${i + 1}/${total}  [${ex.type}]  Answer: ${ex.answer}`);
  lines.push(`${bar}`);
  lines.push(`  Q: ${ex.question.slice(0, 200)}`);
  for (const c of ex.choices || []) {
    const marker = c.letter === ex.answer ? '←' : ' ';
    lines.push(`  ${marker} ${c.letter}: ${c.text.slice(0, 150)}`);
  }
  lines.push(`  E: ${ex.explanation.slice(0, 200)}`);
  return lines.join('\n');
}

function showLanguageSummary(data, langCode) {
  const res = data.results?.find(r => r.code === langCode);
  if (!res || !res.analysis?.stats) return 'no data';
  const s = res.analysis.stats;
  const fb = res.feedback || {};
  const rated = Object.keys(fb).length;
  const likes = Object.values(fb).filter(v => v === 'good').length;
  return `exercises=${Object.keys(fb).length}/${12} rated, ${likes} liked`;
}

// --- Feedback main ---
async function runFeedback() {
  const args = process.argv.slice(2);
  const mode = args.includes('--regenerate') ? 'regenerate'
    : args.includes('--summary') ? 'summary'
    : 'feedback';

  const dsIndex = args.findIndex(a => a === '--dataset');
  const dsId = dsIndex >= 0 ? args[dsIndex + 1] : null;
  const { path, data } = loadDataset(dsId);
  const datasetLabel = path.split('/').pop();

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║     Grammar Gym Feedback — ${datasetLabel.slice(0, 32).padEnd(32)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`  Model: ${data.primaryModel || data.primaryProvider}`);
  console.log(`  Prompt version: v${data.promptVersion || '?'} — ${data.promptVersionDesc || ''}`);
  console.log(`  Dataset #${data.datasetNumber || '?'}`);
  console.log(`  Generated: ${data.timestamp}`);
  console.log(`  Languages: ${data.totalLanguages}  Exercises/lang: ${data.exercisesPerLanguage}`);
  console.log();

  if (mode === 'summary') {
    return showSummary(data);
  }

  if (mode === 'regenerate') {
    return regenerateDisliked(data, path, dsId);
  }

  // --- Feedback mode: rate each exercise ---
  console.log('  Rate each exercise: [g]ood 👍  [b]ad 👎  [/]skip  [s]ummary  [q]uit\n');

  for (const res of data.results || []) {
    if (res.status !== 'ok') continue;
    if (!res.feedback) res.feedback = {};

    const parsedRaw = parseResponse(res.raw);
    if (!parsedRaw) continue;

    const exercises = parsedRaw.exercises || [];
    const langName = res.language;

    console.log(`\n  >>> ${langName} (${res.code}) — "${res.word}" <<<`);

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const exKey = String(i);

      // Skip if already rated (unless --rerate flag)
      if (res.feedback[exKey] && !args.includes('--rerate')) continue;

      console.log(formatExercise(ex, i, exercises.length));

      let input = '';
      while (true) {
        const prompt = `  [g]ood 👍  [b]ad 👎  [/]skip  [s]ummary  [q]uit > `;
        input = (await ask(prompt)).toLowerCase();
        if (input === 'q') { console.log('Quitting.\n'); return; }
        if (input === 's') { showSummary(data); break; }
        if (['g', 'b', '/'].includes(input)) break;
      }

      if (input === '/') continue;
      if (input === 's') { i--; continue; }

      if (input === 'g') {
        res.feedback[exKey] = 'good';
        console.log('  ✅ Recorded as 👍 good\n');
        continue;
      }

      // Bad — ask for category
      res.feedback[exKey] = 'bad';
      console.log('\n  What went wrong? (enter numbers, comma-separated):');
      for (let ci = 0; ci < FAILURE_CATEGORIES.length; ci++) {
        console.log(`    ${ci + 1}. ${FAILURE_CATEGORIES[ci].label}`);
      }
      const catInput = await ask('  Categories > ');
      const selected = catInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0 && n <= FAILURE_CATEGORIES.length);
      res.feedback[`${exKey}_cats`] = selected.map(n => FAILURE_CATEGORIES[n - 1].id);
      console.log('  ✅ Recorded as 👎 bad\n');
    }

    // Summarize this language
    const fb = res.feedback || {};
    const exCount = exercises.length;
    const ratedCount = Object.keys(fb).filter(k => k === 'good' || k === 'bad' || !k.includes('_cats')).length;
    // Better count: good + bad entries
    const goodCount = Object.entries(fb).filter(([k, v]) => v === 'good').length;
    const badCount = Object.entries(fb).filter(([k, v]) => v === 'bad').length;
    console.log(`  ${langName}: ${goodCount}👍 ${badCount}👎 / ${exCount} exercises rated`);
  }

  // Save
  data.feedbackTimestamp = new Date().toISOString();
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`\n  Feedback saved to ${path}`);
  showSummary(data);
}

function parseResponse(raw) {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/\n?```/g, '').replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleaned);
  } catch { return null; }
}

function showSummary(data) {
  const allFb = [];
  for (const res of data.results || []) {
    if (!res.feedback) continue;
    const parsed = parseResponse(res.raw);
    const exCount = parsed?.exercises?.length || 0;
    for (let i = 0; i < exCount; i++) {
      const v = res.feedback[String(i)];
      if (v === 'good' || v === 'bad') {
        allFb.push({ lang: res.language, ex: i, type: parsed.exercises[i]?.type, rating: v,
          cats: res.feedback[`${i}_cats`] || [] });
      }
    }
  }

  const total = allFb.length;
  const good = allFb.filter(f => f.rating === 'good').length;
  const bad = allFb.filter(f => f.rating === 'bad').length;
  const pct = total > 0 ? Math.round(good / total * 100) : 0;

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║                    Feedback Summary                         ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`  Total ratings: ${total}`);
  console.log(`  👍 Good:       ${good} (${pct}%)`);
  console.log(`  👎 Bad:        ${bad} (${100 - pct}%)`);
  console.log();

  if (bad > 0) {
    console.log('  Failure categories:');
    const catCount = {};
    for (const f of allFb) {
      for (const c of f.cats) catCount[c] = (catCount[c] || 0) + 1;
    }
    for (const cat of FAILURE_CATEGORIES) {
      const count = catCount[cat.id] || 0;
      if (count > 0) console.log(`    ${cat.label}: ${count}`);
    }
    console.log();
  }

  // Per-language breakdown
  console.log('  Per language:');
  const langs = {};
  for (const f of allFb) {
    if (!langs[f.lang]) langs[f.lang] = { good: 0, bad: 0 };
    langs[f.lang][f.rating]++;
  }
  for (const [lang, counts] of Object.entries(langs).sort()) {
    const bar = '█'.repeat(Math.round(counts.good / (counts.good + counts.bad || 1) * 20)) +
                '░'.repeat(20 - Math.round(counts.good / (counts.good + counts.bad || 1) * 20));
    console.log(`    ${lang.padEnd(12)} 👍${counts.good} 👎${counts.bad}  ${bar}`);
  }

  // Per-exercise-type breakdown
  console.log('\n  Per exercise type:');
  const types = {};
  for (const f of allFb) {
    const t = f.type || 'unknown';
    if (!types[t]) types[t] = { good: 0, bad: 0 };
    types[t][f.rating]++;
  }
  for (const [type, counts] of Object.entries(types).sort()) {
    const total = counts.good + counts.bad;
    const pct = total > 0 ? Math.round(counts.good / total * 100) : 0;
    console.log(`    ${type.padEnd(18)} 👍${counts.good} 👎${counts.bad}  (${pct}% good)`);
  }

  // Prompt tuning suggestions based on feedback patterns
  const catCount = {};
  for (const f of allFb) {
    for (const c of f.cats) catCount[c] = (catCount[c] || 0) + 1;
  }
  const suggestions = [];
  if ((catCount['wrong-answer'] || 0) >= 1) {
    suggestions.push('- Add "CRITICAL: The answer you mark MUST match your explanation. Never mark an answer as correct if your explanation says it is wrong."');
  }
  if ((catCount['duplicate-choices'] || 0) >= 1) {
    suggestions.push('- Add "CRITICAL: The two choices MUST be different from each other. Never produce identical choices."');
  }
  if ((catCount['off-grammar'] || 0) >= 1) {
    suggestions.push('- Add "CRITICAL: The correct answer MUST demonstrate the grammar rule. If the answer does not contain the grammar rule, it is wrong."');
  }
  if ((catCount['lang-error'] || 0) >= 1) {
    suggestions.push('- Add "CRITICAL: Verify gender, particles, and grammar in all choices. Never mark a grammatically incorrect answer as correct."');
  }
  if ((catCount['answer-skew'] || 0) >= 1) {
    suggestions.push('- Strengthen: "IMPORTANT: Exactly 6 answers must be A and 6 must be B. Count them before outputting."');
  }
  if (suggestions.length > 0) {
    console.log('\n  Suggested prompt tuning:');
    for (const s of suggestions) console.log(`  ${s}`);
  }

  console.log();
}

// --- Regenerate disliked items ---
async function regenerateDisliked(data, originalPath) {
  console.log('Re-generation mode: re-running LLM for languages with 👎 ratings\n');

  // Find languages with bad feedback
  const toRegen = [];
  for (const res of data.results || []) {
    if (res.status !== 'ok') continue;
    const fb = res.feedback || {};
    const hasBad = Object.entries(fb).some(([k, v]) => v === 'bad');
    if (hasBad) {
      const badIndices = Object.entries(fb).filter(([k, v]) => v === 'bad').map(([k]) => parseInt(k));
      toRegen.push({ language: res.language, code: res.code, word: res.word, sentence: res.sentence, level: res.level, badIndices });
    }
  }

  if (!toRegen.length) {
    console.log('No 👎 ratings found. Nothing to regenerate.');
    return;
  }

  console.log(`Will regenerate: ${toRegen.map(r => r.language).join(', ')}`);
  const ok = await ask('Continue? (y/n) > ');
  if (ok.toLowerCase() !== 'y') { console.log('Cancelled.'); return; }

  // Load env vars (same as audit script does)
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }

  // Dynamic import of the prompt builder from grammar_audit.mjs
  // Since it's not a module export, we'll rebuild it inline
  // This is a simplified regeneration — for full functionality, run grammar_audit.mjs

  const LANG_MAP_INLINE = {
    ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
    en: 'English', es: 'Spanish', fr: 'French',
    de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
    ar: 'Arabic'
  };
  const LEVEL_MAP = {
    'N5': 'beginner (N5)', 'N4': 'advanced beginner (N4)', 'N3': 'intermediate (N3)',
    'N2': 'upper intermediate (N2)', 'N1': 'advanced (N1)',
    'HSK1': 'beginner (HSK 1)', 'HSK2': 'advanced beginner (HSK 2)',
    'HSK3': 'intermediate (HSK 3)', 'HSK4': 'upper intermediate (HSK 4)',
    'HSK5': 'advanced (HSK 5)', 'HSK6': 'proficient (HSK 6)',
    'TOPIK1': 'beginner (TOPIK 1)', 'TOPIK2': 'advanced beginner (TOPIK 2)',
    'TOPIK3': 'intermediate (TOPIK 3)', 'TOPIK4': 'upper intermediate (TOPIK 4)',
    'TOPIK5': 'advanced (TOPIK 5)', 'TOPIK6': 'proficient (TOPIK 6)',
    'A1': 'beginner (A1)', 'A2': 'elementary (A2)', 'B1': 'intermediate (B1)',
    'B2': 'upper intermediate (B2)', 'C1': 'advanced (C1)', 'C2': 'proficient (C2)'
  };

  // Check if there's a prompt_override mechanism from accumulated feedback
  let promptOverrides = '';
  const fbPath = join(DATA_DIR, 'feedback_log.json');
  if (existsSync(fbPath)) {
    const fbLog = JSON.parse(readFileSync(fbPath, 'utf8'));
    const catCount = fbLog.categories || {};
    const totalBad = Object.values(catCount).reduce((s, v) => s + v, 0);
    if (totalBad >= 3) {
      const hints = [];
      if (catCount['wrong-answer'] >= 2) hints.push('CRITICAL: The answer you mark as correct MUST match your explanation. Never set answer to a choice you describe as wrong.');
      if (catCount['duplicate-choices'] >= 1) hints.push('CRITICAL: The two choices MUST be different. Never produce identical options.');
      if (catCount['off-grammar'] >= 2) hints.push('CRITICAL: The correct answer MUST contain or demonstrate the grammar rule being taught.');
      if (catCount['lang-error'] >= 1) hints.push('CRITICAL: Verify that ALL choices are grammatically correct in the target language.');
      if (catCount['answer-skew'] >= 1) hints.push('IMPORTANT: Exactly half of the 12 answers must be A and half B.');
      if (hints.length > 0) {
        promptOverrides = '\n\nFEEDBACK-DRIVEN OVERRIDES (must follow):\n' + hints.map(h => '- ' + h).join('\n');
      }
    }
  }

  for (const item of toRegen) {
    console.log(`\nRegenerating ${item.language}...`);
    const langName = LANG_MAP_INLINE[item.code] || item.code;
    const d = LEVEL_MAP[item.level];
    let levelHint = '';
    if (d) {
      const tone = d.startsWith('beginner') || d.startsWith('elementary')
        ? 'light, simple, focused on surviving daily situations'
        : d.includes('intermediate')
          ? 'natural conversations, cultural situations'
          : 'sophisticated interactions, professional contexts, humor and wordplay';
      levelHint = `\nLearner is ${d}. Tone should match — ${tone}.`;
    }

    const prompt = `You are a ${langName} language coach — NOT a textbook. Create exercises that feel like real-life situations.

The grammar rule is "${item.word}" in: "${item.sentence}"${levelHint}

IMPORTANT: Every exercise tests the SAME grammar rule — just in different situations.

12 EXERCISE TYPES — use each once:
text_dm, you_decide, fix_sign, translation_fail, culture_check, declarative, interrogative, imperative, exclamative, operative, conditional, exhortation

${promptOverrides}

OUTPUT ONLY THIS JSON (no extra text, no markdown):
IMPORTANT: Exactly 6 answers must be A and 6 must be B.
{
  "grammar": "friendly name of the grammar rule",
  "usage": "how the word works (1-2 sentences, English)",
  "example": "one ${langName} example NOT used in any exercise",
  "exercises": [
    {
      "type": "text_dm",
      "labelA": "short action label",
      "labelB": "short action label",
      "question": "Scenario in English (1-3 sentences)",
      "choices": [
        {"letter": "A", "text": "option A in ${langName}"},
        {"letter": "B", "text": "option B in ${langName}"}
      ],
      "answer": "A",
      "explanation": "Explain why and the grammar rule in 1 sentence."
    }
  ]
}`;

    const apiKey = process.env.OLLAMA_API_KEY || '';
    const model = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
    const endpoint = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://api.ollama.com';

    if (!apiKey) {
      console.error('  No API key available for regeneration');
      continue;
    }

    try {
      const resp = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          prompt,
          system: 'Output ONLY valid JSON. No extra text.',
          stream: false,
          options: { temperature: 0, num_predict: 4096 }
        }),
        signal: AbortSignal.timeout(120000)
      });
      if (!resp.ok) { console.error(`  HTTP ${resp.status}`); continue; }
      const j = await resp.json();
      const raw = j.response || '';

      // Parse and validate
      const cleaned = raw.replace(/```json\n?/g, '').replace(/\n?```/g, '').replace(/,\s*([\]}])/g, '$1');
      let parsed;
      try { parsed = JSON.parse(cleaned); } catch { console.error('  Could not parse response'); continue; }

      if (!parsed.exercises || parsed.exercises.length !== 12) {
        console.error(`  Expected 12 exercises, got ${parsed.exercises?.length}`);
        continue;
      }

      // Save back to dataset
      const existingResult = data.results.find(r => r.code === item.code);
      if (existingResult) {
        existingResult.raw = raw;
        existingResult.prompt = prompt;
        existingResult.promptSize = prompt.length;
        existingResult.feedback = {}; // Reset feedback for re-rating
        existingResult.regeneratedAt = new Date().toISOString();
        existingResult.regenerationVersion = (existingResult.regenerationVersion || 0) + 1;
        // Recalculate stats
        const types = parsed.exercises.map(e => e.type);
        const aCount = parsed.exercises.filter(e => e.answer === 'A').length;
        const bCount = parsed.exercises.filter(e => e.answer === 'B').length;
        const validTypes = ['text_dm','you_decide','fix_sign','translation_fail','culture_check','declarative','interrogative','imperative','exclamative','operative','conditional','exhortation'];
        const missingTypes = validTypes.filter(t => !types.includes(t));
        const analysis = {
          stats: {
            typeCoverage: `${types.length - new Set(types).size === 0 ? 12 : types.length}/${12}`,
            answerDistribution: { A: aCount, B: bCount, ratioA: aCount / (aCount + bCount || 1) },
            avgQuestionLen: Math.round(parsed.exercises.reduce((s, e) => s + (e.question?.length || 0), 0) / 12),
            avgExplanationLen: Math.round(parsed.exercises.reduce((s, e) => s + (e.explanation?.length || 0), 0) / 12),
            avgChoicesPerExercise: 2,
            avgLabelALen: Math.round(parsed.exercises.reduce((s, e) => s + (e.labelA?.length || 0), 0) / 12),
            avgLabelBLen: Math.round(parsed.exercises.reduce((s, e) => s + (e.labelB?.length || 0), 0) / 12),
            totalTokens: JSON.stringify(parsed.exercises).length
          },
          issues: missingTypes.length ? [{ severity: 'error', msg: `Missing types: ${missingTypes.join(',')}` }] : []
        };
        existingResult.analysis = analysis;
      }

      process.stdout.write(`  ✅ Regenerated (${raw.length} chars, A=${aCount} B=${bCount})\n`);
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }
  }

  // Save dataset with regenerations
  data.feedbackTimestamp = new Date().toISOString();
  writeFileSync(originalPath, JSON.stringify(data, null, 2));
  console.log(`\nSaved to ${originalPath}`);

  // Update feedback log
  updateFeedbackLog(data);
  console.log('\nRe-run the feedback tool to rate the regenerated exercises:');
  console.log('  node tests/grammar_feedback.mjs');
}

function updateFeedbackLog(data) {
  const fbPath = join(DATA_DIR, 'feedback_log.json');
  let log = { categories: {}, totalRatings: 0, totalGood: 0, totalBad: 0, datasets: [] };
  if (existsSync(fbPath)) log = JSON.parse(readFileSync(fbPath, 'utf8'));

  for (const res of data.results || []) {
    if (!res.feedback) continue;
    const parsed = parseResponse(res.raw);
    const exCount = parsed?.exercises?.length || 0;
    for (let i = 0; i < exCount; i++) {
      const v = res.feedback[String(i)];
      if (v === 'good' || v === 'bad') {
        log.totalRatings++;
        if (v === 'good') log.totalGood++;
        else log.totalBad++;
        const cats = res.feedback[`${i}_cats`] || [];
        for (const c of cats) log.categories[c] = (log.categories[c] || 0) + 1;
      }
    }
  }

  const dsName = data.timestamp ? data.timestamp.slice(0, 10) : 'unknown';
  if (!log.datasets.includes(dsName)) log.datasets.push(dsName);
  log.lastUpdated = new Date().toISOString();

  writeFileSync(fbPath, JSON.stringify(log, null, 2));
}

// --- Main ---
runFeedback().catch(err => { console.error('Fatal:', err); process.exit(1); });
