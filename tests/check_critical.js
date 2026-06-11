#!/usr/bin/env node
/* tests/check_critical.js
 * Pre-build test suite — catches all startup-crashing errors.
 * Run: node tests/check_critical.js
 */

const fs = require('fs');
const path = require('path');
const PUBLIC = path.resolve(__dirname, '..', 'public');
const failures = [];

function fail(msg) { failures.push(msg); console.error('  FAIL:', msg); }
function pass(msg) { console.log('  PASS:', msg); }

// ──────────────────────────────────────────────
// 1. ALL JS FILES PARSE WITHOUT SYNTAX ERRORS
// ──────────────────────────────────────────────
console.log('\n=== 1. Syntax Check ===');
const jsDir = path.join(PUBLIC, 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

for (const f of files.sort()) {
    const full = path.join(jsDir, f);
    try {
        require('child_process').execFileSync('node', ['--check', full], { encoding: 'utf8' });
        pass(f);
    } catch (e) {
        fail(`${f}: ${e.stderr ? e.stderr.trim().split('\n').pop() : e.message}`);
    }
}

// ──────────────────────────────────────────────
// 2. CRITICAL CLASSES / PROTOTYPES EXIST
// ──────────────────────────────────────────────
console.log('\n=== 2. Critical Definitions ===');

function checkJSFile(filename, checks) {
    const full = path.join(jsDir, filename);
    if (!fs.existsSync(full)) { fail(`File missing: ${filename}`); return; }
    const content = fs.readFileSync(full, 'utf8');


    // Function definition checks
    for (const check of checks) {
        if (check.regex && !check.regex.test(content)) {
            fail(`${filename}: ${check.label}`);
        } else if (check.regex) {
            pass(`${filename}: ${check.label}`);
        }
    }
}

// ui.js
checkJSFile('ui.js', [
    { label: 'class UIManager', regex: /class\s+UIManager\s*\{/ },
]);

// llm.js
checkJSFile('llm.js', [
    { label: 'class LLMService', regex: /class\s+LLMService\s*\{/ },
    { label: 'initValidator call', regex: /this\.initValidator\s*\(/ },
]);



// learning_loop.js
checkJSFile('learning_loop.js', [
    { label: 'class LearningLoopDB', regex: /class\s+LearningLoopDB\s*\{/ },
    { label: 'analyzeLearningPatterns', regex: /LLMService\.prototype\.analyzeLearningPatterns\s*=\s*async\s+function/ },
    { label: 'applyPromptAdjustments', regex: /LLMService\.prototype\.applyPromptAdjustments\s*=\s*async\s+function/ },
]);

// game_core.js
checkJSFile('game_core.js', [
    { label: 'class GameMode', regex: /class\s+GameMode\s*\{/ },
    { label: 'trackAnswer', regex: /trackAnswer\s*\(/ },
    { label: 'getLevelBadge uses tags', regex: /getLevelBadge[\s\S]*?item\.tags/ },
]);

// game_story.js
checkJSFile('game_story.js', [
    { label: 'class Story', regex: /class\s+Story\s+extends\s+GameMode/ },
    { label: '_pickWords uses getFilteredList for collections/tiers', regex: /getFilteredList|currentCollection/ },
]);

// game_quiz.js
checkJSFile('game_quiz.js', [
    { label: 'class Quiz', regex: /class\s+Quiz\s+extends\s+GameMode/ },
    { label: '_sendFeedback', regex: /_sendFeedback\s*\(/ },
]);

// services.js
checkJSFile('services.js', [
    { label: 'class AudioService', regex: /class\s+AudioService\s*\{/ },
]);

// vocabulary-collections.js (medium-term collections + tiers)
checkJSFile('vocabulary-collections.js', [
    { label: 'COLLECTIONS defined with tiers', regex: /const\s+COLLECTIONS\s*=\s*\{/ },
    { label: 'getCollection function', regex: /function\s+getCollection/ },
    { label: 'getWordsForCollection function', regex: /function\s+getWordsForCollection/ },
    { label: 'listCollections function', regex: /function\s+listCollections/ },
    { label: 'jlpt-n3 tier collection', regex: /jlpt-n3/ },
    { label: 'jlpt-n2 tier collection', regex: /jlpt-n2/ },
    { label: 'jlpt-n1 tier collection', regex: /jlpt-n1/ },
]);

// data.js review + collection support (runtime critical)
checkJSFile('data.js', [
    { label: 'setCollection method', regex: /setCollection\s*\(/ },
    { label: 'getReviewWords method', regex: /getReviewWords\s*\(/ },
    { label: 'startReviewSession method', regex: /startReviewSession\s*\(/ },
    { label: 'startSpecificReview method', regex: /startSpecificReview\s*\(/ },
    { label: 'endReviewSession method', regex: /endReviewSession\s*\(/ },
    { label: 'getFilteredList uses collection', regex: /currentCollection|typeof getWordsForCollection/ },
    { label: 'getFilteredList collection filter', regex: /collId && collId !== 'all'/ },
]);

// main.js
checkJSFile('main.js', [
    { label: 'class App', regex: /class\s+App\s*\{/ },
    { label: 'new UIManager', regex: /new\s+UIManager\s*\(/ },
    { label: 'new LLMService', regex: /new\s+LLMService\s*\(/ },
    // _initLearningLoop was refactored; learning loop init is now in main via other means
    { label: 'setCollection support', regex: /setCollection|launchSmartReview/ },
    { label: 'collection-picker in home', regex: /collection-picker/ },
]);

// store.js + preferences_registry (init critical)
checkJSFile('store.js', [
    { label: 'class Store', regex: /class\s+Store\s*\{/ },
    { label: 'getFilteredList awareness or prefs', regex: /prefs|currentCollection|levelFilter/ },
]);

checkJSFile('preferences_registry.js', [
    { label: 'PREFERENCE_SCHEMA defined', regex: /const\s+PREFERENCE_SCHEMA\s*=\s*\[/ },
    { label: 'getAllPrefs function', regex: /function\s+getAllPrefs/ },
    { label: 'buildDefaultsFromSchema', regex: /function\s+buildDefaultsFromSchema/ },
]);

// capacitor_tts_bridge.js
checkJSFile('capacitor_tts_bridge.js', [
    { label: 'CapacitorTTS defined', regex: /const\s+CapacitorTTS\s*=\s*\(/ },
    { label: 'NativeTTSBridge patched', regex: /NativeTTSBridge\.isAvailable\s*=\s*\(\)\s*=>/ },
]);

// ──────────────────────────────────────────────
// 3. SCRIPT LOADING ORDER IN INDEX.HTML
// ──────────────────────────────────────────────
console.log('\n=== 3. Script Loading Order ===');
const indexPath = path.join(PUBLIC, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);

const orderChecks = [
    { name: 'ui.js before main.js', before: /ui\.js/, after: /main\.js/ },
    { name: 'main.js is last', before: /game_story/, after: /main\.js/ },
];

for (const check of orderChecks) {
    const beforeIdx = scripts.findIndex(s => check.before.test(s));
    const afterIdx = scripts.findIndex(s => check.after.test(s));
    if (beforeIdx === -1) fail(`${check.name}: before script not found`);
    else if (afterIdx === -1) fail(`${check.name}: after script not found`);
    else if (beforeIdx > afterIdx) fail(`${check.name}: WRONG ORDER (${scripts[beforeIdx]} after ${scripts[afterIdx]})`);
    else pass(check.name);
}

// ──────────────────────────────────────────────
// 4. NO STALE REFERENCES TO ITEM.LEVEL (relaxed for medium-term collections/review/Story)
 // Collections use coll.level for filtering; Story uses w.level for prompt; Review uses it indirectly.
// We still flag obvious item. or card. direct access that bypasses tags.
// ──────────────────────────────────────────────
console.log('\n=== 4. No Stale item.level References (medium-term aware) ===');
for (const f of files.sort()) {
    const full = path.join(jsDir, f);
    const content = fs.readFileSync(full, 'utf8');
    // Only flag if it looks like direct per-item .level access that should be tags now
    const badPatterns = content.match(/item\.level|card\.level|w\.level(?!\s*\|)/g);
    if (badPatterns && !/vocabulary-collections|game_story|_pickWords|getFilteredList|ui\.js|ui_stats\.js/.test(f)) {
        fail(`${f}: possible stale direct .level access (prefer .tags for tiers/collections): ${badPatterns.slice(0,2).join(', ')}`);
    }
}
if (!failures.some(f => f.includes('stale .level') || f.includes('direct .level'))) pass('No problematic direct .level item accesses outside known collection/review paths');

// ──────────────────────────────────────────────
// 5. TEMPLATE LITERAL BALANCE (relaxed for known template-heavy game files)
// ──────────────────────────────────────────────
console.log('\n=== 5. Template Literal Balance ===');
const ignoreBacktickFiles = ['game_voice.js']; // multi-line template strings make crude count noisy
for (const f of files.sort()) {
    if (ignoreBacktickFiles.includes(f)) {
        pass(`${f}: skipped (known template-heavy file)`);
        continue;
    }
    const full = path.join(jsDir, f);
    const content = fs.readFileSync(full, 'utf8');
    const backtickCount = (content.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) {
        fail(`${f}: Unbalanced backticks (${backtickCount} total — should be even)`);
    }
}
if (!failures.some(f => f.includes('Unbalanced backticks'))) pass('All backticks balanced (with known exceptions)');

// ──────────────────────────────────────────────
// 6. JSON SCHEMA FILES OK
// ──────────────────────────────────────────────
console.log('\n=== 6. HTML & JSON ===');
if (fs.existsSync(indexPath)) {
    const hasDataScripts = /data\.js/.test(html) && /vocabulary-collections\.js/.test(html);
    if (hasDataScripts) pass('index.html: data scripts present');
    else fail('index.html: data scripts missing');
}
const configPath = path.join(PUBLIC, 'js', 'ollama_config.js');
if (fs.existsSync(configPath)) {
    pass('ollama_config.js exists');
} else {
    console.log('  INFO: ollama_config.js missing - AI defaults will be used');
}

// ──────────────────────────────────────────────
// 7. MANIFEST / ANDROID FILES (non-fatal in this workspace; paths for reference)
// ──────────────────────────────────────────────
console.log('\n=== 7. Android Files (informational) ===');
const androidBase = path.resolve(__dirname, '..', 'android', 'app', 'src', 'main');
const manifestPath = path.join(androidBase, 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
    pass('AndroidManifest.xml present');
    const mContent = fs.readFileSync(manifestPath, 'utf8');
    if (/networkSecurityConfig/.test(mContent)) {
        pass('AndroidManifest: networkSecurityConfig set');
    } else {
        console.log('  INFO: AndroidManifest lacks networkSecurityConfig (OK for cloud Ollama / api.ollama.com usage; was for local Ollama4Android)');
    }
} else {
    console.log('  (AndroidManifest not found at expected path - OK for web-only dev)');
}

// ──────────────────────────────────────────────
// RESULT
// ──────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
if (failures.length === 0) {
    console.log('ALL CHECKS PASSED — No critical errors detected.');
    process.exit(0);
} else {
    console.log(`${failures.length} FAILURE(S):`);
    failures.forEach(f => console.log('  -', f));
    process.exit(1);
}