/* js/game_context.js — Vocabulary in Context
 *
 * AI generates 3 example sentences using a vocab word at increasing
 * difficulty levels. User reads through them, hears TTS, sees translations.
 * Requires AI for sentence generation.
 */
class Context extends GameMode {
    constructor(k) {
        super(k);
        this.sentences = [];
        this.currentLevel = 0;
        this.loading = false;
        this.setup();
        this.update();
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full overflow-hidden">
                <div id="ctx-header" class="shrink-0"></div>
                <div class="flex-1 flex flex-col items-center px-4 min-h-0 overflow-y-auto">
                    <div id="ctx-word-card" class="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-6 text-center mb-4 shrink-0">
                        <p id="ctx-word" class="text-2xl font-black text-slate-800 dark:text-white mb-1"></p>
                        <p id="ctx-meaning" class="text-sm text-slate-400 dark:text-neutral-500"></p>
                    </div>
                    <div id="ctx-loading" class="w-full max-w-md hidden">
                        <div class="flex items-center justify-center gap-2 py-8">
                            <i class="ph-bold ph-spinner animate-spin text-indigo-500 text-xl"></i>
                            <span class="text-sm text-slate-400">Generating examples...</span>
                        </div>
                    </div>
                    <div id="ctx-progress" class="w-full max-w-md flex gap-2 mb-4 shrink-0">
                        <div class="ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors"></div>
                        <div class="ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors"></div>
                        <div class="ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors"></div>
                    </div>
                    <div id="ctx-sentence-card" class="w-full max-w-md hidden">
                        <div class="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-5 mb-3">
                            <div class="flex items-center gap-2 mb-3">
                                <span id="ctx-level-badge" class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 uppercase"></span>
                                <span id="ctx-level-label" class="text-[9px] text-slate-400"></span>
                            </div>
                            <p id="ctx-sentence" class="text-lg font-bold text-slate-800 dark:text-white leading-relaxed mb-3 select-text"></p>
                            <button id="ctx-play-btn" class="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 active:scale-95 transition-all flex items-center gap-1">
                                <i class="ph-bold ph-speaker-high"></i> Listen
                            </button>
                        </div>
                        <div id="ctx-translation-card" class="bg-slate-50 dark:bg-neutral-800/50 rounded-xl border border-slate-100 dark:border-neutral-800 p-3 mb-3 hidden">
                            <p id="ctx-translation" class="text-sm text-slate-500 dark:text-neutral-400 select-text"></p>
                        </div>
                        <button id="ctx-next-btn" class="w-full py-3 rounded-2xl font-bold text-sm bg-indigo-500 text-white shadow-lg active:scale-95 transition-all hidden">
                            Next Level →
                        </button>
                        <p id="ctx-done" class="text-center text-xs text-slate-400 mt-3 hidden">All 3 levels complete! Move to next word.</p>
                    </div>
                    <div id="ctx-no-ai" class="w-full max-w-md hidden">
                        <div class="text-center py-8">
                            <p class="text-rose-500 font-bold text-sm">Vocabulary in Context requires AI.</p>
                            <p class="text-xs text-slate-400 mt-1">Connect AI in Settings to generate examples.</p>
                        </div>
                    </div>
                </div>
                <div id="ctx-nav" class="shrink-0 px-3 pb-3"></div>
            </div>`;

        this.dom.header = this.root.querySelector('#ctx-header');
        this.dom.wordCard = this.root.querySelector('#ctx-word-card');
        this.dom.word = this.root.querySelector('#ctx-word');
        this.dom.meaning = this.root.querySelector('#ctx-meaning');
        this.dom.loading = this.root.querySelector('#ctx-loading');
        this.dom.progress = this.root.querySelector('#ctx-progress');
        this.dom.sentenceCard = this.root.querySelector('#ctx-sentence-card');
        this.dom.levelBadge = this.root.querySelector('#ctx-level-badge');
        this.dom.levelLabel = this.root.querySelector('#ctx-level-label');
        this.dom.sentence = this.root.querySelector('#ctx-sentence');
        this.dom.playBtn = this.root.querySelector('#ctx-play-btn');
        this.dom.translationCard = this.root.querySelector('#ctx-translation-card');
        this.dom.translation = this.root.querySelector('#ctx-translation');
        this.dom.nextBtn = this.root.querySelector('#ctx-next-btn');
        this.dom.done = this.root.querySelector('#ctx-done');
        this.dom.noAi = this.root.querySelector('#ctx-no-ai');

        this.root.querySelector('#ctx-nav').innerHTML = app.ui.nav();

        var self = this;
        if (this.dom.playBtn) this.dom.playBtn.onclick = function() { self.playSentence(); };
        if (this.dom.nextBtn) this.dom.nextBtn.onclick = function() { self.showNextLevel(); };
    }

    update() {
        this.currentLevel = 0;
        this.sentences = [];
        this.answered = false;
        this.busy = false;

        var c = this.list[this.i];
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var aKey = p.sentencesA || p.presetSource || 'en';

        var exKey = '';
        if (typeof LANG_CONFIG !== 'undefined') {
            var conf = LANG_MAP.get(qKey);
            if (conf && conf.exKey) exKey = conf.exKey;
        }

        var word = c[qKey] || '';
        var meaning = c[aKey] || '';
        var existingExample = c[exKey] || '';

        if (this.dom.word) this.dom.word.textContent = word;
        if (this.dom.meaning) this.dom.meaning.textContent = meaning;

        this._hideAll();
        this.updateHeader();

        var llmReady = app.llm && app.llm.available && app.llm.hasModel;
        if (!llmReady) {
            if (this.dom.noAi) this.dom.noAi.classList.remove('hidden');
            if (this.dom.wordCard) this.dom.wordCard.classList.add('hidden');
            return;
        }

        if (this.dom.loading) this.dom.loading.classList.remove('hidden');
        this._generateSentences(word, qKey, aKey, existingExample);
    }

    async _generateSentences(word, qKey, aKey, existingExample) {
        var langName = app.llm._getLangName(qKey);
        var knownLang = app.llm._getLangName(app.store.prefs.presetSource || 'en');
        var c = this.list[this.i];
        var level = '';
        if (c && c.tags) {
            var tags = c.tags || [];
            level = tags.find(function(t) { return ['N5','N4','N3','N2','N1','A1','A2','B1','B2','C1','C2','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5'].indexOf(t) !== -1; }) || '';
        }

        var prompt = 'Generate 3 example sentences using the ' + langName + ' word "' + word + '" at increasing difficulty levels.\n'
            + (existingExample ? 'The existing sentence in our database is: "' + existingExample + '" — use it as Level 1.\n' : '')
            + 'Output JSON only, no markdown, no extra text:\n'
            + '{"sentences": [\n'
            + '  {"level": "beginner", "sentence": "...", "translation": "..."},\n'
            + '  {"level": "intermediate", "sentence": "...", "translation": "..."},\n'
            + '  {"level": "advanced", "sentence": "...", "translation": "..."}\n'
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

            if (data && data.sentences && data.sentences.length === 3) {
                this.sentences = data.sentences;
            } else {
                throw new Error('Invalid sentence structure');
            }
        } catch (e) {
            L('[Context] Generation failed:', e.message);
            this.sentences = [];
            if (existingExample) {
                this.sentences = [
                    { level: 'beginner', sentence: existingExample, translation: '' }
                ];
            }
        }

        if (this.dom.loading) this.dom.loading.classList.add('hidden');
        if (this.sentences.length > 0) {
            this.showNextLevel();
        } else {
            if (this.dom.sentenceCard) this.dom.sentenceCard.classList.remove('hidden');
            if (this.dom.sentence) this.dom.sentence.textContent = 'Could not generate examples for this word.';
        }
    }

    showNextLevel() {
        if (this.currentLevel >= this.sentences.length) return;

        var s = this.sentences[this.currentLevel];

        var dots = this.dom.progress.querySelectorAll('.ctx-dot');
        for (var i = 0; i < dots.length; i++) {
            if (i < this.currentLevel) {
                dots[i].className = 'ctx-dot flex-1 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 transition-colors';
            } else if (i === this.currentLevel) {
                dots[i].className = 'ctx-dot flex-1 h-1.5 rounded-full bg-indigo-500 transition-colors';
            } else {
                dots[i].className = 'ctx-dot flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors';
            }
        }

        var levelLabels = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
        if (this.dom.levelBadge) this.dom.levelBadge.textContent = (this.currentLevel + 1) + '/3';
        if (this.dom.levelLabel) this.dom.levelLabel.textContent = levelLabels[s.level] || s.level || '';
        if (this.dom.sentence) this.dom.sentence.textContent = s.sentence;

        if (s.translation) {
            if (this.dom.translationCard) this.dom.translationCard.classList.remove('hidden');
            if (this.dom.translation) this.dom.translation.textContent = s.translation;
        } else {
            if (this.dom.translationCard) this.dom.translationCard.classList.add('hidden');
        }

        if (this.dom.sentenceCard) this.dom.sentenceCard.classList.remove('hidden');
        if (this.dom.done) this.dom.done.classList.add('hidden');

        var isLast = this.currentLevel >= this.sentences.length - 1;
        if (this.dom.nextBtn) {
            if (isLast) {
                this.dom.nextBtn.textContent = '✓ Complete';
                this.dom.nextBtn.classList.remove('bg-indigo-500');
                this.dom.nextBtn.classList.add('bg-emerald-500');
            } else {
                this.dom.nextBtn.textContent = 'Next Level →';
                this.dom.nextBtn.classList.add('bg-indigo-500');
                this.dom.nextBtn.classList.remove('bg-emerald-500');
            }
            this.dom.nextBtn.classList.remove('hidden');
        }

        this.currentLevel++;

        var self = this;
        setTimeout(function() { self.playSentence(); }, 300);
    }

    playSentence() {
        var idx = Math.max(0, this.currentLevel - 1);
        if (idx >= this.sentences.length) return;
        var s = this.sentences[idx];
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var conf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(qKey) : null;
        var audioLang = (conf && conf.audioSrc) ? conf.audioSrc : qKey;
        if (s.sentence) app.audio.play(s.sentence, audioLang, 'context', 0);
    }

    _hideAll() {
        if (this.dom.loading) this.dom.loading.classList.add('hidden');
        if (this.dom.sentenceCard) this.dom.sentenceCard.classList.add('hidden');
        if (this.dom.noAi) this.dom.noAi.classList.add('hidden');
    }

    afterRender() {
        if (this.dom.wordCard) app.fitter.fitSmart(this.dom.wordCard);
    }
}
