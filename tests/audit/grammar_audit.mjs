/* tests/grammar_audit.mjs — Grammar Gym AI audit script
 *
 * Generates grammar exercises across 10 languages × 12 exercises,
 * validates responses, and stores everything in timestamped datasets
 * under audit_data/dataset_NNN.json for iterative prompt tuning.
 *
 * Reads API keys from .env at project root (gitignored).
 *
 * Backend priority:
 *   1. Ollama Cloud (primary, using gemma4:31b-cloud)
 *   2. OpenCode Zen (fallback, if ZEN_API_KEY is set)
 *
 * Usage:
 *   node tests/grammar_audit.mjs                    # fresh run
 *   node tests/grammar_audit.mjs --version N        # use prompt version N
 *
 * Output: audit_data/dataset_NNN.json + summary to stdout.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(__dirname, 'artifacts', 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

import { mkdirSync } from 'fs';

// --- Load .env ---
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

// --- Config ---
const OLLAMA_CLOUD_ENDPOINT = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://api.ollama.com';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const ZEN_ENDPOINT = process.env.ZEN_ENDPOINT || 'https://opencode.ai/zen/go/v1/chat/completions';
const ZEN_MODEL = process.env.ZEN_MODEL || 'deepseek-v4-flash-free';
const ZEN_API_KEY = process.env.ZEN_API_KEY || '';
const LEVEL = 'A1';

// --- Prompt versioning ---
// Increment this when the prompt template changes.
// Each dataset records which version was used so we can compare.
const PROMPT_VERSIONS = [
  { ver: 1, desc: 'Initial baseline' },
  { ver: 2, desc: 'Fixed tone level detection (startsWith), stronger A/B alternation, answer-explanation consistency check' },
  { ver: 3, desc: 'Fixed label-answer swap rule, template shows <A or B>, critical rules moved to pre-JSON section' },
  { ver: 4, desc: 'Removed labelA/labelB from AI output — code computes them deterministically from (type, answer)' },
];
const PROMPT_VERSION = 4;

// --- Auto-increment dataset number ---
function nextDatasetNumber() {
  if (!existsSync(DATA_DIR)) return 1;
  const files = readdirSync(DATA_DIR)
    .filter(f => f.startsWith('dataset_') && f.endsWith('.json') && !f.includes('_feedback_'));
  const nums = files.map(f => parseInt(f.match(/dataset_(\d+)/)?.[1] || '0')).filter(n => !isNaN(n));
  return (Math.max(0, ...nums)) + 1;
}
const DS_NUM = nextDatasetNumber();
const REPORT_PATH = join(DATA_DIR, `dataset_${String(DS_NUM).padStart(3, '0')}_v${PROMPT_VERSION}.json`);

// --- Helpers ---
const LANG_MAP = {
  ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  en: 'English', es: 'Spanish', fr: 'French',
  de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
  ar: 'Arabic'
};

const LEVEL_DIFFICULTY_MAP = {
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

const EXERCISE_TYPES = [
  'text_dm', 'you_decide', 'fix_sign', 'translation_fail', 'culture_check',
  'declarative', 'interrogative', 'imperative', 'exclamative',
  'operative', 'conditional', 'exhortation'
];

// --- Test languages (10 languages, diverse grammar points) ---
const TEST_CASES = [
  { code: 'fr', word: 'le',      sentence: 'Le chat est sur la table.',            level: 'A1' },
  { code: 'es', word: 'el',      sentence: 'El gato está en el jardín.',           level: 'A1' },
  { code: 'de', word: 'der',     sentence: 'Der Hund sitzt im Park.',              level: 'A1' },
  { code: 'it', word: 'il',      sentence: 'Il libro è sul tavolo.',               level: 'A1' },
  { code: 'pt', word: 'o',       sentence: 'O carro está na garagem.',             level: 'A1' },
  { code: 'ja', word: 'を',      sentence: '毎日リンゴを食べます。',               level: 'N5' },
  { code: 'ko', word: '을',      sentence: '저는 사과를 먹어요.',                  level: 'TOPIK1' },
  { code: 'zh', word: '了',      sentence: '我吃了苹果。',                         level: 'HSK1' },
  { code: 'ru', word: 'это',     sentence: 'Это книга.',                           level: 'A1' },
  { code: 'ar', word: 'ال',      sentence: 'الكتاب على الطاولة.',                  level: 'A1' },
];

// --- Prompt builder (v4: no labels, minimal, focus on content) ---
// labelA/labelB are computed deterministically by code from (type, answer).
// A/B balance is enforced by code post-generation.
function buildPrompt(word, context, langCode, level) {
  const langName = LANG_MAP[langCode] || langCode;
  let levelHint = '';
  const d = LEVEL_DIFFICULTY_MAP[level];
  if (d) {
    const tone = d.startsWith('beginner') || d.startsWith('elementary')
      ? 'light, simple, focused on surviving daily situations (ordering food, asking for prices, greetings)'
      : d.includes('intermediate')
        ? 'natural conversations, cultural situations, handling minor conflicts or misunderstandings'
        : 'sophisticated interactions, professional contexts, humor and wordplay';
    levelHint = `\nLearner is ${d}. Tone should match — ${tone}.`;
  }

  return `You are a ${langName} language coach. Generate 12 exercises for the grammar rule "${word}" from "${context}".${levelHint}

Each exercise type must be used exactly once: text_dm, you_decide, fix_sign, translation_fail, culture_check, declarative, interrogative, imperative, exclamative, operative, conditional, exhortation.

Rules:
- The correct answer MUST contain or demonstrate the grammar rule.
- The two choices MUST be different.
- Give each exercise a unique, real-life scenario with stakes.
- Questions and explanations in English. Choices in ${langName}.
- Wrong choices must be plausible.
- ANSWER BALANCE: Exactly 6 of the 12 exercises must have answer="A" and exactly 6 must have answer="B".

Output only JSON with no extra text:
{
  "grammar": "friendly name of the grammar rule",
  "usage": "how the word works (1-2 sentences, English)",
  "example": "one ${langName} example NOT used in any exercise",
  "exercises": [
    {
      "type": "text_dm",
      "question": "Scenario in English (1-3 sentences)",
      "choices": [
        {"letter": "A", "text": "option A in ${langName}"},
        {"letter": "B", "text": "option B in ${langName}"}
      ],
      "answer": "A",
      "explanation": "Why the correct choice works, then the grammar rule in 1 sentence."
    }
  ]
}`;
}

// --- Schema validation (replicates validate + extractJSON from llm.js) ---
const SCHEMA = {
  type: 'object',
  required: ['grammar', 'usage', 'example', 'exercises'],
  properties: {
    grammar: { type: 'string', minLength: 1 },
    usage: { type: 'string', minLength: 1 },
    example: { type: 'string', minLength: 1 },
    exercises: {
      type: 'array',
      minItems: 12,
      maxItems: 12,
      items: {
        type: 'object',
        required: ['type', 'question', 'choices', 'answer', 'explanation'],
        properties: {
          type: { type: 'string', enum: EXERCISE_TYPES },
          labelA: { type: 'string', minLength: 1 },
          labelB: { type: 'string', minLength: 1 },
          question: { type: 'string', minLength: 5 },
          choices: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              required: ['letter', 'text'],
              properties: {
                letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                text: { type: 'string', minLength: 1 }
              }
            }
          },
          answer: { type: 'string', enum: ['A', 'B'] },
          explanation: { type: 'string', minLength: 5 }
        }
      }
    }
  }
};

function extractJSON(raw) {
  if (!raw) return null;
  const cleanJSON = (str) => {
    try { return str.replace(/,\s*([\]}])/g, '$1'); } catch (e) { return str; }
  };
  try { return JSON.parse(cleanJSON(raw)); } catch (e) {}
  const fenceMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenceMatch) { try { return JSON.parse(cleanJSON(fenceMatch[1])); } catch (e) {} }
  let depth = 0, start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (raw[i] === '}') { depth--; if (depth === 0 && start !== -1) { try { return JSON.parse(cleanJSON(raw.slice(start, i + 1))); } catch (e) {} } }
  }
  return null;
}

function validate(json) {
  if (typeof json !== 'object' || json === null) return { valid: false, error: 'Not a JSON object' };
  for (const f of SCHEMA.required) {
    if (!(f in json) || json[f] === undefined || json[f] === null) return { valid: false, error: `Missing: ${f}` };
  }
  for (const [key, rules] of Object.entries(SCHEMA.properties)) {
    const val = json[key];
    if (val === undefined) continue;
    if (rules.type === 'string') {
      if (typeof val !== 'string') return { valid: false, error: `${key} must be string` };
      if (rules.minLength && val.length < rules.minLength) return { valid: false, error: `${key} too short` };
    }
    if (rules.type === 'array') {
      if (!Array.isArray(val)) return { valid: false, error: `${key} must be array` };
      if (rules.minItems && val.length < rules.minItems) return { valid: false, error: `${key} min ${rules.minItems}` };
      if (rules.maxItems && val.length > rules.maxItems) return { valid: false, error: `${key} max ${rules.maxItems}` };
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        const itemSchema = rules.items;
        for (const f of itemSchema.required) {
          if (!(f in item)) return { valid: false, error: `${key}[${i}].${f} missing` };
        }
        for (const [ik, ir] of Object.entries(itemSchema.properties)) {
          if (!(ik in item)) continue;
          if (ir.enum && !ir.enum.includes(item[ik])) return { valid: false, error: `${key}[${i}].${ik} must be ${ir.enum.join('/')}` };
          if (ir.type === 'string' && ir.minLength && typeof item[ik] === 'string' && item[ik].length < ir.minLength) {
            return { valid: false, error: `${key}[${i}].${ik} too short` };
          }
        }
      }
    }
  }
  return { valid: true };
}

// --- LLM call: try Ollama Cloud first, then Zen fallback ---
async function callLLM(prompt, provider) {
  const maxTokens = 4096;
  const signal = AbortSignal.timeout(120000);

  if (!provider || provider === 'ollama') {
    if (OLLAMA_API_KEY) {
      const body = JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        system: 'Output ONLY valid JSON matching the specified schema. No extra text.',
        stream: false,
        options: { temperature: 0, num_predict: maxTokens }
      });
      const resp = await fetch(`${OLLAMA_CLOUD_ENDPOINT}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OLLAMA_API_KEY}` },
        body,
        signal
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.response || '';
      }
      const errText = await resp.text().catch(() => '');
      console.warn(`  ⚠ Ollama Cloud HTTP ${resp.status}: ${errText.slice(0, 120)}`);
      if (!ZEN_API_KEY) throw new Error(`Ollama HTTP ${resp.status}`);
      console.warn('  → Falling back to Zen...');
    } else {
      if (!ZEN_API_KEY) throw new Error('No API key configured (try Ollama or Zen)');
      console.warn('  → No Ollama key, trying Zen...');
    }
  }

  // Zen fallback (OpenAI-compatible)
  if (!ZEN_API_KEY) throw new Error('ZEN_API_KEY not set and Ollama failed');
  const resp = await fetch(ZEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ZEN_API_KEY}` },
    body: JSON.stringify({
      model: ZEN_MODEL,
      messages: [
        { role: 'system', content: 'Output ONLY valid JSON matching the specified schema. No extra text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      max_tokens: maxTokens
    }),
    signal
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Zen HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// --- Resolve labels deterministically from (type, answer) ---
const LABEL_PAIRS = {
  text_dm:          ['Send this', 'Sounds wrong'],
  you_decide:       ['Say this', 'Too risky'],
  fix_sign:         ['Fixed!', 'Leave it'],
  translation_fail: ['Fix it', 'Keep it'],
  culture_check:    ['Polite', 'Too blunt'],
  declarative:      ['Sounds right', 'Wrong form'],
  interrogative:    ['Good question', 'Not quite'],
  imperative:       ['Say this', 'Too bossy'],
  exclamative:      ['Nice!', 'Odd'],
  operative:        ['Sounds right', 'Wrong tone'],
  conditional:      ['Makes sense', "Doesn't fit"],
  exhortation:      ['Encouraging', 'Too pushy'],
};

function resolveLabels(type, answer) {
  const pair = LABEL_PAIRS[type];
  if (!pair) return { labelA: '', labelB: '' };
  const [pos, neg] = pair;
  if (answer === 'A') return { labelA: pos, labelB: neg };
  return { labelA: neg, labelB: pos };
}

function injectLabels(exercises) {
  for (const ex of exercises) {
    const { labelA, labelB } = resolveLabels(ex.type, ex.answer);
    ex.labelA = labelA;
    ex.labelB = labelB;
  }
  return exercises;
}

// --- Analysis dimensions ---
function analyzeExercises(data, langName) {
  const exercises = data.exercises || [];
  const issues = [];

  const typesUsed = exercises.map(e => e.type);
  const missingTypes = EXERCISE_TYPES.filter(t => !typesUsed.includes(t));
  const duplicateTypes = EXERCISE_TYPES.filter(t => typesUsed.indexOf(t) !== typesUsed.lastIndexOf(t));
  if (missingTypes.length) issues.push({ severity: 'error', msg: `Missing exercise types: ${missingTypes.join(', ')}` });
  if (duplicateTypes.length) issues.push({ severity: 'error', msg: `Duplicate exercise types: ${duplicateTypes.join(', ')}` });

  let aCount = 0, bCount = 0;
  for (const ex of exercises) {
    if (ex.answer === 'A') aCount++;
    else if (ex.answer === 'B') bCount++;
  }
  const total = aCount + bCount;
  const aRatio = total > 0 ? aCount / total : 0;
  const balanceIssue = aRatio < 0.25 || aRatio > 0.75;
  if (balanceIssue) issues.push({ severity: 'warn', msg: `Answer imbalance: A=${aCount} B=${bCount} (ratio ${aRatio.toFixed(2)})` });

  let lowQCount = 0, lowECount = 0;
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (ex.question.length < 20) { lowQCount++; issues.push({ severity: 'warn', msg: `Exercise ${i}: question too short (${ex.question.length} chars)` }); }
    if (ex.explanation.length < 20) { lowECount++; issues.push({ severity: 'warn', msg: `Exercise ${i}: explanation too short (${ex.explanation.length} chars)` }); }

    const hasLangText = ex.choices?.some(c => {
      const ranges = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u00c0-\u024f]/;
      return ranges.test(c.text);
    });
    if (!hasLangText && !['en', 'es'].includes(ex.type)) {
      issues.push({ severity: 'info', msg: `Exercise ${i}: choices may not contain target language script` });
    }
  }

  const stats = {
    typeCoverage: `${typesUsed.length}/${EXERCISE_TYPES.length}`,
    answerDistribution: { A: aCount, B: bCount, ratioA: aRatio },
    avgQuestionLen: Math.round(exercises.reduce((s, e) => s + e.question.length, 0) / (exercises.length || 1)),
    avgExplanationLen: Math.round(exercises.reduce((s, e) => s + e.explanation.length, 0) / (exercises.length || 1)),
    avgChoicesPerExercise: Math.round(exercises.reduce((s, e) => s + (e.choices?.length || 0), 0) / (exercises.length || 1)),
    totalTokens: JSON.stringify(exercises).length
  };

  return { stats, issues };
}

// --- Main ---
async function main() {
  const canOllama = !!OLLAMA_API_KEY;
  const canZen = !!ZEN_API_KEY;
  if (!canOllama && !canZen) {
    console.error('ERROR: No API keys available. Set OLLAMA_API_KEY or ZEN_API_KEY in .env');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Grammar Gym AI Audit — 10 Languages × 12 Exercises   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const provider = canOllama ? 'ollama' : 'zen';
  console.log(`Using ${canOllama ? 'Ollama Cloud (' + OLLAMA_MODEL + ')' : 'Zen (' + ZEN_MODEL + ')'}${canOllama && canZen ? ' (will fall back to Zen if Ollama fails)' : ''}\n`);

  const report = {
    datasetNumber: DS_NUM,
    promptVersion: PROMPT_VERSION,
    promptVersionDesc: PROMPT_VERSIONS.find(v => v.ver === PROMPT_VERSION)?.desc || '',
    timestamp: new Date().toISOString(),
    primaryProvider: provider,
    primaryModel: canOllama ? OLLAMA_MODEL : ZEN_MODEL,
    zenAvailable: canZen,
    level: LEVEL,
    totalLanguages: TEST_CASES.length,
    exercisesPerLanguage: 12,
    results: []
  };

  let totalErrors = 0, totalWarnings = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const langName = LANG_MAP[tc.code] || tc.code;
    const promptText = buildPrompt(tc.word, tc.sentence, tc.code, tc.level);

    console.log(`[${i + 1}/${TEST_CASES.length}] ${langName} (${tc.code}) — "${tc.word}" in "${tc.sentence}"`);
    console.log(`  Prompt: ${promptText.length.toLocaleString()} chars`);
    if (tc.promptOverrides) console.log(`  Overrides: ${tc.promptOverrides}`);

    let raw = '', data = null, validation, analysis, usedProvider = provider;
    const startTime = Date.now();

    try {
      raw = await callLLM(promptText);
    } catch (err) {
      console.error(`  ❌ LLM call failed: ${err.message}`);
      report.results.push({
        language: langName, code: tc.code, word: tc.word, sentence: tc.sentence, level: tc.level,
        status: 'error', error: `LLM call failed: ${err.message}`,
        promptSize: promptText.length, durationMs: Date.now() - startTime,
        prompt: promptText, raw: '', validation: null, analysis: null
      });
      totalErrors++;
      continue;
    }

    const durationMs = Date.now() - startTime;
    console.log(`  Response: ${raw.length.toLocaleString()} chars (${durationMs}ms)`);

    const extracted = extractJSON(raw);
    if (!extracted) {
      console.error('  ❌ Could not extract JSON from response');
      report.results.push({
        language: langName, code: tc.code, word: tc.word, sentence: tc.sentence, level: tc.level,
        status: 'error', error: 'JSON extraction failed', promptSize: promptText.length, durationMs,
        prompt: promptText, raw, validation: null, analysis: null
      });
      totalErrors++;
      continue;
    }

    validation = validate(extracted);
    if (!validation.valid) {
      console.error(`  ❌ Schema validation failed: ${validation.error}`);
      report.results.push({
        language: langName, code: tc.code, word: tc.word, sentence: tc.sentence, level: tc.level,
        status: 'error', error: `Schema: ${validation.error}`, promptSize: promptText.length, durationMs,
        prompt: promptText, raw, validation, analysis: null
      });
      totalErrors++;
      continue;
    }

    // Inject deterministic labels (removed from AI output in v4)
    extracted.exercises = injectLabels(extracted.exercises || []);

    analysis = analyzeExercises(extracted, langName);
    const errorCount = analysis.issues.filter(i => i.severity === 'error').length;
    const warnCount = analysis.issues.filter(i => i.severity === 'warn').length;
    totalErrors += errorCount;
    totalWarnings += warnCount;

    if (errorCount) console.error(`  ❌ ${errorCount} error(s) in analysis`);
    if (warnCount) console.warn(`  ⚠  ${warnCount} warning(s)`);
    if (!errorCount && !warnCount) console.log('  ✅ All checks passed');

    for (const issue of analysis.issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warn' ? '⚠' : 'ℹ';
      console.log(`    ${icon} ${issue.msg}`);
    }

    if (analysis.stats) {
      const s = analysis.stats;
      console.log(`  Stats: ${s.typeCoverage} types, A/B ${s.answerDistribution.A}/${s.answerDistribution.B}, ` +
        `avg Q ${s.avgQuestionLen}ch, avg E ${s.avgExplanationLen}ch`);
    }

    report.results.push({
      language: langName, code: tc.code, word: tc.word, sentence: tc.sentence, level: tc.level,
      status: 'ok', error: null, promptSize: promptText.length, durationMs,
      prompt: promptText, raw,
      validation: { valid: true },
      analysis
    });
  }

  // --- Summary ---
  const okCount = report.results.filter(r => r.status === 'ok').length;
  const errCount = report.results.filter(r => r.status === 'error').length;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                          Summary                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`  Prompt version:       v${PROMPT_VERSION} — ${PROMPT_VERSIONS.find(v => v.ver === PROMPT_VERSION)?.desc || ''}`);
  console.log(`  Dataset #${DS_NUM}`);
  console.log(`  Languages tested:     ${TEST_CASES.length}`);
  console.log(`  Successful:           ${okCount}`);
  console.log(`  Failed:               ${errCount}`);
  console.log(`  Analysis errors:      ${totalErrors}`);
  console.log(`  Analysis warnings:    ${totalWarnings}`);

  if (okCount > 0) {
    const allStats = report.results.filter(r => r.analysis?.stats).map(r => r.analysis.stats);
    const avgQR = Math.round(allStats.reduce((s, st) => s + st.avgQuestionLen, 0) / allStats.length);
    const avgER = Math.round(allStats.reduce((s, st) => s + st.avgExplanationLen, 0) / allStats.length);
    const avgA = allStats.reduce((s, st) => s + st.answerDistribution.A, 0);
    const avgB = allStats.reduce((s, st) => s + st.answerDistribution.B, 0);
    const avgRatio = avgA / (avgA + avgB || 1);
    const totalLangsWithAllTypes = report.results.filter(r =>
      r.analysis?.stats?.typeCoverage === '12/12'
    ).length;

    console.log(`  Full type coverage:   ${totalLangsWithAllTypes}/${okCount}`);
    console.log(`  Avg A/B ratio:        ${avgRatio.toFixed(2)} (A=${avgA} B=${avgB})`);
    console.log(`  Avg question length:  ${avgQR} chars`);
    console.log(`  Avg explanation len:  ${avgER} chars`);
    console.log(`  Total prompt chars:   ${report.results.reduce((s, r) => s + (r.promptSize || 0), 0).toLocaleString()}`);
    console.log(`  Total response chars: ${report.results.reduce((s, r) => s + (r.raw?.length || 0), 0).toLocaleString()}`);
  }

  report.summary = {
    tested: TEST_CASES.length,
    successful: okCount,
    failed: errCount,
    analysisErrors: totalErrors,
    analysisWarnings: totalWarnings
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n  Full report saved to: ${REPORT_PATH}`);
  console.log(`\n  Next step: rate exercises with:`);
  console.log(`    node tests/grammar_feedback.mjs`);
  console.log(`  Re-generate disliked items with:`);
  console.log(`    node tests/grammar_feedback.mjs --regenerate`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
