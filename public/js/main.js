/* js/main.js */

// Global error hooks that navigate home on critical errors
window.onerror = (msg, url, line) => {
  console.error(`Global: ${msg} (${url}:${line})`);
  if(app && app.goHome) app.goHome(false);
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled Promise:', e.reason);
  if(app && app.goHome) app.goHome(false);
});

class App {
    constructor() {
        L("App Constructing...");
        this.score = 0; 
        this.dailyScore = 0; 
        this.score = Math.max(0, Number(this.score) || 0);
        this.dailyScore = Math.max(0, Number(this.dailyScore) || 0);
        this.game = null;
        this._returnTo = null;

        try { this.store = new Store(); } catch (e) {
            L("FATAL: Store constructor failed:", e);
            try { this.ui.showToast("Fatal Error: Cannot load settings. " + e.message, 'error'); } catch(_) { console.error("Fatal:", e); }
            this._fatalError = true;
            return;
        }
        try { this.ui = new UIManager(this.store); } catch(e) { L("UI constructor failed:", e); }
        try { this.auth = new AuthManager(); } catch(e) { L("Auth constructor failed:", e); }
        try { this.audio = new AudioService(); } catch(e) { L("Audio constructor failed:", e); }
        try { this.data = new DataService(); } catch(e) { L("Data constructor failed:", e); }
        try { this.notes = new NoteService(); } catch(e) { L("Notes constructor failed:", e); }
        try { this.fitter = new TextFitter(); } catch(e) { L("Fitter constructor failed:", e); }
        try { this.celebration = new CelebrationService(); } catch(e) { L("Celebration constructor failed:", e); }
        try { this.analytics = new AnalyticsService(); } catch(e) { L("Analytics constructor failed:", e); }
        try { this.llm = new LLMService(); } catch(e) { L("LLM constructor failed:", e); }
        try { this.presets = new PresetManager(); } catch(e) { L("Presets constructor failed:", e); }

        if (typeof window._initLearningLoop === 'function') window._initLearningLoop();
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => this.init()); } 
        else { this.init(); }

        // Android back button / browser back: return to previous game if applicable
        window.addEventListener('popstate', function(e) {
            if (e.state && e.state.returnTo && app && app.goBack) {
                app.goBack();
            } else if (e.state && e.state.view === 'home') {
                if (app && app.goHome) app.goHome(false);
            }
        });
    }

    applyUrlParameters() {
        if (!window.location.search) return;
        try {
            const params = new URLSearchParams(window.location.search);
            const targetLang = params.get('lang');
            const sourceLang = params.get('source') || 'en';
            const coll = params.get('coll');

            let configChanged = false;

            if (targetLang && this.presets) {
                L(`[CLI] Applying preset: ${sourceLang} -> ${targetLang}`);
                // This updates app.store.prefs across all modes
                this.presets.apply(sourceLang, targetLang);
                configChanged = true;
            }

            if (coll && this.store) {
                L(`[CLI] Setting active collection to: ${coll}`);
                this.store.prefs.currentCollection = coll;
                this.store.saveSettings();
                configChanged = true;
            }

            if (configChanged) {
                L("[CLI] Configuration injected via URL parameters.");
            }
        } catch (e) {
            L("URL Parse Error:", e);
        }
    }

    async init() {
        if (this._fatalError) return;
        L("App Init Start");
        const btn = document.getElementById('btn-init');
        const statusBar = document.getElementById('status-bar');
        
        // --- FIX: Settings Button Listener ---
        const btnSettings = document.getElementById('btn-settings');
        if(btnSettings) {
            btnSettings.onclick = (e) => {
                e.preventDefault(); 
                e.stopPropagation(); 
                this.modal(true);
            };
        }

        // History State Management
        if (history.state === null) history.replaceState({ view: 'home' }, '');
        window.onpopstate = (event) => {
            if (event.state && event.state.view === 'game') {
                const { mode, index } = event.state;
                if (!this.game || this.game.key !== mode) { this.launchGameMode(mode); }
                if (this.game && typeof this.game.restoreState === 'function') { this.game.restoreState(index); }
            } else { this.goHome(false); }
        };

        // --- AUTH & UI LISTENER (Central Control Tower) ---
        if(typeof firebase !== 'undefined' && typeof auth !== 'undefined') {
            // Handle OAuth redirect result (from signInWithRedirect in WebView)
            auth.getRedirectResult().catch(e => {
                // Redirect OAuth not supported from file:// origin (APK WebView)
                // This is expected; silently ignore
            });
            auth.onAuthStateChanged(user => {
                L("Auth State Changed:", user ? user.email : "None");
                if(this.auth) {
                    this.auth.currentUser = user;
                    if(user) {
                        const isAdmin = false; // set via getIdTokenResult below
                        this.auth.userRole = user.isAnonymous ? 'anonymous' : 'user';
                        if (!user.isAnonymous) {
                            // Email-based admin check (fallback if custom claims not set)
                            if (user.email === 'kevinkicho@gmail.com') {
                                this.auth.userRole = 'admin';
                            }
                            user.getIdTokenResult().then(idTokenResult => {
                                if (idTokenResult.claims.admin) {
                                    this.auth.userRole = 'admin';
                                }
                            }).catch(err => L('[Auth] Failed to get custom claims:', err));
                        }
                    } else {
                        this.auth.userRole = 'anonymous';
                    }
                }
                if(this.notes) this.notes.setUser(user);
                
                const loginBtn = document.getElementById('btn-login');
                if (loginBtn) {
                    // Safe State: Always re-enable button when state settles
                    loginBtn.disabled = false;
                    
                    if (user) {
                        if (user.isAnonymous) {
                            loginBtn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
                            loginBtn.onclick = (e) => { e.stopPropagation(); app.handleAuthClick(); };
                        } else if (user.photoURL) {
                            loginBtn.innerHTML = `<img src="${escapeHtml(user.photoURL)}" class="w-full h-full rounded-full border-2 border-indigo-200 p-0.5">`;
                            loginBtn.onclick = (e) => { e.stopPropagation(); app.ui.openProfileModal(); };
                        } else {
                            loginBtn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
                            loginBtn.onclick = (e) => { e.stopPropagation(); app.ui.openProfileModal(); };
                        }
                    } else {
                        // No user yet
                        loginBtn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
                        loginBtn.onclick = (e) => { e.stopPropagation(); this.handleAuthClick(); };
                    }
                }
            });
        }
        
        // Initial Lock
        btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed');
        
        try {
            // 1. Wait for Auth (Anonymous or Real)
            const user = await this.auth.waitForAuth();
            
            // 1b. CLI Interface: Parse URL params
            this.applyUrlParameters();
            
            // 2. Load Data (Requires Auth)
            const count = await this.data.load();
            await this.celebration.preloadShapes();
            if (this.ui) this.ui.loadSettings();

            // 2b. Init LLM — auto-detect Ollama (non-blocking)
            if (this.llm) {
                this.llm.loadPrefs();
                this.llm.autoDetect().catch(e => L('[Main] autoDetect error:', e));
            }

            statusBar.innerText = count > 0 ? `${count} Words Ready` : 'No vocabulary loaded — check RTDB connection';
            if (count === 0) {
                statusBar.classList.add('text-rose-500');
                btn.innerText = 'Retry';
                btn.onclick = () => window.location.reload();
                return;
            }
            statusBar.classList.remove('text-rose-500');

            // On first run, add a subtle gear-pulse hint instead of opening the full modal
            if (!localStorage.getItem('vm_first_run_done')) {
                try { localStorage.setItem('vm_first_run_done', '1'); } catch (e) {}
                setTimeout(() => {
                    const gearBtn = document.querySelector('[onclick*="modal(true)"]');
                    if (gearBtn) {
                        gearBtn.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2', 'dark:ring-offset-neutral-900', 'animate-pulse');
                        setTimeout(() => gearBtn.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2', 'dark:ring-offset-neutral-900', 'animate-pulse'), 8000);
                    }
                    const presetBox = document.getElementById('preset-container');
                    if (presetBox && !document.getElementById('first-run-hint')) {
                        const hint = document.createElement('div');
                        hint.id = 'first-run-hint';
                        hint.className = 'mt-2 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold';
                        hint.textContent = '👋 Tap gear icon to pick a language preset!';
                        presetBox.appendChild(hint);
                        setTimeout(() => { if (hint && hint.parentNode) hint.parentNode.removeChild(hint); }, 6500);
                    }
                }, 1200);
            }

            // 4. Enable Start
            btn.innerText = "Start"; 
            btn.disabled = false; 
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            
            btn.onclick = (e) => { 
                // Stop Ghost Clicks causing auth popup crash
                e.preventDefault();
                e.stopPropagation(); 
                
                try { if(this.audio) this.audio.unlock(); } catch(e) { }
                const overlay = document.getElementById('overlay-init');
                if(overlay) {
                    overlay.classList.add('opacity-0', 'pointer-events-none', 'transition-opacity', 'duration-500');
                    setTimeout(() => overlay.remove(), 500);
                }
            };
            
            // Bind Modal Close Events
            const bindClose = (id, obj) => {
                const el = document.getElementById(id);
                if(el) el.onclick = (e) => { if (e.target === el) (obj && obj.closeModal) ? obj.closeModal() : (obj && obj.modal ? obj.modal(false) : el.classList.add('hidden')); };
            };
            
            // Explicitly bind settings modal
            const modalSettings = document.getElementById('modal-settings');
            if(modalSettings) modalSettings.onclick = (e) => { if (e.target === modalSettings) this.modal(false); };
            
            bindClose('modal-note', this.notes);
            bindClose('modal-profile', null);
            bindClose('modal-stats', null);

            this.goHome(false); 
        } catch (e) {
            L("Init failed:", e);
            statusBar.innerText = "Error: " + e.message;
            statusBar.classList.add('text-rose-500');
            btn.innerText = "Retry"; 
            btn.disabled = false; 
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.onclick = () => window.location.reload();
        }
    }

    handleAuthClick() {
        const loginBtn = document.getElementById('btn-login');
        const resetBtn = () => {
            if(loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
            }
        };
        try {
            if(loginBtn) {
                loginBtn.disabled = true;
                loginBtn.innerHTML = `<i class="ph-bold ph-spinner animate-spin text-xl"></i>`;
            }

            const provider = new firebase.auth.GoogleAuthProvider();
            const isFileOrigin = window.location.protocol === 'file:';

            if (isFileOrigin && window.NativeAuth) {
                window.__nativeAuth.signIn().catch(e => {
                    L("Native Auth Error:", e);
                    resetBtn();
                    if (e.message && !e.message.includes('12501')) {
                        app.ui.showToast("Login Failed: " + e.message, 'error');
                    }
                });
            } else if (isFileOrigin) {
                window.location.href = 'https://vocabmaster112225.web.app/';
            } else {
                auth.signInWithPopup(provider).catch(e => {
                    L("Login Error:", e);
                    resetBtn();
                    if (e.code !== 'auth/popup-closed-by-user') {
                        app.ui.showToast("Login Failed: " + e.message, 'error');
                    }
                });
            }
        } catch (e) {
            L("handleAuthClick crashed:", e);
            resetBtn();
        }
    }

    async goHome(pushState = true) {
        if(this.game) this.game.destroy();
        this.game = null;
        if(app.audio) app.audio.cancel(); 
        if(this.ui) this.ui.hideTooltip();
        if (pushState) history.pushState({ view: 'home' }, '');

        const fab = document.getElementById('fab-container');
        if(fab) fab.innerHTML = '';
        
        const view = document.getElementById('app-view');
        if(!view) return;
        view.classList.remove('visible');
        
        this.dailyScore = Math.max(0, Number(await this.data.getTodayTotal()) || 0);

        requestAnimationFrame(() => {
            view.innerHTML = `
                <div class="flex flex-col gap-4 sm:gap-6 w-full h-full pb-8 overflow-y-auto pt-2 px-2">
                    <div onclick="app.ui.openStatsModal()" class="bg-gradient-to-r from-white to-slate-100 dark:from-neutral-900 dark:to-black rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-neutral-800 flex justify-between relative overflow-hidden w-full shrink-0 group cursor-pointer active:scale-95 transition-transform">
                        <div class="relative z-10 w-full h-full flex flex-col justify-center">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                Daily Score
                                ${ (auth && auth.currentUser) 
                                    ? (auth.currentUser.isAnonymous 
                                        ? `<span class="text-[8px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">device</span>` 
                                        : `<span class="text-[8px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">synced</span>`) 
                                    : '' }
                            </p>
                            <p class="${this.dailyScore > 0 ? 'text-7xl' : 'text-4xl uppercase'} font-black text-slate-800 dark:text-neutral-200 tracking-tighter leading-none">${this.dailyScore > 0 ? this.dailyScore : "Let's Go!"}</p>
                        </div>
                        <div class="text-9xl opacity-10 grayscale absolute -right-6 -bottom-6 rotate-12 select-none group-hover:scale-110 transition-transform duration-500">🏆</div>
                    </div>

                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">Reading</h3>
                    <div class="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                        ${this.btn('Flashcards', 'ph-cards', 'indigo', ()=>new Flashcard('flash'))}
                        ${this.btn('True / False', 'ph-check-circle', 'emerald', ()=>new TF('tf'))}
                        ${this.btn('Quiz', 'ph-question', 'pink', ()=>new Quiz('quiz'))}
                        ${this.btn('Matching', 'ph-squares-four', 'slate', ()=>new Match('match'))}
                    </div>

                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">Context</h3>
                    <div class="grid grid-cols-1 gap-3 sm:gap-4 w-full">
                        ${this.btn('Sentences', 'ph-text-t', 'violet', ()=>new Sentences('sentences'))}
                    </div>

                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">Speaking</h3>
                    <div class="grid grid-cols-1 gap-3 sm:gap-4 w-full">
                        ${this.btn('Voice Challenge', 'ph-microphone', 'sky', ()=>new Voice('voice'))}
                        ${this.btn('Chat Practice', 'ph-chat-circle-text', 'amber', ()=>new Chat('chat'))}
                    </div>

                    <!-- AI section is *always* rendered (no app.llm guard) so that Story Mode and AI Cloze
                         (the mandatory-AI no-fallback versions) are available identically whether the
                         webapp is loaded from public/ in a browser or from the Android WebView assets.
                         The games themselves enforce "AI required" + clean errors (see game_story.js
                         and game_sentences.js). Web users configure their backend (local ollama or proxy+cloud)
                         in Settings > AI. Keep this unconditional for web/Android parity. -->
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">AI</h3>
                    <div class="grid grid-cols-1 gap-3 sm:gap-4 w-full">
                        ${this.btn('Story Mode', 'ph-book-open-text', 'violet', ()=>new Story('story'))}
                        ${this.btn('Grammar Gym', 'ph-lightbulb', 'amber', ()=>new Grammar('grammar'))}
                    </div>

                    <!-- Medium-term: Smart Review (Phase 2) -->
                    <div class="mt-1 px-2">
                        <button onclick="app.launchSmartReview()" class="w-full py-2 text-xs font-bold bg-gradient-to-r from-rose-500 to-orange-500 text-white rounded-2xl active:scale-95 transition">Smart Review (Weak Words)</button>
                    </div>

                    <!-- Tag Filter -->
                    <div id="tag-filter-section" class="mt-2 px-2"></div>
                </div>`;

            if(this.fitter) this.fitter.fitAll().then(() => { view.classList.add('visible'); if(this.ui) this.ui.renderTagFilter(); }).catch(()=>{ view.classList.add('visible'); if(this.ui) this.ui.renderTagFilter(); });
            else { view.classList.add('visible'); if(this.ui) this.ui.renderTagFilter(); }
        });
    }

    btn(t, i, c, fn) {
        const colors = { indigo: 'from-indigo-500 to-violet-600', emerald: 'from-emerald-400 to-teal-500', pink: 'from-pink-500 to-rose-500', slate: 'from-slate-700 to-slate-800', sky: 'from-sky-400 to-blue-500', violet: 'from-violet-500 to-purple-600' };
        return `<button onclick="app.launch(${String(fn)})" class="bg-gradient-to-br ${colors[c]} shadow-indigo-200 dark:shadow-none text-white p-4 rounded-[2rem] h-32 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all relative overflow-hidden group hover:shadow-xl border border-white/20"><div class="mb-2 transform group-hover:scale-110 group-hover:-translate-y-1 transition-transform duration-300"><i class="ph-duotone ${i} text-5xl text-white"></i></div><span class="font-bold text-sm tracking-wide">${t}</span></button>`;
    }

    launchGameMode(mode) {
        if (mode === 'flash') this.game = new Flashcard('flash');
        else if (mode === 'quiz') this.game = new Quiz('quiz');
        else if (mode === 'tf') this.game = new TF('tf');
        else if (mode === 'match') this.game = new Match('match');
        else if (mode === 'voice') this.game = new Voice('voice');
        else if (mode === 'sentences') this.game = new Sentences('sentences');
        else if (mode === 'story') this.game = new Story('story');
        else if (mode === 'grammar') this.game = new Grammar('grammar');
        else if (mode === 'chat') this.game = new Chat('chat');
    }

    launch(fn) { 
        try {
            if(this.audio) this.audio.cancel();
            if(this.game) this.game.destroy(); 
            this.game = fn(); 
            history.pushState({ view: 'game', mode: this.game.key, index: this.game.i }, '');
        } catch(e) {
            L("Launch Error:", e.stack || e);
            if (app.ui && app.ui.showToast) app.ui.showToast("Failed to start game: " + e.message, 'error');
            this.goHome(false);
        }
    }

    // --- Sub-game navigation ---
    launchSubGame(fn) {
        if (this.game) {
            this._returnTo = { key: this.game.key };
            this.game.destroy();
            if (this.audio) this.audio.cancel();
        }
        this.game = fn();
        history.pushState({ view: 'subgame', returnTo: true }, '');
    }

    goBack() {
        if (this._returnTo) {
            var key = this._returnTo.key;
            this._returnTo = null;
            if (this.game) this.game.destroy();
            if (this.audio) this.audio.cancel();
            this.launchGameMode(key);
        } else {
            this.goHome();
        }
    }

    // Medium-term: Smart Review queue (Phase 2) - uses analytics + adaptive + current collection
    async launchSmartReview() {
        if (!this.data) return;
        const started = await this.data.startReviewSession(12);
        if (started) {
            // Launch a mixed or preferred mode with review list, e.g. Quiz for good feedback
            this.game = new Quiz('quiz');
            history.pushState({ view: 'game', mode: 'review', index: this.game.i }, '');
            // End review session when game ends (in game destroy or nav end)
            const origDestroy = this.game.destroy.bind(this.game);
            this.game.destroy = () => {
                if (this.data) this.data.endReviewSession();
                origDestroy();
            };
        } else {
            if (app.ui && app.ui.showToast) app.ui.showToast("Not enough data for review yet. Play some games first!", 'warning');
            this.goHome(false);
        }
    }
    toggleFull() { !document.fullscreenElement ? document.documentElement.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); }
    modal(show) { 
        if(this.ui) this.ui.hideTooltip();
        const el = document.getElementById('modal-settings');
        if (!el) return;
        if (show) { 
            el.classList.remove('hidden'); 
            if(this.ui) this.ui.loadSettings(); 
        } else { 
            if(this.store) this.store.saveSettings(); 
            el.classList.add('hidden'); 
        }
    }
}

window.app = new App();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => L('SW Failed', err));
    });
}
