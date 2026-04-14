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
        this._prefetched = null; // { storyWords, storyPart, questions, lang }
        this._prefetching = false;
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
                <div id="story-body" class="flex-1 overflow-y-auto px-3 pb-4"></div>
                <div id="story-footer" class="shrink-0 px-3 pb-3"></div>
            </div>`;

        this.dom.header = document.getElementById('story-header');
        this.dom.body = document.getElementById('story-body');
        this.dom.footer = document.getElementById('story-footer');
        this.setupHeader({ showDice: false });

        this.startStory();
    }

    // ── Main flow ──────────────────────────────────────────────────

    async startStory() {
        // If we have a prefetched story ready, use it instantly
        if (this._prefetched) {
            console.log('[Story] Using prefetched story');
            const p = this._prefetched;
            this._prefetched = null;
            this.storyWords = p.storyWords;
            this.questions = p.questions;
            this.qIndex = 0;
            this._showStoryWithQuestions(p.storyPart, p.lang);
            this._prefetchNext(); // start prefetching the one after
            return;
        }

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

        // Loading UI with word pills + elapsed timer
        const startTime = Date.now();
        this.dom.body.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full gap-4">
                <div class="flex flex-wrap justify-center gap-2 mb-2">
                    ${wordList.map(w => `<span class="inline-block bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-bold px-3 py-1.5 rounded-full">${w}</span>`).join('')}
                </div>
                <div class="flex items-center gap-2">
                    <i class="ph-bold ph-spinner animate-spin text-indigo-500"></i>
                    <span class="text-xs font-bold text-slate-500 dark:text-neutral-400">Gemma is writing a story...</span>
                </div>
                <span id="story-elapsed" class="text-[10px] text-slate-300 dark:text-neutral-600 font-mono">0s</span>
            </div>`;
        this.afterRender();

        this._elapsedTimer = setInterval(() => {
            const el = document.getElementById('story-elapsed');
            if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
        }, 1000);

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

    // ── Generation (stream story portion only, buffer questions) ────

    async _generateStory(prompt, lang) {
        const model = app.llm.resolvedModel || app.llm.model;
        console.log('[Story] _generateStory model:', model, 'bridge:', app.llm.useNativeBridge);

        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        this.phase = 'reading';

        // Streaming display — only shows story text
        this.dom.body.innerHTML = `
            <div class="space-y-4">
                <div id="story-stream" class="text-base leading-relaxed text-slate-800 dark:text-neutral-100 whitespace-pre-wrap min-h-[100px]"><span class="text-slate-300 dark:text-neutral-600 animate-pulse">|</span></div>
            </div>`;
        this.dom.footer.innerHTML = `
            <div class="flex items-center gap-2 justify-center opacity-60">
                <i class="ph-bold ph-spinner animate-spin text-xs text-indigo-400"></i>
                <span class="text-[11px] font-bold text-slate-400">Streaming from Gemma...</span>
            </div>`;

        const streamEl = document.getElementById('story-stream');
        let fullText = '';
        let visibleText = '';
        let hitQuestionZone = false;
        let tokenCount = 0;
        this.streaming = true;

        const onToken = (token) => {
            tokenCount++;
            fullText += token;

            // Only show text up to the first question marker
            if (!hitQuestionZone) {
                // Check if we just entered the question zone
                if (/\nQ1[:\s]/.test(fullText) || /\nQUESTION[:\s]/i.test(fullText)) {
                    hitQuestionZone = true;
                    // Extract just the story part for display
                    const cutPoint = fullText.search(/\nQ1[:\s]|\nQUESTION[:\s]/i);
                    visibleText = fullText.substring(0, cutPoint).replace(/^STORY:\s*/i, '').trim();
                    if (streamEl) streamEl.textContent = visibleText;
                    // Update footer to show we're generating questions now
                    this.dom.footer.innerHTML = `
                        <div class="flex items-center gap-2 justify-center opacity-60">
                            <i class="ph-bold ph-spinner animate-spin text-xs text-purple-400"></i>
                            <span class="text-[11px] font-bold text-slate-400">Generating questions...</span>
                        </div>`;
                } else {
                    // Still in story zone — show everything (strip STORY: prefix)
                    visibleText = fullText.replace(/^STORY:\s*/i, '').trim();
                    if (streamEl) streamEl.textContent = visibleText;
                    this.dom.body.scrollTop = this.dom.body.scrollHeight;
                }
            }
            if (tokenCount === 1) console.log('[Story] First token received');
        };

        if (app.llm.useNativeBridge && typeof AndroidBridge !== 'undefined' && AndroidBridge.streamGemma) {
            console.log('[Story] Using native streaming bridge');
            await app.llm._enqueue(() => AndroidBridge.streamGemma({
                prompt,
                model,
                system: 'You are a language learning assistant. Write simple, clear text suitable for learners.'
            }, onToken));
        } else {
            const result = await app.llm._enqueue(async () => {
                const resp = await fetch(app.llm.endpoint + '/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(180000),
                    body: JSON.stringify({
                        model,
                        prompt,
                        system: 'You are a language learning assistant. Write simple, clear text suitable for learners.',
                        stream: false
                    })
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            });
            fullText = result.response || '';
        }

        this.streaming = false;
        this.storyText = fullText;
        console.log('[Story] Generation complete, tokens:', tokenCount, 'length:', fullText.length);

        // Parse and show polished result
        this._parseAndShow(fullText, lang);
    }

    // ── Parsing ─────────────────────────────────────────────────────

    _parseAndShow(text, lang) {
        const storyPart = this._extractStory(text);
        this.questions = this._extractQuestions(text);
        this.qIndex = 0;

        console.log('[Story] Parsed', this.questions.length, 'questions');

        if (this.questions.length > 0) {
            this._showStoryWithQuestions(storyPart, lang);
            this._prefetchNext();
        } else {
            this._showStoryOnly(storyPart);
        }
    }

    _extractStory(text) {
        // Get text between STORY: and the first Q1:/QUESTION:
        const storyMatch = text.match(/STORY:\s*([\s\S]*?)(?=\nQ[12][:\s]|\nQUESTION[:\s]|$)/i);
        return storyMatch ? storyMatch[1].trim() : text.split(/\nQ[12][:\s]/i)[0].replace(/^STORY:\s*/i, '').trim();
    }

    _extractQuestions(text) {
        const questions = [];
        // Match Q1/Q2 blocks or QUESTION blocks
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
                    </div>
                    <div class="text-base leading-relaxed text-slate-800 dark:text-neutral-100">${highlighted}</div>
                </div>
                <div id="story-questions-area"></div>
            </div>`;

        this.dom.footer.innerHTML = `
            <button id="story-ready-btn" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-500 to-purple-500 active:scale-95 transition-transform shadow-lg">
                <i class="ph-bold ph-question mr-1"></i> Question 1 of ${total}
            </button>`;

        document.getElementById('story-ready-btn').onclick = () => this._showCurrentQuestion();
        this.afterRender();
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
        // Clear previous question area
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

        // Advance to next question or show "New Story"
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
            const prefetchReady = !!this._prefetched;
            this.dom.footer.innerHTML = `
                <button onclick="app.game._loadNext()" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">
                    <i class="ph-bold ph-arrow-right mr-1"></i> ${prefetchReady ? 'Next Story' : 'New Story'}
                </button>`;
        }
    }

    _loadNext() {
        this.root.classList.remove('visible');
        this.answered = false;
        this.busy = false;
        // Re-setup the shell
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full">
                <div id="story-header" class="shrink-0 px-2 pt-1 pb-2"></div>
                <div id="story-body" class="flex-1 overflow-y-auto px-3 pb-4"></div>
                <div id="story-footer" class="shrink-0 px-3 pb-3"></div>
            </div>`;
        this.dom.header = document.getElementById('story-header');
        this.dom.body = document.getElementById('story-body');
        this.dom.footer = document.getElementById('story-footer');
        this.setupHeader({ showDice: false });
        this.startStory();
    }

    _showStoryOnly(storyPart) {
        const highlighted = this._highlightWords(storyPart);
        this.dom.body.innerHTML = `
            <div class="space-y-4 pb-2">
                <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-200 dark:border-neutral-700 shadow-sm">
                    <div class="text-base leading-relaxed text-slate-800 dark:text-neutral-100">${highlighted}</div>
                </div>
                <p class="text-xs text-center text-slate-400">Gemma couldn't generate questions this time.</p>
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
        this._prefetching = true;
        console.log('[Story] Prefetching next story in background...');

        try {
            const words = await this._pickWords(4);
            const lang = this._getTargetLang();
            const langName = app.llm._getLangName(lang);
            const wordList = words.map(w => w[lang] || w.ja || w.en).filter(Boolean);
            if (wordList.length === 0) { this._prefetching = false; return; }

            const prompt = this._buildStoryPrompt(wordList, langName);
            const model = app.llm.resolvedModel || app.llm.model;
            let fullText = '';

            if (app.llm.useNativeBridge && typeof AndroidBridge !== 'undefined' && AndroidBridge.streamGemma) {
                await app.llm._enqueue(() => AndroidBridge.streamGemma({
                    prompt, model,
                    system: 'You are a language learning assistant. Write simple, clear text suitable for learners.'
                }, (token) => { fullText += token; }));
            } else {
                const result = await app.llm._enqueue(async () => {
                    const resp = await fetch(app.llm.endpoint + '/api/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: AbortSignal.timeout(180000),
                        body: JSON.stringify({ model, prompt, system: 'You are a language learning assistant. Write simple, clear text suitable for learners.', stream: false })
                    });
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    return resp.json();
                });
                fullText = result.response || '';
            }

            const storyPart = this._extractStory(fullText);
            const questions = this._extractQuestions(fullText);

            if (questions.length > 0) {
                this._prefetched = { storyWords: words, storyPart, questions, lang };
                console.log('[Story] Prefetch ready:', questions.length, 'questions');
                // Update the "New Story" button if user already finished current questions
                this._updateNextButton();
            }
        } catch (e) {
            console.warn('[Story] Prefetch failed:', e.message);
        } finally {
            this._prefetching = false;
        }
    }

    _updateNextButton() {
        // If user is done with all questions and prefetch just landed, update button text
        if (this.qIndex >= this.questions.length && this._prefetched) {
            const btn = this.dom.footer?.querySelector('button');
            if (btn && btn.textContent.includes('New Story')) {
                btn.innerHTML = '<i class="ph-bold ph-arrow-right mr-1"></i> Next Story';
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    _highlightWords(text) {
        const lang = this._getTargetLang();
        let html = this.wrapHanzi(text);
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
        return html;
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
