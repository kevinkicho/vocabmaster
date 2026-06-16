/* js/data.js */
class DataService {
    constructor() { 
        this.list = []; 
        this.localDailyScore = 0; 
        this.dailyScoreLoaded = false;
        this.kanjiCache = {}; 
        this.pendingFetches = {}; 
    }

    get activeList() {
        return this._reviewList || this.list;
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
        const order = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','common','uncommon','rare'];
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

    async load() {
        if (typeof db !== 'undefined' && db) {
            try {
                L("[Data] Fetching vocab...");
                const snap = await db.ref('vocab').once('value');
                if (snap.exists()) {
                    const val = snap.val();
                    this.list = Array.isArray(val) ? val : Object.values(val);
                    this.list = this.list.filter(item => item !== null).sort((a,b) => a.id - b.id);
                }
            } catch (e) { L("[Data] RTDB fetch failed", e); }
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

    rand() { return this.list.length ? this.list[Math.floor(Math.random() * this.list.length)] : null; }
}
