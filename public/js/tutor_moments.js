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

    function enabled() {
        try {
            var p = app.store && app.store.prefs;
            if (p && p.tutorMomentsEnabled === false) return false;
        } catch (_) {}
        return true;
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

    function llmBusy() {
        try {
            if (!app.llm) return true;
            if (typeof app.llm.available === 'boolean' && !app.llm.available) return true;
            // Prefer not stacking on long Story/Grammar work
            if (typeof app.llm._activeRequests === 'number' && app.llm._activeRequests >= 2) return true;
            if (Array.isArray(app.llm._queue) && app.llm._queue.length >= 2) return true;
        } catch (_) {}
        return false;
    }

    function track(field) {
        try {
            if (window.EngagementService && EngagementService.increment) {
                EngagementService.increment(field, 1);
            }
        } catch (_) {}
    }

    function offlineWrapUp(stats) {
        stats = stats || {};
        var correct = stats.correct || 0;
        var missed = stats.incorrect || 0;
        var neu = stats.newIntroduced || 0;
        if (correct + missed === 0) {
            return 'Session logged. A little practice every day compounds.';
        }
        var acc = Math.round((correct / Math.max(1, correct + missed)) * 100);
        var line1 = acc >= 80
            ? 'Strong session — ' + acc + '% accuracy.'
            : (acc >= 50
                ? 'Solid work — ' + acc + '% accuracy. Misses are fuel for tomorrow’s reviews.'
                : 'Tough set today — ' + acc + '% is still progress. Come back for the due cards.');
        var line2 = neu > 0
            ? 'You met ' + neu + ' new word' + (neu === 1 ? '' : 's') + '. See you tomorrow.'
            : 'Due reviews keep words alive. See you tomorrow.';
        return line1 + ' ' + line2;
    }

    async function coachTipOfDay() {
        if (!enabled()) return null;
        try {
            var cached = null;
            try {
                cached = JSON.parse(localStorage.getItem(TIP_KEY) || 'null');
            } catch (_) {}
            if (cached && cached.date === todayKey() && cached.text) {
                track('coachTipShown');
                return cached.text;
            }

            if (!app.llm || !app.llm.available || llmBusy()) {
                var tier0 = '';
                try {
                    if (app.learningPath) tier0 = app.learningPath.getProfile().currentTier || '';
                } catch (_) {}
                var theme0 = '';
                try {
                    if (app.learningPath && app.learningPath.getUnitTheme) {
                        theme0 = app.learningPath.getUnitTheme() || '';
                    }
                } catch (_) {}
                var fallback =
                    'Practice a little every day' +
                    (tier0 ? ' at ' + tier0 : '') +
                    (theme0 ? ' · focus: ' + theme0 : '') +
                    '. Short sessions beat cramming.';
                try {
                    localStorage.setItem(TIP_KEY, JSON.stringify({ date: todayKey(), text: fallback }));
                } catch (_) {}
                track('coachTipShown');
                return fallback;
            }

            var tier = '';
            var theme = '';
            try {
                if (app.learningPath) {
                    tier = app.learningPath.getProfile().currentTier || '';
                    if (app.learningPath.getUnitTheme) theme = app.learningPath.getUnitTheme() || '';
                    var unit = app.learningPath.getActiveUnit && app.learningPath.getActiveUnit();
                    if (unit && unit.themeTitle) theme = unit.themeTitle;
                }
            } catch (_) {}
            var prompt =
                'One short motivating coach tip (max 2 sentences) for a ' +
                targetLang() +
                ' learner' +
                (tier ? ' at ' + tier : '') +
                (theme ? ' studying ' + theme : '') +
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
            track('coachTipShown');
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
        if (!enabled()) return;
        info = info || {};
        var now = Date.now();
        if (now - _lastMissAt < MISS_COOLDOWN_MS) return;
        _lastMissAt = now;
        if (!app.llm || !app.llm.available || llmBusy()) return;

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
                    track('tutorExplainsShown');
                }
            } catch (_) {
                /* non-blocking */
            }
        })();
    }

    async function sessionWrapUp(stats) {
        stats = stats || {};
        if (!enabled()) return offlineWrapUp(stats);
        if (!app.llm || !app.llm.available || llmBusy()) return offlineWrapUp(stats);
        try {
            var unitHint = '';
            try {
                if (app.learningPath && app.learningPath.pathProgressLabel) {
                    unitHint = app.learningPath.pathProgressLabel() || '';
                }
            } catch (_) {}
            var prompt =
                'Write a 2-sentence encouraging wrap-up for a language session. Correct: ' +
                (stats.correct || 0) +
                ', missed: ' +
                (stats.incorrect || 0) +
                ', new: ' +
                (stats.newIntroduced || 0) +
                (unitHint ? ', path: ' + unitHint : '') +
                '. Language: ' +
                knownLang() +
                '. No markdown.';
            var text = await app.llm.generate({
                prompt: prompt,
                system: 'Coach voice. Output only the wrap-up.',
                options: { temperature: 0.6, num_predict: 100 },
                timeout: 15000
            });
            text = (text || '').trim();
            return text || offlineWrapUp(stats);
        } catch (_) {
            return offlineWrapUp(stats);
        }
    }

    return {
        coachTipOfDay: coachTipOfDay,
        maybeExplainMiss: maybeExplainMiss,
        sessionWrapUp: sessionWrapUp,
        offlineWrapUp: offlineWrapUp
    };
})();

window.TutorMoments = TutorMoments;
