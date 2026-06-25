// scripts/pregenerate-grammar.js
// Pre-generates Grammar Gym exercises for all vocab words and saves to RTDB.
//
// Usage:
//   node pregenerate-grammar.js [options]
//
// Options:
//   --dry-run              Preview only, no writes
//   --lang ja              Only process one language (ja, ko, en, zh, es, etc.)
//   --limit 10             Only process N vocab items
//   --skip-existing        Skip items that already have cached exercises
//   --ollama URL           Ollama endpoint (default: http://127.0.0.1:11434)
//   --model NAME           Model name (default: gemma4:31b-cloud)
//   --cloud                Use cloud proxy (sets --ollama + --model automatically)
//   --vocab-id 123         Only process a single vocab ID
//   --vocab-range 0-100    Only process vocab IDs in the given range (inclusive)
//   --explain-lang ko      Language for questions/explanations (default: en)
//   --service-account PATH Firebase Admin SDK service account JSON
//
// Auth: If --service-account is given, uses Firebase Admin SDK.
//       Otherwise, uses Firebase Auth REST API (anonymous sign-in) + RTDB REST API.
//       No credentials file needed when using REST API.
//
// Matching the live app (llm_roles.js + llm_prompts.js):
//   - Same prompt format as buildGrammarExercisePrompt()
//   - Same schema validation as grammarExercise in llm_schemas.js
//   - Same labelA/labelB computation via resolveLabels()
//   - Same RTDB path: grammar_exercises/{vocabId}/{langCode}/{explainLang}/{token}

const fs = require("fs");
const path = require("path");

// ── Firebase Config (from firebase.js) ──
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCZlILO3UNqPUbyZ0C2NGgyZQugzaSU5Kg",
    databaseURL: "https://vocabmaster112225-default-rtdb.firebaseio.com"
};

// ── Parse args ──

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limitVal = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const langIdx = args.indexOf("--lang");
const onlyLang = langIdx !== -1 ? args[langIdx + 1] : null;
const skipExisting = args.includes("--skip-existing");
const useCloud = args.includes("--cloud");
const ollamaIdx = args.indexOf("--ollama");
const ollamaEndpoint = useCloud
    ? "https://ollama-proxy-1020976660084.us-central1.run.app"
    : (ollamaIdx !== -1 ? args[ollamaIdx + 1] : "http://127.0.0.1:11434");
const modelIdx = args.indexOf("--model");
const model = useCloud
    ? "gemma4:31b-cloud"
    : (modelIdx !== -1 ? args[modelIdx + 1] : "gemma4:31b-cloud");
const saFlagIdx = args.indexOf("--service-account");
const serviceAccountPath = saFlagIdx !== -1 ? args[saFlagIdx + 1] : null;
const vocabIdx = args.indexOf("--vocab-id");
const onlyVocabId = vocabIdx !== -1 ? parseInt(args[vocabIdx + 1], 10) : null;
const rangeIdx = args.indexOf("--vocab-range");
const vocabRange = rangeIdx !== -1 ? args[rangeIdx + 1].split('-').map(Number) : null;
const explainIdx = args.indexOf("--explain-lang");
const explainLang = explainIdx !== -1 ? args[explainIdx + 1] : "en";

// ── Constants (mirroring live app) ──

const LANG_NAMES = {
    ja: "Japanese", ko: "Korean", en: "English", zh: "Chinese",
    es: "Spanish", pt: "Portuguese", it: "Italian", fr: "French",
    de: "German", ru: "Russian"
};

const LEVEL_DIFFICULTY_MAP = {
    'N5': 'beginner (N5)', 'N4': 'advanced beginner (N4)', 'N3': 'intermediate (N3)',
    'N2': 'upper intermediate (N2)', 'N1': 'advanced (N1)',
    'HSK1': 'beginner (HSK 1)', 'HSK2': 'advanced beginner (HSK 2)', 'HSK3': 'intermediate (HSK 3)',
    'HSK4': 'upper intermediate (HSK 4)', 'HSK5': 'advanced (HSK 5)', 'HSK6': 'proficient (HSK 6)',
    'TOPIK1': 'beginner (TOPIK 1)', 'TOPIK2': 'advanced beginner (TOPIK 2)', 'TOPIK3': 'intermediate (TOPIK 3)',
    'TOPIK4': 'upper intermediate (TOPIK 4)', 'TOPIK5': 'advanced (TOPIK 5)', 'TOPIK6': 'proficient (TOPIK 6)',
    'A1': 'beginner (A1)', 'A2': 'elementary (A2)', 'B1': 'intermediate (B1)',
    'B2': 'upper intermediate (B2)', 'C1': 'advanced (C1)', 'C2': 'proficient (C2)'
};

const GRAMMAR_LABEL_PAIRS = {
    text_dm: ['Send this', 'Sounds wrong'],
    you_decide: ['Say this', 'Too risky'],
    fix_sign: ['Fixed!', 'Leave it'],
    translation_fail: ['Fix it', 'Keep it'],
    culture_check: ['Polite', 'Too blunt'],
    declarative: ['Sounds right', 'Wrong form'],
    interrogative: ['Good question', 'Not quite'],
    imperative: ['Say this', 'Too bossy'],
    exclamative: ['Nice!', 'Odd'],
    operative: ['Sounds right', 'Wrong tone'],
    conditional: ['Makes sense', "Doesn't fit"],
    exhortation: ['Encouraging', 'Too pushy']
};

const ALL_TYPES = Object.keys(GRAMMAR_LABEL_PAIRS);

function resolveLabels(type, answer) {
    var pair = GRAMMAR_LABEL_PAIRS[type];
    if (!pair) return { labelA: '', labelB: '' };
    return answer === 'A'
        ? { labelA: pair[0], labelB: pair[1] }
        : { labelA: pair[1], labelB: pair[0] };
}

function getLevelHint(item) {
    if (!item) return '';
    var tags = item.tags || [];
    var level = tags.find(function(t) { return LEVEL_DIFFICULTY_MAP[t]; }) || '';
    if (!level && item.level) level = item.level;
    return level ? ('\nLearner level: ' + (LEVEL_DIFFICULTY_MAP[level] || level) + '.') : '';
}

// ── Prompt builder (mirrors llm_prompts.js buildGrammarExercisePrompt) ──

function buildPrompt(word, context, langCode, level, knownLang) {
    const langName = LANG_NAMES[langCode] || langCode;
    const knownLangName = LANG_NAMES[knownLang] || knownLang;
    const levelHint = getLevelHint(level);
    return 'You are a ' + langName + ' language coach. Generate 6-12 exercises (aim for 8) for the grammar rule "' + word + '" from "' + context + '".' + levelHint + '\n\nUse each type at most once: ' + ALL_TYPES.join(', ') + '.\n\nRules:\n- Correct answer MUST contain or demonstrate the grammar rule.\n- Wrong choices must be plausible.\n\nOutput JSON: { "grammar": "rule name", "usage": "how it works (1-2 sentences in ' + knownLangName + ')", "example": "one ' + langName + ' example", "exercises": [{ "type": "...", "question": "scenario in ' + knownLangName + '", "choices": [{"letter":"A","text":"option in ' + langName + '"},{"letter":"B","text":"option in ' + langName + '"}], "answer": "A", "explanation": "why correct in ' + knownLangName + '" }] }';
}

// ── JSON extraction (mirrors llm_validator.js extractJSON) ──

function extractJson(text) {
    if (!text) return null;
    // Strategy 1: strip markdown code fences (```json ... ``` or ``` ... ```)
    var fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1]);
        } catch (e) { /* fall through */ }
    }
    // Strategy 2: direct parse
    try {
        return JSON.parse(text);
    } catch (e) { /* fall through */ }
    // Strategy 3: find brace pair
    var start = text.indexOf('{');
    if (start === -1) return null;
    var depth = 0;
    var end = -1;
    for (var i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return null;
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch (e) { return null; }
}

// ── Progressive validation (laxes choice limit on retry) ──

// Normalize exercise type names the model often writes without underscores
function normalizeType(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    // Common model errors: "youdecide" → "you_decide", "textdm" → "text_dm"
    var fixed = raw
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase();
    // Check if any ALL_TYPES prefix-matches
    for (var t = 0; t < ALL_TYPES.length; t++) {
        if (ALL_TYPES[t].replace(/_/g, '') === fixed.replace(/_/g, '')) {
            return ALL_TYPES[t]; // return the correct form
        }
    }
    return fixed;
}

function validate(data, choiceLimit) {
    if (choiceLimit === undefined) choiceLimit = 5;
    var validLetters = ['A', 'B', 'C', 'D'].slice(0, choiceLimit);
    if (!data || typeof data !== 'object') return 'Not an object';
    if (!data.grammar || typeof data.grammar !== 'string' || data.grammar.length < 1) return 'Missing/invalid grammar';
    if (!data.usage || typeof data.usage !== 'string' || data.usage.length < 1) return 'Missing/invalid usage';
    if (!data.example || typeof data.example !== 'string' || data.example.length < 1) return 'Missing/invalid example';
    if (!Array.isArray(data.exercises) || data.exercises.length < 6 || data.exercises.length > 12)
        return 'exercises must be 6-12 items, got ' + (data.exercises ? data.exercises.length : 'none');
    for (var i = 0; i < data.exercises.length; i++) {
        var ex = data.exercises[i];
        if (!ex || typeof ex !== 'object') return 'Exercise ' + i + ': not an object';
        // Normalize type: "youdecide" → "you_decide", "textdm" → "text_dm"
        if (ex.type) ex.type = normalizeType(ex.type);
        if (!ex.type || ALL_TYPES.indexOf(ex.type) === -1) return 'Exercise ' + i + ': invalid type "' + ex.type + '"';
        if (!ex.question || typeof ex.question !== 'string' || ex.question.length < 5) return 'Exercise ' + i + ': question too short';
        if (!Array.isArray(ex.choices) || ex.choices.length < 2) return 'Exercise ' + i + ': need 2 choices';
        // Filter out malformed choices (missing letter or text)
        var validChoices = ex.choices.filter(function(ch) { return ch && ch.letter && ch.text; });
        if (validChoices.length < 2) return 'Exercise ' + i + ': need 2 valid choices';
        // Remap answer: find the original letter's position among valid choices
        var origAnswer = ex.answer;
        var answerIdx = -1;
        for (var vc = 0; vc < validChoices.length; vc++) {
            if (validChoices[vc].letter === origAnswer) { answerIdx = vc; break; }
        }
        if (answerIdx === -1) return 'Exercise ' + i + ': answer "' + origAnswer + '" not in valid choices';
        // Re-letter choices sequentially
        for (var j = 0; j < validChoices.length; j++) {
            validChoices[j].letter = String.fromCharCode(65 + j);
        }
        ex.choices = validChoices;
        ex.answer = String.fromCharCode(65 + answerIdx);
        if (!ex.answer || validLetters.indexOf(ex.answer) === -1) return 'Exercise ' + i + ': invalid answer "' + ex.answer + '" (limit ' + choiceLimit + ')';
        if (!ex.explanation || typeof ex.explanation !== 'string' || ex.explanation.length < 5) return 'Exercise ' + i + ': explanation too short';
    }
    return null; // valid
}

// ── Ollama call ──

async function callOllama(prompt, retries) {
    retries = retries || (useCloud ? 1 : 2);
    var body = {
        model: model,
        prompt: prompt,
        stream: false,
        options: { temperature: 0, num_predict: 2048 }
    };
    for (var attempt = 0; attempt <= retries; attempt++) {
        try {
            var url = ollamaEndpoint;
            var fetchOpts = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(useCloud ? 60000 : 90000)
            };
            if (useCloud) {
                // Cloud proxy wraps payload in { path, method, headers, body }
                fetchOpts.body = JSON.stringify({
                    path: '/api/generate',
                    method: 'POST',
                    headers: {},
                    body: body
                });
            } else {
                url = ollamaEndpoint + '/api/generate';
                fetchOpts.body = JSON.stringify(body);
            }
            var resp = await fetch(url, fetchOpts);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
            return data.response || '';
        } catch (e) {
            if (attempt === retries) throw e;
            await new Promise(function(r) { setTimeout(r, 2000); });
        }
    }
}

// ── Firebase REST API helpers (uses anonymous auth) ──

async function getAnonymousToken(apiKey) {
    var resp = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
    });
    if (!resp.ok) throw new Error('Auth HTTP ' + resp.status + ': ' + (await resp.text()));
    var data = await resp.json();
    return data.idToken;
}

async function rtdbWrite(path, data, token) {
    var url = FIREBASE_CONFIG.databaseURL + '/' + path + '.json?auth=' + token;
    var resp = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error('RTDB HTTP ' + resp.status + ': ' + (await resp.text()));
    return resp.json();
}

async function rtdbRead(path, token) {
    var url = FIREBASE_CONFIG.databaseURL + '/' + path + '.json?auth=' + token;
    var resp = await fetch(url);
    if (!resp.ok) return null;
    return resp.json();
}

// ── Vocab helpers ──

function resolveLanguages(item) {
    var keys = Object.keys(item);
    var langs = [];
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (LANG_NAMES[key] && typeof item[key] === 'string' && item[key].length > 0) {
            langs.push(key);
        }
    }
    return langs;
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ── Main ──

(async function main() {
    console.log('=== Grammar Gym Pre-Generator ===');
    console.log('Mode:        ' + (useCloud ? 'CLOUD PROXY' : 'LOCAL'));
    console.log('Endpoint:    ' + ollamaEndpoint);
    console.log('Model:       ' + model);
    console.log('Skip exist:  ' + (skipExisting ? 'yes' : 'no'));
    if (onlyLang) console.log('Language:    ' + onlyLang);
    if (limitVal) console.log('Limit:       ' + limitVal);
    if (onlyVocabId) console.log('Vocab ID:    ' + onlyVocabId);
    if (vocabRange) console.log('Vocab range: ' + vocabRange[0] + ' - ' + vocabRange[1]);
    if (dryRun) console.log('DRY RUN:     (no writes)');
    console.log('');

    // Check endpoint reachable
    try {
        if (useCloud) {
            // Cloud proxy only accepts POST / with wrapped payload
            var healthResp = await fetch(ollamaEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: '/api/tags', method: 'GET', headers: {}, body: {} }),
                signal: AbortSignal.timeout(15000)
            });
            if (!healthResp.ok) throw new Error('HTTP ' + healthResp.status);
            var tags = await healthResp.json();
            var modelNames = (tags.models || []).map(function(m) { return m.name; });
            console.log('Cloud proxy reachable. ' + modelNames.length + ' cloud models available.');
        } else {
            var tagsResp = await fetch(ollamaEndpoint + '/api/tags', { signal: AbortSignal.timeout(10000) });
            if (!tagsResp.ok) throw new Error('HTTP ' + tagsResp.status);
            var tags = await tagsResp.json();
            var modelNames = (tags.models || []).map(function(m) { return m.name; });
            console.log('Ollama reachable. Models: ' + (modelNames.length > 0 ? modelNames.slice(0, 5).join(', ') : 'none') + (modelNames.length > 5 ? '...' : ''));
            if (modelNames.length > 0 && modelNames.indexOf(model) === -1) {
                console.warn('WARNING: model "' + model + '" not in /api/tags list. Will still try.');
            }
        }
    } catch (e) {
        console.error('ERROR: Cannot reach LLM at ' + ollamaEndpoint + ': ' + e.message);
        if (useCloud) {
            console.error('       Make sure the Cloud Run proxy is deployed and accessible.');
        } else {
            console.error('       Make sure Ollama is running locally. Use --cloud for cloud proxy.');
        }
        process.exit(1);
    }

    // Authenticate to Firebase
    var readVocab, readExisting, writeExercise;
    try {
        // Try Admin SDK first (--service-account or application default)
        var admin = require('firebase-admin');
        if (serviceAccountPath) {
            var sa = JSON.parse(fs.readFileSync(path.resolve(serviceAccountPath), 'utf-8'));
            admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: FIREBASE_CONFIG.databaseURL });
            console.log('Firebase Admin SDK initialized (service account).');
        } else {
            admin.initializeApp({ credential: admin.applicationDefault(), databaseURL: FIREBASE_CONFIG.databaseURL });
            console.log('Firebase Admin SDK initialized (application default).');
        }
        var adminDb = admin.database();
        readVocab = function() { return adminDb.ref('/vocab').once('value').then(function(s) { return s.val(); }); };
        readExisting = function() { return adminDb.ref('/grammar_exercises').once('value').then(function(s) { return s.val(); }); };
        writeExercise = function(vid, langCode, tokenVal, entry) {
            return adminDb.ref('grammar_exercises/' + vid + '/' + langCode + '/' + explainLang + '/' + tokenVal).set(entry);
        };
    } catch (e) {
        // Fall back to Firebase REST API with anonymous auth
        console.log('Admin SDK unavailable, using REST API:', e.message);
        var authToken = await getAnonymousToken(FIREBASE_CONFIG.apiKey);
        console.log('Firebase anonymous auth OK (REST API).');
        readVocab = function() { return rtdbRead('vocab', authToken); };
        readExisting = function() { return rtdbRead('grammar_exercises', authToken); };
        writeExercise = async function(vid, langCode, tokenVal, entry) {
            try {
                return await rtdbWrite('grammar_exercises/' + vid + '/' + langCode + '/' + explainLang + '/' + tokenVal, entry, authToken);
            } catch (e) {
                if (e.message && e.message.indexOf('401') !== -1) {
                    console.log('  Token expired, refreshing...');
                    authToken = await getAnonymousToken(FIREBASE_CONFIG.apiKey);
                    return await rtdbWrite('grammar_exercises/' + vid + '/' + langCode + '/' + explainLang + '/' + tokenVal, entry, authToken);
                }
                throw e;
            }
        };
    }

    // Fetch all vocab
    console.log('Fetching vocab...');
    var vocab = await readVocab();
    if (!vocab) {
        console.error('ERROR: No vocab found at /vocab in RTDB.');
        process.exit(1);
    }
    var vocabIds = Object.keys(vocab).sort(function(a, b) { return parseInt(a) - parseInt(b); });
    console.log('Found ' + vocabIds.length + ' vocab items.');

    // Check cached exercises (new structure: grammar_exercises/{vid}/{lang}/{explainLang}/{token})
    var existing = {}; // existing[vid][langCode] = [explainLang1, explainLang2, ...]
    var existingData = await readExisting();
    if (existingData) {
        var allIds = Object.keys(existingData);
        for (var i = 0; i < allIds.length; i++) {
            var v = allIds[i];
            var langs = existingData[v] || {};
            existing[v] = {};
            var langCodes = Object.keys(langs);
            for (var j = 0; j < langCodes.length; j++) {
                var lc = langCodes[j];
                var explainData = langs[lc] || {};
                existing[v][lc] = Object.keys(explainData);
            }
        }
    }
    var existingCount = 0;
    var exIds = Object.keys(existing);
    for (var i = 0; i < exIds.length; i++) {
        var langCodes = Object.keys(existing[exIds[i]]);
        for (var j = 0; j < langCodes.length; j++) {
            existingCount += existing[exIds[i]][langCodes[j]].length;
        }
    }
    console.log('Existing cached exercises: ' + existingCount);

    // Process each vocab item
    var processed = 0, generated = 0, skipped = 0, failed = 0;

    for (var vi = 0; vi < vocabIds.length; vi++) {
        var vid = vocabIds[vi];
        if (limitVal && processed >= limitVal) break;
        if (onlyVocabId !== null && parseInt(vid) !== onlyVocabId) continue;
        if (vocabRange !== null) {
            var idNum = parseInt(vid);
            if (idNum < vocabRange[0] || idNum > vocabRange[1]) continue;
        }

        var item = vocab[vid];
        if (!item || typeof item !== 'object') continue;

        var langs = resolveLanguages(item);
        var langsToProcess = onlyLang ? langs.filter(function(l) { return l === onlyLang; }) : langs;
        if (langsToProcess.length === 0) continue;

        for (var li = 0; li < langsToProcess.length; li++) {
            var langCode = langsToProcess[li];
            var langWord = item[langCode] || item.ja || item.en || '';
            var contextKey = langCode + '_ex';
            var context = item[contextKey] || '';

            if (!langWord) continue;

            if (skipExisting && existing[vid] && existing[vid][langCode] && existing[vid][langCode].indexOf(explainLang) !== -1) {
                skipped++;
                processed++;
                continue;
            }

            var levelHint = '';
            var tags = item.tags || [];
            for (var ti = 0; ti < tags.length; ti++) {
                if (LEVEL_DIFFICULTY_MAP[tags[ti]]) {
                    levelHint = tags[ti];
                    break;
                }
            }
            if (!levelHint && item.level) levelHint = item.level;

            console.log('[' + vid + '/' + langCode + '] Generating for: ' + langWord + ' (' + (levelHint || 'no level') + ')');

            try {
                var prompt = buildPrompt(langWord, context, langCode, levelHint, explainLang);
                var raw, json, valErr;
                var success = false;
                var maxAttempts = 3;

                for (var attempt = 1; attempt <= maxAttempts; attempt++) {
                    raw = await callOllama(prompt);
                    json = extractJson(raw);
                    if (!json) {
                        // Feed extraction error back into the prompt for retry
                        if (attempt < maxAttempts) {
                            prompt += '\n\nPREVIOUS ERROR: Could not extract valid JSON from your response. Output ONLY valid JSON with no extra text, no markdown, no code fences.\nRaw length was ' + raw.length + '. Make sure your response is pure JSON.';
                            console.log('  Retrying (' + attempt + '/' + maxAttempts + '): JSON extraction failed');
                            continue;
                        }
                        console.log('  \u274c Failed: could not extract JSON (raw length: ' + raw.length + ')');
                        failed++;
                        success = true; // skip the validation block below
                        break;
                    }
                    var choiceLimit = 2;
                    for (; choiceLimit <= 5; choiceLimit++) {
                        valErr = validate(json, choiceLimit);
                        if (!valErr) break;
                    }
                    if (!valErr) {
                        success = true;
                        if (choiceLimit > 2) console.log('  \u2139 Accepted with ' + choiceLimit + ' choices (relaxed)');
                        break;
                    }
                    // Feed validation error back into the prompt for retry
                    if (attempt < maxAttempts) {
                        prompt += '\n\nPREVIOUS ERROR: ' + valErr + '\nFix your JSON to match the required schema exactly. Output ONLY valid JSON.';
                        console.log('  Retrying (' + attempt + '/' + maxAttempts + '): ' + valErr);
                    }
                }

                if (!success) {
                    console.log('  \u274c All ' + maxAttempts + ' attempts failed: ' + (valErr || 'could not extract JSON'));
                    failed++;
                    processed++;
                    await sleep(500);
                    continue;
                }

                // Compute labelA/labelB for each exercise (mirrors LLMService.resolveLabels)
                var exercises = json.exercises.map(function(ex) {
                    var labels = resolveLabels(ex.type, ex.answer);
                    return Object.assign({}, ex, { labelA: labels.labelA, labelB: labels.labelB });
                });

                var tokenVal = Math.random().toString(36).slice(2, 8);
                var entry = {
                    grammar: json.grammar,
                    usage: json.usage,
                    example: json.example,
                    exercises: exercises,
                    model: model,
                    ts: Date.now()
                };

                if (dryRun) {
                    console.log('  \u2705 [DRY RUN] Would save to grammar_exercises/' + vid + '/' + langCode + '/' + explainLang + '/' + tokenVal);
                    console.log('              grammar: "' + json.grammar.substring(0, 40) + '...", ' + exercises.length + ' exercises');
                    generated++;
                } else {
                    await writeExercise(vid, langCode, tokenVal, entry);
                    console.log('  \u2705 Saved to grammar_exercises/' + vid + '/' + langCode + '/' + explainLang + '/' + tokenVal + ' (' + exercises.length + ' exercises, grammar: "' + json.grammar.substring(0, 40) + '...")');
                    generated++;
                }
            } catch (e) {
                console.log('  \u274c Error: ' + e.message);
                failed++;
            }

            processed++;
            await sleep(500);
        }
    }

    console.log('');
    console.log('=== Done ===');
    console.log('Processed: ' + processed);
    console.log('Generated: ' + generated);
    console.log('Skipped (existing): ' + skipped);
    console.log('Failed: ' + failed);
    process.exit(failed > 0 ? 1 : 0);
})().catch(function(e) {
    console.error('FATAL:', e);
    process.exit(1);
});
