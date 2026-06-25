// Extracted Cache methods for Story mode
Object.assign(Story.prototype, {

// --- RTDB cache loading ---
async _loadCacheThenStart() {
        if (window.location.search.includes('disable_cache=1')) {
            return this.startStory();
        }
        
        // Try to load cached stories from RTDB for this language
        if (!this._cacheLoaded) {
            await this._loadCachedStories();
            this._cacheLoaded = true;
        }
        this.startStory();
    },

    async _loadCachedStories() {
        try {
            const user = auth.currentUser;
            if (!user) return;
            const targetLang = this._getTargetLang();
            const snap = await db.ref('stories').once('value');
            if (!snap.exists()) return;

            const all = [];
            snap.forEach(function(compositeChild) {
                var langNode = compositeChild.val();
                // Each child key is a language code
                var story = langNode[targetLang];
                if (story && story.story && story.questions && story.questions.length > 0) {
                    story._key = compositeChild.key + '/' + targetLang;
                    story._lang = targetLang;
                    all.push(story);
                }
            });

            for (var i = all.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = all[i]; all[i] = all[j]; all[j] = tmp;
            }
            this._cachedStories = all;
            this._cachedIndex = 0;
            L('[Story] Loaded', all.length, 'cached stories from RTDB');
        } catch (e) {
            L('[Story] Cache load failed:', e.message);
        }
    },

    _nextCachedStory() {
        if (!this._cachedStories || this._cachedIndex >= this._cachedStories.length) return null;
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
                L('[Story] Prefetch served from RTDB cache');
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
            if (!auth || !auth.currentUser) {
                if (app.ui) app.ui.showToast('Must be logged in to delete', 'error');
                return;
            }
            await db.ref('stories/' + key + '/' + lang).remove();
            L('[Story] Deleted story from RTDB: /stories/' + key + '/' + lang);
            if (app.ui) app.ui.showToast('Story deleted', 'success');
            // Remove from local cache
            var cacheKey = key + '/' + lang;
            this._cachedStories = this._cachedStories.filter(function(s) { return s._key !== cacheKey; });
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
