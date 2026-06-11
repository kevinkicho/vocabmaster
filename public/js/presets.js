/* js/presets.js */
class PresetManager {
    constructor() {
        this.languages = typeof LANG_CONFIG !== 'undefined' 
            ? LANG_CONFIG.filter(l => !l.visualOnly) 
            : [];
    }

    apply(sourceKey, targetKey) {
        if (!sourceKey || !targetKey || sourceKey === targetKey) {
            alert("Please select two different languages.");
            return;
        }
        // Phase 3 groundwork (from settings registry review): when stabilizing, we can replace
        // the manual ~40 assignments below with a schema-driven pass:
        //   const schema = (typeof getAllPrefs==='function') ? getAllPrefs(LANG_CONFIG):[];
        //   schema.forEach(entry => { if(entry.presetBehavior==='source') newPrefs[entry.key]=sourceKey; ... })
        // This centralizes presetBehavior:'target'|'source'|'auto'|'none' declared in preferences_registry.js
        // For now behavior is unchanged (manual is complete + battle-tested across activities).

        const source = this.getLang(sourceKey);
        const target = this.getLang(targetKey);
        if (!source || !target) return;

        const newPrefs = { ...app.store.prefs };

        LANG_CONFIG.forEach(l => {
            const capKey = l.key.charAt(0).toUpperCase() + l.key.slice(1);
            const enable = (l.key === sourceKey || l.key === targetKey);
            newPrefs[`matchShow${capKey}`] = enable;
            if(!l.visualOnly) {
                newPrefs[`matchAudio_${l.key}`] = enable;
                newPrefs[`btnAudio_${l.key}`] = enable;
            }
        });

        newPrefs.flashFront = target.key;
        newPrefs.flashAuto = true;
        newPrefs.flashAudioSrc = target.key;
        newPrefs.flashBack1 = target.secondary || source.key;
        newPrefs.flashBack2 = (target.secondary) ? source.key : (source.key === 'en' ? 'ja' : 'en');
        newPrefs.flashBack3 = target.exKey || ''; 
        newPrefs.flashBack4 = source.exKey || '';

        newPrefs.quizQ = target.key;
        newPrefs.quizA = source.key;
        newPrefs.quizAuto = true;
        newPrefs.quizAudioSrc = target.key;
        newPrefs.quizExMain = target.key;
        newPrefs.quizExSub = source.key;

        newPrefs.tfFront = target.key;
        newPrefs.tfBack = source.key;
        newPrefs.tfAuto = true;
        newPrefs.tfAudioSrc = target.key;
        newPrefs.tfExMain = target.key;
        newPrefs.tfExSub = source.key;

        newPrefs.matchHint = true;

        newPrefs.voiceDispFront = target.key;
        newPrefs.voiceDispBack = source.key;
        newPrefs.voiceAudioTarget = target.key;
        newPrefs.voiceAuto = true;
        newPrefs.voiceExMain = target.key;

newPrefs.sentencesQ = target.key;       
        newPrefs.sentencesA = target.key;       
        newPrefs.sentencesTrans = source.key;   
        newPrefs.sentencesAudioSrc = target.key;
        newPrefs.sentencesShowTrans = true;     
        newPrefs.sentencesAuto = true;
        // Save preset selection for UI display
        newPrefs.presetSource = source.key;
        newPrefs.presetTarget = target.key;

        app.store.applyPresetSettings(newPrefs);

        // When preset changes language pool (incl. matchShow*), clear any stale persisted match state
        // (the Match ctor re-uses old cards from matchState if present, which could have old languages like zh/ko).
        if (app && app.store && typeof app.store.clearMatch === 'function') {
            app.store.clearMatch();
        }

        // FIX: Auto-refresh active game
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
