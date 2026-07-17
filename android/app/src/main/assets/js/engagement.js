/* js/engagement.js — lightweight engagement counters (RTDB increments + offline queue)
 * Path: users/{uid}/engagement/daily/{yyyy-mm-dd}
 * window.EngagementService
 */

var ENGAGEMENT_QUEUE_KEY = 'vm_engagement_queue_v1';

function engagementDayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

var EngagementService = (function () {
    function uid() {
        try {
            if (window.app && app.auth && app.auth.currentUser) return app.auth.currentUser.uid;
            if (typeof auth !== 'undefined' && auth && auth.currentUser) return auth.currentUser.uid;
        } catch (_) {}
        return null;
    }

    function loadQueue() {
        try {
            return JSON.parse(localStorage.getItem(ENGAGEMENT_QUEUE_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function saveQueue(q) {
        try {
            localStorage.setItem(ENGAGEMENT_QUEUE_KEY, JSON.stringify(q));
        } catch (_) {}
    }

    /**
     * Increment a daily counter field.
     * @param {string} field e.g. sessionCompleted, fabOpens, coachTipShown
     * @param {number} [n=1]
     */
    function increment(field, n) {
        if (!field || typeof field !== 'string') return;
        n = n == null ? 1 : Number(n);
        if (!Number.isFinite(n) || n === 0) return;
        var day = engagementDayKey();
        var q = loadQueue();
        if (!q[day]) q[day] = {};
        q[day][field] = (q[day][field] || 0) + n;
        saveQueue(q);
        flushSoon();
    }

    var _flushTimer = null;
    function flushSoon() {
        if (_flushTimer) return;
        _flushTimer = setTimeout(function () {
            _flushTimer = null;
            flush().catch(function () {});
        }, 400);
    }

    async function flush() {
        var userId = uid();
        if (!userId) return;
        if (typeof db === 'undefined' || !db) return;
        var q = loadQueue();
        var days = Object.keys(q);
        if (!days.length) return;
        var remaining = {};
        for (var di = 0; di < days.length; di++) {
            var day = days[di];
            var fields = q[day] || {};
            var keys = Object.keys(fields);
            if (!keys.length) continue;
            try {
                var ref = db.ref('users/' + userId + '/engagement/daily/' + day);
                var updates = {};
                for (var i = 0; i < keys.length; i++) {
                    var f = keys[i];
                    var delta = fields[f];
                    if (!delta) continue;
                    // Firebase ServerValue.increment when available
                    if (typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue) {
                        updates[f] = firebase.database.ServerValue.increment(delta);
                    } else {
                        // Fallback: read-modify-write (best effort)
                        updates[f] = (await ref.child(f).once('value')).val() || 0;
                        updates[f] = Number(updates[f]) + delta;
                    }
                }
                if (Object.keys(updates).length) {
                    updates.updatedAt = Date.now();
                    await ref.update(updates);
                }
            } catch (e) {
                remaining[day] = fields;
                if (typeof L === 'function') L('[Engagement] flush failed', e);
            }
        }
        saveQueue(remaining);
    }

    return {
        increment: increment,
        flush: flush,
        dayKey: engagementDayKey
    };
})();

window.EngagementService = EngagementService;
window.engagementDayKey = engagementDayKey;
