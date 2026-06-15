/* js/data.js */
class DataService {
    constructor() { 
        this.list = []; 
        this.localDailyScore = 0; 
        this.dailyScoreLoaded = false;
        this.kanjiCache = {}; 
        this.pendingFetches = {}; 
        this._defaultList = null;

        // Medium-term: active collection for scoping practice (works with getFilteredList)
        this.currentCollection = 'all';
    }

    get activeList() {
        return this._reviewList || this.list;
    }

    setCollection(id) {
        this.currentCollection = id || 'all';
    }

    // Medium-term: Review queue support (combines analytics + adaptive + collections)
    async getReviewWords(count = 10) {
        let baseList = this.getFilteredList(); // respects current collection/levels
        if (!baseList || baseList.length === 0) baseList = this.list;

        let userHistory = {};
        if (app.analytics) {
            try {
                const missed = await app.analytics.getMostMissedWords(count * 3);
                missed.forEach(m => {
                    if (m.id && m.vocab) {
                        const total = (m.c || 0) + (m.w || 0);
                        userHistory[m.id] = { correct: m.c || 0, total };
                    }
                });
            } catch (e) {}
        }

        // Use adaptive for scoring
        if (typeof selectWordsForReview === 'function') {
            // Map to word objects for adaptive (it expects list of words)
            const reviewItems = selectWordsForReview(baseList, userHistory, count);
            return reviewItems;
        }

        // Fallback: most missed first
        const missed = await (app.analytics ? app.analytics.getMostMissedWords(count) : []);
        return missed.map(m => m.vocab).filter(Boolean).slice(0, count);
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

        // Level filter (existing)
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

        // Collection filter (new Medium-term)
        const collId = (app && app.data && app.data.currentCollection) || (prefs && prefs.currentCollection);
        if (collId && collId !== 'all' && typeof getWordsForCollection === 'function') {
            const filtered = getWordsForCollection(list, collId);
            if (filtered.length === 0 && collId !== 'all') {
                L(`[Data] Collection '${collId}' produced 0 results from current vocab (no matching tags/lang in loaded data). Falling back to full list.`);
                // Do not return empty — prevents downstream "item.id of undefined" in games.
            } else {
                list = filtered;
            }
        }

        return list.length > 0 ? list : this.list;
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

    async load() {
        let loaded = false;
        if (typeof db !== 'undefined' && db) {
            try {
                L("[Data] Fetching vocab...");
                const snap = await db.ref('vocab').once('value');
                if (snap.exists()) {
                    const val = snap.val();
                    this.list = Array.isArray(val) ? val : Object.values(val);
                    this.list = this.list.filter(item => item !== null).sort((a,b) => a.id - b.id);
                    loaded = true;
                }
            } catch (e) { L("[Data] RTDB fetch failed", e); }
        }
        if (!loaded) {
            try {
                const res = await fetch('./master112625.csv'); 
                const txt = await res.text();
                this.parseCSV(txt);
                loaded = true;
            } catch (e) {
                if (this.list.length === 0) this.createMockData();
            }
        }

        // Initialize collection from prefs if present (Medium-term)
        const prefs = app && app.store ? app.store.prefs : null;
        if (prefs && prefs.currentCollection) {
            this.currentCollection = prefs.currentCollection;
        }

        return this.list.length;
    }

    async getKanji(char) {
        if (!char) return null;
        if (this.kanjiCache[char]) return this.kanjiCache[char];
        if (this.pendingFetches[char]) return this.pendingFetches[char];

        if (typeof db !== 'undefined' && db) {
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
            }).then(data => {
                if (data) this.kanjiCache[char] = data;
                delete this.pendingFetches[char];
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
        }
    }

    async saveCorrection(updatedItem) {
        const idx = this.list.findIndex(x => x.id === updatedItem.id);
        if(idx > -1) this.list[idx] = updatedItem;
        if (typeof db !== 'undefined' && db) {
            await db.ref('vocab/' + updatedItem.id).set(updatedItem);
        }
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

    loadCollection(collectionKey) {
        if (typeof VOCAB_COLLECTIONS === 'undefined' || !VOCAB_COLLECTIONS[collectionKey]) return false;
        if (!this._defaultList) this._defaultList = this.list;
        const collection = VOCAB_COLLECTIONS[collectionKey];
        const langKey = collection[0] && collection[0].lang ? collection[0].lang : null;
        const exKey = langKey ? langKey + '_ex' : null;
        this.list = collection.map((item, i) => {
            const entry = { id: item.id !== undefined ? item.id : i };
            if (typeof LANG_CONFIG !== 'undefined') {
                LANG_CONFIG.forEach(c => { entry[c.key] = ''; });
            }
            if (item.en) entry.en = item.en;
            if (langKey && item[langKey]) entry[langKey] = item[langKey];
            if (exKey && item[exKey]) {
                entry[exKey] = item[exKey];
            } else if (langKey && item[langKey + '_ex']) {
                entry[langKey + '_ex'] = item[langKey + '_ex'];
            }
            if (item.en_ex) entry.en_ex = item.en_ex;
            if (item.tags) entry.tags = item.tags;
            return entry;
        });
        return true;
    }

    resetToDefaultList() {
        if (this._defaultList) {
            this.list = this._defaultList;
            return true;
        }
        return false;
    }

    parseCSV(txt) {
        let lines = txt.split(/\r?\n/).filter(l => l.trim().length > 0 && !l.trim().startsWith('['));
        if (lines.length > 0) lines = lines.slice(1); 
        this.list = lines.map((line, i) => {
            const parts = []; let match; const regex = /(?:^|,)(\s*(?:"([^"]*)"|([^",]*))\s*)/g;
            while ((match = regex.exec(line)) !== null) { parts.push(match[2] !== undefined ? match[2] : match[3]); }
            if(parts.length===0) parts.push(...line.split(','));
            const item = { id: i };
            if(typeof LANG_CONFIG !== 'undefined') { LANG_CONFIG.forEach(c => item[c.key] = parts[c.index] ? parts[c.index].trim() : ""); }
            const levelIdx = LANG_CONFIG ? LANG_CONFIG.length : 15;
            const tagIdx = levelIdx + 1;
            if (parts[tagIdx] && parts[tagIdx].trim()) item.tags = parts[tagIdx].split(/[;|]/).map(t => t.trim()).filter(Boolean);
            return item;
        });
    }
    
    // FIX: Set "Test 0" so main.js can detect it as mock data properly
    createMockData() { this.list = Array.from({length:20}, (_,i)=> ({ id: i, ja: "Test " + i, en: "Test " + i })); }
    rand() { return this.list.length ? this.list[Math.floor(Math.random() * this.list.length)] : { id:0 }; }
}
