import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'url';
import { join } from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const escapeSrc = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'escape.js'), 'utf8');
const src = escapeSrc + '\n' + readFileSync(join(__dirname, '..', '..', 'public', 'js', 'llm.js'), 'utf8');

let LLMService, service;
beforeAll(() => {
    const fn = new Function('window', 'document', src + '\nreturn { LLMService };');
    const mockWindow = { VM_DEBUG: false };
    const result = fn(mockWindow, {});
    LLMService = result.LLMService;
    service = new LLMService();
});

describe('LEVEL_DIFFICULTY_MAP', () => {
    it('has CEFR levels A1 through C2', () => {
        const map = LLMService.LEVEL_DIFFICULTY_MAP;
        expect(map).toHaveProperty('A1');
        expect(map).toHaveProperty('A2');
        expect(map).toHaveProperty('B1');
        expect(map).toHaveProperty('B2');
        expect(map).toHaveProperty('C1');
        expect(map).toHaveProperty('C2');
    });

    it('has JLPT levels N5 through N1', () => {
        const map = LLMService.LEVEL_DIFFICULTY_MAP;
        expect(map).toHaveProperty('N5');
        expect(map).toHaveProperty('N4');
        expect(map).toHaveProperty('N3');
        expect(map).toHaveProperty('N2');
        expect(map).toHaveProperty('N1');
    });

    it('has HSK levels 1 through 6', () => {
        const map = LLMService.LEVEL_DIFFICULTY_MAP;
        expect(map).toHaveProperty('HSK1');
        expect(map).toHaveProperty('HSK2');
        expect(map).toHaveProperty('HSK3');
        expect(map).toHaveProperty('HSK4');
        expect(map).toHaveProperty('HSK5');
        expect(map).toHaveProperty('HSK6');
    });

    it('has TOPIK levels 1 through 6', () => {
        const map = LLMService.LEVEL_DIFFICULTY_MAP;
        expect(map).toHaveProperty('TOPIK1');
        expect(map).toHaveProperty('TOPIK2');
        expect(map).toHaveProperty('TOPIK3');
        expect(map).toHaveProperty('TOPIK4');
        expect(map).toHaveProperty('TOPIK5');
        expect(map).toHaveProperty('TOPIK6');
    });

    it('all values are non-empty strings', () => {
        for (const [key, value] of Object.entries(LLMService.LEVEL_DIFFICULTY_MAP)) {
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        }
    });
});

describe('_getLangName', () => {
    it('returns correct names for supported language codes', () => {
        expect(service._getLangName('es')).toBe('Spanish');
        expect(service._getLangName('fr')).toBe('French');
        expect(service._getLangName('de')).toBe('German');
        expect(service._getLangName('it')).toBe('Italian');
        expect(service._getLangName('pt')).toBe('Portuguese');
        expect(service._getLangName('ru')).toBe('Russian');
        expect(service._getLangName('ja')).toBe('Japanese');
        expect(service._getLangName('zh')).toBe('Chinese');
        expect(service._getLangName('ko')).toBe('Korean');
    });

    it('returns English for en', () => {
        expect(service._getLangName('en')).toBe('English');
    });

    it('returns the code itself for unknown codes', () => {
        expect(service._getLangName('xx')).toBe('xx');
        expect(service._getLangName('abc')).toBe('abc');
    });
});

describe('buildGrammarExplanationPrompt', () => {
    it('includes the word in the prompt', () => {
        const prompt = service.buildGrammarExplanationPrompt('comer', 'Yo como pan', 'es', 'A1');
        expect(prompt).toContain('comer');
    });

    it('includes the context sentence in the prompt', () => {
        const prompt = service.buildGrammarExplanationPrompt('comer', 'Yo como pan', 'es', 'A1');
        expect(prompt).toContain('Yo como pan');
    });

    it('includes the language name in the prompt', () => {
        const prompt = service.buildGrammarExplanationPrompt('comer', 'Yo como pan', 'es', 'A1');
        expect(prompt).toContain('Spanish');
    });

    it('includes level-appropriate difficulty hint when level is provided', () => {
        const prompt = service.buildGrammarExplanationPrompt('comer', 'Yo como pan', 'es', 'A1');
        expect(prompt).toContain('beginner (A1)');
        expect(prompt).toContain('learner is at');
    });

    it('includes difficulty hint for N4 level', () => {
        const prompt = service.buildGrammarExplanationPrompt('食べる', '毎日野菜を食べます', 'ja', 'N4');
        expect(prompt).toContain('advanced beginner (N4)');
    });

    it('includes difficulty hint for HSK2 level', () => {
        const prompt = service.buildGrammarExplanationPrompt('学习', '我每天学习汉语', 'zh', 'HSK2');
        expect(prompt).toContain('advanced beginner (HSK 2)');
    });

    it('includes difficulty hint for TOPIK2 level', () => {
        const prompt = service.buildGrammarExplanationPrompt('연구', '대학에서 연구하고 있습니다', 'ko', 'TOPIK2');
        expect(prompt).toContain('advanced beginner (TOPIK 2)');
    });

    it('omits level hint when level is null', () => {
        const prompt = service.buildGrammarExplanationPrompt('comer', 'Yo como pan', 'es', null);
        expect(prompt).not.toContain('learner is at');
    });

    it('omits level hint when level is undefined', () => {
        const prompt = service.buildGrammarExplanationPrompt('comer', 'Yo como pan', 'es');
        expect(prompt).not.toContain('learner is at');
    });

    it('includes format instructions', () => {
        const prompt = service.buildGrammarExplanationPrompt('comer', 'Yo como pan', 'es', 'A1');
        expect(prompt).toContain('GRAMMAR:');
        expect(prompt).toContain('USAGE:');
        expect(prompt).toContain('EXAMPLE:');
    });
});

describe('buildListeningPrompt', () => {
    it('includes the words joined by commas', () => {
        const prompt = service.buildListeningPrompt(['hola', 'adiós', 'comer'], 'es', 'A1');
        expect(prompt).toContain('hola, adiós, comer');
    });

    it('includes the language name in the prompt', () => {
        const prompt = service.buildListeningPrompt(['食べる'], 'ja', 'N4');
        expect(prompt).toContain('Japanese');
    });

    it('asks for a listening passage', () => {
        const prompt = service.buildListeningPrompt(['bonjour'], 'fr', 'A1');
        expect(prompt).toContain('PASSAGE:');
        expect(prompt).toContain('QUESTION:');
        expect(prompt).toContain('ANSWER:');
    });

    it('includes level-appropriate difficulty hint when level is provided', () => {
        const prompt = service.buildListeningPrompt(['hello'], 'en', 'A1');
        expect(prompt).toContain('beginner (A1)');
        expect(prompt).toContain('learner is at');
    });

    it('includes difficulty hint for B2 level', () => {
        const prompt = service.buildListeningPrompt(['arbeiten'], 'de', 'B2');
        expect(prompt).toContain('upper intermediate (B2)');
    });

    it('omits level hint when level is null', () => {
        const prompt = service.buildListeningPrompt(['hola'], 'es', null);
        expect(prompt).not.toContain('learner is at');
    });

    it('omits level hint when level is undefined', () => {
        const prompt = service.buildListeningPrompt(['hola'], 'es');
        expect(prompt).not.toContain('learner is at');
    });

    it('requests comprehension question with 3 choices', () => {
        const prompt = service.buildListeningPrompt(['안녕'], 'ko', 'TOPIK1');
        expect(prompt).toContain('3 answer choices');
        expect(prompt).toContain('A) ...');
    });
});

describe('_extractListeningPassage', () => {
    it('extracts passage from valid formatted response', () => {
        const raw = `PASSAGE:
今日はいい天気ですね。散歩に行きましょう。
QUESTION:
天気はどうですか？
A) 悪い
B) いい
C) 寒い
ANSWER: B`;
        const result = service._extractListeningPassage(raw);
        expect(result).toBe('今日はいい天気ですね。散歩に行きましょう。');
    });

    it('extracts multi-line passage', () => {
        const raw = `PASSAGE:
今日はいい天気ですね。
散歩に行きましょう。
QUESTION:
何をしましょうか？
A) 勉強する
B) 散歩する
C) 料理する
ANSWER: B`;
        const result = service._extractListeningPassage(raw);
        expect(result).toContain('今日はいい天気ですね。');
        expect(result).toContain('散歩に行きましょう。');
    });

    it('returns null when PASSAGE section is missing', () => {
        const raw = 'Some random text without proper formatting';
        const result = service._extractListeningPassage(raw);
        expect(result).toBeNull();
    });

    it('returns null when response is empty string', () => {
        const result = service._extractListeningPassage('');
        expect(result).toBeNull();
    });
});

describe('_extractListeningQuestion', () => {
    it('extracts question, choices, and answer from valid response', () => {
        const raw = `PASSAGE:
Il fait beau aujourd'hui.
QUESTION:
Quel temps fait-il ?
A) Il pleut
B) Il fait beau
C) Il fait froid
ANSWER: B`;
        const result = service._extractListeningQuestion(raw);
        expect(result).not.toBeNull();
        expect(result.question).toContain('Quel temps fait-il');
        expect(result.choices).toHaveLength(3);
        expect(result.choices[0]).toBe('A) Il pleut');
        expect(result.choices[1]).toBe('B) Il fait beau');
        expect(result.choices[2]).toBe('C) Il fait froid');
        expect(result.answer).toBe('B');
    });

    it('returns null when QUESTION section is missing', () => {
        const raw = 'Some random text without proper formatting';
        const result = service._extractListeningQuestion(raw);
        expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
        const result = service._extractListeningQuestion('');
        expect(result).toBeNull();
    });
});

describe('_parseResponse', () => {
    it('extracts match from valid JSON response', () => {
        const sentence = 'Yo como pan cada mañana';
        const raw = '{"match":"como"}';
        const result = service._parseResponse(raw, sentence);
        expect(result).toBe('como');
    });

    it('returns null when match is not in sentence (hallucinated)', () => {
        const sentence = 'Yo como pan cada mañana';
        const raw = '{"match":"bebo"}';
        const result = service._parseResponse(raw, sentence);
        expect(result).toBeNull();
    });

    it('extracts match from raw completion text without JSON', () => {
        const sentence = 'Yo como pan cada mañana';
        const raw = 'como"}';
        const result = service._parseResponse(raw, sentence);
        expect(result).toBe('como');
    });

    it('returns null when match is empty string', () => {
        const sentence = 'Yo como pan';
        const raw = '{"match":""}';
        const result = service._parseResponse(raw, sentence);
        expect(result).toBeNull();
    });

    it('returns null for null input', () => {
        const result = service._parseResponse(null, 'any sentence');
        expect(result).toBeNull();
    });

    it('returns null for empty string input', () => {
        const result = service._parseResponse('', 'any sentence');
        expect(result).toBeNull();
    });

    it('returns null for malformed JSON', () => {
        const sentence = 'Yo como pan';
        const result = service._parseResponse('not json at all', sentence);
        expect(result).toBeNull();
    });
});

describe('_extractGrammarExplanation', () => {
    it('extracts all three sections from a valid response', () => {
        const raw = `GRAMMAR: The verb "comer" is a regular -er verb in Spanish.
USAGE: In this sentence, "como" is the first-person singular present form, meaning "I eat".
EXAMPLE: Yo como frutas cada día.`;
        const result = service._extractGrammarExplanation(raw);
        expect(result).not.toBeNull();
        expect(result.grammar).toBe('The verb "comer" is a regular -er verb in Spanish.');
        expect(result.usage).toBe('In this sentence, "como" is the first-person singular present form, meaning "I eat".');
        expect(result.example).toBe('Yo como frutas cada día.');
    });

    it('extracts sections with multi-line content', () => {
        const raw = `GRAMMAR: Japanese verb conjugation depends on verb group.
Ichidan verbs drop -ru and add endings.
USAGE: 食べます is the polite form of 食べる。
EXAMPLE: 毎日野菜を食べます。`;
        const result = service._extractGrammarExplanation(raw);
        expect(result).not.toBeNull();
        expect(result.grammar).toContain('Japanese verb conjugation');
        expect(result.grammar).toContain('Ichidan verbs drop -ru');
        expect(result.usage).toContain('食べます');
    });

    it('returns null for missing sections with no GRAMMAR, USAGE, or EXAMPLE', () => {
        const raw = 'Some random text without any proper formatting';
        const result = service._extractGrammarExplanation(raw);
        expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
        const result = service._extractGrammarExplanation('');
        expect(result).toBeNull();
    });

    it('returns null for null input', () => {
        const result = service._extractGrammarExplanation(null);
        expect(result).toBeNull();
    });

    it('returns partial object when some sections are missing', () => {
        const raw = `GRAMMAR: Simple explanation here.
USAGE: How it is used.
No example section here.`;
        const result = service._extractGrammarExplanation(raw);
        expect(result).not.toBeNull();
        expect(result.grammar).toBe('Simple explanation here.');
        expect(result.usage).toContain('How it is used');
        expect(result.example).toBeNull();
    });

    it('is case-insensitive for section labels', () => {
        const raw = `grammar: Present tense conjugation.
usage: Used for habitual actions.
example: Yo hablo español.`;
        const result = service._extractGrammarExplanation(raw);
        expect(result).not.toBeNull();
        expect(result.grammar).toContain('Present tense');
        expect(result.usage).toContain('habitual actions');
        expect(result.example).toContain('hablo');
    });

    it('_extractGrammarExplanation returns object with structured fields', () => {
        const raw = `GRAMMAR: The verb "comer" is a regular -er verb.
USAGE: "como" is the first-person singular present form.
EXAMPLE: Yo como pan.`;
        const result = service._extractGrammarExplanation(raw);
        expect(typeof result).toBe('object');
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('grammar');
        expect(result).toHaveProperty('usage');
        expect(result).toHaveProperty('example');
    });
});