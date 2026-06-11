/* js/collection-bar.js */

const CollectionBar = {
    getOptions() {
        if (typeof VOCAB_COLLECTIONS === 'undefined') return [];
        return [
            { key: '', label: 'Default', icon: '📚', lang: '' },
            { key: 'spanishA1', label: 'ES A1', icon: '🇪🇸', lang: 'es' },
            { key: 'spanishA2', label: 'ES A2', icon: '🇪🇸', lang: 'es' },
            { key: 'spanishB1', label: 'ES B1', icon: '🇪🇸', lang: 'es' },
            { key: 'spanishB2', label: 'ES B2', icon: '🇪🇸', lang: 'es' },
            { key: 'frenchA1', label: 'FR A1', icon: '🇫🇷', lang: 'fr' },
            { key: 'frenchA2', label: 'FR A2', icon: '🇫🇷', lang: 'fr' },
            { key: 'frenchB1', label: 'FR B1', icon: '🇫🇷', lang: 'fr' },
            { key: 'frenchB2', label: 'FR B2', icon: '🇫🇷', lang: 'fr' },
            { key: 'germanA1', label: 'DE A1', icon: '🇩🇪', lang: 'de' },
            { key: 'germanA2', label: 'DE A2', icon: '🇩🇪', lang: 'de' },
            { key: 'germanB1', label: 'DE B1', icon: '🇩🇪', lang: 'de' },
            { key: 'germanB2', label: 'DE B2', icon: '🇩🇪', lang: 'de' },
            { key: 'italianA1', label: 'IT A1', icon: '🇮🇹', lang: 'it' },
            { key: 'italianA2', label: 'IT A2', icon: '🇮🇹', lang: 'it' },
            { key: 'italianB1', label: 'IT B1', icon: '🇮🇹', lang: 'it' },
            { key: 'italianB2', label: 'IT B2', icon: '🇮🇹', lang: 'it' },
            { key: 'portugueseA1', label: 'PT A1', icon: '🇵🇹', lang: 'pt' },
            { key: 'portugueseA2', label: 'PT A2', icon: '🇵🇹', lang: 'pt' },
            { key: 'portugueseB1', label: 'PT B1', icon: '🇵🇹', lang: 'pt' },
            { key: 'portugueseB2', label: 'PT B2', icon: '🇵🇹', lang: 'pt' },
            { key: 'japaneseN5', label: 'JP N5', icon: '🇯🇵', lang: 'ja' },
            { key: 'japaneseN4', label: 'JP N4', icon: '🇯🇵', lang: 'ja' },
            { key: 'chineseHSK1', label: 'CN HSK1', icon: '🇨🇳', lang: 'zh' },
            { key: 'chineseHSK2', label: 'CN HSK2', icon: '🇨🇳', lang: 'zh' },
            { key: 'koreanTOPIK1', label: 'KR TOPIK1', icon: '🇰🇷', lang: 'ko' },
            { key: 'koreanTOPIK2', label: 'KR TOPIK2', icon: '🇰🇷', lang: 'ko' },
            { key: 'russianA1', label: 'RU A1', icon: '🇷🇺', lang: 'ru' },
            { key: 'russianA2', label: 'RU A2', icon: '🇷🇺', lang: 'ru' },
        ];
    },

    render(containerEl) {
        if (!containerEl) return;
        const options = this.getOptions();
        if (options.length <= 1) { containerEl.innerHTML = ''; return; }
        const currentKey = app.store && app.store.prefs ? (app.store.prefs._collectionKey || '') : '';
        const btns = options.map(opt => {
            const active = opt.key === currentKey;
            const cls = active
? 'bg-violet-500 text-white border-violet-500'
    : 'bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-200 border-slate-200 dark:border-neutral-700';
            return `<button class="${cls} border rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors" onclick="CollectionBar.load('${opt.key}')">${opt.icon} ${opt.label}</button>`;
        }).join('');
        containerEl.innerHTML = `<div class="flex items-center gap-1 overflow-x-auto scrollbar-hide">${btns}</div>`;
    },

    load(key) {
        if (key === '') {
            app.data.resetToDefaultList();
            if (app.store && app.store.prefs) app.store.prefs._collectionKey = '';
        } else {
            const loaded = app.data.loadCollection(key);
            if (!loaded) return;
            if (app.store && app.store.prefs) {
                app.store.prefs._collectionKey = key;
                const options = this.getOptions();
                const opt = options.find(o => o.key === key);
                if (opt && opt.lang) {
                    if (typeof LANG_CONFIG !== 'undefined' && LANG_MAP && LANG_MAP.get(opt.lang)) {
                        const conf = LANG_MAP.get(opt.lang);
                        const mode = app.game ? app.game.key : '';
                        if (mode === 'sentences') {
                            app.store.prefs.sentencesQ = opt.lang;
                            app.store.prefs.sentencesA = 'en';
                            if (conf.exKey) app.store.prefs.sentencesAudioSrc = conf.audioSrc || opt.lang;
                        } else if (mode === 'flash') {
                            app.store.prefs.flashFront = opt.lang;
                            app.store.prefs.flashBack1 = 'en';
                        } else if (mode === 'quiz') {
                            app.store.prefs.quizQ = opt.lang;
                            app.store.prefs.quizA = 'en';
                        } else if (mode === 'tf') {
                            app.store.prefs.tfFront = opt.lang;
                            app.store.prefs.tfBack = 'en';
                        }
                    }
                }
            }
        }
        const game = app.game;
        if (game) {
            game.list = app.data.getFilteredList();
            game.i = 0;
            game.historyStack = [0];
            game.historyPtr = 0;
            game.save();
            if (game._collectionBarEl) {
                this.render(game._collectionBarEl);
            }
            game.update();
        }
    }
};