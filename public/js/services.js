/* js/services.js */

class AudioService {
    constructor() { 
        this.synth = window.speechSynthesis || null; 
        this.timer = null;
        this.voices = [];
        if (this.synth) {
            try { this.loadVoices(); } catch(e) {}
            if (this.synth.onvoiceschanged !== undefined) this.synth.onvoiceschanged = () => this.loadVoices();
        }
    }
    loadVoices() { if (!this.synth) return; try { this.voices = this.synth.getVoices(); } catch(e) {} }
    unlock() { if (!this.synth) return; try { if (this.synth.paused) this.synth.resume(); if (typeof SpeechSynthesisUtterance !== 'undefined') this.synth.speak(new SpeechSynthesisUtterance(" ")); } catch (e) {} }
    
    sanitizeText(text) {
        if (!text) return "";
        let str = String(text).replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/【.*?】/g, '');
        if (/[・•·\/]/.test(str)) str = str.split(/[・•·\/]/)[0];
        return str.trim();
    }

    play(txt, langKey, context, delay = 0) {
        return new Promise((resolve) => {
            if (!this.synth) { resolve(); return; }
            if (this.timer) clearTimeout(this.timer);
            this.cancel();
            if (!txt) { resolve(); return; }
            const cleanTxt = this.sanitizeText(txt);
            this.timer = setTimeout(() => { if (this.shouldPlay()) { this.speakNow(cleanTxt, langKey, resolve); } else { resolve(); } }, delay);
        });
    }
    shouldPlay() { const p = (window.app && window.app.store) ? window.app.store.prefs : {}; return p.masterAudio !== false; }
    speakNow(txt, langKey, cb) {
        if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') { if(cb) cb(); return; }
        try {
            let ttsLang = 'en-US';
            if(typeof LANG_MAP !== 'undefined') { const c = LANG_MAP.get(langKey); if(c) ttsLang = c.tts; }
            const u = new SpeechSynthesisUtterance(txt);
            u.rate = 0.9; u.lang = ttsLang;
            if (this.voices.length > 0) {
                let v = this.voices.find(val => val.lang === ttsLang) || this.voices.find(val => val.lang.includes(ttsLang.split('-')[0]));
                if (v) u.voice = v;
            }
            u.onend = () => { if(cb) cb(); }; u.onerror = () => { if(cb) cb(); };
            this.synth.speak(u);
        } catch(e) { if(cb) cb(); }
    }
    cancel() { if (this.timer) clearTimeout(this.timer); if (this.synth) this.synth.cancel(); }
}

class TextFitter {
    async fitAll() {
        const targets = document.querySelectorAll('.fit-target');
        const smartTargets = document.querySelectorAll('.fit-smart');
        try { await document.fonts.ready; } catch(e) {}
        const p1 = Array.from(targets).map(el => this.fit(el));
        const p2 = Array.from(smartTargets).map(el => this.fitSmart(el));
        return Promise.all([...p1, ...p2]);
    }

    fit(el) {
        return new Promise((resolve) => {
            const p = el.parentElement; if (!p) { resolve(); return; }
            el.style.opacity = '0';
            el.style.fontSize = '10px';
            requestAnimationFrame(() => {
                const style = window.getComputedStyle(p);
                const availW = p.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                const availH = p.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
                if (availW <= 0 || availH <= 0) { el.style.fontSize = ''; resolve(); return; }
                const size = Math.min(Math.min(availW / el.scrollWidth, availH / el.scrollHeight) * 10, 160);
                el.style.fontSize = `${Math.floor(size * 0.95)}px`; 
                el.style.opacity = '1';
                resolve();
            });
        });
    }

    fitSmart(el) {
        return new Promise((resolve) => {
            const p = el.parentElement; if (!p) { resolve(); return; }
            const currentContent = el.innerHTML;
            if (el.dataset.lastFitted === currentContent && el.style.fontSize && el.style.opacity === '1') { resolve(); return; }
            if (el.innerText.length > 30 && !el.innerHTML.includes('<br')) { el.innerHTML = el.innerHTML.replace(/,\s/g, ', <br/>'); }
            el.style.opacity = '0';
            el.style.whiteSpace = 'normal'; el.style.lineHeight = '1.4'; el.style.display = 'block'; el.style.width = '100%';

            const doFit = () => {
                const style = window.getComputedStyle(p);
                const availW = p.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                const availH = p.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
                if (availW <= 0 || availH <= 0) return false;
                const maxSize = Math.floor(Math.min(availW, availH));
                let lo = 12, hi = Math.max(maxSize, 12), size = 12;
                el.style.fontSize = `${hi}px`;
                while (lo <= hi) {
                    const mid = Math.floor((lo + hi) / 2);
                    el.style.fontSize = `${mid}px`;
                    if (el.scrollHeight <= availH && el.scrollWidth <= availW) { size = mid; lo = mid + 1; }
                    else { hi = mid - 1; }
                }
                el.style.fontSize = `${size}px`;
                el.dataset.lastFitted = el.innerHTML;
                el.style.opacity = '1';
                return true;
            };

            // Double rAF ensures layout has settled before measuring
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (doFit()) { resolve(); return; }
                    // Retry once after 100ms if container had 0 dimensions
                    setTimeout(() => { doFit(); el.style.opacity = '1'; resolve(); }, 100);
                });
            });
        });
    }
}

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
            if (this.standardEffects[pick]) { this.standardEffects[pick](); } else { this.playEmoji(pick); }
        } catch (e) { this.confetti(); }
    }
    playEmoji(name) { if(!this.emojiShapes[name]) return; this.emojiBurst(this.emojiShapes[name]); this.confetti({ particleCount: 15, scalar: 0.6, spread: 90, startVelocity: 25 }); }
    confetti(opts = {}) { if(typeof confetti === 'undefined') return; confetti({ particleCount: 80, spread: 100, origin: { y: 0.6 }, zIndex: 10000, colors: ['#ef4444', '#3b82f6', '#eab308', '#a855f7'], shapes: ['square', 'circle'], ticks: 150, gravity: 1.0, scalar: 1, decay: 0.92, ...opts }); }
    stars() { if(typeof confetti === 'undefined') return; const defaults = { spread: 360, ticks: 50, gravity: 0, decay: 0.94, startVelocity: 20, shapes: ['star'], colors: ['#FFE800', '#FFBD00'], zIndex: 10000 }; confetti({ ...defaults, particleCount: 15, scalar: 1.2, shapes: ['star'] }); confetti({ ...defaults, particleCount: 10, scalar: 0.75, shapes: ['circle'] }); }
    discs() { if(typeof confetti === 'undefined') return; const defaults = { spread: 80, ticks: 200, gravity: 0.3, decay: 0.96, startVelocity: 20, colors: ['#A7F3D0', '#bfdbfe', '#ffffff'], shapes: ['circle'], drift: 0, zIndex: 10000 }; confetti({ ...defaults, particleCount: 15, scalar: 2 }); confetti({ ...defaults, particleCount: 10, scalar: 1.5 }); }
    emojiBurst(shape) { if(!shape || typeof confetti === 'undefined') return; confetti({ particleCount: 25, spread: 100, origin: { y: 0.6 }, shapes: [shape], scalar: 4, gravity: 0.6, ticks: 100, decay: 0.92, zIndex: 10000, colors: ['#ffffff'] }); }
}
