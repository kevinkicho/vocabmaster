/* js/game_voice.js */
class Voice extends GameMode {
    constructor(k) { 
        super('voice'); 
        this.setup(); 
        this.update(); 
    }

    setup() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(!Speech) {
            this.root.innerHTML = `<div class="p-10 text-center font-bold text-slate-400 flex items-center justify-center h-full"><div>Voice Not Supported</div><button onclick="app.goHome()" class="mt-4 px-4 py-2 bg-indigo-100 text-indigo-600 rounded-lg">Back</button></div>`;
            return;
        }

        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col">
                    <div id="v-header"></div>
                    <div id="v-c" class="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-neutral-800 flex-1 mb-2 landscape:mb-2 flex flex-col items-center justify-center p-2 text-center relative overflow-hidden group hover:border-sky-200 transition-colors gpu-fix">
                        <div class="absolute top-0 left-0 w-full h-1 bg-sky-400"></div>
                        <div id="v-card-click" class="flex-1 w-full fit-box cursor-pointer select-none">
                            <span id="v-front" class="fit-target font-black text-slate-800 dark:text-neutral-200"></span>
                        </div>
                        <div id="v-res" class="absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-400 transition-all opacity-0 scale-90">Listening...</div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:pt-2">
                    <div id="v-audio" class="mt-auto landscape:mt-0"></div>
                    <div class="flex justify-center h-32 items-center relative mb-4 shrink-0 mt-2">
                        <div id="mic-ring" class="absolute w-24 h-24 rounded-full bg-sky-500 opacity-0"></div>
                        <button id="v-mic-btn" class="w-24 h-24 bg-white dark:bg-neutral-800 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all border-4 border-white dark:border-neutral-700 ring-4 ring-sky-100 dark:ring-sky-900/30 z-10 hover:shadow-2xl hover:scale-105">
                            <i class="ph-bold ph-microphone text-4xl text-sky-500"></i>
                        </button>
                    </div>
                    <div id="v-nav"></div>
                </div>
            </div>`;

        this.dom.header = this.root.querySelector('#v-header');
        this.dom.card = this.root.querySelector('#v-c');
        this.dom.front = this.root.querySelector('#v-front');
        this.dom.cardClick = this.root.querySelector('#v-card-click');
        this.dom.res = this.root.querySelector('#v-res');
        this.dom.ring = this.root.querySelector('#mic-ring');
        this.dom.micBtn = this.root.querySelector('#v-mic-btn');
        this.dom.audio = this.root.querySelector('#v-audio');
        
        this.root.querySelector('#v-nav').innerHTML = app.ui.nav();
    }

    update() {
        if(!this.dom.header) return; 

        this.busy = false; 
        const c = this.list[this.i]; 
        const p = app.store.prefs;
        const front = c[p.voiceDispFront||'en']; 
        
        let fSec="", fEx="", fExSrc="";
        const dispFrontKey = p.voiceDispFront||'en';
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_CONFIG.find(l => l.key === dispFrontKey);
            if(conf) {
                if(conf.secondary) fSec = c[conf.secondary] || "";
                if(conf.exKey) fEx = c[conf.exKey] || "";
            }
        }
        
        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.front) { this.dom.front.innerText = front; this.dom.front.innerHTML = front; }
        
        if(this.dom.cardClick) this.dom.cardClick.onclick = () => {
            app.game.toggle(this.dom.cardClick, front.replace(/'/g,"\\'"), '', fEx.replace(/'/g,"\\'"), '', front.replace(/'/g,"\\'"));
            if(p.voicePlayEx) {
                this.playSmartAudio();
            }
        };

        if(this.dom.res) {
             this.dom.res.innerText = "Listening..."; 
             this.dom.res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-400 transition-all opacity-0 scale-90";
        }
        if(this.dom.card) {
            this.dom.card.classList.remove('border-emerald-400', 'ring-2', 'ring-emerald-100', 'border-rose-400');
        }
        if(this.dom.micBtn) {
            this.dom.micBtn.onclick = () => app.game.handleInput(this.dom.micBtn, null, null, () => app.game.listen());
        }
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);

        this.afterRender();
        
        // Auto-play only if no explicit user interaction triggered this update
        if(p.voiceAuto) this.playSmartAudio(); 
    }

    // FIX: Context-Aware Audio Player (Same as TF)
    playSmartAudio(langKey) {
        const item = this.list[this.i];
        
        // 1. Determine Context (Example vs Word) based on VISIBLE text in DOM
        const p = app.store.prefs;
        const frontKey = p.voiceDispFront || 'en'; 
        
        const conf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l=>l.key===frontKey) : null;
        let mainExample = (conf && conf.exKey) ? item[conf.exKey] : "";
        const isShowingExample = this.dom.front && mainExample && this.dom.front.innerText.includes(mainExample);

        let targetKey = langKey || frontKey;
        let textToPlay = "";

        if (isShowingExample) {
            // Context: Example
            if (langKey) {
                const btnConf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l=>l.key===langKey) : null;
                if (btnConf && btnConf.exKey && item[btnConf.exKey]) {
                    textToPlay = item[btnConf.exKey];
                } else {
                    textToPlay = item[langKey]; 
                }
            } else {
                textToPlay = mainExample;
            }
        } else {
            // Context: Word
            targetKey = langKey || frontKey;
            const tConf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l=>l.key===targetKey) : null;
            if(tConf && tConf.visualOnly && tConf.audioSrc) {
                textToPlay = item[tConf.audioSrc];
                targetKey = tConf.audioSrc;
            } else {
                textToPlay = item[targetKey];
            }
        }

        if (textToPlay) {
            if (langKey || p.voiceAuto) {
                app.audio.play(textToPlay, targetKey, 'voice', 0);
            }
        }
    }

    listen() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new Speech();
        const targetKey = app.store.prefs.voiceAudioTarget || 'ja';
        const langConf = LANG_CONFIG.find(l=>l.key===targetKey);
        rec.lang = langConf ? langConf.tts : 'ja-JP'; rec.maxAlternatives = 1;
        
        const ring = this.dom.ring; 
        const res = this.dom.res;
        
        ring.classList.add('animate-pulse-ring', 'opacity-100');
        res.innerText = "Listening..."; res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-slate-800 dark:bg-neutral-600 text-white shadow-lg opacity-100 scale-100";
        
        rec.onresult = (e) => {
            ring.classList.remove('animate-pulse-ring', 'opacity-100');
            const txt = e.results[0][0].transcript.toLowerCase().replace(/\s|[,.!?]/g, '');
            const { text } = this.resolveAudioText(this.list[this.i], targetKey);
            
            if(txt.includes(text.toLowerCase().replace(/\s/g, ''))) {
                this.score(30); res.innerHTML = `<i class="ph-bold ph-check"></i> "${txt}"`;
                res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-emerald-500 text-white shadow-lg transform scale-110";
                this.dom.card.classList.add('border-emerald-400', 'ring-2', 'ring-emerald-100');
                app.celebration.play(); 
                
                let pAudio = null;
                if(app.store.prefs.voicePlayCorrect) {
                    pAudio = app.audio.play(text, targetKey, 'voice', 0);
                }
                this.busy = true; 
                this.waitAndNav(pAudio, 1500);

            } else {
                res.innerText = `Heard: "${txt}"`;
                res.className = "absolute bottom-6 px-6 py-2 rounded-full font-bold text-sm bg-rose-500 text-white shadow-lg";
                this.dom.card.classList.add('border-rose-400');
            }
        };
        rec.onerror = () => { ring.classList.remove('animate-pulse-ring'); res.innerText = "Error"; };
        rec.start();
    }
}
