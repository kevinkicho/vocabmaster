/* js/data.js
 * Vocab: IndexedDB (VmIdb) first — long-lived on-device cache; RTDB on miss / revalidate.
 * Dictionary/kanji: memory + VmIdb write-through.
 */
var VOCAB_FORCE_SS_KEY = 'vm_vocab_force_refresh';

function _vocabFingerprint(list) {
    if (!list || !list.length) return '0';
    var n = list.length;
    var a = list[0] && list[0].id;
    var b = list[n - 1] && list[n - 1].id;
    var mid = list[Math.floor(n / 2)] && list[Math.floor(n / 2)].id;
    var tagBits = 0;
    for (var i = 0; i < Math.min(32, n); i++) {
        tagBits += (list[i].tags && list[i].tags.length) || 0;
        tagBits += (list[i].en && String(list[i].en).length) || 0;
    }
    return n + ':' + a + ':' + b + ':' + mid + ':' + tagBits;
}

class DataService {
    constructor() { 
        this.list = []; 
        this.localDailyScore = 0; 
        this.dailyScoreLoaded = false;
        this.kanjiCache = {}; 
        this.pendingFetches = {};
        /** @type {'network'|'cache'|'none'|null} */
        this.vocabSource = null;
        this._vocabBgRefresh = null;
    }

    get activeList() {
        return this._reviewList || this.list;
    }

    // Medium-term: Review queue support (combines analytics + adaptive + collections)
    // PR4: Prefer FSRS due cards when memory engine is enabled; fill remaining with
    // most-missed / selectWordsForReview. Scoped to getFilteredList universe.
    async getReviewWords(count = 10) {
        let baseList = this.getFilteredList(); // respects current collection/levels
        if (!baseList || baseList.length === 0) baseList = this.list;

        const result = [];
        const usedIds = new Set();
        // Normalize ids to Number so string vocab ids match MemoryService wordId (Number).
        const filteredIds = new Set();
        const byId = new Map();
        for (const w of baseList) {
            if (!w || w.id == null) continue;
            const id = Number(w.id);
            if (!Number.isFinite(id)) continue;
            filteredIds.add(id);
            byId.set(id, w);
        }

        // 1) Prefer FSRS due cards (filtered to current list universe)
        try {
            const mem = (typeof app !== 'undefined' && app) ? app.memory : null;
            if (mem && typeof mem.isEnabled === 'function' && mem.isEnabled()
                && typeof mem.getDueCards === 'function') {
                const due = mem.getDueCards(Date.now(), {
                    limit: count,
                    // MemoryService passes card objects to filterFn
                    filterFn: (card) => {
                        if (!card) return false;
                        const id = Number(card.wordId);
                        return Number.isFinite(id) && filteredIds.has(id);
                    }
                });
                if (Array.isArray(due)) {
                    for (const card of due) {
                        if (!card) continue;
                        const id = Number(card.wordId);
                        if (!Number.isFinite(id) || usedIds.has(id)) continue;
                        const vocab = byId.get(id);
                        if (!vocab) continue;
                        result.push(vocab);
                        usedIds.add(id);
                        if (result.length >= count) return result;
                    }
                }
            }
        } catch (e) {
            // Memory unusable → fall through to most-missed / adaptive
        }

        const remaining = count - result.length;
        if (remaining <= 0) return result;

        // 2) Fill remaining slots with most-missed / adaptive fallback
        let userHistory = {};
        if (app.analytics) {
            try {
                const missed = await app.analytics.getMostMissedWords(count * 3);
                missed.forEach(m => {
                    if (m.id != null && m.vocab) {
                        const hid = Number(m.id);
                        if (!Number.isFinite(hid)) return;
                        const total = (m.c || 0) + (m.w || 0);
                        userHistory[hid] = { correct: m.c || 0, total };
                    }
                });
            } catch (e) {}
        }

        if (typeof selectWordsForReview === 'function') {
            const pool = baseList.filter(w => {
                if (!w || w.id == null) return false;
                const id = Number(w.id);
                return Number.isFinite(id) && !usedIds.has(id);
            });
            const reviewItems = selectWordsForReview(pool, userHistory, remaining);
            for (const w of reviewItems) {
                if (!w || w.id == null) continue;
                const id = Number(w.id);
                if (!Number.isFinite(id) || usedIds.has(id)) continue;
                result.push(w);
                usedIds.add(id);
            }
            return result.slice(0, count);
        }

        // Fallback: most missed first (still scoped to filtered universe)
        const missed = await (app.analytics ? app.analytics.getMostMissedWords(count) : []);
        for (const m of missed) {
            if (result.length >= count) break;
            const vocab = m.vocab;
            if (!vocab) continue;
            const raw = vocab.id != null ? vocab.id : m.id;
            const id = Number(raw);
            if (!Number.isFinite(id) || usedIds.has(id)) continue;
            if (!filteredIds.has(id)) continue;
            // Prefer in-universe vocab object from baseList when available
            result.push(byId.get(id) || vocab);
            usedIds.add(id);
        }
        return result.slice(0, count);
    }

    // Temporarily use review list for next game
    async startReviewSession(count = 10) {
        const reviewWords = await this.getReviewWords(count);
        if (reviewWords.length > 0) {
            this._reviewList = reviewWords;
            
            return true;
        }
        return false;
    }

    // Set specific words for review (e.g. from Story)
    startSpecificReview(words) {
        if (!words || words.length === 0) return false;
        this._reviewList = words;
        
        return true;
    }

    endReviewSession() {
        this._reviewList = null;
    }

    getFilteredList() {
        const prefs = app && app.store ? app.store.prefs : null;
        let list = this.list;

        // Level filter
        if (prefs && prefs.levelFilter && !prefs.levelFilter.includes('all')) {
            const selected = prefs.levelFilter;
            const frameworkTags = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5'];
            list = list.filter(item => {
                if (selected.includes('unassigned')) {
                    if (!item.tags || !item.tags.some(t => frameworkTags.includes(t))) return true;
                }
                if (item.tags && item.tags.some(t => selected.includes(t))) return true;
                return false;
            });
        }

        // Tag filter
        if (prefs && prefs.tagFilter && !prefs.tagFilter.includes('all')) {
            const selectedTags = prefs.tagFilter;
            list = list.filter(item => {
                if (item.tags && item.tags.some(t => selectedTags.includes(t))) return true;
                return false;
            });
        }

        return list.length > 0 ? list : this.list;
    }

    getAllTags() {
        const tagSet = new Set();
        for (const item of this.list) {
            if (item && item.tags) {
                for (const t of item.tags) {
                    tagSet.add(t);
                }
            }
        }
        const order = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','TOPIK6','common','uncommon','rare'];
        return Array.from(tagSet).sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b);
        });
    }
    
    resetSession() {
        this.localDailyScore = 0;
        this.dailyScoreLoaded = false;
        this.kanjiCache = {}; 
    }

    getTodayKey() {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return (new Date(d - offset)).toISOString().slice(0, 10);
    }

    /**
     * Load vocabulary — IndexedDB first (long-lived), RTDB when missing / forced / revalidate.
     * @param {{ force?: boolean }} [opts]
     */
    async load(opts) {
        opts = opts || {};
        var force = opts.force === true;
        try {
            if (!force && typeof sessionStorage !== 'undefined' &&
                sessionStorage.getItem(VOCAB_FORCE_SS_KEY) === '1') {
                force = true;
                sessionStorage.removeItem(VOCAB_FORCE_SS_KEY);
            }
        } catch (_) {}

        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        var vocabKey = idb && idb.KEYS ? idb.KEYS.VOCAB_FULL : 'vocab:full';

        // 1) Durable local cache
        if (!force && idb && typeof idb.getRecord === 'function') {
            try {
                var rec = await idb.getRecord(vocabKey);
                if (rec && Array.isArray(rec.v) && rec.v.length > 0) {
                    this.list = rec.v.filter(function (item) { return item != null; })
                        .sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
                    this.vocabSource = 'cache';
                    var age = idb.ageMs(rec);
                    if (typeof L === 'function') {
                        L('[Data] Vocab from IndexedDB', this.list.length,
                            'ageH', Math.round(age / 3600000),
                            '(no auto full re-download)');
                    }
                    // Large-tree policy: do NOT background-fetch full `vocab` after first load.
                    // Force refresh only: Retry / clearVocabCache / load({ force: true }).
                    if (idb.ALLOW_LARGE_BG_REVALIDATE === true &&
                        Number.isFinite(idb.REVALIDATE_AFTER_MS) &&
                        age > idb.REVALIDATE_AFTER_MS) {
                        this._revalidateVocabInBackground();
                    }
                    return this.list.length;
                }
            } catch (e) {
                if (typeof L === 'function') L('[Data] Vocab IDB read failed', e);
            }
        }

        // 2) Network
        var n = await this._fetchVocabFromRtdb();
        if (n > 0) {
            this.vocabSource = 'network';
            await this._writeVocabIdb(this.list);
            return this.list.length;
        }

        // 3) Offline fallback (even after force)
        if (!this.list.length && idb) {
            try {
                var fb = await idb.get(vocabKey);
                if (Array.isArray(fb) && fb.length) {
                    this.list = fb.filter(function (item) { return item != null; })
                        .sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
                    this.vocabSource = 'cache';
                    if (typeof L === 'function') L('[Data] Vocab offline IDB fallback', this.list.length);
                }
            } catch (_) {}
        }
        if (!this.list.length) this.vocabSource = 'none';
        return this.list.length;
    }

    async _fetchVocabFromRtdb() {
        if (typeof db === 'undefined' || !db) return 0;
        try {
            if (typeof L === 'function') L('[Data] Fetching vocab from RTDB...');
            var snap = await db.ref('vocab').once('value');
            if (snap.exists()) {
                var val = snap.val();
                this.list = Array.isArray(val) ? val : Object.values(val);
                this.list = this.list.filter(function (item) { return item !== null; })
                    .sort(function (a, b) { return a.id - b.id; });
                return this.list.length;
            }
        } catch (e) {
            if (typeof L === 'function') L('[Data] RTDB fetch failed', e);
        }
        return 0;
    }

    _revalidateVocabInBackground() {
        if (this._vocabBgRefresh) return;
        var self = this;
        this._vocabBgRefresh = (async function () {
            try {
                var prevFp = _vocabFingerprint(self.list);
                var n = await self._fetchVocabFromRtdb();
                if (n > 0) {
                    var nextFp = _vocabFingerprint(self.list);
                    self.vocabSource = 'network';
                    await self._writeVocabIdb(self.list);
                    if (typeof L === 'function') {
                        L('[Data] Vocab revalidated', n, prevFp === nextFp ? 'unchanged' : 'updated');
                    }
                }
            } catch (e) {
                if (typeof L === 'function') L('[Data] Vocab revalidate failed', e);
            } finally {
                self._vocabBgRefresh = null;
            }
        })();
    }

    async _writeVocabIdb(list) {
        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        if (!idb || !list || !list.length) return false;
        var key = idb.KEYS ? idb.KEYS.VOCAB_FULL : 'vocab:full';
        try {
            await idb.set(key, list, {
                count: list.length,
                fingerprint: _vocabFingerprint(list)
            });
            if (typeof L === 'function') L('[Data] Vocab saved to IndexedDB', list.length);
            return true;
        } catch (e) {
            if (typeof L === 'function') L('[Data] Vocab IDB write failed', e);
            return false;
        }
    }

    /** Clear vocab IDB + force next load from RTDB. */
    async clearVocabCache() {
        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        if (idb) {
            try {
                var key = idb.KEYS ? idb.KEYS.VOCAB_FULL : 'vocab:full';
                await idb.del(key);
            } catch (_) {}
        }
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(VOCAB_FORCE_SS_KEY, '1');
            }
        } catch (_) {}
    }

    async getKanji(char) {
        if (!char) return null;
        if (this.kanjiCache[char]) return this.kanjiCache[char];
        if (this.pendingFetches[char]) return this.pendingFetches[char];

        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        var dictKey = idb && idb.KEYS ? idb.KEYS.dict(char) : ('dict:' + char);

        // Durable dictionary cache
        if (idb) {
            try {
                var cached = await idb.get(dictKey);
                if (cached) {
                    this.kanjiCache[char] = cached;
                    return cached;
                }
            } catch (_) {}
        }

        if (typeof db !== 'undefined' && db) {
            var self = this;
            const promise = new Promise((resolve, reject) => {
                db.ref('dictionary').orderByChild('s').equalTo(char).limitToFirst(1).once('value')
                .then(snap => {
                    if (snap.exists()) {
                        resolve(Object.values(snap.val())[0]);
                    } else {
                        return db.ref('dictionary').orderByChild('t').equalTo(char).limitToFirst(1).once('value');
                    }
                })
                .then(snap => {
                    if (snap && snap.exists()) resolve(Object.values(snap.val())[0]);
                    else resolve(null);
                })
                .catch(reject);
            }).then(async function (data) {
                if (data) {
                    self.kanjiCache[char] = data;
                    if (idb) {
                        try { await idb.set(dictKey, data); } catch (_) {}
                    }
                }
                delete self.pendingFetches[char];
                return data;
            });
            
            this.pendingFetches[char] = promise;
            return promise;
        }
        return null;
    }

    async saveDictionaryEntry(entry) {
        if (!entry) return;
        if (!entry.id) entry.id = Date.now(); 

        if (typeof db !== 'undefined' && db) {
            await db.ref('dictionary/' + entry.id).update(entry);
            if(entry.s) this.kanjiCache[entry.s] = entry;
            if(entry.t) this.kanjiCache[entry.t] = entry;
            var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
            if (idb) {
                try {
                    if (entry.s) await idb.set(idb.KEYS.dict(entry.s), entry);
                    if (entry.t) await idb.set(idb.KEYS.dict(entry.t), entry);
                } catch (_) {}
            }
        }
    }

    async saveCorrection(updatedItem) {
        const idx = this.list.findIndex(x => x.id === updatedItem.id);
        if(idx > -1) this.list[idx] = updatedItem;
        if (typeof db !== 'undefined' && db) {
            await db.ref('vocab/' + updatedItem.id).set(updatedItem);
        }
        try {
            if (this.list && this.list.length) await this._writeVocabIdb(this.list);
        } catch (_) {}
    }

    async recordScore(points, mode) {
        const numPts = Math.max(0, Number(points) || 0);
        this.localDailyScore = Math.max(0, (Number(this.localDailyScore) || 0) + numPts); 
        // Allow anonymous users too — they get their own UID bucket in RTDB so "user specific data"
        // accrues even on plain APK WebView (where only anon login works).
        if (!auth || !auth.currentUser || !db) return;

        const uid = auth.currentUser.uid;
        const todayKey = this.getTodayKey(); 
        const updates = {};
        updates[`users/${uid}/weekly/total`] = firebase.database.ServerValue.increment(numPts);
        updates[`users/${uid}/weekly/modes/${mode}`] = firebase.database.ServerValue.increment(numPts);
        updates[`users/${uid}/weekly/daily/${todayKey}/${mode}`] = firebase.database.ServerValue.increment(numPts);

        try { await db.ref().update(updates); } catch(e) { L("[Data] Scoring failed", e); }
    }

    async getStats() {
        if (!auth || !auth.currentUser || !db) return null;
        try {
            const snap = await db.ref(`users/${auth.currentUser.uid}/weekly`).once('value');
            return snap.val(); 
        } catch(e) { return null; }
    }

    async getTodayTotal() {
        if (this.dailyScoreLoaded) return Math.max(0, Number(this.localDailyScore) || 0);
        // Support anon: if we have a currentUser (anon or real) try RTDB under that UID.
        if (!auth || !auth.currentUser || !db) return Math.max(0, Number(this.localDailyScore) || 0);
        try {
            const snap = await db.ref(`users/${auth.currentUser.uid}/weekly/daily/${this.getTodayKey()}`).once('value');
            let total = 0;
            if (snap.exists()) total = Object.values(snap.val()).reduce((a, b) => a + b, 0);
            this.localDailyScore = Math.max(0, Number(this.localDailyScore) || 0, Number(total) || 0);
            this.dailyScoreLoaded = true;
            return this.localDailyScore;
        } catch(e) { return Math.max(0, Number(this.localDailyScore) || 0); }
    }

    async deleteUserAccount() {
        if (!auth || !auth.currentUser) return;
        if (!confirm("PERMANENTLY DELETE ACCOUNT?")) return;
        try {
            const user = auth.currentUser;
            const uid = user.uid;
            if(db) await db.ref('users/' + uid).remove();
            await user.delete();
            location.reload();
        } catch(e) { app.ui.showToast("Error: " + e.message, 'error'); }
    }

    rand() { return this.list.length ? this.list[Math.floor(Math.random() * this.list.length)] : null; }
}
