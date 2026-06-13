// scripts/pregenerate-grammar.js
// Pre-generates Grammar Gym exercises for all vocab words and saves to RTDB.
//
// Usage:
//   cd scripts && npm install   (first time)
//   node pregenerate-grammar.js [--dry-run] [--lang ja] [--limit 10] [--skip-existing] [--ollama http://127.0.0.1:11434] [--model gemma4:31b-cloud] [--service-account ../vocabmaster112225-1e8a10d5f0a9.json]
//
// For each vocab item, calls Ollama to generate 12 grammar exercises
// (matching the live app's prompt/schema), validates the response,
// and writes to grammar_exercises/{vocabId}/{langCode}/{token} in RTDB.
//
// By default skips words that already have cached exercises.
// Uses Firebase Admin SDK to bypass security rules.

const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const fs = require("fs");
const path = require("path");

// ── Parse args ──

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const langIdx = args.indexOf("--lang");
const onlyLang = langIdx !== -1 ? args[langIdx + 1] : null;
const skipExisting = args.includes("--skip-existing");
const ollamaIdx = args.indexOf("--ollama");
const ollamaEndpoint = ollamaIdx !== -1 ? args[ollamaIdx + 1] : "http://127.0.0.1:11434";
const modelIdx = args.indexOf("--model");
const model = modelIdx !== -1 ? args[modelIdx + 1] : "gemma4:31b-cloud";
const saFlagIdx = args.indexOf("--service-account");
const serviceAccountPath = saFlagIdx !== -1 ? args[saFlagIdx + 1] : null;
const vocabIdx = args.indexOf("--vocab-id");
const onlyVocabId = vocabIdx !== -1 ? parseInt(args[vocabIdx + 1], 10) : null;

const LANG_NAMES = {
    ja: "Japanese", ko: "Korean", en: "English", zh: "Chinese",
    es: "Spanish", pt: "Portuguese", it: "Italian", fr: "French",
    de: "German", ru: "Russian"
};

const LEVEL_HINTS = {
    N5: "beginner", N4: "beginner",
    N3: "intermediate", N2: "intermediate",
    A1: "beginner", A2: "beginner",
    A3: "intermediate", A4: "intermediate", A5: "intermediate"
};

function getLevelHint(level) {
    if (!level) return "";
    const tone = LEVEL_HINTS[level] || "intermediate";
    const text = tone.startsWith("beginner")
        ? "light, simple, focused on surviving daily situations (ordering food, asking for prices, greetings)"
        : "natural conversations, cultural situations, handling minor conflicts or misunderstandings";
    return `\nLearner is ${tone}. Tone should match — ${text}.`;
}

function buildPrompt(word, context, langCode, level) {
    const langName = LANG_NAMES[langCode] || langCode;
    const levelHint = getLevelHint(level);
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

function extractJson(text) {
    if (!text) return null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
        return null;
    }
}

function validate(data) {
    if (!data || typeof data !== "object") return "Not an object";
    if (!data.grammar || data.grammar.length < 1) return "Missing grammar";
    if (!data.usage || data.usage.length < 1) return "Missing usage";
    if (!data.example || data.example.length < 1) return "Missing example";
    if (!Array.isArray(data.exercises) || data.exercises.length !== 12) return `Expected 12 exercises, got ${data.exercises?.length}`;
    const validTypes = ['text_dm', 'you_decide', 'fix_sign', 'translation_fail', 'culture_check', 'declarative', 'interrogative', 'imperative', 'exclamative', 'operative', 'conditional', 'exhortation'];
    for (let i = 0; i < data.exercises.length; i++) {
        const ex = data.exercises[i];
        if (!validTypes.includes(ex.type)) return `Exercise ${i}: invalid type "${ex.type}"`;
        if (!ex.question || ex.question.length < 5) return `Exercise ${i}: short question`;
        if (!Array.isArray(ex.choices) || ex.choices.length < 2) return `Exercise ${i}: too few choices`;
        if (!ex.answer || !['A', 'B'].includes(ex.answer)) return `Exercise ${i}: invalid answer "${ex.answer}"`;
        if (!ex.explanation) return `Exercise ${i}: missing explanation`;
    }
    const aCount = data.exercises.filter(e => e.answer === 'A').length;
    const bCount = data.exercises.filter(e => e.answer === 'B').length;
    if (aCount !== 6 || bCount !== 6) return `Answer balance off: ${aCount}A/${bCount}B (expected 6/6)`;
    return null;
}

async function callOllama(prompt, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const resp = await fetch(`${ollamaEndpoint}/api/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false,
                    options: { temperature: 0, num_predict: 2048 }
                }),
                signal: AbortSignal.timeout(90000)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            return data.response || "";
        } catch (e) {
            if (attempt === retries) throw e;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

function resolveLanguages(item) {
    const langs = [];
    for (const key of Object.keys(item)) {
        if (LANG_NAMES[key] && typeof item[key] === "string" && item[key].length > 0) {
            langs.push(key);
        }
    }
    return langs;
}

function getLevel(item) {
    if (Array.isArray(item.tags)) {
        const lvl = item.tags.find(t => ['N5','N4','N3','N2','N1','A1','A2','B1','B2','C1'].includes(t));
        if (lvl) return lvl;
    }
    return item.level || "";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Initialize Firebase Admin ──

let adminApp;
try {
    if (serviceAccountPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), "utf-8"));
        adminApp = initializeApp({ credential: cert(serviceAccount), databaseURL: "https://vocabmaster112225-default-rtdb.firebaseio.com" });
    } else {
        adminApp = initializeApp({ credential: applicationDefault(), databaseURL: "https://vocabmaster112225-default-rtdb.firebaseio.com" });
    }
} catch (e) {
    console.error("ERROR: Firebase Admin SDK requires credentials.");
    console.error("Usage: node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json");
    console.error("Or set GOOGLE_APPLICATION_CREDENTIALS env var.");
    process.exit(1);
}
const db = getDatabase(adminApp);

// ── Main ──

(async () => {
    console.log(`=== Grammar Gym Pre-Generator ===`);
    console.log(`Ollama: ${ollamaEndpoint}`);
    console.log(`Model: ${model}`);
    console.log(`Skip existing: ${skipExisting}`);
    console.log(`Dry run: ${dryRun}`);
    if (onlyLang) console.log(`Language filter: ${onlyLang}`);
    if (limit) console.log(`Limit: ${limit}`);
    if (onlyVocabId) console.log(`Vocab ID: ${onlyVocabId}`);
    console.log("");

    // Check Ollama is reachable
    try {
        const tagsResp = await fetch(`${ollamaEndpoint}/api/tags`);
        if (!tagsResp.ok) throw new Error(`HTTP ${tagsResp.status}`);
        const tags = await tagsResp.json();
        const modelNames = (tags.models || []).map(m => m.name);
        console.log(`Ollama reachable. ${modelNames.length} models: ${modelNames.slice(0, 5).join(", ")}...`);
        if (!modelNames.includes(model) && !model.endsWith('-cloud')) {
            console.warn(`WARNING: model "${model}" not in /api/tags. Will still try.`);
        }
    } catch (e) {
        console.error(`ERROR: Cannot reach Ollama at ${ollamaEndpoint}: ${e.message}`);
        process.exit(1);
    }

    // Fetch all vocab
    const vocabSnap = await db.ref("/vocab").once("value");
    if (!vocabSnap.exists()) {
        console.error("ERROR: No vocab found at /vocab in RTDB.");
        process.exit(1);
    }
    const vocab = vocabSnap.val();
    const vocabIds = Object.keys(vocab).sort((a, b) => parseInt(a) - parseInt(b));
    console.log(`Found ${vocabIds.length} vocab items.`);

    // Check what's already cached
    const cacheSnap = await db.ref("/grammar_exercises").once("value");
    const existing = {};
    if (cacheSnap.exists()) {
        cacheSnap.forEach(child => {
            const vid = child.key;
            const langs = child.val() || {};
            existing[vid] = Object.keys(langs);
        });
    }
    const existingCount = Object.values(existing).reduce((sum, langs) => sum + langs.length, 0);
    console.log(`Existing cached exercises: ${existingCount}`);

    let processed = 0, generated = 0, skipped = 0, failed = 0;

    for (const vid of vocabIds) {
        if (limit && processed >= limit) break;
        if (onlyVocabId && parseInt(vid) !== onlyVocabId) continue;

        const item = vocab[vid];
        const langs = resolveLanguages(item);
        const langsToProcess = onlyLang ? langs.filter(l => l === onlyLang) : langs;
        if (langsToProcess.length === 0) continue;

        const word = item[langsToProcess[0]] || item.ja || item.en;
        const level = getLevel(item);

        for (const langCode of langsToProcess) {
            const langWord = item[langCode] || word;
            const contextKey = `${langCode}_ex`;
            const context = item[contextKey] || "";

            if (skipExisting && existing[vid] && existing[vid].includes(langCode)) {
                skipped++;
                processed++;
                continue;
            }

            console.log(`[${vid}/${langCode}] Generating for: ${langWord} (${level || "no level"})`);
            const prompt = buildPrompt(langWord, context, langCode, level);

            try {
                const raw = await callOllama(prompt);
                const json = extractJson(raw);
                if (!json) {
                    console.log(`  ❌ Failed: could not extract JSON (raw length: ${raw.length})`);
                    failed++;
                    continue;
                }
                const err = validate(json);
                if (err) {
                    console.log(`  ❌ Validation failed: ${err}`);
                    failed++;
                    continue;
                }

                const token = Math.random().toString(36).slice(2, 8);
                const entry = {
                    grammar: json.grammar,
                    usage: json.usage,
                    example: json.example,
                    exercises: json.exercises,
                    model,
                    ts: Date.now()
                };

                if (dryRun) {
                    console.log(`  ✅ [DRY RUN] Would save to grammar_exercises/${vid}/${langCode}/${token}`);
                    generated++;
                } else {
                    await db.ref(`grammar_exercises/${vid}/${langCode}/${token}`).set(entry);
                    console.log(`  ✅ Saved to grammar_exercises/${vid}/${langCode}/${token} (grammar: "${entry.grammar.substring(0, 40)}...")`);
                    generated++;
                }
            } catch (e) {
                console.log(`  ❌ Error: ${e.message}`);
                failed++;
            }

            processed++;
            await sleep(500);
        }
    }

    console.log("");
    console.log(`=== Done ===`);
    console.log(`Processed: ${processed}`);
    console.log(`Generated: ${generated}`);
    console.log(`Skipped (existing): ${skipped}`);
    console.log(`Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
    console.error("FATAL:", e);
    process.exit(1);
});
