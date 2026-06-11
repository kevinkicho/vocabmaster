# AI Continuous Validation & Improvement Loop

**Goal**: AI continuously verifies/validates content fed into the app, learns from user interactions, and improves prompts/app behavior to best suit the learner.

**Model**: Gemma 4 31B @ 11T/s via ollama4android
**Principle**: No hard circuit breakers. Soft degradation with AI-driven recovery.

---

## 1. THREE-LAYER VALIDATION ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: SYNTACTIC (Validator) — already implemented           │
│  JSON schema compliance, type checks, required fields           │
│  → Hard gate: invalid = retry with error feedback               │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: SEMANTIC (AI Critic) — NEW                           │
│  AI evaluates: pedagogical quality, level-appropriateness,      │
│  cultural accuracy, learner engagement, diversity               │
│  → Soft gate: score < threshold = regenerate with critique     │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: BEHAVIORAL (Learning Loop) — NEW                     │
│  User interactions (taps, time, errors, completions) →         │
│  AI analyzes patterns → updates prompt templates →             │
│  better future generations                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. LAYER 2: AI CRITIC (Semantic Validation)

### 2.1 Critic Schema
```javascript
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
      required: ['levelAppropriate', 'pedagogicalValue', 'naturalness', 'diversity', 'culturalAccuracy', 'engagement']
    },
    issues: { type: 'array', items: { type: 'string' } },
    suggestedFix: { type: 'string' },
    approve: { type: 'boolean' }
  },
  required: ['overallScore', 'criteria', 'issues', 'suggestedFix', 'approve']
}
```

### 2.2 Critic Prompt (runs on same model, separate call)
```
You are a language learning content critic. Evaluate this generated content for a {level} learner of {language}.

CONTENT TO EVALUATE:
{generatedJSON}

CRITERIA (0-100 each):
1. levelAppropriate: Vocabulary/grammar matches {level} (CEFR/JLPT)
2. pedagogicalValue: Teaches something useful, not too easy/hard
3. naturalness: Sounds like native speaker would say/write it
4. diversity: Varied sentence structures, not repetitive
5. culturalAccuracy: Culturally appropriate, no hallucinated customs
6. engagement: Interesting, relevant to learner's likely goals

OUTPUT ONLY JSON:
{
  "overallScore": 85,
  "criteria": { "levelAppropriate": 90, "pedagogicalValue": 85, "naturalness": 88, "diversity": 75, "culturalAccuracy": 92, "engagement": 80 },
  "issues": ["Sentence 3 uses N2 grammar in N4 story", "Two sentences start with same pattern"],
  "suggestedFix": "Simplify sentence 3 grammar. Vary sentence openings.",
  "approve": false
}
```

### 2.3 Integration Flow
```javascript
async generateWithCritic(role, promptBuilder, ...args) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. Generate
    const raw = await this.validator.generateValidated(role, promptBuilder, ...args);
    if (!raw) continue;

    // 2. Critic evaluates
    const critique = await this.critic.evaluate(raw, role, this.currentLevel, this.currentLang);
    
    if (critique.approve && critique.overallScore >= 70) {
      return { data: raw, critiqueScore: critique.overallScore };
    }

    // 3. Regenerate with critic feedback
    args = [...args, critique.suggestedFix, critique.issues.join('; ')];
    L(`[Critic] Score ${critique.overallScore}, retrying: ${critique.suggestedFix}`);
  }
  // After 3 attempts, return best attempt with warning
  return { data: raw, critiqueScore: critique.overallScore, warning: 'Below threshold' };
}
```

---

## 3. LAYER 3: BEHAVIORAL LEARNING LOOP

### 3.1 Data Collected (Privacy-First, On-Device)
```javascript
// Stored in IndexedDB: 'vocabmaster_learning_loop'
{
  sessionId: 'uuid',
  timestamp: Date.now(),
  userLevel: 'N4',
  targetLang: 'ja',
  interactions: [
    {
      role: 'storyWithQuestions',
      wordIds: [123, 456, 789],
      generatedContent: {...},
      userActions: [
        { type: 'readStory', durationMs: 45000, scrollDepth: 1.0 },
        { type: 'answerQuestion', qIndex: 0, correct: true, timeMs: 8000 },
        { type: 'answerQuestion', qIndex: 1, correct: false, timeMs: 12000, chosen: 'B', correct: 'A' },
        { type: 'tapWord', word: '食べた', translationShown: true },
        { type: 'replayAudio', count: 2 },
        { type: 'skip', reason: 'too_hard' }
      ],
      outcome: { completed: true, accuracy: 0.5, engagement: 'medium' }
    }
  ]
}
```

### 3.2 AI Analyzes Patterns (Weekly/On-Demand)
```javascript
async analyzeLearningPatterns() {
  const sessions = await this.getRecentSessions(20); // Last 20 sessions
  
  const prompt = `Analyze this learner's interaction patterns and recommend prompt improvements.

LEARNER PROFILE:
- Level: ${this.currentLevel} (${this.currentLang})
- Sessions analyzed: ${sessions.length}
- Avg accuracy: ${avgAccuracy}
- Avg engagement: ${avgEngagement}

INTERACTION PATTERNS:
${sessions.map(s => `
  Role: ${s.role}
  Words: ${s.wordIds.length}
  Accuracy: ${s.outcome.accuracy}
  Engagement: ${s.outcome.engagement}
  Key behaviors: ${this.summarizeActions(s.userActions)}
`).join('\n')}

OUTPUT JSON:
{
  "strengths": ["Good at comprehension questions", "Engages with audio replay"],
  "weaknesses": ["Struggles with N4 conjugation in stories", "Skips when >3 unknown words"],
  "promptAdjustments": {
    "storyWithQuestions": "Reduce unknown word density to 2/story. Use simpler conjugation patterns. Add more context clues.",
    "paragraph": "Shorter sentences. More repetitive structure for reinforcement.",
    "quiz": "More fill-blank, fewer multiple-choice. Focus on particle usage."
  },
  "levelAdjustment": "maintain|increase|decrease",
  "recommendedFocus": ["particle usage", "past tense conjugation", "casual speech"]
}
`;
  
  const analysis = await this.validator.generateValidated('learningAnalysis', prompt);
  if (analysis) await this.applyPromptAdjustments(analysis.promptAdjustments);
  return analysis;
}
```

### 3.3 Dynamic Prompt Templates
Instead of hardcoded prompts, use **template variables** that the learning loop adjusts:

```javascript
// Stored in localStorage: 'vm_prompt_templates'
{
  storyWithQuestions: {
    base: "Write a {sentenceCount}-sentence story in {lang} using {wordCount} words: {words}. Level: {level}. {adjustments}",
    variables: {
      sentenceCount: { default: 5, current: 5, range: [3, 8] },
      unknownWordDensity: { default: 3, current: 2, range: [1, 5] }, // words not in learner's known vocab
      conjugationComplexity: { default: 'mixed', current: 'simple', options: ['simple', 'mixed', 'complex'] },
      culturalContext: { default: 'daily_life', current: 'daily_life', options: ['daily_life', 'travel', 'work', 'school'] },
      adjustments: { default: '', current: 'Reduce unknown word density to 2/story. Use simpler conjugation patterns.' }
    }
  },
  paragraph: { ... },
  quiz: { ... }
}
```

### 3.4 Auto-Adjustment Rules (AI-Proposed, User-Approved)
```javascript
applyPromptAdjustments(adjustments) {
  for (const [role, adj] of Object.entries(adjustments)) {
    const template = this.promptTemplates[role];
    if (!template) continue;
    
    // Parse AI suggestion into variable changes
    // e.g., "Reduce unknown word density to 2/story" → template.variables.unknownWordDensity.current = 2
    const changes = this.parseAdjustment(adj, template.variables);
    
    // Present to user for approval (non-intrusive)
    if (changes.length > 0) {
      this.showPromptTuningNotification(role, changes);
    }
  }
}

showPromptTuningNotification(role, changes) {
  // Small banner: "AI suggests: Simpler grammar for stories. Apply? [Yes] [Later]"
  // On Yes: update template.variables, save to localStorage
  // On Later: queue for next session
}
```

---

## 4. CONTINUOUS VALIDATION PIPELINE

```
┌────────────────────────────────────────────────────────────────────┐
│ REQUEST (e.g., generate story for N4 Japanese learner)            │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│ LAYER 1: SYNTACTIC VALIDATOR                                       │
│ - JSON schema compliance                                           │
│ - Required fields, types, enums                                    │
│ - Retry up to 2x with error feedback                               │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼ (valid JSON)
┌────────────────────────────────────────────────────────────────────┐
│ LAYER 2: AI CRITIC                                                 │
│ - Evaluates pedagogical quality, level fit, naturalness           │
│ - Scores 0-100, lists issues, suggests fix                         │
│ - If score < 70: regenerate with critic feedback (max 3 total)    │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼ (approved content)
┌────────────────────────────────────────────────────────────────────┐
│ DELIVER TO USER                                                    │
│ - Render in UI                                                     │
│ - Start interaction tracking                                       │
└──────────────────────────┬─────────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│ LAYER 3: BEHAVIORAL LEARNING (async, batched)                     │
│ - Log every tap, scroll, answer, replay, skip                     │
│ - Periodic AI analysis (weekly or after 10 sessions)              │
│ - Proposes prompt template adjustments                             │
│ - User approves → templates updated → better future generations   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. PROMPT EVOLUTION EXAMPLES

### Before Learning Loop
```
"Write a 5-sentence story in Japanese using these words: 食べる, 行う, 思う. Level: N4."
→ Story uses 食べられた (passive, N3), complex clauses, 4 unknown words
→ Learner struggles, skips, engagement drops
```

### After 3 Weeks (AI-Adjusted)
```
"Write a 5-sentence story in Japanese using these words: 食べる, 行う, 思う. 
Level: N4. 
Constraints: Max 2 words outside learner's known vocab. 
Use only dictionary form and -ta past tense. 
Simple SVO sentence structure. Topic: daily routine.
Context clues for each target word."
→ Story uses 食べた, 行った, 思った. 1 unknown word (美味しい, with picture context).
→ Learner reads fully, answers both questions correctly, replays audio.
```

---

## 6. IMPLEMENTATION CHECKLIST

### Phase 1: AI Critic (Week 1-2)
- [ ] Add `criticEvaluation` schema to validator
- [ ] Add `criticPrompt(role, content, level, lang)` builder
- [ ] Add `generateWithCritic(role, ...)` method
- [ ] Integrate into 4 existing roles + 5 new roles
- [ ] Threshold: 70/100 overall, no single criterion < 50

### Phase 2: Interaction Logging (Week 2-3)
- [ ] Add `LearningLoopDB` (IndexedDB store)
- [ ] Instrument all game modes: tap, scroll, answer, replay, skip, time
- [ ] Session summary on completion
- [ ] Privacy: auto-delete > 90 days, no cloud sync unless opted in

### Phase 3: Pattern Analysis (Week 3-4)
- [ ] `analyzeLearningPatterns()` with critic-style prompt
- [ ] `learningAnalysis` schema
- [ ] Weekly background run (or manual "Improve My AI" button)
- [ ] Output: strengths, weaknesses, promptAdjustments, levelAdjustment

### Phase 4: Dynamic Prompt Templates (Week 4-5)
- [ ] Template system with variables + ranges
- [ ] `parseAdjustment()` - natural language → variable changes
- [ ] User approval UI (non-intrusive banner)
- [ ] Persist templates in localStorage

### Phase 5: Continuous Refinement (Week 5-6)
- [ ] A/B testing: old prompts vs adjusted prompts
- [ ] Metrics: accuracy, engagement, completion rate, time per question
- [ ] Auto-rollback if metrics degrade
- [ ] Export/import templates for backup

---

## 7. KEY DIFFERENCES FROM PREVIOUS PLAN

| Previous (Failsafe) | New (Continuous Validation) |
|---------------------|----------------------------|
| Circuit breaker (hard stop) | Soft degradation + AI recovery |
| Static fallbacks | Dynamic prompt evolution |
| One-time validation | Continuous: syntactic → semantic → behavioral |
| Model health check | Content quality check (AI Critic) |
| Pre-generated offline cache | Learner-personalized generation |
| Reactive (fix when broken) | Proactive (improve before broken) |
| Generic for all users | Personalized per learner profile |

---

## 8. PRIVACY & PERFORMANCE

### Privacy
- All learning data stays on device (IndexedDB)
- Analysis runs locally on Gemma 4 31B
- No PII in prompts (only interaction patterns, no email/name)
- User can: view data, delete data, disable loop, export templates

### Performance (Gemma 4 31B @ 11T/s)
| Operation | Est. Latency | Frequency |
|-----------|--------------|-----------|
| Syntactic validation | < 50ms | Every request |
| AI Critic evaluation | ~2s (300 tokens) | Every request |
| Generation + Critic (2-3 attempts) | 4-8s | Every request |
| Pattern analysis | ~5s (500 tokens) | Weekly / manual |
| Template adjustment | < 100ms | On approval |

**Optimization**: Batch critic calls for prefetch; cache critic evaluations by content hash.

---

## 9. USER-FACING FEATURES

### "Improve My AI" Button (Settings → AI)
- Shows current prompt templates
- Runs analysis on demand
- Displays proposed adjustments with explanations
- One-tap apply / dismiss

### Learning Insights Card (Home Screen)
- "This week: AI made your stories 20% easier to read"
- "Weakness detected: particle usage → more practice queued"
- "Strength: audio replay helps retention → keeping auto-read on"

### Transparency Log (Debug)
```
[2026-06-06] Story prompt adjusted: unknownWordDensity 3→2 (user approved)
[2026-06-04] Quiz prompt adjusted: more fill-blank, less MC (auto-applied after 3 sessions)
[2026-06-01] Level maintained at N4 (accuracy 72%, engagement high)
```

---

## 10. ACCEPTANCE CRITERIA

1. **Zero hard failures** — no circuit breaker, no "AI unavailable" unless model truly down
2. **Critic improves quality** — A/B: critic-enabled generations score higher on user engagement
3. **Prompts evolve** — measurable template changes over 4 weeks per active user
4. **Personalization works** — same level, different users → different prompt adjustments
5. **Privacy preserved** — zero data leaves device without explicit opt-in
6. **Latency acceptable** — P95 generation+critic < 10s on Gemma 4 31B
7. **User controls loop** — can pause, view, reset, export at any time

---

**Next Step**: Approve → begin Phase 1 (AI Critic integration into existing validator).