/* js/game_sentence_build.js — Sentence Build (reorder blocks)
 *
 * Question: translated example sentence (known language).
 * Task: tap blocks of the target-language example in correct order.
 * Chunking via SentenceUtils (Intl.Segmenter + particle merge + vocab anchor).
 */

class SentenceBuild extends GameMode {
    constructor(k) {
        super(k || 'sentence_build');
        this._correctBlocks = [];
        this._pool = [];
        this._built = [];
        this._done = false;
        /** Free-play first-Check-only FSRS (OQ2): wordIds already graded this mode instance */
        this._fsrsGraded = {};
        this.setup();
        this.update();
    }

    setup() {
        this.root.innerHTML =
            '<div class="flex flex-col h-full w-full overflow-hidden px-1">' +
            '  <div id="sb-header" class="shrink-0"></div>' +
            '  <div id="sb-prompt-box" class="bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm px-4 py-4 mb-3 min-h-[5.5rem] flex items-center justify-center">' +
            '    <p id="sb-prompt" class="fit-smart text-lg sm:text-xl font-black text-slate-700 dark:text-neutral-100 leading-relaxed text-center w-full"></p>' +
            '  </div>' +
            '  <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1">Your sentence</p>' +
            '  <div id="sb-built" class="min-h-[3.5rem] rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-neutral-900 px-3 py-3 mb-3 flex flex-wrap gap-2 content-center items-center"></div>' +
            '  <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1">Blocks</p>' +
            '  <div id="sb-pool" class="flex-1 min-h-0 overflow-y-auto flex flex-wrap gap-2 content-start items-start pb-2"></div>' +
            '  <div class="shrink-0 flex gap-2 mb-1">' +
            '    <button type="button" id="sb-undo" class="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-xs font-bold text-slate-600 dark:text-neutral-200">Undo</button>' +
            '    <button type="button" id="sb-clear" class="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-xs font-bold text-slate-600 dark:text-neutral-200">Clear</button>' +
            '    <button type="button" id="sb-check" class="flex-[1.4] py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black">Check</button>' +
            '  </div>' +
            '  <div id="sb-audio" class="shrink-0"></div>' +
            '  <div id="sb-nav" class="shrink-0"></div>' +
            '</div>';

        this.dom.header = this.root.querySelector('#sb-header');
        this.dom.promptBox = this.root.querySelector('#sb-prompt-box');
        this.dom.prompt = this.root.querySelector('#sb-prompt');
        this.dom.built = this.root.querySelector('#sb-built');
        this.dom.pool = this.root.querySelector('#sb-pool');
        this.dom.audio = this.root.querySelector('#sb-audio');
        this.dom.undo = this.root.querySelector('#sb-undo');
        this.dom.clear = this.root.querySelector('#sb-clear');
        this.dom.check = this.root.querySelector('#sb-check');

        this.root.querySelector('#sb-nav').innerHTML = app.ui.nav();
        this.setupHeader();

        var self = this;
        this.dom.undo.onclick = function () { self._undo(); };
        this.dom.clear.onclick = function () { self._clearBuilt(); };
        this.dom.check.onclick = function () { self._submit(); };
    }

    _targetLang() {
        return (app.store && app.store.prefs && app.store.prefs.presetTarget) ||
            (app.store && app.store.prefs && app.store.prefs.sentencesQ) || 'ja';
    }

    _knownLang() {
        return (app.store && app.store.prefs && app.store.prefs.presetSource) ||
            (app.store && app.store.prefs && app.store.prefs.sentencesBottomLang) || 'en';
    }

    _exKey(lang) {
        if (typeof LANG_MAP !== 'undefined' && LANG_MAP.get) {
            var conf = LANG_MAP.get(lang);
            if (conf && conf.exKey) return conf.exKey;
        }
        return lang + '_ex';
    }

    update() {
        this.busy = false;
        this.answered = false;
        this._done = false;
        this._built = [];
        var c = this.list[this.i];
        if (!c) return;

        var tLang = this._targetLang();
        var kLang = this._knownLang();
        var tEx = c[this._exKey(tLang)] || c[tLang] || '';
        var kEx = c[this._exKey(kLang)] || c[kLang] || '';

        // Prefer target example; skip items without a usable sentence
        if (!tEx || tEx.length < 2) {
            // advance to next with sentence if possible
            this._skipEmpty();
            return;
        }

        var blocks = [];
        if (window.SentenceUtils && SentenceUtils.chunkSentence) {
            blocks = SentenceUtils.chunkSentence(tEx, tLang, {
                item: c,
                maxBlocks: 8,
                minBlocks: 2
            });
        } else {
            blocks = String(tEx).split(/\s+/).filter(Boolean);
        }
        if (blocks.length < 2) {
            // force char pairs for very short / unsegmentable
            var s = String(tEx).replace(/\s+/g, '');
            blocks = [];
            for (var i = 0; i < s.length; i += Math.max(1, Math.ceil(s.length / 4))) {
                blocks.push(s.slice(i, i + Math.max(1, Math.ceil(s.length / 4))));
            }
        }

        this._correctBlocks = blocks;
        this._targetSentence = (window.SentenceUtils && SentenceUtils.normalizeText)
            ? SentenceUtils.normalizeText(tEx)
            : String(tEx).trim();
        this._pool = (window.SentenceUtils && SentenceUtils.shuffleBlocks)
            ? SentenceUtils.shuffleBlocks(blocks)
            : blocks.slice().sort(function () { return Math.random() - 0.5; });

        this.updateHeader();
        if (this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);
        if (this.dom.promptBox) {
            this.highlightQBox(this.dom.promptBox, false);
            this.dom.promptBox.classList.remove('bg-emerald-500', 'border-emerald-500', 'bg-rose-500', 'border-rose-500');
        }
        if (this.dom.prompt) {
            this.dom.prompt.innerHTML = '';
            this.dom.prompt.dataset.brProcessed = '';
            this.dom.prompt.dataset.lastFitted = '';
            // Known-language example as the question; fall back to gloss
            this.dom.prompt.textContent = kEx || (c[kLang] || 'Build the sentence');
            this.dom.prompt.dataset.wid = c.id;
        }

        this._renderBuilt();
        this._renderPool();

        var self = this;
        requestAnimationFrame(function () {
            if (app.fitter && self.dom.prompt) app.fitter.fitSmart(self.dom.prompt);
            if (self.root) self.root.classList.add('visible');
        });
        if (app.notes) app.notes.check(c.id);
    }

    _skipEmpty() {
        if (!this.list || this.list.length < 2) {
            if (this.dom.prompt) this.dom.prompt.textContent = 'No example sentence for this word.';
            return;
        }
        this.i = (this.i + 1) % this.list.length;
        // avoid infinite loop: only try list length times
        if (!this._skipGuard) this._skipGuard = 0;
        this._skipGuard++;
        if (this._skipGuard > this.list.length) {
            this._skipGuard = 0;
            if (this.dom.prompt) this.dom.prompt.textContent = 'No example sentences in this list.';
            return;
        }
        this.update();
        this._skipGuard = 0;
    }

    _renderBuilt() {
        if (!this.dom.built) return;
        var self = this;
        if (!this._built.length) {
            this.dom.built.innerHTML =
                '<span class="text-xs text-slate-400 dark:text-neutral-500 font-bold">Tap blocks below in order…</span>';
            return;
        }
        this.dom.built.innerHTML = this._built.map(function (b, idx) {
            return '<button type="button" data-built="' + idx + '" class="sb-chip px-3 py-2 rounded-xl bg-indigo-500 text-white text-sm font-black shadow-sm active:scale-95">' +
                escapeHtml(b) + '</button>';
        }).join('');
        this.dom.built.querySelectorAll('[data-built]').forEach(function (el) {
            el.onclick = function () {
                if (self._done || self.busy) return;
                var i = parseInt(el.getAttribute('data-built'), 10);
                var piece = self._built.splice(i, 1)[0];
                if (piece != null) self._pool.push(piece);
                self._renderBuilt();
                self._renderPool();
            };
        });
    }

    _renderPool() {
        if (!this.dom.pool) return;
        var self = this;
        this.dom.pool.innerHTML = this._pool.map(function (b, idx) {
            return '<button type="button" data-pool="' + idx + '" class="sb-chip px-3 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-200 dark:border-neutral-700 text-sm font-black text-slate-700 dark:text-neutral-100 shadow-sm active:scale-95 hover:border-indigo-400">' +
                escapeHtml(b) + '</button>';
        }).join('');
        this.dom.pool.querySelectorAll('[data-pool]').forEach(function (el) {
            el.onclick = function () {
                if (self._done || self.busy) return;
                var i = parseInt(el.getAttribute('data-pool'), 10);
                var piece = self._pool.splice(i, 1)[0];
                if (piece != null) self._built.push(piece);
                self._renderBuilt();
                self._renderPool();
            };
        });
    }

    _undo() {
        if (this._done || this.busy || !this._built.length) return;
        this._pool.push(this._built.pop());
        this._renderBuilt();
        this._renderPool();
    }

    _clearBuilt() {
        if (this._done || this.busy) return;
        this._pool = this._pool.concat(this._built);
        this._built = [];
        this._renderBuilt();
        this._renderPool();
    }

    _submit() {
        if (this._done || this.busy) return;
        var c = this.list[this.i];
        var builtStr = this._built.join('');
        var correctStr = this._correctBlocks.join('');
        // Also accept full target sentence without spaces difference
        var normBuilt = builtStr.replace(/\s+/g, '');
        var normCorrect = correctStr.replace(/\s+/g, '');
        var normTarget = (this._targetSentence || '').replace(/\s+/g, '');
        var ok = normBuilt === normCorrect || normBuilt === normTarget;

        // Order match (block-wise) as primary
        if (!ok && this._built.length === this._correctBlocks.length) {
            ok = this._built.every(function (b, i) { return b === this._correctBlocks[i]; }, this);
        }

        this.trackAnswer(c && c.id, ok, builtStr, correctStr, 0);
        this.answered = true;
        this.busy = true;
        this._done = true;

        // OQ2: free-play first-Check-only FSRS — subsequent Checks skip memory.
        // Session path uses MULTI_ATTEMPT_MODES + onGraded (analytics hook skipped).
        var wid = c && c.id;
        var alreadyGraded = wid != null && this._fsrsGraded[wid];
        var memMeta = alreadyGraded
            ? { applyMemory: false, skipMemory: true }
            : {};
        if (wid != null && !alreadyGraded) this._fsrsGraded[wid] = true;

        if (ok) {
            this.score(12, wid, memMeta);
            if (app.celebration) app.celebration.play();
            this.highlightQBox(this.dom.promptBox, true);
            this.dom.built.classList.add('border-emerald-400', 'bg-emerald-50', 'dark:bg-emerald-950');
            var pAudio = null;
            try {
                var tLang = this._targetLang();
                var conf = (typeof LANG_MAP !== 'undefined' && LANG_MAP.get) ? LANG_MAP.get(tLang) : null;
                var audioLang = (conf && conf.audioSrc) || tLang;
                pAudio = app.audio.play(this._targetSentence, audioLang, 'sentence_build', 0);
            } catch (_) {}
            this.waitAndNav(pAudio, 1800);
        } else {
            this.miss(wid, memMeta);
            this.highlightQBox(this.dom.promptBox, false);
            this.dom.built.classList.add('border-rose-400', 'bg-rose-50', 'dark:bg-rose-950');
            // Multi-attempt: show correct order briefly then allow rebuild/retry
            var self = this;
            setTimeout(function () {
                self.dom.built.classList.remove('border-rose-400', 'bg-rose-50', 'dark:bg-rose-950');
                self._built = [];
                self._pool = (window.SentenceUtils && SentenceUtils.shuffleBlocks)
                    ? SentenceUtils.shuffleBlocks(self._correctBlocks)
                    : self._correctBlocks.slice().sort(function () { return Math.random() - 0.5; });
                self._renderBuilt();
                self._renderPool();
                self._done = false;
                self.busy = false;
                self.answered = false;
            }, 1200);
        }
    }

}

window.SentenceBuild = SentenceBuild;
