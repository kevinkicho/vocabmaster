/* js/chat_panel.js — Shared chat engine (prompts, history, memory markers)
 * Used by full Chat Practice (game_chat.js) and Chat FAB mini sheet.
 * window.ChatPanel
 */

var ChatPanel = (function () {
    var SCENARIO_DESC = {
        daily: 'Daily life conversations (greetings, weather, family, routines)',
        restaurant: 'Ordering food at a restaurant, interacting with waitstaff',
        travel: 'Travel situations (hotel, directions, transportation)',
        business: 'Business meetings, emails, professional interactions',
        hobby: 'Discussing hobbies, interests, and free time activities',
        custom: 'Free conversation on any topic',
        // Unit theme aliases
        home: 'Home life, family, and daily routines',
        school: 'School, classes, and studying',
        food: 'Food, cooking, and restaurants',
        shopping: 'Shopping and prices',
        health: 'Health and body',
        work: 'Work and workplace',
        culture: 'Culture, media, and society'
    };

    function langName(code) {
        try {
            if (app.llm && app.llm._getLangName) return app.llm._getLangName(code);
        } catch (_) {}
        var map = { ja: 'Japanese', ko: 'Korean', zh: 'Chinese', en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian' };
        return map[code] || code;
    }

    function resolveScenario(opts) {
        opts = opts || {};
        if (opts.scenario && opts.scenario !== 'auto') return opts.scenario;
        try {
            if (app.learningPath && app.learningPath.getActiveUnit) {
                var unit = app.learningPath.getActiveUnit();
                if (unit && unit.theme) return unit.theme;
                if (unit && unit.themeTags && unit.themeTags[0]) return unit.themeTags[0];
            }
            if (app.learningPath && app.learningPath.getUnitTheme) {
                var t = app.learningPath.getUnitTheme();
                if (t) return t;
            }
        } catch (_) {}
        return (app.store && app.store.prefs && app.store.prefs.chatScenario) || 'daily';
    }

    function resolveLevel(opts) {
        opts = opts || {};
        if (opts.level) return opts.level;
        try {
            if (app.learningPath && app.learningPath.getProfile) {
                var p = app.learningPath.getProfile();
                if (p && p.currentTier) return p.currentTier;
            }
        } catch (_) {}
        return (app.store && app.store.prefs && app.store.prefs.chatLevel) || 'B1';
    }

    /**
     * Immersive partner prompt (full Chat Practice).
     */
    function buildImmersivePrompt(opts) {
        opts = opts || {};
        var lang = opts.targetLang || 'ja';
        var level = resolveLevel(opts);
        var scenario = resolveScenario(opts);
        var scenarioDesc = SCENARIO_DESC[scenario] || SCENARIO_DESC.daily;
        var memories = opts.memories || [];
        var messages = opts.messages || [];
        var maxHistory = opts.maxHistory || 6;
        var userMessage = opts.userMessage || '';

        var memoriesSection = '';
        if (memories.length > 0) {
            memoriesSection = 'Previous session context:\n' + memories.map(function (m) {
                return '- ' + (m.summary || '');
            }).join('\n');
        }

        var lname = langName(lang);
        var system = 'You are a ' + lname + ' conversation partner.\n'
            + 'RULE: Every response you write MUST be entirely in ' + lname + '.\n'
            + 'No matter what language the user writes in, you reply only in ' + lname + '.\n\n'
            + 'Scenario: ' + scenarioDesc + '\n'
            + 'Learner level: ' + level + '\n'
            + (memoriesSection ? memoriesSection + '\n' : '')
            + '\nGuidelines:\n'
            + '- Reply in ' + lname + ' only, 2-3 sentences\n'
            + '- Use ' + level + '-appropriate vocabulary\n'
            + '- Gently correct mistakes in ' + lname + '\n'
            + '- End with a follow-up question in ' + lname + '\n'
            + '\nOptional [MEMORY: {"summary":"...","topics":[],"level":"' + level + '"}] at end.';

        var history = messages.slice(-maxHistory * 2).map(function (m) {
            return '[' + lang + '] ' + (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.text;
        }).join('\n');

        return {
            system: system,
            prompt: history + '\n[' + lang + '] User: ' + userMessage + '\n[' + lang + '] Assistant:',
            scenario: scenario,
            level: level
        };
    }

    /**
     * Bilingual tutor prompt (FAB sheet / explanations).
     */
    function buildTutorPrompt(opts) {
        opts = opts || {};
        var known = opts.knownLang || 'en';
        var target = opts.targetLang || 'ja';
        var level = resolveLevel(opts);
        var scenario = resolveScenario(opts);
        var context = opts.context || {};
        var messages = opts.messages || [];
        var userMessage = opts.userMessage || '';

        var parts = [
            'You are a friendly bilingual language tutor.',
            'Learner knows: ' + known + '. Target language: ' + target + ' (level ' + level + ').',
            'Respond primarily in ' + target + ' with brief explanations in ' + known + ' when helpful.',
            'Keep replies short (2-5 sentences). Be encouraging and concrete.',
            'Scenario flavor: ' + (SCENARIO_DESC[scenario] || scenario) + '.'
        ];
        if (context.word) parts.push('Current study word: ' + context.word + '.');
        if (context.gameMode) parts.push('They are mid-activity: ' + context.gameMode + '.');
        if (context.unitId) parts.push('Path unit: ' + context.unitId + '.');

        var history = messages.slice(-12).map(function (m) {
            return (m.role === 'user' ? 'User: ' : 'Tutor: ') + m.text;
        }).join('\n');

        return {
            system: parts.join(' '),
            prompt: history + '\nUser: ' + userMessage + '\nTutor:',
            scenario: scenario,
            level: level
        };
    }

    function buildOpeningPrompt(opts) {
        opts = opts || {};
        var lang = opts.targetLang || 'ja';
        var lname = langName(lang);
        var scenario = resolveScenario(opts);
        return {
            system: 'You are a ' + lname + ' conversation partner. Write everything in ' + lname + ' only.\n'
                + 'Greet the user in ' + lname + ' and ask an opening question about ' + scenario + '.\n'
                + '1-2 sentences, all in ' + lname + '.',
            prompt: '[' + lname + '] Start the conversation. Greet the user and ask a question about ' + scenario + '.',
            scenario: scenario
        };
    }

    function parseMemoryMarker(text) {
        var match = text.match(/\[MEMORY:\s*(\{.*?\})\]/);
        if (match) {
            try {
                return { json: JSON.parse(match[1]), cleaned: text.replace(match[0], '').trim() };
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    return {
        SCENARIO_DESC: SCENARIO_DESC,
        langName: langName,
        resolveScenario: resolveScenario,
        resolveLevel: resolveLevel,
        buildImmersivePrompt: buildImmersivePrompt,
        buildTutorPrompt: buildTutorPrompt,
        buildOpeningPrompt: buildOpeningPrompt,
        parseMemoryMarker: parseMemoryMarker
    };
})();

window.ChatPanel = ChatPanel;
