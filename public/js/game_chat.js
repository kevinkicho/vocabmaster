/* js/game_chat.js */
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
        this._setupSTT();
        this._loadMemories();
        this.render();
    }

    _getTargetLang() {
        return app.store.prefs.presetTarget || '';
    }

    _setupSTT() {
        if (!('webkitSpeechRecognition' in window)) return;
        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        var self = this;
        this.recognition.onresult = function(e) {
            var transcript = e.results[0][0].transcript;
            if (self.dom.input) {
                self.dom.input.value = transcript;
                self.sendMessage();
            }
        };
        this.recognition.onerror = function() {
            if (app.ui) app.ui.toast('Speech recognition failed. Try typing.', 'error');
        };
    }

    toggleSpeech() {
        if (!this.recognition) {
            if (app.ui) app.ui.toast('Voice input not supported in this browser.', 'error');
            return;
        }
        var lang = this._getTargetLang();
        var localeMap = { ja:'ja-JP', en:'en-US', ko:'ko-KR', zh:'zh-CN', es:'es-ES', fr:'fr-FR', de:'de-DE', it:'it-IT', pt:'pt-BR', ru:'ru-RU' };
        this.recognition.lang = localeMap[lang] || 'en-US';
        this.recognition.start();
        if (this.dom.mic) {
            this.dom.mic.classList.add('text-rose-500', 'animate-pulse');
        }
        var self = this;
        this.recognition.onend = function() {
            if (self.dom.mic) {
                self.dom.mic.classList.remove('text-rose-500', 'animate-pulse');
            }
        };
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

    _buildPrompt(userMessage) {
        var lang = this._getTargetLang();
        var p = app.store.prefs;
        var level = p.chatLevel || 'B1';
        var scenario = p.chatScenario || 'daily';
        var tagFilter = p.tagFilter || ['all'];

        var scenarioDesc = {
            daily: 'Daily life conversations (greetings, weather, family, routines)',
            restaurant: 'Ordering food at a restaurant, interacting with waitstaff',
            travel: 'Travel situations (hotel, directions, transportation)',
            business: 'Business meetings, emails, professional interactions',
            hobby: 'Discussing hobbies, interests, and free time activities',
            custom: 'Free conversation on any topic'
        }[scenario] || 'Daily life conversations';

        var memoriesSection = '';
        if (this.memories.length > 0) {
            memoriesSection = 'Previous session context:\n' + this.memories.map(function(m) { return '- ' + (m.summary || ''); }).join('\n');
        }

        var tagInfo = tagFilter.includes('all') ? 'all levels' : tagFilter.join(', ');

        var system = 'You are a language tutor. The user is practicing ' + lang + ' at ' + level + ' level.\n'
            + 'Scenario: ' + scenarioDesc + '.\n'
            + 'Their vocabulary covers: ' + tagInfo + '.\n\n'
            + 'IMPORTANT: You must respond in ' + lang + ' only.\n'
            + 'Do NOT respond in Japanese, English, Korean, or any language other than ' + lang + '.\n'
            + 'If you respond in the wrong language, the user cannot learn.\n\n'
            + 'Rules:\n'
            + '- Respond in ' + lang + ' only, 2-3 sentences\n'
            + '- Use vocabulary appropriate for ' + level + '\n'
            + '- Gently correct mistakes after responding\n'
            + '- End with a follow-up question to continue the conversation\n'
            + (memoriesSection ? memoriesSection + '\n' : '')
            + '\nAt the end of your response, you may optionally append [MEMORY: ...] with a JSON object to save a compact summary. Example:\n'
            + '[MEMORY: {"summary": "Practiced restaurant vocabulary, struggled with ordering", "topics": ["food", "ordering"], "level": "B1"}]\n'
            + 'Never include full transcripts. Only save meaningful summaries.';

        var history = this.messages.slice(-this.maxHistory * 2).map(function(m) {
            return '[' + lang + '] ' + (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.text;
        }).join('\n');

        return { system: system, prompt: history + '\n[' + lang + '] User: ' + userMessage + '\n[' + lang + '] Assistant:' };
    }

    _buildOpeningPrompt() {
        var lang = this._getTargetLang();
        var level = app.store.prefs.chatLevel || 'B1';
        var scenario = app.store.prefs.chatScenario || 'daily';
        return {
            system: 'You are a language tutor. Greet the user in ' + lang + ' and ask an opening question about ' + scenario + '.\n'
                + 'IMPORTANT: Respond in ' + lang + ' only. Do NOT use Japanese, English, Korean, or any other language.\n'
                + '1-2 sentences.',
            prompt: '[' + lang + '] Start the conversation. Greet the user and ask a question about ' + scenario + '.'
        };
    }

    _parseMemoryMarker(text) {
        var match = text.match(/\[MEMORY:\s*(\{.*?\})\]/);
        if (match) {
            try {
                return { json: JSON.parse(match[1]), cleaned: text.replace(match[0], '').trim() };
            } catch(e) { return null; }
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

    setupHeader() {
        if (this.dom.header) {
            this.dom.header.innerHTML = '<div class="flex justify-between items-center mb-2 shrink-0 w-full px-1 min-h-[50px]">'
                + '<div></div>'
                + '<div class="flex items-center gap-2">'
                + '<i class="ph-bold ph-info text-slate-400 cursor-pointer text-xl relative" id="chat-info-icon"></i>'
                + '<button onclick="app.goBack()" class="w-9 h-9 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300"><i class="ph-bold ph-x"></i></button>'
                + '</div></div>'
                + '<div id="chat-info-tooltip" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg max-w-[250px] break-words whitespace-normal leading-relaxed">The AI responds in your target language only, uses vocabulary at your selected level, gently corrects mistakes, and ends with a follow-up question. It can save compact summaries of your progress — never full transcripts.</div>';
            this._setupTooltip();
        }
    }

    _setupTooltip() {
        var icon = document.getElementById('chat-info-icon');
        var tooltip = document.getElementById('chat-info-tooltip');
        if (!icon || !tooltip) return;
        var self = this;
        icon.onclick = function(e) {
            e.stopPropagation();
            tooltip.classList.toggle('hidden');
            var rect = icon.getBoundingClientRect();
            tooltip.style.top = (rect.bottom + 4) + 'px';
            tooltip.style.left = (rect.left + rect.width / 2) + 'px';
            tooltip.style.transform = 'translateX(-50%)';
        };
        document.addEventListener('click', function _closeChatTooltip(e) {
            if (tooltip && !tooltip.classList.contains('hidden') && !e.target.closest('#chat-info-icon')) {
                tooltip.classList.add('hidden');
            }
        });
    }

    render() {
        var lang = this._getTargetLang();
        var p = app.store.prefs;
        var level = p.chatLevel || 'B1';
        var scenario = p.chatScenario || 'daily';
        var scenarioLabel = { daily: 'Daily Life', restaurant: 'Restaurant', travel: 'Travel', business: 'Business', hobby: 'Hobbies', custom: 'Free' }[scenario] || 'Daily Life';

        var messagesHtml = '';
        for (var i = 0; i < this.messages.length; i++) {
            var m = this.messages[i];
            var isUser = m.role === 'user';
            messagesHtml += '<div class="flex ' + (isUser ? 'justify-end' : 'justify-start') + ' mb-2">'
                + '<div class="max-w-[80%] ' + (isUser ? 'bg-indigo-500 text-white rounded-2xl rounded-br-md' : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-2xl rounded-bl-md') + ' px-3 py-2 text-sm leading-relaxed">'
                + '<p class="whitespace-pre-wrap break-words">' + escapeHtml(m.text) + '</p>'
                + '</div></div>';
        }

        var micBtn = this.recognition
            ? '<button id="chat-mic" onclick="app.game.toggleSpeech()" class="w-11 h-11 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-500 dark:text-neutral-400 rounded-full flex items-center justify-center active:scale-90 transition-all shadow-sm"><i class="ph-bold ph-microphone text-lg"></i></button>'
            : '';

        this.root.innerHTML = '<div class="flex flex-col h-full w-full overflow-hidden">'
            + '<div id="chat-header"></div>'
            + '<div class="bg-white dark:bg-neutral-900 rounded-2xl mx-2 p-2.5 border border-slate-200 dark:border-neutral-800 mb-2 shrink-0">'
            + '<div class="flex items-center gap-2">'
            + '<span class="text-[9px] font-black text-indigo-500 uppercase">' + scenarioLabel + '</span>'
            + '<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">' + level + '</span>'
            + '</div></div>'
            + '<div id="chat-messages" class="flex-1 overflow-y-auto px-2 pb-2 thin-scroll">' + messagesHtml + '</div>'
            + '<div id="chat-audio" class="shrink-0 px-2 mb-1"></div>'
            + '<div class="flex items-center gap-2 px-2 pb-3 shrink-0">'
            + micBtn
            + '<input id="chat-input" type="text" placeholder="Type your message..." class="flex-1 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-slate-700 dark:text-neutral-200 placeholder:text-slate-300 dark:placeholder:text-neutral-600" onkeydown="if(event.key===\'Enter\')app.game.sendMessage()">'
            + '<button id="chat-send" onclick="app.game.sendMessage()" class="w-11 h-11 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center active:scale-90 transition-all shadow-md"><i class="ph-bold ph-paper-plane-right text-lg"></i></button>'
            + '<button id="chat-cancel" onclick="app.game.cancelGeneration()" class="w-11 h-11 bg-rose-500 hover:bg-rose-600 text-white rounded-full hidden flex items-center justify-center active:scale-90 transition-all shadow-md"><i class="ph-bold ph-stop-circle text-lg"></i></button>'
            + '</div>'
            + '</div>';

        this.dom.header = this.root.querySelector('#chat-header');
        this.dom.messages = this.root.querySelector('#chat-messages');
        this.dom.audio = this.root.querySelector('#chat-audio');
        this.dom.input = this.root.querySelector('#chat-input');
        this.dom.send = this.root.querySelector('#chat-send');
        this.dom.cancel = this.root.querySelector('#chat-cancel');
        this.dom.mic = this.root.querySelector('#chat-mic');

        this.setupHeader();
        this._scrollToBottom();
        this.afterRender();

        if (this.messages.length === 0) {
            this._generateOpening();
        }
    }

    _scrollToBottom() {
        var el = this.dom.messages;
        if (el) setTimeout(function() { el.scrollTop = el.scrollHeight; }, 50);
    }

    _setBusyUI(busy) {
        this.busy = busy;
        if (this.dom.send) this.dom.send.classList.toggle('hidden', busy);
        if (this.dom.cancel) this.dom.cancel.classList.toggle('hidden', !busy);
        if (this.dom.input) {
            this.dom.input.disabled = busy;
            this.dom.input.placeholder = busy ? 'AI is thinking...' : 'Type your message...';
        }
        if (this.dom.mic) this.dom.mic.disabled = busy;
    }

    cancelGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this._setBusyUI(false);
    }

    async _generateOpening() {
        if (!app.llm || !app.llm.available || !app.llm.hasModel) {
            var lang = this._getTargetLang();
            var greetings = { ja: 'こんにちは！今日は何を勉強したいですか？', ko: '안녕하세요! 오늘 무엇을 공부하고 싶으세요?', zh: '你好！今天想学什么？', es: '¡Hola! ¿Qué te gustaría practicar hoy?', fr: 'Bonjour ! Qu\'aimeriez-vous pratiquer aujourd\'hui ?', de: 'Hallo! Was möchtest du heute üben?', it: 'Ciao! Cosa vorresti praticare oggi?', pt: 'Olá! O que você gostaria de praticar hoje?', ru: 'Здравствуйте! Что вы хотели бы практиковать сегодня?' };
            this.messages.push({ role: 'assistant', text: greetings[lang] || '' });
            this._updateMessages();
            return;
        }
        this._setBusyUI(true);
        var promptData = this._buildOpeningPrompt();
        this.abortController = new AbortController();
        var self = this;
        this.messages.push({ role: 'assistant', text: '' });
        this._updateMessages();
        var msgEl = this.dom.messages.lastElementChild;
        try {
            var fullText = await app.llm.streamGenerate({
                prompt: promptData.prompt,
                system: promptData.system,
                options: { num_predict: 128, temperature: 0.7 },
                signal: this.abortController.signal,
                timeout: 15000
            }, function(token) {
                fullText += token;
                if (self.messages.length > 0) {
                    self.messages[self.messages.length - 1].text = fullText;
                }
                var p = msgEl ? msgEl.querySelector('p') : null;
                if (p) p.textContent = fullText;
                self._scrollToBottom();
            });
            if (this.messages.length > 0) {
                this.messages[this.messages.length - 1].text = fullText;
            }
            this._updateMessages();
        } catch(e) {
            if (e.name === 'AbortError') return;
            var lang = this._getTargetLang();
            var greetings = { ja: 'こんにちは！今日は何を勉強したいですか？', ko: '안녕하세요! 오늘 무엇을 공부하고 싶으세요?', zh: '你好！今天想学什么？', es: '¡Hola! ¿Qué te gustaría practicar hoy?', fr: 'Bonjour ! Qu\'aimeriez-vous pratiquer aujourd\'hui ?', de: 'Hallo! Was möchtest du heute üben?', it: 'Ciao! Cosa vorresti praticare oggi?', pt: 'Olá! O que você gostaria de praticar hoje?', ru: 'Здравствуйте! Что вы хотели бы практиковать сегодня?' };
            this.messages.push({ role: 'assistant', text: greetings[lang] || '' });
            this._updateMessages();
        }
        this._setBusyUI(false);
        if (this.dom.input) this.dom.input.focus();
    }

    async sendMessage() {
        if (this.busy) return;
        var input = this.dom.input;
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;

        if (!app.llm || !app.llm.available || !app.llm.hasModel) {
            if (app.ui) app.ui.toast('AI is not available. Check Settings > AI.', 'error');
            return;
        }

        this.messages.push({ role: 'user', text: text });
        input.value = '';
        this._setBusyUI(true);
        this._updateMessages();
        this._scrollToBottom();

        var promptData = this._buildPrompt(text);
        this.abortController = new AbortController();

        this.messages.push({ role: 'assistant', text: '' });
        this._updateMessages();
        var msgEl = this.dom.messages.lastElementChild;
        var self = this;

        try {
            var fullText = await app.llm.streamGenerate({
                prompt: promptData.prompt,
                system: promptData.system,
                options: { num_predict: 256, temperature: 0.5 },
                signal: this.abortController.signal,
                timeout: 30000
            }, function(token) {
                fullText += token;
                if (self.messages.length > 0) {
                    self.messages[self.messages.length - 1].text = fullText;
                }
                var p = msgEl ? msgEl.querySelector('p') : null;
                if (p) p.textContent = fullText;
                self._scrollToBottom();
            });

            if (!this.root || !this.root.isConnected) return;

            var parsed = this._parseMemoryMarker(fullText);
            var cleaned = fullText;
            if (parsed) {
                cleaned = parsed.cleaned;
                this._saveMemory(parsed.json);
            }

            if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'assistant') {
                this.messages[this.messages.length - 1].text = cleaned;
            }

            this._updateMessages();
            this._scrollToBottom();

            var sentences = cleaned.split(/[.!?]+/).filter(Boolean);
            var lastSentence = sentences.length > 0 ? sentences[sentences.length - 1].trim() : '';
            if (lastSentence && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(lastSentence, this._getTargetLang(), 'chat', 200);
            }

        } catch (err) {
            if (err.name === 'AbortError') return;
            if (!this.root || !this.root.isConnected) return;
            this.messages.push({ role: 'assistant', text: '[Error: ' + (err.message || 'Failed to get response') + ']' });
            this._updateMessages();
            this._scrollToBottom();
        }

        this._setBusyUI(false);
        if (this.dom.input) this.dom.input.focus();
    }

    _updateMessages() {
        var container = this.dom.messages;
        if (!container) return;
        var html = '';
        for (var i = 0; i < this.messages.length; i++) {
            var m = this.messages[i];
            var isUser = m.role === 'user';
            html += '<div class="flex ' + (isUser ? 'justify-end' : 'justify-start') + ' mb-2">'
                + '<div class="max-w-[80%] ' + (isUser ? 'bg-indigo-500 text-white rounded-2xl rounded-br-md' : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-2xl rounded-bl-md') + ' px-3 py-2 text-sm leading-relaxed">'
                + '<p class="whitespace-pre-wrap break-words">' + escapeHtml(m.text) + '</p>'
                + '</div></div>';
        }
        container.innerHTML = html;
    }

    destroy() {
        if (this.abortController) this.abortController.abort();
        super.destroy();
    }
}
