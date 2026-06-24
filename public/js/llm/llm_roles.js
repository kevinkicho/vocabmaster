/* js/llm/llm_roles.js — Feature role methods for LLMService */
function _getExplainLang() {
    try {
        // Derive explanation language from the preset source ("I know...") language
        if (window.app && window.app.store && window.app.store.prefs && window.app.store.prefs.presetSource) {
            return window.app.store.prefs.presetSource;
        }
    } catch(e) {}
    return 'en';
}

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
        onProgress: null,
        knownLangCode: _getExplainLang()
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
        onProgress: null,
        knownLangCode: _getExplainLang()
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
        onProgress: null,
        knownLangCode: _getExplainLang()
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
        onProgress: onProgress,
        knownLangCode: _getExplainLang()
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
    if (validExercises.length < 6) {
        L('[Grammar] Save skipped: only', validExercises.length, 'valid exercises (need 6)');
        return;
    }
    var token = Math.random().toString(36).slice(2, 8);
    var explainLang = _getExplainLang();
    var entry = {
        grammar: data.grammar,
        usage: data.usage,
        example: data.example,
        exercises: validExercises,
        model: this.resolvedModel || 'unknown',
        ts: firebase.database.ServerValue.TIMESTAMP
    };
    try {
        await db.ref('grammar_exercises/' + vocabId + '/' + langCode + '/' + explainLang + '/' + token).set(entry);
        L('[Grammar] Saved to RTDB:', vocabId, langCode, explainLang, token);
    } catch(e) {
        L('[Grammar] RTDB save error:', e.message, 'code:', e.code);
    }
};

LLMService.prototype.loadCachedGrammarExercise = async function(vocabId, langCode) {
    if (!db) return null;
    try {
        var prefLang = _getExplainLang();
        // New path: grammar_exercises/{vocabId}/{langCode}/{explainLang} — direct indexed lookup
        var snap = await db.ref('grammar_exercises/' + vocabId + '/' + langCode + '/' + prefLang).limitToLast(1).once('value');
        if (snap.exists()) {
            var entry = null;
            snap.forEach(function(child) { entry = child.val(); });
            if (entry && entry.exercises && entry.exercises.length > 0) {
                var exercises = entry.exercises.map(function(ex) {
                    var labels = LLMService.resolveLabels(ex.type, ex.answer);
                    return Object.assign({}, ex, { labelA: labels.labelA, labelB: labels.labelB });
                });
                L('[Grammar] Loaded cached from RTDB (explainLang=' + prefLang + '):', vocabId, langCode);
                return {
                    grammar: entry.grammar,
                    usage: entry.usage,
                    example: entry.example,
                    exercises: exercises,
                    raw: JSON.stringify(entry),
                    critiqueScore: null,
                    fromCache: true
                };
            }
        }
        // Fallback: old path grammar_exercises/{vocabId}/{langCode} (pre-migration entries)
        var oldSnap = await db.ref('grammar_exercises/' + vocabId + '/' + langCode).limitToLast(5).once('value');
        if (!oldSnap.exists() || !oldSnap.val()) return null;
        var candidates = [];
        oldSnap.forEach(function(child) {
            // Only include leaf entries (have exercises array, not sub-paths)
            if (child.val() && Array.isArray(child.val().exercises)) {
                candidates.push(child.val());
            }
        });
        if (candidates.length === 0) return null;
        var entry = null;
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].explainLang === prefLang) {
                entry = candidates[i];
                break;
            }
        }
        if (!entry) entry = candidates[candidates.length - 1] || candidates[0];
        if (!entry || !entry.exercises || entry.exercises.length === 0) return null;
        var exercises = entry.exercises.map(function(ex) {
            var labels = LLMService.resolveLabels(ex.type, ex.answer);
            return Object.assign({}, ex, { labelA: labels.labelA, labelB: labels.labelB });
        });
        L('[Grammar] Loaded cached from RTDB (old path, explainLang=' + (entry.explainLang || 'en') + '):', vocabId, langCode);
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
        onProgress: onProgress,
        knownLangCode: _getExplainLang()
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
        onProgress: null,
        knownLangCode: _getExplainLang()
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
        onProgress: null,
        knownLangCode: _getExplainLang()
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
        onProgress: null,
        knownLangCode: _getExplainLang()
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
        onProgress: null,
        knownLangCode: _getExplainLang()
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
        onProgress: null,
        knownLangCode: _getExplainLang()
    });
    return result.data;
};