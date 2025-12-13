/* js/data.js */
class DataService {
    constructor() { 
        this.list = []; 
        this.localDailyScore = 0; 
        this.dailyScoreLoaded = false; 
    }
    
    // Reset cache on login to ensure fresh fetch
    resetSession() {
        this.localDailyScore = 0;
        this.dailyScoreLoaded = false;
    }

    getTodayKey() {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d - offset)).toISOString().slice(0, 10);
        return localISOTime;
    }

    async load() {
        let loaded = false;
        if (typeof db !== 'undefined' && db) {
            try {
                console.log("[Data] Fetching from Realtime Database...");
                // Note: This relies on Auth being "ready" (Anon or Real) which Main.js now waits for.
                const dbPromise = db.ref('vocab').once('value');
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject("Timeout"), 3000));
                const snap = await Promise.race([dbPromise, timeoutPromise]);
                if (snap.exists()) {
                    const val = snap.val();
                    this.list = Array.isArray(val) ? val : Object.values(val);
                    this.list = this.list.filter(item => item !== null).sort((a,b) => a.id - b.id);
                    loaded = true;
                }
            } catch (e) { console.warn("[Data] RTDB fetch failed", e); }
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

    async saveCorrection(updatedItem) {
        const idx = this.list.findIndex(x => x.id === updatedItem.id);
        if(idx > -1) this.list[idx] = updatedItem;
        if (typeof db !== 'undefined' && db) {
            await db.ref('vocab/' + updatedItem.id).set(updatedItem);
        }
    }

    async recordScore(points, mode) {
        this.localDailyScore += points; 

        if (!auth || !auth.currentUser || !db) return;
        
        // FIX: Do NOT record stats for Anonymous users
        if (auth.currentUser.isAnonymous) {
            console.log("[Data] Score not saved (Anonymous User)");
            return;
        }

        const uid = auth.currentUser.uid;
        const todayKey = this.getTodayKey(); 
        
        const updates = {};
        updates[`users/${uid}/weekly/total`] = firebase.database.ServerValue.increment(points);
        updates[`users/${uid}/weekly/modes/${mode}`] = firebase.database.ServerValue.increment(points);
        updates[`users/${uid}/weekly/daily/${todayKey}/${mode}`] = firebase.database.ServerValue.increment(points);

        try {
            await db.ref().update(updates);
        } catch(e) { console.error("[Data] Scoring failed", e); }
    }

    async getStats() {
        if (!auth || !auth.currentUser || !db) return null;
        if (auth.currentUser.isAnonymous) return null; // No stats for anon

        const uid = auth.currentUser.uid;
        try {
            const snap = await db.ref(`users/${uid}/weekly`).once('value');
            return snap.val(); 
        } catch(e) { return null; }
    }

    async getTodayTotal() {
        if (this.dailyScoreLoaded) return this.localDailyScore;

        if (!auth || !auth.currentUser || !db) return 0;
        if (auth.currentUser.isAnonymous) return 0; // No stats for anon

        const uid = auth.currentUser.uid;
        const todayKey = this.getTodayKey();
        try {
            const snap = await db.ref(`users/${uid}/weekly/daily/${todayKey}`).once('value');
            
            let total = 0;
            if (snap.exists()) {
                const modes = snap.val();
                total = Object.values(modes).reduce((a, b) => a + b, 0);
            }
            
            // Update local cache
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

    parseCSV(txt) {
        let lines = txt.split(/\r?\n/).filter(l => l.trim().length > 0 && !l.trim().startsWith('['));
        if (lines.length > 0) lines = lines.slice(1); 
        this.list = lines.map((line, i) => {
            const parts = []; let match; const regex = /(?:^|,)(\s*(?:"([^"]*)"|([^",]*))\s*)/g;
            while ((match = regex.exec(line)) !== null) { parts.push(match[2] !== undefined ? match[2] : match[3]); }
            if(parts.length===0) parts.push(...line.split(','));
            const item = { id: i };
            if(typeof LANG_CONFIG !== 'undefined') { LANG_CONFIG.forEach(c => item[c.key] = parts[c.index] ? parts[c.index].trim() : ""); }
            return item;
        });
    }
    createMockData() { this.list = Array.from({length:20}, (_,i)=> ({ id: i, ja: "Test "+i, en: "Test "+i })); }
    rand() { return this.list.length ? this.list[Math.floor(Math.random() * this.list.length)] : { id:0 }; }
}
