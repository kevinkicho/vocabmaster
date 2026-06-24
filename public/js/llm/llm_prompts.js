/* js/llm/llm_prompts.js — All build*Prompt functions for LLMResponseValidator */
LLMResponseValidator.prototype._getLangName = function(code) {
    var map = {
        ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
        en: 'English', es: 'Spanish', fr: 'French',
        de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian'
    };
    return map[code] || code;
};

LLMResponseValidator.prototype.buildClozePrompt = function(sentence, target, langCode, level, knownLang) {
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    return 'Find the EXACT word/phrase from the sentence that corresponds to the target word.\nSentence: "' + sentence + '"\nTarget: "' + target + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "match": "exact_text_from_sentence"\n}\n\nRules:\n- The "match" MUST appear verbatim in the sentence\n- For conjugated verbs, return the conjugated form (e.g., "食べた" not "食べる")\n- For particles/compounds, return the full surface form\n- Case-sensitive for Latin scripts';
};

LLMResponseValidator.prototype.buildGeneratedClozePrompt = function(target, langCode, level, knownLang) {
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '. Ensure grammar and vocabulary are appropriate for this level.'
        : '';
    return 'Generate a natural, single sentence in ' + langName + ' that logically incorporates the target word/phrase.\nTarget: "' + target + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "sentence": "The full sentence in ' + langName + '",\n  "match": "exact_text_from_sentence"\n}\n\nRules:\n- "sentence": Must be entirely in ' + langName + '. Length should be 1-2 clauses, natural context.\n- "match": Must be the exact verbatim string from the generated sentence that corresponds to the target word.\n- For conjugated verbs, the "match" must be the conjugated form (e.g., "comió" not "comer").\n- Output MUST be valid JSON only.';
};

LLMResponseValidator.prototype.buildGrammarPrompt = function(word, context, langCode, level, knownLang) {
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    return 'Explain the grammar of "' + word + '" in this ' + langName + ' sentence: "' + context + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "grammar": "grammar rule/pattern name",\n  "usage": "how the word functions in this specific sentence (1-2 sentences in ' + knownLangName + ')",\n  "example": "simpler ' + langName + ' sentence using same pattern at learner\'s level"\n}\n\nRules:\n- "grammar": concise rule name (e.g., "Past tense -ta form", "Topic marker は")\n- "usage": specific to the given sentence context, in ' + knownLangName + '\n- "example": MUST be in ' + langName + ', simpler than context, same pattern';
};

LLMResponseValidator.prototype.buildListeningPrompt = function(words, langCode, level, knownLang) {
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var joined = words.join(', ');
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    return 'Write a short listening passage (3-5 sentences) in ' + langName + ' using these words: ' + joined + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "passage": "the passage text in ' + langName + '",\n  "question": "comprehension question in ' + knownLangName + '",\n  "choices": [\n    {"letter": "A", "text": "choice A in ' + knownLangName + '"},\n    {"letter": "B", "text": "choice B in ' + knownLangName + '"},\n    {"letter": "C", "text": "choice C in ' + knownLangName + '"}\n  ],\n  "answer": "A"\n\nRules:\n- Passage: natural spoken language, 3-5 sentences, in ' + langName + '\n- Question: answerable from passage only, in ' + knownLangName + '\n- Choices: exactly 3, lettered A/B/C, in ' + knownLangName + '\n- Answer: single letter A/B/C matching correct choice';
};

LLMResponseValidator.prototype.buildGrammarExercisePrompt = function(word, context, langCode, level, knownLang) {
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var levelHint = '';
    if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
        levelHint = '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.';
    }
    return 'You are a ' + langName + ' language coach. Generate 6-12 exercises (aim for 8) for the grammar rule "' + word + '" from "' + context + '".' + levelHint + '\n\nUse each type at most once: text_dm, you_decide, fix_sign, translation_fail, culture_check, declarative, interrogative, imperative, exclamative, operative, conditional, exhortation.\n\nRules:\n- Correct answer MUST contain or demonstrate the grammar rule.\n- Wrong choices must be plausible.\n\nOutput JSON: { "grammar": "rule name", "usage": "how it works (1-2 sentences in ' + knownLangName + ')", "example": "one ' + langName + ' example", "exercises": [{ "type": "...", "question": "scenario in ' + knownLangName + '", "choices": [{"letter":"A","text":"option in ' + langName + '"},{"letter":"B","text":"option in ' + langName + '"}], "answer": "A", "explanation": "why correct in ' + knownLangName + '" }] }';
};

LLMResponseValidator.prototype.buildStoryPrompt = function(storyWords, langCode, level, knownLang, isRetry, previousError) {
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var wordList = storyWords.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    var retryHint = isRetry
        ? '\n\nPREVIOUS ERROR: ' + previousError + '\nFix format.'
        : '';
    return 'Write a story in ' + langName + ' using: ' + wordList + levelHint + retryHint + '\n\nThen write its ' + knownLangName + ' translation and 2 comprehension questions (correct + wrong answer, both with translation in ' + knownLangName + ', plus explanation in ' + knownLangName + ').\n\nJSON format:\n{\n  "story": "in ' + langName + '",\n  "translation": "in ' + knownLangName + '",\n  "questions": [\n    {\n      "question": "in ' + langName + '",\n      "answer": {"text": "", "translation": "in ' + knownLangName + '"},\n      "wrong": {"text": "", "translation": "in ' + knownLangName + '"},\n      "explanation": "1-2 sentences in ' + knownLangName + '"\n    }\n  ]\n}\n\nRules: story 5-8 sentences, all target words used naturally. No markdown. Questions answerable from story only. explanation: why correct answer is right vs wrong, in context, in ' + knownLangName + '.';
};

LLMResponseValidator.prototype.buildParagraphPrompt = function(words, langCode, level, topic, sentenceCount, knownLang, isRetry, previousError) {
    if (topic === undefined) topic = 'daily life';
    if (sentenceCount === undefined) sentenceCount = 10;
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var cefrMap = { 'N5': 'A1', 'N4': 'A2', 'N3': 'B1', 'N2': 'B2', 'N1': 'C1' };
    var cefr = cefrMap[level] || 'A2';
    var wordList = words.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = '\nLearner level: ' + cefr + ' (' + level + '). Use vocabulary and grammar appropriate for this level.';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Write a natural paragraph in ' + langName + ' about "' + topic + '" for a ' + cefr + ' learner (' + level + ').\nTarget words to include naturally: ' + wordList + '\nSentence count: ' + sentenceCount + ' (varied length, connected flow)' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "paragraph": "full paragraph text in ' + langName + ', all target words used naturally",\n  "targetWords": ["word1", "word2", "word3"],\n  "cefrLevel": "' + cefr + '",\n  "topic": "' + topic + '",\n  "audioCues": [\n    {"text": "first sentence", "startMs": 0, "endMs": 2000},\n    {"text": "second sentence", "startMs": 2000, "endMs": 4000}\n  ]\n}\n\nRULES:\n- Paragraph: ' + sentenceCount + ' sentences, coherent narrative, all target words appear verbatim\n- CEFR-appropriate: A1=simple present, short sentences; A2=past tense, connectors; B1=subjunctive, relative clauses; B2=idioms, nuance\n- audioCues: one per sentence, realistic timing (approx 150-200 words/min)\n- Topic: everyday situations (shopping, travel, work, school, hobbies)\n- All field descriptions and instructions above are in ' + knownLangName + ' but paragraph content must be in ' + langName + feedback;
};

LLMResponseValidator.prototype.buildQuizPrompt = function(words, langCode, level, types, count, knownLang, isRetry, previousError) {
    if (types === undefined) types = ['multiple_choice', 'fill_blank'];
    if (count === undefined) count = 5;
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var wordList = words.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = level ? '\nLearner level: ' + (LLMService.LEVEL_DIFFICULTY_MAP[level] || level) + '.' : '';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Generate ' + count + ' quiz questions in ' + langName + ' for ' + levelHint + ' using these words: ' + wordList + '\nQuestion types: ' + types.join(', ') + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "questions": [\n    {\n      "type": "multiple_choice",\n      "prompt": "question or fill-in-the-blank sentence in ' + langName + '",\n      "choices": [{"letter": "A", "text": "choice A in ' + langName + '"}, {"letter": "B", "text": "choice B in ' + langName + '"}, {"letter": "C", "text": "choice C in ' + langName + '"}, {"letter": "D", "text": "choice D in ' + langName + '"}],\n      "answer": "B",\n      "explanation": "why this is correct and others are not (1 sentence, in ' + knownLangName + ')",\n      "targetWord": "target word from list",\n      "difficulty": "medium"\n    }\n  ],\n  "metadata": {"sourceWords": ["word1", "word2"], "level": "' + level + '", "count": ' + count + '}\n}\n\nRULES:\n- multiple_choice: exactly 4 choices (A/B/C/D), one clearly correct\n- fill_blank: choices = null, answer = exact word/phrase, prompt has _____ blank\n- true_false: choices = [{"letter":"A","text":"True"},{"letter":"B","text":"False"}], answer = A or B\n- Explanation: pedagogical, references grammar/usage, not just "correct because...", in ' + knownLangName + '\n- Difficulty distribution: 40% easy, 40% medium, 20% hard\n- Each question targets ONE word from the list' + feedback;
};

LLMResponseValidator.prototype.buildExplanationPrompt = function(word, context, langCode, level, knownLang, isRetry, previousError) {
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var levelHint = level ? '\nLearner level: ' + (LLMService.LEVEL_DIFFICULTY_MAP[level] || level) + '.' : '';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Explain the word "' + word + '" as used in this ' + langName + ' sentence: "' + context + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "word": "' + word + '",\n  "definition": "clear 1-sentence definition in ' + knownLangName + '",\n  "nuance": "when to use this vs similar words, connotations, formality level (in ' + knownLangName + ')",\n  "register": "formal|casual|polite|slang|literary",\n  "collocations": ["common phrase 1", "common phrase 2", "common phrase 3"],\n  "culturalNote": "cultural context in ' + knownLangName + ' or null if none",\n  "commonMistakes": [\n    {"mistake": "common error learners make (in ' + knownLangName + ')", "correction": "correct form with brief why (in ' + knownLangName + ')"}\n  ],\n  "examples": [\n    {"sentence": "simpler example in ' + langName + '", "translation": "in ' + knownLangName + '"},\n    {"sentence": "another example", "translation": "in ' + knownLangName + '"}\n  ]\n}\n\nRULES:\n- nuance: specific, not generic (e.g., "implies speaker\'s emotion" not "has nuance"), in ' + knownLangName + '\n- register: single value from enum\n- collocations: 3+ natural phrases native speakers use\n- culturalNote: null or specific cultural insight (e.g., "used when offering food to guests"), in ' + knownLangName + '\n- commonMistakes: real learner errors (particle confusion, wrong conjugation, register mismatch), described in ' + knownLangName + '\n- examples: simpler than context, same grammar pattern, at learner\'s level, translation in ' + knownLangName + feedback;
};

LLMResponseValidator.prototype.buildConversationPrompt = function(words, langCode, level, scenario, knownLang, isRetry, previousError) {
    if (scenario === undefined) scenario = 'daily conversation';
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var wordList = words.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = level ? '\nLearner level: ' + (LLMService.LEVEL_DIFFICULTY_MAP[level] || level) + '.' : '';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Write a natural dialogue in ' + langName + ' for "' + scenario + '" at ' + levelHint + '\nTarget words to include: ' + wordList + '\nTurns: 6-8 (alternating A/B)\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "scenario": "' + scenario + '",\n  "turns": [\n    {"speaker": "A", "text": "dialogue line in ' + langName + '", "translation": "in ' + knownLangName + '", "audioHint": "polite"},\n    {"speaker": "B", "text": "response in ' + langName + '", "translation": "in ' + knownLangName + '", "audioHint": "casual"}\n  ],\n  "targetWords": ["word1", "word2"],\n  "completionExercise": {\n    "missingTurn": 4,\n    "options": [\n      {"letter": "A", "text": "option A in ' + langName + '"},\n      {"letter": "B", "text": "option B in ' + langName + '"},\n      {"letter": "C", "text": "option C in ' + langName + '"},\n      {"letter": "D", "text": "option D in ' + langName + '"}\n    ],\n    "correct": "B"\n  }\n}\n\nRULES:\n- Turns alternate A/B/A/B naturally\n- audioHint: "polite" (desu/mas, honorifics) or "casual" (plain form, slang)\n- Target words appear naturally in context\n- Completion exercise: remove one turn, give 4 options, one correct\n- Scenario-appropriate register (shopping=polite, friends=casual)\n- Translation fields in ' + knownLangName + feedback;
};

LLMResponseValidator.prototype.buildFeedbackPrompt = function(sessionData, knownLang, isRetry, previousError) {
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var accuracy = sessionData.accuracy;
    var interactions = sessionData.interactions;
    var level = sessionData.level;
    var langCode = sessionData.langCode;
    var langName = this._getLangName(langCode);
    var knownLangName = this._getLangName(knownLang);
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Analyze this ' + langName + ' learning session for a ' + level + ' learner and provide personalized feedback in ' + knownLangName + '.\n\nSESSION DATA:\n- Overall accuracy: ' + (accuracy.overall * 100).toFixed(0) + '%\n- By activity: ' + JSON.stringify(accuracy.byType) + '\n- Interactions: ' + interactions.length + ' total\n- Recent patterns: ' + this.summarizeInteractions(interactions) + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "summary": "encouraging 2-3 sentence summary in ' + knownLangName + ' highlighting progress and one key insight",\n  "accuracy": {"overall": ' + accuracy.overall + ', "byType": ' + JSON.stringify(accuracy.byType) + '},\n  "weakWords": [\n    {"word": "word", "errors": 3, "pattern": "specific error pattern (e.g., confuses に/で)"}\n  ],\n  "strongWords": [\n    {"word": "word", "streak": 5}\n  ],\n  "recommendations": [\n    {"type": "review|practice|new", "priority": 1, "description": "specific actionable recommendation in ' + knownLangName + '", "words": ["word1", "word2"]}\n  ],\n  "nextSessionFocus": "one sentence in ' + knownLangName + ': what to focus on next session"\n}\n\nRULES:\n- summary: positive, specific, references actual data, in ' + knownLangName + '\n- weakWords: max 5, from actual errors, pattern = actionable insight\n- strongWords: max 5, from actual streaks\n- recommendations: 3-5, prioritized, type = review (revisit), practice (drill), new (learn), descriptions in ' + knownLangName + '\n- nextSessionFocus: concrete, one thing, in ' + knownLangName + feedback;
};

LLMResponseValidator.prototype.summarizeInteractions = function(interactions) {
    var patterns = {};
    interactions.forEach(function(i) {
        if (i.userActions) {
            i.userActions.forEach(function(a) {
                var key = i.role + ':' + a.type;
                patterns[key] = (patterns[key] || 0) + 1;
            });
        }
    });
    return Object.entries(patterns).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(kv){return kv[0]+':'+kv[1];}).join(', ');
};
