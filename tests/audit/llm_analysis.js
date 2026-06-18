/* Standalone LLM prompt analysis runner */
/* Loads llm.js (no vitest needed) and tests prompt building for 3 random languages */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const escapeSrc = readFileSync(join(__dirname, '..', 'public', 'js', 'escape.js'), 'utf8');
const src = escapeSrc + '\n' + readFileSync(join(__dirname, '..', 'public', 'js', 'llm.js'), 'utf8');

const fn = new Function('window', 'document', src + '\nreturn { LLMService };');
const mockWindow = { VM_DEBUG: false };
const result = fn(mockWindow, {});
const LLMService = result.LLMService;
const service = new LLMService();

// Pick 3 random languages from supported set
const LANGUAGES = [
  { code: 'es', word: 'hablar', sentence: 'Yo hablo español', level: 'A1', name: 'Spanish' },
  { code: 'ja', word: '食べる', sentence: '毎日野菜を食べます', level: 'N5', name: 'Japanese' },
  { code: 'fr', word: 'manger', sentence: 'Je mange du pain', level: 'A1', name: 'French' },
  { code: 'de', word: 'sprechen', sentence: 'Ich spreche Deutsch', level: 'B1', name: 'German' },
  { code: 'ko', word: '하다', sentence: '한국어를 공부합니다', level: 'TOPIK2', name: 'Korean' },
  { code: 'zh', word: '学习', sentence: '我每天学习汉语', level: 'HSK2', name: 'Chinese' },
  { code: 'ru', word: 'говорить', sentence: 'Я говорю по-русски', level: 'A2', name: 'Russian' },
  { code: 'it', word: 'mangiare', sentence: 'Mangio la pasta', level: 'A1', name: 'Italian' },
  { code: 'pt', word: 'falar', sentence: 'Eu falo português', level: 'A1', name: 'Portuguese' },
];

// Shuffle and pick 3
const shuffled = [...LANGUAGES].sort(() => Math.random() - 0.5).slice(0, 3);

console.log('=== LLM Prompt Analysis ===\n');
console.log(`3 randomly chosen languages: ${shuffled.map(l => l.name).join(', ')}\n`);

for (const lang of shuffled) {
  console.log(`╔══════════════════════════════════════════════════════`);
  console.log(`║  Language: ${lang.name} (${lang.code})  Level: ${lang.level}`);
  console.log(`║  Word: "${lang.word}"  Sentence: "${lang.sentence}"`);
  console.log(`╚══════════════════════════════════════════════════════\n`);

  // 1. Grammar explanation prompt
  const grammarPrompt = service.buildGrammarExplanationPrompt(lang.word, lang.sentence, lang.code, lang.level);
  console.log(`[buildGrammarExplanationPrompt]`);
  console.log(grammarPrompt);
  console.log();

  // 2. Listening/cloze prompt
  const words = [lang.word, shuffled.find(l => l.code !== lang.code).word];
  const listeningPrompt = service.buildListeningPrompt(words, lang.code, lang.level);
  console.log(`[buildListeningPrompt]`);
  console.log(listeningPrompt);
  console.log();

  // 3. Test parsing functions
  const grammarResponse = `GRAMMAR: Present tense conjugation of ${lang.word}.
USAGE: Used in everyday conversation.
EXAMPLE: ${lang.sentence}.`;
  const parsed = service._extractGrammarExplanation(grammarResponse);
  console.log(`[_extractGrammarExplanation from mock response]`);
  console.log(`  grammar: ${parsed ? parsed.grammar : 'null'}`);
  console.log(`  usage:   ${parsed ? parsed.usage : 'null'}`);
  console.log(`  example: ${parsed ? parsed.example : 'null'}`);
  console.log();

  const clozeResponse = `{"match":"${lang.word}"}`;
  const parsedCloze = service._parseResponse(clozeResponse, lang.sentence);
  console.log(`[_parseResponse from mock cloze]`);
  console.log(`  input:    ${clozeResponse}`);
  console.log(`  sentence: ${lang.sentence}`);
  console.log(`  match:    ${parsedCloze}`);
  console.log();

  // 4. Listening extraction
  const listeningResponse = `PASSAGE:
${lang.sentence} ${lang.sentence}.
QUESTION:
What is the correct answer?
A) Option one
B) Option two
C) Option three
ANSWER: A`;
  const passage = service._extractListeningPassage(listeningResponse);
  const question = service._extractListeningQuestion(listeningResponse);
  console.log(`[_extractListeningPassage / _extractListeningQuestion]`);
  console.log(`  passage:  ${passage ? passage.slice(0, 60) + '...' : 'null'}`);
  console.log(`  question: ${question ? question.question : 'null'}`);
  console.log(`  choices:  ${question ? question.choices.join(' | ') : 'null'}`);
  console.log(`  answer:   ${question ? question.answer : 'null'}`);
  console.log();
}

// Verify all language codes work in _getLangName
console.log('╔══════════════════════════════════════════════════════');
console.log('║  Verifying all supported language codes');
console.log('╚══════════════════════════════════════════════════════\n');
for (const lang of LANGUAGES) {
  const name = service._getLangName(lang.code);
  const ok = name === lang.name ? '✓' : '✗';
  console.log(`  ${ok} ${lang.code} → ${name} ${name === lang.name ? '' : `(expected ${lang.name})`}`);
}

// Level difficulty map check
console.log('\n╔══════════════════════════════════════════════════════');
console.log('║  LEVEL_DIFFICULTY_MAP sample entries');
console.log('╚══════════════════════════════════════════════════════\n');
const levels = ['A1', 'B2', 'C2', 'N5', 'N1', 'HSK1', 'HSK6', 'TOPIK1', 'TOPIK6'];
for (const lvl of levels) {
  const desc = LLMService.LEVEL_DIFFICULTY_MAP[lvl];
  console.log(`  ${lvl.padEnd(8)} → ${desc}`);
}

console.log('\nDone.');
