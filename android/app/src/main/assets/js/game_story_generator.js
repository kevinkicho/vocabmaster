// Extracted Generator methods for Story mode
Object.assign(Story.prototype, {

// --- Main flow ---
async startStory(forceAnew = false) {
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
                this._showStoryWithQuestions(cached.storyPart, cached.lang);
                return;
            }

            L('[Story] AI offline and no cache, using local fallback');
            this.storyWords = await this._pickWords(4);
            const lang = this._getTargetLang();
            const langName = (app.llm && app.llm._getLangName) ? app.llm._getLangName(lang) : lang;
            const wordList = this.storyWords.map(w => w[lang]).filter(Boolean);

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

            const fallback = window.StoryFallback.generate(wordList, lang);
            this.questions = fallback.questions;
            this.qIndex = 0;
            this._showStoryWithQuestions(fallback.storyPart, lang, true);
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
                this._showStoryWithQuestions(p.storyPart, p.lang);
                if (!p.fromCache) this._saveStoryToRTDB(p.storyPart, p.questions, p.storyWords, p.lang, p.rawText).catch(e => L('[Story] Save to RTDB error:', e));
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

        this.storyWords = await this._pickWords(4);
        const lang = this._getTargetLang();
        const langName = app.llm._getLangName(lang);
        const wordList = this.storyWords.map(w => w[lang]).filter(Boolean);
        const storyLevel = this.storyWords.map(w => w.level).find(Boolean) || null;

        L('[Story] Picked words:', wordList, 'lang:', lang, 'level:', storyLevel);

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

        // Show the story card shell immediately — stream tokens into it
        this._showStreamingCard(wordList);

        try {
            await this._generateStory(this.storyWords, wordList, langName, storyLevel, lang);
        } catch (e) {
            const llmInfo = app.llm ? { endpoint: app.llm.endpoint, resolvedModel: app.llm.resolvedModel, useCloud: app.llm.useCloud, available: app.llm.available, hasModel: app.llm.hasModel } : null;
            L('[Story] Generation failed:', e, 'llm:', llmInfo, 'wordList:', wordList, 'lang:', lang);
            if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});
            
            L('[Story] Fallback triggered due to generation failure');
            if (this._elapsedTimer) clearInterval(this._elapsedTimer);
            const fallback = window.StoryFallback.generate(wordList, lang);
            this.questions = fallback.questions;
            this.qIndex = 0;
            this._showStoryWithQuestions(fallback.storyPart, lang, true);
        } finally {
            if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        }
    },

// --- Generation (Phase 1: Story, Phase 2: Questions) ---
async _generateStory(storyWordsObjs, wordList, langName, storyLevel, lang) {
        L('[Story] _generateStory directHTTP:', app.llm.useDirectHTTP);

        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        this.phase = 'reading';

        const streamEl = document.getElementById('story-stream');
        const statusEl = document.getElementById('story-status');
        const elapsedEl = document.getElementById('story-elapsed');
        const startTime = Date.now();

        this._elapsedTimer = setInterval(() => {
            if (elapsedEl) elapsedEl.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
        }, 1000);

        let storyText = '';
        let attempt = 0;
        let maxRetries = 2;
        let validationResult = { valid: false };

        const joined = wordList.join(', ');
        let levelInstruction = '';
        if (storyLevel) {
            const diffMap = (typeof LLMService !== 'undefined' && LLMService.LEVEL_DIFFICULTY_MAP) ? LLMService.LEVEL_DIFFICULTY_MAP : {};
            const difficulty = diffMap[storyLevel];
            if (difficulty) {
                levelInstruction = `\nThe learner's proficiency level is ${difficulty}. Adjust vocabulary complexity and grammar accordingly — use simpler structures for lower levels and more natural, nuanced expressions for higher levels.`;
            }
        }

        const storyPrompt = `Write a short story (3-5 sentences) in ${langName} using exactly these words: ${joined}${levelInstruction}\n\nDo not include any questions or translations, just write the story text directly.`;

        while (attempt <= maxRetries && !validationResult.valid) {
            attempt++;
            storyText = '';
            this.streaming = true;

            if (streamEl && attempt > 1) streamEl.textContent = `Generating story... (Attempt ${attempt})`;
            if (statusEl) {
                statusEl.textContent = attempt > 1 ? 'Retrying story...' : 'Writing story...';
                statusEl.classList.replace('text-slate-400', 'text-purple-400');
            }

            const onToken = (token) => {
                if (this._destroyed) return;
                storyText += token;
                if (streamEl) {
                    streamEl.textContent = storyText.replace(/^STORY:\s*/i, '').trim();
                    if (this.dom.body) this.dom.body.scrollTop = this.dom.body.scrollHeight;
                }
            };

            let genPrompt = storyPrompt;
            if (attempt > 1 && validationResult.error) {
                genPrompt = storyPrompt + `\n\nCRITICAL INSTRUCTION: ${validationResult.error}. You MUST write 3-5 sentences and you MUST include the provided words.`;
            }

            try {
                await app.llm.streamGenerate({
                    prompt: genPrompt,
                    system: 'You are a language learning assistant. Write simple, clear text suitable for learners.',
                    options: { num_predict: 512, temperature: 0.7 }
                }, onToken);
            } catch (e) {
                L('[Story] streamGenerate story error:', e);
                this._swapModelIfNeeded();
            }

            if (this._destroyed) return;

            if (storyText.trim().length < 5) this._swapModelIfNeeded();

            validationResult = this._validateStoryOnly(storyText, storyWordsObjs, lang);
            if (!validationResult.valid) {
                L(`[Story] Story validation failed on attempt ${attempt}:`, validationResult.error);
                if (attempt > maxRetries) throw new Error(validationResult.error);
            }
        }

        this.streaming = false;
        const cleanStory = storyText.replace(/^STORY:\s*/i, '').trim();
        L('[Story] Story generation complete. Length:', cleanStory.length);

        if (statusEl) {
            statusEl.textContent = 'Generating questions...';
            statusEl.classList.replace('text-slate-400', 'text-purple-400');
        }

        // At this point, the story is on screen. The user can start reading it.
        this._transitionToQuestionsLoading(cleanStory);

        // Phase 2: Generate Questions
        const qPrompt = `Based on the following story, write 2 comprehension questions in ${langName}.\nEach question MUST have 4 answer choices (A, B, C, D) and you MUST mark the correct answer with "ANSWER: X".\n\nStory:\n"${cleanStory}"\n\nFormat exactly like this:\nQ1:\n(question text)\nA) ...\nB) ...\nC) ...\nD) ...\nANSWER: (letter)\n\nQ2:\n(question text)\nA) ...\nB) ...\nC) ...\nD) ...\nANSWER: (letter)`;
        
        let qText = '';
        try {
            qText = await app.llm.generate({
                prompt: qPrompt,
                system: 'You are a language learning assistant.',
                options: { num_predict: 512, temperature: 0.5 }
            });
        } catch(e) {
            L('[Story] Background question generation failed:', e);
        }

        this.questions = this._extractQuestions(qText);
        
        if (this.questions.length === 0) {
            L('[Story] LLM failed to format questions. Falling back to generic questions.');
            const fallback = window.StoryFallback.generate(wordList, lang);
            this.questions = fallback.questions || [
                {
                    text: `What is the main topic of the story?`,
                    choices: [
                        { letter: 'A', text: wordList[0] || 'Unknown' },
                        { letter: 'B', text: wordList[1] || 'Unknown' },
                        { letter: 'C', text: wordList[2] || 'Unknown' },
                        { letter: 'D', text: wordList[3] || 'Unknown' }
                    ],
                    correct: 'A'
                },
                {
                    text: `Did you understand this story?`,
                    choices: [
                        { letter: 'A', text: 'Yes, completely' },
                        { letter: 'B', text: 'Mostly' },
                        { letter: 'C', text: 'A little bit' },
                        { letter: 'D', text: 'Not at all' }
                    ],
                    correct: 'A'
                }
            ];
        }

        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        if (elapsedEl) elapsedEl.remove();

        this.qIndex = 0;
        L('[Story] Parsed', this.questions.length, 'questions');
        
        // Ensure UI updates the footer "Question 1 of N"
        const btn = document.getElementById('story-ready-btn');
        if (btn) {
            btn.innerHTML = `<i class="ph-bold ph-question mr-1"></i> Question 1 of ${this.questions.length}`;
            btn.disabled = false;
            btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse');
        }

        this._saveStoryToRTDB(cleanStory, this.questions, storyWordsObjs, lang, storyText + '\\n\\n' + qText).catch(e => L('[Story] Save to RTDB error:', e));
        this._prefetchNext();
    },

    _swapModelIfNeeded() {
        const cands = (app.llm && app.llm.availableModels) || [];
        if (cands.length > 1) {
            const current = app.llm.resolvedModel;
            const next = cands.find(m => m !== current);
            if (next) {
                L('[Story] Swapping to next model:', next);
                app.llm.resolvedModel = next;
            }
        }
    },

    _validateStoryOnly(fullText, targetWords, lang) {
        let storyPart = fullText.replace(/^STORY:\s*/i, '').trim();
        const sentences = storyPart.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length < 2) {
            return { valid: false, error: 'Story is too short. It must be at least 3 sentences long.' };
        }

        const missing = [];
        const lowerStory = storyPart.toLowerCase();
        for (const vocab of targetWords) {
            const w = (vocab[lang] || vocab.word || vocab.id || '').toLowerCase().trim();
            if (!w) continue;
            const root = w.length > 5 ? w.substring(0, 5) : w;
            if (!lowerStory.includes(root)) {
                missing.push(w);
            }
        }

        if (missing.length > 1) {
            return { valid: false, error: `Story failed to use target vocabulary. Missing: ${missing.join(', ')}` };
        }

        return { valid: true };
    },

    _transitionToQuestionsLoading(storyPart) {
        this.phase = 'reading';
        const streamEl = document.getElementById('story-stream');

        if (streamEl) {
            streamEl.innerHTML = this._highlightWords(storyPart);
            streamEl.classList.remove('whitespace-pre-wrap');
        }

        const pills = this.dom.body.querySelector('.flex.flex-wrap.gap-1\\\\.5');
        if (pills) pills.remove();

        this._addSpeakerButton(storyPart);

        this.dom.footer.innerHTML = `
            <button id="story-ready-btn" disabled class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg opacity-70 cursor-not-allowed animate-pulse transition-all">
                <i class="ph-bold ph-spinner animate-spin mr-1"></i> Generating questions...
            </button>`;

        document.getElementById('story-ready-btn').onclick = () => {
            if (!document.getElementById('story-ready-btn').disabled) this._showCurrentQuestion();
        };
        this.afterRender();

        if (app.store.prefs.storyAutoRead !== false) {
            this._readStory(storyPart);
        }
    },

    _extractQuestions(text) {
        if (!text) return [];
        const questions = [];
        const qBlocks = text.matchAll(/(?:Q\d|QUESTION|PERGUNTA|PREGUNTA|QUESTIONS?|1\.|2\.)[:\s]*([\s\S]*?)(?:ANSWER|RESPUESTA|RESPOSTA|CORRECT(?: ANSWER)?|A|SOLUTION|ANS)[:\s]*\*?([A-D])\*?/gi);
        
        for (const m of qBlocks) {
            const block = m[1].trim();
            const correctLetter = m[2].toUpperCase();
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) continue;

            const qText = lines[0];
            const choices = [];
            for (let i = 1; i < lines.length; i++) {
                const cm = lines[i].match(/^([A-D])\s*[)\.\:\-]\s*(.*)/i);
                if (cm) choices.push({ letter: cm[1].toUpperCase(), text: cm[2] });
            }
            if (choices.length >= 2) {
                questions.push({ text: qText, choices, correct: correctLetter });
            }
        }
        return questions;
    }
});
