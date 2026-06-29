/* js/game_sentences.js — Cloze activity using example sentences from vocab data.
 *
 * Shows the example sentence with the target word masked out.
 * Four answer choices: correct word + 3 distractors.
 * No AI dependency — uses regex-based cloze from existing vocab data.
 */
class Sentences extends GameMode {
    constructor(k) { 
        super(k); 
        this.setup(); 
        this.update(); 
    }
    
    setup() {
        this.root.innerHTML = `
            <div class="flex flex-col landscape:flex-row h-full w-full landscape:gap-4 overflow-hidden">
                <div class="flex-none h-[45%] landscape:h-full landscape:flex-1 flex flex-col min-h-0">
                    <div id="sn-header" class="shrink-0"></div>
                    <div id="s-box" class="bg-white dark:bg-neutral-900 rounded-[2rem] border border-slate-100 dark:border-neutral-800 shadow-sm flex-1 flex flex-col items-center p-4 landscape:p-3 text-center relative mb-2 landscape:mb-0 overflow-hidden min-h-0">
                         <div class="flex-1 w-full flex items-center justify-center overflow-hidden relative min-h-0">
                             <p id="sn-text" class="fit-smart text-xl sm:text-2xl font-black text-slate-800 dark:text-white leading-relaxed break-words"></p>
                         </div>
                         <div id="sn-bottom-disp" class="shrink-0 max-h-[30%] overflow-hidden w-full"></div>
                    </div>
                </div>
                <div class="flex-1 landscape:w-1/2 flex flex-col justify-end landscape:justify-between landscape:pt-2 min-h-0">
                    <div id="sn-audio" class="mt-auto landscape:mt-0 shrink-0"></div>
                    <div class="grid grid-cols-2 gap-2 sm:gap-3 shrink-0 mb-1 mt-1 flex-1 min-h-0">
                        ${[0,1,2,3].map(i => `
                            <div class="w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-violet-200 dark:hover:border-violet-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix">
                                <button id="sn-btn-${i}" class="absolute inset-0 w-full h-full fit-box z-10">
                                    <span class="fit-target font-black text-slate-600 dark:text-white"></span>
                                </button>
                            </div>`).join('')}
                    </div>
                    <div id="sn-nav" class="shrink-0"></div>
                </div>
            </div>`;

        this.dom.header = this.root.querySelector('#sn-header');
        this.dom.sBox = this.root.querySelector('#s-box');
        this.dom.text = this.root.querySelector('#sn-text');
        this.dom.bottomDisp = this.root.querySelector('#sn-bottom-disp');
        this.dom.audio = this.root.querySelector('#sn-audio');
        this.dom.btns = [0,1,2,3].map(i => this.root.querySelector(`#sn-btn-${i}`));
        
        this.root.querySelector('#sn-nav').innerHTML = app.ui.nav();
        this.setupHeader();
    }

    normalizeText(str) {
        if (!str) return "";
        return str.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    }

    generateCloze(rawSentence, rawTarget, langCode) {
        if (!rawSentence) return { html: "", audio: "" };
        const sentence = this.normalizeText(rawSentence);
        const targetFull = this.normalizeText(rawTarget);
        const cleanTarget = targetFull.replace(/\(.*?\)/g, "").trim(); 
        if (!cleanTarget) return { html: escapeHtml(sentence), audio: sentence };

        const createMask = (word) => {
            const id = 'main-blank-' + Math.random().toString(36).substr(2, 5);
            return `<span id="${id}" data-word="${escapeHtml(word)}" class="main-blank inline-block px-1 mx-1 border-b-2 border-violet-400 bg-violet-100 dark:bg-violet-900/50 rounded text-transparent select-none transition-all duration-300 min-w-[2em] text-center align-bottom">${escapeHtml(word)}</span>`;
        };

        const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentenceHtml = escapeHtml(sentence);
        const cleanTargetHtml = escapeHtml(cleanTarget);

        let reg = new RegExp(`(${escapeReg(cleanTargetHtml)})`, 'gi');
        if (sentenceHtml.match(reg)) return { html: sentenceHtml.replace(reg, (match) => createMask(cleanTarget)), audio: sentence.replace(new RegExp(`(${escapeReg(cleanTarget)})`, 'gi'), " ... ") };

        const delimiters = /[\\/|;]/g; 
        if (targetFull.match(delimiters)) {
            const variants = targetFull.split(delimiters).map(s => s.trim()).filter(s => s);
            variants.sort((a, b) => b.length - a.length);
            for (const v of variants) {
                const vClean = v.replace(/\(.*?\)/g, "").trim();
                if(!vClean) continue;
                const vHtml = escapeHtml(vClean);
                reg = new RegExp(`(${escapeReg(vHtml)})`, 'gi');
                if (sentenceHtml.match(reg)) return { html: sentenceHtml.replace(reg, (match) => createMask(vClean)), audio: sentence.replace(new RegExp(`(${escapeReg(vClean)})`, 'gi'), " ... ") };
            }
        }

        const separators = /[\s·・]/g;
        const tokens = cleanTarget.split(separators).filter(t => t.length > 0);
        
        if (tokens.length > 0) {
            let tempHtml = sentenceHtml;
            let tempAudio = sentence;
            let matchedAny = false;
            
            tokens.sort((a, b) => b.length - a.length);
            const isEuro = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'].includes(langCode);

            tokens.forEach(token => {
                if (token.length < 3 && tokens.length > 1) return;

                const tokenHtml = escapeHtml(token);
                const tokenEsc = escapeReg(tokenHtml);
                let conjugationReg;

                if (isEuro) {
                    conjugationReg = new RegExp(`(${tokenEsc}[\\w\\u00C0-\\u024F]*)`, 'gi');
                } else {
                    conjugationReg = new RegExp(`(${tokenEsc})`, 'gi');
                }
                
                if (tempHtml.match(conjugationReg)) {
                    tempHtml = tempHtml.replace(conjugationReg, (match) => createMask(token));
                    tempAudio = tempAudio.replace(new RegExp(`(${escapeReg(token)})`, 'gi'), " ... ");
                    matchedAny = true;
                }
            });

            if (matchedAny) return { html: tempHtml, audio: tempAudio };
        }

        return { html: sentenceHtml, audio: sentence };
    }

    update() {
        this.busy = false;
        this.answered = false;
        this._clearOverlays();
        if (this.dom.text) this.dom.text.classList.remove('text-white', 'dark:text-white');
        const c = this.list[this.i];
        const p = app.store.prefs;
        const qKey = p.sentencesQ || 'ja';
        const aKey = p.sentencesA || 'ja';
        const bottomKey = p.sentencesBottomLang || 'en';

        let exKey = '';
        if(typeof LANG_CONFIG !== 'undefined') {
            const conf = LANG_MAP.get(qKey);
            if(conf && conf.exKey) exKey = conf.exKey;
        }
        const sentenceRaw = c[exKey] || "No example available.";
        const targetRaw = c[qKey] || "";

        this.updateHeader();
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c);
        if(this.dom.sBox) {
            this.highlightQBox(this.dom.sBox, false);
            this.dom.sBox.classList.remove('bg-emerald-500', 'border-emerald-500', 'bg-rose-500', 'border-rose-500');
        }

        const distractors = this.getDistractors(c.id, 4);
        this.dom.btns.forEach((btn, idx) => {
             const o = distractors[idx];
             if(o) {
                 btn.parentElement.style.display = '';
                 const span = btn.querySelector('span');
                 span.innerText = o[aKey];
                 const wrap = btn.parentElement;

                 wrap.className = "w-full h-full rounded-xl bg-white dark:bg-neutral-900 border-2 border-slate-100 dark:border-neutral-800 hover:border-violet-200 dark:hover:border-violet-500/50 transition-colors shadow-sm overflow-hidden relative gpu-fix";

                 wrap.dataset.wid = o.id;
                 btn.className = "absolute inset-0 w-full h-full fit-box z-10";
                 span.className = "fit-target font-black text-slate-600 dark:text-white";

                 btn.blur();

                 const answerText = o[aKey];
                 btn.onclick = () => app.game.handleInput(wrap, answerText, aKey, () => app.game.check(btn, o.id===c.id));
             } else {
                 btn.parentElement.style.display = 'none';
             }
        });

        // Build cloze directly from example sentence (no AI needed)
        const cloze = this.generateCloze(sentenceRaw, targetRaw, qKey);
        this.maskedHtml = cloze.html;
        this.maskedAudioText = cloze.audio;

        let bottomHtml = '';
        const dispMode = p.sentencesBottomDisp || 'sentence_masked';

        if (dispMode !== 'none') {
            let bottomText = '';
            let bExKey = bottomKey;
            const bConf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(bottomKey) || null : null;
            if (bConf && bConf.exKey) bExKey = bConf.exKey;

            const wordText = c[bottomKey] || "";
            const sentenceText = c[bExKey] || wordText || "";

            switch (dispMode) {
                case 'sentence_masked':
                    const bResult = this.generateCloze(sentenceText, wordText, bottomKey);
                    bottomText = bResult.html;
                    break;
                case 'sentence_full': bottomText = escapeHtml(sentenceText); break;
                case 'word_masked': bottomText = `<span class="inline-block border-b-2 border-slate-300 min-w-[3em] text-transparent select-none bg-slate-100 dark:bg-neutral-800 rounded px-1">${escapeHtml(wordText)}</span>`; break;
                case 'word_full': bottomText = escapeHtml(wordText); break;
            }
            if(bottomText) bottomHtml = `<div class="mt-4 pt-4 border-t border-slate-100 dark:border-neutral-800 w-full"><p class="text-sm font-black text-slate-400 dark:text-neutral-500">${bottomText}</p></div>`;
        }

        if(this.dom.text) {
             this.dom.text.innerHTML = "";
             this.dom.text.dataset.brProcessed = "";
             this.dom.text.dataset.lastFitted = "";
             this.dom.text.innerHTML = this.maskedHtml;
             this.dom.text.dataset.wid = c.id;
        }

        if(this.dom.bottomDisp) this.dom.bottomDisp.innerHTML = bottomHtml;

        this.afterRender();
        this.runCustomAutoPlay(c);
    }

    async afterRender() {
        await app.fitter.fitSmart(this.dom.text); 
        this.dom.btns.forEach(btn => {
            const span = btn.querySelector('.fit-target');
            if(span) app.fitter.fit(span);
        });
        if(this.list && this.list[this.i] && app.notes) { app.notes.check(this.list[this.i].id); }
        
        const textEl = this.dom.text;
        if(textEl) {
             const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, null, false);
             const nodes = [];
             while(walker.nextNode()) nodes.push(walker.currentNode);
              nodes.forEach(node => {
                  if(node.parentNode && (node.parentNode.tagName === 'SPAN' || node.parentNode.classList.contains('main-blank'))) return; 
                  if(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(node.nodeValue)) {
                      const span = document.createElement('span');
                      const escaped = escapeHtml(node.nodeValue);
                      span.innerHTML = escaped.replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF])/g, '<span class="hanzi-char cursor-help transition-colors" data-char="$1">$1</span>');
                      node.parentNode.replaceChild(span, node);
                  }
              });
        }
        this.dom.btns.forEach(btn => {
            const span = btn.querySelector('.fit-target');
            if(span && span.innerHTML.indexOf('hanzi-char') === -1) {
                span.innerHTML = this.wrapHanzi(span.innerText);
            }
        });
        if(app.notes) app.notes.attachTooltipListeners();
        requestAnimationFrame(() => { if(this.root) this.root.classList.add('visible'); });
    }

    runCustomAutoPlay(c) {
        if(!app.store.prefs.sentencesAuto) return;
        const qKey = app.store.prefs.sentencesQ || 'ja';
        const audioSrc = app.store.prefs.sentencesAudioSrc || qKey;
        const conf = LANG_MAP.get(audioSrc)||{};
        let audioLang = conf.audioSrc || audioSrc;
        const readWhole = app.store.prefs.sentencesReadWhole === true;

        let text;
        if (audioSrc === qKey) {
            text = readWhole ? this.rawAudioText : this.maskedAudioText;
        } else {
            const exConf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(audioSrc) : null;
            const bExKey = exConf && exConf.exKey ? exConf.exKey : '';
            text = bExKey ? (c[bExKey] || c[audioSrc]) : c[audioSrc];
        }
        if(text) app.audio.play(text, audioLang, 'sentences', 0);
    }

    async check(btn, isCorrect) {
        if(this.busy || this.answered) return;
        const btnWrap = btn.parentElement;

        const c = this.list[this.i];
        const aKey = app.store.prefs.sentencesA || 'ja';
        const userAnswer = btn.querySelector('span')?.innerText || '';
        const correctAnswer = c[aKey] || '';
        this.trackAnswer(c?.id || 0, isCorrect, userAnswer, correctAnswer, 0);

        btn.classList.remove('ring-4', 'ring-indigo-400', 'scale-95');
        btnWrap.className = btnWrap.className.replace(/\b(bg-white|dark:bg-neutral-900|hover:border-violet-200|dark:hover:border-violet-500\/50)\b/g, '');
        const span = btn.querySelector('span');
        span.classList.replace('text-slate-600', 'text-white');
        span.classList.replace('dark:text-white', 'text-white');
        this.highlightQBox(this.dom.sBox, isCorrect);
        
        if(isCorrect) {
            this.answered = true; this.busy = true; 
            this.score(10);
            btnWrap.classList.add('bg-emerald-500', 'border-emerald-500');
            app.celebration.play();
            const reveal = (el, colorClass) => {
                if(el) {
                    el.classList.remove('text-transparent', 'bg-violet-100', 'dark:bg-violet-900/50', 'border-b-2', 'border-violet-400', 'bg-slate-100', 'border-slate-300');
                    el.classList.add(colorClass); 
                    if(el.classList.contains('main-blank')) el.classList.add('bg-emerald-500', 'px-2', 'rounded');
                    else el.classList.add('text-indigo-500', 'dark:text-indigo-400');
                }
            };
            const mainBlanks = this.root.querySelectorAll('.main-blank');
            mainBlanks.forEach(el => reveal(el, 'text-white'));
            if (this.dom.text) this.dom.text.classList.add('text-white', 'dark:text-white');
            const bottomBlanks = this.dom.bottomDisp.querySelectorAll('span.text-transparent');
            bottomBlanks.forEach(el => {
                el.classList.remove('text-transparent', 'bg-slate-100', 'dark:bg-neutral-800');
                el.classList.add('text-indigo-500', 'dark:text-indigo-400');
            });
            const bottomMainBlanks = this.dom.bottomDisp.querySelectorAll('.main-blank');
            bottomMainBlanks.forEach(el => reveal(el, 'text-emerald-600'));

            let pAudio = null;
            if(app.store.prefs.sentencesPlayCorrect) {
                const qKey = app.store.prefs.sentencesQ || 'ja';
                let audioLang = (LANG_MAP.get(qKey)||{}).audioSrc || qKey;
                if(this.rawAudioText) {
                    pAudio = app.audio.play(this.rawAudioText, audioLang, 'sentences', 0);
                }
            }
            this.waitAndNav(pAudio, 2500);
        } else {
            btnWrap.classList.add('bg-rose-500', 'border-rose-500');
            this.miss();
        }
    }

    _clearOverlays() {}
}
