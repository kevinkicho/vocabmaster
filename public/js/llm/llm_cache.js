/* js/llm/llm_cache.js — IndexedDB cache for LLMService */
LLMService.prototype._initDB = function() {
    try {
        var req = indexedDB.open('vocabmaster_llm', 1);
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains('cloze_cache')) {
                db.createObjectStore('cloze_cache');
            }
        };
        req.onsuccess = function(e) { this.db = e.target.result; }.bind(this);
        req.onerror = function() { L('[LLM] IndexedDB init failed'); };
    } catch (e) {
        L('[LLM] IndexedDB not available');
    }
};

LLMService.prototype._cacheKey = function(sentence, target, lang) {
    return sentence + '|||' + target + '|||' + lang;
};

LLMService.prototype.getFromCache = async function(sentence, target, lang) {
    var key = this._cacheKey(sentence, target, lang);
    if (this.cache.has(key)) return this.cache.get(key);
    if (!this.db) return null;
    return new Promise(function(resolve) {
        try {
            var tx = this.db.transaction('cloze_cache', 'readonly');
            var store = tx.objectStore('cloze_cache');
            var req = store.get(key);
            req.onsuccess = function() {
                var val = req.result;
                if (val) this.cache.set(key, val.match);
                resolve(val ? val.match : null);
            }.bind(this);
            req.onerror = function() { resolve(null); };
        } catch(e) { resolve(null); }
    }.bind(this));
};

LLMService.prototype.setCache = async function(sentence, target, lang, match) {
    var key = this._cacheKey(sentence, target, lang);
    if (this.cache.size >= 500) {
        var firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
    }
    this.cache.set(key, match);
    if (!this.db) return;
    try {
        var tx = this.db.transaction('cloze_cache', 'readwrite');
        var store = tx.objectStore('cloze_cache');
        store.put({ match: match, ts: Date.now() }, key);
    } catch (e) { L('[LLM] Cache write failed:', e); }
};

LLMService.prototype.clearCache = async function() {
    this.cache.clear();
    if (!this.db) return;
    return new Promise(function(resolve) {
        try {
            var tx = this.db.transaction('cloze_cache', 'readwrite');
            var store = tx.objectStore('cloze_cache');
            store.clear();
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { resolve(); };
        } catch(e) { resolve(); }
    }.bind(this));
};

LLMService.prototype.getCacheCount = async function() {
    if (!this.db) return this.cache.size;
    return new Promise(function(resolve) {
        try {
            var tx = this.db.transaction('cloze_cache', 'readonly');
            var store = tx.objectStore('cloze_cache');
            var req = store.count();
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { resolve(this.cache.size); }.bind(this);
        } catch(e) { resolve(this.cache.size); }
    }.bind(this));
};