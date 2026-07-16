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

        // Daily Session AI seed (prefer these in _pickWords / cache intersect)
        // May be set via app._sessionStorySeedWordIds before construct (race-safe)
        this.sessionSeedWordIds = null;
        try {
            if (typeof app !== 'undefined' && app && app._sessionStorySeedWordIds &&
                app._sessionStorySeedWordIds.length) {
                this.sessionSeedWordIds = app._sessionStorySeedWordIds.slice();
            }
        } catch (_) { /* ignore */ }

        // Session progress
        this.storiesPerSession = Infinity;
        this.storyNum = 0;      // how many stories completed or in-progress (1-based during play)

        // RTDB story cache
        this._cachedStories = []; // fetched from RTDB at session start
        this._cachedIndex = 0;
        this._cacheLoaded = false;
        this._highlightsVisible = false;
        this._showTranslation = false;
        this._currentStoryTranslation = null;
        this._currentCompositeKey = null;
        this._currentStoryLang = null;
        this._generationId = 0;
        this._storyLevel = (function(self) {
            var p = app.store.prefs;
            return p.chatLevel || 'B1';
        })(this);

        this.render();
    }

    render() {
        this.root.classList.remove('visible');
        this.answered = false;
        this.busy = false;

        // Always render the story shell. LLM readiness is only required for *fresh* AI generation.
        // Cached stories from RTDB work without a live connection.
        // Supports local ollama4android (exposes standard Ollama API on 11434) or cloud.
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

    
    // ── Helpers ──────────────────────────────────────────────────────


    _highlightWords(text) {
        const lang = this._getTargetLang();
        let html = escapeHtml(text);
        if (this._highlightsVisible) {
            for (const w of this.storyWords) {
                const word = w[lang] || w.ja || '';
                if (!word) continue;
                const variants = word.split(/[·・,;、\/|]/).map(s => s.trim()).filter(Boolean);
                for (const v of variants) {
                    const escaped = escapeHtml(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const re = new RegExp(escaped, 'gi');
                    html = html.replace(re, `<mark class="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-0.5 rounded font-bold">$&</mark>`);
                }
            }
        }
        // Wrap hanzi characters, but skip content inside HTML tags
        return html.replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF])(?![^<]*>)/g,
            '<span class="hanzi-char cursor-help transition-colors" data-char="$1">$1</span>');
    }

    async _pickWords(count) {
        const list = (app.data && typeof app.data.getFilteredList === 'function')
            ? app.data.getFilteredList()
            : (app.data ? app.data.activeList : []);

        if (!list || list.length === 0) return [];

        var picked = [];
        var usedIds = new Set();
        var lang = this._getTargetLang();
        var safety = 0;

        // Prefer Daily Session seeds (sessionSeedWordIds / due-first plan seed)
        var seeds = this.sessionSeedWordIds;
        if ((!seeds || !seeds.length) && typeof app !== 'undefined' && app &&
            app._sessionStorySeedWordIds && app._sessionStorySeedWordIds.length) {
            seeds = app._sessionStorySeedWordIds;
            this.sessionSeedWordIds = seeds.slice();
        }
        if (seeds && seeds.length) {
            var byId = new Map();
            var sources = [list];
            try {
                if (app.data && app.data.list && app.data.list.length) sources.push(app.data.list);
                if (app.data && app.data.activeList && app.data.activeList.length) {
                    sources.push(app.data.activeList);
                }
            } catch (_) { /* ignore */ }
            for (var s = 0; s < sources.length; s++) {
                var src = sources[s];
                for (var i = 0; i < src.length; i++) {
                    var w = src[i];
                    if (w && w.id != null && !byId.has(Number(w.id))) {
                        byId.set(Number(w.id), w);
                    }
                }
            }
            for (var si = 0; si < seeds.length && picked.length < count; si++) {
                var sid = Number(seeds[si]);
                if (!Number.isFinite(sid) || usedIds.has(sid)) continue;
                var sw = byId.get(sid);
                if (sw && (sw[lang] || sw.ja || sw.en)) {
                    picked.push(sw);
                    usedIds.add(sid);
                }
            }
            L('[Story] _pickWords preferred', picked.length, 'session seeds of', count);
        }

        // Fill remainder randomly from filtered list
        while (picked.length < count && safety < 100) {
            var r = list[Math.floor(Math.random() * list.length)];
            if (r && !usedIds.has(r.id) && r.id !== undefined && (r[lang] || r.ja || r.en)) {
                picked.push(r);
                usedIds.add(r.id);
            }
            safety++;
        }
        return picked;
    }

    _getTargetLang() {
        var p = app.store.prefs;
        return p.presetTarget || p.chatLang || p.flashFront || p.sentencesQ || 'ja';
    }

    destroy() {
        this._destroyed = true;
        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
        if (app.audio) app.audio.cancel();
        super.destroy();
    }

    // Separate from GameMode.nav — Story navigates questions, not word list index
    navQuestion(d) {
        if (this.streaming) return;
        this._loadNext();
    }

    triggerAction(action) {
        if (action === 'next' || action === 'up') this.navQuestion(1);
    }

    update() { this.render(); }
}
