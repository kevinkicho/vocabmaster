/* js/auth.js */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.adminEmail = "kevinkicho@gmail.com";
        
        // Promise to block app load until Auth is settled (Anon or Real)
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

        // Handle Redirect Result (for some mobile flows)
        auth.getRedirectResult().then((result) => {
            if (result.user) console.log("[Auth] Redirect Login Success");
        }).catch((error) => console.error("[Auth] Redirect Error:", error));

        // Listen for Auth State Changes
        auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.isAdmin = (user.email === this.adminEmail);
                console.log(`[Auth] User: ${user.uid} | Anon: ${user.isAnonymous} | Admin: ${this.isAdmin}`);
                
                // NEW: Clear session cache to force fresh score fetch on login swap
                if (window.app && window.app.data) {
                    window.app.data.resetSession();
                }

                // Resolve the ready promise so the App can proceed
                if (this._resolveReady) {
                    this._resolveReady(true);
                    this._resolveReady = null; // Ensure only resolved once per load logic
                }
            } else {
                console.log("[Auth] No user, signing in anonymously...");
                // We do NOT resolve here. We wait for signInAnonymously to trigger the listener again with a user.
                auth.signInAnonymously().catch((error) => {
                    console.error("[Auth] Anon Sign-in failed", error);
                    // If anon login fails (offline?), we must resolve to let the app load (likely with mock data or cache)
                    if (this._resolveReady) {
                        this._resolveReady(false);
                        this._resolveReady = null;
                    }
                });
            }
            
            // Update UI
            if(window.app && window.app.ui) {
                const btn = document.getElementById('btn-login');
                // Only show Photo/Profile if NOT anonymous
                if(btn && user && !user.isAnonymous && user.photoURL) {
                     btn.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full border border-slate-200 dark:border-neutral-600">`;
                } else if(btn) {
                     // Show generic icon for Anon or Logged Out
                     btn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
                }

                const devTab = document.getElementById('details-developer');
                if (devTab) {
                    if (this.isAdmin) devTab.classList.remove('hidden');
                    else devTab.classList.add('hidden');
                }
            }
            
            // Reload Home to reflect score/auth state (only if app is already running)
            if(window.app && window.app.ui && this.currentUser) window.app.goHome(false);
        });
    }

    // Main.js calls this to wait before loading Data
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
            location.reload(); 
        });
    }
}
