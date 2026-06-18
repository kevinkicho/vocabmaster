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
            if (auth.currentUser) {
                this.currentUser = auth.currentUser;
                resolve(auth.currentUser);
                return;
            }

            var resolved = false;
            var timeout = setTimeout(function() {
                if (!resolved) {
                    resolved = true;
                    auth.signInAnonymously()
                        .then(function(cred) {
                            this.currentUser = cred.user;
                            resolve(cred.user);
                        }.bind(this))
                        .catch(function(e) {
                            L("Anon Auth Failed:", e);
                            resolve(null);
                        });
                }
            }.bind(this), 1500);

            var unsubscribe = auth.onAuthStateChanged(function(user) {
                if (resolved) return;
                if (user) {
                    // Real user (anonymous from prior session or Google sign-in)
                    resolved = true;
                    clearTimeout(timeout);
                    unsubscribe();
                    this.currentUser = user;
                    resolve(user);
                }
                // If user is null, do NOT set resolved=true — let the 1.5s
                // timeout fire to call signInAnonymously(). Setting resolved=true
                // on null would hang the Promise forever (pre-existing bug).
            }.bind(this));
        });
    }

    logout() {
        auth.signOut().then(() => {
            window.location.reload(); 
        });
    }
}
