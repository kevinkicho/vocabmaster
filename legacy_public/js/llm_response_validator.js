/* js/llm_response_validator.js
 * Unified response validation & self-correction for LLM outputs.
 * Ensures structured, parseable responses that hardcoded scripts can rely on.
 */

class LLMResponseValidator {
    constructor(llmService) {
        this.llm = llmService;
        this.maxRetries = 2;
        this.criticThreshold = 70; // overall score threshold
        this.criticMinCriterion = 50; // no single criterion below this
        this.maxCriticRetries = 2; // max regenerations with critic feedback
        this.criticTimeout = llmService.useCloud ? 15000 : 30000; // faster timeout for cloud
    }

    // ============================================================
    // SCHEMA DEFINITIONS — single source of truth for each feature
    // ============================================================


    // ============================================================
    // PROMPT BUILDERS — produce JSON-only prompts with schema hints
    // ============================================================


    // ============================================================
    // VALIDATION & SELF-CORRECTION
    // ============================================================

    validate(json, schemaName) {
        const schema = LLMResponseValidator.SCHEMAS[schemaName];
        if (!schema) return { valid: false, error: `Unknown schema: ${schemaName}` };

        try {
            // Basic JSON structure check
            if (typeof json !== 'object' || json === null) {
                return { valid: false, error: 'Response is not a JSON object' };
            }

            // Required fields
            for (const field of schema.required) {
                if (!(field in json) || json[field] === undefined || json[field] === null) {
                    return { valid: false, error: `Missing required field: ${field}` };
                }
            }

            // Type checks
            for (const [key, rules] of Object.entries(schema.properties)) {
                const val = json[key];
                if (val === undefined) continue;

                if (rules.type === 'string') {
                    if (typeof val !== 'string') return { valid: false, error: `${key} must be string` };
                    
                    // Auto-sanitize markdown bold tags that small models frequently leak into JSON
                    if (val.includes('**')) {
                        json[key] = val.replace(/\*\*/g, '');
                    }
                    
                    if (rules.minLength && json[key].length < rules.minLength) {
                        return { valid: false, error: `${key} too short (min ${rules.minLength})` };
                    }
                    if (rules.enum && !rules.enum.includes(json[key])) {
                        return { valid: false, error: `${key} must be one of ${rules.enum.join('/')}` };
                    }
                }
                if (rules.type === 'number') {
                    if (typeof val !== 'number') return { valid: false, error: `${key} must be number` };
                    if (rules.minimum !== undefined && val < rules.minimum) {
                        return { valid: false, error: `${key} below minimum ${rules.minimum}` };
                    }
                    if (rules.maximum !== undefined && val > rules.maximum) {
                        return { valid: false, error: `${key} exceeds maximum ${rules.maximum}` };
                    }
                }
                if (rules.type === 'boolean') {
                    if (typeof val !== 'boolean') return { valid: false, error: `${key} must be boolean` };
                }
                if (rules.type === 'array') {
                    if (!Array.isArray(val)) return { valid: false, error: `${key} must be array` };
                    if (rules.minItems && val.length < rules.minItems) {
                        return { valid: false, error: `${key} needs at least ${rules.minItems} items` };
                    }
                    if (rules.maxItems && val.length > rules.maxItems) {
                        return { valid: false, error: `${key} exceeds max ${rules.maxItems} items` };
                    }
                    // Validate array items
                    if (rules.items && rules.items.properties) {
                        for (let i = 0; i < val.length; i++) {
                            const item = val[i];
                            for (const [itemKey, itemRules] of Object.entries(rules.items.properties)) {
                                if (!(itemKey in item)) return { valid: false, error: `${key}[${i}].${itemKey} missing` };
                                if (itemRules.enum && !itemRules.enum.includes(item[itemKey])) {
                                    return { valid: false, error: `${key}[${i}].${itemKey} must be ${itemRules.enum.join('/')}` };
                                }
                            }
                        }
                    }
                }
            }

            // No extra properties
            if (!schema.additionalProperties) {
                for (const key of Object.keys(json)) {
                    if (!(key in schema.properties)) {
                        return { valid: false, error: `Unexpected field: ${key}` };
                    }
                }
            }

            return { valid: true, data: json };
        } catch (e) {
            return { valid: false, error: `Validation error: ${e.message}` };
        }
    }

    // Extract JSON from model output (handles partial, markdown-wrapped, etc.)
    extractJSON(raw) {
        if (!raw) return null;

        // Clean common LLM trailing commas before closing braces/brackets
        const cleanJSON = (str) => {
            try {
                return str.replace(/,\s*([\]}])/g, '$1');
            } catch(e) { return str; }
        };

        // 1. Try direct JSON parse
        try {
            return JSON.parse(cleanJSON(raw));
        } catch (e) {}

        // 2. Try to find JSON object in text (handles ```json``` fences)
        const fenceMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (fenceMatch) {
            try { return JSON.parse(cleanJSON(fenceMatch[1])); } catch (e) {}
        }

        // 3. Find first complete { ... } block
        let depth = 0, start = -1;
        for (let i = 0; i < raw.length; i++) {
            if (raw[i] === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (raw[i] === '}') {
                depth--;
                if (depth === 0 && start !== -1) {
                    const candidate = raw.slice(start, i + 1);
                    try { return JSON.parse(cleanJSON(candidate)); } catch (e) {}
                }
            }
        }

        // 4. For cloze: model may complete partial prompt like '...{"match":' → extract value
        const completionMatch = raw.match(/"match"\s*:\s*"([^"]+)"/);
        if (completionMatch) return { match: completionMatch[1] };

        return null;
    }

    // Main entry: generate → validate → retry with feedback → return validated data
    async generateValidated(schemaName, promptBuilder, ...promptArgs) {
        let lastError = '';
        const isStory = schemaName === 'storyWithQuestions';
        const baseTokens = isStory ? 1024 : 384;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            const isRetry = attempt > 0;
            const prompt = promptBuilder(...promptArgs, isRetry, lastError);

            try {
                const raw = await this.llm.generate({
                    prompt,
                    system: 'Output ONLY valid JSON matching the specified schema. No extra text.',
                    options: { temperature: 0, num_predict: isRetry ? (baseTokens * 1.5) : baseTokens }, // deterministic, more tokens on retry
                    timeout: 45000
                });

                const json = this.extractJSON(raw);
                if (!json) {
                    lastError = 'No valid JSON found in response';
                    L(`[Validator] Attempt ${attempt + 1}: ${lastError} | Raw: ${raw?.slice(0, 200)}`);
                    continue;
                }

                const result = this.validate(json, schemaName);
                if (result.valid) {
                    if (isRetry) L(`[Validator] Self-correction succeeded on attempt ${attempt + 1}`);
                    return result.data;
                }

                lastError = result.error;
                L(`[Validator] Attempt ${attempt + 1} validation failed: ${lastError} | Parsed: ${JSON.stringify(json).slice(0, 300)}`);
            } catch (e) {
                lastError = e.message;
                L(`[Validator] Attempt ${attempt + 1} error: ${lastError}`);
            }
        }

        L(`[Validator] All ${this.maxRetries + 1} attempts failed for ${schemaName}: ${lastError}`);
        return null;
    }

    // ============================================================
    // LAYER 2: AI CRITIC — Semantic Validation
    // ============================================================

    buildCriticPrompt(generatedContent, role, level, langCode) {
        const langName = this.llm._getLangName(langCode);
        const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level] || level;
        const contentStr = JSON.stringify(generatedContent, null, 2);

        return `You are a language learning content critic for VocabMaster. Evaluate this generated content for a ${difficulty} learner of ${langName}.

ROLE: ${role}
GENERATED CONTENT:
${contentStr}

CRITERIA (score 0-100 each):
1. levelAppropriate: Vocabulary/grammar matches ${difficulty}. No structures above level.
2. pedagogicalValue: Teaches something useful. Not too easy, not overwhelming.
3. naturalness: Sounds like a native speaker would actually say/write this.
4. diversity: Varied sentence structures, not repetitive patterns.
5. culturalAccuracy: Culturally appropriate. No hallucinated customs or unnatural phrases.
6. engagement: Interesting, relevant to learner's likely goals (daily life, travel, etc.).

OUTPUT ONLY THIS JSON (no extra text, no markdown):
{
  "overallScore": 85,
  "criteria": {
    "levelAppropriate": 90,
    "pedagogicalValue": 85,
    "naturalness": 88,
    "diversity": 75,
    "culturalAccuracy": 92,
    "engagement": 80
  },
  "issues": ["Specific issue 1", "Specific issue 2"],
  "suggestedFix": "Concrete instruction for regeneration (e.g., 'Simplify sentence 3 to use only -ta past tense. Vary sentence openings.')",
  "approve": false
}

RULES:
- Be strict: score < 50 on any criterion = do not approve
- overallScore = average of 6 criteria
- approve = true ONLY if overallScore >= 70 AND no criterion < 50
- issues: list specific, actionable problems (empty if approve)
- suggestedFix: one clear sentence the generator can follow`;
    }

    async criticEvaluate(generatedContent, role, level, langCode) {
        if (!this.llm.available || !this.llm.hasModel) {
            // No critic available, auto-approve with moderate score
            return { overallScore: 75, criteria: {}, issues: [], suggestedFix: '', approve: true };
        }

        const prompt = this.buildCriticPrompt(generatedContent, role, level, langCode);
        const raw = await this.llm.generate({
            prompt,
            system: 'You are a strict language learning content critic. Output ONLY valid JSON.',
            options: { temperature: 0, num_predict: 256 },
            timeout: this.criticTimeout || 30000
        });

        const json = this.extractJSON(raw);
        if (!json) {
            L('[Critic] Failed to parse critic response, auto-approving');
            return { overallScore: 75, criteria: {}, issues: [], suggestedFix: '', approve: true };
        }

        const result = this.validate(json, 'criticEvaluation');
        if (!result.valid) {
            L('[Critic] Invalid critic response:', result.error, 'auto-approving');
            return { overallScore: 75, criteria: {}, issues: [], suggestedFix: '', approve: true };
        }

        return result.data;
    }

    // Main entry with critic: generate → validate → critic → regenerate with critic feedback
    async generateWithCritic(schemaName, promptBuilder, level, langCode, ...promptArgs) {
        let bestData = null;
        let bestScore = 0;

        for (let criticAttempt = 0; criticAttempt <= this.maxCriticRetries; criticAttempt++) {
            // Generate with syntactic validation
            const data = await this.generateValidated(schemaName, promptBuilder, ...promptArgs);
            if (!data) {
                L(`[Critic] Attempt ${criticAttempt + 1}: Generation failed`);
                continue;
            }

            // Critic evaluates
            const critique = await this.criticEvaluate(data, schemaName, level, langCode);
            L(`[Critic] Attempt ${criticAttempt + 1}: score=${critique.overallScore}, approve=${critique.approve}`);

            if (critique.overallScore > bestScore) {
                bestScore = critique.overallScore;
                bestData = data;
            }

            if (critique.approve) {
                if (criticAttempt > 0) L(`[Critic] Approved after ${criticAttempt + 1} attempts`);
                return { data, critiqueScore: critique.overallScore, attempts: criticAttempt + 1 };
            }

            // Prepare critic feedback for next generation
            const criticFeedback = critique.issues.length > 0
                ? critique.issues.join('; ') + ' | ' + critique.suggestedFix
                : critique.suggestedFix;

            // Add critic feedback to prompt args for retry
            promptArgs = [...promptArgs.slice(0, -2), true, criticFeedback]; // Replace isRetry, lastError
        }

        L(`[Critic] All ${this.maxCriticRetries + 1} attempts below threshold (best: ${bestScore}). Returning best with warning.`);
        return { data: bestData, critiqueScore: bestScore, attempts: this.maxCriticRetries + 1, warning: 'Below quality threshold' };
    }
}

window.LLMResponseValidator = LLMResponseValidator;