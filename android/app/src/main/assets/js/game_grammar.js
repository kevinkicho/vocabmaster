/* js/game_grammar.js — Grammar Gym */
class Grammar extends GameMode {
    constructor(k) {
        super(k);
        this.exerciseData = null;
        this.currentExercise = 0;
        this.exerciseResults = [];
        this.setup();
        this.update();
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full overflow-hidden">
                <div id="gr-header" class="shrink-0"></div>
                <div id="gr-card" class="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-2">
                    <div id="gr-word" class="text-center mb-2">
                        <p class="text-2xl font-black text-slate-800 dark:text-white"></p>
                        <p id="gr-sentence" class="text-sm text-slate-500 dark:text-neutral-400 mt-1 italic"></p>
                    </div>
                    <div id="gr-content" class="flex-1 flex flex-col items-center justify-center"></div>
                </div>
                <div id="gr-audio" class="shrink-0 px-4"></div>
                <div id="gr-nav" class="shrink-0"></div>
            </div>`;
        this.dom.header = this.root.querySelector('#gr-header');
        this.dom.card = this.root.querySelector('#gr-card');
        this.dom.word = this.root.querySelector('#gr-word p:first-child');
        this.dom.sentence = this.root.querySelector('#gr-sentence');
        this.dom.content = this.root.querySelector('#gr-content');
        this.dom.audio = this.root.querySelector('#gr-audio');
        this.root.querySelector('#gr-nav').innerHTML = app.ui.nav();
        this.setupHeader();
    }

    update() {
        this.busy = false;
        this.answered = false;
        this.currentExercise = 0;
        this.exerciseResults = [];
        this.exerciseData = null;
        const c = this.list[this.i];
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
        if (this.dom.sentence) this.dom.sentence.textContent = sentenceRaw;
        const llmReady = app.llm && app.llm.available && app.llm.hasModel;
        if (!llmReady) {
            if (this.dom.content) {
                this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">Grammar Gym requires a working AI connection.</p><p class="text-xs text-slate-400 mt-2">Please set up and connect AI in Settings &gt; AI.</p></div>`;
            }
            if (this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);
            this.afterRender();
            return;
        }
        this.updateHeader();
        if (this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);
        if (this.dom.content) {
            this.dom.content.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-slate-400 text-sm"><i class="ph-bold ph-spinner animate-spin mr-2"></i>Generating grammar exercises...</p></div>`;
        }
        this.afterRender();
        this._fetchGrammarExercise(word, sentenceRaw, qKey, cardLevel, c).catch(e => {
            L('[Grammar] Fetch error:', e);
            if (this.dom.content) {
                this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">Failed to generate grammar exercise.</p><p class="text-xs text-slate-400 mt-2">${escapeHtml(e.message || 'Unknown error')}</p></div>`;
            }
        });
    }

    async _fetchGrammarExercise(word, sentence, qKey, level, card) {
        const result = await app.llm.getGrammarExercise(word, sentence, qKey, level);
        if (!this.list[this.i] || this.list[this.i].id !== card.id) return;
        if (!result || !result.exercises || result.exercises.length === 0) {
            if (this.dom.content) {
                this.dom.content.innerHTML = `<div class="text-center p-6"><p class="text-rose-500 font-bold text-sm">Could not generate grammar exercises.</p><p class="text-xs text-slate-400 mt-2">The AI returned an empty response. Try again with a different card.</p></div>`;
            }
            return;
        }
        this.exerciseData = result;
        this._showExplanation();
    }

    _showExplanation() {
        const d = this.exerciseData;
        if (!d) return;
        if (this.dom.content) {
            this.dom.content.innerHTML = `
                <div class="w-full max-w-md mx-auto">
                    <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 border border-indigo-200 dark:border-indigo-800 text-left">
                        <p class="font-bold text-indigo-700 dark:text-indigo-300 text-xs mb-1"><i class="ph-bold ph-book-open mr-1"></i>Grammar</p>
                        <p class="text-slate-700 dark:text-neutral-200 text-sm mb-3">${escapeHtml(d.grammar)}</p>
                        <p class="font-bold text-indigo-700 dark:text-indigo-300 text-xs mb-1"><i class="ph-bold ph-chat-centered-text mr-1"></i>Usage</p>
                        <p class="text-slate-700 dark:text-neutral-200 text-sm mb-3">${escapeHtml(d.usage)}</p>
                        <p class="font-bold text-indigo-700 dark:text-indigo-300 text-xs mb-1"><i class="ph-bold ph-pencil-simple mr-1"></i>Example</p>
                        <p class="text-slate-700 dark:text-neutral-200 text-sm italic">${escapeHtml(d.example)}</p>
                    </div>
                    <button id="gr-start-btn" class="mt-4 w-full py-3 rounded-2xl font-bold text-sm bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg active:scale-95 transition-all"><i class="ph-bold ph-lightbulb mr-1"></i>Start Practice — ${d.exercises.length} Questions</button>
                </div>`;
            const btn = document.getElementById('gr-start-btn');
            if (btn) btn.onclick = () => this._startPractice();
        }
    }

    _startPractice() {
        this.currentExercise = 0;
        this.exerciseResults = [];
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
        if (this.dom.content) {
            const letterLabels = { A: ex.labelA, B: ex.labelB };
            const choicesHtml = ex.choices.map(ch => {
                const lbl = letterLabels[ch.letter];
                return `<button data-letter="${ch.letter}" class="gr-choice w-full text-left p-3 rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-bold text-sm text-slate-700 dark:text-neutral-200 hover:border-amber-300 dark:hover:border-amber-600 active:scale-[0.98] transition-all"><span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-black mr-2 shrink-0">${lbl ? '' : ch.letter}</span>${lbl ? '<span class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mr-1">' + escapeHtml(lbl) + '</span> ' : ''}${escapeHtml(ch.text)}</button>`;
            }).join('');
            this.dom.content.innerHTML = `
                <div class="w-full max-w-md mx-auto">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exercise ${idx + 1} of ${total}</span>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center gap-1"><i class="ph-bold ${typeInfo.icon} text-[10px]"></i>${typeInfo.label}</span>
                    </div>
                    <p class="text-sm font-bold text-slate-800 dark:text-white mb-4 leading-relaxed">${escapeHtml(ex.question)}</p>
                    <div id="gr-choices" class="flex flex-col gap-2">${choicesHtml}</div>
                    <div id="gr-feedback" class="mt-3"></div>
                    <button id="gr-next-btn" class="mt-4 w-full py-3 rounded-2xl font-bold text-sm bg-indigo-500 text-white shadow-lg active:scale-95 transition-all hidden">Next</button>
                </div>`;
            const choices = this.root.querySelectorAll('.gr-choice');
            choices.forEach(el => {
                el.onclick = () => this._answerExercise(el, ex);
            });
        }
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
            ch.classList.remove('hover:border-amber-300', 'dark:hover:border-amber-600', 'active:scale-[0.98]');
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
                </div>`;
            const retryBtn = document.getElementById('gr-retry-btn');
            if (retryBtn) retryBtn.onclick = () => { this.currentExercise = 0; this.exerciseResults = []; this.answered = false; this._showExercise(); };
        }
        if (correct > 0) {
            this.score(10 * correct);
        }
    }
}
