/* js/game_grammar.js — Grammar Gym */
class Grammar extends GameMode {
    constructor(k) {
        super(k);
        this.exerciseData = null;
        this.currentExercise = 0;
        this.exerciseResults = [];
        this.busy = false;
        this._abortFlag = false;
        this._grElapsedTimer = null;
        this.setup();
        this.update();
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full overflow-hidden">
                <div id="gr-header" class="shrink-0"></div>
                <div id="gr-card" class="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-2">
                    <div id="gr-word" class="text-center mb-2">
                        <p class="gr-vocab text-2xl font-black text-slate-800 dark:text-white cursor-pointer select-none" title="Tap to hear"></p>
                        <p id="gr-sentence" class="text-sm text-slate-500 dark:text-neutral-400 mt-1 italic"></p>
                    </div>
                    <div id="gr-content" class="flex-1 flex flex-col items-center justify-center"></div>
                </div>
                <div id="gr-audio" class="shrink-0 px-4"></div>
                <div id="gr-nav" class="shrink-0 px-3 pb-3"></div>
            </div>`;
        this.dom.header = this.root.querySelector('#gr-header');
        this.dom.card = this.root.querySelector('#gr-card');
        this.dom.word = this.root.querySelector('.gr-vocab');
        this.dom.sentence = this.root.querySelector('#gr-sentence');
        this.dom.content = this.root.querySelector('#gr-content');
        this.dom.audio = this.root.querySelector('#gr-audio');
        this.dom.nav = this.root.querySelector('#gr-nav');
        this._renderNav();
        this.setupHeader();

        if (this.dom.word) {
            this.dom.word.onclick = () => this._playVocab();
        }
    }

    setupHeader() {
        if (this.dom.header) {
            app.score = Math.max(0, Number(app.score) || 0);
            this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, { showSparkle: true, showDice: true });
            this.dom.headerInput = this.dom.header.querySelector('input[type="number"]');
            this.dom.headerScore = this.dom.header.querySelector('.score-display');
        }
    }

    _renderNav() {
        if (!this.dom.nav) return;
        this.dom.nav.innerHTML = app.ui.nav();
    }

    _playVocab() {
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.grammarQ || 'ja';
        const word = c[qKey] || '';
        if (word && app.audio) app.audio.play(word, qKey, null, 0);
    }

    _playExample() {
        if (!this.exerciseData || !this.exerciseData.example) return;
        const p = app.store.prefs;
        const qKey = p.grammarQ || 'ja';
        if (app.audio) app.audio.play(this.exerciseData.example, qKey, null, 0);
    }

    _playSentence() {
        const c = this.list[this.i];
        if (!c) return;
        const p = app.store.prefs;
        const qKey = p.grammarQ || 'ja';
        let exKey = '';
        if (typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_MAP.get(qKey);
            if (conf && conf.exKey) exKey = conf.exKey;
        }
        const sentence = c[exKey] || '';
        if (sentence && app.audio) app.audio.play(sentence, qKey, null, 0);
    }

    update() {
        this.busy = false;
        this.answered = false;
        this.currentExercise = 0;
        this.exerciseResults = [];
        this.exerciseData = null;
        this._renderNav();
        const c = this.list[this.i];
        if (!c) {
            if (this.dom.content) this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">No vocabulary item found.</p></div>`;
            if (this.dom.audio) this.dom.audio.innerHTML = '';
            this.afterRender();
            return;
        }
        const p = app.store.prefs;
        const qKey = p.grammarQ || 'ja';
        const aKey = p.grammarA || 'ja';
        let exKey = '';
        if (typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_MAP.get(qKey);
            if (conf && conf.exKey) exKey = conf.exKey;
        }
        const word = c[qKey] || '';
        const sentenceRaw = c[exKey] || '';
        const cardLevel = (c.tags || []).find(t => ['N5','N4','N3','N2','N1'].includes(t)) || '';
        if (this.dom.word) this.dom.word.textContent = word;
        if (this.dom.sentence) {
            this.dom.sentence.textContent = sentenceRaw;
            this.dom.sentence.onclick = () => this._playSentence();
            this.dom.sentence.classList.add('cursor-pointer', 'select-none');
        }
        const llmReady = app.llm && app.llm.available && app.llm.hasModel;
        if (!llmReady) {
            if (this.dom.content) {
                this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">Grammar Gym requires a working AI connection.</p><p class="text-xs text-slate-400 mt-2">Connecting to AI...</p></div>`;
            }
            if (this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);
            this.afterRender();
            if (!this._llmRetryTimer) {
                let attempts = 0;
                this._llmRetryTimer = setInterval(() => {
                    attempts++;
                    if (app.llm && app.llm.available && app.llm.hasModel) {
                        clearInterval(this._llmRetryTimer);
                        this._llmRetryTimer = null;
                        if (this.list && this.list[this.i]) this.update();
                    } else if (attempts >= 10) {
                        clearInterval(this._llmRetryTimer);
                        this._llmRetryTimer = null;
                        if (this.dom.content) {
                            this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">Grammar Gym requires a working AI connection.</p><p class="text-xs text-slate-400 mt-2">Please set up and connect AI in Settings &gt; AI.</p></div>`;
                        }
                    }
                }, 1000);
            }
            return;
        }
        this.updateHeader();
        if (this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);
        this._showGenerating(false);
        this.afterRender();
        this._fetchGrammarExercise(word, sentenceRaw, qKey, cardLevel, c, false).catch(e => {
            L('[Grammar] Fetch error:', e);
            if (this.dom.content) {
                this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">Failed to load grammar exercise.</p><p class="text-xs text-slate-400 mt-2">${escapeHtml(e.message || e)}</p><button onclick="app.game._generateAnew()" class="mt-3 px-4 py-2 rounded-xl font-bold text-xs bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200 active:scale-95 transition-all"><i class="ph-bold ph-arrow-counter-clockwise mr-1"></i>Try Again</button></div>`;
                this.afterRender();
            }
        });
    }

    _showGenerating(allowAnew) {
        if (!this.dom.content) return;
        if (this._grElapsedTimer) clearInterval(this._grElapsedTimer);
        var startTime = Date.now();
        this._grElapsedTimer = setInterval(function() {
            var el = document.getElementById('gr-elapsed');
            if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
        }, 1000);
        const anewBtn = allowAnew ? `<button id="gr-anew-btn" class="mt-3 px-4 py-2 rounded-xl font-bold text-xs bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200 active:scale-95 transition-all"><i class="ph-bold ph-arrow-counter-clockwise mr-1"></i>Generate Anew</button>` : '';
        this.dom.content.innerHTML = `<div class="flex flex-col items-center justify-center h-full gap-1"><p id="gr-gen-text" class="text-slate-400 text-sm"><i class="ph-bold ph-spinner animate-spin mr-2"></i>Generating grammar exercises...</p><p id="gr-elapsed" class="text-[10px] text-slate-300 dark:text-neutral-600"></p>${anewBtn}</div>`;
        const anewBtnEl = document.getElementById('gr-anew-btn');
        if (anewBtnEl) anewBtnEl.onclick = () => this._generateAnew();
    }

    _clearElapsedTimer() {
        if (this._grElapsedTimer) {
            clearInterval(this._grElapsedTimer);
            this._grElapsedTimer = null;
        }
    }

    _generateAnew() {
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.grammarQ || 'ja';
        let exKey = '';
        if (typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_MAP.get(qKey);
            if (conf && conf.exKey) exKey = conf.exKey;
        }
        const word = c[qKey] || '';
        const sentenceRaw = c[exKey] || '';
        const cardLevel = (c.tags || []).find(t => ['N5','N4','N3','N2','N1'].includes(t)) || '';
        this._showGenerating(true);
        this._fetchGrammarExercise(word, sentenceRaw, qKey, cardLevel, c, true).catch(e => {
            L('[Grammar] Anew fetch error:', e);
        });
    }

    _regenerateGrammar() {
        this._generateAnew();
    }

    async _fetchGrammarExercise(word, sentence, qKey, level, card, forceAnew) {
        const vocabId = card.id;
        if (!forceAnew) {
            const cached = await app.llm.loadCachedGrammarExercise(vocabId, qKey);
            if (cached) {
                if (!this.list[this.i] || this.list[this.i].id !== card.id) return;
                this._clearElapsedTimer();
                this.exerciseData = cached;
                this._showExplanation();
                return;
            }
        }
        if (!this.list[this.i] || this.list[this.i].id !== card.id) return;
        this._showGenerating(true);
        const onProgress = (msg) => {
            const textEl = document.getElementById('gr-gen-text');
            if (textEl && this.list[this.i] && this.list[this.i].id === card.id) {
                textEl.innerHTML = `<i class="ph-bold ph-spinner animate-spin mr-2"></i>${escapeHtml(msg)}`;
            }
        };
        const result = await app.llm.getGrammarExercise(word, sentence, qKey, level, onProgress, vocabId);
        this._clearElapsedTimer();
        if (!this.list[this.i] || this.list[this.i].id !== card.id) return;
        if (!result || !result.exercises || result.exercises.length === 0) {
            if (this.dom.content) {
                const modelName = (app.llm && app.llm.resolvedModel) || 'unknown';
                this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">Could not generate grammar exercises.</p><p class="text-xs text-slate-400 mt-2">Model <strong>${escapeHtml(modelName)}</strong> returned an empty response. Try again or check AI settings.</p><button id="gr-anew-btn" class="mt-3 px-4 py-2 rounded-xl font-bold text-xs bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200 active:scale-95 transition-all"><i class="ph-bold ph-arrow-counter-clockwise mr-1"></i>Generate Anew</button></div>`;
                const anewBtnEl = document.getElementById('gr-anew-btn');
                if (anewBtnEl) anewBtnEl.onclick = () => this._generateAnew();
            }
            return;
        }
        this.exerciseData = result;
        this._showExplanation();
    }

    _showExplanation() {
        const d = this.exerciseData;
        if (!d) return;
        const fromCache = d.fromCache;
        if (this.dom.content) {
            this.dom.content.innerHTML = `
                <div class="w-full max-w-md mx-auto">
                    <div class="bg-indigo-50 dark:bg-indigo-900 rounded-2xl p-4 border border-indigo-200 dark:border-indigo-800 text-left">
                        <p class="font-bold text-indigo-700 dark:text-indigo-300 text-xs mb-1"><i class="ph-bold ph-book-open mr-1"></i>Grammar</p>
                        <p class="text-slate-700 dark:text-neutral-200 text-sm mb-3">${escapeHtml(d.grammar)}</p>
                        <p class="font-bold text-indigo-700 dark:text-indigo-300 text-xs mb-1"><i class="ph-bold ph-chat-centered-text mr-1"></i>Usage</p>
                        <p class="text-slate-700 dark:text-neutral-200 text-sm mb-3">${escapeHtml(d.usage)}</p>
                        <p class="font-bold text-indigo-700 dark:text-indigo-300 text-xs mb-1"><i class="ph-bold ph-pencil-simple mr-1"></i>Example <span class="text-[9px] text-slate-400 font-normal">(tap to hear)</span></p>
                        <p id="gr-example" class="gr-example text-slate-700 dark:text-neutral-200 text-sm italic cursor-pointer select-none active:opacity-70">${escapeHtml(d.example)}</p>
                    </div>
                    <button id="gr-start-btn" class="mt-4 w-full py-3 rounded-2xl font-bold text-sm bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg active:scale-95 transition-all"><i class="ph-bold ph-lightbulb mr-1"></i>Start Practice — ${d.exercises.length} Questions</button>
                    ${fromCache ? '<p class="text-[9px] text-slate-400 text-center mt-1">Loaded from cache</p>' : ''}
                </div>`;
            const btn = document.getElementById('gr-start-btn');
            if (btn) btn.onclick = () => this._startPractice();
            const exEl = document.getElementById('gr-example');
            if (exEl) exEl.onclick = () => this._playExample();
        }
    }

    _startPractice() {
        this.currentExercise = 0;
        this.exerciseResults = [];
        this.answered = false;
        this._showExercise();
    }

    static TYPE_LABELS = {
        text_dm: { icon: 'ph-chats', label: 'Chat DM' },
        you_decide: { icon: 'ph-seal-question', label: 'You Decide' },
        fix_sign: { icon: 'ph-sign-post', label: 'Fix the Sign' },
        translation_fail: { icon: 'ph-translate', label: 'Translation Fail' },
        culture_check: { icon: 'ph-globe', label: 'Culture Check' },
        declarative: { icon: 'ph-dot-outline', label: 'Declarative' },
        interrogative: { icon: 'ph-question', label: 'Interrogative' },
        imperative: { icon: 'ph-exclamation', label: 'Imperative' },
        exclamative: { icon: 'ph-star', label: 'Exclamative' },
        operative: { icon: 'ph-gavel', label: 'Operative' },
        conditional: { icon: 'ph-arrows-counter-clockwise', label: 'Conditional' },
        exhortation: { icon: 'ph-hand-waving', label: 'Exhortation' }
    };

    _showExercise() {
        const ex = this.exerciseData.exercises[this.currentExercise];
        if (!ex) { this._showSummary(); return; }
        const total = this.exerciseData.exercises.length;
        const idx = this.currentExercise;
        const typeInfo = Grammar.TYPE_LABELS[ex.type] || { icon: 'ph-question', label: ex.type };
        const p = app.store.prefs;
        const qKey = p.grammarQ || 'ja';
        if (this.dom.content) {
            const choicesHtml = ex.choices.map(ch => {
                return `<button data-letter="${ch.letter}" data-text="${escapeHtml(ch.text)}" data-played="0" class="gr-choice w-full text-left p-3 rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-bold text-sm text-slate-700 dark:text-neutral-200 hover:border-amber-300 dark:hover:border-amber-600 active:scale-[0.98] transition-all">${escapeHtml(ch.text)}</button>`;
            }).join('');
            this.dom.content.innerHTML = `
                <div class="w-full max-w-md mx-auto">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exercise ${idx + 1} of ${total}</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">${typeInfo.label}</span>
                    </div>
                    <p class="text-sm font-bold text-slate-800 dark:text-white mb-4 leading-relaxed">${escapeHtml(ex.question)}</p>
                    <div id="gr-choices" class="flex flex-col gap-2">${choicesHtml}</div>
                    <div id="gr-feedback" class="mt-3"></div>
                    <button id="gr-next-btn" class="mt-4 w-full py-3 rounded-2xl font-bold text-sm bg-indigo-500 text-white shadow-lg active:scale-95 transition-all hidden">Next</button>
                </div>`;
            const choices = this.root.querySelectorAll('.gr-choice');
            choices.forEach(el => {
                el.onclick = () => this._handleChoiceClick(el, ex);
            });
        }
    }

    _handleChoiceClick(el, ex) {
        if (this.answered) return;
        const played = el.dataset.played === '1';
        const text = el.dataset.text || '';
        const p = app.store.prefs;
        const qKey = p.grammarQ || 'ja';
        if (!played) {
            this._deselectAllChoices();
            el.dataset.played = '1';
            if (app.audio && text) app.audio.play(text, qKey, null, 0);
            el.classList.add('ring-2', 'ring-amber-300', 'dark:ring-amber-600');
            return;
        }
        this._answerExercise(el, ex);
    }

    _deselectAllChoices() {
        const allChoices = this.root.querySelectorAll('.gr-choice');
        allChoices.forEach(ch => {
            ch.dataset.played = '0';
            ch.classList.remove('ring-2', 'ring-amber-300', 'dark:ring-amber-600');
        });
    }

    _answerExercise(el, ex) {
        if (this.answered) return;
        this.answered = true;
        const selected = el.dataset.letter;
        const correct = selected === ex.answer;
        this.exerciseResults.push(correct);
        const allChoices = this.root.querySelectorAll('.gr-choice');
        allChoices.forEach(ch => {
            const letter = ch.dataset.letter;
            ch.onclick = null;
            ch.classList.remove('hover:border-amber-300', 'dark:hover:border-amber-600', 'active:scale-[0.98]', 'ring-2', 'ring-amber-300', 'dark:ring-amber-600');
            if (letter === ex.answer) {
                ch.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-900/30');
            } else if (letter === selected && !correct) {
                ch.classList.add('border-rose-500', 'bg-rose-50', 'dark:bg-rose-900/30');
            } else {
                ch.classList.add('opacity-50');
            }
        });
        const feedback = this.root.querySelector('#gr-feedback');
        if (feedback) {
            feedback.innerHTML = `<div class="p-3 rounded-xl ${correct ? 'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800'}"><p class="font-bold text-xs ${correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}">${correct ? 'Correct!' : 'Incorrect'}</p><p class="text-xs text-slate-600 dark:text-neutral-300 mt-1">${escapeHtml(ex.explanation)}</p></div>`;
        }
        const nextBtn = this.root.querySelector('#gr-next-btn');
        if (nextBtn) {
            nextBtn.classList.remove('hidden');
            if (this.currentExercise < this.exerciseData.exercises.length - 1) {
                nextBtn.textContent = 'Next Question';
                nextBtn.onclick = () => { this.currentExercise++; this.answered = false; this._showExercise(); };
            } else {
                nextBtn.textContent = 'See Results';
                nextBtn.onclick = () => this._showSummary();
            }
        }
    }

    _showSummary() {
        const total = this.exerciseResults.length;
        const correct = this.exerciseResults.filter(Boolean).length;
        const pct = total > 0 ? Math.round(correct / total * 100) : 0;
        const word = this.exerciseData.grammar || '';
        if (this.dom.content) {
            this.dom.content.innerHTML = `
                <div class="w-full max-w-md mx-auto text-center">
                    <p class="text-lg font-black text-slate-800 dark:text-white">${correct} / ${total} Correct</p>
                    <p class="text-sm text-slate-500 dark:text-neutral-400 mt-1">${pct}% on ${escapeHtml(word)}</p>
                    <div class="w-full bg-slate-200 dark:bg-neutral-700 rounded-full h-2 mt-3 overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500 ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}" style="width:${pct}%"></div>
                    </div>
                    <button id="gr-retry-btn" class="mt-6 w-full py-3 rounded-2xl font-bold text-sm bg-indigo-500 text-white shadow-lg active:scale-95 transition-all"><i class="ph-bold ph-arrow-counter-clockwise mr-1"></i>Try Again</button>
                    <button id="gr-anew-btn" class="mt-3 w-full py-3 rounded-2xl font-bold text-sm bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200 active:scale-95 transition-all"><i class="ph-bold ph-sparkle mr-1"></i>Generate Anew</button>
                </div>`;
            const retryBtn = document.getElementById('gr-retry-btn');
            if (retryBtn) retryBtn.onclick = () => { this.currentExercise = 0; this.exerciseResults = []; this.answered = false; this._showExercise(); };
            const anewBtn = document.getElementById('gr-anew-btn');
            if (anewBtn) anewBtn.onclick = () => this._generateAnew();
        }
        if (correct > 0) {
            this.score(10 * correct);
        }
    }
}