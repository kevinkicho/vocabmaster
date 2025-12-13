class Flashcard extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
    }
    
    triggerAction(action) {
        if (action === 'next') this.nav(1);
        else if (action === 'prev') this.nav(-1);
        else if (action === 'up' || action === 'down') {
            if(this.dom.card) {
                this.dom.card.classList.toggle('[transform:rotateY(180deg)]');
                this.playSmartAudio(app.store.prefs.flashFront || 'ja');
            }
        }
    }

    playSmartAudio(langKey) {
        if (!app.store.prefs.flashAuto) return;

        const item = this.list[this.i];
        const isFlipped = this.dom.card && this.dom.card.classList.contains('[transform:rotateY(180deg)]');
        let textToPlay = "";
        let audioLang = langKey;
        let conf = typeof LANG_CONFIG !== 'undefined' ? LANG_CONFIG.find(l => l.key === langKey) : null;

        if (isFlipped) {
            if (conf && conf.exKey && item[conf.exKey]) {
                textToPlay = item[conf.exKey];
            } else {
                const backKey = app.store.prefs.flashBack1 || 'en';
                textToPlay = item[backKey];
                audioLang = backKey;
            }
        } else {
            if(conf && conf.visualOnly && conf.audioSrc) {
                textToPlay = item[conf.audioSrc];
                audioLang = conf.audioSrc;
            } else {
                textToPlay = item[langKey];
            }
        }

        if (textToPlay) {
            app.audio.play(textToPlay, audioLang, 'flash', 0);
        }
    }

    setup() {
        const p = app.store.prefs;
        const dur = p.flashSpeed || "700";
        
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-1 landscape:flex-1 flex flex-col min-h-0 relative z-10">
                    <div id="fc-header"></div>
                    <div class="perspective-[1000px] w-full flex-1 min-h-0 cursor-pointer group select-none relative pb-2" onclick="if(!event.target.closest('button')) { this.firstElementChild.classList.toggle('[transform:rotateY(180deg)]'); app.game.playSmartAudio('${p.flashFront || 'ja'}'); }">
                        <div id="fc-card" class="[transform-style:preserve-3d] w-full h-full relative rounded-[2rem] shadow-soft transition-transform" style="transition-duration: ${dur}ms">
                            <div class="absolute inset-0 [backface-visibility:hidden] [transform:translateZ(1px)] bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 flex flex-col shadow-sm z-10 overflow-hidden gpu-fix">
                                <div class="flex-1 w-full h-full fit-box"><span id="fc-front" class="fit-target font-black text-slate-800 dark:text-neutral-200 tracking-tight"></span></div>
                                <div class="h-10 shrink-0 w-full text-center text-slate-300 dark:text-neutral-600 text-sm font-bold uppercase tracking-widest flex items-center justify-center">Tap to Flip</div>
                            </div>
                            <div id="fc-back-container" class="absolute inset-0 [backface-visibility:hidden] bg-slate-800 dark:bg-black text-white rounded-[2rem] [transform:rotateY(180deg)_translateZ(1px)] flex flex-col border border-slate-700 dark:border-neutral-800 shadow-2xl z-10 overflow-hidden gpu-fix">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="shrink-0 landscape:w-1/2 flex flex-col justify-center landscape:justify-center landscape:pt-2">
                    <div id="fc-audio"></div>
                    <div id="fc-nav"></div>
                </div>
            </div>`;
        
        this.dom.header = this.root.querySelector('#fc-header');
        this.dom.card = this.root.querySelector('#fc-card');
        this.dom.front = this.root.querySelector('#fc-front');
        this.dom.backContainer = this.root.querySelector('#fc-back-container');
        this.dom.audio = this.root.querySelector('#fc-audio');
        this.dom.nav = this.root.querySelector('#fc-nav');
        
        this.dom.nav.innerHTML = app.ui.nav();
    }

    update() {
        this.busy = false;
        const item = this.list[this.i];
        const p = app.store.prefs;
        
        if(this.dom.card) this.dom.card.classList.remove('[transform:rotateY(180deg)]');
        
        const frontText = item[p.flashFront || 'ja'];
        const backs = [item[p.flashBack1], item[p.flashBack2], item[p.flashBack3], item[p.flashBack4]].filter(t => t && t.trim()); 

        let backHtml = backs.length <= 2 
            ? backs.map((txt, idx) => `<div class="flex-1 flex flex-col items-center justify-center p-4 ${idx===0 && backs.length>1 ? 'border-b landscape:border-b-0 landscape:border-r border-slate-600/50' : ''} overflow-hidden"><div class="flex-1 w-full fit-box"><span class="fit-target font-black">${txt}</span></div></div>`).join('')
            : `<div class="grid grid-cols-1 landscape:grid-cols-2 grid-rows-4 landscape:grid-rows-2 w-full h-full">${backs.map(txt => `<div class="flex items-center justify-center p-2 overflow-hidden"><div class="w-full h-full fit-box"><span class="fit-target font-black text-sm">${txt}</span></div></div>`).join('')}</div>`;
        
        if(backs.length <= 2) backHtml = `<div class="flex flex-col landscape:flex-row w-full h-full">${backHtml}</div>`;

        if(this.dom.front) { this.dom.front.innerText = frontText; this.dom.front.innerHTML = frontText; }
        if(this.dom.backContainer) this.dom.backContainer.innerHTML = backHtml;
        if(this.dom.header) this.dom.header.innerHTML = app.ui.header(this.i, this.list.length, app.score, {showDice:true});
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(item);

        this.afterRender();
        this.playSmartAudio(p.flashFront || 'ja');
    }
}
