/* js/notes.js */
class NoteService {
    constructor() {
        this.currentWordId = null;
        this.isAdmin = false;
        // adminEmail removed, using custom claims
        this.isDragging = false; 
    }

    setUser(user) {
        this.isAdmin = false;
        if (user && !user.isAnonymous) {
            // Email-based admin check (fallback if custom claims not set)
            if (user.email === 'kevinkicho@gmail.com') {
                this.isAdmin = true;
            }
            user.getIdTokenResult().then(idTokenResult => {
                if (idTokenResult.claims.admin) {
                    this.isAdmin = true;
                    this.render();
                }
            }).catch(e => console.warn('[Notes] Claims check failed:', e));
        }
        
        const devTab = document.getElementById('details-developer');
        if (devTab) {
            if (this.isAdmin) devTab.classList.remove('hidden');
            else devTab.classList.add('hidden');
        }
        
        if(this.currentWordId !== null) this.check(this.currentWordId);
    }

    check(wordId) {
        this.currentWordId = (wordId !== undefined && wordId !== null) ? wordId : null;
    }

    /* --- STRICT TOOLTIP LISTENERS (Hover or 2s Long Press) --- */
    attachTooltipListeners() {
        if (!app.ui) return;
        const chars = document.querySelectorAll('.hanzi-char');
        
        chars.forEach(el => {
            if(el.dataset.hasTooltip) return;
            el.dataset.hasTooltip = "true";
            const char = el.dataset.char;

            // Mouse Hover (Desktop)
            el.addEventListener('mouseenter', (e) => {
                if (this.isTouchInteraction) return;
                el.classList.add('text-indigo-600');
                app.ui.showTooltip(e, char, false);
            });
            el.addEventListener('mouseleave', (e) => {
                if (this.isTouchInteraction) return;
                el.classList.remove('text-indigo-600');
                app.ui.hideTooltip();
            });

            // Touch Long Press
            let pressTimer;
            const cancelPress = () => {
                clearTimeout(pressTimer);
                el.classList.remove('text-indigo-600');
                this.isTouchInteraction = false;
            };

            el.addEventListener('touchstart', (e) => {
                this.isTouchInteraction = true;
                el.classList.add('text-indigo-600');
                clearTimeout(pressTimer);
                
                // --- FIX 3: 2000ms Delay ---
                pressTimer = setTimeout(() => {
                    app.ui.showTooltip(e, char, true); 
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 2000); 
            }, { passive: true });

            el.addEventListener('touchend', cancelPress);
            el.addEventListener('touchmove', cancelPress);
            el.addEventListener('touchcancel', cancelPress);
            
            // NO CLICK LISTENER. Only long press or hover triggers modal.
        });
    }

    copyToClipboard(text) {
        if (!text) return;
        navigator.clipboard.writeText(text);
        const bar = document.getElementById('status-bar'); const orig = bar.innerText; bar.innerText = `Copied: ${text}`; bar.classList.add('text-indigo-500'); setTimeout(() => { bar.innerText = orig; bar.classList.remove('text-indigo-500'); }, 1500);
    }
    playAudio(text) { if (!text) return; if (window.app && window.app.audio) { const lang = window.app.store?.prefs?.quizQ || 'ja'; window.app.audio.play(text, lang, null, 0); } }

    openModal() { app.ui.openEditModal(); } 
    closeModal() { app.ui.closeEditModal(); }
}
