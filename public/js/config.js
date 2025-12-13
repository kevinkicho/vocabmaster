/* js/config.js */

const LANG_CONFIG = [
    { index: 0,  key: 'ja',       exKey: 'ja_ex', code: 'ja', label: 'Japanese',       icon: '🇯🇵', tts: 'ja-JP', secondary: 'ja_furi' },
    { index: 1,  key: 'ja_furi',  code: 'ja', label: 'Furigana',       icon: 'aaa', tts: 'ja-JP', visualOnly: true, audioSrc: 'ja' },
    { index: 2,  key: 'ja_roma',  code: 'en', label: 'Romaji (Ja)',    icon: 'abc', tts: 'en-US', visualOnly: true, audioSrc: 'ja' },
    { index: 3,  key: 'ko',       exKey: 'ko_ex', code: 'ko', label: 'Korean',         icon: '🇰🇷', tts: 'ko-KR', secondary: 'ko_roma' },
    { index: 4,  key: 'ko_roma',  code: 'en', label: 'Romaji (Ko)',    icon: 'abc', tts: 'en-US', visualOnly: true, audioSrc: 'ko' },
    { index: 5,  key: 'en',       exKey: 'en_ex', code: 'en', label: 'English',        icon: '🇺🇸', tts: 'en-US' },
    { index: 6,  key: 'zh',       exKey: 'zh_ex', code: 'zh', label: 'Chinese',        icon: '🇨🇳', tts: 'zh-CN', secondary: 'zh_pin' },
    { index: 7,  key: 'zh_pin',   code: 'zh', label: 'Pinyin',         icon: 'pin', tts: 'zh-CN', visualOnly: true, audioSrc: 'zh' },
    { index: 8,  key: 'es',       exKey: 'es_ex', code: 'es', label: 'Spanish',        icon: '🇪🇸', tts: 'es-ES' },
    { index: 9,  key: 'pt',       exKey: 'pt_ex', code: 'pt', label: 'Portuguese',     icon: '🇧🇷', tts: 'pt-BR' },
    { index: 10, key: 'it',       exKey: 'it_ex', code: 'it', label: 'Italian',        icon: '🇮🇹', tts: 'it-IT' },
    { index: 11, key: 'fr',       exKey: 'fr_ex', code: 'fr', label: 'French',         icon: '🇫🇷', tts: 'fr-FR' },
    { index: 12, key: 'de',       exKey: 'de_ex', code: 'de', label: 'German',         icon: '🇩🇪', tts: 'de-DE' },
    { index: 13, key: 'ru',       exKey: 'ru_ex', code: 'ru', label: 'Russian',        icon: '🇷🇺', tts: 'ru-RU', secondary: 'ru_tr' },
    { index: 14, key: 'ru_tr',    code: 'ru', label: 'Translit (Ru)',  icon: 'abc', tts: 'en-US', visualOnly: true, audioSrc: 'ru' }
];

const DEFAULT_CELEBS = [
    'Confetti', 'Stars', 'Discs', 'Coin', 'Money', 
    'Red Env', 'Sushi', 'Kimono', 'Carp', 
    'Torii', 'Sake', 'Bento', 'Dragon'
];

const GET_DEFAULTS = () => {
    return { 
        dark: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches, 
        anim: true,
        showAudioBtns: true, 
        masterAudio: true,   
        allowedCelebs: DEFAULT_CELEBS, 
        font: 'sans',
        
        globalClickMode: 'double', 
        audioWait: true,

        flashSpeed: "700",
        flashRandom: false,
        flashAuto: true,       
        flashFront: 'ja',      
        flashBack1: 'ja_furi',    
        flashBack2: 'en',
        flashBack3: 'ja_ex', 
        flashBack4: 'ja_roma', // FIX: Default to 'ja_roma' for better UI/UX

        quizQ: 'ja', quizA: 'en',
        quizRandom: false,
        quizAuto: true,        
        quizAudioSrc: 'ja',
        quizShowEx: false,
        quizExMain: 'ja',
        quizExSub: 'en',
        quizPlayEx: true,
        quizPlayCorrect: true,

        tfRandom: false,
        tfAuto: true,          
        tfFront: 'ja',
        tfBack: 'en',
        tfAudioSrc: 'ja',
        tfShowEx: false,
        tfExMain: 'ja',
        tfExSub: 'en',
        tfPlayEx: true,

        matchHint: true, 
        matchShowJa: true, matchShowEn: true,

        voiceAuto: true,
        voiceRandom: false,
        voiceAudioTarget: 'ja', 
        voiceDispFront: 'ja', 
        voiceDispBack: 'en',
        voicePlayEx: true,
        voiceExMain: 'ja',
        voicePlayCorrect: true,

        sentencesQ: 'ja',        
        sentencesA: 'ja',        
        sentencesTrans: 'en',
        sentencesBottomDisp: 'sentence', // 'sentence' | 'word' | 'none'
        sentencesAuto: true,     
        sentencesRandom: false,  
        sentencesAudioSrc: 'ja',
        sentencesPlayCorrect: true,

        hanziEnableTooltip: true,
        hanziAutoClose: "2000", 
    };
};
