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

        const source = this.getLang(sourceKey);
        const target = this.getLang(targetKey);
        if (!source || !target) return;

        const newPrefs = { ...app.store.prefs };

        // 1. Audio & Filters
        LANG_CONFIG.forEach(l => {
            const capKey = l.key.charAt(0).toUpperCase() + l.key.slice(1);
            const enable = (l.key === sourceKey || l.key === targetKey);
            newPrefs[`matchShow${capKey}`] = enable;
            if(!l.visualOnly) {
                newPrefs[`matchAudio_${l.key}`] = enable;
                newPrefs[`btnAudio_${l.key}`] = enable;
            }
        });

        // 2. Flashcards
        newPrefs.flashFront = target.key;
        newPrefs.flashAuto = true;
        newPrefs.flashAudioSrc = target.key;
        newPrefs.flashBack1 = target.secondary || source.key;
        newPrefs.flashBack2 = (target.secondary) ? source.key : (source.key === 'en' ? 'ja' : 'en');
        newPrefs.flashBack3 = target.exKey || ''; 
        newPrefs.flashBack4 = source.exKey || '';

        // 3. Quiz
        newPrefs.quizQ = target.key;
        newPrefs.quizA = source.key;
        newPrefs.quizAuto = true;
        newPrefs.quizAudioSrc = target.key;
        // CRITICAL FIX: Update Example Settings
        newPrefs.quizExMain = target.key;
        newPrefs.quizExSub = source.key;

        // 4. True/False
        newPrefs.tfFront = target.key;
        newPrefs.tfBack = source.key;
        newPrefs.tfAuto = true;
        newPrefs.tfAudioSrc = target.key;
        // CRITICAL FIX: Update Example Settings
        newPrefs.tfExMain = target.key;
        newPrefs.tfExSub = source.key;

        // 5. Matching
        newPrefs.matchHint = true;

        // 6. Voice
        newPrefs.voiceDispFront = target.key;
        newPrefs.voiceDispBack = source.key;
        newPrefs.voiceAudioTarget = target.key;
        newPrefs.voiceAuto = true;
        newPrefs.voiceExMain = target.key;

        // 7. Sentences (CRITICAL FIX)
        newPrefs.sentencesQ = target.key;       // Question Text: Target (e.g., Italian)
        newPrefs.sentencesA = target.key;       // Answer Options: Target (Pick the Italian word)
        newPrefs.sentencesTrans = source.key;   // Translation: Source (e.g., English)
        newPrefs.sentencesAudioSrc = target.key;// Audio: Target (Read Italian)
        newPrefs.sentencesShowTrans = true;     // Enable translation by default for help
        newPrefs.sentencesAuto = true;

        // Apply and Save
        app.store.applyPresetSettings(newPrefs);
    }

    getLang(key) {
        return this.languages.find(l => l.key === key);
    }
}
