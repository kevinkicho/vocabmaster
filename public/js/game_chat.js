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

    _getSourceLang() {
        return app.store.prefs.presetSource || 'en';
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
            alert('Speech recognition failed. Please check your microphone and try again, or type your message instead.');
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

    async _criticizePresentation(text, lang) {
        if (!app.llm || !app.llm.available) return [{ text: text, lang: lang, html: escapeHtml(text) }];
        try {
            var result = await app.llm.generate({
                prompt: 'You are a chat UI designer. Format this ' + lang + ' language tutor response as beautiful chat bubbles.\n'
                    + 'Output a JSON array. Each array item is one sentence or phrase that becomes its own bubble.\n'
                    + 'Each item has:\n'
                    + '- "text": raw text for TTS (plain, no HTML)\n'
                    + '- "lang": language code for TTS engine (e.g. ja, ko, zh, en, es, fr, de, it, pt, ru)\n'
                    + '- "html": FULL styled HTML for the bubble using inline styles. This is the only styling — style everything: background, color, border-radius, padding, font-size, line-height, margin, etc. Make it look like a modern chat app. Use dark-mode-friendly colors (dark backgrounds use lighter text).\n'
                    + 'Output ONLY the JSON array. No markdown, no backticks, no extra text:\n'
                    + '[\n'
                    + '  {"text": "...", "lang": "...", "html": "..."}\n'
                    + ']\n\n'
                    + 'Response: "' + text + '"',
                options: { num_predict: 1024, temperature: 0 },
                timeout: 15000
            });
            var parsed = JSON.parse(result);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            return [{ text: text, lang: lang, html: escapeHtml(text) }];
        } catch(e) { return [{ text: text, lang: lang, html: escapeHtml(text) }]; }
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

        var system = 'You are a ' + lang + ' language tutor. You speak only ' + lang + '.\n'
            + 'You understand English and other languages, but always respond in ' + lang + '.\n\n'
            + 'The user may sometimes write in English or mix languages when they don\'t know a word.\n'
            + 'When this happens, respond in ' + lang + ' and include the ' + lang + ' word they were looking for.\n\n'
            + 'Scenario: ' + scenarioDesc + '\n'
            + 'Learner level: ' + level + '\n'
            + 'Vocabulary range: ' + tagInfo + '\n'
            + (memoriesSection ? memoriesSection + '\n' : '')
            + '\nGuidelines:\n'
            + '- Respond in ' + lang + ' only, 2-3 sentences\n'
            + '- Use ' + level + '-appropriate vocabulary\n'
            + '- Gently correct mistakes\n'
            + '- End with a follow-up question\n'
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
        var scenario = app.store.prefs.chatScenario || 'daily';
        return {
            system: 'You are a ' + lang + ' language tutor. You speak only ' + lang + '.\n'
                + 'You understand English but always respond in ' + lang + '.\n'
                + 'Greet the user in ' + lang + ' and ask an opening question about ' + scenario + '.\n'
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

    _playMessageTTS(text, lang) {
        if (text && lang) {
            app.audio.play(text, lang, 'chat', 0);
        }
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
            if (m.role === 'user') {
                messagesHtml += '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">'
                    + '<div class="chat-bubble" style="max-width:80%;background:#6366f1;color:#fff;border-radius:16px 16px 4px 16px;padding:10px 14px;font-size:14px;line-height:1.5;cursor:pointer;user-select:none" data-text="' + escapeHtml(m.text) + '" data-lang="' + lang + '">'
                    + '<p style="margin:0;white-space:pre-wrap;overflow-wrap:break-word">' + escapeHtml(m.text) + '</p>'
                    + '</div></div>';
            } else if (m.units) {
                for (var j = 0; j < m.units.length; j++) {
                    var u = m.units[j];
                    if (!u.text) continue;
                    messagesHtml += '<div style="display:flex;justify-content:flex-start;margin-bottom:4px">'
                        + '<div class="chat-sentence" style="max-width:80%;cursor:pointer;user-select:none" data-text="' + escapeHtml(u.text) + '" data-lang="' + (u.lang || lang) + '">'
                        + (u.html || escapeHtml(u.text))
                        + '</div></div>';
                }
            }
        }

        var micBtn = this.recognition
            ? '<button id="chat-mic" onclick="app.game.toggleSpeech()" class="w-10 h-10 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-500 dark:text-neutral-400 rounded-full flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0"><i class="ph-bold ph-microphone text-lg"></i></button>'
            : '';

        this.root.innerHTML = '<div class="flex flex-col h-full w-full overflow-hidden">'
            + '<div id="chat-header" class="flex items-center justify-between px-3 py-2 shrink-0">'
            + '<div class="flex items-center gap-2">'
            + '<span class="text-[10px] font-black text-indigo-500 uppercase">' + scenarioLabel + '</span>'
            + '<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-neutral-700 dark:text-indigo-300 ring-1 ring-indigo-500/40 text-indigo-600">' + level + '</span>'
            + '</div>'
            + '<div class="flex items-center gap-2">'
            + '<i class="ph-bold ph-info text-slate-400 cursor-pointer text-lg relative" id="chat-info-icon"></i>'
            + '<button onclick="app.goBack()" class="w-8 h-8 bg-slate-200 dark:bg-neutral-800 hover:bg-slate-300 rounded-full flex items-center justify-center active:scale-90 transition-all text-slate-600 dark:text-neutral-300"><i class="ph-bold ph-x text-lg"></i></button>'
            + '</div>'
            + '</div>'
            + '<div id="chat-info-tooltip" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-4 py-3 shadow-lg max-w-[300px] w-auto break-words whitespace-normal leading-relaxed">'
            + '<p class="mb-1.5">• Tap a sentence to hear it spoken.</p>'
            + '<p class="mb-1.5">• Long-press a sentence to see its translation.</p>'
            + '<p class="mb-1.5">• The AI responds in your target language only.</p>'
            + '<p>Saves compact summaries — never full transcripts.</p>'
            + '</div>'
            + '<div id="chat-messages" class="flex-1 overflow-y-auto px-3 pb-2 thin-scroll">' + messagesHtml + '</div>'
            + '<div id="chat-typing" class="hidden flex justify-start px-3 mb-1"><div class="max-w-[80%] bg-slate-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3"><span class="inline-flex gap-1"><span class="w-2 h-2 bg-slate-400 dark:bg-neutral-500 rounded-full animate-bounce" style="animation-delay:0ms"></span><span class="w-2 h-2 bg-slate-400 dark:bg-neutral-500 rounded-full animate-bounce" style="animation-delay:150ms"></span><span class="w-2 h-2 bg-slate-400 dark:bg-neutral-500 rounded-full animate-bounce" style="animation-delay:300ms"></span></span></div></div>'
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

        this._setupTooltip();
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

    _attachBubbleListeners() {
        var self = this;
        var sentences = this.root.querySelectorAll('.chat-sentence');
        sentences.forEach(function(el) {
            el.onclick = function(e) {
                e.stopPropagation();
                var text = el.dataset.text;
                var lang = el.dataset.lang;
                if (text) self._playMessageTTS(text, lang);
            };
            var pressTimer = null;
            el.onmousedown = function() {
                pressTimer = setTimeout(function() {
                    var text = el.dataset.text;
                    if (text) self._showSentenceTranslation(el, text);
                }, 500);
            };
            el.onmouseup = function() { clearTimeout(pressTimer); };
            el.onmouseleave = function() { clearTimeout(pressTimer); };
            el.ontouchstart = function() {
                pressTimer = setTimeout(function() {
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
        var el = this.dom.messages;
        if (el) setTimeout(function() { el.scrollTop = el.scrollHeight; }, 50);
    }

    _setBusyUI(busy) {
        this.busy = busy;
        if (this.dom.send) this.dom.send.classList.toggle('hidden', busy);
        if (this.dom.input) {
            this.dom.input.disabled = busy;
            this.dom.input.placeholder = busy ? '' : 'Type your message...';
        }
        if (this.dom.mic) this.dom.mic.classList.toggle('hidden', busy);
        var typing = this.root.querySelector('#chat-typing');
        if (typing) typing.classList.toggle('hidden', !busy);
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
        this._setBusyUI(true);
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
            var units = await this._criticizePresentation(fullText, this._getTargetLang());
            this.messages.push({ role: 'assistant', text: fullText, units: units });
            this._updateMessages();
            if (units.length > 0 && units[0].text && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(units[0].text, units[0].lang || this._getTargetLang(), 'chat', 300);
            }
        } catch(e) {
            if (e.name === 'AbortError') return;
            var lang = this._getTargetLang();
            var greetings = { ja: 'こんにちは！今日は何を勉強したいですか？', ko: '안녕하세요! 오늘 무엇을 공부하고 싶으세요?', zh: '你好！今天想学什么？', es: '¡Hola! ¿Qué te gustaría practicar hoy?', fr: 'Bonjour ! Qu\'aimeriez-vous pratiquer aujourd\'hui ?', de: 'Hallo! Was möchtest du heute üben?', it: 'Ciao! Cosa vorresti praticare oggi?', pt: 'Olá! O que você gostaria de praticar hoje?', ru: 'Здравствуйте! Что вы хотели бы практиковать сегодня?' };
            this.messages.push({ role: 'assistant', text: greetings[lang] || '', units: [{ text: greetings[lang] || '', lang: lang, html: escapeHtml(greetings[lang] || '') }] });
            this._updateMessages();
            if (greetings[lang] && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(greetings[lang], lang, 'chat', 300);
            }
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

            var units = await this._criticizePresentation(cleaned, this._getTargetLang());
            this.messages.push({ role: 'assistant', text: cleaned, units: units });

            this._updateMessages();
            this._scrollToBottom();

            if (units.length > 0 && units[0].text && app.store.prefs.chatAutoPlay !== false) {
                app.audio.play(units[0].text, units[0].lang || this._getTargetLang(), 'chat', 300);
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
                        + '<div class="chat-sentence max-w-[80%] cursor-pointer select-none" data-text="' + escapeHtml(u.text) + '" data-lang="' + (u.lang || this._getTargetLang()) + '">'
                        + (u.html || escapeHtml(u.text))
                        + '</div></div>';
                }
            }
        }
        container.innerHTML = html;
        this._attachBubbleListeners();
    }

    destroy() {
        if (this.abortController) this.abortController.abort();
        super.destroy();
    }
}