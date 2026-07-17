/* js/learning_path.js
 * LearningPathService — tiered curriculum spine (units within JLPT/HSK/TOPIK/CEFR).
 * Dual-universe helpers for Today compose: unit pool (new) + wide due universe.
 * Soft migration: existing users → pathMode 'free' unless they opt into guided.
 *
 * Cross-script: window.LearningPathService, window.getComposePool, etc.
 */

var PATH_LS_KEY = 'vm_learning_path_v1';
var UNIT_SIZE_DEFAULT = 40;

/** Default framework per target language code. */
var PATH_DEFAULT_FRAMEWORK = Object.freeze({
    ja: 'jlpt', zh: 'hsk', ko: 'topik',
    en: 'cefr', es: 'cefr', fr: 'cefr', de: 'cefr', it: 'cefr', pt: 'cefr', ru: 'cefr'
});

/**
 * Hand-curated unit themes (cycles by unit index). Used for Chat scenario + coach flavor.
 * themeTags optional for future content filtering.
 */
var UNIT_THEME_CATALOG = Object.freeze([
    { theme: 'daily', title: 'Daily life', themeTags: ['home', 'routine'] },
    { theme: 'food', title: 'Food & dining', themeTags: ['food', 'restaurant'] },
    { theme: 'travel', title: 'Travel', themeTags: ['travel', 'directions'] },
    { theme: 'shopping', title: 'Shopping', themeTags: ['shopping', 'money'] },
    { theme: 'school', title: 'School & study', themeTags: ['school', 'study'] },
    { theme: 'work', title: 'Work', themeTags: ['work', 'business'] },
    { theme: 'hobby', title: 'Hobbies', themeTags: ['hobby', 'free_time'] },
    { theme: 'health', title: 'Health', themeTags: ['health', 'body'] },
    { theme: 'culture', title: 'Culture & media', themeTags: ['culture', 'media'] },
    { theme: 'home', title: 'Home & family', themeTags: ['family', 'home'] }
]);

/**
 * Strict filter by tags — never expands empty result to full list.
 * @param {Array} list
 * @param {string[]} tags
 * @returns {Array}
 */
function filterListByTagsStrict(list, tags) {
    if (!Array.isArray(list) || !list.length) return [];
    if (!tags || !tags.length || tags.indexOf('all') !== -1) return list.slice();
    var set = {};
    for (var i = 0; i < tags.length; i++) set[tags[i]] = true;
    return list.filter(function (item) {
        if (!item || !item.tags || !item.tags.length) return false;
        for (var j = 0; j < item.tags.length; j++) {
            if (set[item.tags[j]]) return true;
        }
        return false;
    });
}

/**
 * Stable slice of word ids for a unit (first unlock snapshot source).
 */
function sliceUnitWordIds(list, tierTag, unitIndex, unitSize) {
    unitSize = unitSize || UNIT_SIZE_DEFAULT;
    var filtered = filterListByTagsStrict(list, [tierTag]);
    filtered = filtered.slice().sort(function (a, b) {
        return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    var start = unitIndex * unitSize;
    return filtered.slice(start, start + unitSize).map(function (w) { return Number(w.id); }).filter(function (id) {
        return Number.isFinite(id);
    });
}

function defaultPathProfile(prefs) {
    prefs = prefs || {};
    var target = prefs.presetTarget || prefs.flashFront || 'ja';
    var known = prefs.presetSource || 'en';
    // strip visual-only keys
    if (target === 'ja_furi' || target === 'ja_roma') target = 'ja';
    if (target === 'zh_pin') target = 'zh';
    if (target === 'ko_roma') target = 'ko';
    if (target === 'ru_tr') target = 'ru';
    var framework = PATH_DEFAULT_FRAMEWORK[target] || 'cefr';
    var group = null;
    if (typeof LEVEL_CONFIG !== 'undefined' && LEVEL_CONFIG.groups) {
        for (var i = 0; i < LEVEL_CONFIG.groups.length; i++) {
            if (LEVEL_CONFIG.groups[i].key === framework) {
                group = LEVEL_CONFIG.groups[i];
                break;
            }
        }
    }
    var tier = group && group.levels && group.levels[0] ? group.levels[0] : 'A1';
    // Prefer first concrete tag from legacy levelFilter
    if (prefs.levelFilter && prefs.levelFilter.length && prefs.levelFilter[0] !== 'all') {
        tier = prefs.levelFilter[0];
    }
    return {
        schemaVersion: 1,
        pathMode: 'free', // soft default for everyone until opt-in
        framework: framework,
        currentTier: tier,
        currentUnitId: null,
        knownLang: known,
        targetLang: target,
        placementStatus: 'skipped',
        freePlayScope: 'unit', // 'unit' | 'filtered'
        unitSize: UNIT_SIZE_DEFAULT,
        units: {},
        legacyLevelFilter: prefs.levelFilter ? prefs.levelFilter.slice() : ['all'],
        updatedAt: Date.now()
    };
}

class LearningPathService {
    constructor() {
        this.profile = null;
        this._loaded = false;
    }

    loadLocal() {
        try {
            var raw = localStorage.getItem(PATH_LS_KEY);
            if (raw) {
                this.profile = JSON.parse(raw);
                this._loaded = true;
                return this.profile;
            }
        } catch (_) {}
        return null;
    }

    saveLocal() {
        if (!this.profile) return;
        this.profile.updatedAt = Date.now();
        try {
            localStorage.setItem(PATH_LS_KEY, JSON.stringify(this.profile));
        } catch (_) {}
    }

    async load() {
        var prefs = (typeof app !== 'undefined' && app && app.store) ? app.store.prefs : {};
        this.loadLocal();
        if (!this.profile) {
            this.profile = defaultPathProfile(prefs);
            this.saveLocal();
        }
        // Soft migrate: never force guided on existing installs
        if (!this.profile.pathMode) this.profile.pathMode = 'free';
        if (!this.profile.freePlayScope) this.profile.freePlayScope = 'unit';

        try {
            if (typeof auth !== 'undefined' && auth.currentUser && typeof db !== 'undefined' && db) {
                var snap = await db.ref('users/' + auth.currentUser.uid + '/learningPath').once('value');
                if (snap.exists()) {
                    var remote = snap.val();
                    if (remote && (!this.profile.updatedAt || (remote.updatedAt || 0) >= this.profile.updatedAt)) {
                        this.profile = Object.assign(defaultPathProfile(prefs), remote);
                    }
                } else {
                    await this.flush();
                }
            }
        } catch (e) {
            if (typeof L === 'function') L('[Path] load remote failed', e);
        }
        this._loaded = true;
        return this.profile;
    }

    async flush() {
        if (!this.profile) return;
        this.saveLocal();
        try {
            if (typeof auth !== 'undefined' && auth.currentUser && typeof db !== 'undefined' && db) {
                await db.ref('users/' + auth.currentUser.uid + '/learningPath').update(this.profile);
            }
        } catch (e) {
            if (typeof L === 'function') L('[Path] flush failed', e);
        }
    }

    getProfile() {
        if (!this.profile) this.loadLocal();
        if (!this.profile) {
            var prefs = (typeof app !== 'undefined' && app && app.store) ? app.store.prefs : {};
            this.profile = defaultPathProfile(prefs);
        }
        return this.profile;
    }

    setPathMode(mode) {
        var p = this.getProfile();
        p.pathMode = mode === 'guided' ? 'guided' : 'free';
        if (p.pathMode === 'guided' && p.placementStatus === 'skipped') {
            p.placementStatus = 'pending';
        }
        this.saveLocal();
        this.flush();
    }

    setFreePlayScope(scope) {
        var p = this.getProfile();
        p.freePlayScope = scope === 'filtered' ? 'filtered' : 'unit';
        this.saveLocal();
        this.flush();
    }

    setTier(tier) {
        var p = this.getProfile();
        p.currentTier = tier;
        p.currentUnitId = null;
        this.saveLocal();
        this.flush();
    }

    /**
     * Ensure unit snapshot exists; return unit state.
     */
    ensureUnit(unitIndex) {
        var p = this.getProfile();
        var tier = p.currentTier;
        var unitId = tier + '_u' + unitIndex;
        if (!p.units) p.units = {};
        if (!p.units[unitId]) {
            var list = (typeof app !== 'undefined' && app && app.data && app.data.list) ? app.data.list : [];
            var ids = sliceUnitWordIds(list, tier, unitIndex, p.unitSize || UNIT_SIZE_DEFAULT);
            var themeMeta = UNIT_THEME_CATALOG[unitIndex % UNIT_THEME_CATALOG.length];
            p.units[unitId] = {
                unitId: unitId,
                tier: tier,
                index: unitIndex,
                wordIds: ids,
                theme: themeMeta.theme,
                themeTitle: themeMeta.title,
                themeTags: themeMeta.themeTags.slice(),
                unlockedAt: Date.now(),
                completedAt: null,
                progress: 0
            };
            p.currentUnitId = unitId;
            this.saveLocal();
            this.flush();
        }
        if (!p.currentUnitId) p.currentUnitId = unitId;
        return p.units[unitId];
    }

    getActiveUnit() {
        var p = this.getProfile();
        if (p.pathMode !== 'guided') return null;
        if (p.currentUnitId && p.units && p.units[p.currentUnitId]) {
            return p.units[p.currentUnitId];
        }
        return this.ensureUnit(0);
    }

    /**
     * Pool scopes for compose / free play.
     * @param {'unit'|'tier'|'filtered'|'dueUniverse'} scope
     * @returns {Array}
     */
    getComposePool(scope) {
        var list = (typeof app !== 'undefined' && app && app.data && app.data.list) ? app.data.list : [];
        var p = this.getProfile();
        var prefs = (typeof app !== 'undefined' && app && app.store) ? app.store.prefs : {};

        if (scope === 'unit') {
            var unit = this.getActiveUnit();
            if (!unit || !unit.wordIds || !unit.wordIds.length) return [];
            var byId = {};
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].id != null) byId[Number(list[i].id)] = list[i];
            }
            return unit.wordIds.map(function (id) { return byId[Number(id)]; }).filter(Boolean);
        }
        if (scope === 'tier') {
            return filterListByTagsStrict(list, [p.currentTier]);
        }
        // filtered / dueUniverse baseline: tag filter if set, else all (explicit all)
        var tags = prefs.tagFilter && !prefs.tagFilter.includes('all') ? prefs.tagFilter
            : (prefs.levelFilter && !prefs.levelFilter.includes('all') ? prefs.levelFilter : null);
        if (!tags) return list.slice();
        return filterListByTagsStrict(list, tags);
    }

    /**
     * Free-play list: unit when guided+unit scope; else filtered (strict).
     */
    getPracticeList() {
        var p = this.getProfile();
        if (p.pathMode === 'guided' && p.freePlayScope !== 'filtered') {
            var unitPool = this.getComposePool('unit');
            if (unitPool.length) return unitPool;
        }
        // Prefer data.getFilteredListStrict if present
        if (typeof app !== 'undefined' && app && app.data) {
            if (typeof app.data.getFilteredListStrict === 'function') {
                return app.data.getFilteredListStrict();
            }
            if (typeof app.data.getFilteredList === 'function') {
                return app.data.getFilteredList();
            }
            return app.data.list || [];
        }
        return [];
    }

    /**
     * Dual-universe selection for Today.
     * newItems from unit only; due multi-pass unit → tier → filtered.
     */
    selectTodayItems(defaults, now) {
        defaults = defaults || { maxNew: 5, maxDue: 12 };
        now = now != null ? now : Date.now();
        var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
        var unitPool = this.getComposePool('unit');
        var tierPool = this.getComposePool('tier');
        var widePool = this.getComposePool('filtered');
        if (!widePool.length && typeof app !== 'undefined' && app && app.data && app.data.list) {
            widePool = app.data.list.slice();
        }

        var unitIds = {};
        unitPool.forEach(function (w) { if (w && w.id != null) unitIds[Number(w.id)] = true; });
        var tierIds = {};
        tierPool.forEach(function (w) { if (w && w.id != null) tierIds[Number(w.id)] = true; });
        var wideById = {};
        widePool.forEach(function (w) { if (w && w.id != null) wideById[Number(w.id)] = w; });

        var newItems = [];
        if (mem && typeof mem.getNewCandidates === 'function') {
            newItems = mem.getNewCandidates(unitPool, { limit: defaults.maxNew || 5 }) || [];
        } else {
            newItems = unitPool.slice(0, defaults.maxNew || 5);
        }

        var due = [];
        var used = {};
        newItems.forEach(function (w) { if (w && w.id != null) used[Number(w.id)] = true; });

        function takeDue(filterFn, limit) {
            if (!mem || typeof mem.getDueCards !== 'function' || due.length >= limit) return;
            var cards = mem.getDueCards(now, {
                limit: limit * 3,
                filterFn: filterFn
            }) || [];
            for (var i = 0; i < cards.length && due.length < limit; i++) {
                var c = cards[i];
                var id = Number(c.wordId != null ? c.wordId : c.id);
                if (!Number.isFinite(id) || used[id]) continue;
                used[id] = true;
                var item = wideById[id] || { id: id };
                due.push(item);
            }
        }

        var maxDue = defaults.maxDue || 12;
        // Pass 1: due in unit
        takeDue(function (card) {
            var id = Number(card.wordId != null ? card.wordId : card.id);
            return !!unitIds[id];
        }, maxDue);
        // Pass 2: due in tier
        takeDue(function (card) {
            var id = Number(card.wordId != null ? card.wordId : card.id);
            return !!tierIds[id];
        }, maxDue);
        // Pass 3: any due in wide universe
        takeDue(function (card) {
            var id = Number(card.wordId != null ? card.wordId : card.id);
            return !!wideById[id];
        }, maxDue);

        return {
            newItems: newItems,
            due: due,
            unitPool: unitPool,
            meta: {
                pathMode: this.getProfile().pathMode,
                unitId: this.getProfile().currentUnitId,
                tier: this.getProfile().currentTier,
                freePlayScope: this.getProfile().freePlayScope
            }
        };
    }

    pathProgressLabel() {
        var p = this.getProfile();
        if (p.pathMode !== 'guided') return 'Free practice';
        var unit = this.getActiveUnit();
        var n = unit && unit.wordIds ? unit.wordIds.length : 0;
        var theme = unit && unit.themeTitle ? ' · ' + unit.themeTitle : '';
        return (p.currentTier || '') + (unit ? ' · Unit ' + ((unit.index || 0) + 1) : '') + theme + (n ? ' · ' + n + ' words' : '');
    }

    /** Chat / coach theme for active unit (or null). */
    getUnitTheme() {
        var unit = this.getActiveUnit();
        return unit && unit.theme ? unit.theme : null;
    }

    /** Start formal placement (FSRS-safe). */
    startPlacement() {
        var p = this.getProfile();
        p.placementStatus = 'in_progress';
        p.pathMode = 'guided';
        this.saveLocal();
        this.flush();
        if (typeof app !== 'undefined' && app && typeof app.launch === 'function' && typeof Placement !== 'undefined') {
            app.launch(function () { return new Placement(); });
        }
    }

    /** Skip placement without writing FSRS; stay guided at current/floor tier. */
    skipPlacement() {
        var p = this.getProfile();
        p.placementStatus = 'skipped';
        if (!p.pathMode) p.pathMode = 'guided';
        this.ensureUnit(0);
        this.saveLocal();
        this.flush();
        try {
            if (window.EngagementService) EngagementService.increment('placementSkipped', 1);
        } catch (_) {}
        if (typeof app !== 'undefined' && app) {
            if (app.ui && app.ui.showToast) {
                app.ui.showToast('Placement skipped · starting at ' + (p.currentTier || 'your tier'), 'info');
            }
            if (typeof app.goHome === 'function') app.goHome(false);
        }
    }

    /** Unit mastery progress 0–100 from memory when available. */
    unitProgressPercent() {
        var unit = this.getActiveUnit();
        if (!unit || !unit.wordIds || !unit.wordIds.length) return 0;
        if (unit.progress != null && unit.progress > 0) return Math.min(100, Math.round(unit.progress));
        var mem = (typeof app !== 'undefined' && app) ? app.memory : null;
        if (!mem || mem._isStub || typeof mem.getCard !== 'function') return 0;
        var known = 0;
        for (var i = 0; i < unit.wordIds.length; i++) {
            var c = mem.getCard(unit.wordIds[i]);
            if (c && (c.reps > 0 || c.state === 'review' || c.state === 'relearning')) known++;
        }
        return Math.min(100, Math.round((known / unit.wordIds.length) * 100));
    }
}

window.UNIT_THEME_CATALOG = UNIT_THEME_CATALOG;

// --- DataService helpers (strict filter) ---
if (typeof DataService !== 'undefined') {
    DataService.prototype.getFilteredListStrict = function () {
        var prefs = (typeof app !== 'undefined' && app && app.store) ? app.store.prefs : null;
        var list = this.list || [];
        if (!prefs) return list.slice();
        var out = list;
        if (prefs.levelFilter && !prefs.levelFilter.includes('all')) {
            out = filterListByTagsStrict(out, prefs.levelFilter);
        }
        if (prefs.tagFilter && !prefs.tagFilter.includes('all')) {
            out = filterListByTagsStrict(out, prefs.tagFilter);
        }
        return out; // may be empty — never expand
    };
}

window.LearningPathService = LearningPathService;
window.filterListByTagsStrict = filterListByTagsStrict;
window.sliceUnitWordIds = sliceUnitWordIds;
window.PATH_DEFAULT_FRAMEWORK = PATH_DEFAULT_FRAMEWORK;
window.defaultPathProfile = defaultPathProfile;
