/* js/game_chat.js — Chat Practice mode (AI conversation)
 *
 * Extends GameMode. Provides an AI conversation partner that:
 *   - Maintains a rolling message history (max 6 turns) + memory summaries
 *     to keep prompts compact across long conversations.
 *   - Generates the first AI message with a scenario-aware greeting in the
 *     target language (daily/travel/business/etc. per chatScenario pref).
 *   - Streams AI responses via app.llm.streamGenerate with a typing indicator
 *     and cancel button.
 *   - Renders markdown in AI bubbles (snarkdown) with TTS playback on first
 *     bubble; tap-to-TTS on subsequent bubbles.
 *   - Supports speech-to-text input via webkitSpeechRecognition (mic button),
 *     with locale mapping per target language.
 *   - Is exam-level aware: extracts level from vocab tags or chatLevel pref,
 *     shows a clickable level badge in the header (JLPT N5-N1 + CEFR A1-C2
 *     popover) to control the AI's output difficulty.
 *   - Uses a two-phase critic pipeline: the LLM outputs raw HTML, the client
 *     splits by <p> tags for stable layout. The critic owns all bubble styling.
 *
 * Instance state: messages[], turn, busy, maxHistory, memories[], abortController,
 *   recognition (SpeechRecognition), _speechActive, _storyLevel.
 *
 * Depends on: GameMode (game_core.js), app.llm (llm/), app.audio (services.js),
 *   app.store.prefs.chat* (store.js), escapeHtml + L (escape.js), snarkdown.
 */

class Chat extends GameMode {
    constructor(k) {
        super(k);
        this.messages = [];
        this.turn = 0;
        this.busy = false;
        this.maxHistory = 6;
        this.memories = [];
        this.abortController = null;
        this.recognition = null;
        this._speechActive = false;
        this._stickToBottom = true;
        this._typingBubble = false;
        this._transcript = null;
        this._transcriptLoadIndex = 0;
        this._transcriptPageSize = 6;
        this._init();
    }

    async _init() {
        await this._loadMemories();
        await this._loadTranscript();
        this.render();
    }

    _getTargetLang() {
        var p = app.store.prefs;
        return p.presetTarget || p.chatLang || p.flashFront || p.sentencesQ || 'ja';
    }

    _getLevelsForLang(lang) {
        if (lang === 'ja') return [
            { code: 'N5', desc: 'Beginner — basic grammar, simple sentences', framework: 'JLPT' },
            { code: 'N4', desc: 'Elementary — everyday conversations, past tense', framework: 'JLPT' },
            { code: 'N3', desc: 'Intermediate — opinions, newspaper headlines', framework: 'JLPT' },
            { code: 'N2', desc: 'Upper intermediate — complex texts, nuanced speech', framework: 'JLPT' },
            { code: 'N1', desc: 'Advanced — academic, professional, native-like', framework: 'JLPT' },
        ];
        if (lang === 'zh') return [
            { code: 'HSK1', desc: 'Beginner — basic phrases, pinyin', framework: 'HSK' },
            { code: 'HSK2', desc: 'Elementary — simple conversations', framework: 'HSK' },
            { code: 'HSK3', desc: 'Intermediate — daily topics, 600 words', framework: 'HSK' },
            { code: 'HSK4', desc: 'Upper intermediate — news, 1200 words', framework: 'HSK' },
            { code: 'HSK5', desc: 'Advanced — complex texts, 2500 words', framework: 'HSK' },
            { code: 'HSK6', desc: 'Proficient — fluent, 5000+ words', framework: 'HSK' },
        ];
        if (lang === 'ko') return [
            { code: 'TOPIK1', desc: 'Beginner — basic greetings, hangul', framework: 'TOPIK' },
            { code: 'TOPIK2', desc: 'Elementary — daily life, simple sentences', framework: 'TOPIK' },
            { code: 'TOPIK3', desc: 'Intermediate — opinions, social topics', framework: 'TOPIK' },
            { code: 'TOPIK4', desc: 'Upper intermediate — news, academic texts', framework: 'TOPIK' },
            { code: 'TOPIK5', desc: 'Advanced — professional, nuanced speech', framework: 'TOPIK' },
        ];
        return [
            { code: 'A1', desc: 'Beginner — simple words, short sentences', framework: 'CEFR' },
            { code: 'A2', desc: 'Elementary — past tense, everyday topics', framework: 'CEFR' },
            { code: 'B1', desc: 'Intermediate — opinions, travel situations', framework: 'CEFR' },
            { code: 'B2', desc: 'Upper intermediate — idioms, fluent topics', framework: 'CEFR' },
            { code: 'C1', desc: 'Advanced — complex ideas, academic language', framework: 'CEFR' },
            { code: 'C2', desc: 'Proficient — near-native, subtle nuance', framework: 'CEFR' },
        ];
    }

    _getSourceLang() {
        return app.store.prefs.presetSource || 'en';
    }

    toggleSpeech() {
        if (this._speechActive) return;
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (app.ui) app.ui.showToast('Voice input not supported in this browser.', 'error');
            return;
        }
        this._speechActive = true;
        var lang = this._getTargetLang();
        var localeMap = { ja:'ja-JP', en:'en-US', ko:'ko-KR', zh:'zh-CN', es:'es-ES', fr:'fr-FR', de:'de-DE', it:'it-IT', pt:'pt-BR', ru:'ru-RU' };
        var recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = localeMap[lang] || 'en-US';
        var self = this;
        recognition.onresult = function(e) {
            if (!e.results[0].isFinal) return;
            var transcript = e.results[0][0].transcript;
            if (self.dom.input) {
                self.dom.input.value = transcript;
                self.sendMessage();
            }
        };
        recognition.onerror = function() {
            self._speechActive = false;
            if (app.ui) app.ui.showToast('Speech recognition failed. Try again or type instead.', 'error');
        };
        recognition.onend = function() {
            self._speechActive = false;
            if (self.dom.mic) {
                self.dom.mic.classList.remove('text-rose-500', 'animate-pulse');
            }
        };
        try {
            recognition.start();
            if (this.dom.mic) {
                this.dom.mic.classList.add('text-rose-500', 'animate-pulse');
            }
        } catch (e) {
            self._speechActive = false;
            if (app.ui) app.ui.showToast('Speech recognition not available on this device. Type instead.', 'error');
        }
    }

    async _loadMemories() {
        try {
            var uid = auth && auth.currentUser && auth.currentUser.uid;
            if (!uid || !db) return;
            var snap = await db.ref('users/' + uid + '/chat_memory').orderByChild('ts').once('value');
            if (!snap.exists()) return;
            var now = Date.now();
            var thirtyDays = 30 * 24 * 60 * 60 * 1000;
            var recent = [];
            var self = this;
            snap.forEach(function(c) {
                var val = c.val();
                if (now - val.ts > thirtyDays) {
                    c.ref.remove();
                } else {
                    recent.push(val);
                }
            });
            this.memories = recent.sort(function(a,b) { return b.ts - a.ts; }).slice(0, 3);
        } catch(e) {}
    }

    async _loadTranscript() {
        var lang = this._getTargetLang();
        try {
            var cached = localStorage.getItem('chat_transcript_' + lang);
            if (cached) {
                var parsed = JSON.parse(cached);
                if (parsed.messages && parsed.messages.length > 0) {
                    this._transcript = parsed;
                }
            }
        } catch(e) {}
        var uid = auth && auth.currentUser && auth.currentUser.uid;
        if (uid && db) {
            try {
                var snap = await db.ref('users/' + uid + '/chat_transcripts/' + lang).once('value');
                if (snap.exists()) {
                    var val = snap.val();
                    if (val.messages && val.messages.length > 0) {
                        this._transcript = val;
                        try { localStorage.setItem('chat_transcript_' + lang, JSON.stringify(val)); } catch(e) {}
                    }
                }
            } catch(e) {}
        }
    }

    async _saveTranscript() {
        var uid = auth && auth.currentUser && auth.currentUser.uid;
        var lang = this._getTargetLang();
        if (!uid || !db || this.messages.length === 0) return;
        var entry = {
            messages: this.messages.map(function(m) {
                var html = '';
                if (m.units && m.units.length > 0) {
                    html = m.units.map(function(u) { return u.html || escapeHtml(u.text || ''); }).join('');
                }
                return { role: m.role, text: m.text, html: html || '' };
            }),
            scenario: app.store.prefs.chatScenario || 'daily',
            level: app.store.prefs.chatLevel || 'B1',
            lang: lang,
            ts: Date.now()
        };
        try {
            await db.ref('users/' + uid + '/chat_transcripts/' + lang).set(entry);
        } catch(e) {}
        try { localStorage.setItem('chat_transcript_' + lang, JSON.stringify(entry)); } catch(e) {}
    }

    _closeTags(html) {
        return html.replace(/<(strong|em|li)>([^<]*?)(?=<\/(?:strong|em|li)>|$)/g, '<$1>$2</$1>');
    }

    async _formatPresentation(text, lang) {
        if (!app.llm || !app.llm.available || !app.llm.hasModel) return [{ text: text, lang: lang, html: escapeHtml(text) }];
        var tryFormat = async function(timeout, simple) {
            var prompt = simple
                ? 'Format this ' + lang + ' text as HTML. Use <p> for each sentence. Output ONLY the HTML.\n\nText: "' + text + '"'
                : 'Format this ' + lang + ' language tutor response as HTML for chat display.\n'
                    + 'Use <p> for each sentence or phrase.\n'
                    + 'Use <strong> for vocabulary words to emphasize.\n'
                    + 'Use <em> for example phrases.\n'
                    + 'Use <ul><li> for bullet lists.\n'
                    + 'Output ONLY the HTML. No markdown, no backticks, no extra text.\n\n'
                    + 'Response: "' + text + '"';
            return await app.llm.generate({
                prompt: prompt,
                options: { num_predict: simple ? 512 : 1024, temperature: 0 },
                timeout: timeout
            });
        };
        try {
            var result;
            try { result = await tryFormat(20000, false); }
            catch(e) {
                L('[Chat] Critic first attempt failed, retrying with simpler prompt');
                result = await tryFormat(30000, true);
            }
            var cleaned = this._closeTags(result.trim());
            var parts = cleaned.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [cleaned];
            var units = [];
            for (var i = 0; i < parts.length; i++) {
                var html = parts[i].trim();
                if (!html) continue;
                var rawText = html.replace(/<[^>]*>/g, '').trim();
                if (!rawText) continue;
                units.push({ text: rawText, lang: lang, html: html });
            }
            return units.length > 0 ? units : [{ text: text, lang: lang, html: escapeHtml(text) }];
        } catch(e) { return [{ text: text, lang: lang, html: escapeHtml(text) }]; }
    }

    _buildPrompt(userMessage) {
        if (window.ChatPanel && ChatPanel.buildImmersivePrompt) {
            return ChatPanel.buildImmersivePrompt({
                targetLang: this._getTargetLang(),
                userMessage: userMessage,
                messages: this.messages,
                memories: this.memories,
                maxHistory: this.maxHistory
            });
        }
        // Fallback if ChatPanel not loaded
        var lang = this._getTargetLang();
        return {
            system: 'You are a conversation partner. Reply briefly.',
            prompt: 'User: ' + userMessage + '\nAssistant:'
        };
    }

    _buildOpeningPrompt() {
        if (window.ChatPanel && ChatPanel.buildOpeningPrompt) {
            return ChatPanel.buildOpeningPrompt({ targetLang: this._getTargetLang() });
        }
        var lang = this._getTargetLang();
        return { system: 'Greet the user.', prompt: 'Start.' };
    }

    _parseMemoryMarker(text) {
        if (window.ChatPanel && ChatPanel.parseMemoryMarker) {
            return ChatPanel.parseMemoryMarker(text);
        }
        return null;
    }

    async _saveMemory(jsonObj) {
        try {
            var uid = auth && auth.currentUser && auth.currentUser.uid;
            if (!uid || !db) return;
            var entry = {
                summary: jsonObj.summary || '',
                topics: jsonObj.topics || [],
                level: jsonObj.level || '',
                ts: Date.now()
            };
            await db.ref('users/' + uid + '/chat_memory/' + Date.now()).set(entry);
        } catch(e) {}
    }

    _playMessageTTS(text, lang) {
        if (text && lang) {
            app.audio.play(text, lang, 'chat', 0);
        }
    }

    _loadOlderMessages() {
        if (!this._transcript || this._transcriptLoadIndex <= 0) return;
        var start = Math.max(0, this._transcriptLoadIndex - this._transcriptPageSize);
        var older = this._transcript.messages.slice(start, this._transcriptLoadIndex);
        this._transcriptLoadIndex = start;
        var self = this;
        older.reverse().forEach(function(m) {
            if (m.role === 'assistant') {
                self.messages.unshift({ role: 'assistant', text: m.text, units: [{ text: m.text, lang: self._getTargetLang(), html: escapeHtml(m.text) }] });
            } else {
                self.messages.unshift({ role: 'user', text: m.text });
            }
        });
        this._updateMessages();
        // Keep scroll position near top after prepending
        var el = this.dom.messages;
        if (el) requestAnimationFrame(function() {
            el.scrollTop = 100;
        });
    }

    render() {
        var lang = this._getTargetLang();
        var p = app.store.prefs;
        var level = p.chatLevel || 'B1';
        var scenario = p.chatScenario || 'daily';
        var scenarioLabel = { daily: 'Daily Life', restaurant: 'Restaurant', travel: 'Travel', business: 'Business', hobby: 'Hobbies', custom: 'Free' }[scenario] || 'Daily Life';

        // Load transcript messages if no current session messages
        if (this.messages.length === 0 && this._transcript) {
            var total = this._transcript.messages.length;
            this._transcriptLoadIndex = total;
            var start = Math.max(0, total - this._transcriptPageSize);
            var recent = this._transcript.messages.slice(start);
            this._transcriptLoadIndex = start;
            var self = this;
            recent.forEach(function(m) {
                if (m.role === 'assistant') {
                    var html = m.html || escapeHtml(m.text);
                    self.messages.push({ role: 'assistant', text: m.text, units: [{ text: m.text, lang: self._getTargetLang(), html: html }] });
                } else {
                    self.messages.push({ role: 'user', text: m.text });
                }
            });
        }

        var messagesHtml = '';
        for (var i = 0; i < this.messages.length; i++) {
            var m = this.messages[i];
            if (m.role === 'user') {
                messagesHtml += '<div class="flex justify-end mb-2">'
                    + '<div class="chat-bubble max-w-[80%] bg-indigo-500 text-white rounded-2xl rounded-br-md px-3 py-2 text-sm leading-relaxed cursor-pointer select-none" data-text="' + escapeHtml(m.text) + '" data-lang="' + lang + '">'
                    + '<p class="whitespace-pre-wrap break-words" style="margin:0">' + escapeHtml(m.text) + '</p>'
                    + '</div></div>';
            } else if (m.units) {
                for (var j = 0; j < m.units.length; j++) {
                    var u = m.units[j];
                    if (!u.text) continue;
                    messagesHtml += '<div class="flex justify-start mb-1">'
                        + '<div class="chat-sentence max-w-[80%] cursor-pointer select-none" data-text="' + escapeHtml(u.text) + '" data-lang="' + (u.lang || lang) + '">'
                        + (u.html || escapeHtml(u.text))
                        + '</div></div>';
                }
            }
        }

        var micBtn = (window.SpeechRecognition || window.webkitSpeechRecognition)
            ? '<button id="chat-mic" onclick="app.game.toggleSpeech()" class="w-10 h-10 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-500 dark:text-neutral-400 rounded-full flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0"><i class="ph-bold ph-microphone text-lg"></i></button>'
            : '';

        this.root.innerHTML = '<div class="flex flex-col h-full w-full overflow-hidden">'
            + '<div id="chat-header" class="flex items-center justify-between px-3 py-2 shrink-0">'
            + '<div class="flex items-center gap-2">'
            + '<span class="text-[10px] font-black text-indigo-500 uppercase">' + scenarioLabel + '</span>'
            + '<span id="chat-level-badge" class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-neutral-700 dark:text-indigo-300 ring-1 ring-indigo-500/40 text-indigo-600 cursor-pointer active:scale-90 transition-all">' + level + '</span>'
            + '<div id="chat-level-popover" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg max-w-[280px] w-auto break-words whitespace-normal leading-relaxed"></div>'
            + '</div>'
            + '<div class="flex items-center gap-2">'
            + '<i class="ph-bold ph-info text-slate-400 cursor-pointer text-lg relative" id="chat-info-icon"></i>'
            + '<button id="chat-clear-btn" class="w-8 h-8 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300" title="Long-press to clear chat"><i class="ph-bold ph-trash text-lg"></i></button>'
            + '<button onclick="app.goBack()" class="w-8 h-8 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300"><i class="ph-bold ph-x text-lg"></i></button>'
            + '</div>'
            + '</div>'
            + '<div id="chat-info-tooltip" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-4 py-3 shadow-lg max-w-[300px] w-auto break-words whitespace-normal leading-relaxed">'
            + '<p class="mb-1.5">• Tap a sentence to hear it spoken.</p>'
            + '<p class="mb-1.5">• Long-press a sentence to see its translation.</p>'
            + '<p class="mb-1.5">• The AI responds in your target language only.</p>'
            + '<p>Saves compact summaries — never full transcripts.</p>'
            + '</div>'
            + '<div id="chat-messages" class="flex-1 overflow-y-auto px-3 pb-2 thin-scroll min-h-[100px]">' + messagesHtml + '</div>'
            + '<div class="flex items-center gap-2 px-3 pb-3 shrink-0">'
            + micBtn
            + '<input id="chat-input" type="text" placeholder="Type your message..." class="flex-1 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-slate-700 dark:text-neutral-200 placeholder:text-slate-300 dark:placeholder:text-neutral-600 min-w-0" onkeydown="if(event.key===\'Enter\')app.game.sendMessage()">'
            + '<button id="chat-send" onclick="app.game.sendMessage()" class="w-10 h-10 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center active:scale-90 transition-all shadow-md shrink-0"><i class="ph-bold ph-paper-plane-right text-lg"></i></button>'
            + '</div>'
            + '</div>';

        this.dom.header = this.root.querySelector('#chat-header');
        this.dom.messages = this.root.querySelector('#chat-messages');
        this.dom.input = this.root.querySelector('#chat-input');
        this.dom.send = this.root.querySelector('#chat-send');
        this.dom.mic = this.root.querySelector('#chat-mic');

        // Sticky bottom-scroll + scroll-to-top load older
        var self = this;
        this.dom.messages.onscroll = function() {
            var el = self.dom.messages;
            var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            self._stickToBottom = atBottom;
            if (el.scrollTop < 50 && self._transcript && self._transcriptLoadIndex > 0) {
                self._loadOlderMessages();
            }
        };

        this._setupTooltip();
        this._setupLevelPicker();
        this._setupClearButton();
        this._attachBubbleListeners();
        this._scrollToBottom();
        this.afterRender();

        if (this.messages.length === 0) {
            this._generateOpening();
        }
    }

    _setupTooltip() {
        var icon = document.getElementById('chat-info-icon');
        var tooltip = document.getElementById('chat-info-tooltip');
        if (!icon || !tooltip) return;
        icon.onclick = function(e) {
            e.stopPropagation();
            tooltip.classList.toggle('hidden');
            if (tooltip.classList.contains('hidden')) return;
            requestAnimationFrame(function() {
                var rect = icon.getBoundingClientRect();
                var tw = tooltip.offsetWidth;
                var th = tooltip.offsetHeight;
                var left = rect.left + rect.width / 2 - tw / 2;
                var top = rect.bottom + 4;
                if (left + tw > window.innerWidth) left = window.innerWidth - tw - 8;
                if (left < 8) left = 8;
                if (top + th > window.innerHeight) top = rect.top - th - 4;
                if (top < 8) top = 8;
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
                tooltip.style.transform = 'none';
            });
        };
        document.addEventListener('click', function _closeChatTooltip(e) {
            if (tooltip && !tooltip.classList.contains('hidden') && !e.target.closest('#chat-info-icon')) {
                tooltip.classList.add('hidden');
            }
        });
    }

    _setupLevelPicker() {
        var badge = document.getElementById('chat-level-badge');
        var popover = document.getElementById('chat-level-popover');
        if (!badge || !popover) return;
        var lang = this._getTargetLang();
        var levels = this._getLevelsForLang(lang);
        var current = app.store.prefs.chatLevel || 'B1';
        var framework = levels.length > 0 ? levels[0].framework : 'CEFR';
        var html = '<p class="text-[9px] font-bold text-indigo-300 mb-1.5">AI Tutor Level</p>';
        for (var i = 0; i < levels.length; i++) {
            var lv = levels[i];
            var active = lv.code === current ? ' bg-indigo-600 text-white' : ' hover:bg-slate-700';
            html += '<div class="flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors' + active + '" data-level="' + lv.code + '"><span class="font-bold text-[11px] w-5 shrink-0">' + lv.code + '</span><span class="text-[10px] text-slate-300 whitespace-nowrap">' + lv.desc + '</span></div>';
        }
        html += '<p class="text-[8px] text-slate-500 mt-1.5 border-t border-slate-700 pt-1">' + framework + ' — based on ' + (framework === 'JLPT' ? 'Japanese Language Proficiency Test' : framework === 'HSK' ? 'Hanyu Shuiping Kaoshi' : framework === 'TOPIK' ? 'Test of Proficiency in Korean' : 'Common European Framework of Reference for Languages') + '</p>';
        popover.innerHTML = html;
        badge.onclick = function(e) {
            e.stopPropagation();
            popover.classList.toggle('hidden');
            if (popover.classList.contains('hidden')) return;
            requestAnimationFrame(function() {
                var rect = badge.getBoundingClientRect();
                var pw = popover.offsetWidth;
                var ph = popover.offsetHeight;
                var left = rect.left + rect.width / 2 - pw / 2;
                var top = rect.bottom + 4;
                if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
                if (left < 8) left = 8;
                if (top + ph > window.innerHeight) top = rect.top - ph - 4;
                if (top < 8) top = 8;
                popover.style.left = left + 'px';
                popover.style.top = top + 'px';
                popover.style.transform = 'none';
            });
        };
        var self = this;
        popover.querySelectorAll('[data-level]').forEach(function(el) {
            el.onclick = function() {
                var level = el.dataset.level;
                self._setChatLevel(level);
                popover.classList.add('hidden');
            };
        });
        document.addEventListener('click', function _closeLevelPopover(e) {
            if (popover && !popover.classList.contains('hidden') && !e.target.closest('#chat-level-badge') && !e.target.closest('#chat-level-popover')) {
                popover.classList.add('hidden');
            }
        });
    }

    _setChatLevel(level) {
        app.store.prefs.chatLevel = level;
        localStorage.setItem(app.store.STORAGE_KEY, JSON.stringify(app.store.prefs));
        var badge = document.getElementById('chat-level-badge');
        if (badge) badge.textContent = level;
    }

    _setupClearButton() {
        var btn = document.getElementById('chat-clear-btn');
        if (!btn) return;
        var self = this;
        var timer = null;
        var triggered = false;

        function doClear() {
            triggered = true;
            self.messages = [];
            self.memories = [];
            self._transcript = null;
            self._transcriptLoadIndex = 0;
            self._updateMessages();
            self._generateOpening();
            try {
                var uid = auth && auth.currentUser && auth.currentUser.uid;
                if (uid && db) {
                    db.ref('users/' + uid + '/chat_transcripts/' + self._getTargetLang()).remove();
                    db.ref('users/' + uid + '/chat_memory').remove();
                }
            } catch(e) {}
            try { localStorage.removeItem('chat_transcript_' + self._getTargetLang()); } catch(e) {}
            if (app.ui) app.ui.showToast('Chat cleared', 'info');
        }

        btn.addEventListener('mousedown', function() {
            timer = setTimeout(doClear, 600);
        });
        btn.addEventListener('mouseup', function() { clearTimeout(timer); });
        btn.addEventListener('mouseleave', function() { clearTimeout(timer); });
        btn.addEventListener('touchstart', function(e) {
            e.preventDefault();
            timer = setTimeout(doClear, 600);
        });
        btn.addEventListener('touchend', function() { clearTimeout(timer); });
        btn.addEventListener('touchcancel', function() { clearTimeout(timer); });
    }

    _attachBubbleListeners() {
        var self = this;
        var sentences = this.root.querySelectorAll('.chat-sentence');
        sentences.forEach(function(el) {
            var longPressed = false;
            el.onclick = function(e) {
                if (longPressed) { longPressed = false; return; }
                e.stopPropagation();
                var text = el.dataset.text;
                var lang = el.dataset.lang;
                if (text) self._playMessageTTS(text, lang);
            };
            var pressTimer = null;
            el.onmousedown = function() {
                pressTimer = setTimeout(function() {
                    longPressed = true;
                    var text = el.dataset.text;
                    if (text) self._showSentenceTranslation(el, text);
                }, 500);
            };
            el.onmouseup = function() { clearTimeout(pressTimer); };
            el.onmouseleave = function() { clearTimeout(pressTimer); };
            el.ontouchstart = function() {
                pressTimer = setTimeout(function() {
                    longPressed = true;
                    var text = el.dataset.text;
                    if (text) self._showSentenceTranslation(el, text);
                }, 500);
            };
            el.ontouchend = function() { clearTimeout(pressTimer); };
            el.ontouchmove = function() { clearTimeout(pressTimer); };
        });
        var bubbles = this.root.querySelectorAll('.chat-bubble');
        bubbles.forEach(function(el) {
            el.onclick = function(e) {
                e.stopPropagation();
                var p = el.querySelector('p');
                if (p && p.textContent) self._playMessageTTS(p.textContent, self._getTargetLang());
            };
        });
    }

    async _showSentenceTranslation(el, text) {
        if (el.dataset.translating) return;
        el.dataset.translating = '1';
        var origHtml = el.innerHTML;
        el.innerHTML = el.innerHTML + '<p style="font-size:10px;margin:6px 0 0 0;opacity:0.7;border-top:1px solid currentColor;padding-top:4px;font-style:italic">Translating...</p>';
        var translation = await this._translateMessage(text);
        if (translation) {
            el.innerHTML = origHtml + '<p style="font-size:10px;margin:6px 0 0 0;opacity:0.7;border-top:1px solid currentColor;padding-top:4px">' + escapeHtml(translation) + '</p>';
        } else {
            el.innerHTML = origHtml;
        }
        delete el.dataset.translating;
    }

    async _translateMessage(text) {
        var targetLang = this._getTargetLang();
        var sourceLang = this._getSourceLang();
        if (!targetLang || !sourceLang) return '';
        if (!app.llm || !app.llm.available || !app.llm.hasModel) return '';
        try {
            var result = await app.llm.generate({
                prompt: 'Translate this ' + targetLang + ' text to ' + sourceLang + '. Respond with ONLY the translation, no explanation.\n\nText: "' + text + '"',
                options: { num_predict: 128, temperature: 0 },
                timeout: 10000
            });
            return (result || '').replace(/^["']|["']$/g, '').trim();
        } catch(e) { return ''; }
    }

    _scrollToBottom() {
        if (!this._stickToBottom) return;
        var el = this.dom.messages;
        if (el) requestAnimationFrame(function() { el.scrollTop = el.scrollHeight; });
    }

    _setBusyUI(busy, phase) {
        this.busy = busy;
        this._typingBubble = busy;
        if (this.dom.input) {
            this.dom.input.disabled = busy;
            this.dom.input.placeholder = busy ? '' : 'Type your message...';
        }
        if (busy) {
            this._updateMessages();
            this._scrollToBottom();
        }
    }

    _pruneMessages() {
        var maxPairs = this.maxHistory || 6;
        var maxMessages = maxPairs * 2;
        if (this.messages.length <= maxMessages) return;
        // Keep the most recent maxMessages, summarize the rest into memories
        var overflow = this.messages.slice(0, this.messages.length - maxMessages);
        var summaries = [];
        for (var i = 0; i < overflow.length; i += 2) {
            var userMsg = overflow[i];
            var aiMsg = overflow[i + 1];
            if (userMsg && aiMsg) {
                var userSnippet = (userMsg.text || '').substring(0, 80);
                var aiSnippet = (aiMsg.text || '').substring(0, 80);
                summaries.push('User: "' + userSnippet + '" → ' + aiSnippet);
            }
        }
        if (summaries.length > 0) {
            this.memories.push({
                summary: 'Previous: ' + summaries.join(' | '),
                ts: Date.now()
            });
            // Keep max 3 memories
            this.memories = this.memories.slice(-3);
        }
        this.messages = this.messages.slice(-maxMessages);
    }

    async _generateOpening() {
        if (!app.llm || !app.llm.available || !app.llm.hasModel) {
            var lang = this._getTargetLang();
            var greetings = { ja: 'こんにちは！今日は何を勉強したいですか？', ko: '안녕하세요! 오늘 무엇을 공부하고 싶으세요?', zh: '你好！今天想学什么？', es: '¡Hola! ¿Qué te gustaría practicar hoy?', fr: 'Bonjour ! Qu\'aimeriez-vous pratiquer aujourd\'hui ?', de: 'Hallo! Was möchtest du heute üben?', it: 'Ciao! Cosa vorresti praticare oggi?', pt: 'Olá! O que você gostaria de praticar hoje?', ru: 'Здравствуйте! Что вы хотели бы практиковать сегодня?' };
            this.messages.push({ role: 'assistant', text: greetings[lang] || '', units: [{ text: greetings[lang] || '', lang: lang, html: escapeHtml(greetings[lang] || '') }] });
            this._updateMessages();
            if (greetings[lang] && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(greetings[lang], lang, 'chat', 300);
            }
            return;
        }
        this._setBusyUI(true, 'thinking');
        var promptData = this._buildOpeningPrompt();
        this.abortController = new AbortController();
        var self = this;
        try {
            var fullText = await app.llm.generate({
                prompt: promptData.prompt,
                system: promptData.system,
                options: { num_predict: 128, temperature: 0.7 },
                signal: this.abortController.signal,
                timeout: 15000
            });
            if (!this.root || !this.root.isConnected) return;
            this._setBusyUI(true, 'formatting');
            var units = await this._formatPresentation(fullText, this._getTargetLang());
            this._setBusyUI(false);
            this.messages.push({ role: 'assistant', text: fullText, units: units });
            this._updateMessages();
            if (units.length > 0 && units[0].text && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(units[0].text, units[0].lang || this._getTargetLang(), 'chat', 300);
            }
        } catch(e) {
            if (e.name === 'AbortError') {
                L('[Chat] Opening aborted');
                this._setBusyUI(false);
                return;
            }
            this._setBusyUI(false);
            var lang = this._getTargetLang();
            var greetings = { ja: 'こんにちは！今日は何を勉強したいですか？', ko: '안녕하세요! 오늘 무엇을 공부하고 싶으세요?', zh: '你好！今天想学什么？', es: '¡Hola! ¿Qué te gustaría practicar hoy?', fr: 'Bonjour ! Qu\'aimeriez-vous pratiquer aujourd\'hui ?', de: 'Hallo! Was möchtest du heute üben?', it: 'Ciao! Cosa vorresti praticare oggi?', pt: 'Olá! O que você gostaria de praticar hoje?', ru: 'Здравствуйте! Что вы хотели бы практиковать сегодня?' };
            this.messages.push({ role: 'assistant', text: greetings[lang] || '', units: [{ text: greetings[lang] || '', lang: lang, html: escapeHtml(greetings[lang] || '') }] });
            this._updateMessages();
            if (greetings[lang] && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(greetings[lang], lang, 'chat', 300);
            }
        }
        if (this.dom.input) this.dom.input.focus();
    }

    async sendMessage() {
        if (this.busy) return;
        var input = this.dom.input;
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;

        if (!app.llm || !app.llm.available || !app.llm.hasModel) {
            if (app.ui) app.ui.showToast('AI is not available. Check Settings > AI.', 'error');
            return;
        }

        this.messages.push({ role: 'user', text: text });
        input.value = '';
        this._setBusyUI(true, 'thinking');
        this._updateMessages();
        this._scrollToBottom();

        var promptData = this._buildPrompt(text);
        this.abortController = new AbortController();
        var self = this;

        try {
            var fullText = await app.llm.generate({
                prompt: promptData.prompt,
                system: promptData.system,
                options: { num_predict: 256, temperature: 0.5 },
                signal: this.abortController.signal,
                timeout: 30000
            });

            if (!this.root || !this.root.isConnected) return;

            var parsed = this._parseMemoryMarker(fullText);
            var cleaned = fullText;
            if (parsed) {
                cleaned = parsed.cleaned;
                this._saveMemory(parsed.json);
            }

            this._setBusyUI(true, 'formatting');
            var units = await this._formatPresentation(cleaned, this._getTargetLang());
            this._setBusyUI(false);
            this.messages.push({ role: 'assistant', text: cleaned, units: units });
            this._pruneMessages();

            this._updateMessages();
            this._scrollToBottom();

            if (units.length > 0 && units[0].text && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(units[0].text, units[0].lang || this._getTargetLang(), 'chat', 300);
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                L('[Chat] Response aborted by user');
                this._setBusyUI(false);
                return;
            }
            if (!this.root || !this.root.isConnected) return;
            this._setBusyUI(false);
            this.messages.push({ role: 'assistant', text: '[Error: ' + (err.message || 'Failed to get response') + ']' });
            this._updateMessages();
            this._scrollToBottom();
        }

        if (this.dom.input) this.dom.input.focus();
    }

    _updateMessages() {
        var container = this.dom.messages;
        if (!container) return;
        var html = '';
        for (var i = 0; i < this.messages.length; i++) {
            var m = this.messages[i];
            if (m.role === 'user') {
                html += '<div class="flex justify-end mb-2">'
                    + '<div class="chat-bubble max-w-[80%] bg-indigo-500 text-white rounded-2xl rounded-br-md px-3 py-2 text-sm leading-relaxed cursor-pointer select-none" data-text="' + escapeHtml(m.text) + '" data-lang="' + this._getTargetLang() + '">'
                    + '<p class="whitespace-pre-wrap break-words" style="margin:0">' + escapeHtml(m.text) + '</p>'
                    + '</div></div>';
            } else if (m.units) {
                for (var j = 0; j < m.units.length; j++) {
                    var u = m.units[j];
                    if (!u.text) continue;
                    html += '<div class="flex justify-start mb-1">'
                        + '<div class="chat-sentence max-w-[80%] bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 rounded-2xl rounded-bl-md px-3 py-2 text-sm leading-relaxed cursor-pointer select-none" data-text="' + escapeHtml(u.text) + '" data-lang="' + (u.lang || this._getTargetLang()) + '">'
                        + (u.html || escapeHtml(u.text))
                        + '</div></div>';
                }
            }
        }
        // Append typing bubble inside message stream
        if (this._typingBubble) {
            html += '<div class="flex justify-start mb-1">'
                + '<div class="max-w-[80%] bg-slate-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3 inline-block">'
                + '<span class="inline-flex gap-1 items-center">'
                + '<span class="typing-label text-[10px] font-bold text-slate-400 dark:text-neutral-400 animate-pulse mr-1">Thinking</span>'
                + '<span class="w-2 h-2 bg-slate-400 dark:bg-neutral-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>'
                + '<span class="w-2 h-2 bg-slate-400 dark:bg-neutral-400 rounded-full animate-bounce" style="animation-delay:200ms"></span>'
                + '<span class="w-2 h-2 bg-slate-400 dark:bg-neutral-400 rounded-full animate-bounce" style="animation-delay:400ms"></span>'
                + '</span></div></div>';
        }
        container.innerHTML = html;
        this._attachBubbleListeners();
    }

    destroy() {
        this._saveTranscript();
        if (this.abortController) this.abortController.abort();
        super.destroy();
    }
}
