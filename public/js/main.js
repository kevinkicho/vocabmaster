/* js/main.js */

// --- Robust Logger (debug only) ---
window.VM_DEBUG = location.search.includes('debug=1');
window.logBuffer = [];
if (window.VM_DEBUG) {
    function logToBuffer(type, args) {
        try {
            const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            window.logBuffer.unshift(`[${type}] ${msg}`);
            if (window.logBuffer.length > 50) window.logBuffer.pop();
            const logArea = document.getElementById('debug-log-area');
            if (logArea) logArea.value = window.logBuffer.join('\n');
        } catch (e) {}
    }
    const _log = console.log; const _err = console.error; const _warn = console.warn;
    console.log = (...args) => { _log.apply(console, args); logToBuffer('LOG', args); };
    console.error = (...args) => { _err.apply(console, args); logToBuffer('ERR', args); };
    console.warn = (...args) => { _warn.apply(console, args); logToBuffer('WRN', args); };
}
window.onerror = (msg, url, line) => { console.error(`Global: ${msg} (${url}:${line})`); };

class App {
    constructor() {
        L("App Constructing...");
        this.score = 0; 
        this.dailyScore = 0; 
        try {
            this.store = new Store();
            this.ui = new UIManager(this.store);
            this.auth = new AuthManager(); 
            this.audio = new AudioService();
            this.data = new DataService();
            this.notes = new NoteService(); 
            this.fitter = new TextFitter();
            this.celebration = new CelebrationService();
            this.analytics = new AnalyticsService();
            this.llm = new LLMService();
            this.presets = new PresetManager(); 
            this.game = null;
        } catch (e) {
            L("Constructor Fail:", e);
            alert("Critical Init Error: " + e.message);
        }
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => this.init()); } 
        else { this.init(); }
    }

    async init() {
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
            auth.onAuthStateChanged(user => {
                L("Auth State Changed:", user ? user.email : "None");
                if(this.auth) this.auth.currentUser = user;
                if(this.notes) this.notes.setUser(user);
                
                const loginBtn = document.getElementById('btn-login');
                if (loginBtn) {
                    // Safe State: Always re-enable button when state settles
                    loginBtn.disabled = false;
                    
                    if (user && !user.isAnonymous) {
                        // Logged In View
                        loginBtn.innerHTML = `<img src="${escapeHtml(user.photoURL)}" class="w-full h-full rounded-full border-2 border-indigo-200 p-0.5">`;
                        loginBtn.onclick = (e) => { e.stopPropagation(); app.ui.openProfileModal(); };
                    } else {
                        // Guest/Anon View
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
            
            // 2. Load Data (Requires Auth)
            const count = await this.data.load();
            await this.celebration.preloadShapes();
            if (this.ui) this.ui.loadSettings();

            // 2b. Init LLM — auto-detect Ollama (non-blocking)
            if (this.llm) {
                this.llm.loadPrefs();
                this.llm.autoDetect();
            }

            // 3. Mock Data Check (Matches data.js logic)
            const isMock = this.data.list.length > 0 && this.data.list[0].ja === "Test 0";
            
            if (isMock) { 
                statusBar.innerText = "Database Connection Failed (Using Mock)"; 
                statusBar.classList.add('text-rose-500'); 
            } else { 
                statusBar.innerText = `${count} Words Ready`; 
                statusBar.classList.remove('text-rose-500'); 
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
        if(loginBtn) {
            // Disable immediately to prevent double-click crash
            loginBtn.disabled = true;
            loginBtn.innerHTML = `<i class="ph-bold ph-spinner animate-spin text-xl"></i>`;
        }
        
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => {
            L("Login Error:", e);
            if(loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
            }
            if (e.code !== 'auth/popup-closed-by-user') {
                alert("Login Failed: " + e.message);
            }
        });
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
        
        this.dailyScore = await this.data.getTodayTotal();

        requestAnimationFrame(() => {
            view.innerHTML = `
                <div class="flex flex-col gap-4 sm:gap-6 w-full h-full pb-8 overflow-y-auto pt-2 px-2">
                    <div onclick="app.ui.openStatsModal()" class="bg-gradient-to-r from-white to-slate-100 dark:from-neutral-900 dark:to-black rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-neutral-800 flex justify-between relative overflow-hidden w-full shrink-0 group cursor-pointer active:scale-95 transition-transform">
                        <div class="relative z-10 w-full h-full flex flex-col justify-center">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Daily Score</p>
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

                    ${app.llm && app.llm.available && app.llm.hasModel ? `
                    <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 pl-2">AI</h3>
                    <div class="grid grid-cols-1 gap-3 sm:gap-4 w-full">
                        ${this.btn('Story Mode', 'ph-book-open-text', 'violet', ()=>new Story('story'))}
                    </div>` : ''}
                </div>`;

            if(this.fitter) this.fitter.fitAll().then(() => view.classList.add('visible')).catch(()=>view.classList.add('visible'));
            else view.classList.add('visible');
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
    }

    launch(fn) { 
        try {
            if(this.game) this.game.destroy(); 
            this.game = fn(); 
            history.pushState({ view: 'game', mode: this.game.key, index: this.game.i }, '');
        } catch(e) {
            L("Launch Error:", e);
            alert("Failed to start game: " + e.message);
        }
    }
    toggleFull() { !document.fullscreenElement ? document.documentElement.requestFullscreen().catch(()=>{}) : document.exitFullscreen(); }
    modal(show) { 
        if(this.ui) this.ui.hideTooltip();
        const el = document.getElementById('modal-settings');
        if (show) { el.classList.remove('hidden'); if(this.ui) this.ui.loadSettings(); } 
        else { if(this.store) this.store.saveSettings(); el.classList.add('hidden'); }
    }
}

window.app = new App();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => L('SW Failed', err));
    });
}
