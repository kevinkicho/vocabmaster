// Extracted Generator methods for Story mode
Object.assign(Story.prototype, {

// --- Main flow ---
async startStory() {
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

        // Priority 1: prefetched story (already generated in background via AI)
        if (this._prefetched) {
            L('[Story] Using prefetched story');
            const p = this._prefetched;
            this._prefetched = null;
            this.storyWords = p.storyWords;
            this.questions = p.questions;
            this.qIndex = 0;
            this._showStoryWithQuestions(p.storyPart, p.lang);
            if (!p.fromCache) this._saveStoryToRTDB(p.storyPart, p.questions, p.storyWords, p.lang, p.rawText);
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

        const prompt = this._buildStoryPrompt(wordList, langName, storyLevel);

        try {
            await this._generateStory(prompt, lang);
        } catch (e) {
            const llmInfo = app.llm ? { endpoint: app.llm.endpoint, resolvedModel: app.llm.resolvedModel, useCloud: app.llm.useCloud, available: app.llm.available, hasModel: app.llm.hasModel } : null;
            L('[Story] Generation failed:', e, 'llm:', llmInfo, 'wordList:', wordList, 'lang:', lang);
            // Force a remote log push so the detailed llmInfo + stack is immediately available in RTDB for analysis
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

// --- Prompt ---
_buildStoryPrompt(words, langName, level) {
        const joined = words.join(', ');
        let levelInstruction = '';
        if (level) {
            const diffMap = (typeof LLMService !== 'undefined' && LLMService.LEVEL_DIFFICULTY_MAP) ? LLMService.LEVEL_DIFFICULTY_MAP : {};
            const difficulty = diffMap[level];
            if (difficulty) {
                levelInstruction = `\nThe learner's proficiency level is ${difficulty}. Adjust vocabulary complexity and grammar accordingly — use simpler structures for lower levels and more natural, nuanced expressions for higher levels.`;
            }
        }
        return `Write a very short story (3-5 sentences) in ${langName} using these words: ${joined}${levelInstruction}

After the story, write 2 comprehension questions, each with 4 answer choices (A, B, C, D) and mark the correct answer.

Format exactly like this:
STORY:
(story text here)

Q1:
(question text in ${langName})
A) ...
B) ...
C) ...
D) ...
ANSWER: (letter)

Q2:
(question text in ${langName})
A) ...
B) ...
C) ...
D) ...
ANSWER: (letter)`;
    },

    _validateStoryOutput(fullText, targetWords) {
        const hasProperFormat = fullText.includes('ANSWER:') && (fullText.includes('Q1:') || fullText.includes('Q2:'));
        if (!hasProperFormat || fullText.trim().length < 10) {
            return { valid: false, error: 'AI failed to generate a valid story and questions format. Must include Q1: and ANSWER: format.' };
        }

        let storyPart = fullText;
        const cutPoint = fullText.search(/\nQ1[:\s]|\nQUESTION[:\s]/i);
        if (cutPoint !== -1) {
            storyPart = fullText.substring(0, cutPoint);
        }
        storyPart = storyPart.replace(/^STORY:\s*/i, '').trim();

        const sentences = storyPart.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length < 2) {
            return { valid: false, error: 'Story is too short. It must be at least 3-5 sentences long.' };
        }

        const missing = [];
        const lowerStory = storyPart.toLowerCase();
        for (const vocab of targetWords) {
            const w = (vocab.word || '').toLowerCase().trim();
            if (!w) continue;
            // Root matching for conjugated verbs
            const root = w.length > 5 ? w.substring(0, 5) : w;
            if (!lowerStory.includes(root)) {
                missing.push(w);
            }
        }

        // Require at least 3 out of 4 words to match (lenient for conjugated phrases like 'estar ansioso')
        if (missing.length > 1) {
            return { valid: false, error: `Story failed to use target vocabulary. Missing: ${missing.join(', ')}` };
        }

        return { valid: true };
    },

// --- Generation (stream into the card) ---
async _generateStory(prompt, lang) {
        L('[Story] _generateStory directHTTP:', app.llm.useDirectHTTP, 'bridge:', app.llm.useNativeBridge);

        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        this.phase = 'reading';

        const streamEl = document.getElementById('story-stream');
        const statusEl = document.getElementById('story-status');
        const elapsedEl = document.getElementById('story-elapsed');
        const startTime = Date.now();

        this._elapsedTimer = setInterval(() => {
            if (elapsedEl) elapsedEl.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
        }, 1000);

        let fullText = '';
        let tokenCount = 0;
        let attempt = 0;
        let maxRetries = 3;
        let validationResult = { valid: false };

        while (attempt <= maxRetries && !validationResult.valid) {
            attempt++;
            fullText = '';
            let visibleText = '';
            let hitQuestionZone = false;
            tokenCount = 0;
            this.streaming = true;

            if (streamEl && attempt > 1) streamEl.textContent = `Generating... (Attempt ${attempt})`;
            if (statusEl && attempt > 1) {
                statusEl.textContent = 'Retrying story generation...';
                statusEl.classList.replace('text-purple-400', 'text-slate-400');
            }

            const onToken = (token) => {
                tokenCount++;
                fullText += token;

                if (!hitQuestionZone) {
                    if (/\nQ1[:\s]/.test(fullText) || /\nQUESTION[:\s]/i.test(fullText)) {
                        hitQuestionZone = true;
                        const cutPoint = fullText.search(/\nQ1[:\s]|\nQUESTION[:\s]/i);
                        visibleText = fullText.substring(0, cutPoint).replace(/^STORY:\s*/i, '').trim();
                        if (streamEl) streamEl.textContent = visibleText;
                        if (statusEl) {
                            statusEl.textContent = 'Generating questions...';
                            statusEl.classList.replace('text-slate-400', 'text-purple-400');
                        }
                    } else {
                        visibleText = fullText.replace(/^STORY:\s*/i, '').trim();
                        if (streamEl) streamEl.textContent = visibleText;
                        this.dom.body.scrollTop = this.dom.body.scrollHeight;
                    }
                }
                if (tokenCount === 1) L(`[Story] First token received (Attempt ${attempt})`);
            };

            let genPrompt = prompt;
            if (attempt > 1 && validationResult.error) {
                genPrompt = prompt + `\n\nCRITICAL INSTRUCTION: ${validationResult.error}. You MUST write 3-5 sentences and you MUST include the provided words.`;
                L(`[Story] Retry ${attempt} prompt adjusted due to validation failure.`);
            }

            try {
                await app.llm.streamGenerate({
                    prompt: genPrompt,
                    system: 'You are a language learning assistant. Write simple, clear text suitable for learners.',
                    options: { num_predict: 1024, temperature: 0.7 }
                }, onToken);
            } catch (e) {
                L('[Story] streamGenerate error:', e);
                if (app.llm && !app.llm.useCloud) {
                    L('[Story] streamGenerate failed. Swapping local model for next retry.');
                    const cands = app.llm._getLocalCandidates ? app.llm._getLocalCandidates() : [];
                    const current = app.llm.resolvedModel;
                    const next = cands.find(m => m !== current) || 'gemma';
                    app.llm.resolvedModel = next;
                }
            }

            if (fullText.trim().length < 5 && app.llm && !app.llm.useCloud) {
                L('[Story] 0-length response, swapping local model for next retry.');
                const cands = app.llm._getLocalCandidates ? app.llm._getLocalCandidates() : [];
                const current = app.llm.resolvedModel;
                const next = cands.find(m => m !== current) || 'gemma';
                app.llm.resolvedModel = next;
            }

            validationResult = this._validateStoryOutput(fullText, this.storyWords);
            if (!validationResult.valid) {
                L(`[Story] Validation failed on attempt ${attempt}:`, validationResult.error);
                if (attempt >= maxRetries) {
                    throw new Error(validationResult.error);
                }
            }
        }

        this.streaming = false;
        this.storyText = fullText;
        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        if (elapsedEl) elapsedEl.remove();
        L('[Story] Generation complete, tokens:', tokenCount, 'length:', fullText.length);

        this._parseAndShow(fullText, lang);
    },

// --- Parsing ---
_parseAndShow(text, lang) {
        const storyPart = this._extractStory(text);
        this.questions = this._extractQuestions(text);
        this.qIndex = 0;

        L('[Story] Parsed', this.questions.length, 'questions');

        if (this.questions.length > 0) {
            // Transition in-place: update the streaming card rather than rebuilding
            this._transitionToQuestions(storyPart, lang);
            this._saveStoryToRTDB(storyPart, this.questions, this.storyWords, lang, text);
            this._prefetchNext();
        } else {
            // 0 questions parsed from model output. Since AI is mandatory, this is a failure.
            const modelUsed = (app.llm && (app.llm.resolvedModel || app.llm.model)) || 'unknown';
            L('[Story] 0 questions after generation. modelUsed=', modelUsed, 'fullTextLen=', (text || '').length, 'rawPrefix=', (text || '').slice(0, 200));
            if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});

            L('[Story] Fallback triggered due to 0 questions parsed from AI');
            const langName = (app.llm && app.llm._getLangName) ? app.llm._getLangName(lang) : lang;
            const wordList = this.storyWords.map(w => w[lang]).filter(Boolean);
            const fallback = window.StoryFallback.generate(wordList, lang);
            this.questions = fallback.questions;
            this.qIndex = 0;
            this._showStoryWithQuestions(fallback.storyPart, lang, true);
        }
    },

    // Smooth in-place transition: replace streamed text with highlighted version
    _transitionToQuestions(storyPart, lang) {
        this.phase = 'reading';
        const streamEl = document.getElementById('story-stream');
        const total = this.questions.length;

        if (streamEl) {
            streamEl.innerHTML = this._highlightWords(storyPart);
            streamEl.classList.remove('whitespace-pre-wrap');
        }

        // Remove word pills (they served as loading context, now the story speaks for itself)
        const pills = this.dom.body.querySelector('.flex.flex-wrap.gap-1\\.5');
        if (pills) pills.remove();

        // Remove elapsed timer if still present
        const elapsed = document.getElementById('story-elapsed');
        if (elapsed) elapsed.remove();

        // Add TTS button
        this._addSpeakerButton(storyPart);

        // Show question button in footer
        this.dom.footer.innerHTML = `
            <button id="story-ready-btn" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-500 to-purple-500 active:scale-95 transition-transform shadow-lg">
                <i class="ph-bold ph-question mr-1"></i> Question 1 of ${total}
            </button>`;

        document.getElementById('story-ready-btn').onclick = () => this._showCurrentQuestion();
        this.afterRender();

        // Auto-read story aloud
        if (app.store.prefs.storyAutoRead !== false) {
            this._readStory(storyPart);
        }
    },

    _extractStory(text) {
        const storyMatch = text.match(/STORY:\s*([\s\S]*?)(?=\nQ[12][:\s]|\nQUESTION[:\s]|$)/i);
        return storyMatch ? storyMatch[1].trim() : text.split(/\nQ[12][:\s]/i)[0].replace(/^STORY:\s*/i, '').trim();
    },

    _extractQuestions(text) {
        const questions = [];
        const qBlocks = text.matchAll(/(?:Q\d|QUESTION)[:\s]\s*([\s\S]*?)(?:ANSWER|CORRECT(?: ANSWER)?|A)[:\s]*\*?([A-D])\*?/gi);
        for (const m of qBlocks) {
            const block = m[1].trim();
            const correctLetter = m[2].toUpperCase();
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) continue;

            const qText = lines[0];
            const choices = [];
            for (let i = 1; i < lines.length; i++) {
                const cm = lines[i].match(/^([A-D])\s*[\)\.\:\-]\s*(.*)/i);
                if (cm) choices.push({ letter: cm[1].toUpperCase(), text: cm[2] });
            }
            if (choices.length >= 2) {
                questions.push({ text: qText, choices, correct: correctLetter });
            }
        }
        return questions;
    }
});
