// Extracted Prompts and Features for LLMService
Object.assign(LLMService.prototype, {
    // --- Core: Find cloze match ---
    async findClozeMatch(sentence, target, langCode, level) {
        // 1. Check cache
        const cached = await this.getFromCache(sentence, target, langCode);
        if (cached !== null && cached !== '') return cached;

        // 2. Availability guard
        if (!this.available || !this.hasModel) return null;

        // 3. Build level-aware prompt
        let levelHint = '';
        if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
            const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level];
            levelHint = `\nThe learner is at ${difficulty} level. Focus on base forms and common conjugations typical for that level.`;
        }

        try {
            const prompt = `Sentence: ${sentence}
Word: ${target}${levelHint}
The part of the sentence to blank out is: {"match":"`;

            const raw = await this.generate({
                prompt,
                system: 'Complete the JSON. Output only the value and closing brackets. No explanation.',
                options: { temperature: 0, num_predict: 64 },
                timeout: 30000
            });

            L('[LLM] Raw response:', raw);
            const match = this._parseResponse(raw, sentence);
            L('[LLM] Parsed match:', match, 'for target:', target);

            if (match) await this.setCache(sentence, target, langCode, match);
            return match;
        } catch (e) {
            L('[LLM] Request failed for', this.endpoint, 'model', this.resolvedModel || this.model, ':', e.message || e, 'stack:', e.stack);
            return null;
        }
    },

    // --- Response parsing ---
    _parseResponse(raw, sentence) {
        if (!raw) return null;
        try {
            // Try full JSON first
            let jsonMatch = raw.match(/\{[\s\S]*?"match"[\s\S]*?\}/);
            if (!jsonMatch) {
                // Model may have just completed the value from our partial prompt
                // e.g. raw = '帯びていた"}' or '帯びていた"}\n'
                const valMatch = raw.match(/^([^"}\n]+)/);
                if (valMatch && valMatch[1].trim()) {
                    const candidate = valMatch[1].trim();
                    if (sentence.includes(candidate)) {
                        L('[LLM] Parsed from completion:', candidate);
                        return candidate;
                    }
                }
                return null;
            }
            const parsed = JSON.parse(jsonMatch[0]);
            const match = parsed.match;
            if (!match || match === '') return null;
            if (!sentence.includes(match)) {
                L('[LLM] Hallucinated match:', match);
                return null;
            }
            return match;
        } catch (e) {
            L('[LLM] Parse error:', e.message, 'Raw:', raw);
            return null;
        }
    },

    // --- Listening comprehension ---
    buildListeningPrompt(words, langCode, level) {
        const langName = this._getLangName(langCode);
        const joined = words.join(', ');
        let levelHint = '';
        if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
            const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level];
            levelHint = `\nThe learner is at ${difficulty} level. Use simpler vocabulary and shorter sentences for lower levels; more natural, idiomatic expressions for higher levels.`;
        }

        return `Write a short listening passage (3-5 sentences) in ${langName} using these words: ${joined}${levelHint}

The passage should use natural spoken language that a learner would hear in everyday conversation.

After the passage, write 1 comprehension question with exactly 3 answer choices (A, B, C) and mark the correct answer.

Format exactly like this:
PASSAGE:
(the passage text in ${langName})

QUESTION:
(the question in ${langName})
A) ...
B) ...
C) ...
ANSWER: (letter)`;
    },

    async getListeningPassage(words, langCode, level) {
        if (!this.available || !this.hasModel) return null;
        try {
            const prompt = this.buildListeningPrompt(words, langCode, level);
            const raw = await this.generate({
                prompt,
                system: 'You are a language learning assistant. Write natural, conversational text suitable for listening practice. Follow the format exactly.',
                options: { temperature: 0.5, num_predict: 384 },
                timeout: 45000
            });
            if (!raw) return null;
            const passage = this._extractListeningPassage(raw);
            const question = this._extractListeningQuestion(raw);
            return { passage, question, raw };
        } catch (e) {
            L('[LLM] Listening passage failed:', e.message);
            return null;
        }
    },

    _extractListeningPassage(raw) {
        const m = raw.match(/PASSAGE:\s*\n([\s\S]*?)(?=\n\s*QUESTION:)/i);
        return m ? m[1].trim() : null;
    },

    _extractListeningQuestion(raw) {
        const m = raw.match(/QUESTION:\s*\n([\s\S]*?)(?=\n\s*ANSWER:)/i);
        if (!m) return null;
        const block = m[1].trim();
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        const question = lines[0] || '';
        const choices = lines.slice(1).filter(l => /^[A-C]\)/i.test(l));
        const answerMatch = raw.match(/ANSWER:\s*([A-C])/i);
        const answer = answerMatch ? answerMatch[1].toUpperCase() : null;
        return { question, choices, answer };
    },

    // --- Grammar explanation ---
    buildGrammarExplanationPrompt(word, context, langCode, level) {
        const langName = this._getLangName(langCode);
        let levelHint = '';
        if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
            const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level];
            levelHint = `\nThe learner is at ${difficulty} level. Adjust the explanation accordingly — keep it simple for beginners, more detailed for advanced learners.`;
        }

        return `Explain the grammar of the word "${word}" as used in this ${langName} sentence: "${context}"${levelHint}

Provide your answer in this exact format:
GRAMMAR: (the grammar rule or pattern this word demonstrates)
USAGE: (how the word is used in the given sentence, in 1-2 sentences)
EXAMPLE: (a simpler ${langName} example sentence using the same grammar pattern, at the learner's level)`;
    },

    async getGrammarExplanation(word, context, langCode, level) {
        if (!this.available || !this.hasModel) return null;
        try {
            const prompt = this.buildGrammarExplanationPrompt(word, context, langCode, level);
            const raw = await this.generate({
                prompt,
                system: 'You are a language learning assistant. Give concise, accurate grammar explanations. Follow the format exactly.',
                options: { temperature: 0.3, num_predict: 256 },
                timeout: 30000
            });
            if (!raw) return null;
            const parsed = this._extractGrammarExplanation(raw);
            if (parsed) {
                let result = '';
                if (parsed.grammar) result += 'GRAMMAR: ' + parsed.grammar;
                if (parsed.usage) result += (result ? '\n' : '') + 'USAGE: ' + parsed.usage;
                if (parsed.example) result += (result ? '\n' : '') + 'EXAMPLE: ' + parsed.example;
                return result || raw.trim();
            }
            return raw.trim();
        } catch (e) {
            L('[LLM] Grammar explanation failed:', e.message);
            return null;
        }
    },

    _extractGrammarExplanation(raw) {
        if (!raw) return null;
        const grammar = raw.match(/GRAMMAR:\s*([\s\S]*?)(?=USAGE:|$)/i);
        const usage = raw.match(/USAGE:\s*([\s\S]*?)(?=EXAMPLE:|$)/i);
        const example = raw.match(/EXAMPLE:\s*([\s\S]*?)$/i);
        if (!grammar && !usage && !example) return null;
        return {
            grammar: grammar ? grammar[1].trim() : null,
            usage: usage ? usage[1].trim() : null,
            example: example ? example[1].trim() : null
        };
    }
});
