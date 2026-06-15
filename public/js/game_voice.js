/* js/game_voice.js */
class Voice extends GameMode {
    constructor(k) { 
        super(k); 
        this.recognition = null;
        this.isListening = false;
        this.setup(); 
        this.initSpeech();
        this.update(); 
    }
    
    initSpeech() {
        if (!('webkitSpeechRecognition' in window)) {
            L("Speech API not supported");
            return;
        }
        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateStatus('Listening...', 'text-rose-500', 'animate-pulse');
            if(this.dom.micIcon) this.dom.micIcon.className = "ph-fill ph-microphone text-white text-4xl";
            if(this.dom.micBtn) this.dom.micBtn.className = "w-24 h-24 rounded-full bg-rose-500 shadow-xl shadow-rose-500/40 flex items-center justify-center transition-all scale-110";
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            this.updateStatus('Tap to Speak', 'text-slate-400', '');
            if(this.dom.micIcon) this.dom.micIcon.className = "ph-bold ph-microphone text-white text-5xl";
            if(this.dom.micBtn) this.dom.micBtn.className = "w-24 h-24 rounded-full bg-sky-500 hover:bg-sky-400 shadow-xl shadow-sky-500/40 flex items-center justify-center active:scale-95 transition-all";
        };
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.checkSpeech(transcript);
        };
    }
    
    toggleSpeech() {
        if(!this.recognition) { app.ui.showToast("Voice not supported in this browser.", 'error'); return; }
        if(this.isListening) this.recognition.stop();
        else {
            const p = app.store.prefs;
            const targetLang = p.voiceAudioTarget || 'en';
            const langMap = { 'en': 'en-US', 'ja': 'ja-JP', 'ko': 'ko-KR', 'zh': 'zh-CN', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE', 'it': 'it-IT', 'ru': 'ru-RU', 'pt': 'pt-BR' };
            this.recognition.lang = langMap[targetLang] || 'en-US';
            this.recognition.start();
        }
    }

    playSideAudio() {
        if(!app.store.prefs.voiceAuto) return;
        
        const item = this.list[this.i];
        const p = app.store.prefs;
        const isFlipped = this.dom.card && this.dom.card.classList.contains('rotate-y-180');
        
        let displayKey = isFlipped ? (p.voiceDispBack || 'en') : (p.voiceDispFront || 'ja');
        let textToPlay = item[displayKey];
        let audioLang = displayKey;

        let conf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(displayKey) || null : null;
        
        if (conf) {
            if(conf.audioSrc) audioLang = conf.audioSrc;
        } else {
            if (displayKey.endsWith('_ex')) {
                const base = displayKey.replace('_ex', '');
                const baseConf = LANG_MAP.get(base);
                if (baseConf) {
                    audioLang = base;
                }
            }
        }

        if (textToPlay) {
            app.audio.play(textToPlay, audioLang, 'voice', 0);
        }
    }

    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col perspective-1000 mb-2 landscape:mb-0 relative z-10">
                    <div id="vc-header"></div>
                    
                    <div id="vc-card" class="preserve-3d w-full flex-1 relative rounded-[2.5rem] shadow-xl transition-transform duration-700 cursor-pointer" onclick="this.classList.toggle('rotate-y-180'); app.game.playSideAudio()">
                        <div class="absolute inset-0 backface-hidden bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-slate-100 dark:border-neutral-800 flex flex-col items-center justify-center text-center p-8 z-10 overflow-hidden gpu-fix">
                            <div class="fit-box w-full flex-1"><span id="vc-front-text" class="fit-target font-black text-slate-800 dark:text-white"></span></div>
                            <div class="absolute bottom-0 left-0 w-full h-1 bg-slate-100 dark:bg-neutral-800"><div id="vc-progress" class="h-full bg-sky-500 transition-all duration-300" style="width:0%"></div></div>
                        </div>
                        <div class="absolute inset-0 backface-hidden bg-slate-800 dark:bg-black text-white rounded-[2.5rem] rotate-y-180 flex flex-col items-center justify-center border border-slate-700 dark:border-neutral-800 shadow-2xl z-10 overflow-hidden gpu-fix p-8">
                            <div class="fit-box w-full flex-1"><span id="vc-back-text" class="fit-target font-black"></span></div>
                        </div>
                    </div>
                </div>
                
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between items-center landscape:pt-2 min-h-0 relative z-20">
                    <div id="vc-audio" class="mb-2 shrink-0"></div>

                    <div class="mb-2 relative flex flex-col items-center justify-center flex-1 w-full">
                        <div id="vc-feedback" class="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-black text-slate-400 opacity-0 transition-opacity"></div>
                        <button id="vc-mic-btn" onclick="app.game.toggleSpeech()" class="w-24 h-24 rounded-full bg-sky-500 hover:bg-sky-400 shadow-xl shadow-sky-500/40 flex items-center justify-center active:scale-95 transition-all"><i id="vc-mic-icon" class="ph-bold ph-microphone text-white text-5xl"></i></button>
                        <p id="vc-status" class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-4">Tap to Speak</p>
                    </div>
                    
                    <div id="vc-nav" class="w-full landscape:h-24"></div>
                </div>
            </div>`;
        
        this.dom.header = this.root.querySelector('#vc-header');
        this.dom.card = this.root.querySelector('#vc-card');
        this.dom.frontText = this.root.querySelector('#vc-front-text');
        this.dom.backText = this.root.querySelector('#vc-back-text');
        this.dom.status = this.root.querySelector('#vc-status');
        this.dom.micBtn = this.root.querySelector('#vc-mic-btn');
        this.dom.micIcon = this.root.querySelector('#vc-mic-icon');
        this.dom.feedback = this.root.querySelector('#vc-feedback');
        this.dom.audio = this.root.querySelector('#vc-audio');
        
        const navContainer = this.root.querySelector('#vc-nav');
        navContainer.innerHTML = app.ui.nav();
        this.setupHeader();
    }

    update() {
        this.busy = false; 
        const item = this.list[this.i];
        const p = app.store.prefs;
        
        if(this.dom.card) {
            this.dom.card.classList.remove('rotate-y-180');
            this.dom.card.dataset.wid = item.id; 
            
            const frontFace = this.dom.card.querySelector('.absolute.inset-0.bg-white');
            if(frontFace) {
                frontFace.classList.remove('border-emerald-500', 'ring-4', 'ring-emerald-500/20', 'border-rose-300', 'animate-shake');
                frontFace.classList.add('border-slate-100', 'dark:border-neutral-800');
            }
        }

        const frontKey = p.voiceDispFront || 'ja';
        const backKey = p.voiceDispBack || 'en';
        
        this.updateHeader();
        
        if(this.dom.frontText) { 
            this.dom.frontText.textContent = item[frontKey]; 
        }
        if(this.dom.backText) { 
            this.dom.backText.textContent = item[backKey]; 
        }
        
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(item);

        this.afterRender();
        
        if(p.voiceAuto) {
            this.playSideAudio();
        }
    }
    
    updateStatus(msg, color, anim) {
        if(this.dom.status) {
            this.dom.status.innerText = msg;
            this.dom.status.className = `text-xs font-bold uppercase tracking-widest mt-4 ${color} ${anim}`;
        }
    }
    
    checkSpeech(transcript) {
        const item = this.list[this.i];
        const p = app.store.prefs;
        const targetText = item[p.voiceAudioTarget || 'ja'];
        if(!targetText) return;
        
        const clean = (s) => s.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"").replace(/\s{2,}/g," ").trim();
        const input = clean(transcript);
        const target = clean(targetText);
        
        const isAsian = ['ja','zh','ko'].includes(p.voiceAudioTarget);
        const inputCmp = isAsian ? input.replace(/\s/g, '') : input;
        const targetCmp = isAsian ? target.replace(/\s/g, '') : target;
        
        this.dom.feedback.innerText = `"${transcript}"`;
        this.dom.feedback.className = "absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-black text-slate-800 dark:text-white opacity-100 transition-opacity bg-white dark:bg-neutral-800 px-3 py-1 rounded-full shadow-lg border border-slate-100 dark:border-neutral-700";
        
        const frontFace = this.dom.card.querySelector('.absolute.inset-0.bg-white');

        if (inputCmp === targetCmp || targetCmp.includes(inputCmp)) {
            frontFace.classList.remove('border-slate-100', 'dark:border-neutral-800');
            frontFace.classList.add('border-emerald-500', 'ring-4', 'ring-emerald-500/20');
            app.celebration.play();
            this.score(10);
            let pAudio = null;
            if (p.voicePlayCorrect) {
                const targetLang = p.voiceAudioTarget || 'ja';
                pAudio = app.audio.play(targetText, targetLang, 'voice', 0);
            }
            this.waitAndNav(pAudio, 1500);
        } else {
            this.miss();
            frontFace.classList.add('animate-shake', 'border-rose-300');
            setTimeout(() => frontFace.classList.remove('animate-shake', 'border-rose-300'), 500);
        }
    }
}
