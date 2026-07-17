/* js/chat_fab.js — Global Chat FAB + non-destructive mini tutor sheet
 * Uses #fab-container. Does not destroy app.game.
 * window.ChatFAB
 */

var ChatFAB = (function () {
    var _sheetOpen = false;
    var _sheetRoot = null;
    var _messages = [];
    var _busy = false;
    var _abort = null;

    function prefs() {
        return (window.app && app.store && app.store.prefs) || {};
    }

    function fabEnabled() {
        var p = prefs();
        if (p.chatFabEnabled === false) return false;
        return true;
    }

    function isModalOpen() {
        var ids = ['modal-settings', 'modal-stats', 'modal-profile', 'modal-note'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el && !el.classList.contains('hidden')) return true;
        }
        return false;
    }

    function shouldShow(ctx) {
        if (!fabEnabled()) return false;
        if (_sheetOpen) return false;
        if (isModalOpen()) return false;
        if (window.app && app.game && app.game.key === 'chat') return false;
        if (ctx && ctx.hide) return false;
        return true;
    }

    function hostKeyguard(enable) {
        try {
            if (!window.app || !app.game) return;
            if (enable) {
                if (typeof app.game.unbindKeys === 'function') app.game.unbindKeys();
            } else {
                if (typeof app.game.bindKeys === 'function') app.game.bindKeys();
            }
        } catch (_) {}
    }

    function collectContext() {
        var ctx = {
            source: 'fab',
            gameMode: (window.app && app.game && app.game.key) || null,
            knownLang: (prefs().presetSource) || 'en',
            targetLang: (prefs().presetTarget) || 'ja',
            unitId: null,
            tier: null,
            word: null,
            lastMiss: null
        };
        try {
            if (app.learningPath && app.learningPath.getProfile) {
                var pr = app.learningPath.getProfile();
                ctx.unitId = pr.currentUnitId;
                ctx.tier = pr.currentTier;
                ctx.targetLang = pr.targetLang || ctx.targetLang;
                ctx.knownLang = pr.knownLang || ctx.knownLang;
            }
        } catch (_) {}
        try {
            if (app.game && app.game.list && app.game.list[app.game.i]) {
                var item = app.game.list[app.game.i];
                var tLang = ctx.targetLang;
                ctx.word = item[tLang] || item.ja || item.en || String(item.id);
            }
        } catch (_) {}
        return ctx;
    }

    function ensureSheetRoot() {
        if (_sheetRoot && document.body.contains(_sheetRoot)) return _sheetRoot;
        _sheetRoot = document.getElementById('chat-sheet-root');
        if (!_sheetRoot) {
            _sheetRoot = document.createElement('div');
            _sheetRoot.id = 'chat-sheet-root';
            document.body.appendChild(_sheetRoot);
        }
        return _sheetRoot;
    }

    async function sendMessage(text) {
        if (_busy || !text || !text.trim()) return;
        if (!window.app || !app.llm) {
            appendMsg('assistant', 'AI is not connected right now.');
            return;
        }
        _busy = true;
        appendMsg('user', text.trim());
        renderSheetBody();
        var ctx = collectContext();
        var built = (window.ChatPanel && ChatPanel.buildTutorPrompt)
            ? ChatPanel.buildTutorPrompt({
                knownLang: ctx.knownLang,
                targetLang: ctx.targetLang,
                userMessage: text.trim(),
                messages: _messages.slice(0, -1),
                context: ctx
            })
            : { system: 'You are a tutor.', prompt: 'User: ' + text.trim() + '\nTutor:' };
        try {
            _abort = new AbortController();
            var raw = await app.llm.generate({
                prompt: built.prompt,
                system: built.system,
                options: { temperature: 0.6, num_predict: 256 },
                timeout: 45000,
                signal: _abort.signal
            });
            var reply = (raw || '').trim() || '…';
            appendMsg('assistant', reply);
        } catch (e) {
            appendMsg('assistant', 'Sorry — ' + ((e && e.message) || 'AI busy. Try again.'));
        }
        _busy = false;
        _abort = null;
        renderSheetBody();
    }

    function appendMsg(role, text) {
        _messages.push({ role: role, text: text, ts: Date.now() });
        if (_messages.length > 40) _messages = _messages.slice(-40);
    }

    function renderSheetBody() {
        if (!_sheetRoot) return;
        var body = _sheetRoot.querySelector('#chat-sheet-msgs');
        if (!body) return;
        body.innerHTML = _messages.map(function (m) {
            var mine = m.role === 'user';
            return '<div class="flex ' + (mine ? 'justify-end' : 'justify-start') + ' mb-2">'
                + '<div class="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed '
                + (mine ? 'bg-indigo-500 text-white rounded-br-md' : 'bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-100 rounded-bl-md')
                + '">' + escapeHtml(m.text) + '</div></div>';
        }).join('');
        body.scrollTop = body.scrollHeight;
    }

    function openSheet() {
        if (_sheetOpen) return;
        _sheetOpen = true;
        try { if (window.app && app.audio) app.audio.cancel(); } catch (_) {}
        hostKeyguard(true);
        var root = ensureSheetRoot();
        var ctx = collectContext();
        root.innerHTML =
            '<div id="chat-sheet-backdrop" class="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center">'
            + '<div class="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 flex flex-col" style="height:min(70vh,560px)" role="dialog" aria-label="AI tutor chat">'
            + '<div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-neutral-800">'
            + '<div><p class="text-sm font-black text-slate-800 dark:text-white">AI Tutor</p>'
            + '<p class="text-[10px] text-slate-400">' + escapeHtml((ctx.word ? 'About: ' + ctx.word : 'Ask anything') + (ctx.tier ? ' · ' + ctx.tier : '')) + '</p></div>'
            + '<button type="button" id="chat-sheet-close" class="w-9 h-9 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center" aria-label="Close chat"><i class="ph-bold ph-x"></i></button>'
            + '</div>'
            + '<div id="chat-sheet-msgs" class="flex-1 overflow-y-auto px-3 py-3"></div>'
            + '<div class="p-3 border-t border-slate-100 dark:border-neutral-800 flex gap-2">'
            + '<input id="chat-sheet-input" type="text" class="flex-1 rounded-full border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Type a message…"/>'
            + '<button type="button" id="chat-sheet-send" class="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0"><i class="ph-bold ph-paper-plane-tilt"></i></button>'
            + '</div></div></div>';

        if (!_messages.length) {
            appendMsg('assistant', ctx.word
                ? ('Let\'s practice with “' + ctx.word + '”. Ask for examples, pronunciation tips, or a short dialogue!')
                : 'Hi! I\'m your tutor. Ask about vocabulary, grammar, or try a short conversation.');
        }
        renderSheetBody();

        root.querySelector('#chat-sheet-close').onclick = closeSheet;
        root.querySelector('#chat-sheet-backdrop').addEventListener('click', function (e) {
            if (e.target && e.target.id === 'chat-sheet-backdrop') closeSheet();
        });
        root.querySelector('#chat-sheet-send').onclick = function () {
            var inp = root.querySelector('#chat-sheet-input');
            var t = inp && inp.value;
            if (inp) inp.value = '';
            sendMessage(t);
        };
        root.querySelector('#chat-sheet-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                root.querySelector('#chat-sheet-send').click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeSheet();
            }
        });
        document.addEventListener('keydown', onDocEsc, true);
        mountControl(); // hide FAB while open
        setTimeout(function () {
            var inp = root.querySelector('#chat-sheet-input');
            if (inp) inp.focus();
        }, 50);
    }

    function onDocEsc(e) {
        if (e.key === 'Escape' && _sheetOpen) {
            e.preventDefault();
            e.stopPropagation();
            closeSheet();
        }
    }

    function closeSheet() {
        if (!_sheetOpen) return;
        _sheetOpen = false;
        document.removeEventListener('keydown', onDocEsc, true);
        if (_abort) {
            try { _abort.abort(); } catch (_) {}
            _abort = null;
        }
        hostKeyguard(false);
        if (_sheetRoot) _sheetRoot.innerHTML = '';
        mountControl();
    }

    function mountControl() {
        var fab = document.getElementById('fab-container');
        if (!fab) return;
        if (!shouldShow({})) {
            fab.innerHTML = '';
            fab.className = 'fixed bottom-6 right-6 z-40 pointer-events-none';
            return;
        }
        fab.className = 'fixed bottom-6 right-6 z-40 pointer-events-none';
        fab.innerHTML =
            '<button type="button" id="chat-fab-btn" aria-label="Open AI tutor chat" '
            + 'class="pointer-events-auto w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center active:scale-95 transition hover:bg-indigo-500 border border-white/20">'
            + '<i class="ph-fill ph-chat-circle-text text-2xl"></i></button>';
        var btn = document.getElementById('chat-fab-btn');
        if (btn) {
            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openSheet();
            };
            btn.oncontextmenu = function (e) {
                e.preventDefault();
                // long-path: full Chat Practice
                if (window.app && typeof app.launch === 'function') {
                    closeSheet();
                    app.launch(function () { return new Chat('chat'); });
                }
            };
        }
    }

    function syncVisibility(context) {
        context = context || {};
        if (context.view === 'modal-open') {
            if (_sheetOpen) closeSheet();
        }
        mountControl();
    }

    return {
        syncVisibility: syncVisibility,
        open: openSheet,
        close: closeSheet,
        isOpen: function () { return _sheetOpen; }
    };
})();

window.ChatFAB = ChatFAB;
