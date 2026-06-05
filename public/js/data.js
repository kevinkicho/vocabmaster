/* js/data.js */
class DataService {
    constructor() { 
        this.list = []; 
        this.localDailyScore = 0; 
        this.dailyScoreLoaded = false;
        this.kanjiCache = {}; 
        this.pendingFetches = {}; 
        this._defaultList = null;
    }

    getFilteredList() {
        const prefs = app && app.store ? app.store.prefs : null;
        if (!prefs || !prefs.levelFilter || prefs.levelFilter.includes('all')) return this.list;
        const selected = prefs.levelFilter;
        const filtered = this.list.filter(item => {
            if (!item.level && !item.tags) return selected.includes('unassigned');
            if (item.level && selected.includes(item.level)) return true;
            if (item.tags && item.tags.some(t => selected.includes(t))) return true;
            return false;
        });
        return filtered.length > 0 ? filtered : this.list;
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
        this.localDailyScore += points; 
        if (!auth || !auth.currentUser || !db || auth.currentUser.isAnonymous) return;

        const uid = auth.currentUser.uid;
        const todayKey = this.getTodayKey(); 
        const updates = {};
        updates[`users/${uid}/weekly/total`] = firebase.database.ServerValue.increment(points);
        updates[`users/${uid}/weekly/modes/${mode}`] = firebase.database.ServerValue.increment(points);
        updates[`users/${uid}/weekly/daily/${todayKey}/${mode}`] = firebase.database.ServerValue.increment(points);

        try { await db.ref().update(updates); } catch(e) { L("[Data] Scoring failed", e); }
    }

    async getStats() {
        if (!auth || !auth.currentUser || !db || auth.currentUser.isAnonymous) return null;
        try {
            const snap = await db.ref(`users/${auth.currentUser.uid}/weekly`).once('value');
            return snap.val(); 
        } catch(e) { return null; }
    }

    async getTodayTotal() {
        if (this.dailyScoreLoaded) return this.localDailyScore;
        if (!auth || !auth.currentUser || !db || auth.currentUser.isAnonymous) return 0;
        try {
            const snap = await db.ref(`users/${auth.currentUser.uid}/weekly/daily/${this.getTodayKey()}`).once('value');
            let total = 0;
            if (snap.exists()) total = Object.values(snap.val()).reduce((a, b) => a + b, 0);
            this.localDailyScore = Math.max(this.localDailyScore, total);
            this.dailyScoreLoaded = true;
            return this.localDailyScore;
        } catch(e) { return 0; }
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
        } catch(e) { alert("Error: " + e.message); }
    }

    loadCollection(collectionKey) {
        if (typeof VOCAB_COLLECTIONS === 'undefined' || !VOCAB_COLLECTIONS[collectionKey]) return false;
        if (!this._defaultList) this._defaultList = this.list;
        const collection = VOCAB_COLLECTIONS[collectionKey];
        const langKey = collection[0] && collection[0].lang ? collection[0].lang : null;
        const exKey = langKey ? langKey + '_ex' : null;
        this.list = collection.map((item, i) => {
            const entry = { id: item.id !== undefined ? item.id : i, level: item.level || '' };
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
            if (item.level) entry.level = item.level;
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
            if (parts[levelIdx] && parts[levelIdx].trim()) item.level = parts[levelIdx].trim();
            if (parts[tagIdx] && parts[tagIdx].trim()) item.tags = parts[tagIdx].split(/[;|]/).map(t => t.trim()).filter(Boolean);
            return item;
        });
    }
    
    // FIX: Set "Test 0" so main.js can detect it as mock data properly
    createMockData() { this.list = Array.from({length:20}, (_,i)=> ({ id: i, ja: "Test " + i, en: "Test " + i })); }
    rand() { return this.list.length ? this.list[Math.floor(Math.random() * this.list.length)] : { id:0 }; }
}
