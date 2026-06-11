// Extracted prompt builders for LLMResponseValidator
Object.assign(LLMResponseValidator.prototype, {
    buildClozePrompt(sentence, target, langCode, level) {
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        return `Find the EXACT word/phrase from the sentence that corresponds to the target word.
Sentence: "${sentence}"
Target: "${target}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "match": "exact_text_from_sentence"
}

Rules:
- The "match" MUST appear verbatim in the sentence
- For conjugated verbs, return the conjugated form (e.g., "食べた" not "食べる")
- For particles/compounds, return the full surface form
- Case-sensitive for Latin scripts`;
    },

    /**
     * @param {string} target - The vocabulary word to generate a sentence for
     * @param {string} langCode - Language code (e.g., 'es', 'ja')
     * @param {string} level - Optional CEFR level (e.g., 'A1', 'N5')
     */
    buildGeneratedClozePrompt(target, langCode, level) {
        const langName = this.llm._getLangName(langCode);
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}. Ensure grammar and vocabulary are appropriate for this level.`
            : '';
            
        return `Generate a natural, single sentence in ${langName} that logically incorporates the target word/phrase.
Target: "${target}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "sentence": "The full sentence in ${langName}",
  "match": "exact_text_from_sentence"
}

Rules:
- "sentence": Must be entirely in ${langName}. Length should be 1-2 clauses, natural context.
- "match": Must be the exact verbatim string from the generated sentence that corresponds to the target word.
- For conjugated verbs, the "match" must be the conjugated form (e.g., "comió" not "comer").
- Output MUST be valid JSON only.`;
    },

    buildGrammarPrompt(word, context, langCode, level) {
        const langName = this.llm._getLangName(langCode);
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        return `Explain the grammar of "${word}" in this ${langName} sentence: "${context}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "grammar": "grammar rule/pattern name",
  "usage": "how the word functions in this specific sentence (1-2 sentences)",
  "example": "simpler ${langName} sentence using same pattern at learner's level"
}

Rules:
- "grammar": concise rule name (e.g., "Past tense -ta form", "Topic marker は")
- "usage": specific to the given sentence context
- "example": MUST be in ${langName}, simpler than context, same pattern`;
    },

    buildListeningPrompt(words, langCode, level) {
        const langName = this.llm._getLangName(langCode);
        const joined = words.join(', ');
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        return `Write a short listening passage (3-5 sentences) in ${langName} using these words: ${joined}${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "passage": "the passage text in ${langName}",
  "question": "comprehension question in ${langName}",
  "choices": [
    {"letter": "A", "text": "choice A"},
    {"letter": "B", "text": "choice B"},
    {"letter": "C", "text": "choice C"}
  ],
  "answer": "A"

Rules:
- Passage: natural spoken language, 3-5 sentences
- Question: answerable from passage only
- Choices: exactly 3, lettered A/B/C
- Answer: single letter A/B/C matching correct choice`;
    },

    buildStoryPrompt(storyWords, langCode, level, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const wordList = storyWords.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = level && LLMService.LEVEL_DIFFICULTY_MAP[level]
            ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level]}.`
            : '';
        const retryHint = isRetry
            ? `\n\nPREVIOUS RESPONSE WAS INVALID: ${previousError}\nFix the format exactly as specified.`
            : '';

        return `Write a short story in ${langName} using these words: ${wordList}${levelHint}${retryHint}

The story MUST be written entirely in ${langName}. Do not use any other language.

Then write 2 comprehension questions with 3-4 choices each.

Respond with ONLY this JSON (no extra text, no markdown, no **bold**, no *italic*, no code blocks):
{
  "story": "the full story text in ${langName} — plain text only, no formatting",
  "questions": [
    {
      "question": "question 1 in ${langName}",
      "choices": [
        {"letter": "A", "text": "choice A"},
        {"letter": "B", "text": "choice B"},
        {"letter": "C", "text": "choice C"},
        {"letter": "D", "text": "choice D"}
      ],
      "answer": "A"
    }
    {
      "question": "question 2 in ${langName}",
      "choices": [
        {"letter": "A", "text": "choice A"},
        {"letter": "B", "text": "choice B"},
        {"letter": "C", "text": "choice C"},
        {"letter": "D", "text": "choice D"}
      ],
      "answer": "B"
    }
  ]
}

RULES:
- Story: 5-8 sentences, natural flow, all target words used, plain text only (no markdown, no **bold**, no *italic*)
- Questions: answerable from story only, in ${langName}
- Each question: exactly 4 choices (A/B/C/D)
- Answer: single letter A/B/C/D matching correct choice
- IMPORTANT: Randomize which letter is correct for each question — do NOT always use A or B. Vary between A, B, C, D randomly.
- Output MUST be valid JSON only. No extra text, no explanations, no markdown, no code blocks.
- The story MUST be written entirely in ${langName}. No other language allowed.`;
    },

    // ============================================================
    // NEW ROLE PROMPT BUILDERS — App-specific, pedagogically tuned
    // ============================================================

    buildParagraphPrompt(words, langCode, level, topic = 'daily life', sentenceCount = 10, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const cefrMap = { 'N5': 'A1', 'N4': 'A2', 'N3': 'B1', 'N2': 'B2', 'N1': 'C1' };
        const cefr = cefrMap[level] || 'A2';
        const wordList = words.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = `\nLearner level: ${cefr} (${level}). Use vocabulary and grammar appropriate for this level.`;

        return `Write a natural paragraph in ${langName} about "${topic}" for a ${cefr} learner (${level}).
Target words to include naturally: ${wordList}
Sentence count: ${sentenceCount} (varied length, connected flow)${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "paragraph": "full paragraph text in ${langName}, all target words used naturally",
  "targetWords": ["word1", "word2", "word3"],
  "cefrLevel": "${cefr}",
  "topic": "${topic}",
  "audioCues": [
    {"text": "first sentence", "startMs": 0, "endMs": 2000},
    {"text": "second sentence", "startMs": 2000, "endMs": 4000}
  ]
}

RULES:
- Paragraph: ${sentenceCount} sentences, coherent narrative, all target words appear verbatim
- CEFR-appropriate: A1=simple present, short sentences; A2=past tense, connectors; B1=subjunctive, relative clauses; B2=idioms, nuance
- audioCues: one per sentence, realistic timing (approx 150-200 words/min)
- Topic: everyday situations (shopping, travel, work, school, hobbies)
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildQuizPrompt(words, langCode, level, types = ['multiple_choice', 'fill_blank'], count = 5, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const wordList = words.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = level ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level] || level}.` : '';

        return `Generate ${count} quiz questions in ${langName} for ${levelHint} using these words: ${wordList}
Question types: ${types.join(', ')}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "questions": [
    {
      "type": "multiple_choice",
      "prompt": "question or fill-in-the-blank sentence",
      "choices": [{"letter": "A", "text": "choice A"}, {"letter": "B", "text": "choice B"}, {"letter": "C", "text": "choice C"}, {"letter": "D", "text": "choice D"}],
      "answer": "B",
      "explanation": "why this is correct and others are not (1 sentence)",
      "targetWord": "target word from list",
      "difficulty": "medium"
    }
  ],
  "metadata": {"sourceWords": ["word1", "word2"], "level": "${level}", "count": ${count}}
}

RULES:
- multiple_choice: exactly 4 choices (A/B/C/D), one clearly correct
- fill_blank: choices = null, answer = exact word/phrase, prompt has _____ blank
- true_false: choices = [{"letter":"A","text":"True"},{"letter":"B","text":"False"}], answer = A or B
- Explanation: pedagogical, references grammar/usage, not just "correct because..."
- Difficulty distribution: 40% easy, 40% medium, 20% hard
- Each question targets ONE word from the list
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildExplanationPrompt(word, context, langCode, level, isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const levelHint = level ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level] || level}.` : '';

        return `Explain the word "${word}" as used in this ${langName} sentence: "${context}"${levelHint}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "word": "${word}",
  "definition": "clear 1-sentence definition",
  "nuance": "when to use this vs similar words, connotations, formality level",
  "register": "formal|casual|polite|slang|literary",
  "collocations": ["common phrase 1", "common phrase 2", "common phrase 3"],
  "culturalNote": "cultural context or null if none",
  "commonMistakes": [
    {"mistake": "common error learners make", "correction": "correct form with brief why"}
  ],
  "examples": [
    {"sentence": "simpler example in ${langName}", "translation": "English translation"},
    {"sentence": "another example", "translation": "English translation"}
  ]
}

RULES:
- nuance: specific, not generic (e.g., "implies speaker's emotion" not "has nuance")
- register: single value from enum
- collocations: 3+ natural phrases native speakers use
- culturalNote: null or specific cultural insight (e.g., "used when offering food to guests")
- commonMistakes: real learner errors (particle confusion, wrong conjugation, register mismatch)
- examples: simpler than context, same grammar pattern, at learner's level
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildConversationPrompt(words, langCode, level, scenario = 'daily conversation', isRetry = false, previousError = '') {
        const langName = this.llm._getLangName(langCode);
        const wordList = words.map(w => w[langCode] || w.ja || w.en).filter(Boolean).join(', ');
        const levelHint = level ? `\nLearner level: ${LLMService.LEVEL_DIFFICULTY_MAP[level] || level}.` : '';

        return `Write a natural dialogue in ${langName} for "${scenario}" at ${levelHint}
Target words to include: ${wordList}
Turns: 6-8 (alternating A/B)

Respond with ONLY this JSON (no extra text, no markdown):
{
  "scenario": "${scenario}",
  "turns": [
    {"speaker": "A", "text": "dialogue line in ${langName}", "translation": "English", "audioHint": "polite"},
    {"speaker": "B", "text": "response in ${langName}", "translation": "English", "audioHint": "casual"}
  ],
  "targetWords": ["word1", "word2"],
  "completionExercise": {
    "missingTurn": 4,
    "options": [
      {"letter": "A", "text": "option A in ${langName}"},
      {"letter": "B", "text": "option B in ${langName}"},
      {"letter": "C", "text": "option C in ${langName}"},
      {"letter": "D", "text": "option D in ${langName}"}
    ],
    "correct": "B"
  }
}

RULES:
- Turns alternate A/B/A/B naturally
- audioHint: "polite" (desu/mas, honorifics) or "casual" (plain form, slang)
- Target words appear naturally in context
- Completion exercise: remove one turn, give 4 options, one correct
- Scenario-appropriate register (shopping=polite, friends=casual)
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    buildFeedbackPrompt(sessionData, isRetry = false, previousError = '') {
        const { accuracy, interactions, level, langCode } = sessionData;
        const langName = this.llm._getLangName(langCode);

        return `Analyze this ${langName} learning session for a ${level} learner and provide personalized feedback.

SESSION DATA:
- Overall accuracy: ${(accuracy.overall * 100).toFixed(0)}%
- By activity: ${JSON.stringify(accuracy.byType)}
- Interactions: ${interactions.length} total
- Recent patterns: ${this.summarizeInteractions(interactions)}

Respond with ONLY this JSON (no extra text, no markdown):
{
  "summary": "encouraging 2-3 sentence summary highlighting progress and one key insight",
  "accuracy": {"overall": ${accuracy.overall}, "byType": ${JSON.stringify(accuracy.byType)}},
  "weakWords": [
    {"word": "word", "errors": 3, "pattern": "specific error pattern (e.g., confuses に/で)"}
  ],
  "strongWords": [
    {"word": "word", "streak": 5}
  ],
  "recommendations": [
    {"type": "review|practice|new", "priority": 1, "description": "specific actionable recommendation", "words": ["word1", "word2"]}
  ],
  "nextSessionFocus": "one sentence: what to focus on next session"
}

RULES:
- summary: positive, specific, references actual data
- weakWords: max 5, from actual errors, pattern = actionable insight
- strongWords: max 5, from actual streaks
- recommendations: 3-5, prioritized, type = review (revisit), practice (drill), new (learn)
- nextSessionFocus: concrete, one thing
${isRetry ? '\nCRITIC FEEDBACK TO FIX: ' + previousError : ''}`;
    },

    summarizeInteractions(interactions) {
        const patterns = {};
        interactions.forEach(i => {
            i.userActions?.forEach(a => {
                const key = `${i.role}:${a.type}`;
                patterns[key] = (patterns[key] || 0) + 1;
            });
        });
        return Object.entries(patterns).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}:${v}`).join(', ');
    }
});
