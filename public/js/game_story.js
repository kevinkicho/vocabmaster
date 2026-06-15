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
        this.storiesPerSession = Infinity;
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
        for (const w of this.storyWords) {
            const word = w[lang] || w.ja || '';
            if (!word) continue;
            const variants = word.split(/[·・,;、\/|]/).map(s => s.trim()).filter(Boolean);
            for (const v of variants) {
                const escapedHtml = escapeHtml(v);
                const escaped = escapedHtml.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(escaped, 'g');
                html = html.replace(re, `<mark class="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-0.5 rounded font-bold">${escapedHtml}</mark>`);
            }
        }
        return this.wrapHanziOnEscaped(html);
    }

    async _pickWords(count) {
        // Respect active collection / level filter (Medium-term collections + tiers)
        const list = (app.data && typeof app.data.getFilteredList === 'function')
            ? app.data.getFilteredList()
            : (app.data ? app.data.activeList : []);

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
            const r = app.data.rand ? app.data.rand() : list[Math.floor(Math.random() * list.length)];
            if (r && !usedIds.has(r.id) && r.id !== undefined) { picked.push(r); usedIds.add(r.id); }
            safety++;
        }
        return picked;
    }

    _getTargetLang() {
        return app.store.prefs.sentencesQ || 'ja';
    }

    destroy() {
        this._destroyed = true;
        if (this._elapsedTimer) clearInterval(this._elapsedTimer);
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
