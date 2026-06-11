/* js/auth.js */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.initAuth();
    }

    async initAuth() {
        // Auth state handled by main.js central listener
    }

    waitForAuth() {
        return new Promise((resolve) => {
            // If already loaded, return immediately
            if (auth.currentUser) {
                this.currentUser = auth.currentUser;
                resolve(auth.currentUser);
                return;
            }

            const unsubscribe = auth.onAuthStateChanged(user => {
                unsubscribe();
                if (user) {
                    this.currentUser = user;
                    resolve(user);
                } else {
                    // Fallback to Anon
                    auth.signInAnonymously()
                        .then((cred) => {
                            this.currentUser = cred.user;
                            resolve(cred.user);
                        })
                        .catch(e => {
                            L("Anon Auth Failed:", e);
                            resolve(null);
                        });
                }
            });
        });
    }

    logout() {
        auth.signOut().then(() => {
            window.location.reload(); 
        });
    }
}
