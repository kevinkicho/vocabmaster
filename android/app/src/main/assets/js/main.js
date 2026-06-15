/* js/main.js */

// --- Robust Logger (always capture for debug, persistent to localStorage, exportable as file) ---
// Also mirrors to RTDB under the signed-in (or anon) uid so logs survive app restarts/crashes
// and are accessible for remote analysis without USB/adb/download friction.
window.VM_DEBUG = location.search.includes('debug=1');
window.logBuffer = [];
try {
    const saved = localStorage.getItem('vm_log_buffer');
    if (saved) window.logBuffer = JSON.parse(saved).slice(0, 200);
} catch(e) {}

// Stable session id so logs from one "run" (including restarts) stay grouped in RTDB
window.VM_SESSION_ID = localStorage.getItem('vm_session_id') || ('s_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7));
localStorage.setItem('vm_session_id', window.VM_SESSION_ID);

window._logFlushPending = false;

let _autoFlushTimer = null;
function scheduleAutoFlush() {
  if (_autoFlushTimer) clearTimeout(_autoFlushTimer);
  _autoFlushTimer = setTimeout(() => {
    if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});
  }, 8000); // automatic push ~8s after log activity, no button needed
}

function logToBuffer(type, args) {
    try {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        window.logBuffer.unshift(`[${type}] ${msg}`);
        if (window.logBuffer.length > 200) window.logBuffer.length = 200;
        // persist local
        try { localStorage.setItem('vm_log_buffer', JSON.stringify(window.logBuffer)); } catch(e){}
        const logArea = document.getElementById('debug-log-area');
        if (logArea) logArea.value = window.logBuffer.join('\n');
        // mark for remote (RTDB) mirror
        window._logFlushPending = true;
        scheduleAutoFlush();
    } catch (e) {}
}

// Always capture to buffer (even without ?debug=1), so errors in Story/LLM are always logged for export
const _log = console.log; const _err = console.error; const _warn = console.warn;
console.log = (...args) => { _log.apply(console, args); logToBuffer('LOG', args); };
console.error = (...args) => { _err.apply(console, args); logToBuffer('ERR', args); };
console.warn = (...args) => { _warn.apply(console, args); logToBuffer('WRN', args); };

// Global error hooks also try to flush what we have to RTDB (best-effort)
window.onerror = (msg, url, line) => {
  console.error(`Global: ${msg} (${url}:${line})`);
  if (window.flushDebugLogsToRTDB) setTimeout(() => window.flushDebugLogsToRTDB().catch(()=>{}), 300);
  if(app && app.goHome) app.goHome(false);
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled Promise:', e.reason);
  if (window.flushDebugLogsToRTDB) setTimeout(() => window.flushDebugLogsToRTDB().catch(()=>{}), 300);
  if(app && app.goHome) app.goHome(false);
});

// --- RTDB remote logging (per-user, bounded, safe for anon + real accounts) ---
// Schema: debug_logs/{uid}/sessions/{VM_SESSION_ID}/
//   meta: {started, ua, version, platform}
//   batches: push({at: serverTs, n, lines: [...]})   // we push compact recent batches
// Pruning keeps only the last ~15 batches per session (tiny data, easy to browse in console).
window.flushDebugLogsToRTDB = async function() {
  try {
    if (!db || !auth || !auth.currentUser) return false;
    const uid = auth.currentUser.uid;
    const sess = window.VM_SESSION_ID || 'default';
    const base = db.ref(`users/${uid}/debug_logs/sessions/${sess}`);

    // Write meta once per session (non-blocking for future)
    try {
      const metaSnap = await base.child('meta').once('value');
      if (!metaSnap.exists()) {
        await base.child('meta').set({
          started: Date.now(),
          ua: String(navigator.userAgent || '').slice(0, 180),
          version: (document.title || 'VocabMaster').slice(0, 40),
          platform: (window.NativeTTS ? 'android-webview-native' : (window.Capacitor ? 'capacitor' : 'web'))
        });
      }
    } catch(_) {}

    const buffer = (window.logBuffer || []).slice();
    if (buffer.length === 0) return true;

    // Push a single compact batch with the most recent lines (oldest-first inside the batch)
    const recent = buffer.slice(0, 60).reverse();
    await base.child('batches').push({
      at: firebase.database.ServerValue.TIMESTAMP,
      n: recent.length,
      lines: recent
    });

    // Light prune: keep last ~15 batches only
    try {
      const snap = await base.child('batches').once('value');
      const val = snap.val() || {};
      const keys = Object.keys(val);
      if (keys.length > 15) {
        const drop = keys.slice(0, keys.length - 15);
        const updateObj = {};
        drop.forEach(k => { updateObj['batches/' + k] = null; });
        await base.update(updateObj);
      }
    } catch(_) {}

    try { localStorage.setItem('vm_last_rtdb_push', String(Date.now())); } catch(_) {}
    window._logFlushPending = false;

    // Let UI refresh status if the settings pane is open
    if (window.app && window.app.ui && typeof window.app.ui.updateRemoteLogStatus === 'function') {
      try { window.app.ui.updateRemoteLogStatus(); } catch(_) {}
    }
    return true;
  } catch (e) {
    // Logging must never crash the app
    try { console.warn('[RTDB-LOG] flush skipped:', (e && e.message) || e); } catch(_) {}
    return false;
  }
};

class App {
    constructor() {
        L("App Constructing...");
        this.score = 0; 
        this.dailyScore = 0; 
        this.score = Math.max(0, Number(this.score) || 0);
        this.dailyScore = Math.max(0, Number(this.dailyScore) || 0);
        this.game = null;

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
                if (this.data) this.data.setCollection(coll);
                // Force a save so data.js loads it
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
                        const isAdmin = user.email && user.email.toLowerCase() === 'kevinkicho@gmail.com';
                        this.auth.userRole = user.isAnonymous ? 'anonymous' : isAdmin ? 'admin' : 'user';
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

            statusBar.innerText = count > 0 ? `${count} Words Ready` : 'No vocabulary loaded';
            if (count === 0) statusBar.classList.add('text-rose-500');
            else statusBar.classList.remove('text-rose-500');

            // Start periodic RTDB log mirroring (every ~20s when there is new activity).
            // This + error hooks + settings-close + goHome means logs are usually in the cloud even if
            // the user never taps "Download .log File".
            this._logFlushTimer = setInterval(() => {
                if (window._logFlushPending && window.flushDebugLogsToRTDB) {
                    window.flushDebugLogsToRTDB().catch(() => {});
                }
            }, 20000);

            // Automatic RTDB log connect + flush on initialization (after auth ready).
            // Logs are pushed automatically on start and ~8s after any activity via scheduleAutoFlush.
            // No manual "Push" required; use Fetch/Download in Developer to export for analysis.
            setTimeout(() => {
                if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});
            }, 2000);
            setTimeout(() => {
                if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});
            }, 5000);

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
                window.__nativeAuth.signIn().then(() => {
                    resetBtn();
                }).catch(e => {
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
        // Push whatever we have to RTDB before tearing down the current game (Story/LLM failures etc. will be captured)
        if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});

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

                    <!-- Medium-term: Collection / Tier picker (Phase 1) -->
                    <div class="mt-2 px-2">
                        <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Collection / Tier</div>
                        <select id="collection-picker" class="w-full text-sm font-bold bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-2xl px-3 py-2" 
                                onchange="app.setCollection(this.value)">
                            <!-- Populated dynamically from vocabulary-collections if available -->
                            <option value="all">All Words</option>
                            <option value="es-a1">Spanish A1</option>
                            <option value="jlpt-n5">JLPT N5</option>
                            <option value="jlpt-n3">JLPT N3 (enriched)</option>
                            <option value="jlpt-n2">JLPT N2 (enriched)</option>
                            <option value="jlpt-n1">JLPT N1 (enriched)</option>
                        </select>
                    </div>

                    <!-- Medium-term: Smart Review (Phase 2) -->
                    <div class="mt-1 px-2">
                        <button onclick="app.launchSmartReview()" class="w-full py-2 text-xs font-bold bg-gradient-to-r from-rose-500 to-orange-500 text-white rounded-2xl active:scale-95 transition">Smart Review (Weak Words)</button>
                    </div>
                </div>`;

            if(this.fitter) this.fitter.fitAll().then(() => view.classList.add('visible')).catch(()=>view.classList.add('visible'));
            else view.classList.add('visible');

            // Sync collection picker with current state + make dynamic if collections module present
            setTimeout(() => {
                const picker = document.getElementById('collection-picker');
                if (picker) {
                    if (typeof listCollections === 'function') {
                        const cols = listCollections();
                        picker.innerHTML = cols.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                    }
                    if (this.data) {
                        picker.value = this.data.currentCollection || 'all';
                    }
                }
            }, 0);
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

    // Medium-term collections support (Phase 1)
    setCollection(id) {
        if (this.data) this.data.setCollection(id);
        // Persist simply in prefs for now (can move to registry)
        if (this.store && this.store.prefs) {
            this.store.prefs.currentCollection = id;
            // light save without full modal cycle
            try { localStorage.setItem(this.store.STORAGE_KEY, JSON.stringify(this.store.prefs)); } catch(e){}
        }
        // Re-render home so filters feel live
        this.goHome(false);
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
            // Flush any new logs when user closes Settings (common place they reproduce issues then want to capture)
            if (window.flushDebugLogsToRTDB) window.flushDebugLogsToRTDB().catch(() => {});
            el.classList.add('hidden'); 
        }
    }

    // Public wrapper so UI / other modules can call app.flushLogsToRTDB()
    async flushLogsToRTDB() {
        if (window.flushDebugLogsToRTDB) return window.flushDebugLogsToRTDB();
        return false;
    }
}

window.app = new App();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => L('SW Failed', err));
    });
}
