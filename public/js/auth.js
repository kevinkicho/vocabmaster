/* js/auth.js */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.adminEmail = "kevinkicho@gmail.com";
        this.init();
    }

    init() {
        if (!auth) return;

        // Handle Redirect Result
        auth.getRedirectResult().then((result) => {
            if (result.user) console.log("[Auth] Redirect Login Success");
        }).catch((error) => console.error("[Auth] Redirect Error:", error));

        // Listen for Auth State Changes
        auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.isAdmin = (user.email === this.adminEmail);
                console.log(`[Auth] User: ${user.uid} | Admin: ${this.isAdmin}`);
                
                // NEW: Clear session cache to force fresh score fetch
                if (window.app && window.app.data) {
                    window.app.data.resetSession();
                }
            } else {
                console.log("[Auth] No user, signing in anonymously...");
                auth.signInAnonymously().catch((error) => console.error("[Auth] Anon Sign-in failed", error));
            }
            
            // Update UI
            if(window.app && window.app.ui) {
                window.app.ui.renderAccountUI(); 
                const btn = document.getElementById('btn-login');
                if(btn && user && user.photoURL) {
                     btn.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full">`;
                } else if(btn) {
                     btn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
                }
                const devTab = document.getElementById('details-developer');
                if (devTab) {
                    if (this.isAdmin) devTab.classList.remove('hidden');
                    else devTab.classList.add('hidden');
                }
            }
            
            // Reload Home to reflect score/auth state
            if(window.app) window.app.goHome(false);
        });
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
