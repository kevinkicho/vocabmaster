// Extracted LLMService bindings
// Attach to LLMService for easy access
LLMService.prototype.validator = null;
LLMService.prototype.initValidator = function() {
    this.validator = new LLMResponseValidator(this);
};

// Replace existing methods with validated + critic versions
LLMService.prototype.findClozeMatch = async function(sentence, target, langCode, level) {
    if (!this.validator) this.initValidator();
    const cached = await this.getFromCache(sentence, target, langCode);
    if (cached !== null && cached !== '') return cached;
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'clozeMatch',
        this.validator.buildClozePrompt.bind(this.validator),
        level, langCode,
        sentence, target, langCode, level
    );

    if (result.data) await this.setCache(sentence, target, langCode, result.data.match);
    return result.data?.match || null;
};

/**
 * Generates a novel sentence containing the target word, and identifies the exact matched string.
 * @param {string} target - The vocabulary word
 * @param {string} langCode - Language code
 * @param {string} level - Optional CEFR level
 * @returns {Promise<{sentence: string, match: string}|null>}
 */
LLMService.prototype.generateClozeSentence = async function(target, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'generatedCloze',
        this.validator.buildGeneratedClozePrompt.bind(this.validator),
        level, langCode,
        target, langCode, level
    );

    return result.data || null;
};


LLMService.prototype.getGrammarExplanation = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'grammarExplanation',
        this.validator.buildGrammarPrompt.bind(this.validator),
        level, langCode,
        word, context, langCode, level
    );

    if (!result.data) return null;
    return `GRAMMAR: ${result.data.grammar}\nUSAGE: ${result.data.usage}\nEXAMPLE: ${result.data.example}`;
};

LLMService.prototype.getListeningPassage = async function(words, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'listeningPassage',
        this.validator.buildListeningPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level
    );

    if (!result.data) return null;
    return {
        passage: result.data.passage,
        question: {
            text: result.data.question,
            choices: result.data.choices,
            correct: result.data.answer
        },
        raw: JSON.stringify(result.data),
        critiqueScore: result.critiqueScore
    };
};

LLMService.prototype.generateStory = async function(storyWords, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'storyWithQuestions',
        this.validator.buildStoryPrompt.bind(this.validator),
        level, langCode,
        storyWords, langCode, level
    );

    if (result.data) {
        result.data.critiqueScore = result.critiqueScore;
    }
    return result.data;
};

// ============================================================
// NEW ROLE METHODS — App-specific AI roles with critic validation
// ============================================================

LLMService.prototype.generateParagraph = async function(words, langCode, level, topic = 'daily life') {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'paragraph',
        this.validator.buildParagraphPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level, topic
    );

    return result.data;
};

LLMService.prototype.generateQuiz = async function(words, langCode, level, types = ['multiple_choice', 'fill_blank'], count = 5) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'quiz',
        this.validator.buildQuizPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level, types, count
    );

    return result.data;
};

LLMService.prototype.generateExplanation = async function(word, context, langCode, level) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'explanation',
        this.validator.buildExplanationPrompt.bind(this.validator),
        level, langCode,
        word, context, langCode, level
    );

    return result.data;
};

LLMService.prototype.generateConversation = async function(words, langCode, level, scenario = 'daily conversation') {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'conversation',
        this.validator.buildConversationPrompt.bind(this.validator),
        level, langCode,
        words, langCode, level, scenario
    );

    return result.data;
};

LLMService.prototype.generateFeedback = async function(sessionData) {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;

    const result = await this.validator.generateWithCritic(
        'feedback',
        this.validator.buildFeedbackPrompt.bind(this.validator),
        sessionData.level, sessionData.langCode,
        sessionData
    );

    return result.data;
};

// Export for non-module environments
