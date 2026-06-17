// Extracted Generator methods for Story mode
Object.assign(Story.prototype, {

// --- Main flow ---
async startStory(forceAnew = false) {
        if (app.audio) app.audio.cancel();
        var currentLang = this._getTargetLang();
        if (this._currentStoryLang && this._currentStoryLang !== currentLang) {
            if (app.llm && app.llm.available && app.llm.hasModel) {
                this._cacheLoaded = false;
                this._cachedStories = [];
                this._cachedIndex = 0;
                this._prefetched = null;
            }
            this._currentStoryLang = null;
        }
        this._generationId++;
        var genId = this._generationId;
        this.storyNum++;
        this._updateProgress();

        // AI is primary for Story activity, but we allow cached stories if AI is offline.
        if (!app.llm || !app.llm.available || !app.llm.hasModel) {
            const cached = this._nextCachedStory();
            if (cached) {
                L('[Story] AI offline, falling back to cached story from RTDB');
                this.storyWords = cached.storyWords;
                this.questions = cached.questions;
                this.qIndex = 0;
                this._currentStoryTranslation = cached.translation || null;
                this._currentStoryLang = cached.lang;
                this._showStoryWithQuestions(cached.storyPart, cached.lang);
                return;
            }

            L('[Story] AI offline and no cache, showing error');
            this.dom.body.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                    <i class="ph-duotone ph-plug text-5xl text-amber-400"></i>
                    <p class="text-base font-black text-slate-700 dark:text-neutral-200">AI Not Connected</p>
                    <p class="text-xs text-slate-500 dark:text-neutral-400 max-w-xs">Story Mode requires an active AI connection to generate stories. Please connect AI in Settings.</p>
                    <button onclick="app.goHome()" class="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-500 active:scale-95 transition-transform">Back to Menu</button>
                </div>`;
            this.dom.footer.innerHTML = '';
            this.afterRender();
            return;
        }

        // If user explicitly wants a fresh AI story, skip prefetch + cache and go straight to generation
        if (forceAnew) {
            L('[Story] User requested fresh AI generation (forceAnew)');
            this._prefetched = null;
        } else {
            // Priority 1: prefetched story (already generated in background via AI)
            if (this._prefetched) {
                L('[Story] Using prefetched story');
                const p = this._prefetched;
                this._prefetched = null;
                this.storyWords = p.storyWords;
                this.questions = p.questions;
                this.qIndex = 0;
                this._currentStoryTranslation = p.translation || null;
                this._showStoryWithQuestions(p.storyPart, p.lang);
                if (!p.fromCache) this._saveStoryToRTDB(p.storyPart, p.questions, p.storyWords, p.lang).catch(function(e) { L('[Story] Save to RTDB error:', e); });
                this._prefetchNext();
                return;
            }

            // Priority 2: cached story from RTDB (pre-generated via AI)
            const cached = this._nextCachedStory();
            if (cached) {
                L('[Story] Serving cached story from RTDB');
                this.storyWords = cached.storyWords;
                this.questions = cached.questions;
                this.qIndex = 0;
                this._currentStoryTranslation = cached.translation || null;
                this._showStoryWithQuestions(cached.storyPart, cached.lang);
                this._prefetchNext();
                return;
            }
        }

        // Priority 3: generate fresh story via AI (mandatory)

        this.phase = 'loading';
        this.storyText = '';
        this.questions = [];
        this.qIndex = 0;
        this._currentStoryTranslation = null;

        if (!forceAnew || !this.storyWords || this.storyWords.length === 0) {
            this.storyWords = await this._pickWords(4);
        }
        const lang = this._getTargetLang();
        const langName = app.llm._getLangName(lang);
        const wordList = this.storyWords.map(w => w[lang]).filter(Boolean);
        var self = this;
        var langLevels = this._getLevelsForLang(lang);
        var langCodes = langLevels.map(function(l) { return l.code; });
        var foundLevels = this.storyWords.map(function(w) {
            return (w.tags || []).find(function(t) { return langCodes.indexOf(t) !== -1; });
        }).filter(Boolean);
        this._storyLevel = foundLevels.length > 0
            ? foundLevels.sort(function(a,b) { return langCodes.indexOf(a) - langCodes.indexOf(b); }).pop()
            : app.store.prefs.chatLevel || 'B1';

        L('[Story] Picked words:', wordList, 'lang:', lang, 'level:', this._storyLevel);

        if (wordList.length === 0) {
            this.dom.body.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <i class="ph-duotone ph-warning text-4xl text-amber-400"></i>
                    <p class="text-sm font-bold text-slate-600 dark:text-neutral-300">No vocab words found</p>
                    <p class="text-xs text-slate-400">Make sure your word list has ${langName} words.</p>
                    <button onclick="app.goHome()" class="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-500 active:scale-95 transition-transform">Back to Menu</button>
                </div>`;
            this.afterRender();
            return;
        }

        // Show generating spinner (buffered generation, no streaming)
        this._showGeneratingCard(wordList);

        try {
            await this._generateStory(this.storyWords, wordList, langName, this._storyLevel, lang);
        } catch (e) {
            const llmInfo = app.llm ? { endpoint: app.llm.endpoint, resolvedModel: app.llm.resolvedModel, useCloud: app.llm.useCloud, available: app.llm.available, hasModel: app.llm.hasModel } : null;
            L('[Story] Generation failed:', e, 'llm:', llmInfo, 'wordList:', wordList, 'lang:', lang);

            if (this._elapsedTimer) clearInterval(this._elapsedTimer);
            this.phase = 'error';
            const modelInfo = (app.llm && app.llm.resolvedModel) || 'unknown';
            this.dom.body.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                    <i class="ph-duotone ph-warning-circle text-5xl text-rose-400"></i>
                    <p class="text-base font-black text-slate-700 dark:text-neutral-200">Generation Failed</p>
                    <p class="text-xs text-slate-500 dark:text-neutral-400 max-w-xs">The AI model could not generate a story. This may be a network or model issue.</p>
                    <div class="text-[10px] text-slate-400 dark:text-neutral-500 bg-slate-100 dark:bg-neutral-800 rounded-xl px-3 py-2 mt-1">
                        Model: ${modelInfo}<br>
                        Error: ${e.message || e}
                    </div>
                    <button onclick="app.game.startStory(true)" class="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-500 active:scale-95 transition-transform">Retry</button>
                    <button onclick="app.goHome()" class="px-4 py-1.5 rounded-xl text-[10px] font-bold text-slate-400 dark:text-neutral-500 bg-slate-100 dark:bg-neutral-800 active:scale-95 transition-transform">Back to Menu</button>
                </div>`;
            this.afterRender();
        } finally {
            if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        }
    },

// --- Generation: use buffered AI with critic validation ---
async _generateStory(storyWordsObjs, wordList, langName, storyLevel, lang) {
        L('[Story] _generateStory using critic-validated pipeline');
        var genId = this._generationId;

        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        this.phase = 'loading';

        var startTime = Date.now();
        this._elapsedTimer = setInterval(function() {
            var el = document.getElementById('story-elapsed');
            if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
        }, 1000);

        var onProgress = function(msg) {
            var textEl = document.getElementById('story-gen-text');
            if (textEl) textEl.innerHTML = '<i class="ph-bold ph-spinner animate-spin mr-2"></i>' + escapeHtml(msg);
        };

        var result = await app.llm.generateStory(storyWordsObjs, lang, storyLevel, onProgress);

        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        if (this._destroyed) return;
        if (this._generationId !== genId) { L('[Story] Discarding stale generation'); return; }

        if (!result || !result.story || !result.questions || result.questions.length === 0) {
            L('[Story] LLM failed to generate valid story+questions');
            this.phase = 'error';
            var modelInfo = (app.llm && app.llm.resolvedModel) || 'unknown';
            this.dom.body.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                    <i class="ph-duotone ph-warning-circle text-5xl text-rose-400"></i>
                    <p class="text-base font-black text-slate-700 dark:text-neutral-200">Generation Failed</p>
                    <p class="text-xs text-slate-500 dark:text-neutral-400 max-w-xs">The AI model could not generate a story with valid questions.</p>
                    <div class="text-[10px] text-slate-400 dark:text-neutral-500 bg-slate-100 dark:bg-neutral-800 rounded-xl px-3 py-2 mt-1">
                        Model: ${modelInfo}
                    </div>
                    <button onclick="app.game.startStory(true)" class="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-500 active:scale-95 transition-transform">Try Again</button>
                    <button onclick="app.goHome()" class="px-4 py-1.5 rounded-xl text-[10px] font-bold text-slate-400 dark:text-neutral-500 bg-slate-100 dark:bg-neutral-800 active:scale-95 transition-transform">Back to Menu</button>
                </div>`;
            this.afterRender();
            return;
        }

        // Use the validated result data
        var cleanStory = result.story;
        this._currentStoryTranslation = result.translation || null;
        this.questions = result.questions;
        this.qIndex = 0;
        L('[Story] Generation complete,', this.questions.length, 'questions');

        // Save to RTDB
        var vocabIds = storyWordsObjs.map(function(w) { return w.id; }).filter(function(id) { return id !== undefined && id !== null; });
        var compositeKey = vocabIds.slice().sort(function(a,b) { return a - b; }).join('-');
        this._currentCompositeKey = compositeKey;
        this._currentStoryLang = lang;
        this._saveStoryToRTDB(cleanStory, this.questions, storyWordsObjs, lang).catch(function(e) { L('[Story] Save to RTDB error:', e); });

        // Show story with questions
        this._showStoryWithQuestions(cleanStory, lang);
        this._prefetchNext();
    }
});
