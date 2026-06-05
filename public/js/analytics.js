/* js/analytics.js */
class AnalyticsService {
    constructor() {
        this.buffer = [];
        this.sessions = [];
        this.session = null;
        this.flushTimer = null;
        this.streakChecked = false;
        this.FLUSH_INTERVAL = 30000;
        this.FLUSH_THRESHOLD = 10;
        this.SESSION_KEY = 'vm_analytics_buffer';
        this._recoverBuffer();
        this._bindLifecycle();
    }

    // --- Event Recording ---
    recordAttempt(wordId, mode, isCorrect) {
        this.buffer.push({ wordId, mode, correct: isCorrect, ts: Date.now() });
        if (this.session) {
            if (isCorrect) this.session.correct++;
            else this.session.incorrect++;
        }
        if (this.buffer.length >= this.FLUSH_THRESHOLD) this.flush();
    }

    // --- Session Management ---
    startSession(mode) {
        if (this.session) this.endSession();
        this.session = { id: Date.now(), mode, start: Date.now(), correct: 0, incorrect: 0 };
    }

    endSession() {
        if (!this.session) return;
        this.session.end = Date.now();
        if (this.session.correct > 0 || this.session.incorrect > 0) {
            this.sessions.push({ ...this.session });
        }
        this.session = null;
        this.flush();
    }

    // --- Flushing ---
    async flush() {
        if (!this.buffer.length && !this.sessions.length) return;
        if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) {
            this._saveBuffer();
            return;
        }
        if (typeof db === 'undefined' || !db) return;

        const uid = auth.currentUser.uid;
        const bufferCopy = [...this.buffer];
        const sessionsCopy = [...this.sessions];
        this.buffer = [];
        this.sessions = [];

        try {
            const updates = this._buildFlushUpdates(uid, bufferCopy, sessionsCopy);
            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
            }
            sessionStorage.removeItem(this.SESSION_KEY);
            if (!this.streakChecked) {
                this.streakChecked = true;
                await this.updateStreak(uid);
            }
        } catch (e) {
            L('[Analytics] Flush failed', e);
            this.buffer = [...bufferCopy, ...this.buffer];
            this.sessions = [...sessionsCopy, ...this.sessions];
            this._saveBuffer();
        }
    }

    _buildFlushUpdates(uid, buffer, sessions) {
        const updates = {};
        const inc = firebase.database.ServerValue.increment;
        const todayKey = this._getTodayKey();

        // Aggregate buffer by wordId and mode
        const wordAgg = {};  // { wordId: { c, w, last, modes: { mode: { c, w } } } }
        const dailyAgg = {}; // { mode: { c, w } }
        let totalCorrect = 0, totalIncorrect = 0;

        for (const ev of buffer) {
            // Per-word aggregation
            if (!wordAgg[ev.wordId]) wordAgg[ev.wordId] = { c: 0, w: 0, last: 0, modes: {} };
            const wa = wordAgg[ev.wordId];
            if (ev.correct) wa.c++; else wa.w++;
            wa.last = Math.max(wa.last, ev.ts);
            if (!wa.modes[ev.mode]) wa.modes[ev.mode] = { c: 0, w: 0 };
            if (ev.correct) wa.modes[ev.mode].c++; else wa.modes[ev.mode].w++;

            // Daily aggregation
            if (!dailyAgg[ev.mode]) dailyAgg[ev.mode] = { c: 0, w: 0 };
            if (ev.correct) { dailyAgg[ev.mode].c++; totalCorrect++; }
            else { dailyAgg[ev.mode].w++; totalIncorrect++; }
        }

        const base = `users/${uid}`;

        // Lifetime totals
        if (totalCorrect > 0) updates[`${base}/analytics/lifetime/correct`] = inc(totalCorrect);
        if (totalIncorrect > 0) updates[`${base}/analytics/lifetime/incorrect`] = inc(totalIncorrect);

        // Lifetime per-mode
        for (const [mode, agg] of Object.entries(dailyAgg)) {
            if (agg.c > 0) updates[`${base}/analytics/lifetime/modes/${mode}/correct`] = inc(agg.c);
            if (agg.w > 0) updates[`${base}/analytics/lifetime/modes/${mode}/incorrect`] = inc(agg.w);
        }

        // Daily totals
        if (totalCorrect > 0) updates[`${base}/analytics/daily/${todayKey}/correct`] = inc(totalCorrect);
        if (totalIncorrect > 0) updates[`${base}/analytics/daily/${todayKey}/incorrect`] = inc(totalIncorrect);

        // Daily per-mode
        for (const [mode, agg] of Object.entries(dailyAgg)) {
            if (agg.c > 0) updates[`${base}/analytics/daily/${todayKey}/modes/${mode}/correct`] = inc(agg.c);
            if (agg.w > 0) updates[`${base}/analytics/daily/${todayKey}/modes/${mode}/incorrect`] = inc(agg.w);
        }

        // Per-word stats
        for (const [wordId, wa] of Object.entries(wordAgg)) {
            const wp = `${base}/words/${wordId}`;
            if (wa.c > 0) updates[`${wp}/c`] = inc(wa.c);
            if (wa.w > 0) updates[`${wp}/w`] = inc(wa.w);
            updates[`${wp}/last`] = wa.last;
            for (const [mode, ma] of Object.entries(wa.modes)) {
                if (ma.c > 0) updates[`${wp}/modes/${mode}/c`] = inc(ma.c);
                if (ma.w > 0) updates[`${wp}/modes/${mode}/w`] = inc(ma.w);
            }
        }

        // Sessions
        for (const s of sessions) {
            updates[`${base}/analytics/sessions/${s.id}`] = {
                mode: s.mode,
                start: s.start,
                end: s.end || Date.now(),
                correct: s.correct,
                incorrect: s.incorrect
            };
        }

        return updates;
    }

    // --- Streak ---
    async updateStreak(uid) {
        if (!uid || typeof db === 'undefined' || !db) return;
        try {
            const ref = db.ref(`users/${uid}/analytics/streak`);
            const snap = await ref.once('value');
            const streak = snap.val() || { current: 0, best: 0, lastDate: null };
            const today = this._getTodayKey();

            if (streak.lastDate === today) return; // Already updated today

            const yesterday = this._getDateKey(-1);
            if (streak.lastDate === yesterday) {
                streak.current++;
            } else {
                streak.current = 1;
            }
            streak.best = Math.max(streak.best, streak.current);
            streak.lastDate = today;
            await ref.set(streak);
        } catch (e) {
            L('[Analytics] Streak update failed', e);
        }
    }

    // --- Lifecycle ---
    _bindLifecycle() {
        this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this._saveBuffer();
                this.flush();
            }
        });

        window.addEventListener('beforeunload', () => {
            this._saveBuffer();
        });
    }

    _saveBuffer() {
        if (this.buffer.length === 0) return;
        try {
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(this.buffer));
        } catch (e) { /* sessionStorage full or unavailable */ }
    }

    _recoverBuffer() {
        try {
            const saved = sessionStorage.getItem(this.SESSION_KEY);
            if (saved) {
                const recovered = JSON.parse(saved);
                if (Array.isArray(recovered) && recovered.length > 0) {
                    this.buffer = [...recovered, ...this.buffer];
                    L(`[Analytics] Recovered ${recovered.length} buffered events`);
                }
                sessionStorage.removeItem(this.SESSION_KEY);
            }
        } catch (e) { /* ignore parse errors */ }
    }

    // --- Stats Retrieval (only called from stats modal) ---
    async getWordStats() {
        if (!auth || !auth.currentUser || !db || auth.currentUser.isAnonymous) return null;
        try {
            const snap = await db.ref(`users/${auth.currentUser.uid}/words`).once('value');
            return snap.val();
        } catch (e) { return null; }
    }

    async getAnalytics() {
        if (!auth || !auth.currentUser || !db || auth.currentUser.isAnonymous) return null;
        try {
            const snap = await db.ref(`users/${auth.currentUser.uid}/analytics`).once('value');
            return snap.val();
        } catch (e) { return null; }
    }

    async getMostMissedWords(limit = 15) {
        const wordStats = await this.getWordStats();
        if (!wordStats) return [];
        const entries = Object.entries(wordStats)
            .map(([id, data]) => ({ id: parseInt(id), ...data }))
            .filter(w => (w.w || 0) > 0)
            .sort((a, b) => (b.w || 0) - (a.w || 0))
            .slice(0, limit);

        // Join with vocab data for display names
        if (app.data && app.data.list) {
            entries.forEach(e => {
                const vocab = app.data.list.find(v => v.id === e.id);
                if (vocab) e.vocab = vocab;
            });
        }
        return entries;
    }

    async getAccuracyByMode() {
        const analytics = await this.getAnalytics();
        if (!analytics || !analytics.lifetime || !analytics.lifetime.modes) return {};
        const result = {};
        for (const [mode, data] of Object.entries(analytics.lifetime.modes)) {
            const c = data.correct || 0;
            const w = data.incorrect || 0;
            const total = c + w;
            result[mode] = { correct: c, incorrect: w, total, accuracy: total > 0 ? Math.round(c / total * 100) : 0 };
        }
        return result;
    }

    async getDailyAccuracy(days = 7) {
        const analytics = await this.getAnalytics();
        if (!analytics || !analytics.daily) return [];
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const key = this._getDateKey(-i);
            const day = analytics.daily[key] || {};
            const c = day.correct || 0;
            const w = day.incorrect || 0;
            const total = c + w;
            result.push({
                date: key,
                correct: c,
                incorrect: w,
                total,
                accuracy: total > 0 ? Math.round(c / total * 100) : 0
            });
        }
        return result;
    }

    // --- Helpers ---
    _getTodayKey() {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return (new Date(d - offset)).toISOString().slice(0, 10);
    }

    _getDateKey(offsetDays) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const offset = d.getTimezoneOffset() * 60000;
        return (new Date(d - offset)).toISOString().slice(0, 10);
    }

    destroy() {
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flush();
    }
}
