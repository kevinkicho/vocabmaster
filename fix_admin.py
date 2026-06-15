with open('public/js/main.js', 'r', encoding='utf-8') as f:
    main_js = f.read()

main_js = main_js.replace(
    "const isAdmin = user.email && user.email.toLowerCase() === 'kevinkicho@gmail.com';",
    "const isAdmin = false; // set via getIdTokenResult below"
)
main_js = main_js.replace(
    "this.auth.userRole = user.isAnonymous ? 'anonymous' : isAdmin ? 'admin' : 'user';",
    """this.auth.userRole = user.isAnonymous ? 'anonymous' : 'user';
                        if (!user.isAnonymous) {
                            user.getIdTokenResult().then(idTokenResult => {
                                if (idTokenResult.claims.admin) {
                                    this.auth.userRole = 'admin';
                                }
                            }).catch(err => L('[Auth] Failed to get custom claims:', err));
                        }"""
)

with open('public/js/main.js', 'w', encoding='utf-8') as f:
    f.write(main_js)

with open('public/js/notes.js', 'r', encoding='utf-8') as f:
    notes_js = f.read()

notes_js = notes_js.replace("this.adminEmail = 'kevinkicho@gmail.com';", "// adminEmail removed, using custom claims")
notes_js = notes_js.replace(
"""        if (user && user.email && user.email.toLowerCase() === this.adminEmail.toLowerCase()) {
            this.isAdmin = true;
        } else {
            this.isAdmin = false;
        }""",
"""        this.isAdmin = false;
        if (user && !user.isAnonymous) {
            user.getIdTokenResult().then(idTokenResult => {
                if (idTokenResult.claims.admin) {
                    this.isAdmin = true;
                    this.render(); // re-render to show admin controls if needed
                }
            }).catch(e => console.warn('[Notes] Claims check failed:', e));
        }"""
)

with open('public/js/notes.js', 'w', encoding='utf-8') as f:
    f.write(notes_js)
