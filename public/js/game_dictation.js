/* js/game_dictation.js — Dictation Mode
 *
 * Plays an example sentence via TTS. User types what they heard.
 * Shows accuracy with highlighted differences.
 * No AI needed — uses example sentences from vocab data + TTS.
 */
class Dictation extends GameMode {
    constructor(k) {
        super(k);
        this.attempts = 0;
        this.maxAttempts = 3;
        this.currentText = '';
        this.setup();
        this.update();
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col h-full w-full overflow-hidden">
                <div id="dict-header" class="shrink-0"></div>
                <div class="flex-1 flex flex-col items-center justify-center px-4 min-h-0 overflow-y-auto">
                    <div id="dict-word-card" class="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-6 text-center mb-4">
                        <p id="dict-word" class="text-2xl font-black text-slate-800 dark:text-white mb-1"></p>
                        <p id="dict-meaning" class="text-sm text-slate-400 dark:text-neutral-500"></p>
                    </div>
                    <div id="dict-play-area" class="w-full max-w-md mb-4">
                        <button id="dict-play-btn" class="w-full py-3 rounded-2xl font-bold text-sm bg-indigo-500 text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                            <i class="ph-bold ph-speaker-high text-lg"></i>
                            <span>Play Sentence</span>
                        </button>
                        <p id="dict-attempts" class="text-center text-[10px] text-slate-400 mt-2"></p>
                    </div>
                    <div id="dict-input-area" class="w-full max-w-md hidden">
                        <textarea id="dict-input" rows="2" placeholder="Type what you heard..." class="w-full bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-neutral-200 outline-none focus:border-indigo-400 transition-colors resize-none placeholder:text-slate-300 dark:placeholder:text-neutral-600"></textarea>
                        <button id="dict-check-btn" class="w-full mt-2 py-3 rounded-2xl font-bold text-sm bg-emerald-500 text-white shadow-lg active:scale-95 transition-all">Check</button>
                    </div>
                    <div id="dict-result" class="w-full max-w-md hidden"></div>
                </div>
                <div id="dict-nav" class="shrink-0 px-3 pb-3"></div>
            </div>`;

        this.dom.header = this.root.querySelector('#dict-header');
        this.dom.wordCard = this.root.querySelector('#dict-word-card');
        this.dom.word = this.root.querySelector('#dict-word');
        this.dom.meaning = this.root.querySelector('#dict-meaning');
        this.dom.playArea = this.root.querySelector('#dict-play-area');
        this.dom.playBtn = this.root.querySelector('#dict-play-btn');
        this.dom.attempts = this.root.querySelector('#dict-attempts');
        this.dom.inputArea = this.root.querySelector('#dict-input-area');
        this.dom.input = this.root.querySelector('#dict-input');
        this.dom.checkBtn = this.root.querySelector('#dict-check-btn');
        this.dom.result = this.root.querySelector('#dict-result');

        this.root.querySelector('#dict-nav').innerHTML = app.ui.nav();

        var self = this;
        this.dom.playBtn.onclick = function() { self.playSentence(); };
        this.dom.checkBtn.onclick = function() { self.checkAnswer(); };
        this.dom.input.onkeydown = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.checkAnswer(); } };
    }

    setupHeader() {
        if (this.dom.header) {
            app.score = Math.max(0, Number(app.score) || 0);
            this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, { showDice: true });
            this.dom.headerInput = this.dom.header.querySelector('input[type="number"]');
            this.dom.headerScore = this.dom.header.querySelector('.score-display');
        }
    }

    update() {
        this.attempts = 0;
        this.answered = false;
        this.busy = false;
        this._clearResult();
        this.setupHeader();

        var c = this.list[this.i];
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var aKey = p.sentencesA || p.presetSource || 'en';

        var exKey = '';
        if (typeof LANG_CONFIG !== 'undefined') {
            var conf = LANG_MAP.get(qKey);
            if (conf && conf.exKey) exKey = conf.exKey;
        }

        var sentence = c[exKey] || '';
        var word = c[qKey] || '';
        var meaning = c[aKey] || '';

        this.currentText = sentence || word;

        if (this.dom.word) this.dom.word.textContent = word;
        if (this.dom.meaning) this.dom.meaning.textContent = meaning;
        if (this.dom.attempts) this.dom.attempts.textContent = '';

        if (this.dom.inputArea) this.dom.inputArea.classList.add('hidden');
        if (this.dom.result) this.dom.result.classList.add('hidden');
        if (this.dom.playArea) this.dom.playArea.classList.remove('hidden');
        if (this.dom.input) { this.dom.input.value = ''; this.dom.input.disabled = false; }
        if (this.dom.checkBtn) this.dom.checkBtn.disabled = false;

        this.updateHeader();
        if (this.dom.playBtn) this.dom.playBtn.disabled = false;

        var self = this;
        setTimeout(function() { self.playSentence(); }, 300);

        this.afterRender();
    }

    playSentence() {
        if (!this.currentText) return;
        var c = this.list[this.i];
        var p = app.store.prefs;
        var qKey = p.sentencesQ || p.presetTarget || 'ja';
        var conf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(qKey) : null;
        var audioLang = (conf && conf.audioSrc) ? conf.audioSrc : qKey;

        if (this.dom.playBtn) {
            this.dom.playBtn.disabled = true;
            this.dom.playBtn.innerHTML = '<i class="ph-bold ph-spinner animate-spin text-lg"></i><span>Playing...</span>';
            var self = this;
            setTimeout(function() {
                self.dom.playBtn.disabled = false;
                self.dom.playBtn.innerHTML = '<i class="ph-bold ph-speaker-high text-lg"></i><span>Play Again</span>';
            }, 1500);
        }

        app.audio.play(this.currentText, audioLang, 'dictation', 0);

        if (this.dom.inputArea) this.dom.inputArea.classList.remove('hidden');
        if (this.dom.input) this.dom.input.focus();
    }

    checkAnswer() {
        if (this.answered || !this.dom.input) return;
        var userText = this.dom.input.value.trim();
        if (!userText) return;

        this.attempts++;
        var expected = this.currentText;
        var similarity = this._calculateSimilarity(userText, expected);
        var isCorrect = similarity >= 0.8;

        if (this.dom.attempts) this.dom.attempts.textContent = 'Attempt ' + this.attempts + '/' + this.maxAttempts;

        if (isCorrect) {
            this.answered = true;
            this._showResult(userText, expected, true);
            this.score(Math.max(5, 15 - (this.attempts - 1) * 5));
            this.dom.input.disabled = true;
            if (this.dom.checkBtn) this.dom.checkBtn.disabled = true;
            var self = this;
            this.waitAndNav(null, 3000);
        } else if (this.attempts >= this.maxAttempts) {
            this.answered = true;
            this._showResult(userText, expected, false);
            this.dom.input.disabled = true;
            if (this.dom.checkBtn) this.dom.checkBtn.disabled = true;
            this.miss();
        } else {
            this._showResult(userText, expected, false);
            if (this.dom.input) { this.dom.input.value = ''; this.dom.input.focus(); }
        }
    }

    _calculateSimilarity(input, expected) {
        var a = input.toLowerCase().replace(/[.,!?;:'"()\-]/g, '').trim();
        var b = expected.toLowerCase().replace(/[.,!?;:'"()\-]/g, '').trim();
        if (a === b) return 1;

        var wordsA = a.split(/\s+/);
        var wordsB = b.split(/\s+/);
        var matches = 0;
        var used = {};

        for (var i = 0; i < wordsA.length; i++) {
            for (var j = 0; j < wordsB.length; j++) {
                if (!used[j] && wordsA[i] === wordsB[j]) {
                    matches++;
                    used[j] = true;
                    break;
                }
            }
        }

        return matches / Math.max(wordsA.length, wordsB.length);
    }

    _showResult(userText, expected, isCorrect) {
        if (!this.dom.result) return;
        this.dom.result.classList.remove('hidden');

        var expectedHtml = this._highlightDifferences(userText, expected);

        if (isCorrect) {
            this.dom.result.innerHTML = '<div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">'
                + '<p class="font-black text-emerald-600 dark:text-emerald-400 text-lg mb-1">✓ Correct!</p>'
                + '<p class="text-sm text-slate-600 dark:text-neutral-300 select-text">' + escapeHtml(expected) + '</p>'
                + '</div>';
        } else {
            this.dom.result.innerHTML = '<div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">'
                + '<p class="font-black text-rose-600 dark:text-rose-400 text-sm mb-2">Not quite — here\'s what was said:</p>'
                + '<p class="text-sm text-slate-600 dark:text-neutral-300 leading-relaxed select-text">' + expectedHtml + '</p>'
                + '</div>';
        }
    }

    _highlightDifferences(input, expected) {
        var inputWords = input.toLowerCase().replace(/[.,!?;:'"()\-]/g, '').trim().split(/\s+/);
        var expectedWords = expected.split(/(\s+|[.,!?;:'"()\-])/);

        var result = '';
        for (var i = 0; i < expectedWords.length; i++) {
            var w = expectedWords[i];
            var clean = w.toLowerCase().replace(/[.,!?;:'"()\-]/g, '');
            if (!clean) { result += escapeHtml(w); continue; }
            if (inputWords.indexOf(clean) !== -1) {
                result += escapeHtml(w);
            } else {
                result += '<span class="font-black text-rose-500 dark:text-rose-400 underline decoration-2">' + escapeHtml(w) + '</span>';
            }
        }
        return result;
    }

    _clearResult() {
        if (this.dom.result) { this.dom.result.innerHTML = ''; this.dom.result.classList.add('hidden'); }
    }

    afterRender() {
        if (this.dom.wordCard) app.fitter.fitSmart(this.dom.wordCard);
    }
}
