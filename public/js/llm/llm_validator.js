/* js/llm/llm_validator.js — LLM Response Validator + AI Critic
 *
 * Two-layer quality pipeline:
 *   1. generateValidated — schema validation (structural checks)
 *   2. criticEvaluate — AI-as-judge (content quality, pedagogic value)
 *
 * Retry budget:
 *   maxRetries=1  → at most 2 generation attempts
 *   maxCriticRetries=0 → critic runs once, accepts or returns best-effort
 *   Total: ≤3 LLM calls per feature request.
 *
 * num_predict (token budgets):
 *   story 1024 (retry 1536) — fits story ~400t + translation ~250t + 2 Q&A ~300t
 *   grammar 2048 (retry 3072) — fits 6-10 exercises
 *   other 384 — short responses (cloze, grammar explanation)
 *
 * Critic skips simple schemas (clozeMatch, generatedCloze, grammarExplanation)
 * and auto-approves (score 75) when its own response is unparseable.
 *
 * See docs/architecture.md §1-2 for full details.
 */
class LLMResponseValidator {
    constructor(llmService) {
        this.llm = llmService;
        this.maxRetries = 1;
        this.criticThreshold = 70;
        this.criticMinCriterion = 50;
        this.maxCriticRetries = 0;
        this.criticTimeout = llmService.useCloud ? 15000 : 30000;
    }

    validate(json, schemaName) {
        const schema = LLMResponseValidator.SCHEMAS[schemaName];
        if (!schema) return { valid: false, error: `Unknown schema: ${schemaName}` };

        try {
            if (typeof json !== 'object' || json === null) {
                return { valid: false, error: 'Response is not a JSON object' };
            }

            for (const field of schema.required) {
                if (!(field in json) || json[field] === undefined || json[field] === null) {
                    return { valid: false, error: `Missing required field: ${field}` };
                }
            }

            for (const [key, rules] of Object.entries(schema.properties)) {
                const val = json[key];
                if (val === undefined) continue;

                if (rules.type === 'string') {
                    if (typeof val !== 'string') return { valid: false, error: `${key} must be string` };
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
                    if (rules.items && rules.items.properties) {
                        const itemRequired = rules.items.required || [];
                        for (let i = 0; i < val.length; i++) {
                            const item = val[i];
                            for (const [itemKey, itemRules] of Object.entries(rules.items.properties)) {
                                const isRequired = itemRequired.includes(itemKey);
                                if (isRequired && !(itemKey in item)) return { valid: false, error: `${key}[${i}].${itemKey} missing` };
                                if (!(itemKey in item)) continue;
                                if (itemRules.enum && !itemRules.enum.includes(item[itemKey])) {
                                    return { valid: false, error: `${key}[${i}].${itemKey} must be ${itemRules.enum.join('/')}` };
                                }
                            }
                        }
                    }
                }
            }

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

    extractJSON(raw) {
        if (!raw) return null;

        const cleanJSON = (str) => {
            try {
                return str.replace(/,\s*([\]}])/g, '$1');
            } catch(e) { return str; }
        };

        try {
            return JSON.parse(cleanJSON(raw));
        } catch (e) {}

        const fenceMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (fenceMatch) {
            try { return JSON.parse(cleanJSON(fenceMatch[1])); } catch (e) {}
        }

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

        const completionMatch = raw.match(/"match"\s*:\s*"([^"]+)"/);
        if (completionMatch) return { match: completionMatch[1] };

        return null;
    }

    async generateValidated(schemaName, promptBuilder, ...promptArgs) {
        let lastError = '';
        const isStory = schemaName === 'storyWithQuestions';
        const isGrammar = schemaName === 'grammarExercise';
        const baseTokens = isStory ? 1024 : isGrammar ? 2048 : 384;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            const isRetry = attempt > 0;
            const prompt = promptBuilder(...promptArgs, isRetry, lastError);

            try {
                const raw = await this.llm.generate({
                    prompt,
                    system: 'Output ONLY valid JSON matching the specified schema. No extra text.',
                    options: { temperature: 0, num_predict: isRetry ? (baseTokens * 1.5) : baseTokens },
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

    buildCriticPrompt(generatedContent, role, level, langCode) {
        const langName = this.llm._getLangName(langCode);
        const difficulty = LLMService.LEVEL_DIFFICULTY_MAP[level] || level;
        const contentStr = JSON.stringify(generatedContent);

        return `You are a critic for VocabMaster. Evaluate this content for a ${difficulty} learner of ${langName}.

ROLE: ${role}
CONTENT: ${contentStr}

Score each (0-100): levelAppropriate, pedagogicalValue, naturalness, diversity, culturalAccuracy, engagement.

Output ONLY JSON: {"overallScore":0,"criteria":{"levelAppropriate":0,"pedagogicalValue":0,"naturalness":0,"diversity":0,"culturalAccuracy":0,"engagement":0},"issues":[],"suggestedFix":"","approve":false}

Rules: score<50 on any criterion=no approve. overallScore=average. approve only if >=70 AND no criterion<50. issues=actionable problems. suggestedFix=one sentence.`;
    }

    async criticEvaluate(generatedContent, role, level, langCode) {
        if (!this.llm.available || !this.llm.hasModel) {
            return { overallScore: 75, criteria: {}, issues: [], suggestedFix: '', approve: true };
        }

        const prompt = this.buildCriticPrompt(generatedContent, role, level, langCode);
        const raw = await this.llm.generate({
            prompt,
            system: 'Output ONLY valid JSON.',
            options: { temperature: 0, num_predict: 128 },
            timeout: this.criticTimeout || 15000
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

    async generateWithCritic({ schemaName, promptBuilder, level, langCode, promptArgs = [], onProgress = null, knownLangCode }) {
        const noCriticSchemas = ['clozeMatch', 'generatedCloze', 'grammarExplanation'];
        const argsWithKnown = [...promptArgs, knownLangCode];
        if (noCriticSchemas.includes(schemaName)) {
            if (typeof onProgress === 'function') onProgress('Generating...');
            const data = await this.generateValidated(schemaName, promptBuilder, ...argsWithKnown);
            return { data, critiqueScore: 75, attempts: 1 };
        }

        let bestData = null;
        let bestScore = 0;
        const baseArgs = [...argsWithKnown];
        let actualArgs = [...argsWithKnown];

        for (let criticAttempt = 0; criticAttempt <= this.maxCriticRetries; criticAttempt++) {
            if (typeof onProgress === 'function') {
                onProgress(`Generating (attempt ${criticAttempt + 1}/${this.maxCriticRetries + 1})...`);
            }
            const data = await this.generateValidated(schemaName, promptBuilder, ...actualArgs);
            if (!data) {
                L(`[Critic] Attempt ${criticAttempt + 1}: Generation failed`);
                continue;
            }

            if (typeof onProgress === 'function') {
                onProgress(`Critic evaluating...`);
            }
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

            const criticFeedback = critique.issues.length > 0
                ? critique.issues.join('; ') + ' | ' + critique.suggestedFix
                : critique.suggestedFix;

            actualArgs = [...baseArgs, true, criticFeedback];
        }

        L(`[Critic] All ${this.maxCriticRetries + 1} attempts below threshold (best: ${bestScore}). Returning best with warning.`);
        return { data: bestData, critiqueScore: bestScore, attempts: this.maxCriticRetries + 1, warning: 'Below quality threshold' };
    }
}

window.LLMResponseValidator = LLMResponseValidator;