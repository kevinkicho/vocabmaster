/* js/game_context.js — Vocabulary in Context (gamified)
 *
 * AI generates 3 sentences using a vocab word at increasing difficulty.
 * Each sentence is shown as a cloze (word blanked out) with 4 options.
 * User picks the correct word to fill in. Scores points per level.
 * Progress dots track completion. Sparkle regenerates sentences.
 */
class Context extends GameMode {
    constructor(k) {
        super(k);
        this.sentences = [];
        this.currentLevel = 0;
        this._currentSentenceText = '';
        this.answered = false;
        this._completedLevels = 0;
        this.setup();
        this.update();
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full overflow-hidden">
                <div id="ctx-header" class="shrink-0"></div>
                <div class="flex-1 flex flex-col items-center px-4 min-h-0 overflow-y-auto">
                    <div id="ctx-word-card" class="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm mb-2 shrink-0 hidden cursor-pointer overflow-hidden" style="height: 3.5rem" onclick="app.game._toggleWord()">
                        <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <p id="ctx-word-placeholder" class="text-2xl font-black text-slate-300 dark:text-neutral-600 leading-tight">?</p>
                            <p id="ctx-word" class="text-xl font-black text-slate-800 dark:text-white mb-0 hidden leading-tight"></p>
                            <p id="ctx-meaning" class="text-[10px] text-slate-400 dark:text-neutral-500 hidden leading-tight">&nbsp;</p>
                        </div>
                    </div>
                    <div id="ctx-loading" class="w-full max-w-md hidden">
                        <div class="flex items-center justify-center gap-2 py-8">
                            <i class="ph-bold ph-spinner animate-spin text-indigo-500 text-xl"></i>
                            <span class="text-sm text-slate-400">Generating examples...</span>
                        </div>
                    </div>
                    <div id="ctx-progress" class="w-full max-w-md flex gap-2 mb-3 shrink-0 hidden">
                        <div class="ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors"></div>
                        <div class="ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors"></div>
                        <div class="ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors"></div>
                    </div>
                    <div id="ctx-sentence-card" class="w-full max-w-md hidden">
                        <div class="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-4 px-5 mb-3">
                            <div class="flex items-center gap-2 mb-2">
                                <span id="ctx-level-badge" class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 uppercase"></span>
                                <span id="ctx-level-label" class="text-[9px] text-slate-400"></span>
                            </div>
                            <p id="ctx-sentence" class="text-lg font-bold text-slate-800 dark:text-white leading-snug mb-0 cursor-pointer active:scale-[0.98] transition-transform select-text"></p>
                        </div>
                        <div id="ctx-translation-card" class="bg-slate-100 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 p-3 mb-3 hidden">
                            <p id="ctx-translation" class="text-sm text-slate-600 dark:text-neutral-300 select-text"></p>
                        </div>
                        <div id="ctx-options" class="grid grid-cols-2 gap-2 mb-3 hidden"></div>
                        <div id="ctx-result" class="hidden"></div>
                        <div class="flex justify-center">
                            <button id="ctx-next-btn" class="px-6 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white active:scale-95 transition-all hidden">
                                Next Level →
                            </button>
                        </div>
                        <p id="ctx-done" class="text-center text-xs text-slate-400 mt-3 hidden"></p>
                    </div>
                    <div id="ctx-no-ai" class="w-full max-w-md hidden">
                        <div class="text-center py-8">
                            <p class="text-rose-500 font-bold text-sm">Word Context requires AI.</p>
                            <p class="text-xs text-slate-400 mt-1">Connect AI in Settings to generate examples.</p>
                        </div>
                    </div>
                </div>
                <div id="ctx-nav" class="shrink-0 px-3 pb-3"></div>
            </div>`;

        this.dom.header = this.root.querySelector('#ctx-header');
        this.dom.wordCard = this.root.querySelector('#ctx-word-card');
        this.dom.wordPlaceholder = this.root.querySelector('#ctx-word-placeholder');
        this.dom.word = this.root.querySelector('#ctx-word');
        this.dom.meaning = this.root.querySelector('#ctx-meaning');
        this.dom.loading = this.root.querySelector('#ctx-loading');
        this.dom.progress = this.root.querySelector('#ctx-progress');
        this.dom.sentenceCard = this.root.querySelector('#ctx-sentence-card');
        this.dom.levelBadge = this.root.querySelector('#ctx-level-badge');
        this.dom.levelLabel = this.root.querySelector('#ctx-level-label');
        this.dom.sentence = this.root.querySelector('#ctx-sentence');
        this.dom.translationCard = this.root.querySelector('#ctx-translation-card');
        this.dom.translation = this.root.querySelector('#ctx-translation');
        this.dom.options = this.root.querySelector('#ctx-options');
        this.dom.result = this.root.querySelector('#ctx-result');
        this.dom.nextBtn = this.root.querySelector('#ctx-next-btn');
        this.dom.done = this.root.querySelector('#ctx-done');
        this.dom.noAi = this.root.querySelector('#ctx-no-ai');

        this.root.querySelector('#ctx-nav').innerHTML = app.ui.nav();
        this.setupHeader();

        var self = this;
        if (this.dom.sentence) {
            // Tap to play TTS
            this.dom.sentence.onclick = function() { self.playSentence(); };
            // Long-click to show translation
            var pressTimer = null;
            this.dom.sentence.addEventListener('mousedown', function() {
                pressTimer = setTimeout(function() { self._showTranslation(); }, 500);
            });
            this.dom.sentence.addEventListener('mouseup', function() { clearTimeout(pressTimer); });
            this.dom.sentence.addEventListener('mouseleave', function() { clearTimeout(pressTimer); });
            this.dom.sentence.addEventListener('touchstart', function(e) {
                e.preventDefault();
                pressTimer = setTimeout(function() { self._showTranslation(); }, 500);
            });
            this.dom.sentence.addEventListener('touchend', function() { clearTimeout(pressTimer); });
            this.dom.sentence.addEventListener('touchmove', function() { clearTimeout(pressTimer); });
        }
        if (this.dom.nextBtn) this.dom.nextBtn.onclick = function() { self._onNext(); };
    }

    setupHeader() {
        if (this.dom.header) {
            app.score = Math.max(0, Number(app.score) || 0);
            this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, { showSparkle: true, showDice: true });
            this.dom.headerInput = this.dom.header.querySelector('input[type="number"]');
            this.dom.headerScore = this.dom.header.querySelector('.score-display');
        }
    }

    _generateAnew() {
        this.currentLevel = 0;
        this._completedLevels = 0;
        this._levelResults = [];
        this.answered = false;
        this.sentences = [];
        this._genId = (this._genId || 0) + 1;
        this._hideAll();
        this._showLoading();
        this._fetchSentences();
    }

    _toggleWord() {
        if (this._wordRevealed) return;
        this._wordRevealed = true;
        if (this.dom.wordPlaceholder) this.dom.wordPlaceholder.classList.add('hidden');
        if (this.dom.word) this.dom.word.classList.remove('hidden');
        if (this.dom.meaning) this.dom.meaning.classList.remove('hidden');
        var self = this;
        setTimeout(function() {
            if (self.dom.wordPlaceholder) self.dom.wordPlaceholder.classList.remove('hidden');
            if (self.dom.word) self.dom.word.classList.add('hidden');
            if (self.dom.meaning) self.dom.meaning.classList.add('hidden');
            self._wordRevealed = false;
        }, 5000);
    }

    _showTranslation() {
        var level = this.currentLevel - 1;
        if (level < 0 || level >= this.sentences.length) return;
        var s = this.sentences[level];
        if (!s || !s.translation) return;
        if (this.dom.translationCard) {
            this.dom.translationCard.classList.remove('hidden');
            if (this.dom.translation) this.dom.translation.textContent = s.translation;
        }
    }

    _showLoading() {
        if (this.dom.loading) this.dom.loading.classList.remove('hidden');
        if (this.dom.progress) this.dom.progress.classList.add('hidden');
        if (this.dom.sentenceCard) this.dom.sentenceCard.classList.add('hidden');
    }

    update() {
        this.currentLevel = 0;
        this._completedLevels = 0;
        this._levelResults = [];
        this._genId = (this._genId || 0) + 1;
        this.answered = false;
        this.sentences = [];
        this.busy = false;
        this.setupHeader();

        var c = this.list[this.i];
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var aKey = p.sentencesA || p.presetSource || 'en';
        var exKey = '';
        if (typeof LANG_MAP !== 'undefined') {
            var conf = LANG_MAP.get(qKey);
            if (conf && conf.exKey) exKey = conf.exKey;
        }

        if (this.dom.word) this.dom.word.textContent = c[qKey] || '';
        // Sub-text: show vocab translation in user's "I know..." language
        var knownLang = app.store.prefs.presetSource || 'en';
        if (this.dom.meaning) this.dom.meaning.textContent = c[knownLang] || '';

        this._hideAll();
        // Show word card with ? placeholder
        if (this.dom.wordCard) {
            this.dom.wordCard.classList.remove('hidden');
            this._wordRevealed = false;
            if (this.dom.wordPlaceholder) this.dom.wordPlaceholder.classList.remove('hidden');
            if (this.dom.word) this.dom.word.classList.add('hidden');
            if (this.dom.meaning) this.dom.meaning.classList.add('hidden');
        }
        this.updateHeader();

        var llmReady = app.llm && app.llm.available && app.llm.hasModel;
        if (!llmReady) {
            if (this.dom.noAi) this.dom.noAi.classList.remove('hidden');
            if (this.dom.wordCard) this.dom.wordCard.classList.add('hidden');
            this.afterRender();
            return;
        }

        this._showLoading();
        this._fetchSentences();
        this.afterRender();
    }

    async _fetchSentences() {
        var myGenId = this._genId;
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var aKey = p.sentencesA || p.presetSource || 'en';
        var exKey = '';
        if (typeof LANG_MAP !== 'undefined') {
            var conf = LANG_MAP.get(qKey);
            if (conf && conf.exKey) exKey = conf.exKey;
        }
        var c = this.list[this.i];
        var word = c[qKey] || '';
        var existingExample = c[exKey] || '';
        var langName = app.llm._getLangName(qKey);

        var prompt = 'Generate 3 example sentences using the ' + langName + ' word "' + word + '" at increasing difficulty levels.\n'
            + 'IMPORTANT: In each sentence, replace the word (or its conjugated form) with {{BLANK}} so the student must fill it in.\n'
            + (existingExample ? 'The existing sentence in our database is: "' + existingExample + '" — use it as Level 1 (replace the word with {{BLANK}}).\n' : '')
            + 'Output JSON only, no markdown, no extra text:\n'
            + '{"sentences": [\n'
            + '  {"level": "beginner", "sentence": "... with {{BLANK}} ...", "translation": "..."},\n'
            + '  {"level": "intermediate", "sentence": "... with {{BLANK}} ...", "translation": "..."},\n'
            + '  {"level": "advanced", "sentence": "... with {{BLANK}} ...", "translation": "..."}\n'
            + ']}';

        try {
            var raw = await app.llm.generate({
                prompt: prompt,
                system: 'You are a ' + langName + ' language teacher. Generate natural example sentences. Output ONLY valid JSON.',
                options: { num_predict: 512, temperature: 0.7 },
                timeout: 30000
            });
            var cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            var data = JSON.parse(cleaned);
            // Check if user navigated away during generation
            if (myGenId !== this._genId) return;
            if (data && data.sentences && data.sentences.length >= 1) {
                this.sentences = data.sentences;
            } else { throw new Error('Invalid'); }
        } catch (e) {
            L('[Context] Generation failed:', e.message);
            if (myGenId !== this._genId) return;
            this.sentences = [];
            if (existingExample) this.sentences = [{ level: 'beginner', sentence: existingExample, translation: '' }];
        }

        if (this.dom.loading) this.dom.loading.classList.add('hidden');
        if (this.sentences.length > 0) {
            if (this.dom.progress) this.dom.progress.classList.remove('hidden');
            if (this.dom.sentenceCard) this.dom.sentenceCard.classList.remove('hidden');
            this._showLevel();
        } else {
            if (this.dom.sentenceCard) this.dom.sentenceCard.classList.remove('hidden');
            if (this.dom.sentence) this.dom.sentence.textContent = 'Could not generate examples.';
        }
    }

    _showLevel() {
        if (this.currentLevel >= this.sentences.length) {
            this._finish();
            return;
        }

        this.answered = false;
        // Reset card border from previous answer
        var card = this.dom.sentenceCard ? this.dom.sentenceCard.querySelector('div') : null;
        if (card) {
            card.className = 'bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-4 px-5 mb-3';
        }
        var s = this.sentences[this.currentLevel];
        this._currentSentenceText = s.sentence;
        var c = this.list[this.i];
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var aKey = p.sentencesA || p.presetSource || 'en';
        var targetWord = c[qKey] || '';

        // Update progress dots
        var dots = this.dom.progress ? this.dom.progress.querySelectorAll('.ctx-dot') : [];
        for (var i = 0; i < dots.length; i++) {
            if (i < this.currentLevel) {
                // Completed level — green if correct, red if wrong
                var wasCorrect = this._levelResults[i] === true;
                dots[i].className = 'ctx-dot flex-1 h-1.5 rounded-full ' + (wasCorrect ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-rose-400 dark:bg-rose-500') + ' transition-colors';
            } else if (i === this.currentLevel) {
                dots[i].className = 'ctx-dot flex-1 h-1.5 rounded-full bg-indigo-500 transition-colors';
            } else {
                dots[i].className = 'ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors';
            }
        }

        var levelLabels = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
        if (this.dom.levelBadge) this.dom.levelBadge.textContent = (this.currentLevel + 1) + '/' + this.sentences.length;
        if (this.dom.levelLabel) this.dom.levelLabel.textContent = levelLabels[s.level] || s.level || '';

        // Build cloze sentence (blank out the target word)
        var clozeHtml = this._buildCloze(s.sentence, targetWord);
        if (this.dom.sentence) this.dom.sentence.innerHTML = clozeHtml;

        if (s.translation) {
            if (this.dom.translationCard) this.dom.translationCard.classList.add('hidden');
        } else {
            if (this.dom.translationCard) this.dom.translationCard.classList.add('hidden');
        }

        // Build multiple choice options
        var distractors = this._getDistractors(c.id, targetWord, aKey, 3);
        var options = [targetWord].concat(distractors);
        this._shuffle(options);

        if (this.dom.options) {
            this.dom.options.classList.remove('hidden');
            this.dom.options.innerHTML = options.map(function(opt) {
                return '<button class="ctx-option w-full rounded-xl bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 active:scale-95 transition-all text-center overflow-hidden" style="height: 3.5rem" data-value="' + escapeHtml(opt) + '"><div class="fit-box w-full h-full"><span class="fit-target font-black text-base">' + escapeHtml(opt) + '</span></div></button>';
            }).join('');

            var self = this;
            this.dom.options.querySelectorAll('.ctx-option').forEach(function(btn) {
                btn.onclick = function() { self._pickOption(btn, targetWord); };
                var span = btn.querySelector('.fit-target');
                if (span) app.fitter.fit(span);
            });
        }

        if (this.dom.result) this.dom.result.classList.add('hidden');
        if (this.dom.sentenceCard) this.dom.sentenceCard.classList.remove('hidden');
        if (this.dom.nextBtn) this.dom.nextBtn.classList.add('hidden');
        if (this.dom.done) this.dom.done.classList.add('hidden');

        var self = this;
        setTimeout(function() { self.playSentence(); }, 300);
    }

    _buildCloze(sentence, word) {
        if (!sentence) return '';
        // AI already put {{BLANK}} markers in the sentence — just replace them
        if (sentence.indexOf('{{BLANK}}') !== -1) {
            var blankHtml = '<span class="inline-block px-3 mx-0.5 bg-slate-400 dark:bg-slate-500 rounded" style="width: 5em; height: 1.5rem; display: inline-flex; align-items: center; justify-content: center; overflow: hidden;">&nbsp;</span>';
            return escapeHtml(sentence).replace(/\{\{BLANK\}\}/g, blankHtml);
        }
        // Fallback: try regex match (for existing sentences without markers)
        if (!word) return escapeHtml(sentence);
        var escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp('(' + escaped + ')', 'gi');
        var sentenceHtml = escapeHtml(sentence);
        var blankHtml = '<span class="inline-block px-3 mx-0.5 bg-slate-400 dark:bg-slate-500 rounded" style="width: 5em; height: 1.5rem; display: inline-flex; align-items: center; justify-content: center; overflow: hidden;">&nbsp;</span>';
        return sentenceHtml.replace(regex, blankHtml);
    }

    _getDistractors(cardId, correctWord, aKey, count) {
        var list = this.list;
        var candidates = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === cardId) continue;
            var w = list[i][aKey];
            if (w && w !== correctWord) candidates.push(w);
        }
        this._shuffle(candidates);
        return candidates.slice(0, count);
    }

    _shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    _pickOption(btn, correctWord) {
        if (this.answered) return;
        this.answered = true;

        var chosen = btn.getAttribute('data-value') || btn.textContent.trim();
        var isCorrect = chosen === correctWord;

        // Highlight chosen button
        var allBtns = this.dom.options.querySelectorAll('.ctx-option');
            allBtns.forEach(function(b) {
                b.onclick = null;
                b.classList.add('opacity-50');
                if (b.getAttribute('data-value') === correctWord) {
                    b.classList.remove('border-slate-200', 'dark:border-neutral-700', 'bg-white', 'dark:bg-neutral-800');
                    b.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-900/30', 'text-emerald-700', 'dark:text-emerald-300');
                }
            });

        if (isCorrect) {
            btn.classList.remove('opacity-50');
            btn.classList.add('scale-105');
            var points = [5, 10, 15][this.currentLevel] || 5;
            this.score(points);
            app.celebration.play();
            this._completedLevels++;
            this._levelResults[this.currentLevel] = true;

            // Apply correct effect to question box — insert answer after blank, don't replace
            var sentenceEl = this.dom.sentence;
            if (sentenceEl) {
                var blank = sentenceEl.querySelector('span');
                if (blank) {
                    // Hide the blank, insert the answer as a separate styled element
                    blank.style.display = 'none';
                    var answerSpan = document.createElement('span');
                    answerSpan.className = 'inline-block px-2 mx-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded font-bold';
                    answerSpan.textContent = correctWord;
                    blank.parentNode.insertBefore(answerSpan, blank.nextSibling);
                }
                // Border matches correct answer choice — use the sentence card's parent
                var card = this.dom.sentenceCard ? this.dom.sentenceCard.querySelector('div') : sentenceEl.parentElement;
                if (card) {
                    card.classList.add('border-emerald-500', 'dark:border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-900/30');
                    card.classList.remove('border-slate-100', 'dark:border-neutral-800', 'bg-white', 'dark:bg-neutral-900');
                }
            }

            // Mark dot green
            var dots = this.dom.progress ? this.dom.progress.querySelectorAll('.ctx-dot') : [];
            if (dots[this.currentLevel]) {
                dots[this.currentLevel].className = 'ctx-dot flex-1 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 transition-colors';
            }
        } else {
            btn.classList.remove('opacity-50');
            btn.classList.add('border-rose-500', 'bg-rose-50', 'dark:bg-rose-900/30', 'text-rose-600', 'dark:text-rose-400');
            this.miss();
            this._levelResults[this.currentLevel] = false;

            // Apply wrong effect to question box — rose/red border
            var sentenceEl2 = this.dom.sentence;
            if (sentenceEl2) {
                var card2 = this.dom.sentenceCard ? this.dom.sentenceCard.querySelector('div') : sentenceEl2.parentElement;
                if (card2) {
                    card2.classList.add('border-rose-500', 'dark:border-rose-500', 'bg-rose-50', 'dark:bg-rose-900/30');
                    card2.classList.remove('border-slate-100', 'dark:border-neutral-800', 'bg-white', 'dark:bg-neutral-900');
                }
            }

            // Mark dot red immediately
            var dots2 = this.dom.progress ? this.dom.progress.querySelectorAll('.ctx-dot') : [];
            if (dots2[this.currentLevel]) {
                dots2[this.currentLevel].className = 'ctx-dot flex-1 h-1.5 rounded-full bg-rose-400 dark:bg-rose-500 transition-colors';
            }
        }

        if (this.dom.nextBtn) {
            this.dom.nextBtn.classList.remove('hidden');
            this.dom.nextBtn.className = 'px-6 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white active:scale-95 transition-all';
            var isLast = this.currentLevel >= this.sentences.length - 1;
            if (isLast) {
                // Go straight to finish — no "Got it" step
                this._finish();
                return;
            } else {
                this.dom.nextBtn.textContent = 'Next Level →';
                this.dom.nextBtn.classList.add('bg-indigo-500');
                this.dom.nextBtn.classList.remove('bg-emerald-500');
            }
        }

        this.currentLevel++;
    }

    _onNext() {
        if (this.currentLevel >= this.sentences.length) {
            this._finish();
            return;
        }
        this._showLevel();
    }

    _finish() {
        if (this.dom.nextBtn) this.dom.nextBtn.classList.add('hidden');
        if (this.dom.done) {
            var pct = this.sentences.length > 0 ? Math.round((this._completedLevels / this.sentences.length) * 100) : 0;
            this.dom.done.innerHTML = '';
            var scoreLine = document.createElement('p');
            scoreLine.className = 'text-xs text-slate-400 mb-2';
            scoreLine.textContent = '✓ ' + this._completedLevels + '/' + this.sentences.length + ' correct (' + pct + '%)';
            this.dom.done.appendChild(scoreLine);
            var retryBtn = document.createElement('button');
            retryBtn.className = 'px-6 py-2 rounded-xl text-xs font-bold bg-indigo-500 text-white active:scale-95 transition-all';
            retryBtn.textContent = '↻ Try Again';
            retryBtn.onclick = this._generateAnew.bind(this);
            this.dom.done.appendChild(retryBtn);
            this.dom.done.classList.remove('hidden');
            this.dom.done.classList.remove('hidden');
        }
    }

    playSentence() {
        if (!this._currentSentenceText) return;
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var conf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(qKey) : null;
        var audioLang = (conf && conf.audioSrc) ? conf.audioSrc : qKey;
        // Replace all blank placeholders with "..." for TTS pause
        var ttsText = this._currentSentenceText.replace(/\{\{BLANK\}\}/g, '...').replace(/______/g, '...').replace(/_{3,}/g, '...');
        app.audio.play(ttsText, audioLang, 'context', 0);
    }

    _hideAll() {
        if (this.dom.loading) this.dom.loading.classList.add('hidden');
        if (this.dom.sentenceCard) this.dom.sentenceCard.classList.add('hidden');
        if (this.dom.noAi) this.dom.noAi.classList.add('hidden');
        if (this.dom.progress) this.dom.progress.classList.add('hidden');
    }

    afterRender() {
        if (this.dom.wordCard) app.fitter.fitSmart(this.dom.wordCard);
        requestAnimationFrame(() => { if (this.root) this.root.classList.add('visible'); });
    }
}
