/* js/main.js */

// Global error hooks — recover gracefully instead of blanket-resetting.
// R1: Only auto-return home when a game is mid-flight (so users don't lose
// settings/home state on unrelated promise rejections). Surface fatal inits
// via toast; never wipe the view during early boot or on the home screen.
function _handleUncaught(label, detail) {
  console.error(`[${label}]`, detail);
  try { L('UNCAUGHT', label, detail); } catch (_) {}
  if (app && app._fatalError) {
    // Already in a broken-init state — surface it, don't loop-reset.
    try { if (app.ui) app.ui.showToast('Fatal: ' + ((detail && (detail.message || detail)) || 'unknown error'), 'error'); } catch (_) {}
    return;
  }
  // Only auto-recover when a game is active; home/settings can stay put.
  if (app && app.game && app.goHome) {
    try { if (app.ui) app.ui.showToast('Recovered from an error — returned home', 'error'); } catch (_) {}
    app.goHome(false);
  }
}
window.onerror = (msg, url, line) => _handleUncaught('window.onerror', `${msg} (${url}:${line})`);
window.addEventListener('unhandledrejection', (e) => _handleUncaught('unhandledrejection', e.reason));

class App {
    constructor() {
        L("App Constructing...");
        this.score = 0; 
        this.dailyScore = 0; 
        this.score = Math.max(0, Number(this.score) || 0);
        this.dailyScore = Math.max(0, Number(this.dailyScore) || 0);
        this.game = null;
        this._returnTo = null;
        this._failedServices = {};

        // R2: Service init via single helper. Critical services set _fatalError
        // and surface a toast; non-critical services get a no-op stub so callers
        // don't crash on undefined access (graceful degradation instead of
        // cascading silent failures).
        const initService = (name, factory, critical) => {
            try {
                this[name] = factory();
            } catch (e) {
                L(`${name} constructor failed:`, e);
                this._failedServices[name] = e;
                if (critical) {
                    this._fatalError = true;
                    try {
                        if (this.ui) this.ui.showToast(`Fatal: ${name} failed to start — ${(e && e.message) || e}`, 'error');
                    } catch (_) { console.error(`Fatal: ${name} failed:`, e); }
                }
                // No-op stub so downstream `app.<name>.<method>()` calls are safe.
                this[name] = App._noopService(name);
            }
        };

        // store is critical and constructed first (UI depends on it).
        initService('store', () => new Store(), true);
        // ui must come after store; mark critical so a UI failure surfaces clearly.
        initService('ui', () => new UIManager(this.store), true);
        initService('auth', () => new AuthManager(), true);
        initService('audio', () => new AudioService(), false);
        initService('data', () => new DataService(), true);
        initService('notes', () => new NoteService(), false);
        initService('fitter', () => new TextFitter(), false);
        initService('celebration', () => new CelebrationService(), false);
        initService('analytics', () => new AnalyticsService(), false);
        initService('memory', () => new window.MemoryService(), false);
        initService('dailySession', () => new window.DailySessionService(), false);
        initService('learningPath', () => new window.LearningPathService(), false);
        initService('llm', () => new LLMService(), true);
        initService('presets', () => new PresetManager(), false);

        if (typeof window._initLearningLoop === 'function' && !this._fatalError) window._initLearningLoop();
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

    // R2: No-op service stub. Returns a plain object with explicit no-op
    // methods for the known method surface and leaves value properties
    // undefined (falsy) so `if (app.llm.available)` short-circuits correctly.
    // Used when a service constructor throws so callers degrade gracefully
    // instead of crashing on undefined access. Verbose but predictable —
    // a Proxy that returns functions for any prop would break callers that
    // read value properties like `app.store.prefs` or `app.llm.available`.
    //
    // For `store` and `data` specifically we add minimum-shape value props
    // (empty prefs object, empty list array, etc.) because those are read
    // directly by too many call sites to guard individually.
    static _noopService(name) {
        const noop = function() {};
        const stub = { _isStub: true, _failedService: name };
        // Methods observed via `grep -rhE 'app\.(audio|llm|...)\\.\\w+' public/js/`
        const methods = [
            // audio
            'cancel', 'play', 'previewVoice', 'forceDetect', 'unlock',
            // llm
            'autoDetect', 'checkConnection', 'loadPrefs', 'generate', 'generateStory',
            'generateClozeSentence', 'getGrammarExercise', 'getGrammarExplanation',
            'getListeningPassage', 'loadCachedGrammarExercise', 'clearCache',
            'getCacheCount', 'analyzeLearningPatterns', 'applyPromptAdjustments',
            // data
            'load', 'getFilteredList', 'getAllTags', 'getKanji', 'getStats',
            'recordScore', 'saveCorrection', 'saveDictionaryEntry', 'deleteUserAccount',
            'startReviewSession', 'startSpecificReview', 'endReviewSession',
            // auth
            'waitForAuth', 'logout',
            // notes
            'attachTooltipListeners', 'check', 'format', 'setUser',
            // fitter
            'fit', 'fitAll', 'fitSmart',
            // celebration
            'play', 'preloadShapes',
            // analytics
            'startSession', 'endSession', 'recordAttempt', 'getAnalytics',
            'getMostMissedWords', 'getAccuracyByMode', 'getDailyAccuracy',
            // memory (PR3a)
            'load', 'maybeMigrate', 'review', 'introduce', 'ensureCard', 'getCard',
            'finalizeSessionHolds', 'finalizeSessionRating',
            'getDueCards', 'getNewCandidates', 'countDue', 'countNew',
            'bootstrapFromWordStats', 'flush', 'resetAllKeepAnalytics', 'isEnabled',
            // dailySession (PR5 + PR7 progress chrome / complete summary)
            'compose', 'buildPlan', 'start', 'continue', 'pause', 'complete', 'abandon',
            'getProgress', 'getSummary', 'attachController', 'onGraded', 'maybeFinishStep', 'finishStep',
            'updateProgressChrome', 'hideProgressChrome', 'showCompleteSummary',
            'dismissSummary', 'dismissSummaryUi',
            // learningPath
            'load', 'flush', 'getProfile', 'setPathMode', 'togglePathMode', 'setFreePlayScope', 'setTier',
            'getActiveUnit', 'ensureUnit', 'getComposePool', 'getPracticeList',
            'selectTodayItems', 'pathProgressLabel', 'startPlacement', 'skipPlacement',
            'getUnitTheme', 'unitProgressPercent', 'listUnitsForMap', 'selectUnit',
            // presets
            'apply',
            // store
            'saveSettings', 'applyPresetSettings', 'clearMatch', 'saveMatch',
            'setAllCelebs', 'setTheme', 'getLoc', 'setLoc',
            // ui
            'showToast', 'header', 'audioBar', 'nav', 'loadSettings',
            'applyFontSettings', 'openProfileModal', 'openStatsModal',
            'openEditModal', 'closeEditModal', 'saveEdit', 'saveDictEntry',
            'switchEditTab', 'renderAISettings', 'renderCelebGrid',
            'renderLevelFilter', 'renderTagFilter', 'renderVoiceSelector',
            'updateLLMStatus', 'updateLLMCacheCount', '_updateAIStatus', 'runAIAnalysis',
            'approveAIAdjustment', 'dismissAIAdjustment', 'resetAITemplates',
            'showTooltip', 'hideTooltip', 'copyLogs', 'dumpVoices',
            'validateSettingsBindings', '_syncRadioVisual', 'modal',
            '_syncPathSettings', '_updateSessionIntensityHint',
        ];
        for (const m of methods) stub[m] = noop;

        // Minimum-shape value properties for heavily-read services.
        // store.prefs is read by ~50+ call sites; data.list by ~20+. These
        // MUST be objects/arrays so chained access (app.store.prefs.chatLevel)
        // doesn't throw. Empty values make guards like `if (list.length)` work.
        if (name === 'store') {
            stub.prefs = {};
            stub.matchState = null;
            stub.cap = {};
            stub.STORAGE_KEY = 'vocabmaster_prefs';
        } else if (name === 'data') {
            stub.list = [];
            stub.activeList = [];
            stub.currentCollection = null;
        } else if (name === 'celebration') {
            stub.effects = {};
        } else if (name === 'presets') {
            stub.languages = [];
        } else if (name === 'auth') {
            stub.currentUser = null;
            stub.userRole = 'anonymous';
        } else if (name === 'notes') {
            stub.isAdmin = false;
            stub.currentWordId = null;
        } else if (name === 'dailySession') {
            stub._ownsMemoryReviews = false;
            stub._uiPaused = false;
            stub.status = 'idle';
            stub.plan = null;
            Object.defineProperty(stub, 'isActive', { get: function () { return false; } });
            Object.defineProperty(stub, 'isPaused', { get: function () { return false; } });
        } else if (name === 'learningPath') {
            stub.profile = null;
        }
        // llm: available/hasModel/useCloud/endpoint — all stay undefined (falsy).
        // all stay undefined (falsy) — callers already guard with `if (app.llm && ...)`.
        // audio: synth/voices/useNative stay undefined — callers guard or no-op.
        return stub;
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

            // 2a. Memory engine (PR3a): load cards + staggered migrate (offline no-op)
            if (this.memory && !this.memory._isStub) {
                try {
                    if (this.memory.load) await this.memory.load();
                    if (this.memory.maybeMigrate) await this.memory.maybeMigrate();
                } catch (memErr) {
                    L('[Memory] init load/migrate failed', memErr);
                }
            }

            // 2a2. Learning path (tiered curriculum)
            if (this.learningPath && !this.learningPath._isStub) {
                try {
                    if (this.learningPath.load) await this.learningPath.load();
                } catch (pathErr) {
                    L('[Path] init load failed', pathErr);
                }
            }

            // 2b. Init LLM — F9: block up to 3s on autoDetect so the home screen
            // can show an accurate AI status immediately. If the probe is slow
            // (cold proxy, idle model), autoDetect continues in the background
            // and the persistent home-screen indicator updates when it resolves.
            // The status bar shows "Connecting to AI..." during the probe, then
            // falls through to the word-count status below (primary info). AI
            // online/offline state lives in the persistent indicator, not the
            // status bar — avoids a flash of overwritten text.
            if (this.llm && !this.llm._isStub) {
                this.llm.loadPrefs();
                statusBar.innerText = 'Connecting to AI...';
                statusBar.classList.add('text-amber-400');
                await Promise.race([
                    this.llm.autoDetect().catch(() => {}),
                    new Promise(function(r) { setTimeout(function() { r('timeout'); }, 3000); })
                ]);
                statusBar.classList.remove('text-amber-400');
                // autoDetect may still be running in background if 'timeout' won
                // the race — the home-screen indicator updates when it resolves.
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
                // Web browser: use popup. If COOP headers block window.close
                // (Cross-Origin-Opener-Policy), Firebase throws
                // auth/popup-blocked or auth/cancelled-popup-request. We
                // catch those silently and fall back to redirect.
                auth.signInWithPopup(provider).catch(e => {
                    L("Login Error:", e);
                    resetBtn();
                    if (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request' || (e.message && e.message.includes('Cross-Origin-Opener-Policy'))) {
                        // COOP blocked the popup — fall back to redirect
                        L("Popup blocked, falling back to signInWithRedirect");
                        auth.signInWithRedirect(provider);
                    } else if (e.code !== 'auth/popup-closed-by-user') {
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
        // Daily Session: pause mid-step (status stays active + pausedAt; do not finalize holds)
        // Skip pause when the completion summary is showing (status already completed).
        try {
            if (this.dailySession && !this.dailySession._isStub &&
                this.dailySession.status === 'active' &&
                !this.dailySession._uiPaused &&
                !this.dailySession._showingSummary &&
                typeof this.dailySession.pause === 'function') {
                await this.dailySession.pause();
            }
        } catch (e) {
            L('[DailySession] pause on goHome failed', e);
        }
        // PR7: clear progress chrome; if completion summary (or in-flight complete)
        // owns the view, restore status-bar and mark dismissed so complete() will not
        // repaint summary over home (F2 status-bar, F3 race).
        try {
            if (this.dailySession && !this.dailySession._isStub) {
                var ds = this.dailySession;
                if (ds._showingSummary || ds.status === 'completed') {
                    if (typeof ds.dismissSummaryUi === 'function') {
                        ds.dismissSummaryUi();
                    } else {
                        ds._summaryDismissed = true;
                        ds._showingSummary = false;
                        if (typeof ds.hideProgressChrome === 'function') ds.hideProgressChrome();
                    }
                } else if (typeof ds.hideProgressChrome === 'function') {
                    ds.hideProgressChrome();
                }
            }
        } catch (_) { /* ignore */ }
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
                                    ? `<span class="text-[8px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">synced</span>` 
                                    : '' }
                            </p>
                            <p class="${this.dailyScore > 0 ? 'text-7xl' : 'text-4xl uppercase'} font-black text-slate-800 dark:text-neutral-200 tracking-tighter leading-none">${this.dailyScore > 0 ? this.dailyScore : "Let's Go!"}</p>
                        </div>
                        <div class="text-9xl opacity-10 grayscale absolute -right-6 -bottom-6 rotate-12 select-none group-hover:scale-110 transition-transform duration-500">🏆</div>
                    </div>

                    <!-- F9: Persistent AI status indicator. Updated by ui._updateAIStatus()
                         whenever autoDetect/_ping resolves. Shows green (online), gray (detecting),
                         or rose (offline) so users always know if AI features will work. -->
                    <div id="ai-status-indicator" class="flex items-center gap-1.5 px-2 -mt-2">
                        <span id="ai-status-dot" class="w-2 h-2 rounded-full bg-slate-300"></span>
                        <span id="ai-status-label" class="text-[9px] font-bold text-slate-400 uppercase">AI detecting...</span>
                    </div>

                    ${this._homePathAndTodayHtml()}

                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">Practice freely</h3>
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">Reading</h3>
                    <div class="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                        ${this.btn('Flashcards', 'ph-cards', 'indigo', ()=>new Flashcard('flash'))}
                        ${this.btn('True / False', 'ph-check-circle', 'emerald', ()=>new TF('tf'))}
                        ${this.btn('Quiz', 'ph-question', 'pink', ()=>new Quiz('quiz'))}
                        ${this.btn('Matching', 'ph-squares-four', 'slate', ()=>new Match('match'))}
                    </div>

                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">Context</h3>
                    <div class="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                        ${this.btn('Sentences', 'ph-text-t', 'violet', ()=>new Sentences('sentences'))}
                        ${this.btn('Sentence Build', 'ph-rows', 'pink', ()=>new SentenceBuild('sentence_build'))}
                    </div>

                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">Speaking</h3>
                    <div class="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                        ${this.btn('Voice Challenge', 'ph-microphone', 'sky', ()=>new Voice('voice'))}
                        ${this.btn('Dictation', 'ph-headphones', 'rose', ()=>new Dictation('dictation'))}
                    </div>

                    <!-- AI section: 2x2 grid with Chat Practice, Story Mode, Grammar Gym.
                         Chat Practice moved here from "Speaking" — it's AI-powered.
                         Sentences (AI Cloze) stays under "Context" since it works
                         without AI too (regex cloze fallback). -->
                    <!-- AI section is *always* rendered (no app.llm guard) so that Story Mode and AI Cloze
                         (the mandatory-AI no-fallback versions) are available identically whether the
                         webapp is loaded from public/ in a browser or from the Android WebView assets.
                         The games themselves enforce "AI required" + clean errors (see game_story.js
                         and game_sentences.js). Web users configure their backend (local ollama or proxy+cloud)
                         in Settings > AI. Keep this unconditional for web/Android parity. -->
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">AI</h3>
                    <div class="grid grid-cols-2 gap-3 sm:gap-4 w-full">
                        ${this.btn('Story Mode', 'ph-book-open-text', 'violet', ()=>new Story('story'))}
                        ${this.btn('Grammar Gym', 'ph-lightbulb', 'amber', ()=>new Grammar('grammar'))}
                        ${this.btn('Chat Practice', 'ph-chat-circle-text', 'cyan', ()=>new Chat('chat'))}
                        ${this.btn('Word Context', 'ph-flowers', 'emerald', ()=>new Context('context'))}
                    </div>

                    <!-- Tag Filter -->
                    <div id="tag-filter-section" class="mt-2 px-2"></div>
                </div>`;

            var afterHome = () => {
                if (this.ui) { this.ui.renderTagFilter(); this.ui._updateAIStatus(); }
                if (window.ChatFAB) window.ChatFAB.syncVisibility({ view: 'home' });
                this._loadCoachTip();
            };
            if(this.fitter) this.fitter.fitAll().then(() => { view.classList.add('visible'); afterHome(); }).catch(()=>{ view.classList.add('visible'); afterHome(); });
            else { view.classList.add('visible'); afterHome(); }
        });
    }

    /** Non-blocking coach tip of the day into #home-coach-tip. */
    _loadCoachTip() {
        try {
            if (!window.TutorMoments || typeof TutorMoments.coachTipOfDay !== 'function') return;
            var el = document.getElementById('home-coach-tip');
            if (!el) return;
            TutorMoments.coachTipOfDay().then(function (text) {
                var node = document.getElementById('home-coach-tip');
                if (!node || !text) return;
                node.textContent = text;
                node.classList.remove('hidden');
            }).catch(function () {});
        } catch (_) {}
    }

    /** Today CTA + path card HTML for home. */
    _homePathAndTodayHtml() {
        var pathHtml = '';
        try {
            if (this.learningPath && !this.learningPath._isStub) {
                var prof = this.learningPath.getProfile ? this.learningPath.getProfile() : null;
                if (prof) {
                    var label = this.learningPath.pathProgressLabel ? this.learningPath.pathProgressLabel() : (prof.currentTier || '');
                    var isGuided = prof.pathMode === 'guided';
                    var modeLabel = isGuided ? 'Guided path' : 'Free practice';
                    var unitPct = 0;
                    try {
                        if (this.learningPath.unitProgressPercent) unitPct = this.learningPath.unitProgressPercent() || 0;
                    } catch (_) {}
                    var resumableToday = false;
                    try {
                        resumableToday = this.dailySession && this.dailySession.hasResumableSession &&
                            this.dailySession.hasResumableSession();
                    } catch (_) {}
                    // Two-state mode chip: label = current mode; tooltip = what click does
                    var modeChipLabel = isGuided ? 'Guided learning' : 'Free learning';
                    var modeChipClass = isGuided
                        ? 'text-[10px] font-bold px-3 py-1.5 rounded-full bg-emerald-600 text-white'
                        : 'text-[10px] font-bold px-3 py-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200';
                    var modeChipTitle = isGuided
                        ? 'Currently guided. Click to switch to free practice (all filtered words)'
                        : 'Currently free practice. Click to switch to guided path (units + Today spine)';
                    pathHtml = '<div class="px-1">'
                        + '<div class="rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">'
                        + '<p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Learning path</p>'
                        + '<p class="text-sm font-bold text-slate-800 dark:text-white">' + (label || 'Set your path') + '</p>'
                        + '<p class="text-[11px] text-slate-500 mt-1">' + modeLabel + ' · '
                        + (typeof langNativeName === 'function' ? langNativeName(prof.targetLang) : (prof.targetLang || ''))
                        + '</p>'
                        + (isGuided
                            ? '<div class="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden" aria-hidden="true">'
                              + '<div class="h-full rounded-full bg-indigo-500" style="width:' + Math.min(100, unitPct) + '%"></div></div>'
                              + '<p class="text-[10px] text-slate-400 mt-1">' + unitPct + '% unit words seen</p>'
                            : '')
                        + '<div id="home-coach-tip" class="hidden mt-2 text-[11px] text-slate-600 dark:text-neutral-300 leading-relaxed"></div>'
                        + '<div class="flex flex-wrap gap-2 mt-3">'
                        + '<button type="button" onclick="app.openLearningMap && app.openLearningMap()" class="text-[10px] font-bold px-3 py-1.5 rounded-full bg-indigo-600 text-white">Learning map</button>'
                        + (resumableToday
                            ? '<button type="button" onclick="app.dailySession.continue()" class="text-[10px] font-bold px-3 py-1.5 rounded-full bg-emerald-500 text-white">Continue</button>'
                            : '<button type="button" onclick="app.dailySession && app.dailySession.start()" class="text-[10px] font-bold px-3 py-1.5 rounded-full bg-emerald-500 text-white">'
                              + (isGuided ? 'Continue with guided' : 'Start Today') + '</button>')
                        + '<button type="button" onclick="app.learningPath.togglePathMode();app.goHome(false)" class="' + modeChipClass + '" title="' + modeChipTitle + '" aria-pressed="' + (isGuided ? 'true' : 'false') + '">'
                        + modeChipLabel + '</button>'
                        + '</div></div></div>';
                }
            }
        } catch (_) { pathHtml = ''; }

        var todayHtml = '';
        try {
            var memOn = (typeof window.isMemoryEngineEnabled === 'function')
                ? window.isMemoryEngineEnabled()
                : !!window.MEMORY_ENGINE_ENABLED;
            if (memOn && this.dailySession && !this.dailySession._isStub) {
                var dueN = 0, newN = 0;
                if (this.memory && this.memory.countDue) {
                    try { dueN = this.memory.countDue(Date.now()) || 0; } catch (_) {}
                }
                var resumable = this.dailySession.hasResumableSession && this.dailySession.hasResumableSession();
                var empty = dueN === 0 && newN === 0 && !resumable;
                // Prefer path-aware counts when guided
                try {
                    if (this.learningPath && this.learningPath.selectTodayItems) {
                        var d = (typeof getSessionDefaults === 'function')
                            ? getSessionDefaults(this.store && this.store.prefs)
                            : { maxNew: 5, maxDue: 12 };
                        var sel = this.learningPath.selectTodayItems(d, Date.now());
                        dueN = (sel.due || []).length;
                        newN = (sel.newItems || []).length;
                        empty = dueN === 0 && newN === 0 && !resumable;
                    }
                } catch (_) {}

                var est = (typeof getSessionDefaults === 'function' && this.store)
                    ? (getSessionDefaults(this.store.prefs).estimatedMinutes || 8)
                    : 8;
                todayHtml = '<div class="px-1">'
                    + '<div class="rounded-[1.5rem] p-5 bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">'
                    + '<p class="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Today</p>';
                if (empty) {
                    todayHtml += '<p class="text-sm font-bold">All caught up — practice freely below, or check back later.</p>'
                        + '<div class="flex flex-wrap gap-2 mt-4">'
                        + '<button type="button" onclick="app.openSettingsToDailyActivities && app.openSettingsToDailyActivities()" class="px-3 py-1.5 rounded-full bg-white/20 text-white text-[10px] font-bold">Today modes</button>'
                        + '</div>';
                } else {
                    todayHtml += '<p class="text-lg font-black tracking-tight">' + dueN + ' due · ' + newN + ' new · ~' + est + ' min</p>'
                        + '<p class="text-[11px] opacity-80 mt-1">Spaced repetition + path words</p>'
                        + '<div class="flex flex-wrap gap-2 mt-4">';
                    if (resumable) {
                        todayHtml += '<button type="button" onclick="app.dailySession.continue()" class="px-4 py-2 rounded-full bg-white text-indigo-700 text-xs font-black active:scale-95">Continue</button>'
                            + '<button type="button" onclick="app.dailySession.start({force:true})" class="px-4 py-2 rounded-full bg-white/20 text-white text-xs font-bold active:scale-95">Start new</button>';
                    } else {
                        todayHtml += '<button type="button" onclick="app.dailySession.start()" class="px-4 py-2 rounded-full bg-white text-indigo-700 text-xs font-black active:scale-95">Start session</button>';
                    }
                    todayHtml += '<button type="button" onclick="app.openSettingsToDailyActivities && app.openSettingsToDailyActivities()" class="px-3 py-1.5 rounded-full bg-white/20 text-white text-[10px] font-bold active:scale-95">Today modes</button>';
                    todayHtml += '</div>';
                }
                todayHtml += '</div></div>';
            }
        } catch (e) {
            L('[Home] Today card failed', e);
        }
        return pathHtml + todayHtml;
    }

    btn(t, i, c, fn) {
        const colors = { indigo: 'from-indigo-500 to-violet-600', emerald: 'from-emerald-400 to-teal-500', pink: 'from-pink-500 to-rose-500', slate: 'from-slate-700 to-slate-800', sky: 'from-sky-400 to-blue-500', violet: 'from-violet-500 to-purple-600' };
        return `<button onclick="app.launch(${String(fn)})" class="bg-gradient-to-br ${colors[c]} shadow-indigo-200 dark:shadow-none text-white p-4 rounded-[2rem] h-32 flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all relative overflow-hidden group hover:shadow-xl border border-white/20"><div class="mb-2 transform group-hover:scale-110 group-hover:-translate-y-1 transition-transform duration-300"><i class="ph-duotone ${i} text-5xl text-white"></i></div><span class="font-bold text-sm tracking-wide">${t}</span></button>`;
    }

    /**
     * Learning map sheet: units in current tier + continue / placement actions.
     * Replaces awkward free-scope chips on the path card.
     */
    openLearningMap() {
        try {
            if (!this.learningPath || this.learningPath._isStub) {
                if (this.ui && this.ui.showToast) this.ui.showToast('Learning path not ready yet', 'info');
                return;
            }
            var prof = this.learningPath.getProfile();
            if (prof.pathMode !== 'guided') {
                this.learningPath.setPathMode('guided');
                this.learningPath.ensureUnit(0);
                prof = this.learningPath.getProfile();
            }
            var units = (typeof this.learningPath.listUnitsForMap === 'function')
                ? this.learningPath.listUnitsForMap()
                : [];
            var existing = document.getElementById('learning-map-root');
            if (existing) existing.remove();

            var root = document.createElement('div');
            root.id = 'learning-map-root';
            var unitRows = units.map(function (u) {
                var active = u.unitId === prof.currentUnitId;
                var locked = !!u.locked;
                var pct = u.progress != null ? u.progress : 0;
                var cls = locked
                    ? 'opacity-50'
                    : (active ? 'ring-2 ring-indigo-400' : '');
                return '<button type="button" data-unit-index="' + u.index + '" ' +
                    (locked ? 'disabled' : '') +
                    ' class="w-full text-left rounded-2xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 mb-2 ' + cls + '">' +
                    '<div class="flex justify-between items-center">' +
                    '<span class="text-sm font-black text-slate-800 dark:text-white">Unit ' + (u.index + 1) +
                    (u.themeTitle ? ' · ' + escapeHtml(u.themeTitle) : '') + '</span>' +
                    '<span class="text-[10px] font-bold text-slate-400">' +
                    (locked ? 'Locked' : (active ? 'Current' : pct + '%')) + '</span></div>' +
                    '<p class="text-[11px] text-slate-500 mt-1">' + (u.wordCount || 0) + ' words · ' + escapeHtml(u.tier || '') + '</p>' +
                    (!locked ? '<div class="mt-2 h-1 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden"><div class="h-full bg-indigo-500" style="width:' + Math.min(100, pct) + '%"></div></div>' : '') +
                    '</button>';
            }).join('');

            root.innerHTML =
                '<div class="fixed inset-0 bg-black/40 z-[70] flex items-end sm:items-center justify-center" id="learning-map-backdrop">' +
                '<div class="w-full max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 max-h-[85vh] flex flex-col" role="dialog" aria-label="Learning map">' +
                '<div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-neutral-800">' +
                '<div><p class="text-sm font-black text-slate-800 dark:text-white">Learning map</p>' +
                '<p class="text-[10px] text-slate-400">' + escapeHtml(prof.currentTier || '') + ' · ' + escapeHtml(prof.framework || '') + '</p></div>' +
                '<button type="button" id="learning-map-close" class="w-9 h-9 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center" aria-label="Close"><i class="ph-bold ph-x"></i></button>' +
                '</div>' +
                '<div class="flex-1 overflow-y-auto px-4 py-3">' +
                (unitRows || '<p class="text-sm text-slate-500">No units yet — start guided path first.</p>') +
                '</div>' +
                '<div class="px-4 py-3 border-t border-slate-100 dark:border-neutral-800 flex flex-wrap gap-2">' +
                '<button type="button" id="learning-map-continue" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black">Continue</button>' +
                '<button type="button" id="learning-map-placement" class="py-2.5 px-3 rounded-xl bg-amber-500 text-white text-xs font-bold">Placement</button>' +
                '</div></div></div>';

            document.body.appendChild(root);
            var self = this;
            function close() {
                var el = document.getElementById('learning-map-root');
                if (el) el.remove();
            }
            function onEsc(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    doClose();
                }
            }
            function doClose() {
                document.removeEventListener('keydown', onEsc, true);
                var el = document.getElementById('learning-map-root');
                if (el) el.remove();
            }
            document.addEventListener('keydown', onEsc, true);
            root.querySelector('#learning-map-close').onclick = doClose;
            root.querySelector('#learning-map-backdrop').addEventListener('click', function (e) {
                if (e.target && e.target.id === 'learning-map-backdrop') doClose();
            });
            root.querySelector('#learning-map-continue').onclick = function () {
                doClose();
                if (self.dailySession && self.dailySession.hasResumableSession && self.dailySession.hasResumableSession()) {
                    self.dailySession.continue();
                } else if (self.dailySession && self.dailySession.start) {
                    self.dailySession.start();
                }
            };
            root.querySelector('#learning-map-placement').onclick = function () {
                doClose();
                if (self.learningPath.startPlacement) self.learningPath.startPlacement();
            };
            root.querySelectorAll('[data-unit-index]').forEach(function (btn) {
                btn.setAttribute('aria-current', btn.className.indexOf('ring-2') !== -1 ? 'true' : 'false');
                btn.onclick = function () {
                    var idx = parseInt(btn.getAttribute('data-unit-index'), 10);
                    if (self.learningPath.selectUnit) self.learningPath.selectUnit(idx);
                    doClose();
                    self.goHome(false);
                };
            });
            // Focus first interactive control (a11y F5)
            setTimeout(function () {
                var first = root.querySelector('[data-unit-index]:not([disabled])') ||
                    root.querySelector('#learning-map-continue');
                if (first) first.focus();
            }, 30);
        } catch (e) {
            L('[Path] openLearningMap failed', e);
            if (this.ui && this.ui.showToast) this.ui.showToast('Could not open learning map', 'error');
        }
    }

    launchGameMode(mode) {
        if (mode === 'flash') this.game = new Flashcard('flash');
        else if (mode === 'quiz') this.game = new Quiz('quiz');
        else if (mode === 'tf') this.game = new TF('tf');
        else if (mode === 'match') this.game = new Match('match');
        else if (mode === 'voice') this.game = new Voice('voice');
        else if (mode === 'sentences') this.game = new Sentences('sentences');
        else if (mode === 'sentence_build') this.game = new SentenceBuild('sentence_build');
        else if (mode === 'dictation') this.game = new Dictation('dictation');
        else if (mode === 'context') this.game = new Context('context');
        else if (mode === 'story') this.game = new Story('story');
        else if (mode === 'grammar') this.game = new Grammar('grammar');
        else if (mode === 'chat') this.game = new Chat('chat');
    }

    launch(fn) { 
        try {
            if (window.ChatFAB && ChatFAB.isOpen && ChatFAB.isOpen()) ChatFAB.close();
            if(this.audio) this.audio.cancel();
            if(this.game) this.game.destroy(); 
            this.game = fn(); 
            history.pushState({ view: 'game', mode: this.game.key, index: this.game.i }, '');
            if (window.ChatFAB) window.ChatFAB.syncVisibility({ view: 'game', mode: this.game && this.game.key });
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

    toggleFull() { !document.fullscreenElement ? document.documentElement.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); }
    modal(show) { 
        if(this.ui) this.ui.hideTooltip();
        const el = document.getElementById('modal-settings');
        if (!el) return;
        if (show) { 
            el.classList.remove('hidden'); 
            if(this.ui) this.ui.loadSettings(); 
            if (window.ChatFAB) window.ChatFAB.syncVisibility({ view: 'modal-open' });
        } else { 
            if(this.store) this.store.saveSettings(); 
            el.classList.add('hidden'); 
            if (window.ChatFAB) window.ChatFAB.syncVisibility({ view: 'home' });
        }
    }

    /**
     * F6b: open Settings scrolled to Daily activities (Today mode prefs).
     */
    openSettingsToDailyActivities() {
        this.modal(true);
        requestAnimationFrame(function () {
            var section = document.getElementById('settings-daily-activities');
            if (section && typeof section.scrollIntoView === 'function') {
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                try {
                    section.classList.add('ring-2', 'ring-indigo-400', 'rounded-xl');
                    setTimeout(function () {
                        section.classList.remove('ring-2', 'ring-indigo-400', 'rounded-xl');
                    }, 1600);
                } catch (_) {}
            }
        });
    }
}

window.app = new App();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => L('SW Failed', err));
    });
}
