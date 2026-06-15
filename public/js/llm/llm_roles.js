/* js/llm/llm_roles.js — Feature role methods for LLMService */
LLMService.prototype.findClozeMatch = async function(sentence, target, langCode, level) {
    if (!this.validator) this.initValidator();
    var cached = await this.getFromCache(sentence, target, langCode);
    if (cached !== null && cached !== '') return cached;
    if (!this.available || !this.hasModel) return null;

    var levelHint = '';
    if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
        var difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level];
        levelHint = '\nThe learner is at ' + difficulty + ' level. Focus on base forms and common conjugations typical for that level.';
    }

    try {
        var prompt = 'Sentence: ' + sentence + '\nWord: ' + target + levelHint + '\nThe part of the sentence to blank out is: {"match":"';

        var raw = await this.generate({
            prompt: prompt,
            system: 'Complete the JSON. Output only the value and closing brackets. No explanation.',
            options: { temperature: 0, num_predict: 64 },
            timeout: 30000
        });

        L('[LLM] Raw response:', raw);
        var match = this._parseResponse(raw, sentence);
        L('[LLM] Parsed match:', match, 'for target:', target);

        if (match) await this.setCache(sentence, target, langCode, match);
        return match;
    } catch (e) {
        L('[LLM] Request failed for', this.endpoint, 'model', this.resolvedModel || this.model, ':', e.message || e, 'stack:', e.stack);
        return null;
    }
};

LLMService.prototype._parseResponse = function(raw, sentence) {
    if (!raw) return null;
    try {
        var jsonMatch = raw.match(/\{[\s\S]*?"match"[\s\S]*?\}/);
        if (!jsonMatch) {
            var valMatch = raw.match(/^([^"}\n]+)/);
            if (valMatch && valMatch[1].trim()) {
                var candidate = valMatch[1].trim();
                if (sentence.includes(candidate)) {
                    L('[LLM] Parsed from completion:', candidate);
                    return candidate;
                }
            }
            return null;
        }
        var parsed = JSON.parse(jsonMatch[0]);
        var match = parsed.match;
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
};

LLMService.prototype.getGrammarExplanation = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'grammarExplanation',
        promptBuilder: this.validator.buildGrammarPrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [word, context, langCode, level],
        onProgress: null
    });
    if (!result.data) return null;
    return 'GRAMMAR: ' + result.data.grammar + '\nUSAGE: ' + result.data.usage + '\nEXAMPLE: ' + result.data.example;
};

LLMService.prototype.getListeningPassage = async function(words, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'listeningPassage',
        promptBuilder: this.validator.buildListeningPrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [words, langCode, level],
        onProgress: null
    });
    if (!result.data) return null;
    return {
        passage: result.data.passage,
        question: { text: result.data.question, choices: result.data.choices, correct: result.data.answer },
        raw: JSON.stringify(result.data),
        critiqueScore: result.critiqueScore
    };
};

LLMService.prototype.generateClozeSentence = async function(target, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'generatedCloze',
        promptBuilder: this.validator.buildGeneratedClozePrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [target, langCode, level],
        onProgress: null
    });
    return result.data || null;
};

LLMService.prototype.getGrammarExercise = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var onProgress = arguments[4];
    var vocabId = arguments[5];
    var result = await this.validator.generateWithCritic({
        schemaName: 'grammarExercise',
        promptBuilder: this.validator.buildGrammarExercisePrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [word, context, langCode, level],
        onProgress: onProgress
    });
    if (!result.data) return null;
    var exercises = (result.data.exercises || []).map(function(ex) {
        var labels = LLMService.resolveLabels(ex.type, ex.answer);
        return Object.assign({}, ex, { labelA: labels.labelA, labelB: labels.labelB });
    });
    var data = {
        grammar: result.data.grammar,
        usage: result.data.usage,
        example: result.data.example,
        exercises: exercises,
        raw: JSON.stringify(result.data),
        critiqueScore: result.critiqueScore
    };
    if (vocabId && langCode) {
        this.saveGrammarExercise(vocabId, langCode, data).catch(function(e) { L('[Grammar] RTDB save failed:', e.message); });
    }
    return data;
};

LLMService.prototype.saveGrammarExercise = async function(vocabId, langCode, data) {
    if (!db) { L('[Grammar] Save skipped: no db'); return; }
    if (!auth) { L('[Grammar] Save skipped: no auth'); return; }
    if (!auth.currentUser) { L('[Grammar] Save skipped: no currentUser'); return; }
    if (!data || !data.exercises || data.exercises.length === 0) {
        L('[Grammar] Save skipped: no valid exercises');
        return;
    }
    var validExercises = data.exercises.filter(function(ex) {
        return ex.type && ex.question && ex.choices && ex.choices.length >= 2 && ex.answer && ex.explanation;
    });
    if (validExercises.length < 12) {
        L('[Grammar] Save skipped: only', validExercises.length, 'valid exercises (need 12)');
        return;
    }
    var token = Math.random().toString(36).slice(2, 8);
    var entry = {
        grammar: data.grammar,
        usage: data.usage,
        example: data.example,
        exercises: validExercises,
        model: this.resolvedModel || 'unknown',
        ts: firebase.database.ServerValue.TIMESTAMP
    };
    try {
        await db.ref('grammar_exercises/' + vocabId + '/' + langCode + '/' + token).set(entry);
        L('[Grammar] Saved to RTDB:', vocabId, langCode, token);
    } catch(e) {
        L('[Grammar] RTDB save error:', e.message, 'code:', e.code);
    }
};

LLMService.prototype.loadCachedGrammarExercise = async function(vocabId, langCode) {
    if (!db) return null;
    try {
        var snap = await db.ref('grammar_exercises/' + vocabId + '/' + langCode).limitToLast(1).once('value');
        if (!snap.exists()) return null;
        var entry = null;
        snap.forEach(function(child) { entry = child.val(); });
        if (!entry || !entry.exercises || entry.exercises.length === 0) return null;
        var exercises = entry.exercises.map(function(ex) {
            var labels = LLMService.resolveLabels(ex.type, ex.answer);
            return Object.assign({}, ex, { labelA: labels.labelA, labelB: labels.labelB });
        });
        L('[Grammar] Loaded cached from RTDB:', vocabId, langCode);
        return {
            grammar: entry.grammar,
            usage: entry.usage,
            example: entry.example,
            exercises: exercises,
            raw: JSON.stringify(entry),
            critiqueScore: null,
            fromCache: true
        };
    } catch(e) {
        L('[Grammar] Cache load failed:', e.message);
        return null;
    }
};

LLMService.prototype.generateStory = async function(storyWords, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var onProgress = arguments[3];
    var result = await this.validator.generateWithCritic({
        schemaName: 'storyWithQuestions',
        promptBuilder: this.validator.buildStoryPrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [storyWords, langCode, level],
        onProgress: onProgress
    });
    if (result.data) {
        result.data.critiqueScore = result.critiqueScore;
    }
    return result.data;
};

LLMService.prototype.generateParagraph = async function(words, langCode, level, topic) {
    if (topic === undefined) topic = 'daily life';
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'paragraph',
        promptBuilder: this.validator.buildParagraphPrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [words, langCode, level, topic],
        onProgress: null
    });
    return result.data;
};

LLMService.prototype.generateQuiz = async function(words, langCode, level, types, count) {
    if (types === undefined) types = ['multiple_choice', 'fill_blank'];
    if (count === undefined) count = 5;
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'quiz',
        promptBuilder: this.validator.buildQuizPrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [words, langCode, level, types, count],
        onProgress: null
    });
    return result.data;
};

LLMService.prototype.generateExplanation = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'explanation',
        promptBuilder: this.validator.buildExplanationPrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [word, context, langCode, level],
        onProgress: null
    });
    return result.data;
};

LLMService.prototype.generateConversation = async function(words, langCode, level, scenario) {
    if (scenario === undefined) scenario = 'daily conversation';
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'conversation',
        promptBuilder: this.validator.buildConversationPrompt.bind(this.validator),
        level: level,
        langCode: langCode,
        promptArgs: [words, langCode, level, scenario],
        onProgress: null
    });
    return result.data;
};

LLMService.prototype.generateFeedback = async function(sessionData) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    var result = await this.validator.generateWithCritic({
        schemaName: 'feedback',
        promptBuilder: this.validator.buildFeedbackPrompt.bind(this.validator),
        level: sessionData.level,
        langCode: sessionData.langCode,
        promptArgs: [sessionData],
        onProgress: null
    });
    return result.data;
};