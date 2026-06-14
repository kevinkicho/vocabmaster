// Extracted UI methods for Story mode
Object.assign(Story.prototype, {

// --- Story-specific header with session progress ---
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
                        <span class="score-display">${Math.max(0, Number(app.score) || 0)}</span>
                    </div>
                    <button onclick="app.goHome()" class="w-9 h-9 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300">
                        <i class="ph-bold ph-x"></i>
                    </button>
                </div>
            </div>`;
        this.dom.headerScore = this.dom.header.querySelector('.score-display');
    },

    _updateProgress() {
        const el = document.getElementById('story-progress');
        if (el) el.textContent = this.storyNum;
    },

// --- Streaming card — final UI from the start ---
_showStreamingCard(wordList) {
        const startTime = Date.now();
        const lang = this._getTargetLang();

        this.dom.body.innerHTML = `
            <div class="space-y-4 pb-2">
                <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-200 dark:border-neutral-700 shadow-sm">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="ph-duotone ph-book-open-text text-lg text-indigo-500"></i>
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Story</span>
                        <span id="story-elapsed" class="ml-auto text-[10px] text-slate-300 dark:text-neutral-600 font-mono">0s</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5 mb-3">
                        ${wordList.map(w => `<button data-word="${escapeHtml(w)}" data-lang="${lang}" class="story-word-chip inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800" title="Tap to hear"><span>${escapeHtml(w)}</span><i class="ph-bold ph-speaker-high text-[10px] opacity-70"></i></button>`).join('')}
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

        // Wire up word chip clicks → TTS
        this.dom.body.querySelectorAll('.story-word-chip').forEach(chip => {
            chip.onclick = (e) => {
                e.preventDefault();
                const word = chip.dataset.word || '';
                const l = chip.dataset.lang || lang;
                if (app.audio && word) app.audio.play(word, l, null, 0);
                chip.classList.add('ring-2', 'ring-indigo-400');
                setTimeout(() => chip.classList.remove('ring-2', 'ring-indigo-400'), 600);
            };
        });

        this._elapsedTimer = setInterval(() => {
            const el = document.getElementById('story-elapsed');
            if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
        }, 1000);

        this.afterRender();
    },

// --- Display: story + sequential questions ---
    _showStoryWithQuestions(storyPart, lang, isFallback = false) {
        this.phase = 'reading';
        const highlighted = this._highlightWords(storyPart);
        const total = this.questions.length;

        const fallbackBadge = isFallback ? `<span class="ml-2 text-[9px] font-black bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 px-2 py-0.5 rounded-full">Basic Mode</span>` : '';
        const wordPills = `<div class="flex flex-wrap gap-1.5 mb-3">${this.storyWords.map(w => {
            const txt = w[lang] || w.ja || '';
            return `<button data-word="${escapeHtml(txt)}" data-lang="${lang}" class="story-word-chip inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full active:scale-95 transition-all cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-800" title="Tap to hear"><span>${escapeHtml(txt)}</span><i class="ph-bold ph-speaker-high text-[10px] opacity-70"></i></button>`;
        }).join('')}</div>`;

        this.dom.body.innerHTML = `
            <div class="space-y-4 pb-2">
                <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-200 dark:border-neutral-700 shadow-sm">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="ph-duotone ph-book-open-text text-lg text-indigo-500"></i>
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Story</span>
                        ${fallbackBadge}
                        <button id="story-speak-btn" onclick="app.game._readStory()" class="ml-auto w-8 h-8 rounded-full border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 flex items-center justify-center active:scale-90 transition-all text-slate-500 dark:text-neutral-400 hover:text-indigo-500 hover:border-indigo-300">
                            <i class="ph-bold ph-speaker-high text-sm"></i>
                        </button>
                    </div>
                    ${wordPills}
                    <div id="story-stream" class="text-base leading-relaxed text-slate-800 dark:text-neutral-100 select-text">${highlighted}</div>
                </div>
                <div id="story-questions-area"></div>
            </div>`;

        this.dom.footer.innerHTML = `
            <button id="story-ready-btn" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-indigo-500 to-purple-500 active:scale-95 transition-transform shadow-lg">
                <i class="ph-bold ph-question mr-1"></i> Question 1 of ${total}
            </button>`;

        document.getElementById('story-ready-btn').onclick = () => this._showCurrentQuestion();
        // Wire up word chip clicks → TTS
        this.dom.body.querySelectorAll('.story-word-chip').forEach(chip => {
            chip.onclick = (e) => {
                e.preventDefault();
                const word = chip.dataset.word || '';
                const l = chip.dataset.lang || lang;
                if (app.audio && word) app.audio.play(word, l, null, 0);
                // Brief visual feedback
                chip.classList.add('ring-2', 'ring-indigo-400');
                setTimeout(() => chip.classList.remove('ring-2', 'ring-indigo-400'), 600);
            };
        });
        this.afterRender();

        // Auto-read for cached/prefetched stories
        if (app.store.prefs.storyAutoRead !== false) {
            this._readStory(storyPart);
        }
    },

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
            <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-100 dark:border-neutral-800 shadow-sm">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">Question ${num} of ${total}</span>
                </div>
                <p class="text-sm font-bold text-slate-800 dark:text-white mb-3">${this.wrapHanzi(q.text)}</p>
                <p class="text-[9px] text-slate-400 mb-2">Tap a choice to hear it, tap again to submit</p>
                <div class="grid grid-cols-1 gap-2">
                    ${q.choices.map(c => `
                        <button data-letter="${c.letter}" data-text="${escapeHtml(c.text)}" data-played="0" class="story-choice text-left px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-bold text-slate-700 dark:text-white active:scale-[0.98] transition-all">
                            <span class="text-indigo-500 dark:text-indigo-400 font-black mr-2">${c.letter})</span> ${this.wrapHanzi(c.text)}
                        </button>`).join('')}
                </div>
            </div>`;

        area.appendChild(qSection);
        requestAnimationFrame(() => qSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));

        const choices = qSection.querySelectorAll('.story-choice');
        choices.forEach(btn => {
            btn.onclick = () => this._handleStoryChoiceClick(btn, q);
        });
    },

    _handleStoryChoiceClick(el, q) {
        if (this.answered) return;
        const played = el.dataset.played === '1';
        const text = el.dataset.text || '';
        const lang = this._getTargetLang();
        if (!played) {
            this._deselectStoryChoices();
            el.dataset.played = '1';
            if (app.audio && text) app.audio.play(text, lang, null, 0);
            el.classList.add('ring-2', 'ring-indigo-300', 'dark:ring-indigo-600');
            return;
        }
        this._checkAnswer(el.dataset.letter, el, q);
    },

    _deselectStoryChoices() {
        const area = document.getElementById('story-questions-area');
        if (!area) return;
        area.querySelectorAll('.story-choice').forEach(ch => {
            ch.dataset.played = '0';
            ch.classList.remove('ring-2', 'ring-indigo-300', 'dark:ring-indigo-600');
        });
    },

    _checkAnswer(letter, el, q) {
        if (this.answered) return;
        this.answered = true;

        const correct = letter === q.correct;
        const area = document.getElementById('story-questions-area');

        area.querySelectorAll('.story-choice').forEach(btn => {
            btn.classList.remove('border-slate-200', 'dark:border-neutral-700', 'bg-white', 'dark:bg-neutral-900', 'bg-emerald-50', 'bg-rose-50');
            if (btn.dataset.letter === q.correct) {
                btn.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-900/30', 'dark:text-white');
            } else if (btn === el && !correct) {
                btn.classList.add('border-rose-500', 'bg-rose-50', 'dark:bg-rose-900/30', 'dark:text-white');
            } else {
                btn.classList.add('border-slate-100', 'dark:border-neutral-800', 'opacity-50', 'dark:text-neutral-400');
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
                    <div class="space-y-2">
                        <button onclick="app.game._loadNext()" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">
                            <i class="ph-bold ph-arrow-right mr-1"></i> ${instant ? 'Next Story' : 'New Story'}
                        </button>
                        <button id="story-generate-anew" onclick="app.game._generateAnewStory()" class="w-full py-2 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 active:scale-95 transition-transform shadow-md">
                            <i class="ph-bold ph-sparkle mr-1"></i> Generate Anew Story
                        </button>
                        <button onclick="app.game._reviewStoryWords()" class="w-full py-2 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-rose-500 active:scale-95 transition-transform">
                            <i class="ph-bold ph-list-checks mr-1"></i> Review words from this story
                        </button>
                    </div>`;
            }
        }
    },

    async _generateAnewStory() {
        // Skip cache + prefetch, force fresh AI generation
        this._prefetched = null;
        this._prefetching = false;
        this.answered = false;
        this.busy = false;
        // Disable the button to prevent double-clicks
        const btn = document.getElementById('story-generate-anew');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin mr-1"></i> Generating…';
        }
        // Reuse startStory(forceAnew=true) — it handles AI off, generation, and rendering.
        // Each fresh generation counts as a new story in the session, which matches "Generate Anew Story".
        await this.startStory(true);
    },

    _reviewStoryWords() {
        if (!this.storyWords || this.storyWords.length === 0 || !app.data) return;
        const ok = app.data.startSpecificReview(this.storyWords);
        if (ok) {
            // Launch Quiz or Flash with these words for review using app.launch to ensure UI switches
            app.launch(() => {
                const quiz = new Quiz('quiz');
                // Auto end review when this review game ends
                const origDestroy = quiz.destroy.bind(quiz);
                quiz.destroy = () => {
                    if (app.data) app.data.endReviewSession();
                    origDestroy();
                };
                return quiz;
            });
        }
    },

    _resetSession() {
        this.storyNum = 0;
        this._prefetched = null;
        this._prefetching = false;
        this._loadNext();
    },

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
    },

    _showStoryOnly(storyPart, modelUsed = null) {
        const highlighted = this._highlightWords(storyPart);
        const modelLine = modelUsed ? `<p class="text-[9px] text-center text-slate-500 mt-1">model: ${escapeHtml(modelUsed)}</p>` : '';
        this.dom.body.innerHTML = `
            <div class="space-y-4 pb-2">
                <div class="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-slate-200 dark:border-neutral-700 shadow-sm">
                    <div class="text-base leading-relaxed text-slate-800 dark:text-neutral-100">${highlighted}</div>
                </div>
                <p class="text-xs text-center text-slate-400">Couldn't generate questions this time.</p>
                ${modelLine}
            </div>`;
        this.dom.footer.innerHTML = `
            <button onclick="app.game._loadNext()" class="w-full py-3 rounded-2xl text-sm font-black text-white bg-gradient-to-r from-cyan-500 to-indigo-500 active:scale-95 transition-transform shadow-lg">
                <i class="ph-bold ph-arrow-clockwise mr-1"></i> Try Again
            </button>`;
        this.afterRender();
    },

// --- TTS ---
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
    },

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
});
