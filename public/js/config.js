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

const CEFR_LEVELS = {
    A1: { label: 'Beginner', description: 'Can understand and use familiar everyday expressions and basic phrases', wordCountRange: '500-1000' },
    A2: { label: 'Elementary', description: 'Can communicate in routine tasks requiring a direct exchange of information on familiar matters', wordCountRange: '1000-2000' },
    B1: { label: 'Intermediate', description: 'Can deal with most situations likely to arise while travelling; can describe experiences and events', wordCountRange: '2000-3500' },
    B2: { label: 'Upper Intermediate', description: 'Can interact with a degree of fluency and spontaneity; can produce clear, detailed text on a wide range of subjects', wordCountRange: '3500-5500' },
    C1: { label: 'Advanced', description: 'Can express ideas fluently and spontaneously; can use language flexibly for social, academic and professional purposes', wordCountRange: '5500-8000' },
    C2: { label: 'Proficient', description: 'Can understand virtually everything heard or read with ease; can express themselves spontaneously with precision', wordCountRange: '8000-16000' }
};

function mapLevelToCEFR(level, langCode) {
    if (!level) return null;
    const jlptMap = { 'N5': 'A1', 'N4': 'A2', 'N3': 'B1', 'N2': 'B2', 'N1': 'C1' };
    const hskMap = { 'HSK1': 'A1', 'HSK2': 'A2', 'HSK3': 'B1', 'HSK4': 'B2', 'HSK5': 'C1', 'HSK6': 'C2' };
    const topikMap = { 'TOPIK1': 'A1', 'TOPIK2': 'A1', 'TOPIK3': 'A2', 'TOPIK4': 'B1', 'TOPIK5': 'B2', 'TOPIK6': 'C1' };

    const isJapanese = ['ja', 'ja_furi', 'ja_roma'].includes(langCode);
    const isChinese = ['zh', 'zh_pin'].includes(langCode);
    const isKorean = ['ko', 'ko_roma'].includes(langCode);

    if (isJapanese && jlptMap[level]) return jlptMap[level];
    if (isChinese && hskMap[level]) return hskMap[level];
    if (isKorean && topikMap[level]) return topikMap[level];

    if (CEFR_LEVELS[level]) return level;

    if (jlptMap[level]) return jlptMap[level];
    if (hskMap[level]) return hskMap[level];
    if (topikMap[level]) return topikMap[level];

    return null;
}

const LEVEL_CONFIG = {
    groups: [
        {
            key: 'jlpt', label: 'JLPT', langs: ['ja', 'ja_furi', 'ja_roma'],
            levels: ['N5', 'N4', 'N3', 'N2', 'N1']
        },
        {
            key: 'hsk', label: 'HSK', langs: ['zh', 'zh_pin'],
            levels: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6']
        },
        {
            key: 'topik', label: 'TOPIK', langs: ['ko', 'ko_roma'],
            levels: ['TOPIK1', 'TOPIK2', 'TOPIK3', 'TOPIK4', 'TOPIK5', 'TOPIK6']
        },
        {
            key: 'cefr', label: 'CEFR', langs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ru_tr'],
            levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
        }
    ],
    colors: {
        'N5': '#22c55e', 'N4': '#3b82f6', 'N3': '#a855f7', 'N2': '#f97316', 'N1': '#ef4444',
        'HSK1': '#22c55e', 'HSK2': '#3b82f6', 'HSK3': '#a855f7', 'HSK4': '#f97316', 'HSK5': '#ef4444', 'HSK6': '#dc2626',
        'TOPIK1': '#22c55e', 'TOPIK2': '#3b82f6', 'TOPIK3': '#a855f7', 'TOPIK4': '#f97316', 'TOPIK5': '#ef4444', 'TOPIK6': '#dc2626',
        'A1': '#22c55e', 'A2': '#3b82f6', 'B1': '#a855f7', 'B2': '#f97316', 'C1': '#ef4444', 'C2': '#dc2626'
    }
};

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

        levelFilter: ['all'],

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

        // Story Mode
        storyAutoRead: true,

        // LLM (Smart Cloze / Story Mode)
        llmEndpoint: 'http://localhost:11434',
        llmModel: 'gemma3:1b',
    };
};
