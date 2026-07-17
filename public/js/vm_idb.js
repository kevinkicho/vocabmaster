/* js/vm_idb.js
 * Shared IndexedDB for VocabMaster — durable on-device cache beyond localStorage quotas.
 *
 * DB: vocabmaster_app (v1)
 * Store: kv  — generic key → { v, t, m }  (value, savedAt ms, optional meta)
 *
 * Well-known keys (use these; avoid ad-hoc collisions):
 *   vocab:full          full RTDB vocab array + fingerprint meta
 *   dict:{char}         dictionary / kanji entry for character
 *   memory:cache        FSRS cards blob (mirrors localStorage)
 *   memory:dirty        dirty word-id set
 *   path:profile        learning path profile
 *   daily:session       today session plan payload
 *   grammar:{vid}:{lang}:{explainLang}  Grammar Gym exercise pack
 *   stories:pack:{lang} full story list for a target language
 *
 * Cross-script: only window.VmIdb is visible across <script> tags (const/let do not cross).
 */
(function (global) {
    'use strict';

    var DB_NAME = 'vocabmaster_app';
    var DB_VERSION = 1;
    var STORE = 'kv';

    /** Soft “freshness” window for utilities (90 days). Large packs still served past this offline. */
    var DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
    /**
     * Auto full-tree revalidate for vocab/stories is OFF by default.
     * Large RTDB nodes are loaded once, then IndexedDB-only until force refresh.
     * (Previously 24h background revalidate re-downloaded multi-MB trees.)
     */
    var REVALIDATE_AFTER_MS = Infinity;
    /** Set true only for debugging auto revalidate of large packs. */
    var ALLOW_LARGE_BG_REVALIDATE = false;

    var _dbPromise = null;

    function openDb() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('indexedDB unavailable'));
                return;
            }
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () {
                _dbPromise = null;
                reject(req.error || new Error('VmIdb open failed'));
            };
        });
        return _dbPromise;
    }

    /**
     * @param {string} key
     * @returns {Promise<{v:*, t:number, m?:object}|null>}
     */
    function getRecord(key) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readonly');
                var req = tx.objectStore(STORE).get(key);
                req.onsuccess = function () {
                    resolve(req.result != null ? req.result : null);
                };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function () { return null; });
    }

    /**
     * @param {string} key
     * @returns {Promise<*>} unwrapped value or null
     */
    function get(key) {
        return getRecord(key).then(function (rec) {
            if (!rec || typeof rec !== 'object') return null;
            return rec.v !== undefined ? rec.v : null;
        });
    }

    /**
     * @param {string} key
     * @param {*} value
     * @param {object} [meta]
     */
    function set(key, value, meta) {
        var rec = {
            v: value,
            t: Date.now(),
            m: meta && typeof meta === 'object' ? meta : undefined
        };
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(rec, key);
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { reject(tx.error); };
            });
        }).catch(function (e) {
            if (typeof L === 'function') L('[VmIdb] set failed', key, e);
            return false;
        });
    }

    function del(key) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).delete(key);
                tx.oncomplete = function () { resolve(true); };
                tx.onerror = function () { reject(tx.error); };
            });
        }).catch(function () { return false; });
    }

    /**
     * @param {string} prefix
     * @returns {Promise<number>} deleted count
     */
    function clearPrefix(prefix) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                var store = tx.objectStore(STORE);
                var req = store.openCursor();
                var n = 0;
                req.onsuccess = function () {
                    var cur = req.result;
                    if (!cur) return;
                    if (String(cur.key).indexOf(prefix) === 0) {
                        cur.delete();
                        n++;
                    }
                    cur.continue();
                };
                tx.oncomplete = function () { resolve(n); };
                tx.onerror = function () { reject(tx.error); };
            });
        }).catch(function () { return 0; });
    }

    function isFresh(recordOrTs, ttlMs) {
        ttlMs = ttlMs == null ? DEFAULT_TTL_MS : ttlMs;
        var t = typeof recordOrTs === 'number'
            ? recordOrTs
            : (recordOrTs && recordOrTs.t);
        if (!t) return false;
        var age = Date.now() - t;
        return age >= 0 && age < ttlMs;
    }

    function ageMs(recordOrTs) {
        var t = typeof recordOrTs === 'number'
            ? recordOrTs
            : (recordOrTs && recordOrTs.t);
        if (!t) return Infinity;
        return Date.now() - t;
    }

    /** Fire-and-forget set (never throws to caller). */
    function setAsync(key, value, meta) {
        try {
            Promise.resolve(set(key, value, meta)).catch(function () {});
        } catch (_) {}
    }

    var KEYS = Object.freeze({
        VOCAB_FULL: 'vocab:full',
        MEMORY_CACHE: 'memory:cache',
        MEMORY_DIRTY: 'memory:dirty',
        PATH_PROFILE: 'path:profile',
        DAILY_SESSION: 'daily:session',
        dict: function (char) { return 'dict:' + char; },
        /** Grammar Gym: one cached exercise set per vocab + target lang + explain lang */
        grammar: function (vocabId, langCode, explainLang) {
            return 'grammar:' + String(vocabId) + ':' + String(langCode || '') + ':' + String(explainLang || 'en');
        },
        /** Story Mode: all cached stories for a target language */
        storiesPack: function (lang) {
            return 'stories:pack:' + String(lang || 'en');
        }
    });

    global.VmIdb = {
        DB_NAME: DB_NAME,
        DEFAULT_TTL_MS: DEFAULT_TTL_MS,
        REVALIDATE_AFTER_MS: REVALIDATE_AFTER_MS,
        ALLOW_LARGE_BG_REVALIDATE: ALLOW_LARGE_BG_REVALIDATE,
        KEYS: KEYS,
        ready: function () {
            return openDb().then(function () { return true; }).catch(function () { return false; });
        },
        get: get,
        getRecord: getRecord,
        set: set,
        setAsync: setAsync,
        del: del,
        clearPrefix: clearPrefix,
        isFresh: isFresh,
        ageMs: ageMs
    };
})(typeof window !== 'undefined' ? window : globalThis);
