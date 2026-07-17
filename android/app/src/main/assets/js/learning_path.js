/* js/learning_path.js
 * LearningPathService — tiered curriculum spine (units within JLPT/HSK/TOPIK/CEFR).
 * Dual-universe helpers for Today compose: unit pool (new) + wide due universe.
 * Default pathMode is 'guided' (Continue with guided). Users can toggle free
 * practice via the home path chip (two-state: Guided ↔ Free).
 *
 * Cross-script: window.LearningPathService, window.getComposePool, etc.
 */

var PATH_LS_KEY = 'vm_learning_path_v1';
/** Target words per unit (thematic buckets may be smaller/larger). */
var UNIT_SIZE_DEFAULT = 30;
/** Bump when unit membership algorithm changes — rebuilds local unit snapshots. */
var UNIT_PLAN_VERSION = 2;
/** Soft display ceiling per exam level (covers full tagged corpus for each level). */
var MAP_MAX_UNITS_PER_TIER = 80;

/** Default framework per target language code. */
var PATH_DEFAULT_FRAMEWORK = Object.freeze({
    ja: 'jlpt', zh: 'hsk', ko: 'topik',
    en: 'cefr', es: 'cefr', fr: 'cefr', de: 'cefr', it: 'cefr', pt: 'cefr', ru: 'cefr'
});

/**
 * Hand-curated unit themes. keywords score against vocab en/ex for clustering.
 * themeTags optional for Chat scenario + coach flavor.
 */
var UNIT_THEME_CATALOG = Object.freeze([
    {
        theme: 'daily', title: 'Daily life', themeTags: ['home', 'routine'],
        keywords: ['today', 'tomorrow', 'yesterday', 'morning', 'night', 'everyday', 'always', 'often', 'sometimes', 'now', 'time', 'clock', 'week', 'month', 'year', 'daily', 'routine', 'habit', 'early', 'late', 'busy']
    },
    {
        theme: 'food', title: 'Food & dining', themeTags: ['food', 'restaurant'],
        keywords: ['food', 'eat', 'meal', 'rice', 'bread', 'drink', 'water', 'tea', 'coffee', 'restaurant', 'menu', 'hungry', 'delicious', 'taste', 'cook', 'kitchen', 'fruit', 'vegetable', 'meat', 'fish', 'soup', 'breakfast', 'lunch', 'dinner', 'sweet', 'salty', 'restaurant', 'cafe']
    },
    {
        theme: 'travel', title: 'Travel', themeTags: ['travel', 'directions'],
        keywords: ['travel', 'train', 'station', 'ticket', 'hotel', 'bus', 'airport', 'flight', 'map', 'luggage', 'passport', 'tourist', 'subway', 'taxi', 'road', 'street', 'direction', 'left', 'right', 'north', 'south', 'bridge', 'platform', 'express', 'trip', 'journey', 'abroad']
    },
    {
        theme: 'shopping', title: 'Shopping', themeTags: ['shopping', 'money'],
        keywords: ['shop', 'shopping', 'buy', 'sell', 'price', 'money', 'cheap', 'expensive', 'wallet', 'cash', 'store', 'market', 'discount', 'pay', 'yen', 'dollar', 'receipt', 'bag', 'customer']
    },
    {
        theme: 'school', title: 'School & study', themeTags: ['school', 'study'],
        keywords: ['school', 'study', 'student', 'teacher', 'class', 'book', 'read', 'write', 'exam', 'test', 'homework', 'university', 'library', 'pencil', 'notebook', 'learn', 'lesson', 'grade', 'education']
    },
    {
        theme: 'work', title: 'Work', themeTags: ['work', 'business'],
        keywords: ['work', 'job', 'office', 'company', 'business', 'meeting', 'boss', 'colleague', 'salary', 'career', 'employee', 'manager', 'project', 'email', 'schedule', 'professional']
    },
    {
        theme: 'hobby', title: 'Hobbies', themeTags: ['hobby', 'free_time'],
        keywords: ['hobby', 'music', 'song', 'movie', 'game', 'sport', 'play', 'fun', 'interest', 'camera', 'photo', 'dance', 'sing', 'draw', 'paint', 'soccer', 'baseball', 'swim', 'free time']
    },
    {
        theme: 'health', title: 'Health', themeTags: ['health', 'body'],
        keywords: ['health', 'body', 'doctor', 'hospital', 'medicine', 'sick', 'hurt', 'pain', 'head', 'hand', 'eye', 'ear', 'leg', 'cold', 'fever', 'tired', 'sleep', 'exercise', 'dental', 'nurse']
    },
    {
        theme: 'culture', title: 'Culture & media', themeTags: ['culture', 'media'],
        keywords: ['culture', 'festival', 'temple', 'shrine', 'art', 'museum', 'news', 'tv', 'media', 'tradition', 'history', 'religion', 'ceremony', 'holiday', 'celebration', 'movie', 'novel']
    },
    {
        theme: 'home', title: 'Home & family', themeTags: ['family', 'home'],
        keywords: ['home', 'house', 'family', 'mother', 'father', 'parent', 'child', 'brother', 'sister', 'room', 'door', 'window', 'kitchen', 'bathroom', 'apartment', 'wife', 'husband', 'baby', 'grand']
    },
    {
        theme: 'nature', title: 'Nature & weather', themeTags: ['nature', 'weather'],
        keywords: ['weather', 'rain', 'sunny', 'cloud', 'snow', 'wind', 'hot', 'cold', 'tree', 'flower', 'mountain', 'river', 'sea', 'ocean', 'animal', 'bird', 'dog', 'cat', 'nature', 'season', 'spring', 'summer', 'autumn', 'winter']
    },
    {
        theme: 'people', title: 'People & feelings', themeTags: ['people', 'feelings'],
        keywords: ['friend', 'person', 'people', 'man', 'woman', 'name', 'love', 'like', 'hate', 'happy', 'sad', 'angry', 'afraid', 'kind', 'polite', 'feeling', 'emotion', 'smile', 'cry', 'laugh', 'lonely']
    }
]);

var GENERAL_THEME = Object.freeze({
    theme: 'general', title: 'Core vocab', themeTags: ['core'],
    keywords: []
});

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
 * Stable slice of word ids for a unit (legacy flat id-order; tests + fallback).
 */
function sliceUnitWordIds(list, tierTag, unitIndex, unitSize) {
    unitSize = unitSize || UNIT_SIZE_DEFAULT;
    var plan = buildTierUnitPlan(list, tierTag, unitSize);
    if (plan[unitIndex] && plan[unitIndex].wordIds) return plan[unitIndex].wordIds.slice();
    return [];
}

/** Build searchable text blob from a vocab item. */
function wordThemeText(w) {
    if (!w) return '';
    return [
        w.en, w.en_ex, w.ja, w.ja_ex, w.ko, w.zh, w.es, w.fr, w.de
    ].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Score how well a word matches theme keywords (substring match on gloss/example).
 */
function scoreThemeMatch(text, keywords) {
    if (!text || !keywords || !keywords.length) return 0;
    var score = 0;
    for (var i = 0; i < keywords.length; i++) {
        var kw = keywords[i];
        if (!kw) continue;
        if (text.indexOf(kw) !== -1) score += (kw.length >= 5 ? 2 : 1);
    }
    return score;
}

/**
 * Cluster tier vocabulary into thematic units using word gloss/example knowledge.
 * Covers every tagged word in the tier (no silent drop). Small theme buckets merge into Core.
 *
 * @param {Array} list
 * @param {string} tierTag e.g. 'N5'
 * @param {number} [unitSize]
 * @returns {Array<{index,tier,wordIds,theme,themeTitle,themeTags}>}
 */
function buildTierUnitPlan(list, tierTag, unitSize) {
    unitSize = unitSize || UNIT_SIZE_DEFAULT;
    var filtered = filterListByTagsStrict(list, [tierTag]);
    filtered = filtered.slice().sort(function (a, b) {
        return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    if (!filtered.length) return [];

    var buckets = {};
    var catalog = UNIT_THEME_CATALOG;
    for (var c = 0; c < catalog.length; c++) {
        buckets[catalog[c].theme] = [];
    }
    buckets[GENERAL_THEME.theme] = [];

    for (var i = 0; i < filtered.length; i++) {
        var w = filtered[i];
        var text = wordThemeText(w);
        var bestTheme = GENERAL_THEME.theme;
        var bestScore = 0;
        for (var t = 0; t < catalog.length; t++) {
            var th = catalog[t];
            var sc = scoreThemeMatch(text, th.keywords);
            if (sc > bestScore) {
                bestScore = sc;
                bestTheme = th.theme;
            }
        }
        // Require a minimum signal so weak matches don't scatter core words
        if (bestScore < 2) bestTheme = GENERAL_THEME.theme;
        buckets[bestTheme].push(w);
    }

    // Merge tiny theme buckets into general (keep map readable)
    var MIN_BUCKET = 4;
    for (var bi = 0; bi < catalog.length; bi++) {
        var key = catalog[bi].theme;
        if (buckets[key] && buckets[key].length > 0 && buckets[key].length < MIN_BUCKET) {
            buckets[GENERAL_THEME.theme] = buckets[GENERAL_THEME.theme].concat(buckets[key]);
            buckets[key] = [];
        }
    }

    function themeMeta(themeKey) {
        if (themeKey === GENERAL_THEME.theme) return GENERAL_THEME;
        for (var j = 0; j < catalog.length; j++) {
            if (catalog[j].theme === themeKey) return catalog[j];
        }
        return GENERAL_THEME;
    }

    var order = catalog.map(function (th) { return th.theme; }).concat([GENERAL_THEME.theme]);
    var plan = [];
    for (var oi = 0; oi < order.length; oi++) {
        var themeKey = order[oi];
        var words = buckets[themeKey] || [];
        if (!words.length) continue;
        words = words.slice().sort(function (a, b) {
            return (Number(a.id) || 0) - (Number(b.id) || 0);
        });
        var meta = themeMeta(themeKey);
        var part = 0;
        for (var start = 0; start < words.length; start += unitSize) {
            var chunk = words.slice(start, start + unitSize);
            var ids = chunk.map(function (w) { return Number(w.id); }).filter(function (id) {
                return Number.isFinite(id);
            });
            if (!ids.length) continue;
            part++;
            var title = meta.title;
            // If theme spans multiple units, number them
            var totalParts = Math.ceil(words.length / unitSize);
            if (totalParts > 1) title = meta.title + ' ' + part;
            plan.push({
                index: plan.length,
                tier: tierTag,
                wordIds: ids,
                theme: meta.theme,
                themeTitle: title,
                themeTags: (meta.themeTags || []).slice()
            });
        }
    }
    // Re-index sequentially (already set)
    for (var pi = 0; pi < plan.length; pi++) plan[pi].index = pi;
    return plan;
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
        pathMode: 'guided', // default: daily learning on guided path
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
        this._planCache = {};
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
        // Durable mirror (survives when localStorage quota is tight)
        try {
            var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
            if (idb && idb.KEYS) idb.setAsync(idb.KEYS.PATH_PROFILE, this.profile);
        } catch (_) {}
    }

    async load() {
        var prefs = (typeof app !== 'undefined' && app && app.store) ? app.store.prefs : {};
        this.loadLocal();
        // Prefer IndexedDB if newer or LS missing
        try {
            var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
            if (idb && idb.KEYS) {
                var idbProf = await idb.get(idb.KEYS.PATH_PROFILE);
                if (idbProf && typeof idbProf === 'object') {
                    if (!this.profile ||
                        (idbProf.updatedAt || 0) >= (this.profile.updatedAt || 0)) {
                        this.profile = idbProf;
                        this._loaded = true;
                        try {
                            localStorage.setItem(PATH_LS_KEY, JSON.stringify(this.profile));
                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}
        if (!this.profile) {
            this.profile = defaultPathProfile(prefs);
            this.saveLocal();
        }
        // Soft migrate: never force guided on existing installs
        if (!this.profile.pathMode) this.profile.pathMode = 'guided';
        if (!this.profile.freePlayScope) this.profile.freePlayScope = 'unit';
        this._migrateUnitPlanVersion();

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
        if (p.pathMode === 'guided') {
            if (p.placementStatus === 'skipped') {
                p.placementStatus = 'pending';
            }
            this.ensureUnit(0, { makeCurrent: !p.currentUnitId });
        }
        this.saveLocal();
        this.flush();
    }

    /**
     * Two-state home chip: free → guided, guided → free.
     * @returns {'guided'|'free'} new mode
     */
    togglePathMode() {
        var p = this.getProfile();
        var next = p.pathMode === 'guided' ? 'free' : 'guided';
        this.setPathMode(next);
        return next;
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
        // Keep framework aligned when tier belongs to a known group
        if (typeof LEVEL_CONFIG !== 'undefined' && LEVEL_CONFIG.groups) {
            for (var i = 0; i < LEVEL_CONFIG.groups.length; i++) {
                var g = LEVEL_CONFIG.groups[i];
                if (g.levels && g.levels.indexOf(tier) !== -1) {
                    p.framework = g.key;
                    break;
                }
            }
        }
        this.saveLocal();
        this.flush();
    }

    /**
     * Change exam framework and/or difficulty tier. Resets current unit.
     * @param {string} framework  e.g. 'jlpt' | 'hsk' | 'topik' | 'cefr'
     * @param {string} [tier]     level code; defaults to first level of framework
     */
    setFrameworkAndTier(framework, tier) {
        var p = this.getProfile();
        var group = null;
        if (typeof LEVEL_CONFIG !== 'undefined' && LEVEL_CONFIG.groups) {
            for (var i = 0; i < LEVEL_CONFIG.groups.length; i++) {
                if (LEVEL_CONFIG.groups[i].key === framework) {
                    group = LEVEL_CONFIG.groups[i];
                    break;
                }
            }
        }
        if (!group && typeof LEVEL_CONFIG !== 'undefined' && LEVEL_CONFIG.groups && LEVEL_CONFIG.groups.length) {
            group = LEVEL_CONFIG.groups[0];
            framework = group.key;
        }
        p.framework = framework || p.framework || 'cefr';
        if (tier && group && group.levels && group.levels.indexOf(tier) !== -1) {
            p.currentTier = tier;
        } else if (group && group.levels && group.levels.length) {
            p.currentTier = group.levels[0];
        } else if (tier) {
            p.currentTier = tier;
        }
        p.currentUnitId = null;
        this.saveLocal();
        this.flush();
        return p;
    }

    /** Resolve LEVEL_CONFIG group for current profile (or by key). */
    getFrameworkGroup(frameworkKey) {
        var key = frameworkKey || (this.getProfile().framework) || 'cefr';
        if (typeof LEVEL_CONFIG === 'undefined' || !LEVEL_CONFIG.groups) return null;
        for (var i = 0; i < LEVEL_CONFIG.groups.length; i++) {
            if (LEVEL_CONFIG.groups[i].key === key) return LEVEL_CONFIG.groups[i];
        }
        return LEVEL_CONFIG.groups[0] || null;
    }

    /** Frameworks relevant to target language first, then the rest. */
    listFrameworksForTarget(targetLang) {
        var lang = targetLang || this.getProfile().targetLang || 'ja';
        if (typeof LEVEL_CONFIG === 'undefined' || !LEVEL_CONFIG.groups) return [];
        var relevant = [];
        var rest = [];
        for (var i = 0; i < LEVEL_CONFIG.groups.length; i++) {
            var g = LEVEL_CONFIG.groups[i];
            var match = g.langs && g.langs.some(function (l) {
                return l === lang || (lang && l.indexOf(lang) === 0);
            });
            if (match) relevant.push(g);
            else rest.push(g);
        }
        return relevant.concat(rest);
    }

    /** Rebuild unit snapshots when thematic plan algorithm changes. */
    _migrateUnitPlanVersion() {
        var p = this.getProfile();
        if (p.unitPlanVersion === UNIT_PLAN_VERSION) return;
        p.units = {};
        p.currentUnitId = null;
        p.unitPlanVersion = UNIT_PLAN_VERSION;
        this._planCache = {};
        this.saveLocal();
    }

    _vocabList() {
        return (typeof app !== 'undefined' && app && app.data && app.data.list) ? app.data.list : [];
    }

    /**
     * Thematic unit plan for a tier (cached by list length + unit size).
     * @param {string} tier
     * @returns {Array}
     */
    getTierUnitPlan(tier) {
        this._migrateUnitPlanVersion();
        var p = this.getProfile();
        var list = this._vocabList();
        var size = p.unitSize || UNIT_SIZE_DEFAULT;
        var key = String(tier) + ':' + size + ':' + list.length;
        if (!this._planCache[key]) {
            this._planCache[key] = buildTierUnitPlan(list, tier, size);
        }
        return this._planCache[key];
    }

    /**
     * Ensure unit snapshot exists.
     * @param {number} unitIndex
     * @param {{ makeCurrent?: boolean, tier?: string }} [opts]
     */
    ensureUnit(unitIndex, opts) {
        opts = opts || {};
        this._migrateUnitPlanVersion();
        var p = this.getProfile();
        var tier = opts.tier || p.currentTier;
        var unitId = tier + '_u' + unitIndex;
        if (!p.units) p.units = {};
        var created = false;
        if (!p.units[unitId]) {
            var plan = this.getTierUnitPlan(tier);
            var meta = plan[unitIndex];
            var ids = meta && meta.wordIds ? meta.wordIds.slice() : [];
            var theme = meta ? meta.theme : GENERAL_THEME.theme;
            var themeTitle = meta ? meta.themeTitle : GENERAL_THEME.title;
            var themeTags = meta && meta.themeTags ? meta.themeTags.slice() : GENERAL_THEME.themeTags.slice();
            p.units[unitId] = {
                unitId: unitId,
                tier: tier,
                index: unitIndex,
                wordIds: ids,
                theme: theme,
                themeTitle: themeTitle,
                themeTags: themeTags,
                unlockedAt: Date.now(),
                completedAt: null,
                progress: 0,
                planVersion: UNIT_PLAN_VERSION
            };
            created = true;
        }
        var makeCurrent = opts.makeCurrent === true ||
            (opts.makeCurrent !== false && !p.currentUnitId);
        if (makeCurrent) {
            p.currentUnitId = unitId;
            p.currentTier = tier;
        }
        if (created || makeCurrent) {
            this.saveLocal();
            this.flush();
        }
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
    unitProgressPercent(unitOpt) {
        var unit = unitOpt || this.getActiveUnit();
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

    /**
     * Units for Learning map UI — full exam path (all levels in framework),
     * thematically clustered from actual vocab. Soft unlock within current tier;
     * easier tiers fully open; harder tiers locked until user jumps via level chip or finishes look-ahead.
     */
    listUnitsForMap() {
        this._migrateUnitPlanVersion();
        var p = this.getProfile();
        var group = this.getFrameworkGroup(p.framework);
        var levels = (group && group.levels && group.levels.length)
            ? group.levels.slice()
            : [p.currentTier || 'A1'];
        var curTier = p.currentTier;
        var curTierIdx = levels.indexOf(curTier);
        if (curTierIdx < 0) curTierIdx = 0;

        var savedCurrent = p.currentUnitId;
        var curIdxInTier = 0;
        if (savedCurrent && p.units && p.units[savedCurrent]) {
            curIdxInTier = p.units[savedCurrent].index || 0;
        }

        var out = [];
        var totalWords = 0;
        if (!p.units) p.units = {};
        for (var li = 0; li < levels.length; li++) {
            var tier = levels[li];
            var plan = this.getTierUnitPlan(tier);
            var maxU = plan.length;
            if (maxU > MAP_MAX_UNITS_PER_TIER) maxU = MAP_MAX_UNITS_PER_TIER;
            // Section header row (UI marker)
            if (plan.length) {
                var tierWordCount = 0;
                for (var tw = 0; tw < plan.length; tw++) {
                    tierWordCount += (plan[tw].wordIds && plan[tw].wordIds.length) || 0;
                }
                totalWords += tierWordCount;
                out.push({
                    type: 'section',
                    tier: tier,
                    themeTitle: tier,
                    wordCount: tierWordCount,
                    unitCount: plan.length,
                    locked: false
                });
            }
            for (var i = 0; i < maxU; i++) {
                var meta = plan[i];
                if (!meta) continue;
                var unitId = tier + '_u' + i;
                var unit = p.units[unitId] || null;
                var pct = unit ? this.unitProgressPercent(unit) : 0;
                if (unit) unit.progress = pct;
                var locked = false;
                if (li < curTierIdx) {
                    locked = false; // prior levels open
                } else if (li > curTierIdx) {
                    locked = true; // future exam levels locked
                } else {
                    // Soft unlock inside current tier: up to current+1
                    locked = i > curIdxInTier + 1;
                }
                out.push({
                    type: 'unit',
                    unitId: unitId,
                    index: i,
                    tier: tier,
                    themeTitle: (unit && unit.themeTitle) || meta.themeTitle || '',
                    theme: (unit && unit.theme) || meta.theme || '',
                    wordCount: (unit && unit.wordIds && unit.wordIds.length) ||
                        (meta.wordIds && meta.wordIds.length) || 0,
                    progress: pct,
                    locked: locked
                });
            }
        }
        p.currentUnitId = savedCurrent || null;
        if (!p.currentUnitId) {
            // Materialize only the starting unit of the current tier
            var prefer = this.ensureUnit(0, { makeCurrent: true, tier: curTier });
            if (prefer) p.currentUnitId = prefer.unitId;
        }
        this.saveLocal();
        // Annotate first section with corpus total for UI subtitle
        if (out.length && out[0].type === 'section') {
            out[0].frameworkWordCount = totalWords;
        }
        return out;
    }

    /**
     * Select unit by index; optional tier jumps path level.
     * @param {number} unitIndex
     * @param {string} [tier]
     */
    selectUnit(unitIndex, tier) {
        var p = this.getProfile();
        if (tier && tier !== p.currentTier) {
            // Align framework if needed, keep chosen tier
            if (typeof LEVEL_CONFIG !== 'undefined' && LEVEL_CONFIG.groups) {
                for (var i = 0; i < LEVEL_CONFIG.groups.length; i++) {
                    var g = LEVEL_CONFIG.groups[i];
                    if (g.levels && g.levels.indexOf(tier) !== -1) {
                        p.framework = g.key;
                        break;
                    }
                }
            }
            p.currentTier = tier;
        }
        var unit = this.ensureUnit(unitIndex, {
            makeCurrent: true,
            tier: tier || p.currentTier
        });
        p.pathMode = 'guided';
        this.saveLocal();
        this.flush();
        return unit;
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
window.buildTierUnitPlan = buildTierUnitPlan;
window.scoreThemeMatch = scoreThemeMatch;
window.PATH_DEFAULT_FRAMEWORK = PATH_DEFAULT_FRAMEWORK;
window.defaultPathProfile = defaultPathProfile;
window.UNIT_PLAN_VERSION = UNIT_PLAN_VERSION;
window.UNIT_SIZE_DEFAULT = UNIT_SIZE_DEFAULT;
