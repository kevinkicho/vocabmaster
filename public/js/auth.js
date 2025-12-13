/* js/auth.js */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.adminEmail = "kevinkicho@gmail.com";
        
        this._resolveReady = null;
        this.readyPromise = new Promise((resolve) => {
            this._resolveReady = resolve;
        });
        
        this.init();
    }

    init() {
        if (!auth) {
            if(this._resolveReady) this._resolveReady(false);
            return;
        }

        auth.getRedirectResult().then((result) => {
            if (result.user) console.log("[Auth] Redirect Login Success");
        }).catch((error) => console.error("[Auth] Redirect Error:", error));

        auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.isAdmin = (user.email === this.adminEmail);
                console.log(`[Auth] User: ${user.uid} | Anon: ${user.isAnonymous} | Admin: ${this.isAdmin}`);
                
                if (window.app && window.app.data) {
                    window.app.data.resetSession();
                }

                if (this._resolveReady) {
                    this._resolveReady(true);
                    this._resolveReady = null;
                }
                
                // FIX: Show loading screen immediately to prevent flicker
                if(!user.isAnonymous) {
                     const overlay = document.getElementById('overlay-init');
                     if(overlay) {
                         // Re-use or show overlay
                         overlay.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
                         const btn = document.getElementById('btn-init');
                         if(btn) { btn.innerText = "Syncing Profile..."; btn.disabled = true; }
                     } else {
                         // If overlay was removed, maybe create a temp one, or just rely on speed
                         // But since we want to enforce delay, it's best if main.js doesn't destroy it too early,
                         // or we recreate a blocker. For now, let's assume overlay might still be there if this is initial load.
                         // If this is a re-login (logout -> login), we might need a spinner.
                         // Simplest fix for "Flicker after login":
                         if(window.app && window.app.ui) {
                             document.body.insertAdjacentHTML('beforeend', '<div id="temp-loader" class="fixed inset-0 bg-slate-900 z-[9999] flex items-center justify-center transition-opacity duration-500"><i class="ph-bold ph-spinner animate-spin text-4xl text-white"></i></div>');
                         }
                     }
                     
                     // Artificial delay to let data fetch and UI settle
                     setTimeout(() => {
                         const temp = document.getElementById('temp-loader');
                         if(temp) { temp.classList.add('opacity-0'); setTimeout(()=>temp.remove(), 500); }
                         
                         const overlay = document.getElementById('overlay-init');
                         if(overlay) { overlay.classList.add('opacity-0', 'pointer-events-none'); setTimeout(()=>overlay.remove(), 500); }
                         
                         if(window.app) window.app.goHome(false);
                     }, 1500);
                     
                } else {
                    // Anon login proceeds normally
                    if(window.app) window.app.goHome(false);
                }

            } else {
                console.log("[Auth] No user, signing in anonymously...");
                auth.signInAnonymously().catch((error) => {
                    console.error("[Auth] Anon Sign-in failed", error);
                    if (this._resolveReady) {
                        this._resolveReady(false);
                        this._resolveReady = null;
                    }
                });
            }
            
            if(window.app && window.app.ui) {
                const btn = document.getElementById('btn-login');
                if(btn && user && !user.isAnonymous && user.photoURL) {
                     btn.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full border border-slate-200 dark:border-neutral-600">`;
                } else if(btn) {
                     btn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
                }

                const devTab = document.getElementById('details-developer');
                if (devTab) {
                    if (this.isAdmin) devTab.classList.remove('hidden');
                    else devTab.classList.add('hidden');
                }
            }
        });
    }

    async waitForAuth() {
        return this.readyPromise;
    }

    login() {
        if (!auth || !provider) return;
        auth.signInWithRedirect(provider);
    }

    logout() {
        if (!auth) return;
        auth.signOut().then(() => {
            console.log("[Auth] Signed Out");
            // Reset state to avoid crash on reload
            if (history && history.replaceState) {
                history.replaceState({ view: 'home' }, '', window.location.pathname);
            }
            location.reload(); 
        });
    }
}
