/* js/config.js */

const FLAG_IMG = (code, alt) => `<img src="https://flagcdn.com/w40/${code}.png" class="w-7 h-5 rounded-sm" alt="${alt}">`;

const LANG_CONFIG = [
    { index: 0,  key: 'ja',       exKey: 'ja_ex', code: 'ja', label: 'Japanese',       icon: FLAG_IMG('jp','JP'), tts: 'ja-JP', secondary: 'ja_furi' },
    { index: 1,  key: 'ja_furi',  code: 'ja', label: 'Furigana',       icon: 'あ', tts: 'ja-JP', visualOnly: true, audioSrc: 'ja' },
    { index: 2,  key: 'ja_roma',  code: 'en', label: 'Romaji (Ja)',    icon: 'abc', tts: 'en-US', visualOnly: true, audioSrc: 'ja' },
    { index: 3,  key: 'ko',       exKey: 'ko_ex', code: 'ko', label: 'Korean',         icon: FLAG_IMG('kr','KR'), tts: 'ko-KR', secondary: 'ko_roma' },
    { index: 4,  key: 'ko_roma',  code: 'en', label: 'Romaji (Ko)',    icon: 'abc', tts: 'en-US', visualOnly: true, audioSrc: 'ko' },
    { index: 5,  key: 'en',       exKey: 'en_ex', code: 'en', label: 'English',        icon: FLAG_IMG('us','US'), tts: 'en-US' },
    { index: 6,  key: 'zh',       exKey: 'zh_ex', code: 'zh', label: 'Chinese',        icon: FLAG_IMG('cn','CN'), tts: 'zh-CN', secondary: 'zh_pin' },
    { index: 7,  key: 'zh_pin',   code: 'zh', label: 'Pinyin',         icon: 'pin', tts: 'zh-CN', visualOnly: true, audioSrc: 'zh' },
    { index: 8,  key: 'es',       exKey: 'es_ex', code: 'es', label: 'Spanish',        icon: FLAG_IMG('es','ES'), tts: 'es-ES' },
    { index: 9,  key: 'pt',       exKey: 'pt_ex', code: 'pt', label: 'Portuguese',     icon: FLAG_IMG('br','BR'), tts: 'pt-BR' },
    { index: 10, key: 'it',       exKey: 'it_ex', code: 'it', label: 'Italian',        icon: FLAG_IMG('it','IT'), tts: 'it-IT' },
    { index: 11, key: 'fr',       exKey: 'fr_ex', code: 'fr', label: 'French',         icon: FLAG_IMG('fr','FR'), tts: 'fr-FR' },
    { index: 12, key: 'de',       exKey: 'de_ex', code: 'de', label: 'German',         icon: FLAG_IMG('de','DE'), tts: 'de-DE' },
    { index: 13, key: 'ru',       exKey: 'ru_ex', code: 'ru', label: 'Russian',        icon: FLAG_IMG('ru','RU'), tts: 'ru-RU', secondary: 'ru_tr' },
    { index: 14, key: 'ru_tr',    code: 'ru', label: 'Translit (Ru)',  icon: 'abc', tts: 'en-US', visualOnly: true, audioSrc: 'ru' }
];

const DEFAULT_CELEBS = [
    'Confetti', 'Stars', 'Discs', 'Coin', 'Money', 
    'Red Env', 'Sushi', 'Kimono', 'Carp', 
    'Torii', 'Sake', 'Bento', 'Dragon'
];

const LANG_MAP = new Map(LANG_CONFIG.map(l => [l.key, l]));

const GET_DEFAULTS = () => {
    return { 
        dark: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches, 
        anim: true,
        showAudioBtns: true, 
        masterAudio: true,   
        allowedCelebs: DEFAULT_CELEBS, 
        
        // Font Control Defaults
        font: 'sans',
        fontStyle: 'normal',
        fontWeight: 'normal',
        
        globalClickMode: 'double', 
        audioWait: true,

        flashSpeed: "700",
        flashRandom: false,
        flashAuto: true,       
        flashFront: 'ja',      
        flashBack1: 'ja_furi',    
        flashBack2: 'en',
        flashBack3: 'ja_ex', 
        flashBack4: 'ja_roma',

        quizQ: 'ja', quizA: 'en',
        quizRandom: false,
        quizAuto: true,        
        quizAudioSrc: 'ja',
        quizShowEx: true, 
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
        tfPlayCorrect: true,

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
        sentencesBottomDisp: 'sentence_masked', 
        sentencesBottomLang: 'en',
        sentencesAuto: true,     
        sentencesRandom: false,  
        sentencesAudioSrc: 'ja',
        sentencesPlayCorrect: true,
        sentencesReadWhole: false, 

        hanziEnableTooltip: true,
        hanziAutoClose: "2000",

        // LLM (Smart Cloze)
        llmEndpoint: 'http://localhost:11434',
        llmModel: 'gemma3:1b',
    };
};
