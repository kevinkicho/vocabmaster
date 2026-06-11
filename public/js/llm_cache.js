// Extracted Cache methods for LLMService
Object.assign(LLMService.prototype, {
    // --- IndexedDB Cache ---
    _initDB() {
        try {
            const req = indexedDB.open('vocabmaster_llm', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('cloze_cache')) {
                    db.createObjectStore('cloze_cache');
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; };
            req.onerror = () => { L('[LLM] IndexedDB init failed'); };
        } catch (e) {
            L('[LLM] IndexedDB not available');
        }
    },

    _cacheKey(sentence, target, lang) {
        return `${sentence}|||${target}|||${lang}`;
    },

    async getFromCache(sentence, target, lang) {
        const key = this._cacheKey(sentence, target, lang);
        if (this.cache.has(key)) return this.cache.get(key);
        if (!this.db) return null;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('cloze_cache', 'readonly');
                const store = tx.objectStore('cloze_cache');
                const req = store.get(key);
                req.onsuccess = () => {
                    const val = req.result;
                    if (val) this.cache.set(key, val.match);
                    resolve(val ? val.match : null);
                };
                req.onerror = () => resolve(null);
            } catch { resolve(null); }
        });
    },

    async setCache(sentence, target, lang, match) {
        const key = this._cacheKey(sentence, target, lang);
        this.cache.set(key, match);
        if (!this.db) return;
        try {
            const tx = this.db.transaction('cloze_cache', 'readwrite');
            const store = tx.objectStore('cloze_cache');
            store.put({ match, ts: Date.now() }, key);
        } catch (e) { L('[LLM] Cache write failed:', e); }
    },

    async clearCache() {
        this.cache.clear();
        if (!this.db) return;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('cloze_cache', 'readwrite');
                const store = tx.objectStore('cloze_cache');
                store.clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch { resolve(); }
        });
    },

    async getCacheCount() {
        if (!this.db) return this.cache.size;
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction('cloze_cache', 'readonly');
                const store = tx.objectStore('cloze_cache');
                const req = store.count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(this.cache.size);
            } catch { resolve(this.cache.size); }
        });
    }
});
