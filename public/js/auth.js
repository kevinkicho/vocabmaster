/* js/auth.js */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.initAuth();
    }

    async initAuth() {
        if (!auth) return;
        auth.onAuthStateChanged(user => {
            this.currentUser = user;
            const btn = document.getElementById('btn-login');
            if (btn) {
                if (user && !user.isAnonymous) {
                    btn.innerHTML = `<img src="${user.photoURL}" class="w-full h-full rounded-full border-2 border-indigo-200">`;
                } else {
                    btn.innerHTML = `<i class="ph-bold ph-user text-xl"></i>`;
                }
            }
        });
    }

    waitForAuth() {
        return new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged(user => {
                unsubscribe();
                if (user) {
                    this.currentUser = user;
                    resolve(user);
                } else {
                    auth.signInAnonymously().then((cred) => {
                        this.currentUser = cred.user;
                        resolve(cred.user);
                    }).catch(e => {
                        console.error("Anon Auth Failed:", e);
                        resolve(null);
                    });
                }
            });
        });
    }

    logout() {
        auth.signOut().then(() => {
            // FIX: Force reload to clear state and return to Home
            window.location.reload(); 
        });
    }
}
