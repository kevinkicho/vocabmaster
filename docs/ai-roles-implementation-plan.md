# AI Roles Expansion — Failsafe Implementation Plan

**Target Model**: Gemma 3 27B / Gemma 4 31B via ollama4android (11T/s on device)
**Constraint**: All AI output must be self-validated, schema-enforced, with automatic retry and graceful degradation.

---

## 1. ARCHITECTURAL PRINCIPLES

### 1.1 Single Source of Truth: JSON Schemas
Every AI feature defines a **Zod-like JSON schema** in `llm_response_validator.js`. No free-form text parsing anywhere.

### 1.2 Self-Correction Loop (Mandatory)
```
Generate → Validate → (Fail) → Retry with Error Feedback → Validate → (Fail) → Fallback
                    ↓
              (Success) → Cache → Return
```
- Max 2 retries per request
- Error fed back to model: "Previous response invalid: [specific error]. Fix and output ONLY valid JSON."
- Temperature = 0 for all structured tasks

### 1.3 Graceful Degradation Hierarchy
```
Primary: Validated AI response (schema-compliant)
Secondary: Cached response (same schema, older)
Tertiary: Template fallback (hardcoded, no AI)
Quaternary: Feature disabled with user notice
```

### 1.4 No Brittle Regex Extraction — Ever
All extraction uses `JSON.parse()` on model output. If model wraps in markdown, strip fences. If model completes partial JSON, parse completion. No `match()`, no `split()`, no regex on AI output.

---

## 2. EXPANDED AI ROLES & SCHEMAS

### 2.1 Current Roles (Already Validated)
| Role | Schema | Temperature | Max Tokens |
|------|--------|-------------|------------|
| Smart Cloze Match | `clozeMatch` | 0 | 64 |
| Grammar Explanation | `grammarExplanation` | 0 | 256 |
| Listening Passage | `listeningPassage` | 0 | 384 |
| Story + Questions | `storyWithQuestions` | 0 | 768 |

### 2.2 New Roles to Add

#### A. Paragraph Generator (`paragraph`)
**Use**: Reading practice, context-rich exposure
```json
{
  "paragraph": "string (8-12 sentences, target language)",
  "targetWords": ["word1", "word2", "word3"],
  "cefrLevel": "A2|B1|B2",
  "topic": "string",
  "audioCues": [{"text": "sentence", "startMs": 0, "endMs": 1200}]
}
```
- **Prompt**: "Write a natural paragraph in {lang} at {CEFR} level using these words: {words}. Topic: {topic}. Output ONLY JSON."
- **Validation**: All targetWords appear verbatim; sentence count 8-12; CEFR-appropriate vocabulary.

#### B. Quiz Generator (`quiz`)
**Use**: Dynamic quiz questions (multiple choice, fill-in, true/false)
```json
{
  "questions": [
    {
      "type": "multiple_choice|fill_blank|true_false",
      "prompt": "string",
      "choices": [{"letter": "A", "text": "..."}, ...] | null,
      "answer": "A|B|C|D|true|false|exact_text",
      "explanation": "string (why correct, 1 sentence)",
      "targetWord": "string",
      "difficulty": "easy|medium|hard"
    }
  ],
  "metadata": {"sourceWords": [...], "level": "N4", "count": 5}
}
```
- **Prompt**: "Generate {count} quiz questions in {lang} for level {level} using words: {words}. Types: {types}. Output ONLY JSON."
- **Validation**: Each question has valid type/answer; choices match type; explanation present.

#### C. Explanation/Comment Generator (`explanation`)
**Use**: Word usage notes, cultural context, etymology, nuance
```json
{
  "word": "string",
  "definition": "string (1 sentence)",
  "nuance": "string (when to use vs similar words)",
  "register": "formal|casual|polite|slang|literary",
  "collocations": ["phrase1", "phrase2"],
  "culturalNote": "string|null",
  "commonMistakes": ["mistake1", "correct1"],
  "examples": [{"sentence": "...", "translation": "..."}, ...]
}
```
- **Prompt**: "Explain the word '{word}' in {lang} for {level} learner. Include nuance, register, collocations, 2 examples. Output ONLY JSON."

#### D. Conversation Simulator (`conversation`)
**Use**: Roleplay practice, dialogue completion
```json
{
  "scenario": "string (e.g., 'ordering coffee')",
  "turns": [
    {"speaker": "A|B", "text": "string", "translation": "string", "audioHint": "polite|c casual"}
  ],
  "targetWords": ["word1", "word2"],
  "completionExercise": {
    "missingTurn": 3,
    "options": [{"letter": "A", "text": "..."}, ...],
    "correct": "B"
  }
}
```
- **Prompt**: "Write a {turnCount}-turn dialogue in {lang} for {scenario}. Level: {level}. Include words: {words}. Create a fill-in exercise for turn {n}. Output ONLY JSON."

#### E. Personalized Feedback (`feedback`)
**Use**: Post-session summary, weak area analysis, study recommendations
```json
{
  "summary": "string (2-3 sentences, encouraging)",
  "accuracy": {"overall": 0.73, "byType": {"flash": 0.8, "quiz": 0.65}},
  "weakWords": [{"word": "...", "errors": 3, "pattern": "confuses に/で"}],
  "strongWords": [{"word": "...", "streak": 5}],
  "recommendations": [
    {"type": "review|practice|new", "priority": 1, "description": "...", "words": [...]}
  ],
  "nextSessionFocus": "string"
}
```
- **Prompt**: "Analyze this session data: {json}. Provide encouraging feedback with specific weak/strong words and 3 recommendations. Output ONLY JSON."

---

## 3. VALIDATOR ENHANCEMENTS

### 3.1 Add to `LLMResponseValidator.SCHEMAS`
```javascript
paragraph: { /* schema above */ },
quiz: { /* schema above */ },
explanation: { /* schema above */ },
conversation: { /* schema above */ },
feedback: { /* schema above */ }
```

### 3.2 Add Prompt Builders
```javascript
buildParagraphPrompt(words, langCode, level, topic, count)
buildQuizPrompt(words, langCode, level, types, count)
buildExplanationPrompt(word, langCode, level, context)
buildConversationPrompt(words, langCode, level, scenario)
buildFeedbackPrompt(sessionData)
```

### 3.3 Add Validated Methods to LLMService Prototype
```javascript
LLMService.prototype.generateParagraph = async function(words, langCode, level, topic) { ... }
LLMService.prototype.generateQuiz = async function(words, langCode, level, types, count) { ... }
LLMService.prototype.generateExplanation = async function(word, langCode, level, context) { ... }
LLMService.prototype.generateConversation = async function(words, langCode, level, scenario) { ... }
LLMService.prototype.generateFeedback = async function(sessionData) { ... }
```

---

## 4. INTEGRATION POINTS

### 4.1 Game Modes Using New Roles

| Game Mode | New AI Role | Trigger |
|-----------|-------------|---------|
| Sentences | `paragraph` | "Read Paragraph" button (new) |
| Quiz | `quiz` | Dynamic question generation (replace static distractors) |
| Flashcard | `explanation` | Long-press word → "Explain" |
| Story | `conversation` | "Roleplay" variant |
| All | `feedback` | Session end modal |

### 4.2 UI Components Needed

1. **ParagraphReader** — displays generated paragraph with TTS sync, word tap → definition
2. **DynamicQuiz** — renders validated quiz JSON, tracks accuracy per question type
3. **ExplanationModal** — shows nuance, register, collocations, examples
4. **ConversationPanel** — turn-by-turn display, completion exercise
5. **FeedbackModal** — session summary with actionable recommendations

### 4.3 Caching Strategy
- **Key**: `{role}:{lang}:{level}:{wordHash}:{paramHash}`
- **TTL**: 7 days (IndexedDB)
- **Invalidation**: On schema version change (bump `validatorSchemaVersion` in localStorage)

---

## 5. FAILSAFE MECHANISMS

### 5.1 Timeout Guards
```javascript
const TIMEOUTS = {
  clozeMatch: 15000,
  grammarExplanation: 20000,
  listeningPassage: 30000,
  storyWithQuestions: 45000,
  paragraph: 30000,
  quiz: 35000,
  explanation: 25000,
  conversation: 40000,
  feedback: 20000
};
```

### 5.2 Circuit Breaker
- Track consecutive failures per role
- After 3 failures: disable role for 5 min, show "AI temporarily unavailable"
- Auto-recover on next successful request

### 5.3 Model Health Check
```javascript
async healthCheck() {
  const test = await this.validator.generateValidated('clozeMatch', ...simpleTest...);
  return !!test;
}
```
Run on app start, before each session, and after wake-from-background.

### 5.4 Offline Fallbacks
| Role | Fallback |
|------|----------|
| clozeMatch | Regex-based (current Phase 1) |
| grammarExplanation | Static template: "Grammar: [POS]. Usage: [context]. Example: [dict example]" |
| listeningPassage | Pre-cached passages from RTDB |
| storyWithQuestions | Pre-cached stories from RTDB |
| paragraph | Pre-cached paragraphs |
| quiz | Static distractors from vocab list |
| explanation | Dictionary definition only |
| conversation | Template dialogues |
| feedback | Rule-based (accuracy %, most-missed words) |

---

## 6. PROMPT ENGINEERING RULES

### 6.1 Universal Rules (in every system prompt)
```
- Output ONLY valid JSON matching the schema
- No markdown, no commentary, no "Here is the JSON:"
- All strings must be valid UTF-8
- No trailing commas
- Enum values must match exactly (case-sensitive)
- Arrays must have exact min/max items specified
```

### 6.2 Per-Role Rules (in user prompt)
- **clozeMatch**: "match MUST appear verbatim in sentence"
- **quiz**: "Each question must have exactly 4 choices for multiple_choice"
- **explanation**: "Register must be one of: formal|casual|polite|slang|literary"
- **conversation**: "Turns must alternate A/B/A/B..."
- **feedback**: "Recommendations must have type in review|practice|new"

### 6.3 Level-Aware Prompts
Always inject learner level context:
```
Learner level: {difficulty}. Adjust:
- A1/A2: Simple sentences, high-frequency vocab, present tense
- B1: Compound sentences, some subjunctive/conditional, topic vocabulary
- B2/C1: Complex sentences, idioms, nuance, abstract topics
```

---

## 7. IMPLEMENTATION PHASES

### Phase 1: Validator Expansion (Week 1)
- [ ] Add 5 new schemas to `LLMResponseValidator.SCHEMAS`
- [ ] Add 5 prompt builders
- [ ] Add 5 validated prototype methods
- [ ] Unit test each with mock LLM responses

### Phase 2: Paragraph Generator + UI (Week 2)
- [ ] `ParagraphReader` component
- [ ] "Read Paragraph" button in Sentences mode
- [ ] TTS sync with `audioCues`
- [ ] Word tap → definition (reuse Hanzi tooltip)

### Phase 3: Dynamic Quiz Generator (Week 3)
- [ ] `DynamicQuiz` component
- [ ] Replace static distractors in Quiz mode with AI-generated
- [ ] Track per-question-type accuracy for feedback

### Phase 4: Explanation Modal (Week 4)
- [ ] `ExplanationModal` component
- [ ] Long-press gesture on any word → AI explanation
- [ ] Cache aggressively (explanations rarely change)

### Phase 5: Conversation Roleplay (Week 5)
- [ ] `ConversationPanel` component
- [ ] New "Roleplay" sub-mode in Story
- [ ] Turn-by-turn TTS with speaker differentiation

### Phase 6: Session Feedback (Week 6)
- [ ] `FeedbackModal` component
- [ ] Post-session AI analysis
- [ ] Feed recommendations into next session word selection

### Phase 7: Circuit Breaker + Health Checks (Week 7)
- [ ] Per-role failure tracking
- [ ] Automatic fallback activation
- [ ] Model health check on resume

### Phase 8: Offline Fallback Population (Week 8)
- [ ] Pre-generate 500+ paragraphs, quizzes, stories via cloud AI
- [ ] Store in RTDB `/ai_fallbacks/{role}/{lang}/{level}`
- [ ] App syncs on WiFi

---

## 8. TESTING REQUIREMENTS

### 8.1 Schema Compliance Tests
```javascript
// For each role, test:
// 1. Valid response passes
// 2. Missing required field fails
// 3. Wrong enum value fails
// 4. Array length violation fails
// 5. Extra property fails
// 6. Type mismatch fails
```

### 8.2 Self-Correction Tests
```javascript
// Mock LLM to:
// 1. Return invalid JSON → validator retries → valid JSON → success
// 2. Return wrong enum → validator retries with error → fixed JSON → success
// 3. Fail 3 times → validator returns null → fallback activates
```

### 8.3 Integration Tests
- Paragraph: All target words present, CEFR-appropriate
- Quiz: All questions answerable, no ambiguous choices
- Explanation: Register enum valid, examples in target language
- Conversation: Turns alternate, completion exercise solvable
- Feedback: Recommendations reference actual session data

### 8.4 Performance Benchmarks (Gemma 4 31B @ 11T/s)
| Role | Expected Latency | Token Budget |
|------|------------------|--------------|
| clozeMatch | < 1.5s | 64 |
| grammarExplanation | < 2s | 256 |
| listeningPassage | < 3s | 384 |
| storyWithQuestions | < 5s | 768 |
| paragraph | < 3s | 512 |
| quiz (5q) | < 4s | 768 |
| explanation | < 2.5s | 384 |
| conversation | < 4s | 640 |
| feedback | < 2s | 384 |

---

## 9. MONITORING & DEBUGGING

### 9.1 Metrics to Log (debug mode only)
```javascript
{
  role: 'quiz',
  latencyMs: 3421,
  attempts: 2,
  validationErrors: ['choices[2].letter must be A/B/C/D'],
  fallbackUsed: false,
  cacheHit: false,
  model: 'gemma4:31b',
  timestamp: Date.now()
}
```

### 9.2 Dashboard Queries
- Success rate per role (target: >95%)
- Average latency per role
- Fallback activation rate (target: <2%)
- Cache hit rate (target: >60%)
- Self-correction rate (how often retry succeeds)

---

## 10. ROLLOUT STRATEGY

1. **Canary**: Enable for 10% users (debug flag `?ai_roles=1`)
2. **Validate**: Monitor metrics for 1 week
3. **Expand**: 50% → 100%
4. **Fallback**: Keep old regex/path as opt-in for comparison

---

## 11. RISKS & MITIGATIONS

| Risk | Mitigation |
|------|------------|
| Model hallucinates valid JSON but wrong content | Content validation in schema (e.g., `match` must be in sentence) |
| 31B model too slow on low-end devices | Circuit breaker + aggressive caching + cloud fallback option |
| Schema drift breaks parsing | Version schemas; bump `validatorSchemaVersion` on change |
| User sees "AI unavailable" too often | Health check warming; pre-generate fallbacks |
| Prompt injection via user content | Sanitize all user inputs in prompts; use JSON.stringify for data |

---

## 12. FILES TO CREATE/MODIFY

### New Files
- `public/js/llm_roles.js` — role-specific prompt builders (or extend validator)
- `public/js/components/ParagraphReader.js`
- `public/js/components/DynamicQuiz.js`
- `public/js/components/ExplanationModal.js`
- `public/js/components/ConversationPanel.js`
- `public/js/components/FeedbackModal.js`

### Modified Files
- `public/js/llm_response_validator.js` — add 5 schemas, 5 builders, 5 methods
- `public/js/llm.js` — ensure validator init, add healthCheck
- `public/js/game_sentences.js` — integrate ParagraphReader
- `public/js/game_quiz.js` — integrate DynamicQuiz
- `public/js/game_flashcard.js` — long-press → ExplanationModal
- `public/js/game_story.js` — add ConversationPanel variant
- `public/js/main.js` — session end → FeedbackModal
- `public/index.html` — load new component scripts

---

## 13. ACCEPTANCE CRITERIA

1. **Zero regex on AI output** — grep for `\.match\(` `RegExp` on AI responses returns 0
2. **All 9 roles validated** — each has schema, builder, validated method, UI component
3. **Self-correction works** — unit test: invalid → retry → valid succeeds
4. **Fallbacks activate** — simulate model down → template fallback renders
5. **Latency targets met** — P95 < targets in benchmarks
6. **Cache hit >60%** — after 1 week simulated usage
7. **No silent failures** — every AI call returns `{data, source: 'ai'|'cache'|'fallback'}` or throws

---

**Next Step**: Approve this plan → begin Phase 1 (Validator Expansion).