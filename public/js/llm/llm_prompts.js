/* js/llm/llm_prompts.js — All build*Prompt functions for LLMResponseValidator */
function _getLangName(code) {
    var map = {
        ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
        en: 'English', es: 'Spanish', fr: 'French',
        de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian'
    };
    return map[code] || code;
}

LLMResponseValidator.prototype.buildClozePrompt = function(sentence, target, langCode, level) {
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    return 'Find the EXACT word/phrase from the sentence that corresponds to the target word.\nSentence: "' + sentence + '"\nTarget: "' + target + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "match": "exact_text_from_sentence"\n}\n\nRules:\n- The "match" MUST appear verbatim in the sentence\n- For conjugated verbs, return the conjugated form (e.g., "食べた" not "食べる")\n- For particles/compounds, return the full surface form\n- Case-sensitive for Latin scripts';
};

LLMResponseValidator.prototype.buildGeneratedClozePrompt = function(target, langCode, level) {
    var langName = _getLangName(langCode);
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '. Ensure grammar and vocabulary are appropriate for this level.'
        : '';
    return 'Generate a natural, single sentence in ' + langName + ' that logically incorporates the target word/phrase.\nTarget: "' + target + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "sentence": "The full sentence in ' + langName + '",\n  "match": "exact_text_from_sentence"\n}\n\nRules:\n- "sentence": Must be entirely in ' + langName + '. Length should be 1-2 clauses, natural context.\n- "match": Must be the exact verbatim string from the generated sentence that corresponds to the target word.\n- For conjugated verbs, the "match" must be the conjugated form (e.g., "comió" not "comer").\n- Output MUST be valid JSON only.';
};

LLMResponseValidator.prototype.buildGrammarPrompt = function(word, context, langCode, level) {
    var langName = _getLangName(langCode);
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    return 'Explain the grammar of "' + word + '" in this ' + langName + ' sentence: "' + context + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "grammar": "grammar rule/pattern name",\n  "usage": "how the word functions in this specific sentence (1-2 sentences)",\n  "example": "simpler ' + langName + ' sentence using same pattern at learner\'s level"\n}\n\nRules:\n- "grammar": concise rule name (e.g., "Past tense -ta form", "Topic marker は")\n- "usage": specific to the given sentence context\n- "example": MUST be in ' + langName + ', simpler than context, same pattern';
};

LLMResponseValidator.prototype.buildListeningPrompt = function(words, langCode, level) {
    var langName = _getLangName(langCode);
    var joined = words.join(', ');
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    return 'Write a short listening passage (3-5 sentences) in ' + langName + ' using these words: ' + joined + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "passage": "the passage text in ' + langName + '",\n  "question": "comprehension question in ' + langName + '",\n  "choices": [\n    {"letter": "A", "text": "choice A"},\n    {"letter": "B", "text": "choice B"},\n    {"letter": "C", "text": "choice C"}\n  ],\n  "answer": "A"\n\nRules:\n- Passage: natural spoken language, 3-5 sentences\n- Question: answerable from passage only\n- Choices: exactly 3, lettered A/B/C\n- Answer: single letter A/B/C matching correct choice';
};

LLMResponseValidator.prototype.buildGrammarExercisePrompt = function(word, context, langCode, level) {
    var langName = _getLangName(langCode);
    var levelHint = '';
    if (level && LLMService.LEVEL_DIFFICULTY_MAP[level]) {
        var d = LLMService.LEVEL_DIFFICULTY_MAP[level];
        var tone = d.startsWith('beginner') || d.startsWith('elementary')
            ? 'light, simple, focused on surviving daily situations (ordering food, asking for prices, greetings)'
            : d.includes('intermediate')
                ? 'natural conversations, cultural situations, handling minor conflicts or misunderstandings'
                : 'sophisticated interactions, professional contexts, humor and wordplay';
        levelHint = '\nLearner is ' + d + '. Tone should match — ' + tone + '.';
    }
    return 'You are a ' + langName + ' language coach. Generate 12 exercises for the grammar rule "' + word + '" from "' + context + '".' + levelHint + '\n\nEach exercise type must be used exactly once: text_dm, you_decide, fix_sign, translation_fail, culture_check, declarative, interrogative, imperative, exclamative, operative, conditional, exhortation.\n\nRules:\n- The correct answer MUST contain or demonstrate the grammar rule.\n- The two choices MUST be different.\n- Give each exercise a unique, real-life scenario with stakes.\n- Questions and explanations in English. Choices in ' + langName + '.\n- Wrong choices must be plausible.\n- ANSWER BALANCE: Exactly 6 of the 12 exercises must have answer="A" and exactly 6 must have answer="B".\n\nOutput only JSON with no extra text:\n{\n  "grammar": "friendly name of the grammar rule",\n  "usage": "how the word works (1-2 sentences, English)",\n  "example": "one ' + langName + ' example NOT used in any exercise",\n  "exercises": [\n    {\n      "type": "text_dm",\n      "question": "Scenario in English (1-3 sentences)",\n      "choices": [\n        {"letter": "A", "text": "option A in ' + langName + '"},\n        {"letter": "B", "text": "option B in ' + langName + '"}\n      ],\n      "answer": "A",\n      "explanation": "Why the correct choice works, then the grammar rule in 1 sentence."\n    }\n  ]\n}';
};

LLMResponseValidator.prototype.buildStoryPrompt = function(storyWords, langCode, level, isRetry, previousError) {
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = _getLangName(langCode);
    var wordList = storyWords.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
        ? '\nLearner level: ' + LLMService.LEVEL_DIFFICULTY_MAP[level] + '.'
        : '';
    var retryHint = isRetry
        ? '\n\nPREVIOUS RESPONSE WAS INVALID: ' + previousError + '\nFix the format exactly as specified.'
        : '';
    return 'Write a short story in ' + langName + ' using these words: ' + wordList + levelHint + retryHint + '\n\nThe story MUST be written entirely in ' + langName + '. Do not use any other language.\n\nThen write 2 comprehension questions. Each question must have a correct answer (with English translation), one wrong answer (with English translation), and an explanation of why the correct answer is right.\n\nRespond with ONLY this JSON (no extra text, no markdown, no **bold**, no *italic*, no code blocks):\n{\n  "story": "the full story text in ' + langName + ' — plain text only, no formatting",\n  "questions": [\n    {\n      "question": "question 1 in ' + langName + '",\n      "answer": {"text": "correct answer in ' + langName + '", "translation": "English translation of correct answer"},\n      "wrong": {"text": "wrong answer in ' + langName + '", "translation": "English translation of wrong answer"},\n      "explanation": "Why the correct answer is right, referencing the story (1-2 sentences in English)"\n    },\n    {\n      "question": "question 2 in ' + langName + '",\n      "answer": {"text": "correct answer in ' + langName + '", "translation": "English translation of correct answer"},\n      "wrong": {"text": "wrong answer in ' + langName + '", "translation": "English translation of wrong answer"},\n      "explanation": "Why the correct answer is right, referencing the story (1-2 sentences in English)"\n    }\n  ]\n}\n\nRULES:\n- Story: 5-8 sentences, natural flow, all target words used, plain text only (no markdown, no **bold**, no *italic*)\n- Questions: answerable from story only, question text in ' + langName + '\n- answer.text: correct answer in ' + langName + ', directly from the story\n- answer.translation: English translation of the correct answer — REQUIRED\n- wrong.text: plausible but incorrect answer in ' + langName + '\n- wrong.translation: English translation of the wrong answer — REQUIRED\n- explanation: Why the correct answer is right vs wrong. Reference the story. In English. 1-2 sentences. — REQUIRED\n- BOTH answer.translation AND wrong.translation MUST be provided. Never omit either translation.\n- The wrong answer must be different enough from the correct one that the question is meaningful.\n- Output MUST be valid JSON only. No extra text, no explanations, no markdown, no code blocks.\n- The story MUST be written entirely in ' + langName + '. No other language allowed.';
};

LLMResponseValidator.prototype.buildParagraphPrompt = function(words, langCode, level, topic, sentenceCount, isRetry, previousError) {
    if (topic === undefined) topic = 'daily life';
    if (sentenceCount === undefined) sentenceCount = 10;
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = _getLangName(langCode);
    var cefrMap = { 'N5': 'A1', 'N4': 'A2', 'N3': 'B1', 'N2': 'B2', 'N1': 'C1' };
    var cefr = cefrMap[level] || 'A2';
    var wordList = words.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = '\nLearner level: ' + cefr + ' (' + level + '). Use vocabulary and grammar appropriate for this level.';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Write a natural paragraph in ' + langName + ' about "' + topic + '" for a ' + cefr + ' learner (' + level + ').\nTarget words to include naturally: ' + wordList + '\nSentence count: ' + sentenceCount + ' (varied length, connected flow)' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "paragraph": "full paragraph text in ' + langName + ', all target words used naturally",\n  "targetWords": ["word1", "word2", "word3"],\n  "cefrLevel": "' + cefr + '",\n  "topic": "' + topic + '",\n  "audioCues": [\n    {"text": "first sentence", "startMs": 0, "endMs": 2000},\n    {"text": "second sentence", "startMs": 2000, "endMs": 4000}\n  ]\n}\n\nRULES:\n- Paragraph: ' + sentenceCount + ' sentences, coherent narrative, all target words appear verbatim\n- CEFR-appropriate: A1=simple present, short sentences; A2=past tense, connectors; B1=subjunctive, relative clauses; B2=idioms, nuance\n- audioCues: one per sentence, realistic timing (approx 150-200 words/min)\n- Topic: everyday situations (shopping, travel, work, school, hobbies)' + feedback;
};

LLMResponseValidator.prototype.buildQuizPrompt = function(words, langCode, level, types, count, isRetry, previousError) {
    if (types === undefined) types = ['multiple_choice', 'fill_blank'];
    if (count === undefined) count = 5;
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = _getLangName(langCode);
    var wordList = words.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = level ? '\nLearner level: ' + (LLMService.LEVEL_DIFFICULTY_MAP[level] || level) + '.' : '';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Generate ' + count + ' quiz questions in ' + langName + ' for ' + levelHint + ' using these words: ' + wordList + '\nQuestion types: ' + types.join(', ') + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "questions": [\n    {\n      "type": "multiple_choice",\n      "prompt": "question or fill-in-the-blank sentence",\n      "choices": [{"letter": "A", "text": "choice A"}, {"letter": "B", "text": "choice B"}, {"letter": "C", "text": "choice C"}, {"letter": "D", "text": "choice D"}],\n      "answer": "B",\n      "explanation": "why this is correct and others are not (1 sentence)",\n      "targetWord": "target word from list",\n      "difficulty": "medium"\n    }\n  ],\n  "metadata": {"sourceWords": ["word1", "word2"], "level": "' + level + '", "count": ' + count + '}\n}\n\nRULES:\n- multiple_choice: exactly 4 choices (A/B/C/D), one clearly correct\n- fill_blank: choices = null, answer = exact word/phrase, prompt has _____ blank\n- true_false: choices = [{"letter":"A","text":"True"},{"letter":"B","text":"False"}], answer = A or B\n- Explanation: pedagogical, references grammar/usage, not just "correct because..."\n- Difficulty distribution: 40% easy, 40% medium, 20% hard\n- Each question targets ONE word from the list' + feedback;
};

LLMResponseValidator.prototype.buildExplanationPrompt = function(word, context, langCode, level, isRetry, previousError) {
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = _getLangName(langCode);
    var levelHint = level ? '\nLearner level: ' + (LLMService.LEVEL_DIFFICULTY_MAP[level] || level) + '.' : '';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Explain the word "' + word + '" as used in this ' + langName + ' sentence: "' + context + '"' + levelHint + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "word": "' + word + '",\n  "definition": "clear 1-sentence definition",\n  "nuance": "when to use this vs similar words, connotations, formality level",\n  "register": "formal|casual|polite|slang|literary",\n  "collocations": ["common phrase 1", "common phrase 2", "common phrase 3"],\n  "culturalNote": "cultural context or null if none",\n  "commonMistakes": [\n    {"mistake": "common error learners make", "correction": "correct form with brief why"}\n  ],\n  "examples": [\n    {"sentence": "simpler example in ' + langName + '", "translation": "English translation"},\n    {"sentence": "another example", "translation": "English translation"}\n  ]\n}\n\nRULES:\n- nuance: specific, not generic (e.g., "implies speaker\'s emotion" not "has nuance")\n- register: single value from enum\n- collocations: 3+ natural phrases native speakers use\n- culturalNote: null or specific cultural insight (e.g., "used when offering food to guests")\n- commonMistakes: real learner errors (particle confusion, wrong conjugation, register mismatch)\n- examples: simpler than context, same grammar pattern, at learner\'s level' + feedback;
};

LLMResponseValidator.prototype.buildConversationPrompt = function(words, langCode, level, scenario, isRetry, previousError) {
    if (scenario === undefined) scenario = 'daily conversation';
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var langName = _getLangName(langCode);
    var wordList = words.map(function(w) { return w[langCode] || w.ja || w.en; }).filter(Boolean).join(', ');
    var levelHint = level ? '\nLearner level: ' + (LLMService.LEVEL_DIFFICULTY_MAP[level] || level) + '.' : '';
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Write a natural dialogue in ' + langName + ' for "' + scenario + '" at ' + levelHint + '\nTarget words to include: ' + wordList + '\nTurns: 6-8 (alternating A/B)\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "scenario": "' + scenario + '",\n  "turns": [\n    {"speaker": "A", "text": "dialogue line in ' + langName + '", "translation": "English", "audioHint": "polite"},\n    {"speaker": "B", "text": "response in ' + langName + '", "translation": "English", "audioHint": "casual"}\n  ],\n  "targetWords": ["word1", "word2"],\n  "completionExercise": {\n    "missingTurn": 4,\n    "options": [\n      {"letter": "A", "text": "option A in ' + langName + '"},\n      {"letter": "B", "text": "option B in ' + langName + '"},\n      {"letter": "C", "text": "option C in ' + langName + '"},\n      {"letter": "D", "text": "option D in ' + langName + '"}\n    ],\n    "correct": "B"\n  }\n}\n\nRULES:\n- Turns alternate A/B/A/B naturally\n- audioHint: "polite" (desu/mas, honorifics) or "casual" (plain form, slang)\n- Target words appear naturally in context\n- Completion exercise: remove one turn, give 4 options, one correct\n- Scenario-appropriate register (shopping=polite, friends=casual)' + feedback;
};

LLMResponseValidator.prototype.buildFeedbackPrompt = function(sessionData, isRetry, previousError) {
    if (isRetry === undefined) isRetry = false;
    if (previousError === undefined) previousError = '';
    var accuracy = sessionData.accuracy;
    var interactions = sessionData.interactions;
    var level = sessionData.level;
    var langCode = sessionData.langCode;
    var langName = _getLangName(langCode);
    var feedback = isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : '';
    return 'Analyze this ' + langName + ' learning session for a ' + level + ' learner and provide personalized feedback.\n\nSESSION DATA:\n- Overall accuracy: ' + (accuracy.overall * 100).toFixed(0) + '%\n- By activity: ' + JSON.stringify(accuracy.byType) + '\n- Interactions: ' + interactions.length + ' total\n- Recent patterns: ' + this.summarizeInteractions(interactions) + '\n\nRespond with ONLY this JSON (no extra text, no markdown):\n{\n  "summary": "encouraging 2-3 sentence summary highlighting progress and one key insight",\n  "accuracy": {"overall": ' + accuracy.overall + ', "byType": ' + JSON.stringify(accuracy.byType) + '},\n  "weakWords": [\n    {"word": "word", "errors": 3, "pattern": "specific error pattern (e.g., confuses に/で)"}\n  ],\n  "strongWords": [\n    {"word": "word", "streak": 5}\n  ],\n  "recommendations": [\n    {"type": "review|practice|new", "priority": 1, "description": "specific actionable recommendation", "words": ["word1", "word2"]}\n  ],\n  "nextSessionFocus": "one sentence: what to focus on next session"\n}\n\nRULES:\n- summary: positive, specific, references actual data\n- weakWords: max 5, from actual errors, pattern = actionable insight\n- strongWords: max 5, from actual streaks\n- recommendations: 3-5, prioritized, type = review (revisit), practice (drill), new (learn)\n- nextSessionFocus: concrete, one thing' + feedback;
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