/* js/game_story.js — Story Mode: AI-generated stories using vocab words */
class Story extends GameMode {
    constructor(key) {
        super(key);
        this.storyWords = [];
        this.storyText = '';
        this.questions = [];   // array of { text, choices[], correct }
        this.qIndex = 0;       // which question the user is on
        this.phase = 'loading';
        this.streaming = false;
        this._prefetched = null; // { storyWords, storyPart, questions, lang, rawText, wordIds }
        this._prefetching = false;

        // Session progress
        this.storiesPerSession = 5;
        this.storyNum = 0;      // how many stories completed or in-progress (1-based during play)

        // RTDB story cache
        this._cachedStories = []; // fetched from RTDB at session start
        this._cachedIndex = 0;
        this._cacheLoaded = false;

        this.render();
    }

    render() {
        this.root.classList.remove('visible');
        this.answered = false;
        this.busy = false;

        if (!app.llm || !app.llm.available || !app.llm.hasModel) {
            this.root.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
                    <div class="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center">
                        <i class="ph-duotone ph-brain text-4xl text-slate-300 dark:text-neutral-600"></i>
                    </div>
                    <h2 class="text-lg font-black text-slate-700 dark:text-neutral-200">AI Not Connected</h2>
                    <p class="text-xs text-slate-500 dark:text-neutral-400 max-w-xs">Story Mode requires a connection to ollama4android. Open ollama4android, then reconnect from the main screen.</p>
                    <button onclick="app.goHome()" class="mt-2 px-6 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform">Back to Menu</button>
                </div>`;
            this.afterRender();
            return;
        }

        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full">
                <div id="story-header" class="shrink-0 px-2 pt-1 pb-2"></div>
                <div id="story-body" class="flex-1 overflow-y-auto px-3 pb-4 overscroll-contain touch-pan-y"></div>
                <div id="story-footer" class="shrink-0 px-3 pb-3"></div>
            </div>`;

        this.dom.header = document.getElementById('story-header');
        this.dom.body = document.getElementById('story-body');
        this.dom.footer = document.getElementById('story-footer');

        this._setupStoryHeader();
        this._loadCacheThenStart();
    }

    // Override parent — never show vocab pill in Story Mode
    setupHeader() { this._setupStoryHeader(); }

    // ── Story-specific header with session progress ────────────────

    _setupStoryHeader() {
        const num = this.storyNum || 1;
        const total = this.storiesPerSession;
        this.dom.header.innerHTML = `
            <div class="flex justify-between items-center mb-2 shrink-0 w-full px-1 min-h-[50px]">
                <div class="flex items-center bg-white dark:bg-neutral-800 rounded-full px-4 py-2 shadow-sm border border-slate-200 dark:border-neutral-700 mr-auto">
                    <i class="ph-duotone ph-book-open-text text-sm text-indigo-500 mr-2"></i>
                    <span id="story-progress" class="text-sm font-black text-indigo-600 dark:text-indigo-400">${num}</span>
                    <span class="text-[10px] font-bold text-slate-400 ml-1">/ ${total}</span>
                </div>
                <div class="flex items-center">
                    <div class="flex items-center gap-2 bg-slate-800 dark:bg-neutral-700 text-white rounded-full px-3 py-1.5 shadow-md text-[11px] font-bold border border-slate-700 mr-2">
                        <span class="text-slate-400">PTS</span>
                        <span class="score-display">${app.score}</span>
                    </div>
                    <button onclick="app.goHome()" class="w-9 h-9 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300">
                        <i class="ph-bold ph-x"></i>
                    </button>
                </div>
            </div>`;
        this.dom.headerScore = this.dom.header.querySelector('.score-display');
    }

    _updateProgress() {
        const el = document.getElementById('story-progress');
        if (el) el.textContent = this.storyNum;
    }

    // ── RTDB cache loading ─────────────────────────────────────────

    async _loadCacheThenStart() {
        // Try to load cached stories from RTDB for this language
        if (!this._cacheLoaded) {
            await this._loadCachedStories();
            this._cacheLoaded = true;
        }
        this.startStory();
    }

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
            console.log('[Story] Loaded', all.length, 'cached stories from RTDB');
        } catch (e) {
            console.warn('[Story] Cache load failed:', e.message);
        }
    }

    _nextCachedStory() {
        if (this._cachedIndex >= this._cachedStories.length) return null;
        const cached = this._cachedStories[this._cachedIndex];
        this._cachedIndex++;
        // Reconstruct storyWords from wordIds
        const words = (cached.wordIds || []).map(id => app.data.list.find(w => w.id === id)).filter(Boolean);
        if (words.length === 0 || !cached.questions || cached.questions.length === 0) return this._nextCachedStory(); // skip bad entries
        return {
            storyWords: words,
            storyPart: cached.storyText,
            questions: cached.questions,
            lang: cached.lang,
            fromCache: true
        };
    }

    // ── Main flow ──────────────────────────────────────────────────

    async startStory() {
        this.storyNum++;
        this._updateProgress();

        // Priority 1: prefetched story (already generated in background)
        if (this._prefetched) {
            console.log('[Story] Using prefetched story');
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

        // Priority 2: cached story from RTDB (instant, no AI wait)
        const cached = this._nextCachedStory();
        if (cached) {
            console.log('[Story] Serving cached story from RTDB');
            this.storyWords = cached.storyWords;
            this.questions = cached.questions;
            this.qIndex = 0;
            this._showStoryWithQuestions(cached.storyPart, cached.lang);
            this._prefetchNext();
            return;
        }

        // Priority 3: generate fresh story via AI
        this.phase = 'loading';
        this.storyText = '';
        this.questions = [];
        this.qIndex = 0;

        this.storyWords = await this._pickWords(4);
        const lang = this._getTargetLang();
        const langName = app.llm._getLangName(lang);
        const wordList = this.storyWords.map(w => w[lang] || w.ja || w.en).filter(Boolean);

        console.log('[Story] Picked words:', wordList, 'lang:', lang);

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

        const prompt = this._buildStoryPrompt(wordList, langName);

        try {
            await this._generateStory(prompt, lang);
        } catch (e) {
            console.error('[Story] Generation failed:', e);
            this.dom.body.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <i class="ph-duotone ph-warning text-4xl text-rose-400"></i>
                    <p class="text-sm font-bold text-slate-600 dark:text-neutral-300">Story generation failed</p>
                    <p class="text-xs text-slate-400">${e.message}</p>
                    <button onclick="app.game.render()" class="mt-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-500 active:scale-95 transition-transform">Try Again</button>
                </div>`;
        } finally {
            if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        }
    }

    // ── Streaming card — final UI from the start ───────────────────

    _showStreamingCard(wordList) {
        const startTime = Date.now();

        this.dom.body.innerHTML = `
            <div class="space-y-4 pb-2">
                <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-200 dark:border-neutral-700 shadow-sm">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="ph-duotone ph-book-open-text text-lg text-indigo-500"></i>
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Story</span>
                        <span id="story-elapsed" class="ml-auto text-[10px] text-slate-300 dark:text-neutral-600 font-mono">0s</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5 mb-3">
                        ${wordList.map(w => `<span class="inline-block bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full">${w}</span>`).join('')}
                    </div>
                    <div id="story-stream" class="text-base leading-relaxed text-slate-800 dark:text-neutral-100 whitespace-pre-wrap min-h-[60px] select-text"><span class="text-slate-300 dark:text-neutral-600 animate-pulse">|</span></div>
                </div>
                <div id="story-questions-area"></div>
            </div>`;

        this.dom.footer.innerHTML = `
            <div class="flex items-center gap-2 justify-center opacity-60">
                <i class="ph-bold ph-spinner animate-spin text-xs text-indigo-400"></i>
                <span id="story-status" class="text-[11px] font-bold text-slate-400">Writing story...</span>
            </div>`;

        this._elapsedTimer = setInterval(() => {
            const el = document.getElementById('story-elapsed');
            if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
        }, 1000);

        this.afterRender();
    }

    // ── Prompt ──────────────────────────────────────────────────────

    _buildStoryPrompt(words, langName) {
        const joined = words.join(', ');
        return `Write a very short story (3-5 sentences) in ${langName} using these words: ${joined}

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
    }

    // ── Generation (stream into the card) ──────────────────────────

    async _generateStory(prompt, lang) {
        console.log('[Story] _generateStory directHTTP:', app.llm.useDirectHTTP, 'bridge:', app.llm.useNativeBridge);

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
        let visibleText = '';
        let hitQuestionZone = false;
        let tokenCount = 0;
        this.streaming = true;

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
            if (tokenCount === 1) console.log('[Story] First token received');
        };

        // Use unified LLM streaming — direct HTTP preferred, bridge fallback
        fullText = await app.llm.streamGenerate({
            prompt,
            system: 'You are a language learning assistant. Write simple, clear text suitable for learners.'
        }, onToken);

        this.streaming = false;
        this.storyText = fullText;
        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        if (elapsedEl) elapsedEl.remove();
        console.log('[Story] Generation complete, tokens:', tokenCount, 'length:', fullText.length);

        this._parseAndShow(fullText, lang);
    }

    // ── Parsing ─────────────────────────────────────────────────────

    _parseAndShow(text, lang) {
        const storyPart = this._extractStory(text);
        this.questions = this._extractQuestions(text);
        this.qIndex = 0;

        console.log('[Story] Parsed', this.questions.length, 'questions');

        if (this.questions.length > 0) {
            // Transition in-place: update the streaming card rather than rebuilding
            this._transitionToQuestions(storyPart, lang);
            this._saveStoryToRTDB(storyPart, this.questions, this.storyWords, lang, text);
            this._prefetchNext();
        } else {
            this._showStoryOnly(storyPart);
        }
    }

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
    }

    _extractStory(text) {
        const storyMatch = text.match(/STORY:\s*([\s\S]*?)(?=\nQ[12][:\s]|\nQUESTION[:\s]|$)/i);
        return storyMatch ? storyMatch[1].trim() : text.split(/\nQ[12][:\s]/i)[0].replace(/^STORY:\s*/i, '').trim();
    }

    _extractQuestions(text) {
        const questions = [];
        const qBlocks = text.matchAll(/(?:Q\d|QUESTION)[:\s]\s*([\s\S]*?)ANSWER:\s*([A-D])/gi);
        for (const m of qBlocks) {
            const block = m[1].trim();
            const correctLetter = m[2].toUpperCase();
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) continue;

            const qText = lines[0];
            const choices = [];
            for (let i = 1; i < lines.length; i++) {
                const cm = lines[i].match(/^([A-D])\)\s*(.*)/);
                if (cm) choices.push({ letter: cm[1], text: cm[2] });
            }
            if (choices.length >= 2) {
                questions.push({ text: qText, choices, correct: correctLetter });
            }
        }
        return questions;
    }

    // ── Display: story + sequential questions ───────────────────────

    _showStoryWithQuestions(storyPart, lang) {
        this.phase = 'reading';
        const highlighted = this._highlightWords(storyPart);
        const total = this.questions.length;

        this.dom.body.innerHTML = `
            <div class="space-y-4 pb-2">
                <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-200 dark:border-neutral-700 shadow-sm">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="ph-duotone ph-book-open-text text-lg text-indigo-500"></i>
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Story</span>
                        <button id="story-speak-btn" onclick="app.game._readStory()" class="ml-auto w-8 h-8 rounded-full border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center active:scale-90 transition-all text-slate-500 dark:text-neutral-400 hover:text-indigo-500 hover:border-indigo-300">
                            <i class="ph-bold ph-speaker-high text-sm"></i>
                        </button>
                    </div>
                    <div id="story-stream" class="text-base leading-relaxed text-slate-800 dark:text-neutral-100 select-text">${highlighted}</div>
                </div>
                <div id="story-questions-area"></div>
            </div>`;

        this.dom.footer.innerHTML = `
            <button id="story-ready-btn" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-500 to-purple-500 active:scale-95 transition-transform shadow-lg">
                <i class="ph-bold ph-question mr-1"></i> Question 1 of ${total}
            </button>`;

        document.getElementById('story-ready-btn').onclick = () => this._showCurrentQuestion();
        this.afterRender();

        // Auto-read for cached/prefetched stories
        if (app.store.prefs.storyAutoRead !== false) {
            this._readStory(storyPart);
        }
    }

    _showCurrentQuestion() {
        if (this.qIndex >= this.questions.length) return;
        this.phase = 'question';
        this.answered = false;

        const q = this.questions[this.qIndex];
        const num = this.qIndex + 1;
        const total = this.questions.length;
        this.dom.footer.innerHTML = '';

        const area = document.getElementById('story-questions-area');
        area.innerHTML = '';

        const qSection = document.createElement('div');
        qSection.className = 'space-y-3';
        qSection.innerHTML = `
            <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-800/40">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Question ${num} of ${total}</span>
                </div>
                <p class="text-sm font-bold text-slate-800 dark:text-neutral-100 mb-3">${this.wrapHanzi(q.text)}</p>
                <div class="grid grid-cols-1 gap-2">
                    ${q.choices.map(c => `
                        <button data-letter="${c.letter}" class="story-choice text-left px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-bold text-slate-700 dark:text-neutral-200 active:scale-[0.98] transition-all">
                            <span class="text-indigo-500 font-black mr-2">${c.letter})</span> ${this.wrapHanzi(c.text)}
                        </button>`).join('')}
                </div>
            </div>`;

        area.appendChild(qSection);
        requestAnimationFrame(() => qSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));

        qSection.querySelectorAll('.story-choice').forEach(btn => {
            btn.onclick = () => this._checkAnswer(btn.dataset.letter, btn, q);
        });
    }

    _checkAnswer(letter, el, q) {
        if (this.answered) return;
        this.answered = true;

        const correct = letter === q.correct;
        const area = document.getElementById('story-questions-area');

        area.querySelectorAll('.story-choice').forEach(btn => {
            btn.classList.remove('border-slate-200', 'dark:border-neutral-700');
            if (btn.dataset.letter === q.correct) {
                btn.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-900/30');
            } else if (btn === el && !correct) {
                btn.classList.add('border-rose-500', 'bg-rose-50', 'dark:bg-rose-900/30');
            } else {
                btn.classList.add('border-slate-100', 'dark:border-neutral-800', 'opacity-50');
            }
            btn.onclick = null;
        });

        if (correct) {
            this.score(15);
            if (app.celebration) app.celebration.play();
        } else {
            this.miss();
        }

        this.qIndex++;
        const hasMore = this.qIndex < this.questions.length;

        if (hasMore) {
            const remaining = this.questions.length - this.qIndex;
            this.dom.footer.innerHTML = `
                <button id="story-next-q" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-500 to-purple-500 active:scale-95 transition-transform shadow-lg">
                    <i class="ph-bold ph-arrow-right mr-1"></i> Next Question (${remaining} left)
                </button>`;
            document.getElementById('story-next-q').onclick = () => this._showCurrentQuestion();
        } else {
            // Session complete?
            const sessionDone = this.storyNum >= this.storiesPerSession;
            if (sessionDone) {
                this.dom.footer.innerHTML = `
                    <div class="space-y-2">
                        <div class="text-center text-xs font-bold text-emerald-500 mb-1">
                            <i class="ph-bold ph-check-circle mr-1"></i> Session complete! ${this.storiesPerSession} stories finished
                        </div>
                        <button onclick="app.game._resetSession()" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-emerald-500 to-cyan-500 active:scale-95 transition-transform shadow-lg">
                            <i class="ph-bold ph-arrow-clockwise mr-1"></i> New Session
                        </button>
                    </div>`;
            } else {
                const prefetchReady = !!this._prefetched;
                const nextCached = this._cachedIndex < this._cachedStories.length;
                const instant = prefetchReady || nextCached;
                this.dom.footer.innerHTML = `
                    <button onclick="app.game._loadNext()" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">
                        <i class="ph-bold ph-arrow-right mr-1"></i> ${instant ? 'Next Story' : 'New Story'}
                    </button>`;
            }
        }
    }

    _resetSession() {
        this.storyNum = 0;
        this._prefetched = null;
        this._prefetching = false;
        this._loadNext();
    }

    _loadNext() {
        this.root.classList.remove('visible');
        this.answered = false;
        this.busy = false;
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full">
                <div id="story-header" class="shrink-0 px-2 pt-1 pb-2"></div>
                <div id="story-body" class="flex-1 overflow-y-auto px-3 pb-4 overscroll-contain touch-pan-y"></div>
                <div id="story-footer" class="shrink-0 px-3 pb-3"></div>
            </div>`;
        this.dom.header = document.getElementById('story-header');
        this.dom.body = document.getElementById('story-body');
        this.dom.footer = document.getElementById('story-footer');
        this._setupStoryHeader();
        this.startStory();
    }

    _showStoryOnly(storyPart) {
        const highlighted = this._highlightWords(storyPart);
        this.dom.body.innerHTML = `
            <div class="space-y-4 pb-2">
                <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-200 dark:border-neutral-700 shadow-sm">
                    <div class="text-base leading-relaxed text-slate-800 dark:text-neutral-100">${highlighted}</div>
                </div>
                <p class="text-xs text-center text-slate-400">Couldn't generate questions this time.</p>
            </div>`;
        this.dom.footer.innerHTML = `
            <button onclick="app.game._loadNext()" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">
                <i class="ph-bold ph-arrow-clockwise mr-1"></i> Try Again
            </button>`;
        this.afterRender();
    }

    // ── Prefetch next story in background ───────────────────────────

    async _prefetchNext() {
        if (this._prefetching) return;
        if (this.storyNum >= this.storiesPerSession) return; // don't prefetch past session end
        this._prefetching = true;
        console.log('[Story] Prefetching next story in background...');

        try {
            // Check if we can serve from cache instead of generating
            const cached = this._nextCachedStory();
            if (cached) {
                this._prefetched = cached;
                console.log('[Story] Prefetch served from RTDB cache');
                this._updateNextButton();
                return;
            }

            const words = await this._pickWords(4);
            const lang = this._getTargetLang();
            const langName = app.llm._getLangName(lang);
            const wordList = words.map(w => w[lang] || w.ja || w.en).filter(Boolean);
            if (wordList.length === 0) { this._prefetching = false; return; }

            const prompt = this._buildStoryPrompt(wordList, langName);
            let fullText = await app.llm.streamGenerate({
                prompt,
                system: 'You are a language learning assistant. Write simple, clear text suitable for learners.'
            });

            const storyPart = this._extractStory(fullText);
            const questions = this._extractQuestions(fullText);

            if (questions.length > 0) {
                this._prefetched = { storyWords: words, storyPart, questions, lang, rawText: fullText, wordIds: words.map(w => w.id) };
                console.log('[Story] Prefetch ready:', questions.length, 'questions');
                this._updateNextButton();
            }
        } catch (e) {
            console.warn('[Story] Prefetch failed:', e.message);
        } finally {
            this._prefetching = false;
        }
    }

    _updateNextButton() {
        if (this.qIndex >= this.questions.length && this._prefetched) {
            const btn = this.dom.footer?.querySelector('button');
            if (btn && btn.textContent.includes('New Story')) {
                btn.innerHTML = '<i class="ph-bold ph-arrow-right mr-1"></i> Next Story';
            }
        }
    }

    // ── Save story to RTDB ──────────────────────────────────────────

    async _saveStoryToRTDB(storyText, questions, words, lang, rawText) {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const wordIds = words.map(w => w.id).filter(Boolean);
            const entry = {
                storyText,
                questions,
                wordIds,
                lang,
                ts: firebase.database.ServerValue.TIMESTAMP
            };

            const ref = db.ref('stories').push();
            await ref.set(entry);
            console.log('[Story] Saved story to RTDB:', ref.key);
        } catch (e) {
            console.warn('[Story] RTDB save failed:', e.message);
        }
    }

    // ── TTS ─────────────────────────────────────────────────────────

    _addSpeakerButton(storyPart) {
        this._currentStoryText = storyPart;
        const header = this.dom.body.querySelector('.flex.items-center.gap-2.mb-3');
        if (!header || document.getElementById('story-speak-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'story-speak-btn';
        btn.className = 'ml-auto w-8 h-8 rounded-full border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center active:scale-90 transition-all text-slate-500 dark:text-neutral-400 hover:text-indigo-500 hover:border-indigo-300';
        btn.innerHTML = '<i class="ph-bold ph-speaker-high text-sm"></i>';
        btn.onclick = () => this._readStory();
        header.appendChild(btn);
    }

    _readStory(text) {
        const storyText = text || this._currentStoryText;
        if (!storyText || !app.audio) return;
        const lang = this._getTargetLang();
        app.audio.play(storyText, lang, null, 0);
        // Visual feedback on button
        const btn = document.getElementById('story-speak-btn');
        if (btn) {
            btn.classList.add('text-indigo-500', 'border-indigo-300');
            setTimeout(() => btn.classList.remove('text-indigo-500', 'border-indigo-300'), 1500);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    _highlightWords(text) {
        const lang = this._getTargetLang();
        // Highlight on plain text FIRST, then wrap hanzi
        // (reverse order would break mark tags inside hanzi spans)
        let html = text;
        for (const w of this.storyWords) {
            const word = w[lang] || w.ja || '';
            if (!word) continue;
            const variants = word.split(/[·・,;、\/|]/).map(s => s.trim()).filter(Boolean);
            for (const v of variants) {
                const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(escaped, 'g');
                html = html.replace(re, `<mark class="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-0.5 rounded font-bold">${v}</mark>`);
            }
        }
        // Now wrap hanzi characters that aren't already inside mark tags
        return this.wrapHanzi(html);
    }

    async _pickWords(count) {
        const list = app.data.list;
        if (!list || list.length === 0) return [];

        let weak = [];
        if (app.analytics) {
            try {
                const missed = await app.analytics.getMostMissedWords(count * 2);
                weak = missed.filter(m => m.vocab).map(m => m.vocab);
            } catch (e) {}
        }

        const picked = [];
        const usedIds = new Set();

        for (const w of weak) {
            if (picked.length >= count) break;
            if (!usedIds.has(w.id)) { picked.push(w); usedIds.add(w.id); }
        }

        let safety = 0;
        while (picked.length < count && safety < 50) {
            const r = app.data.rand();
            if (!usedIds.has(r.id) && r.id !== undefined) { picked.push(r); usedIds.add(r.id); }
            safety++;
        }
        return picked;
    }

    _getTargetLang() {
        return app.store.prefs.sentencesQ || 'ja';
    }

    destroy() {
        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        super.destroy();
    }

    nav(d) {
        if (this.streaming) return;
        this._loadNext();
    }

    triggerAction(action) {
        if (action === 'next' || action === 'up') this.nav(1);
    }

    update() { this.render(); }
}
