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
        this._loadMemories();
        this.render();
    }

    _getTargetLang() {
        const p = app.store.prefs;
        return p.chatLang || p.flashFront || 'ja';
    }

    async _loadMemories() {
        try {
            const uid = auth && auth.currentUser && auth.currentUser.uid;
            if (!uid || !db) return;
            const snap = await db.ref('users/' + uid + '/chat_memory').orderByChild('ts').limitToLast(3).once('value');
            if (snap.exists()) {
                var vals = [];
                snap.forEach(function(c) { vals.push(c.val()); });
                this.memories = vals.sort(function(a,b) { return b.ts - a.ts; });
            }
        } catch(e) {}
    }

    _buildPrompt(userMessage) {
        var lang = this._getTargetLang();
        var p = app.store.prefs;
        var level = p.chatLevel || 'B1';
        var scenario = p.chatScenario || 'daily';
        var tagFilter = p.tagFilter || ['all'];
        var filtered = app.data.getFilteredList();
        var sampleWords = filtered.sort(function() { return Math.random() - 0.5; }).slice(0, 5).map(function(w) { return w[lang]; }).filter(Boolean).join(', ');

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
            + 'Their vocabulary covers: ' + tagInfo + '.\n'
            + 'Sample words they know: ' + (sampleWords || '(none)') + '.\n\n'
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
            return (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.text;
        }).join('\n');

        return { system: system, prompt: history + '\nUser: ' + userMessage + '\nAssistant:' };
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

        this.root.innerHTML = '<div class="flex flex-col h-full w-full overflow-hidden">'
            + '<div id="chat-header"></div>'
            + '<div class="bg-white dark:bg-neutral-900 rounded-2xl mx-2 p-2.5 border border-slate-200 dark:border-neutral-800 mb-2 shrink-0">'
            + '<div class="flex items-center gap-2">'
            + '<span class="text-[9px] font-black text-indigo-500 uppercase">' + scenarioLabel + '</span>'
            + '<span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">' + level + '</span>'
            + '<i class="ph-bold ph-info text-slate-400 cursor-pointer ml-auto relative" id="chat-info-icon"></i>'
            + '</div>'
            + '<div id="chat-info-tooltip" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg max-w-[250px] leading-relaxed">The AI responds in your target language only, uses vocabulary at your selected level, gently corrects mistakes, and ends with a follow-up question. It can save compact summaries of your progress — never full transcripts.</div>'
            + '</div>'
            + '<div id="chat-messages" class="flex-1 overflow-y-auto px-2 pb-2 thin-scroll">' + messagesHtml + '</div>'
            + '<div id="chat-audio" class="shrink-0 px-2 mb-1"></div>'
            + '<div class="flex items-center gap-2 px-2 pb-3 shrink-0">'
            + '<input id="chat-input" type="text" placeholder="Type your message..." class="flex-1 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-slate-700 dark:text-neutral-200 placeholder:text-slate-300 dark:placeholder:text-neutral-600" onkeydown="if(event.key===\'Enter\')app.game.sendMessage()">'
            + '<button id="chat-send" onclick="app.game.sendMessage()" class="w-11 h-11 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center active:scale-90 transition-all shadow-md"><i class="ph-bold ph-paper-plane-right text-lg"></i></button>'
            + '</div>'
            + '</div>';

        this.dom.header = this.root.querySelector('#chat-header');
        this.dom.messages = this.root.querySelector('#chat-messages');
        this.dom.audio = this.root.querySelector('#chat-audio');
        this.dom.input = this.root.querySelector('#chat-input');
        this.dom.send = this.root.querySelector('#chat-send');

        this.setupHeader();
        this._setupTooltip();
        this._scrollToBottom();
        this.afterRender();
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

    _scrollToBottom() {
        var el = this.dom.messages;
        if (el) setTimeout(function() { el.scrollTop = el.scrollHeight; }, 50);
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
        this.busy = true;
        if (this.dom.send) this.dom.send.disabled = true;
        input.disabled = true;

        this._updateMessages();
        this._scrollToBottom();

        var promptData = this._buildPrompt(text);
        this.abortController = new AbortController();

        var assistantText = '';
        var msgEl = null;

        try {
            var self = this;
            var fullText = await app.llm.streamGenerate({
                prompt: promptData.prompt,
                system: promptData.system,
                options: { num_predict: 256, temperature: 0.5 },
                signal: this.abortController.signal,
                timeout: 30000
            }, function(token) {
                assistantText += token;
                if (!msgEl) {
                    self.messages.push({ role: 'assistant', text: '' });
                    self._updateMessages();
                    msgEl = self.dom.messages.lastElementChild;
                }
                if (msgEl) {
                    var p = msgEl.querySelector('p');
                    if (p) p.textContent = assistantText;
                    self._scrollToBottom();
                }
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
            } else {
                this.messages.push({ role: 'assistant', text: cleaned });
            }

            this._updateMessages();
            this._scrollToBottom();

            // Play TTS for last sentence
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

        this.busy = false;
        if (this.dom.send) this.dom.send.disabled = false;
        if (this.dom.input) this.dom.input.disabled = false;
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
