/* js/preferences_registry.js — Single source of truth for all preferences
 * Preference schema used by store.js and ui.js for settings.
 */

const PREFERENCE_SCHEMA = [
  // ===== GLOBAL =====
  { key: 'dark',              type: 'bool',   default: function() { return matchMedia('(prefers-color-scheme:dark)').matches; }, domId: 'toggle-dark',              section: 'global', label: 'Dark Mode' },
  { key: 'anim',              type: 'bool',   default: true,    domId: 'toggle-anim',              section: 'global', label: 'Animations' },
  { key: 'showAudioBtns',     type: 'bool',   default: true,    domId: 'toggle-show-audio-btns',   section: 'global', label: 'Show Audio Buttons' },
  { key: 'masterAudio',       type: 'bool',   default: true,    domId: 'toggle-master-audio',      section: 'global', label: 'Master Audio' },
  { key: 'audioWait',         type: 'bool',   default: true,    domId: 'toggle-audio-wait',        section: 'global', label: 'Wait for Audio' },
  { key: 'font',              type: 'select', default: 'sans',  domId: 'app-font',                 section: 'global', label: 'Font' },
  { key: 'fontStyle',         type: 'select', default: 'normal',domId: 'app-font-style',           section: 'global', label: 'Font Style' },
  { key: 'fontWeight',        type: 'select', default: 'normal',domId: 'app-font-weight',          section: 'global', label: 'Font Weight' },
  { key: 'globalClickMode',   type: 'radio',  default: 'double',domId: 'global-click-mode',        section: 'global', label: 'Click Mode' },

  // ===== FLASHCARDS =====
  { key: 'flashSpeed',        type: 'select', default: '700',   domId: 'flash-speed',              section: 'flash', label: 'Flip Speed' },
  { key: 'flashAuto',         type: 'bool',   default: true,    domId: 'flash-auto',               section: 'flash', label: 'Auto Advance', presetBehavior: 'always' },
  { key: 'flashFront',        type: 'select', default: 'ja',    domId: 'flash-front',              section: 'flash', label: 'Front', presetBehavior: 'target' },
  { key: 'flashBack1',        type: 'select', default: 'ja_furi',domId: 'flash-back-1',            section: 'flash', label: 'Back 1', presetBehavior: 'manual' },
  { key: 'flashBack2',        type: 'select', default: 'en',    domId: 'flash-back-2',             section: 'flash', label: 'Back 2', presetBehavior: 'manual' },
  { key: 'flashBack3',        type: 'select', default: 'ja_ex', domId: 'flash-back-3',             section: 'flash', label: 'Back 3', presetBehavior: 'manual' },
  { key: 'flashBack4',        type: 'select', default: 'ja_roma',domId: 'flash-back-4',            section: 'flash', label: 'Back 4', presetBehavior: 'manual' },
  { key: 'flashAudioSrc',     type: 'select', default: 'ja',    domId: 'flash-audio-src',          section: 'flash', label: 'Audio Lang', presetBehavior: 'target' },

  // ===== QUIZ =====
  { key: 'quizQ',             type: 'select', default: 'ja',    domId: 'quiz-q-type',              section: 'quiz', label: 'Question Language', presetBehavior: 'target' },
  { key: 'quizA',             type: 'select', default: 'en',    domId: 'quiz-a-type',              section: 'quiz', label: 'Answer Language', presetBehavior: 'source' },
  { key: 'quizAuto',          type: 'bool',   default: true,    domId: 'quiz-auto',                section: 'quiz', label: 'Auto Advance', presetBehavior: 'always' },
  { key: 'quizAudioSrc',      type: 'select', default: 'ja',    domId: 'quiz-audio-src',           section: 'quiz', label: 'Audio Lang', presetBehavior: 'target' },
  { key: 'quizShowEx',        type: 'bool',   default: true,    domId: 'quiz-show-ex',             section: 'quiz', label: 'Show Examples' },
  { key: 'quizExMain',        type: 'select', default: 'ja',    domId: 'quiz-ex-main',             section: 'quiz', label: 'Main Example', presetBehavior: 'target' },
  { key: 'quizExSub',         type: 'select', default: 'en',    domId: 'quiz-ex-sub',              section: 'quiz', label: 'Sub Example', presetBehavior: 'source' },
  { key: 'quizPlayEx',        type: 'bool',   default: true,    domId: 'quiz-play-ex',             section: 'quiz', label: 'Play Example' },
  { key: 'quizPlayCorrect',   type: 'bool',   default: true,    domId: 'quiz-play-correct',        section: 'quiz', label: 'Play on Correct' },
  { key: 'quizPlayAnswer',    type: 'bool',   default: true,    domId: 'quiz-play-answer',         section: 'quiz', label: 'Play Answer' },

  // ===== TRUE/FALSE =====
  { key: 'tfAuto',            type: 'bool',   default: true,    domId: 'tf-auto',                  section: 'tf', label: 'Auto Advance', presetBehavior: 'always' },
  { key: 'tfFront',           type: 'select', default: 'ja',    domId: 'tf-front',                 section: 'tf', label: 'Front Language', presetBehavior: 'target' },
  { key: 'tfBack',            type: 'select', default: 'en',    domId: 'tf-back',                  section: 'tf', label: 'Back Language', presetBehavior: 'source' },
  { key: 'tfAudioSrc',        type: 'select', default: 'ja',    domId: 'tf-audio-src',             section: 'tf', label: 'Audio Lang', presetBehavior: 'target' },
  { key: 'tfShowEx',          type: 'bool',   default: false,   domId: 'tf-show-ex',               section: 'tf', label: 'Show Examples' },
  { key: 'tfExMain',          type: 'select', default: 'ja',    domId: 'tf-ex-main',               section: 'tf', label: 'Main Example', presetBehavior: 'target' },
  { key: 'tfExSub',           type: 'select', default: 'en',    domId: 'tf-ex-sub',                section: 'tf', label: 'Sub Example', presetBehavior: 'source' },
  { key: 'tfPlayEx',          type: 'bool',   default: true,    domId: 'tf-play-ex',               section: 'tf', label: 'Play Example' },
  { key: 'tfPlayCorrect',     type: 'bool',   default: true,    domId: 'tf-play-correct',          section: 'tf', label: 'Play on Correct' },

  // ===== MATCH =====
  { key: 'matchHint',         type: 'bool',   default: true,    domId: 'match-hint',               section: 'match', label: 'Flash Hint', presetBehavior: 'always' },

  // ===== VOICE =====
  { key: 'voiceAuto',         type: 'bool',   default: true,    domId: 'voice-auto',               section: 'voice', label: 'Auto Advance', presetBehavior: 'always' },
  { key: 'voiceDispFront',    type: 'select', default: 'ja',    domId: 'voice-disp-front',         section: 'voice', label: 'Display Front', presetBehavior: 'target' },
  { key: 'voiceDispBack',     type: 'select', default: 'en',    domId: 'voice-disp-back',          section: 'voice', label: 'Display Back', presetBehavior: 'source' },
  { key: 'voiceAudioTarget',  type: 'select', default: 'ja',    domId: 'voice-audio-target',       section: 'voice', label: 'Audio Target', presetBehavior: 'target' },
  { key: 'voicePlayEx',       type: 'bool',   default: true,    domId: 'voice-play-ex',            section: 'voice', label: 'Play Example' },
  { key: 'voiceExMain',       type: 'select', default: 'ja',    domId: 'voice-ex-main',            section: 'voice', label: 'Example Audio', presetBehavior: 'target' },
  { key: 'voicePlayCorrect',  type: 'bool',   default: true,    domId: 'voice-play-correct',       section: 'voice', label: 'Play on Correct' },

  // ===== SENTENCES =====
  { key: 'sentencesQ',        type: 'select', default: 'ja',    domId: 'sentences-q',              section: 'sentences', label: 'Question Language', presetBehavior: 'target' },
  { key: 'sentencesA',        type: 'select', default: 'ja',    domId: 'sentences-a',              section: 'sentences', label: 'Answer Language', presetBehavior: 'target' },
  { key: 'sentencesTrans',    type: 'select', default: 'en',    domId: 'sentences-trans',          section: 'sentences', label: 'Translation Lang', presetBehavior: 'source' },
  { key: 'sentencesBottomDisp',type:'select', default: 'sentence_masked',domId: 'sentences-bottom-disp',section: 'sentences', label: 'Bottom Display' },
  { key: 'sentencesBottomLang',type:'select', default: 'en',    domId: 'sentences-bottom-lang',    section: 'sentences', label: 'Bottom Language' },
  { key: 'sentencesAuto',     type: 'bool',   default: true,    domId: 'sentences-auto',           section: 'sentences', label: 'Auto Advance', presetBehavior: 'always' },
  { key: 'sentencesAudioSrc', type: 'select', default: 'ja',    domId: 'sentences-audio-src',      section: 'sentences', label: 'Audio Lang', presetBehavior: 'target' },
  { key: 'sentencesPlayCorrect',type:'bool',  default: true,    domId: 'sentences-play-correct',   section: 'sentences', label: 'Play on Correct' },
  { key: 'sentencesReadWhole',type: 'bool',   default: false,   domId: 'sentences-read-whole',     section: 'sentences', label: 'Read Whole' },

  // ===== GRAMMAR =====
  { key: 'grammarQ',          type: 'select', default: 'ja',    domId: 'grammar-q',               section: 'grammar', label: 'Question Language', presetBehavior: 'target' },
  { key: 'grammarA',          type: 'select', default: 'ja',    domId: 'grammar-a',               section: 'grammar', label: 'Answer Language', presetBehavior: 'target' },

  // ===== HANZI =====
  { key: 'hanziEnableTooltip',type: 'bool',   default: true,    domId: 'hanzi-enable-tooltip',     section: 'hanzi', label: 'Enable Tooltip' },
  { key: 'hanziAutoClose',    type: 'select', default: '2000',  domId: 'hanzi-tooltip-timer',      section: 'hanzi', label: 'Auto-close' },
  { key: 'hanziShowTrad',     type: 'bool',   default: true,    domId: 'hanzi-show-trad',          section: 'hanzi', label: 'Show Traditional' },
  { key: 'hanziShowSimp',     type: 'bool',   default: true,    domId: 'hanzi-show-simp',          section: 'hanzi', label: 'Show Simplified' },
  { key: 'hanziShowPinyin',   type: 'bool',   default: true,    domId: 'hanzi-show-pinyin',        section: 'hanzi', label: 'Show Pinyin' },
  { key: 'hanziShowKr',       type: 'bool',   default: true,    domId: 'hanzi-show-kr',            section: 'hanzi', label: 'Show Korean' },
  { key: 'hanziShowEn',       type: 'bool',   default: true,    domId: 'hanzi-show-en',            section: 'hanzi', label: 'Show English' },

  // ===== LLM / AI =====
  { key: 'llmEndpoint',       type: 'text',   default: 'http://localhost:11434',domId: 'llm-endpoint',          section: 'llm', label: 'Endpoint' },
  { key: 'llmModel',          type: 'select', default: 'gemma4:31b-cloud',domId: 'llm-model',                   section: 'llm', label: 'Model' },
  { key: 'storyAutoRead',     type: 'bool',   default: true,    domId: 'story-auto-read',                section: 'llm', label: 'Auto-read Story' },

  // ===== CHAT (no DOM binding — set via in-game UI) =====
  { key: 'chatScenario',      type: 'select', default: 'daily',  domId: null,                       section: 'chat', label: 'Chat Scenario' },
  { key: 'chatLevel',         type: 'select', default: 'B1',     domId: null,                       section: 'chat', label: 'Chat Level' },
  { key: 'chatAutoPlay',      type: 'bool',   default: true,     domId: null,                       section: 'chat', label: 'Chat Auto-play TTS' },
  { key: 'chatLang',          type: 'select', default: 'ja',     domId: null,                       section: 'chat', label: 'Chat Language' },

  // ===== LEVEL FILTER (no DOM binding) =====
  { key: 'levelFilter',       type: 'array',  default: ['all'], domId: null,                       section: 'level', label: 'Level Filter' },

  // ===== TAG FILTER (no DOM binding) =====
  { key: 'tagFilter',         type: 'array',  default: ['all'], domId: null,                       section: 'level', label: 'Tag Filter' },

  // ===== COLLECTION (Medium-term; dynamic UI in home + settings, persisted lightly) =====
  { key: 'currentCollection', type: 'select', default: 'all', domId: null,                       section: 'global', label: 'Active Collection' },
  { key: '_collectionKey',    type: 'text',   default: '',     domId: null,                       section: 'global', label: 'Collection Key' },

  // ===== THEME (no DOM binding — set via theme grid buttons) =====
  { key: 'theme',             type: 'text',   default: 'classic', domId: null,                    section: 'global', label: 'Visual Theme' },

  // ===== CELEBRATIONS (no DOM binding) =====
  { key: 'allowedCelebs',     type: 'array',  default: ['Confetti','Stars','Discs','Coin','Money','Red Env','Sushi','Kimono','Carp','Torii','Sake','Bento','Dragon'], domId: null, section: 'celebs', label: 'Celebrations' },

  // ===== SELECTED VOICES (handled by renderVoiceSelector) =====
  { key: 'selectedVoices',    type: 'object', default: {},       domId: null,                       section: 'voice', label: 'Selected Voices' },

  // ===== PRESET (UI state) =====
  { key: 'presetSource',      type: 'select', default: 'en',    domId: 'preset-source',            section: 'preset', label: 'Source Language' },
  { key: 'presetTarget',      type: 'select', default: 'ja',    domId: 'preset-target',            section: 'preset', label: 'Target Language' },

  // ===== DEBUG (override all auto-advance delays, -1 = use hardcoded defaults) =====
  { key: '_debugDelayMs',     type: 'number', default: -1,      domId: null,                       section: '_debug', label: 'Debug Delay Override' },
];

// ===== HELPER FUNCTIONS =====

function getPref(key) {
  return PREFERENCE_SCHEMA.find(function(p) { return p.key === key; });
}

function getPrefsBySection(section) {
  return PREFERENCE_SCHEMA.filter(function(p) { return p.section === section; });
}

function getDomBindingPrefs() {
  return PREFERENCE_SCHEMA.filter(function(p) { return p.domId; });
}

// Generate per-language dynamic prefs from LANG_CONFIG
function getLangPrefs(LANG_CONFIG) {
  const prefs = [];
  if (!LANG_CONFIG) return prefs;
  for (let i = 0; i < LANG_CONFIG.length; i++) {
    const l = LANG_CONFIG[i];
    if (l.visualOnly) continue;
    const cap = l.key.charAt(0).toUpperCase() + l.key.slice(1);
    prefs.push(
      { key: 'matchShow' + cap,    type: 'bool', default: true, domId: 'match-show-' + l.key,          section: 'match',  label: 'Show ' + l.label,    presetBehavior: 'auto' },
      { key: 'matchAudio_' + l.key,type: 'bool', default: true, domId: 'matchAudio-' + l.key,          section: 'match',  label: 'Match Audio ' + l.code,presetBehavior: 'auto' },
      { key: 'btnAudio_' + l.key,  type: 'bool', default: true, domId: 'btnAudio-' + l.key,            section: 'global', label: 'Btn ' + l.code,       presetBehavior: 'auto' }
    );
  }
  return prefs;
}

// Merge static + dynamic prefs
function getAllPrefs(LANG_CONFIG) {
  return PREFERENCE_SCHEMA.concat(getLangPrefs(LANG_CONFIG));
}

// Build a defaults object from the schema
function buildDefaultsFromSchema(LANG_CONFIG) {
  const all = getAllPrefs(LANG_CONFIG);
  const obj = {};
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    obj[p.key] = typeof p.default === 'function' ? p.default() : p.default;
  }
  return obj;
}

// Read a single pref from its DOM element
function readPrefFromDom(entry) {
  if (!entry.domId) return null;
  const el = document.getElementById(entry.domId);
  if (!el) return null;
  switch (entry.type) {
    case 'bool':
      return el.checked;
    case 'radio': {
      const rad = document.querySelector('input[name="' + entry.domId + '"]:checked');
      return rad ? rad.value : null;
    }
    case 'select':
    default:
      return el.value;
  }
}

// Write a single pref to its DOM element
function writePrefToDom(entry, value) {
  if (!entry.domId) return;
  // For radios, domId is the radio group name — there's no element with
  // that id, so skip the getElementById check and go straight to the
  // querySelector lookup by name.
  if (entry.type === 'radio') {
    const rad = document.querySelector('input[name="' + entry.domId + '"][value="' + value + '"]');
    if (rad) {
      rad.checked = true;
      // Sync visual state — peer-checked CSS is unreliable when set
      // programmatically. Without this, the span labels stay greyed
      // out even though the radio is checked.
      if (window.app && app.ui && typeof app.ui._syncRadioVisual === 'function') {
        app.ui._syncRadioVisual(entry.domId);
      }
    }
    return;
  }
  const el = document.getElementById(entry.domId);
  if (!el) return;
  switch (entry.type) {
    case 'bool':
      el.checked = value;
      break;
    default:
      el.value = value != null ? value : '';
  }
}
