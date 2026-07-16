/* js/tutor_moments.js — lightweight AI engagement hooks
 * Coach tip of day, post-miss micro-explain, session wrap-up.
 * Critic skipped; non-blocking; cache-first tips.
 * window.TutorMoments
 */

var TutorMoments = (function () {
    var TIP_KEY = 'vm_coach_tip_v1';
    var MISS_COOLDOWN_MS = 12000;
    var _lastMissAt = 0;

    function todayKey() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function knownLang() {
        try {
            return (app.store && app.store.prefs && app.store.prefs.presetSource) || 'en';
        } catch (_) {
            return 'en';
        }
    }

    function targetLang() {
        try {
            if (app.learningPath && app.learningPath.getProfile) {
                return app.learningPath.getProfile().targetLang || 'ja';
            }
            return (app.store && app.store.prefs && app.store.prefs.presetTarget) || 'ja';
        } catch (_) {
            return 'ja';
        }
    }

    async function coachTipOfDay() {
        try {
            var cached = null;
            try {
                cached = JSON.parse(localStorage.getItem(TIP_KEY) || 'null');
            } catch (_) {}
            if (cached && cached.date === todayKey() && cached.text) return cached.text;

            if (!app.llm || !app.llm.available) return null;
            var tier = '';
            try {
                if (app.learningPath) tier = app.learningPath.getProfile().currentTier || '';
            } catch (_) {}
            var prompt =
                'One short motivating coach tip (max 2 sentences) for a ' +
                targetLang() +
                ' learner' +
                (tier ? ' at ' + tier : '') +
                '. Language of tip: ' +
                knownLang() +
                '. No markdown.';
            var text = await app.llm.generate({
                prompt: prompt,
                system: 'Output only the tip text.',
                options: { temperature: 0.7, num_predict: 80 },
                timeout: 12000
            });
            text = (text || '').trim().slice(0, 280);
            if (!text) return null;
            try {
                localStorage.setItem(TIP_KEY, JSON.stringify({ date: todayKey(), text: text }));
            } catch (_) {}
            return text;
        } catch (e) {
            if (typeof L === 'function') L('[Tutor] tip failed', e);
            return null;
        }
    }

    /**
     * Non-blocking micro-explain after a miss.
     * @param {{word?:string, correct?:string, userAnswer?:string, mode?:string}} info
     */
    function maybeExplainMiss(info) {
        info = info || {};
        var now = Date.now();
        if (now - _lastMissAt < MISS_COOLDOWN_MS) return;
        _lastMissAt = now;
        if (!app.llm || !app.llm.available) return;

        // fire-and-forget
        (async function () {
            try {
                var prompt =
                    'Learner missed a ' +
                    targetLang() +
                    ' item. Word/phrase: ' +
                    (info.word || info.correct || '?') +
                    '. Explain the mistake in 1-2 short sentences in ' +
                    knownLang() +
                    '. No markdown.';
                var text = await app.llm.generate({
                    prompt: prompt,
                    system: 'Brief tutor. Output explanation only.',
                    options: { temperature: 0.4, num_predict: 100 },
                    timeout: 8000
                });
                text = (text || '').trim();
                if (text && app.ui && app.ui.showToast) {
                    app.ui.showToast(text.slice(0, 160), 'info');
                }
            } catch (_) {
                /* non-blocking */
            }
        })();
    }

    async function sessionWrapUp(stats) {
        stats = stats || {};
        if (!app.llm || !app.llm.available) return null;
        try {
            var prompt =
                'Write a 2-sentence encouraging wrap-up for a language session. Correct: ' +
                (stats.correct || 0) +
                ', missed: ' +
                (stats.incorrect || 0) +
                ', new: ' +
                (stats.newIntroduced || 0) +
                '. Language: ' +
                knownLang() +
                '. No markdown.';
            var text = await app.llm.generate({
                prompt: prompt,
                system: 'Coach voice. Output only the wrap-up.',
                options: { temperature: 0.6, num_predict: 100 },
                timeout: 15000
            });
            return (text || '').trim() || null;
        } catch (_) {
            return null;
        }
    }

    return {
        coachTipOfDay: coachTipOfDay,
        maybeExplainMiss: maybeExplainMiss,
        sessionWrapUp: sessionWrapUp
    };
})();

window.TutorMoments = TutorMoments;
