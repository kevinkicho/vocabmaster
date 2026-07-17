// Extracted Cache methods for Story mode
// IndexedDB pack (VmIdb stories:pack:{lang}) first; RTDB full tree only on miss / revalidate.
Object.assign(Story.prototype, {

// --- Cache loading (IDB → RTDB) ---
async _loadCacheThenStart() {
        if (window.location.search.includes('disable_cache=1')) {
            return this.startStory();
        }
        
        if (!this._cacheLoaded) {
            await this._loadCachedStories();
            this._cacheLoaded = true;
        }
        this.startStory();
    },

    _storiesIdbKey(lang) {
        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        if (idb && idb.KEYS && idb.KEYS.storiesPack) return idb.KEYS.storiesPack(lang);
        return 'stories:pack:' + (lang || 'en');
    },

    _shuffleStories(all) {
        for (var i = all.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = all[i]; all[i] = all[j]; all[j] = tmp;
        }
        return all;
    },

    async _writeStoriesIdb(lang, list) {
        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        if (!idb || !list) return;
        try {
            // Strip non-cloneable bits; keep fields needed for playback
            var pack = list.map(function (s) {
                return {
                    story: s.story,
                    translation: s.translation || '',
                    questions: s.questions,
                    vocabIds: s.vocabIds || [],
                    _key: s._key,
                    _lang: s._lang || lang,
                    ts: s.ts || s.localTs || Date.now()
                };
            });
            await idb.set(this._storiesIdbKey(lang), pack, { count: pack.length, lang: lang });
            L('[Story] Saved', pack.length, 'stories to IndexedDB for', lang);
        } catch (e) {
            L('[Story] IDB pack save failed:', e && e.message);
        }
    },

    async _upsertStoryInIdb(entry, lang, compositeKey) {
        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        if (!idb || !entry) return;
        try {
            var key = this._storiesIdbKey(lang);
            var list = (await idb.get(key)) || [];
            if (!Array.isArray(list)) list = [];
            var fullKey = compositeKey + '/' + lang;
            list = list.filter(function (s) { return s && s._key !== fullKey; });
            list.push({
                story: entry.story,
                translation: entry.translation || '',
                questions: entry.questions,
                vocabIds: entry.vocabIds || [],
                _key: fullKey,
                _lang: lang,
                localTs: Date.now()
            });
            await idb.set(key, list, { count: list.length, lang: lang });
        } catch (e) {
            L('[Story] IDB upsert failed:', e && e.message);
        }
    },

    async _removeStoryFromIdb(compositeKey, lang) {
        var idb = (typeof window !== 'undefined') ? window.VmIdb : null;
        if (!idb) return;
        try {
            var key = this._storiesIdbKey(lang);
            var list = (await idb.get(key)) || [];
            if (!Array.isArray(list)) return;
            var fullKey = compositeKey + '/' + lang;
            var next = list.filter(function (s) { return s && s._key !== fullKey; });
            await idb.set(key, next, { count: next.length, lang: lang });
        } catch (_) {}
    },

    _revalidateStoriesInBackground(targetLang) {
        if (this._storiesBgRefresh) return;
        var self = this;
        this._storiesBgRefresh = (async function () {
            try {
                await self._fetchStoriesFromRtdb(targetLang, { writeIdb: true, applyToSession: false });
                L('[Story] Background revalidated stories for', targetLang);
            } catch (e) {
                L('[Story] Background revalidate failed:', e && e.message);
            } finally {
                self._storiesBgRefresh = null;
            }
        })();
    },

    /**
     * @param {string} targetLang
     * @param {{ writeIdb?: boolean, applyToSession?: boolean }} [opts]
     * @returns {Promise<Array>}
     */
    async _fetchStoriesFromRtdb(targetLang, opts) {
        opts = opts || {};
        if (typeof db === 'undefined' || !db) return [];
        if (!auth || !auth.currentUser) return [];
        const snap = await db.ref('stories').once('value');
        if (!snap.exists()) return [];

        const all = [];
        snap.forEach(function(compositeChild) {
            var langNode = compositeChild.val();
            var story = langNode && langNode[targetLang];
            if (story && story.story && story.questions && story.questions.length > 0) {
                story._key = compositeChild.key + '/' + targetLang;
                story._lang = targetLang;
                all.push(story);
            }
        });
        if (opts.writeIdb !== false) {
            await this._writeStoriesIdb(targetLang, all);
        }
        if (opts.applyToSession) {
            this._cachedStories = this._shuffleStories(all.slice());
            this._cachedIndex = 0;
        }
        return all;
    },

    async _loadCachedStories() {
        try {
            const targetLang = this._getTargetLang();
            var idb = (typeof window !== 'undefined') ? window.VmIdb : null;

            // 1) IndexedDB pack — avoid full RTDB stories tree download
            if (idb) {
                try {
                    var rec = await idb.getRecord(this._storiesIdbKey(targetLang));
                    if (rec && Array.isArray(rec.v) && rec.v.length > 0) {
                        this._cachedStories = this._shuffleStories(rec.v.slice());
                        this._cachedIndex = 0;
                        L('[Story] Loaded', this._cachedStories.length, 'cached stories from IndexedDB (no auto full re-download)');
                        // Large-tree policy: never re-pull full `stories` after first pack load.
                        // New stories are upserted into the IDB pack on save; force via empty pack / clear.
                        if (idb.ALLOW_LARGE_BG_REVALIDATE === true &&
                            Number.isFinite(idb.REVALIDATE_AFTER_MS) &&
                            idb.ageMs(rec) > idb.REVALIDATE_AFTER_MS) {
                            this._revalidateStoriesInBackground(targetLang);
                        }
                        return;
                    }
                } catch (eIdb) {
                    L('[Story] IDB pack load failed:', eIdb && eIdb.message);
                }
            }

            // 2) RTDB (first run / empty IDB)
            if (!auth || !auth.currentUser) {
                L('[Story] RTDB load skipped: no auth (and no IDB pack)');
                return;
            }
            var all = await this._fetchStoriesFromRtdb(targetLang, { writeIdb: true, applyToSession: true });
            if (all.length) {
                L('[Story] Loaded', all.length, 'cached stories from RTDB');
            }
        } catch (e) {
            L('[Story] Cache load failed:', e.message);
        }
    },

    _nextCachedStory() {
        if (!this._cachedStories || this._cachedIndex >= this._cachedStories.length) return null;

        // Best-effort: prefer cache entries whose vocabIds intersect session seeds.
        // Never require a perfect match — highest intersection wins; zero falls through
        // to first available (do not block waiting for a better match).
        var seeds = this.sessionSeedWordIds;
        if ((!seeds || !seeds.length) && typeof app !== 'undefined' && app &&
            app._sessionStorySeedWordIds && app._sessionStorySeedWordIds.length) {
            seeds = app._sessionStorySeedWordIds;
        }
        if (seeds && seeds.length) {
            var seedSet = new Set(seeds.map(Number).filter(function (id) {
                return Number.isFinite(id);
            }));
            var bestIdx = -1;
            var bestScore = 0;
            for (var i = this._cachedIndex; i < this._cachedStories.length; i++) {
                var entry = this._cachedStories[i];
                if (!entry || !entry.questions || !entry.questions.length) continue;
                var ids = entry.vocabIds || [];
                var score = 0;
                for (var j = 0; j < ids.length; j++) {
                    if (seedSet.has(Number(ids[j]))) score++;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0 && bestScore > 0 && bestIdx !== this._cachedIndex) {
                var tmp = this._cachedStories[this._cachedIndex];
                this._cachedStories[this._cachedIndex] = this._cachedStories[bestIdx];
                this._cachedStories[bestIdx] = tmp;
                L('[Story] Cache best-effort seed intersect score=', bestScore, 'at', bestIdx);
            }
        }

        const cached = this._cachedStories[this._cachedIndex];
        this._cachedIndex++;
        const words = (cached.vocabIds || []).map(id => app.data.list.find(w => w.id === id)).filter(Boolean);
        if (words.length === 0 || !cached.questions || cached.questions.length === 0) return this._nextCachedStory();
        return {
            storyWords: words,
            storyPart: cached.story,
            translation: cached.translation || null,
            questions: cached.questions,
            lang: cached._lang || this._getTargetLang(),
            fromCache: true,
            _key: cached._key || null
        };
    },

// --- Prefetch next story in background ---
async _prefetchNext() {
        if (this._prefetching) return;
        if (this.storyNum >= this.storiesPerSession) return; // don't prefetch past session end
        this._prefetching = true;
        L('[Story] Prefetching next story in background...');

        try {
            if (!app.llm || !app.llm.available || !app.llm.hasModel) {
                this._prefetching = false;
                return; // Cloud AI not ready — skip background generation
            }

            // Check if we can serve from cache instead of generating
            const cached = this._nextCachedStory();
            if (cached) {
                this._prefetched = cached;
                L('[Story] Prefetch served from local/RTDB cache');
                this._updateNextButton();
                return;
            }

            const words = await this._pickWords(4);
            const lang = this._getTargetLang();
            const storyLevel = this._storyLevel;
            if (words.length === 0) { this._prefetching = false; return; }

            var result = await app.llm.generateStory(words, lang, storyLevel);
            if (result && result.story && result.questions && result.questions.length > 0) {
                var storyPart = result.story;
                var questions = result.questions;
                this._prefetched = { storyWords: words, storyPart: storyPart, translation: result.translation || null, questions: questions, lang: lang, vocabIds: words.map(function(w) { return w.id; }) };
                L('[Story] Prefetch ready:', questions.length, 'questions');
                this._updateNextButton();
            } else {
                L('[Story] Prefetch failed to generate story.');
            }
        } catch (e) {
            const llmInfo = app.llm ? { endpoint: app.llm.endpoint, model: LLMService.MODEL, useCloud: app.llm.useCloud } : null;
            L('[Story] Prefetch failed:', e, 'llm:', llmInfo);
        } finally {
            this._prefetching = false;
        }
    },

    _updateNextButton() {
        if (this.qIndex >= this.questions.length && this._prefetched) {
            const btn = this.dom.footer?.querySelector('button');
            if (btn && btn.textContent.includes('New Story')) {
                btn.innerHTML = '<i class="ph-bold ph-arrow-right mr-1"></i> Next Story';
            }
        }
    },

// --- Save story to RTDB ---
async _saveStoryToRTDB(storyText, questions, words, lang) {
        try {
            var user = auth.currentUser;
            for (var attempt = 0; attempt < 5 && !user; attempt++) {
                L('[Story] Save waiting for auth (attempt ' + (attempt + 1) + '/5)');
                await new Promise(function(r) { setTimeout(r, 500); });
                user = auth.currentUser;
            }
            if (!user) { L('[Story] Save skipped: no auth after 5 retries'); return; }
            if (!questions || questions.length === 0) {
                L('[Story] Save skipped: no valid questions');
                return;
            }

            const vocabIds = words.map(function(w) { return w.id; }).filter(function(id) { return id !== undefined && id !== null; });
            if (vocabIds.length === 0) { L('[Story] Save skipped: no vocab ids'); return; }
            var compositeKey = vocabIds.slice().sort(function(a,b) { return a - b; }).join('-');

            var entry = {
                story: storyText,
                translation: this._currentStoryTranslation || '',
                questions: questions,
                vocabIds: vocabIds,
                ts: firebase.database.ServerValue.TIMESTAMP
            };

            await db.ref('stories/' + compositeKey + '/' + lang).update(entry);
            L('[Story] Saved story to RTDB: /stories/' + compositeKey + '/' + lang);
            // Keep device pack in sync
            await this._upsertStoryInIdb(entry, lang, compositeKey);
            // Also refresh in-memory list so next story can use it
            if (Array.isArray(this._cachedStories)) {
                var fullKey = compositeKey + '/' + lang;
                this._cachedStories = this._cachedStories.filter(function (s) {
                    return s && s._key !== fullKey;
                });
                this._cachedStories.push(Object.assign({}, entry, {
                    _key: fullKey,
                    _lang: lang
                }));
            }
        } catch (e) {
            L('[Story] RTDB save failed:', e.message);
        }
    },

    async _deleteStoryFromRTDB() {
        try {
            var key = this._currentCompositeKey;
            var lang = this._currentStoryLang;
            if (!key || !lang) {
                // Try reconstructing from current storyWords
                var vocabIds = (this.storyWords || []).map(function(w) { return w.id; }).filter(function(id) { return id !== undefined && id !== null; });
                if (vocabIds.length === 0) {
                    if (app.ui) app.ui.showToast('No story to delete', 'error');
                    return;
                }
                key = vocabIds.slice().sort().join('-');
                lang = this._getTargetLang();
            }
            // Always drop from IndexedDB pack (even if RTDB delete needs auth)
            await this._removeStoryFromIdb(key, lang);
            if (!auth || !auth.currentUser) {
                if (app.ui) app.ui.showToast('Must be logged in to delete from cloud', 'error');
                // Still remove from session memory
                var cacheKeyOffline = key + '/' + lang;
                this._cachedStories = (this._cachedStories || []).filter(function(s) {
                    return s._key !== cacheKeyOffline;
                });
                if (this._cachedIndex >= this._cachedStories.length) {
                    this._cachedIndex = Math.max(0, this._cachedStories.length - 1);
                }
                this._loadNext();
                return;
            }
            await db.ref('stories/' + key + '/' + lang).remove();
            L('[Story] Deleted story from RTDB: /stories/' + key + '/' + lang);
            if (app.ui) app.ui.showToast('Story deleted', 'success');
            // Remove from session cache
            var cacheKey = key + '/' + lang;
            this._cachedStories = (this._cachedStories || []).filter(function(s) { return s._key !== cacheKey; });
            // Re-sort pointer
            if (this._cachedIndex >= this._cachedStories.length) {
                this._cachedIndex = Math.max(0, this._cachedStories.length - 1);
            }
            // Advance to next
            this._loadNext();
        } catch (e) {
            L('[Story] Delete failed:', e.message);
            if (app.ui) app.ui.showToast('Delete failed: ' + e.message, 'error');
        }
    }
});
