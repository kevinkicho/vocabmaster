/* js/game_sentences.js */
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
        // Reset text color from previous correct/incorrect state
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

        // AI usage is mandatory for AI Cloze activity.
        const llmReady = app.llm && app.llm.available && app.llm.hasModel;
        if (!llmReady) {
            if (this.dom.text) {
                this.dom.text.innerHTML = `<p class="text-rose-500 font-bold">AI Cloze requires a working AI connection.</p><p class="text-xs text-slate-400 mt-1">Please set up and connect AI in Settings &gt; AI (Cloze &amp; Story).</p>`;
            }
            if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c) + this._listenBtnHtml();
            // Disable answer buttons
            this.dom.btns.forEach(btn => { btn.onclick = null; });
            this.afterRender();
            return;
        }

        // AI is available and mandatory: use LLM for the cloze (no non-AI regex path for this activity).
        this.updateHeader();
        if(this.dom.audio) this.dom.audio.innerHTML = app.ui.audioBar(c) + this._listenBtnHtml();
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

        // Show loading state while AI generates the cloze
        if (this.dom.text) {
            this.dom.text.innerHTML = '<span class="text-slate-400">Generating AI cloze...</span>';
            this.dom.text.classList.add('opacity-60');
        }

        this.afterRender();
        this.runCustomAutoPlay(c);

        L('[Sentences] Firing mandatory LLM cloze generation for target:', targetRaw);
        this._tryLLMCloze(targetRaw, qKey, c, aKey, bottomKey);
    }

    _renderCloze(result, card, qKey, aKey, bottomKey) {
        const p = app.store.prefs;
        this.maskedHtml = result.html;
        this.maskedAudioText = result.audio;

        let transHtml = '';
        const transLang = p.sentencesTrans;
        if (transLang && transLang !== qKey) {
            const transWord = card[transLang];
            if (transWord) {
                transHtml = `<p class="text-xs font-bold text-slate-400 dark:text-neutral-500 mt-2 italic">${escapeHtml(transWord)}</p>`;
            }
        }

        let bottomHtml = '';
        const dispMode = p.sentencesBottomDisp || 'sentence_masked';

        if (dispMode !== 'none') {
            let bottomText = '';
            let bExKey = bottomKey;
            const bConf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(bottomKey) || null : null;
            if (bConf && bConf.exKey) bExKey = bConf.exKey;

            const wordText = card[bottomKey] || "";
            const sentenceText = card[bExKey] || wordText || "";

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
             this.dom.text.innerHTML = this.maskedHtml + transHtml;
             this.dom.text.dataset.wid = card.id;
        }

        if(this.dom.bottomDisp) this.dom.bottomDisp.innerHTML = bottomHtml;
    }

    _buildClozeFromMatch(sentence, matchedText) {
        const createMask = (word) => {
            const id = 'main-blank-' + Math.random().toString(36).substr(2, 5);
            return `<span id="${id}" data-word="${escapeHtml(word)}" class="main-blank inline-block px-1 mx-1 border-b-2 border-violet-400 bg-violet-100 dark:bg-violet-900/50 rounded text-transparent select-none transition-all duration-300 min-w-[2em] text-center align-bottom">${escapeHtml(word)}</span>`;
        };
        const sentenceHtml = escapeHtml(sentence);
        const matchHtml = escapeHtml(matchedText);
        const escaped = matchHtml.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(`(${escaped})`, 'gi');
        return {
            html: sentenceHtml.replace(reg, (m) => createMask(matchedText)),
            audio: sentence.replace(new RegExp(`(${matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), ' ... ')
        };
    }

    async _tryLLMCloze(targetRaw, qKey, card, aKey, bottomKey) {
        // Subtle loading indicator
        if (this.dom.text) this.dom.text.classList.add('opacity-60');
        this.busy = true;

        const cardLevel = (card.tags || []).find(t => ['N5','N4','N3','N2','N1'].includes(t)) || '';
        const generated = await app.llm.generateClozeSentence(targetRaw, qKey, cardLevel);

        if (!this.list[this.i] || this.list[this.i].id !== card.id) return;
        this.busy = false;

        if (generated && generated.sentence && generated.match) {
            const result = this._buildClozeFromMatch(generated.sentence, generated.match);
            this._renderCloze(result, card, qKey, aKey, bottomKey);
            // Re-fit text after LLM update
            if (app.fitter && this.dom.text) await app.fitter.fitSmart(this.dom.text);
        } else {
            // AI mandatory: failure to get a match from LLM means the activity cannot provide content.
            if (this.dom.text) {
                this.dom.text.innerHTML = `<p class="text-rose-500 font-bold">AI failed to produce a suitable cloze for this word.</p>`;
            }
        }

        if (this.dom.text) this.dom.text.classList.remove('opacity-60');
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
            const exKey = conf.exKey || '';
            text = exKey ? (c[exKey] || c[audioSrc]) : c[audioSrc];
        }
        if(text) app.audio.play(text, audioLang, 'sentences', 0);
    }

    async check(btn, isCorrect) {
        if(this.busy || this.answered) return;
        const btnWrap = btn.parentElement;

        // Learning Loop tracking
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
            // Make non-blank text readable on colored background
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

            if (app.llm && app.llm.available && app.llm.hasModel) {
                const card = this.list[this.i];
                if (card) {
                    const p = app.store.prefs;
                    const qKey = p.sentencesQ || 'ja';
                    const aKey = p.sentencesA || 'en';
                    const exConf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(qKey) : null;
                    const exKey = exConf && exConf.exKey ? exConf.exKey : '';
                    const sentence = card[exKey] || '';
                    const word = card[qKey] || '';
                    if (sentence && word) {
                        const cardLevel = (card.tags || []).find(t => ['N5','N4','N3','N2','N1'].includes(t)) || '';
                        this._showGrammarLink(word, sentence, qKey, cardLevel);
                    }
                }
            }
        }
    }
    _showGrammarLink(word, sentence, langCode, level) {
        const existing = document.getElementById('sn-grammar-link');
        if (existing) existing.remove();

        const link = document.createElement('button');
        link.id = 'sn-grammar-link';
        link.className = 'mt-2 mx-auto block text-[11px] font-bold text-indigo-500 dark:text-indigo-400 hover:underline active:scale-95 transition-transform';
        link.innerHTML = '<i class="ph-bold ph-lightbulb mr-1"></i>Why? — Tap for grammar explanation';
        link.onclick = () => this._showGrammarExplanation(word, sentence, langCode, level);

        if (this.dom.bottomDisp) {
            this.dom.bottomDisp.appendChild(link);
        } else if (this.dom.sBox) {
            this.dom.sBox.appendChild(link);
        }
    }

    async _showGrammarExplanation(word, sentence, langCode, level) {
        const link = document.getElementById('sn-grammar-link');
        if (link) {
            link.innerHTML = '<i class="ph-bold ph-spinner animate-spin mr-1"></i>Loading explanation...';
            link.disabled = true;
        }

        const explanation = await app.llm.getGrammarExplanation(word, sentence, langCode, level);

        if (!this.list[this.i]) { link && link.remove(); return; }

        if (link) link.remove();

        const panel = document.createElement('div');
        panel.id = 'sn-grammar-panel';
        panel.className = 'mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs text-left';

        if (explanation) {
            const formatted = escapeHtml(explanation)
                .replace(/^GRAMMAR:\s*/im, '<p class="font-bold text-indigo-700 dark:text-indigo-300 mb-1"><i class="ph-bold ph-book-open mr-1"></i>Grammar</p><p class="text-slate-700 dark:text-neutral-200 mb-2">')
                .replace(/^USAGE:\s*/im, '</p><p class="font-bold text-indigo-700 dark:text-indigo-300 mb-1"><i class="ph-bold ph-chat-centered-text mr-1"></i>Usage</p><p class="text-slate-700 dark:text-neutral-200 mb-2">')
                .replace(/^EXAMPLE:\s*/im, '</p><p class="font-bold text-indigo-700 dark:text-indigo-300 mb-1"><i class="ph-bold ph-pencil-simple mr-1"></i>Example</p><p class="text-slate-700 dark:text-neutral-200">')
                + '</p>';
            panel.innerHTML = formatted;
        } else {
            panel.innerHTML = '<p class="text-slate-500 dark:text-neutral-400 text-center">Could not load explanation.</p>';
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mt-2 w-full text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => panel.remove();
        panel.appendChild(closeBtn);

        if (this.dom.bottomDisp) {
            this.dom.bottomDisp.appendChild(panel);
        } else if (this.dom.sBox) {
            this.dom.sBox.appendChild(panel);
        }
    }

    _clearOverlays() {
        const grammarLink = document.getElementById('sn-grammar-link');
        if (grammarLink) grammarLink.remove();
        const grammarPanel = document.getElementById('sn-grammar-panel');
        if (grammarPanel) grammarPanel.remove();
        const listeningPanel = document.getElementById('sn-listening-panel');
        if (listeningPanel) listeningPanel.remove();
    }

    _listenBtnHtml() {
        const llmReady = app.llm && app.llm.available && app.llm.hasModel;
        if (!llmReady) return '';
        return `<button id="sn-listen-btn" onclick="app.game._startListening()" class="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 active:scale-95 transition-all"><i class="ph-bold ph-headphones mr-1"></i>Listen</button>`;
    }

    async _startListening() {
        const card = this.list[this.i];
        if (!card) return;
        const p = app.store.prefs;
        const qKey = p.sentencesQ || 'ja';
        const words = [card[qKey] || card.ja || card.en].filter(Boolean);
        if (words.length === 0) return;

        const btn = document.getElementById('sn-listen-btn');
        if (btn) {
            btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin mr-1"></i>Loading...';
            btn.disabled = true;
        }

        const cardLevel = (card.tags || []).find(t => ['N5','N4','N3','N2','N1'].includes(t)) || '';
        const result = await app.llm.getListeningPassage(words, qKey, cardLevel);

        if (!this.list[this.i] || this.list[this.i].id !== card.id) return;

        if (btn) {
            btn.innerHTML = '<i class="ph-bold ph-headphones mr-1"></i>Listen';
            btn.disabled = false;
        }

        if (!result || !result.passage) {
            this._showListeningError();
            return;
        }

        this._showListeningPanel(result, qKey);
    }

    _showListeningError() {
        const existing = document.getElementById('sn-listening-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'sn-listening-panel';
        panel.className = 'mt-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800 text-xs text-center';
        panel.innerHTML = '<p class="text-rose-500 dark:text-rose-300 font-bold"><i class="ph-bold ph-warning mr-1"></i>Could not generate listening passage.</p>';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mt-1 text-[10px] font-bold text-rose-400 hover:text-rose-600 dark:hover:text-rose-200';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => panel.remove();
        panel.appendChild(closeBtn);

        this.dom.bottomDisp.appendChild(panel);
    }

    _showListeningPanel(result, qKey) {
        const existing = document.getElementById('sn-listening-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'sn-listening-panel';
        panel.className = 'mt-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border border-cyan-200 dark:border-cyan-800 text-xs text-left';

        const conf = typeof LANG_MAP !== 'undefined' ? LANG_MAP.get(qKey) : null;
        const audioLang = (conf && conf.audioSrc) ? conf.audioSrc : qKey;

        let html = '<div class="flex items-center gap-2 mb-2"><i class="ph-bold ph-headphones text-cyan-500 text-lg"></i><span class="font-black text-cyan-700 dark:text-cyan-300 uppercase tracking-widest text-[10px]">Listening Passage</span></div>';

        html += `<p class="text-slate-700 dark:text-neutral-200 leading-relaxed mb-3 select-text" id="sn-listening-text">${escapeHtml(result.passage)}</p>`;

        html += '<button onclick="app.audio.play(document.getElementById(\'sn-listening-text\').innerText, \'' + audioLang + '\', \'sentences\', 0)" class="px-3 py-1 rounded-lg text-[10px] font-bold bg-cyan-500 text-white active:scale-95 transition-transform mb-3"><i class="ph-bold ph-speaker-high mr-1"></i>Play Audio</button>';

        if (result.question) {
            html += '<div class="border-t border-cyan-200 dark:border-cyan-800 pt-2 mt-1">';
            html += `<p class="font-bold text-slate-700 dark:text-neutral-200 mb-1.5"><i class="ph-bold ph-question mr-1"></i>${escapeHtml(result.question.question)}</p>`;
            result.question.choices.forEach(c => {
                const letter = c.charAt(0).toUpperCase();
                const isSelected = result.question.answer && letter === result.question.answer;
                const cls = isSelected ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 font-bold' : 'bg-white dark:bg-neutral-800 border-slate-200 dark:border-neutral-700';
                html += `<button class="block w-full text-left mb-1 px-2 py-1.5 rounded-lg border ${cls} text-slate-700 dark:text-neutral-200 transition-colors" onclick="this.classList.toggle('bg-emerald-100');this.classList.toggle('dark:bg-emerald-900/30');this.classList.toggle('font-bold')">${escapeHtml(c)}</button>`;
            });
            if (result.question.answer) {
                html += `<p class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1"><i class="ph-bold ph-check-circle mr-1"></i>Answer: ${escapeHtml(result.question.answer)}</p>`;
            }
            html += '</div>';
        }

        panel.innerHTML = html;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mt-2 w-full text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => panel.remove();
        panel.appendChild(closeBtn);

        this.dom.bottomDisp.appendChild(panel);
    }
}
