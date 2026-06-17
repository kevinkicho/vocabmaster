/* js/presets.js */
class PresetManager {
    constructor() {
        this.languages = typeof LANG_CONFIG !== 'undefined' 
            ? LANG_CONFIG.filter(l => !l.visualOnly) 
            : [];
    }

    apply(sourceKey, targetKey) {
        if (!sourceKey || !targetKey || sourceKey === targetKey) {
            app.ui.showToast("Please select two different languages.", 'warning');
            return;
        }
        const source = this.getLang(sourceKey);
        const target = this.getLang(targetKey);
        if (!source || !target) return;

        const newPrefs = { ...app.store.prefs };

        const schema = (typeof getAllPrefs === 'function') ? getAllPrefs(LANG_CONFIG) : [];
        schema.forEach(entry => {
            if (entry.presetBehavior === 'target') {
                newPrefs[entry.key] = target.key;
            } else if (entry.presetBehavior === 'source') {
                newPrefs[entry.key] = source.key;
            } else if (entry.presetBehavior === 'auto') {
                const langCode = entry.key.split('_')[1] || entry.key.replace('matchShow', '').toLowerCase();
                const enable = (langCode === source.key.toLowerCase() || langCode === target.key.toLowerCase());
                newPrefs[entry.key] = enable;
            }
        });

        // Special fallbacks
        newPrefs.flashAuto = true;
        newPrefs.quizAuto = true;
        newPrefs.tfAuto = true;
        newPrefs.voiceAuto = true;
        newPrefs.sentencesAuto = true;
        newPrefs.matchHint = true;
        newPrefs.sentencesShowTrans = true;

        newPrefs.flashBack1 = target.secondary || source.key;
        newPrefs.flashBack2 = (target.secondary) ? source.key : (source.key === 'en' ? 'ja' : 'en');
        newPrefs.flashBack3 = target.exKey || ''; 
        newPrefs.flashBack4 = source.exKey || '';

        // Save preset selection for UI display
        newPrefs.presetSource = source.key;
        newPrefs.presetTarget = target.key;

        app.store.applyPresetSettings(newPrefs);

        // When preset changes language pool (incl. matchShow*), clear any stale persisted match state
        // (the Match ctor re-uses old cards from matchState if present, which could have old languages like zh/ko).
        if (app && app.store && typeof app.store.clearMatch === 'function') {
            app.store.clearMatch();
        }

        // Soft refresh: update home screen filters and active game
        if (window.app && window.app.ui) {
            if (window.app.ui.renderTagFilter) window.app.ui.renderTagFilter();
            if (window.app.ui.renderLevelFilter) window.app.ui.renderLevelFilter();
        }
        if (window.app && window.app.game) {
            // Match game needs a hard reset (deal new cards)
            if (window.app.game.key === 'match' && typeof window.app.game.newGame === 'function') {
                window.app.game.newGame();
            } 
            // Other games just need to re-render the current view
            else if (typeof window.app.game.update === 'function') {
                window.app.game.update();
            }
        }
    }

    getLang(key) {
        return this.languages.find(l => l.key === key);
    }
}
