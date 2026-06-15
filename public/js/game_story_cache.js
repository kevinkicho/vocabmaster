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
            const lang = this._getTargetLang();
            const snap = await db.ref('stories')
                .orderByChild('lang')
                .equalTo(lang)
                .limitToLast(50)
                .once('value');
            if (!snap.exists()) return;

            const all = [];
            snap.forEach(child => {
                const v = child.val();
                v._key = child.key;
                all.push(v);
            });

            // Shuffle so user doesn't always see the same order
            for (let i = all.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [all[i], all[j]] = [all[j], all[i]];
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
        // Reconstruct storyWords from wordIds
        const words = (cached.wordIds || []).map(id => app.data.list.find(w => w.id === id)).filter(Boolean);
        if (words.length === 0 || !cached.questions || cached.questions.length === 0) return this._nextCachedStory(); // skip bad entries
        // Shuffle question order so the same cached story feels fresh on replay.
        // Also shuffle the choices within each question (correct letter stays the same since the
        // choice object itself carries its letter — we just reorder the array).
        const shuffledQuestions = (cached.questions || [])
            .map(q => ({ q, k: Math.random() }))
            .sort((a, b) => a.k - b.k)
            .map(({ q }) => ({
                ...q,
                choices: (q.choices || [])
                    .map(c => ({ c, k: Math.random() }))
                    .sort((a, b) => a.k - b.k)
                    .map(({ c }) => c)
            }));
        return {
            storyWords: words,
            storyPart: cached.storyText,
            questions: shuffledQuestions,
            lang: cached.lang,
            fromCache: true
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
            const langName = app.llm._getLangName(lang);
            const wordList = words.map(w => w[lang]).filter(Boolean);
            const storyLevel = words.map(w => w.level).find(Boolean) || null;
            if (wordList.length === 0) { this._prefetching = false; return; }

            const joined = wordList.join(', ');
            let levelInstruction = '';
            if (storyLevel) {
                const diffMap = (typeof LLMService !== 'undefined' && LLMService.LEVEL_DIFFICULTY_MAP) ? LLMService.LEVEL_DIFFICULTY_MAP : {};
                const difficulty = diffMap[storyLevel];
                if (difficulty) {
                    levelInstruction = `\nThe learner's proficiency level is ${difficulty}. Adjust vocabulary complexity and grammar accordingly — use simpler structures for lower levels and more natural, nuanced expressions for higher levels.`;
                }
            }
            const prompt = `Write a short story (3-5 sentences) in ${langName} using exactly these words: ${joined}${levelInstruction}\n\nDo not include any questions or translations, just write the story text directly.`;

            let fullText = await app.llm.streamGenerate({
                prompt,
                system: 'You are a language learning assistant. Write simple, clear text suitable for learners.'
            });

            const storyPart = this._extractStory(fullText);
            
            const qPrompt = `Based on the following story, write 2 comprehension questions in ${langName}.\nEach question MUST have 4 answer choices (A, B, C, D) and you MUST mark the correct answer with "ANSWER: X".\n\nStory:\n"${storyPart}"\n\nFormat exactly like this:\nQ1:\n(question text)\nA) ...\nB) ...\nC) ...\nD) ...\nANSWER: (letter)\n\nQ2:\n(question text)\nA) ...\nB) ...\nC) ...\nD) ...\nANSWER: (letter)`;
            let qText = '';
            try {
                qText = await app.llm.generate({
                    prompt: qPrompt,
                    system: 'You are a language learning assistant.',
                    options: { num_predict: 512, temperature: 0.5 }
                });
            } catch(e) {
                L('[Story] Prefetch question generation failed:', e);
            }

            const questions = this._extractQuestions(qText);

            if (questions.length > 0) {
                this._prefetched = { storyWords: words, storyPart, questions, lang, rawText: fullText + '\n\n' + qText, wordIds: words.map(w => w.id) };
                L('[Story] Prefetch ready:', questions.length, 'questions');
                this._updateNextButton();
            } else {
                L('[Story] Prefetch failed to extract questions.');
            }
        } catch (e) {
            const llmInfo = app.llm ? { endpoint: app.llm.endpoint, resolvedModel: app.llm.resolvedModel, useCloud: app.llm.useCloud } : null;
            L('[Story] Prefetch failed:', e, 'llm:', llmInfo);
            if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});
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
async _saveStoryToRTDB(storyText, questions, words, lang, rawText) {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const wordIds = words.map(w => w.id).filter(id => id !== undefined && id !== null);
            const entry = {
                storyText,
                questions: questions && questions.length > 0 ? questions : [{
                    text: 'Did you understand the story?',
                    choices: [
                        { letter: 'A', text: 'Yes' },
                        { letter: 'B', text: 'No' }
                    ],
                    correct: 'A'
                }],
                wordIds,
                lang,
                ts: firebase.database.ServerValue.TIMESTAMP
            };

            const ref = db.ref('stories').push();
            await ref.set(entry);
            L('[Story] Saved story to RTDB:', ref.key);
        } catch (e) {
            L('[Story] RTDB save failed:', e.message);
        }
    }
});
