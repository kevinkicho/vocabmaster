/* js/services.js */

class AudioService {
    constructor() { 
        this.synth = window.speechSynthesis || null; 
        this.useNative = (typeof NativeTTSBridge !== 'undefined') && NativeTTSBridge.isAvailable();
        this.timer = null;
        this.voices = [];
        this.voicesByLang = new Map();
        this._voicePollAttempts = 0;
        this._voicePollTimer = null;
        this._voiceUserGesture = false;
        if (this.useNative) {
            L('[Audio] Using native Android TTS');
            this.loadVoices();
        } else if (this.synth) {
            if (this.synth.onvoiceschanged !== undefined) {
                this.synth.onvoiceschanged = () => {
                    this.loadVoices();
                    this._voicePollAttempts = 100;
                };
            }
            document.addEventListener('click', () => {
                if (!this._voiceUserGesture) {
                    this._voiceUserGesture = true;
                    this.loadVoices();
                }
            }, { once: false, passive: true });
            setTimeout(() => this.loadVoices(), 50);
            setTimeout(() => this._pollVoices(), 200);
        }
    }
    _pollVoices() {
        if (!this.synth) return;
        try {
            this.voices = this.synth.getVoices();
            if (this.voices.length > 0) {
                this._buildVoiceMap();
                if (app && app.ui) app.ui.renderVoiceSelector();
                return;
            }
        } catch(e) {}
        if (this._voicePollAttempts < 20) {
            this._voicePollAttempts++;
            const delay = Math.min(500 + this._voicePollAttempts * 200, 3000);
            this._voicePollTimer = setTimeout(() => this._pollVoices(), delay);
        }
        if (this._voicePollAttempts === 5) {
            try {
                const u = new SpeechSynthesisUtterance('');
                u.volume = 0; u.rate = 2;
                this.synth.speak(u);
            } catch(e) {}
        }
    }
    forceDetect() {
        if (this.useNative) {
            this.loadVoices();
            if (app && app.ui) app.ui.renderVoiceSelector();
            return;
        }
        if (!this.synth) return;
        this._voicePollAttempts = 0;
        try { this.synth.cancel(); } catch(e) {}
        const done = () => {
            this.loadVoices();
            if (this.voices.length === 0) {
                requestAnimationFrame(() => {
                    this.voices = this.synth.getVoices();
                    this._buildVoiceMap();
                    if (app && app.ui) app.ui.renderVoiceSelector();
                });
            } else {
                if (app && app.ui) app.ui.renderVoiceSelector();
            }
        };
        const timeout = setTimeout(done, 3000);
        try {
            const u = new SpeechSynthesisUtterance('');
            u.volume = 0; u.rate = 2;
            u.onstart = () => {
                clearTimeout(timeout);
                try { this.synth.cancel(); } catch(e) {}
                done();
            };
            u.onend = () => { clearTimeout(timeout); done(); };
            u.onerror = () => { clearTimeout(timeout); done(); };
            this.synth.speak(u);
        } catch(e) {
            clearTimeout(timeout);
            done();
        }
    }
    _buildVoiceMap() {
        this.voicesByLang.clear();
        this.voices.forEach(v => {
            const lang = v.lang;
            if (!this.voicesByLang.has(lang)) this.voicesByLang.set(lang, []);
            this.voicesByLang.get(lang).push(v);
        });
    }
    loadVoices() { 
        if (this.useNative) {
            try {
                const raw = NativeTTSBridge.getVoices();
                if (raw.length === 0) {
                    setTimeout(() => this.loadVoices(), 500);
                    return;
                }
                this.voices = raw.map(v => ({
                    name: v.name,
                    lang: (v.locale || '').replace(/_/g, '-'),
                    voiceURI: v.name,
                    localService: !v.isNetwork,
                    default: false,
                    provider: v.provider || 'Local',
                    quality: v.quality,
                    isNetwork: v.isNetwork
                }));
                this._voicePollAttempts = 100;
                L('[Audio] Native loadVoices: found', this.voices.length, 'voices');
                if (app && app.ui) app.ui.renderVoiceSelector();
            } catch(e) { L('[Audio] Native voice load error:', e); }
            return;
        }
        if (!this.synth) return; 
        try { 
            this.voices = this.synth.getVoices();
            this._buildVoiceMap();
            if (this.voices.length > 0) this._voicePollAttempts = 100;
            L('[Audio] loadVoices: found', this.voices.length, 'voices');
            if (this.voices.length > 0) {
                this.voices.forEach(v => L('[Audio]  -', v.name, '|', v.lang, '|', v.voiceURI, '| local:', v.localService));
            }
        } catch(e) {} 
    }

    previewVoice(voiceURI, langKey) {
        if (this.useNative) {
            try {
                const voice = this.voices.find(v => (v.voiceURI || v.name) === voiceURI);
                const voiceName = voice ? voice.name : '';
                NativeTTSBridge.previewVoice(voiceName, langKey || 'en');
            } catch(e) {}
            return;
        }
        if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') return;
        try {
            this.synth.cancel();
            const voice = this.voices.find(v => v.voiceURI === voiceURI);
            const samples = { 'ja': 'こんにちは', 'zh': '你好', 'ko': '안녕하세요', 'en': 'Hello', 'es': 'Hola', 'fr': 'Bonjour', 'de': 'Hallo', 'it': 'Ciao', 'pt': 'Olá', 'ru': 'Здравствуйте' };
            const base = langKey.split('_')[0];
            const text = samples[base] || samples[langKey] || 'Hello';
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.9;
            if (voice) {
                u.voice = voice;
                u.lang = voice.lang;
            } else {
                u.lang = 'en-US';
                if(typeof LANG_MAP !== 'undefined') { const c = LANG_MAP.get(langKey); if(c) u.lang = c.tts; }
            }
            setTimeout(() => this.synth.speak(u), 50);
        } catch(e) {}
    }
    
    getVoicesForLang(langKey) {
        if(typeof LANG_MAP === 'undefined') return [];
        const conf = LANG_MAP.get(langKey);
        if (!conf) return [];
        const ttsLang = conf.tts;
        const baseLang = ttsLang.split('-')[0];
        const voices = this.voicesByLang.get(ttsLang) || [];
        const fallbackVoices = this.voicesByLang.get(baseLang) || [];
        return [...voices, ...fallbackVoices].filter((v, i, arr) => arr.findIndex(x => x.voiceURI === v.voiceURI) === i);
    }
    
    getAllVoicesGrouped() {
        const groups = new Map();
        this.voices.forEach(v => {
            const lang = v.lang;
            if (!groups.has(lang)) groups.set(lang, []);
            groups.get(lang).push(v);
        });
        return groups;
    }

    unlock() { if (!this.synth) return; try { if (this.synth.paused) this.synth.resume(); if (typeof SpeechSynthesisUtterance !== 'undefined') this.synth.speak(new SpeechSynthesisUtterance(" ")); } catch (e) {} }
    
    sanitizeText(text) {
        if (!text) return "";
        let str = String(text).replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/【.*?】/g, '');
        if (/[・•·\/]/.test(str)) str = str.split(/[・•·\/]/)[0];
        return str.trim();
    }

    play(txt, langKey, context, delay = 0) {
        return new Promise((resolve) => {
            if (!this.useNative && !this.synth) { resolve(); return; }
            if (this.timer) clearTimeout(this.timer);
            this.cancel();
            if (!txt) { resolve(); return; }
            const cleanTxt = this.sanitizeText(txt);
            this.timer = setTimeout(() => { if (this.shouldPlay()) { this.speakNow(cleanTxt, langKey, resolve); } else { resolve(); } }, delay);
        });
    }
    shouldPlay() { const p = (window.app && window.app.store) ? window.app.store.prefs : {}; return p.masterAudio !== false; }
    speakNow(txt, langKey, cb) {
        if (this.useNative) {
            try {
                let ttsLang = 'en-US';
                if(typeof LANG_MAP !== 'undefined') { const c = LANG_MAP.get(langKey); if(c) ttsLang = c.tts; }
                let voiceName = '';
                if (window.app && window.app.store && window.app.store.prefs.selectedVoices) {
                    const voiceURI = window.app.store.prefs.selectedVoices[langKey];
                    if (voiceURI) {
                        const v = this.voices.find(x => (x.voiceURI || x.name) === voiceURI);
                        if (v) voiceName = v.name || '';
                    }
                }
                NativeTTSBridge.speak(txt, voiceName, ttsLang, 0.9).then(() => { if(cb) cb(); }).catch(() => { if(cb) cb(); });
            } catch(e) { if(cb) cb(); }
            return;
        }
        if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') { if(cb) cb(); return; }
        try {
            let ttsLang = 'en-US';
            if(typeof LANG_MAP !== 'undefined') { const c = LANG_MAP.get(langKey); if(c) ttsLang = c.tts; }
            const u = new SpeechSynthesisUtterance(txt);
            u.rate = 0.9; u.lang = ttsLang;

            if (window.app && window.app.store && window.app.store.prefs.selectedVoices) {
                const voiceURI = window.app.store.prefs.selectedVoices[langKey];
                if (voiceURI) {
                    const freshVoices = this.synth.getVoices();
                    const v = freshVoices.find(x => x.voiceURI === voiceURI);
                    if (v) u.voice = v;
                }
            }
            // If no manual selection, prefer Google voices on Android
            if (!u.voice) {
                const freshVoices = this.synth.getVoices();
                const matching = freshVoices.filter(v => v.lang === ttsLang || (v.lang.indexOf('-') > 0 && v.lang.toLowerCase().startsWith(ttsLang.split('-')[0])));
                const googleVoice = matching.find(v => /google/i.test(v.name) || /google/i.test(v.voiceURI || ''));
                if (googleVoice) u.voice = googleVoice;
            }

            u.onend = () => { if(cb) cb(); }; u.onerror = () => { if(cb) cb(); };
            this.synth.speak(u);
        } catch(e) { if(cb) cb(); }
    }
    cancel() { if (this.timer) clearTimeout(this.timer); if (this.useNative) { try { NativeTTSBridge.stop(); } catch(e) {} } if (this.synth) this.synth.cancel(); }
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
