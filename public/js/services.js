/* js/services.js */

/* --- Audio Service (Robust & Async) --- */
class AudioService {
    constructor() { 
        this.synth = window.speechSynthesis || null; 
        this.timer = null;
        this.voices = [];
        
        if (this.synth) {
            try { this.loadVoices(); } catch(e) {}
            if (this.synth.onvoiceschanged !== undefined) {
                this.synth.onvoiceschanged = () => this.loadVoices();
            }
        } else {
            console.warn("[Audio] SpeechSynthesis not supported");
        }
    }
    
    loadVoices() {
        if (!this.synth) return;
        try {
            this.voices = this.synth.getVoices();
            console.log(`[Audio] Loaded ${this.voices.length} voices`);
        } catch(e) {
            console.warn("[Audio] Error loading voices", e);
        }
    }
    
    unlock() {
        if (!this.synth) return;
        try {
            if (this.synth.paused) this.synth.resume();
            if (typeof SpeechSynthesisUtterance !== 'undefined') {
                const u = new SpeechSynthesisUtterance(" ");
                u.volume = 0; 
                this.synth.speak(u);
            }
        } catch (e) {
            console.warn("[Audio] unlock warning", e);
        }
    }

    // NEW: Centralized Text Cleaner for Japanese/Poly-words
    sanitizeText(text) {
        if (!text) return "";
        let str = String(text);

        // 1. Remove content inside brackets [], (), 【】 (e.g. "kanji[reading]")
        str = str.replace(/\[.*?\]/g, '');
        str = str.replace(/\(.*?\)/g, '');
        str = str.replace(/【.*?】/g, '');

        // 2. Handle Separators: Take only the FIRST variant
        // Separators: ・ (Japanese dot), • (Bullet), · (Middle dot), / (Slash)
        // e.g. "雨足•雨脚" -> "雨足"
        const separators = /[・•·\/]/;
        if (separators.test(str)) {
            str = str.split(separators)[0];
        }

        return str.trim();
    }

    play(txt, langKey, context, delay = 0) {
        return new Promise((resolve) => {
            if (!this.synth) { resolve(); return; }
            if (this.timer) clearTimeout(this.timer);
            this.cancel();
            
            if (!txt) { resolve(); return; }

            // Apply Cleaning
            const cleanTxt = this.sanitizeText(txt);

            this.timer = setTimeout(() => {
                if (this.shouldPlay()) {
                    console.log(`[Audio] Play: "${cleanTxt}" (Orig: ${txt})`);
                    this.speakNow(cleanTxt, langKey, resolve);
                } else {
                    console.log(`[Audio] Skipped (Muted)`);
                    resolve();
                }
            }, delay);
        });
    }

    shouldPlay() {
        const p = (window.app && window.app.store && window.app.store.prefs) ? window.app.store.prefs : {};
        if (p.masterAudio === false) return false;
        return true;
    }

    speakNow(txt, langKey, onEndCallback) {
        if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') {
            if(onEndCallback) onEndCallback();
            return;
        }
        try {
            let ttsLang = 'en-US'; 
            if(typeof LANG_CONFIG !== 'undefined') {
                const conf = LANG_CONFIG.find(l => l.key === langKey);
                if(conf) ttsLang = conf.tts;
            }

            const u = new SpeechSynthesisUtterance(txt);
            u.rate = 0.9;
            u.lang = ttsLang;

            if (this.voices.length > 0) {
                let voice = this.voices.find(v => v.lang === ttsLang);
                if (!voice) voice = this.voices.find(v => v.lang.includes(ttsLang.split('-')[0]));
                if (voice) u.voice = voice;
            }

            u.onend = () => { if(onEndCallback) onEndCallback(); };
            u.onerror = (e) => { 
                console.warn("TTS Error", e); 
                if(onEndCallback) onEndCallback(); 
            };

            this.synth.speak(u);
        } catch(e) {
            console.warn("[Audio] Play Error", e);
            if(onEndCallback) onEndCallback();
        }
    }

    cancel() { 
        if (this.timer) clearTimeout(this.timer);
        if (this.synth) this.synth.cancel(); 
    }
}

/* --- Text Fitter Service --- */
class TextFitter {
    async fitAll() {
        const targets = document.querySelectorAll('.fit-target');
        if(targets.length === 0) return Promise.resolve();
        try { await document.fonts.ready; } catch(e) {}
        const promises = Array.from(targets).map(el => this.fit(el));
        return Promise.all(promises);
    }

    fit(el) {
        return new Promise((resolve) => {
            const p = el.parentElement;
            if (!p) { resolve(); return; }
            el.style.fontSize = '10px'; 
            requestAnimationFrame(() => {
                const style = window.getComputedStyle(p);
                const availW = p.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                const availH = p.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
                if (availW <= 0 || availH <= 0) { el.style.fontSize = ''; resolve(); return; }
                const textW = el.scrollWidth;
                const textH = el.scrollHeight;
                if (textW === 0 || textH === 0) { resolve(); return; }
                const rW = availW / textW;
                const rH = availH / textH;
                const size = Math.min(Math.min(rW, rH) * 10, 160); 
                el.style.fontSize = `${Math.floor(size * 0.95)}px`; 
                el.style.opacity = '1';
                resolve();
            });
        });
    }
}

/* --- Celebration Service --- */
class CelebrationService {
    constructor() {
        this.standardEffects = { 'Confetti': this.confetti.bind(this), 'Stars': this.stars.bind(this), 'Discs': this.discs.bind(this) };
        this.emojiMap = { 'Coin': '🪙', 'Money': '💸', 'Red Env': '🧧', 'Sushi': '🍣', 'Kimono': '👘', 'Carp': '🎏', 'Torii': '⛩️', 'Sake': '🍶', 'Bento': '🍱', 'Dragon': '🐲' };
        this.emojiShapes = {};
        this.effects = { ...this.standardEffects };
        for (const name of Object.keys(this.emojiMap)) { this.effects[name] = () => this.playEmoji(name); }
    }
    async preloadShapes() {
        if(typeof confetti === 'undefined' || typeof confetti.shapeFromText !== 'function') return;
        try { await document.fonts.ready; } catch(e) {}
        const emojiFontStack = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", "system-ui", sans-serif';
        const promises = Object.entries(this.emojiMap).map(([name, char]) => {
            return new Promise((resolve) => {
                try {
                    const shape = confetti.shapeFromText({ text: char, scalar: 3, fontFamily: emojiFontStack });
                    this.emojiShapes[name] = shape;
                    resolve();
                } catch(e) { resolve(); }
            });
        });
        await Promise.all(promises);
    }
    play() {
        try {
            const prefs = window.app ? window.app.store.prefs : {};
            const enabled = prefs.allowedCelebs || [];
            if (enabled.length === 0) return;
            const valid = enabled.filter(k => this.standardEffects[k] || this.emojiShapes[k]);
            if (valid.length === 0) return;
            const pick = valid[Math.floor(Math.random() * valid.length)];
            // console.log(`[Celeb] Playing: ${pick}`);
            if (this.standardEffects[pick]) { this.standardEffects[pick](); } else { this.playEmoji(pick); }
        } catch (e) { this.confetti(); }
    }
    playEmoji(name) { if(!this.emojiShapes[name]) return; this.emojiBurst(this.emojiShapes[name]); this.confetti({ particleCount: 15, scalar: 0.6, spread: 90, startVelocity: 25 }); }
    confetti(opts = {}) { if(typeof confetti === 'undefined') return; confetti({ particleCount: 80, spread: 100, origin: { y: 0.6 }, zIndex: 10000, colors: ['#ef4444', '#3b82f6', '#eab308', '#a855f7'], shapes: ['square', 'circle'], ticks: 150, gravity: 1.0, scalar: 1, decay: 0.92, ...opts }); }
    stars() { if(typeof confetti === 'undefined') return; const defaults = { spread: 360, ticks: 50, gravity: 0, decay: 0.94, startVelocity: 20, shapes: ['star'], colors: ['#FFE800', '#FFBD00'], zIndex: 10000 }; confetti({ ...defaults, particleCount: 15, scalar: 1.2, shapes: ['star'] }); confetti({ ...defaults, particleCount: 10, scalar: 0.75, shapes: ['circle'] }); }
    discs() { if(typeof confetti === 'undefined') return; const defaults = { spread: 80, ticks: 200, gravity: 0.3, decay: 0.96, startVelocity: 20, colors: ['#A7F3D0', '#bfdbfe', '#ffffff'], shapes: ['circle'], drift: 0, zIndex: 10000 }; confetti({ ...defaults, particleCount: 15, scalar: 2 }); confetti({ ...defaults, particleCount: 10, scalar: 1.5 }); }
    emojiBurst(shape) { if(!shape || typeof confetti === 'undefined') return; confetti({ particleCount: 25, spread: 100, origin: { y: 0.6 }, shapes: [shape], scalar: 4, gravity: 0.6, ticks: 100, decay: 0.92, zIndex: 10000, colors: ['#ffffff'] }); }
}
