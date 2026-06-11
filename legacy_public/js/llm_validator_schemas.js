// Extracted schemas for LLMResponseValidator
LLMResponseValidator.SCHEMAS = {
    
        // Smart Cloze: extract exact conjugated form from existing sentence
        clozeMatch: {
            type: 'object',
            properties: {
                match: { type: 'string', minLength: 1 }
            },
            required: ['match'],
            additionalProperties: false
        },

        /**
         * Dynamic AI Cloze Generation
         * Used to generate a novel sentence instead of relying on DB examples.
         */
        generatedCloze: {
            type: 'object',
            properties: {
                sentence: { type: 'string', minLength: 5 },
                match: { type: 'string', minLength: 1 }
            },
            required: ['sentence', 'match'],
            additionalProperties: false
        },

        // Grammar explanation: structured fields
        grammarExplanation: {
            type: 'object',
            properties: {
                grammar: { type: 'string', minLength: 1 },
                usage: { type: 'string', minLength: 1 },
                example: { type: 'string', minLength: 1 }
            },
            required: ['grammar', 'usage', 'example'],
            additionalProperties: false
        },

        // Listening passage + question
        listeningPassage: {
            type: 'object',
            properties: {
                passage: { type: 'string', minLength: 10 },
                question: { type: 'string', minLength: 5 },
                choices: {
                    type: 'array',
                    minItems: 3,
                    maxItems: 3,
                    items: {
                        type: 'object',
                        properties: {
                            letter: { type: 'string', enum: ['A', 'B', 'C'] },
                            text: { type: 'string', minLength: 1 }
                        },
                        required: ['letter', 'text'],
                        additionalProperties: false
                    }
                },
                answer: { type: 'string', enum: ['A', 'B', 'C'] }
            },
            required: ['passage', 'question', 'choices', 'answer'],
            additionalProperties: false
        },

        // Story + 2 comprehension questions
        storyWithQuestions: {
            type: 'object',
            properties: {
                story: { 
                    type: 'string', 
                    minLength: 50
                },
                questions: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string', minLength: 5 },
                            choices: {
                                type: 'array',
                                minItems: 3,
                                maxItems: 4,
                                items: {
                                    type: 'object',
                                    properties: {
                                        letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                                        text: { type: 'string', minLength: 1 }
                                    },
                                    required: ['letter', 'text'],
                                    additionalProperties: false
                                }
                            },
                            answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] }
                        },
                        required: ['question', 'choices', 'answer'],
                        additionalProperties: false
                    }
                }
            },
            required: ['story', 'questions'],
            additionalProperties: false
        },

        // AI Critic Evaluation
        criticEvaluation: {
            type: 'object',
            properties: {
                overallScore: { type: 'number', minimum: 0, maximum: 100 },
                criteria: {
                    type: 'object',
                    properties: {
                        levelAppropriate: { type: 'number', minimum: 0, maximum: 100 },
                        pedagogicalValue: { type: 'number', minimum: 0, maximum: 100 },
                        naturalness: { type: 'number', minimum: 0, maximum: 100 },
                        diversity: { type: 'number', minimum: 0, maximum: 100 },
                        culturalAccuracy: { type: 'number', minimum: 0, maximum: 100 },
                        engagement: { type: 'number', minimum: 0, maximum: 100 }
                    },
                    required: ['levelAppropriate', 'pedagogicalValue', 'naturalness', 'diversity', 'culturalAccuracy', 'engagement'],
                    additionalProperties: false
                },
                issues: { type: 'array', items: { type: 'string' } },
                suggestedFix: { type: 'string' },
                approve: { type: 'boolean' }
            },
            required: ['overallScore', 'criteria', 'issues', 'suggestedFix', 'approve'],
            additionalProperties: false
        },

        // Paragraph Generator
        paragraph: {
            type: 'object',
            properties: {
                paragraph: { type: 'string', minLength: 100 },
                targetWords: { type: 'array', minItems: 1, items: { type: 'string' } },
                cefrLevel: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C1'] },
                topic: { type: 'string' },
                audioCues: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            startMs: { type: 'number', minimum: 0 },
                            endMs: { type: 'number', minimum: 0 }
                        },
                        required: ['text', 'startMs', 'endMs'],
                        additionalProperties: false
                    }
                }
            },
            required: ['paragraph', 'targetWords', 'cefrLevel', 'topic', 'audioCues'],
            additionalProperties: false
        },

        // Quiz Generator
        quiz: {
            type: 'object',
            properties: {
                questions: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['multiple_choice', 'fill_blank', 'true_false'] },
                            prompt: { type: 'string', minLength: 5 },
                            choices: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                                        text: { type: 'string', minLength: 1 }
                                    },
                                    required: ['letter', 'text'],
                                    additionalProperties: false
                                }
                            },
                            answer: { type: 'string' },
                            explanation: { type: 'string', minLength: 10 },
                            targetWord: { type: 'string' },
                            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }
                        },
                        required: ['type', 'prompt', 'answer', 'explanation', 'targetWord', 'difficulty'],
                        additionalProperties: false
                    }
                },
                metadata: {
                    type: 'object',
                    properties: {
                        sourceWords: { type: 'array', items: { type: 'string' } },
                        level: { type: 'string' },
                        count: { type: 'number', minimum: 1 }
                    },
                    required: ['sourceWords', 'level', 'count'],
                    additionalProperties: false
                }
            },
            required: ['questions', 'metadata'],
            additionalProperties: false
        },

        // Explanation Generator
        explanation: {
            type: 'object',
            properties: {
                word: { type: 'string', minLength: 1 },
                definition: { type: 'string', minLength: 5 },
                nuance: { type: 'string', minLength: 10 },
                register: { type: 'string', enum: ['formal', 'casual', 'polite', 'slang', 'literary'] },
                collocations: { type: 'array', minItems: 2, items: { type: 'string' } },
                culturalNote: { type: 'string' },
                commonMistakes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            mistake: { type: 'string' },
                            correction: { type: 'string' }
                        },
                        required: ['mistake', 'correction'],
                        additionalProperties: false
                    }
                },
                examples: {
                    type: 'array',
                    minItems: 2,
                    items: {
                        type: 'object',
                        properties: {
                            sentence: { type: 'string' },
                            translation: { type: 'string' }
                        },
                        required: ['sentence', 'translation'],
                        additionalProperties: false
                    }
                }
            },
            required: ['word', 'definition', 'nuance', 'register', 'collocations', 'culturalNote', 'commonMistakes', 'examples'],
            additionalProperties: false
        },

        // Conversation Generator
        conversation: {
            type: 'object',
            properties: {
                scenario: { type: 'string', minLength: 5 },
                turns: {
                    type: 'array',
                    minItems: 4,
                    items: {
                        type: 'object',
                        properties: {
                            speaker: { type: 'string', enum: ['A', 'B'] },
                            text: { type: 'string', minLength: 1 },
                            translation: { type: 'string' },
                            audioHint: { type: 'string', enum: ['polite', 'casual'] }
                        },
                        required: ['speaker', 'text', 'translation', 'audioHint'],
                        additionalProperties: false
                    }
                },
                targetWords: { type: 'array', minItems: 1, items: { type: 'string' } },
                completionExercise: {
                    type: 'object',
                    properties: {
                        missingTurn: { type: 'number', minimum: 1 },
                        options: {
                            type: 'array',
                            minItems: 3,
                            maxItems: 4,
                            items: {
                                type: 'object',
                                properties: {
                                    letter: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                                    text: { type: 'string' }
                                },
                                required: ['letter', 'text'],
                                additionalProperties: false
                            }
                        },
                        correct: { type: 'string', enum: ['A', 'B', 'C', 'D'] }
                    },
                    required: ['missingTurn', 'options', 'correct'],
                    additionalProperties: false
                }
            },
            required: ['scenario', 'turns', 'targetWords', 'completionExercise'],
            additionalProperties: false
        },

        // Feedback Generator
        feedback: {
            type: 'object',
            properties: {
                summary: { type: 'string', minLength: 20 },
                accuracy: {
                    type: 'object',
                    properties: {
                        overall: { type: 'number', minimum: 0, maximum: 1 },
                        byType: { type: 'object', additionalProperties: { type: 'number' } }
                    },
                    required: ['overall', 'byType'],
                    additionalProperties: false
                },
                weakWords: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            word: { type: 'string' },
                            errors: { type: 'number', minimum: 1 },
                            pattern: { type: 'string' }
                        },
                        required: ['word', 'errors', 'pattern'],
                        additionalProperties: false
                    }
                },
                strongWords: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            word: { type: 'string' },
                            streak: { type: 'number', minimum: 1 }
                        },
                        required: ['word', 'streak'],
                        additionalProperties: false
                    }
                },
                recommendations: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 5,
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['review', 'practice', 'new'] },
                            priority: { type: 'number', minimum: 1, maximum: 5 },
                            description: { type: 'string' },
                            words: { type: 'array', items: { type: 'string' } }
                        },
                        required: ['type', 'priority', 'description', 'words'],
                        additionalProperties: false
                    }
                },
                nextSessionFocus: { type: 'string' }
            },
            required: ['summary', 'accuracy', 'weakWords', 'strongWords', 'recommendations', 'nextSessionFocus'],
            additionalProperties: false
        }
    };
