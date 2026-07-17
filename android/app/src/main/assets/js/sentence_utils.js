/* js/sentence_utils.js — cloze blank finding + CJK-aware sentence chunking
 *
 * Cloze: headword often ≠ surface form in examples (部屋 vs へや, 言う vs いいました).
 * Use secondary readings (ja_furi, etc.), multi-gloss splits, and light JA conjugation stems.
 *
 * Chunking for Sentence Build (no spaces in JA/ZH):
 *  1) Prefer Intl.Segmenter word granularity when available (Baseline 2024 browsers)
 *  2) Fallback: script-run + punctuation split + character n-grams for CJK
 *  3) Pedagogical merge: attach JA particles/endings to previous chunk; cap block count
 *  4) Always anchor known vocab headword/reading as a single block when found
 *
 * window.SentenceUtils
 */

var SentenceUtils = (function () {
    var JA_PARTICLES = Object.freeze({
        は: 1, が: 1, を: 1, に: 1, で: 1, と: 1, も: 1, へ: 1, や: 1, の: 1,
        から: 1, まで: 1, より: 1, ね: 1, よ: 1, か: 1, な: 1, わ: 1, さ: 1,
        です: 1, ます: 1, でした: 1, ました: 1, ません: 1, ない: 1, た: 1, て: 1
    });

    function normalizeText(str) {
        if (!str) return '';
        return String(str)
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }

    function escapeReg(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function isCjkLang(code) {
        return code === 'ja' || code === 'zh' || code === 'ko';
    }

    function isEuroLang(code) {
        return ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru'].indexOf(code) !== -1;
    }

    /**
     * Build match candidates from a vocab item for a given language key.
     * @param {object} item
     * @param {string} langKey e.g. 'ja','en'
     * @returns {string[]} longest-first unique candidates
     */
    function blankCandidates(item, langKey) {
        item = item || {};
        langKey = langKey || 'ja';
        var raw = item[langKey] || '';
        var list = [];
        function add(s) {
            s = normalizeText(s);
            if (!s) return;
            // strip parenthetical notes
            var noParen = s.replace(/[（(][^）)]*[）)]/g, '').trim();
            if (noParen) list.push(noParen);
            list.push(s);
        }
        add(raw);
        // multi-sense glosses
        String(raw).split(/[;|／/·・]+/).forEach(function (part) {
            add(part);
            if (isEuroLang(langKey)) {
                String(part).split(/\s+/).forEach(function (w) {
                    if (w.length >= 3) add(w);
                });
            }
        });
        // secondary orthography / reading fields
        var secondary = {
            ja: ['ja_furi', 'ja_roma'],
            zh: ['zh_pin'],
            ko: ['ko_roma'],
            ru: ['ru_tr']
        }[langKey];
        if (secondary) {
            secondary.forEach(function (k) {
                if (item[k]) {
                    add(item[k]);
                    String(item[k]).split(/[\s·・]+/).forEach(add);
                }
            });
        }
        // Japanese conjugation-ish stems from furigana/kana reading
        if (langKey === 'ja') {
            var reading = normalizeText(item.ja_furi || item.ja || '');
            reading = reading.replace(/[（(][^）)]*[）)]/g, '').trim();
            if (reading) {
                japaneseConjugationForms(reading).forEach(add);
            }
            var head = normalizeText(item.ja || '').replace(/[（(][^）)]*[）)]/g, '').trim();
            if (head && head !== reading) japaneseConjugationForms(head).forEach(add);
        }
        // unique, longest first
        var seen = {};
        var out = [];
        list.forEach(function (s) {
            if (!s || seen[s]) return;
            seen[s] = true;
            out.push(s);
        });
        out.sort(function (a, b) { return b.length - a.length; });
        return out;
    }

    /**
     * Lightweight godan/ichidan-ish surface forms for matching in example sentences.
     * Not a full conjugator — just common learner forms that appear in N5 examples.
     */
    function japaneseConjugationForms(base) {
        if (!base || base.length < 1) return [];
        var forms = [base];
        var last = base.slice(-1);
        var stem = base.slice(0, -1);
        // ichidan-ish る
        if (last === 'る' && stem.length) {
            forms.push(stem, stem + 'ます', stem + 'ました', stem + 'ません', stem + 'て', stem + 'た',
                stem + 'ない', stem + 'なかった', stem + 'よう', stem + 'れば');
        }
        // godan row maps (う-row)
        var godanI = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' };
        var godanA = { う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら' };
        var godanE = { う: 'え', く: 'け', ぐ: 'げ', す: 'せ', つ: 'て', ぬ: 'ね', ぶ: 'べ', む: 'め', る: 'れ' };
        var godanTe = { う: 'って', く: 'いて', ぐ: 'いで', す: 'して', つ: 'って', ぬ: 'んで', ぶ: 'んで', む: 'んで', る: 'って' };
        var godanTa = { う: 'った', く: 'いた', ぐ: 'いだ', す: 'した', つ: 'った', ぬ: 'んだ', ぶ: 'んだ', む: 'んだ', る: 'った' };
        if (godanI[last] && stem.length) {
            var iStem = stem + godanI[last];
            forms.push(iStem + 'ます', iStem + 'ました', iStem + 'ません', iStem + 'ましょう');
            forms.push(stem + godanA[last] + 'ない', stem + godanA[last] + 'なかった');
            forms.push(stem + godanE[last] + 'ば', stem + godanE[last] + 'る');
            if (godanTe[last]) forms.push(stem + godanTe[last]);
            if (godanTa[last]) forms.push(stem + godanTa[last]);
            // bare i-stem (いいます → also いい in いいました)
            forms.push(iStem);
        }
        // adjectives い
        if (last === 'い' && stem.length) {
            forms.push(stem + 'く', stem + 'くて', stem + 'かった', stem + 'くない', stem + 'ければ');
        }
        return forms;
    }

    /**
     * Find first occurrence of best candidate in sentence.
     * @returns {{ start:number, end:number, matched:string }|null}
     */
    function findBlankSpan(sentence, item, langKey) {
        sentence = normalizeText(sentence);
        if (!sentence) return null;
        // F3: optional precomputed span on vocab item { blanks: { ja: { start, end } } }
        try {
            var pre = item && item.blanks && item.blanks[langKey];
            if (pre && Number.isFinite(pre.start) && Number.isFinite(pre.end) &&
                pre.start >= 0 && pre.end > pre.start && pre.end <= sentence.length) {
                return {
                    start: pre.start,
                    end: pre.end,
                    matched: sentence.slice(pre.start, pre.end)
                };
            }
        } catch (_) {}
        var cands = blankCandidates(item, langKey);
        var i, c, idx, reg, m;

        // 1) exact (case-insensitive for Latin; Cyrillic letters for ru)
        for (i = 0; i < cands.length; i++) {
            c = cands[i];
            if (c.length < 1) continue;
            if (langKey === 'ru') {
                reg = new RegExp(escapeReg(c) + '[\\w\\u0400-\\u04FF]*', 'i');
                m = sentence.match(reg);
                if (m && m.index != null) {
                    return { start: m.index, end: m.index + m[0].length, matched: m[0] };
                }
            } else if (isEuroLang(langKey)) {
                reg = new RegExp(escapeReg(c) + '[\\w\\u00C0-\\u024F]*', 'i');
                m = sentence.match(reg);
                if (m && m.index != null) {
                    return { start: m.index, end: m.index + m[0].length, matched: m[0] };
                }
            } else {
                idx = sentence.indexOf(c);
                if (idx !== -1) {
                    return { start: idx, end: idx + c.length, matched: c };
                }
            }
        }

        // 2) CJK: longest substring of any candidate (≥2 chars) that appears in sentence
        if (isCjkLang(langKey)) {
            var best = null;
            for (i = 0; i < cands.length; i++) {
                c = cands[i];
                if (c.length < 2) continue;
                for (var len = c.length; len >= 2; len--) {
                    for (var start = 0; start + len <= c.length; start++) {
                        var sub = c.slice(start, start + len);
                        idx = sentence.indexOf(sub);
                        if (idx !== -1) {
                            if (!best || sub.length > best.matched.length) {
                                best = { start: idx, end: idx + sub.length, matched: sub };
                            }
                        }
                    }
                    if (best && best.matched.length === c.length) break;
                }
            }
            if (best) return best;
        }

        return null;
    }

    /**
     * Build cloze HTML for a sentence given vocab item + lang.
     * @returns {{ html:string, audio:string, matched:string|null, span:object|null }}
     */
    function generateCloze(rawSentence, itemOrTarget, langCode, createMaskFn) {
        var sentence = normalizeText(rawSentence);
        if (!sentence) return { html: '', audio: '', matched: null, span: null };

        var item = itemOrTarget;
        if (typeof itemOrTarget === 'string') {
            item = {};
            item[langCode || 'ja'] = itemOrTarget;
        }

        var span = findBlankSpan(sentence, item, langCode || 'ja');
        var escapeHtmlFn = (typeof escapeHtml === 'function')
            ? escapeHtml
            : function (s) {
                return String(s)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            };

        var defaultMask = function (word) {
            var id = 'main-blank-' + Math.random().toString(36).substr(2, 5);
            return '<span id="' + id + '" data-word="' + escapeHtmlFn(word) +
                '" class="main-blank inline-block px-1 mx-0.5 border-b-2 border-violet-400 bg-violet-100 dark:bg-violet-900 rounded text-transparent select-none transition-all duration-300 min-w-[1.5em] text-center align-bottom">' +
                escapeHtmlFn(word) + '</span>';
        };
        var mask = createMaskFn || defaultMask;

        if (!span) {
            return {
                html: escapeHtmlFn(sentence),
                audio: sentence,
                matched: null,
                span: null
            };
        }

        var before = sentence.slice(0, span.start);
        var mid = sentence.slice(span.start, span.end);
        var after = sentence.slice(span.end);
        return {
            html: escapeHtmlFn(before) + mask(mid) + escapeHtmlFn(after),
            audio: before + ' ... ' + after,
            matched: mid,
            span: span
        };
    }

    // ---------- Chunking for Sentence Build ----------

    function localeFor(langCode) {
        var map = { ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ru: 'ru' };
        return map[langCode] || langCode || 'en';
    }

    /**
     * Segment sentence into pedagogical blocks for reordering.
     * @param {string} sentence
     * @param {string} langCode
     * @param {{ item?: object, maxBlocks?: number, minBlocks?: number }} opts
     * @returns {string[]} ordered blocks (correct order)
     */
    function chunkSentence(sentence, langCode, opts) {
        opts = opts || {};
        sentence = normalizeText(sentence);
        if (!sentence) return [];
        var maxBlocks = opts.maxBlocks || 8;
        var minBlocks = opts.minBlocks || 2;

        var parts = [];
        // 1) Intl.Segmenter when available
        if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
            try {
                var seg = new Intl.Segmenter(localeFor(langCode), { granularity: 'word' });
                var iter = seg.segment(sentence);
                for (var s of iter) {
                    var t = s.segment;
                    if (!t || /^\s+$/.test(t)) continue;
                    parts.push(t);
                }
            } catch (_) {
                parts = [];
            }
        }

        // 2) Fallback: space / punctuation / script runs
        if (!parts.length) {
            parts = fallbackChunk(sentence, langCode);
        }

        // 3) Merge punctuation into previous
        parts = mergePunctuation(parts);

        // 4) JA: attach short particles / copula bits to previous content word
        if (langCode === 'ja') {
            parts = mergeJapaneseParticles(parts);
        }

        // 5a) Curated blocks override (F7) when present on item
        if (opts.item && Array.isArray(opts.item.buildBlocks) && opts.item.buildBlocks.length >= 2) {
            var curated = opts.item.buildBlocks.map(function (b) { return String(b); }).filter(Boolean);
            if (curated.join('').replace(/\s+/g, '') === sentence.replace(/\s+/g, '')) {
                return balanceBlocks(curated, minBlocks, maxBlocks, langCode);
            }
        }

        // 5b) Anchor vocab headword as one block if split across pieces
        if (opts.item) {
            parts = fuseVocabAnchor(parts, opts.item, langCode);
        }

        // 6) Balance block count: merge smallest neighbors if too many; split long CJK if too few
        parts = balanceBlocks(parts, minBlocks, maxBlocks, langCode);

        return parts.filter(function (p) { return p && p.length; });
    }

    function fallbackChunk(sentence, langCode) {
        if (!isCjkLang(langCode) && /\s/.test(sentence)) {
            return sentence.split(/(\s+|[.,!?;:。、！？…「」『』（）()])/).filter(function (t) {
                return t && !/^\s+$/.test(t);
            });
        }
        // CJK script-run + punct
        var out = [];
        var re = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+|[a-zA-Z0-9]+|[^\s]/g;
        var m;
        while ((m = re.exec(sentence)) !== null) {
            var chunk = m[0];
            // split long CJK runs into 2-char groups as crude fallback
            if (/^[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+$/.test(chunk) && chunk.length > 4) {
                for (var i = 0; i < chunk.length; i += 2) {
                    out.push(chunk.slice(i, i + 2));
                }
            } else {
                out.push(chunk);
            }
        }
        return out;
    }

    function mergePunctuation(parts) {
        var punct = /^[.,!?;:。、！？…「」『』（）()]+$/;
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            if (punct.test(parts[i]) && out.length) {
                out[out.length - 1] += parts[i];
            } else {
                out.push(parts[i]);
            }
        }
        return out;
    }

    function mergeJapaneseParticles(parts) {
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            // Keep fullwidth/halfwidth quotes attached but don't glue content across them incorrectly
            if (out.length && (JA_PARTICLES[p] || /^[はがをにでともへのやかなねよわさ]$/.test(p))) {
                out[out.length - 1] += p;
            } else if (out.length && /^(ます|ました|ません|です|でした|ない|た|て)$/.test(p)) {
                out[out.length - 1] += p;
            } else if (out.length && /^[。、！？…」』）)]+$/.test(p)) {
                out[out.length - 1] += p;
            } else {
                out.push(p);
            }
        }
        return out;
    }

    function fuseVocabAnchor(parts, item, langCode) {
        var joined = parts.join('');
        var span = findBlankSpan(joined, item, langCode);
        if (!span) return parts;
        // Rebuild with Segmenter (not 2-char fallback) on sides so CJK stays word-like
        var before = joined.slice(0, span.start);
        var mid = joined.slice(span.start, span.end);
        var after = joined.slice(span.end);

        function sideChunk(text) {
            if (!text) return [];
            var segs = [];
            if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
                try {
                    var seg = new Intl.Segmenter(localeFor(langCode), { granularity: 'word' });
                    for (var s of seg.segment(text)) {
                        if (s.segment && !/^\s+$/.test(s.segment)) segs.push(s.segment);
                    }
                } catch (_) { segs = []; }
            }
            if (!segs.length) segs = fallbackChunk(text, langCode);
            segs = mergePunctuation(segs);
            if (langCode === 'ja') segs = mergeJapaneseParticles(segs);
            return segs;
        }

        return sideChunk(before).concat([mid], sideChunk(after));
    }

    function balanceBlocks(parts, minBlocks, maxBlocks, langCode) {
        parts = parts.slice();
        // merge if too many
        while (parts.length > maxBlocks && parts.length > 1) {
            // merge two shortest adjacent
            var bestI = 0;
            var bestLen = Infinity;
            for (var i = 0; i < parts.length - 1; i++) {
                var len = parts[i].length + parts[i + 1].length;
                if (len < bestLen) {
                    bestLen = len;
                    bestI = i;
                }
            }
            parts[bestI] = parts[bestI] + parts[bestI + 1];
            parts.splice(bestI + 1, 1);
        }
        // split if too few and CJK long blocks
        var guard = 0;
        while (parts.length < minBlocks && guard++ < 20) {
            var longI = -1;
            var longLen = 0;
            for (var j = 0; j < parts.length; j++) {
                if (parts[j].length > longLen) {
                    longLen = parts[j].length;
                    longI = j;
                }
            }
            if (longI < 0 || longLen < 4) break;
            var half = Math.floor(parts[longI].length / 2);
            var a = parts[longI].slice(0, half);
            var b = parts[longI].slice(half);
            parts.splice(longI, 1, a, b);
        }
        return parts;
    }

    /** Fisher–Yates shuffle copy; ensures not identical to original when possible. */
    function shuffleBlocks(blocks) {
        var arr = blocks.slice();
        if (arr.length < 2) return arr;
        var orig = blocks.join('\u0001');
        for (var attempt = 0; attempt < 8; attempt++) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = arr[i];
                arr[i] = arr[j];
                arr[j] = t;
            }
            if (arr.join('\u0001') !== orig) break;
        }
        return arr;
    }

    return {
        normalizeText: normalizeText,
        blankCandidates: blankCandidates,
        findBlankSpan: findBlankSpan,
        generateCloze: generateCloze,
        chunkSentence: chunkSentence,
        shuffleBlocks: shuffleBlocks,
        japaneseConjugationForms: japaneseConjugationForms
    };
})();

window.SentenceUtils = SentenceUtils;
