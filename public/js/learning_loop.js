/* js/learning_loop.js
 * Phase 2+3: Continuous Behavioral Learning Loop
 * - Logs every user interaction with AI-generated content
 * - Provides data for AI-driven prompt evolution
 * - Privacy-first: all data on-device in IndexedDB
 */

class LearningLoopDB {
    constructor() {
        this.db = null;
        this.dbName = 'vocabmaster_learning_loop';
        this.dbVersion = 2;
        this.currentSession = null;
        this.sessionId = null;
        this._init();
    }

    // ---------- IndexedDB lifecycle ----------

    _init() {
        try {
            const req = indexedDB.open(this.dbName, this.dbVersion);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'sessionId' });
                }
                if (!db.objectStoreNames.contains('prompt_templates')) {
                    db.createObjectStore('prompt_templates', { keyPath: 'role' });
                }
                if (!db.objectStoreNames.contains('loop_config')) {
                    db.createObjectStore('loop_config', { keyPath: 'key' });
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                L('[Loop] IndexedDB ready');
            };
            req.onerror = () => L('[Loop] IndexedDB init failed');
        } catch (e) {
            L('[Loop] IndexedDB not available');
        }
    }

    // ---------- Session management ----------

    startSession(gameMode, level, langCode) {
        this.sessionId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        this.currentSession = {
            sessionId: this.sessionId,
            timestamp: Date.now(),
            gameMode,
            userLevel: level || 'unknown',
            targetLang: langCode || 'ja',
            interactions: [],
            outcome: null
        };
        L('[Loop] Session started:', this.sessionId, gameMode);
    }

    endSession(outcome = {}) {
        if (!this.currentSession) return;
        this.currentSession.outcome = {
            completed: outcome.completed !== false,
            accuracy: outcome.accuracy ?? 0,
            engagement: outcome.engagement ?? 'low',
            interactionCount: this.currentSession.interactions.length,
            durationMs: Date.now() - this.currentSession.timestamp
        };
        this._persist(this.currentSession);
        this._autoCleanup();
        L('[Loop] Session ended:', this.sessionId, JSON.stringify(this.currentSession.outcome));
        this.currentSession = null;
        this.sessionId = null;
    }

    // ---------- Interaction logging ----------

    log(interaction) {
        if (!this.currentSession) return;
        this.currentSession.interactions.push({
            timestamp: Date.now(),
            ...interaction
        });
    }

    // Convenience helpers for game modes

    logAnswer(cardId, correct, userAnswer = null, correctAnswer = null, timeMs = 0) {
        this.log({
            type: 'answer',
            cardId,
            correct,
            userAnswer,
            correctAnswer,
            timeMs
        });
    }

    logTapWord(cardId, word, lang) {
        this.log({
            type: 'tapWord',
            cardId,
            word,
            lang
        });
    }

    logReplayAudio(cardId, word) {
        this.log({
            type: 'replayAudio',
            cardId,
            word
        });
    }

    logSkip(cardId, reason = '') {
        this.log({
            type: 'skip',
            cardId,
            reason
        });
    }

    logAIInteraction(role, cardId, critiqueScore = null, latencyMs = 0) {
        this.log({
            type: 'aiInteraction',
            role,
            cardId,
            critiqueScore,
            latencyMs
        });
    }

    logContentView(role, wordIds, durationMs = 0) {
        this.log({
            type: 'contentView',
            role,
            wordIds: Array.isArray(wordIds) ? wordIds : [wordIds],
            durationMs
        });
    }

    // ---------- Persistence ----------

    _persist(session) {
        if (!this.db) return;
        try {
            const tx = this.db.transaction('sessions', 'readwrite');
            const store = tx.objectStore('sessions');
            store.put(structuredClone(session));
            tx.onerror = () => L('[Loop] Persist failed:', tx.error?.message);
        } catch (e) {
            L('[Loop] Persist error:', e.message);
        }
        
        // Push to Firebase RTDB for cross-device syncing and advanced AI analysis
        try {
            if (window.app && app.auth && app.auth.currentUser && window.db) {
                const uid = app.auth.currentUser.uid;
                db.ref(`users/${uid}/learning_loop_sessions/${session.sessionId}`).set(session);
            }
        } catch(e) {
            L('[Loop] RTDB sync error:', e.message);
        }
    }

    _autoCleanup() {
        if (!this.db) return;
        const cutoff = Date.now() - (90 * 86400000); // 90 days
        try {
            const tx = this.db.transaction('sessions', 'readwrite');
            const store = tx.objectStore('sessions');
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.timestamp < cutoff) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };
        } catch (e) { /* silent */ }
    }

    // ---------- Data retrieval for AI analysis ----------

    async getRecentSessions(count = 20) {
        if (!this.db) return [];
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('sessions', 'readonly');
                const store = tx.objectStore('sessions');
                const sessions = [];
                const req = store.openCursor(null, 'prev'); // newest first
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && sessions.length < count) {
                        sessions.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(sessions);
                    }
                };
                req.onerror = () => resolve(sessions);
            } catch { resolve([]); }
        });
    }

    getSessionCount() {
        if (!this.db) return Promise.resolve(0);
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('sessions', 'readonly');
                const store = tx.objectStore('sessions');
                const req = store.count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(0);
            } catch { resolve(0); }
        });
    }

    // ---------- Prompt template system ----------

    async getPromptTemplates() {
        if (!this.db) return LLMService.DEFAULT_PROMPT_TEMPLATES || {};
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('prompt_templates', 'readonly');
                const store = tx.objectStore('prompt_templates');
                const req = store.getAll();
                req.onsuccess = () => {
                    const templates = {};
                    req.result.forEach(t => { templates[t.role] = t; });
                    resolve(Object.keys(templates).length ? templates : (LLMService.DEFAULT_PROMPT_TEMPLATES || {}));
                };
                req.onerror = () => resolve(LLMService.DEFAULT_PROMPT_TEMPLATES || {});
            } catch { resolve({}); }
        });
    }

    async savePromptTemplate(role, template) {
        if (!this.db) return;
        try {
            const tx = this.db.transaction('prompt_templates', 'readwrite');
            const store = tx.objectStore('prompt_templates');
            store.put({ role, ...template, updatedAt: Date.now() });
            L('[Loop] Template saved:', role);
        } catch (e) { L('[Loop] Template save failed:', e.message); }
    }

    async getLoopConfig(key) {
        if (!this.db) return null;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('loop_config', 'readonly');
                const store = tx.objectStore('loop_config');
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result?.value ?? null);
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
    }

    async setLoopConfig(key, value) {
        if (!this.db) return;
        try {
            const tx = this.db.transaction('loop_config', 'readwrite');
            const store = tx.objectStore('loop_config');
            store.put({ key, value, updatedAt: Date.now() });
        } catch (e) {}
    }

    // ---------- Convenience summary for AI prompt ----------

    buildSessionSummaryForAI(sessions = []) {
        const s = sessions[0] || {};
        return {
            sessionCount: sessions.length,
            avgAccuracy: sessions.reduce((sum, s) => sum + (s.outcome?.accuracy || 0), 0) / sessions.length,
            avgDurationMs: sessions.reduce((sum, s) => sum + (s.outcome?.durationMs || 0), 0) / sessions.length,
            totalInteractions: sessions.reduce((sum, s) => sum + s.interactions.length, 0),
            commonActions: this._topActions(sessions),
            topErrors: this._topErrors(sessions),
            topStruggles: this._topStruggles(sessions),
            level: s.userLevel || 'unknown',
            langCode: s.targetLang || 'ja'
        };
    }

    _topActions(sessions) {
        const counts = {};
        sessions.forEach(s => s.interactions?.forEach(i => {
            const key = `${i.gameMode || ''}:${i.type}`;
            counts[key] = (counts[key] || 0) + 1;
        }));
        return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([k,v]) => `${k}:${v}`);
    }

    _topErrors(sessions) {
        const errors = [];
        sessions.forEach(s => s.interactions?.forEach(i => {
            if (i.type === 'answer' && !i.correct) {
                errors.push({ wordId: i.cardId, userAnswer: i.userAnswer, correct: i.correctAnswer });
            }
        }));
        return errors.slice(0, 20);
    }

    _topStruggles(sessions) {
        const struggles = [];
        sessions.forEach(s => s.interactions?.forEach(i => {
            if (i.type === 'skip') struggles.push({ wordId: i.cardId, reason: i.reason });
        }));
        return struggles.slice(0, 10);
    }
}

// -------------------------------- Prompt Templates Defaults --------------------------------

LLMService.DEFAULT_PROMPT_TEMPLATES = {
    storyWithQuestions: {
        variables: {
            sentenceCount: { default: 5, current: 5, range: [3, 8] },
            unknownWordDensity: { default: 3, current: 3, range: [1, 5] },
            conjugationComplexity: { default: 'mixed', current: 'mixed', options: ['simple', 'mixed', 'complex'] },
            adjustments: { default: '', current: '' }
        }
    },
    paragraph: {
        variables: {
            sentenceCount: { default: 10, current: 10, range: [5, 15] },
            readingLevel: { default: 'comfortable', current: 'comfortable', options: ['easy', 'comfortable', 'challenging'] },
            adjustments: { default: '', current: '' }
        }
    },
    quiz: {
        variables: {
            easyRatio: { default: 0.4, current: 0.4, range: [0.2, 0.6] },
            mediumRatio: { default: 0.4, current: 0.4, range: [0.2, 0.6] },
            hardRatio: { default: 0.2, current: 0.2, range: [0.1, 0.4] },
            adjustments: { default: '', current: '' }
        }
    }
};

// -------------------------------- LLMService Analysis Method --------------------------------

LLMService.prototype.analyzeLearningPatterns = async function() {
    if (!this.validator) this.initValidator();
    if (!this.available || !this.hasModel) return null;
    if (!app || !app.learningLoop) return null;

    const sessions = await app.learningLoop.getRecentSessions(20);
    if (sessions.length < 3) {
        L('[Loop] Not enough sessions for analysis:', sessions.length);
        return null;
    }

    const summary = app.learningLoop.buildSessionSummaryForAI(sessions);
    const analysis = await this.validator.generateWithCritic({
        schemaName: 'feedback',
        promptBuilder: this.validator.buildFeedbackPrompt.bind(this.validator),
        level: summary.level,
        langCode: summary.langCode,
        promptArgs: [{
            accuracy: { overall: summary.avgAccuracy, byType: {} },
            interactions: summary.commonActions,
            level: summary.level,
            langCode: summary.langCode
        }],
        onProgress: null
    });

    return analysis?.data || null;
};

// -------------------------------- Prompt Adjustment Engine --------------------------------

LLMService.prototype.applyPromptAdjustments = async function(adjustments) {
    if (!app || !app.learningLoop) return;
    const suggestions = [];
    for (const [role, adjustmentText] of Object.entries(adjustments)) {
        const template = await app.learningLoop.getPromptTemplate(role);
        if (!template || !template.variables) continue;
        const changes = this.parseAdjustment(adjustmentText, template.variables);
        if (changes.length > 0) {
            suggestions.push({ role, changes, adjustmentText });
        }
    }
    if (suggestions.length > 0) {
        await app.learningLoop.savePendingAdjustments(suggestions);
        if (window.VM_DEBUG) L('[Loop] New prompt adjustments pending:', suggestions.length);
    }
};

LLMService.prototype.parseAdjustment = function(text, variables) {
    const changes = [];
    const lower = text.toLowerCase();

    for (const [name, cfg] of Object.entries(variables)) {
        if (cfg.options) {
            for (const opt of cfg.options) {
                const optLower = opt.toLowerCase();
                if (lower.includes(optLower) && opt !== cfg.current) {
                    changes.push({ var: name, from: cfg.current, to: opt, reason: text });
                    break;
                }
            }
        }
        if (cfg.range) {
            const numMatch = new RegExp(`\\b${name.replace(/([A-Z])/g,' $1').toLowerCase()}\\b.*?\\b(\\d+)\\b`, 'i');
            const m = lower.match(numMatch) || lower.match(new RegExp(`\\b(\\d+)\\b.*?${name.replace(/([A-Z])/g,' $1').toLowerCase()}`, 'i'));
            if (m) {
                const val = parseInt(m[1]);
                if (val >= cfg.range[0] && val <= cfg.range[1] && val !== cfg.current) {
                    changes.push({ var: name, from: cfg.current, to: val, reason: text });
                }
            }
        }
    }
    return changes;
};

LearningLoopDB.prototype.getPromptTemplate = async function(role) {
    if (!this.db) return LLMService.DEFAULT_PROMPT_TEMPLATES?.[role] || null;
    return new Promise((resolve) => {
        try {
            const tx = this.db.transaction('prompt_templates', 'readonly');
            const store = tx.objectStore('prompt_templates');
            const req = store.get(role);
            req.onsuccess = () => resolve(req.result || (LLMService.DEFAULT_PROMPT_TEMPLATES?.[role] || null));
            req.onerror = () => resolve(LLMService.DEFAULT_PROMPT_TEMPLATES?.[role] || null);
        } catch { resolve(LLMService.DEFAULT_PROMPT_TEMPLATES?.[role] || null); }
    });
};

LearningLoopDB.prototype.savePendingAdjustments = async function(suggestions) {
    const pending = await this.getLoopConfig('pending_adjustments') || [];
    suggestions.forEach(s => {
        s.id = 'adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        s.timestamp = Date.now();
        s.approved = false;
        s.dismissed = false;
    });
    pending.push(...suggestions);
    await this.setLoopConfig('pending_adjustments', pending.slice(-20)); // max 20 pending
    return pending;
};

LearningLoopDB.prototype.getPendingAdjustments = async function() {
    return (await this.getLoopConfig('pending_adjustments')) || [];
};

LearningLoopDB.prototype.approveAdjustment = async function(id) {
    const pending = (await this.getLoopConfig('pending_adjustments')) || [];
    const idx = pending.findIndex(a => a.id === id);
    if (idx < 0) return null;
    const adj = pending[idx];
    adj.approved = true;
    // Apply the change to the template
    const template = await this.getPromptTemplate(adj.role);
    if (template && template.variables) {
        adj.changes.forEach(change => {
            if (template.variables[change.var]) {
                template.variables[change.var].current = change.to;
            }
        });
        await this.savePromptTemplate(adj.role, template);
    }
    adj.appliedAt = Date.now();
    await this.setLoopConfig('pending_adjustments', pending);
    L('[Loop] Adjustment approved:', id, adj.role);
    return adj;
};

LearningLoopDB.prototype.dismissAdjustment = async function(id) {
    const pending = (await this.getLoopConfig('pending_adjustments')) || [];
    const idx = pending.findIndex(a => a.id === id);
    if (idx < 0) return;
    pending[idx].dismissed = true;
    pending[idx].dismissedAt = Date.now();
    await this.setLoopConfig('pending_adjustments', pending);
};

LearningLoopDB.prototype.resetAllTemplates = async function() {
    const defaults = LLMService.DEFAULT_PROMPT_TEMPLATES;
    for (const [role, template] of Object.entries(defaults)) {
        await this.savePromptTemplate(role, template);
    }
    await this.setLoopConfig('pending_adjustments', []);
    L('[Loop] All templates reset to defaults');
};

// -------------------------------- Global Accessibility --------------------------------

// Auto-initialize when app exists
function initLearningLoop() {
    if (window.app && !window.app.learningLoop) {
        window.app.learningLoop = new LearningLoopDB();
    }
}

// Hook into app init via MutationObserver or main.js
if (window.app) {
    initLearningLoop();
} else {
    // Will be called from main.js after app construction
    window._initLearningLoop = initLearningLoop;
}

window.LearningLoopDB = LearningLoopDB;