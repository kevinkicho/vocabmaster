# Implementation Plan

## Feature 9: AI Init Sequence — Block with Timeout + Persistent Status Indicator

### Current Behavior

```
init() start
  → Auth (waitForAuth, blocks 1.5s)
  → Data (load(), blocks ~1-3s)
  → LLM loadPrefs() + autoDetect()  ← FIRE-AND-FORGET (no await)
  → Enable Start button
  → User clicks → overlay fades → goHome() renders home screen
  → ...2-10s later... autoDetect() finishes → toast appears (surprise!)
```

### Target Behavior

```
init() start
  → Auth (waitForAuth, blocks 1.5s)
  → Data (load(), blocks ~1-3s)
  → LLM: show "Connecting to AI..." on statusBar
  → LLM: await autoDetect() with 3s timeout
    → If proxy responds within 3s: statusBar shows "AI Ready" or "AI Offline"
    → If timeout: statusBar shows "AI Offline (tap Retry)", autoDetect continues in background
  → Enable Start button
  → User clicks → overlay fades → goHome() renders home screen
  → Home screen shows persistent AI status indicator (green/gray dot + label)
  → When autoDetect finishes (even after timeout): indicator updates in real-time
  → _showAIWelcome() toast is REMOVED
```

### Changes Required

#### 1. Make `autoDetect()` Awaitable with Timeout in `main.js:init()`

**File:** `public/js/main.js` lines 183-187

**Current:**
```js
// 2b. Init LLM — auto-detect Ollama (non-blocking)
if (this.llm) {
    this.llm.loadPrefs();
    this.llm.autoDetect().catch(e => L('[Main] autoDetect error:', e));
}
```

**Target:**
```js
// 2b. Init LLM — try to detect with 3s timeout, continue async if timeout
if (this.llm) {
    this.llm.loadPrefs();
    statusBar.innerText = 'Connecting to AI...';
    statusBar.classList.add('text-amber-400');
    const aiReady = await Promise.race([
        this.llm.autoDetect().then(() => true).catch(() => false),
        new Promise(function(r) { setTimeout(function() { r('timeout'); }, 3000); })
    ]);
    if (aiReady === 'timeout') {
        statusBar.innerText = 'AI offline (tap Retry in Settings)';
        statusBar.classList.remove('text-amber-400');
        statusBar.classList.add('text-slate-400');
        // autoDetect continues in background, status will update on home screen indicator
    } else if (aiReady) {
        statusBar.innerText = this.llm.useCloud ? 'AI Ready (cloud)' : 'AI Ready (local)';
        statusBar.classList.remove('text-amber-400');
        statusBar.classList.add('text-emerald-400');
    } else {
        statusBar.innerText = 'AI offline';
        statusBar.classList.remove('text-amber-400');
        statusBar.classList.add('text-rose-400');
    }
}
```

#### 2. Remove `_showAIWelcome()` Toast

**File:** `public/js/llm/llm_service.js` lines 210 and 389-392

Remove the `_showAIWelcome()` call from `autoDetect()` (line 210). Remove the `_showAIWelcome()` method entirely (lines 389-392). Remove `_showToast()` if nothing else uses it (check callers).

The toast is replaced by the persistent home screen indicator.

#### 3. Add Persistent AI Status Indicator to Home Screen

**File:** `public/js/main.js` in `goHome()` — add a small indicator next to the Daily Score card or in the header area.

Add to the home screen HTML:
```html
<div id="ai-status-indicator" class="flex items-center gap-1.5 mt-2 px-2">
    <span id="ai-status-dot" class="w-2 h-2 rounded-full bg-slate-300"></span>
    <span id="ai-status-label" class="text-[9px] font-bold text-slate-400 uppercase">AI detecting...</span>
</div>
```

**File:** `public/js/ui.js` — add `_updateAIStatus()` method:
```js
_updateAIStatus() {
    const dot = document.getElementById('ai-status-dot');
    const label = document.getElementById('ai-status-label');
    if (!dot || !label) return;
    const llm = app.llm;
    if (llm && llm.available && llm.hasModel) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        label.textContent = llm.useCloud ? 'AI Online (cloud)' : 'AI Online (local)';
        label.className = 'text-[9px] font-bold text-emerald-500 uppercase';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-rose-400';
        label.textContent = 'AI Offline';
        label.className = 'text-[9px] font-bold text-rose-400 uppercase';
    }
}
```

#### 4. Call `_updateAIStatus()` After autoDetect Completes

**File:** `public/js/llm/llm_service.js` in `autoDetect()`, after setting `hasModel`:

```js
if (app && app.ui && app.ui._updateAIStatus) app.ui._updateAIStatus();
```

Also call it in `_ping()` success/failure paths so the indicator updates when the app resumes.

#### 5. Remove Redundant `app.goHome(false)` Call from autoDetect()

**File:** `public/js/llm/llm_service.js` line 212:
```js
if (app && !app.game) app.goHome(false);
```

This was needed because autoDetect was async and the home screen hadn't rendered yet. With the new blocking approach, the home screen renders after autoDetect completes, so this redundant re-render can be removed.

---

### Pitfalls & Failure Points

| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | **3s timeout is too short for cold proxy** — first request after idle can take 5-10s | autoDetect continues in background after timeout. When it completes, `_updateAIStatus()` updates the indicator. The user sees "AI offline" briefly, then it changes to "AI Online" when ready. |
| 2 | **Status bar text styling conflicts** — `statusBar.classList` add/remove may step on other callers | Wrap in a helper that saves/restores original text, same pattern as `toast()` already uses. |
| 3 | **`_ping()` also calls autoDetect and could trigger another goHome** | Already removed the `app.goHome(false)` from autoDetect, so _ping → autoDetect → goHome is no longer a risk. |
| 4 | **AI status indicator element doesn't exist when autoDetect finishes** — if autoDetect completes before goHome renders, `_updateAIStatus()` silently fails | Safe — it checks `document.getElementById()` and returns early if not found. When goHome renders later, it calls `_updateAIStatus()` at render time. |
| 5 | **`_showToast()` removal might break other callers** | Grep shows only `_showAIWelcome()` calls `_showToast()`. Safe to remove both. |
| 6 | **Status bar shows "Connecting to AI..." but user clicks Start before it resolves** | The Start button is enabled after the block. If the 3s timeout fires and shows "AI offline", user can still enter. AI-dependent games show their own error if needed. |
| 7 | **`Promise.race` never rejects** — the timeout path returns `'timeout'` string, not a rejection | The fallback setTimeout resolves with `'timeout'` string. The race always resolves. |

---

## Feature 5: AI Tutor Level in Story Mode

**Current:** Story Mode extracts level from `this.storyWords.map(w => w.level).find(Boolean)` — but vocab items have `tags` (array like `['N5']`), not a `level` property. So `storyLevel` is **always `null`**. The LLM prompt never gets a level hint — the AI generates at whatever its default is (likely intermediate/advanced).

**Target:** Story Mode should use the same level system as Chat Mode — extract level from vocab tags, fall back to `chatLevel` preference, and show a clickable level badge in the header.

### Step 1: Fix vocab-level extraction

**File:** `public/js/game_story_generator.js`  
**Line:** 85

**Current:**
```js
const storyLevel = this.storyWords.map(w => w.level).find(Boolean) || null;
```

**Target:** Use the same pattern as Grammar Gym (`game_grammar.js:111`):
```js
const jlptLevels = ['N5','N4','N3','N2','N1'];
const storyLevel = this.storyWords.map(function(w) {
    return (w.tags || []).find(function(t) { return jlptLevels.includes(t); });
}).find(Boolean) || app.store.prefs.chatLevel || 'B1';
```

This:
- Extracts JLPT level from `tags` array (same as Grammar Gym)
- Falls back to `chatLevel` preference (same as Chat Mode)
- Falls back to `'B1'` if nothing is set

### Step 2: Map JLPT to CEFR for the LLM prompt

The `buildStoryPrompt` in `llm_prompts.js` uses `LEVEL_DIFFICULTY_MAP` which already maps JLPT to CEFR descriptions (e.g., `'N5': 'beginner (N5)'`). Since `storyLevel` will now be a JLPT code like `'N5'`, the existing map handles it correctly — no change needed in prompts.

### Step 3: Add level badge to Story header

**File:** `public/js/game_story_ui.js`  
**Function:** `_setupStoryHeader()`

Add a clickable level badge next to the "Story" label, same style as Chat Mode's badge. The badge shows the current level (e.g., "N5" or "B1"). Clicking it opens a popover to change the level.

**Changes:**
1. Add `_storyLevel` property to Story constructor (default from `chatLevel` or `'B1'`)
2. In `_setupStoryHeader()`, add the badge HTML:
   ```html
   <span id="story-level-badge" class="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-neutral-700 dark:text-indigo-300 ring-1 ring-indigo-500/40 text-indigo-600 cursor-pointer active:scale-90 transition-all">N5</span>
   ```
3. Add `_setupStoryLevelPicker()` method — same popover logic as Chat's `_setupLevelPicker()`, but with JLPT levels (N5–N1) instead of CEFR (A1–C2), since Story Mode vocab is tagged with JLPT
4. When user changes level, update `this._storyLevel` and regenerate the story with the new level

### Step 4: Pass `_storyLevel` to generation

**File:** `public/js/game_story_generator.js`  
**Line:** 105

Change the `_generateStory()` call to pass `this._storyLevel` instead of the extracted `storyLevel`:

```js
await this._generateStory(this.storyWords, wordList, langName, this._storyLevel, lang);
```

### Step 5: Level descriptions for the popover

Since Story Mode vocab is tagged with JLPT (N5–N1) but the fallback is CEFR (A1–C2 from `chatLevel`), the popover must show **both** frameworks. The badge shows whichever is active.

| Level | Framework | Description |
|-------|-----------|-------------|
| N5 | JLPT | Beginner — basic grammar, simple sentences |
| N4 | JLPT | Elementary — everyday conversations, past tense |
| N3 | JLPT | Intermediate — opinions, newspaper headlines |
| N2 | JLPT | Upper intermediate — complex texts, nuanced speech |
| N1 | JLPT | Advanced — academic, professional, native-like |
| A1 | CEFR | Beginner — simple words, short sentences |
| A2 | CEFR | Elementary — past tense, everyday topics |
| B1 | CEFR | Intermediate — opinions, travel situations |
| B2 | CEFR | Upper intermediate — idioms, fluent topics |
| C1 | CEFR | Advanced — complex ideas, academic language |
| C2 | CEFR | Proficient — near-native, subtle nuance |

With a footnote: "JLPT for Japanese vocab, CEFR for general level"

---

## Pitfalls & Mitigations

### Pitfall 1: Only JLPT levels checked, not HSK/TOPIK/CEFR

**Problem:** The proposed fix only checks `['N5','N4','N3','N2','N1']`. If the user studies Chinese (HSK) or Korean (TOPIK), the level always falls back to `chatLevel` (B1). The badge shows "B1" even for HSK-tagged vocab.

**Mitigation:** Expand the tag check to include all framework levels:
```js
const frameworkLevels = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5'];
const storyLevel = this.storyWords.map(function(w) {
    return (w.tags || []).find(function(t) { return frameworkLevels.includes(t); });
}).find(Boolean) || app.store.prefs.chatLevel || 'B1';
```

### Pitfall 2: Multiple words may have different levels

**Problem:** `_pickWords(4)` picks 4 random words. Word A could be N5, Word B could be N3. `.find(Boolean)` returns the **first** match (N5), but the story needs to be appropriate for N3 (the hardest word). Using the easiest level means the story is too simple for harder words.

**Mitigation:** Use the **highest (hardest)** level instead of first match. Sort the found levels by difficulty and pick the last:
```js
const difficultyOrder = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5'];
const foundLevels = this.storyWords.map(function(w) {
    return (w.tags || []).find(function(t) { return difficultyOrder.includes(t); });
}).filter(Boolean);
const storyLevel = foundLevels.length > 0
    ? foundLevels.sort(function(a,b) { return difficultyOrder.indexOf(a) - difficultyOrder.indexOf(b); }).pop()
    : app.store.prefs.chatLevel || 'B1';
```

### Pitfall 3: `chatLevel` is CEFR, vocab tags are JLPT — popover must show both

**Problem:** `chatLevel` defaults to `'B1'` (CEFR). Vocab tags are `'N5'` (JLPT). If no vocab has JLPT tags, the badge shows "B1" but the popover (Step 5) only lists JLPT levels. The user can't select "B1" from the popover.

**Mitigation:** The popover shows both JLPT (N5–N1) and CEFR (A1–C2) levels. The badge displays whichever is active. When the user selects a level, it updates `this._storyLevel` directly (not `chatLevel`), so it doesn't interfere with Chat Mode's preference.

### Pitfall 4: Story header is crowded on mobile

**Problem:** Current header: admin delete, sparkle, dice, PTS score, close button = 5 elements. Adding a level badge = 6. On 375px mobile, this may overflow.

**Mitigation:** Reduce the PTS score display to a compact pill (remove "PTS" label, show just the number). The level badge is small (8px font, ~30px wide) and fits between the "Story" label and the action buttons.

### Pitfall 5: Level change requires regeneration

**Problem:** If user changes level via popover, the current story was generated at the old level. Auto-regenerating is slow (10-30s). Not regenerating means the badge changes but the story content doesn't match.

**Mitigation:** When the level changes, show a toast: "Level set to N3 — next story will use this level." The new level takes effect on the **next** story generation (sparkle/dice/next). The current story is not regenerated. This avoids the slow regeneration UX.

### Pitfall 6: Prefetch path has the same bug

**Problem:** `game_story_cache.js:91` has the same broken `w.level` extraction:
```js
const storyLevel = words.map(function(w) { return w.level; }).find(Boolean) || null;
```
If we fix `startStory()` but not `_prefetchNext()`, prefetched stories are still generated without a level hint.

**Mitigation:** Fix `_prefetchNext()` to use the same level extraction logic (Pitfall 1 + Pitfall 2), using `this._storyLevel` instead of re-extracting from words:
```js
// In _prefetchNext(), line 91:
// Before:
const storyLevel = words.map(function(w) { return w.level; }).find(Boolean) || null;
// After:
const storyLevel = this._storyLevel;
```

### Pitfall 7: Cached stories have no level metadata

**Problem:** `_nextCachedStory()` returns `{storyWords, storyPart, translation, questions, lang}` — no `level` field. If the user changes the level, cached stories (generated at the old level) are still served. The badge shows the new level, but the story content is at the old level.

**Mitigation:** Add a `level` field to the RTDB cache entry when saving (`_saveStoryToRTDB`). When loading from cache, store the cached level. The badge shows the cached level for cached stories, and the user's selected level for fresh generations. This is a **future enhancement** — for now, cached stories are served as-is and the badge shows the user's selected level.

### Pitfall 8: Popover only shows JLPT but fallback is CEFR

**Problem:** The popover lists N5–N1. But if vocab has no JLPT tags, the level falls back to `chatLevel` which is `'B1'` (CEFR). The badge shows "B1" but the popover has no "B1" option. User can't change it.

**Mitigation:** Already covered by Pitfall 3 — the popover includes both JLPT and CEFR levels. The active level is highlighted regardless of framework.

---

## Implementation Order

1. **Mic crash fix** (Feature 4) — highest priority, blocks usability
2. **Sticky bottom-scroll** (Feature 2) — improves UX immediately
3. **Typing indicator in message stream** (Feature 1) — visual polish
4. **Transcript save/load** (Feature 3) — persistence feature
5. **AI Tutor Level in Story Mode** (Feature 5) — consistency with Chat Mode
6. **Language-aware level extraction** (Feature 6) — use `_getLevelsForLang()` instead of hardcoded `difficultyOrder`
7. **Cancel audio + clear cache on language change** (Feature 7) — prevent stale TTS and wrong-language cached stories

---

## Feature 6: Language-Aware Level Extraction

**Bug:** `game_story_generator.js` used a hardcoded `difficultyOrder` array with all frameworks (JLPT, HSK, CEFR, TOPIK). Spanish vocab with `HSK5` tags showed wrong levels.

**Fix:** Replaced with `this._getLevelsForLang(lang)` which returns only the levels relevant to the target language.

**Files changed:** `public/js/game_story_generator.js` lines 86-92

---

## Feature 7: Cancel Audio + Clear Cache on Language Change

**Bug 1:** When changing language mid-session, old TTS kept playing because `startStory()` didn't call `app.audio.cancel()`.

**Bug 2:** Old cached stories from the previous language were still served because `_currentStoryLang` was never set in the cache path, so language-change detection never fired.

**Bug 3:** `_nextCachedStory()` returned `this._getTargetLang()` (current language) instead of the actual cached story's language, causing TTS to read Portuguese text with a Japanese voice.

**Fixes:**

### 7a: Cancel audio on story start
**File:** `public/js/game_story_generator.js` line 6
```js
if (app.audio) app.audio.cancel();
```

### 7b: Clear cache on language change (only if AI available)
**File:** `public/js/game_story_generator.js` lines 7-15
```js
var currentLang = this._getTargetLang();
if (this._currentStoryLang && this._currentStoryLang !== currentLang) {
    if (app.llm && app.llm.available && app.llm.hasModel) {
        this._cacheLoaded = false;
        this._cachedStories = [];
        this._cachedIndex = 0;
        this._prefetched = null;
    }
    this._currentStoryLang = null;
}
```
- AI online → clear cache, fresh generation in new language
- AI offline → keep old cache, serve whatever's available (wrong language is better than blank error)

### 7c: Set `_currentStoryLang` when serving from cache
**File:** `public/js/game_story_generator.js` line 27
```js
this._currentStoryLang = cached.lang;
```

### 7d: Return actual cached language from `_nextCachedStory()`
**File:** `public/js/game_story_cache.js` line 61
```js
lang: cached._lang || this._getTargetLang(),
```

### Use cases covered

| # | Scenario | Result |
|---|----------|--------|
| 1 | Change language mid-session (AI online) | Cache cleared, fresh generation in new language |
| 2 | First time entering Story mode | `_currentStoryLang` is null → no cache clearing |
| 3 | Navigate between cached stories (same language) | `_currentStoryLang` matches current language |
| 4 | Change language, then change back | Both changes detected, cache cleared each time |
| 5 | AI offline, cached stories exist, user changes language | Cache preserved, old stories served (wrong language but no error) |
| 6 | AI offline, no cached stories for new language | "AI Not Connected" error (acceptable) |
| 7 | `_nextCachedStory()` returns wrong language | Fixed — returns `cached._lang` |
| 8 | `_currentStoryLang` not set in cache path | Fixed — set when serving from cache |
| 9 | Prefetched story from old language | `_prefetched = null` clears stale data |
| 10 | Language changes during active generation | `_generationId` stale guard handles it |

---

## Feature 8: Fix HSK/TOPIK Display Issues

### 8a: Tag Filter — Show Only Relevant Frameworks for Current Language

**File:** `public/js/ui.js` lines 295-301

**Current:** The tag filter always shows all 5 groups (JLPT, HSK, CEFR, TOPIK, Frequency) regardless of what language the user is studying. A Spanish learner sees JLPT and HSK chips.

**Fix:** Filter groups by current language using `LEVEL_CONFIG.groups[].langs`, same pattern as `renderLevelFilter()` at line 211-212:

```js
var currentLang = app.store.prefs.presetTarget || app.store.prefs.chatLang || app.store.prefs.flashFront || app.store.prefs.sentencesQ || 'ja';
var groups = [
    { label: 'JLPT', tags: ['N5','N4','N3','N2','N1'], langs: ['ja','ja_furi','ja_roma'] },
    { label: 'HSK', tags: ['HSK1','HSK2','HSK3','HSK4','HSK5','HSK6'], langs: ['zh','zh_pin'], stripPrefix: 'HSK' },
    { label: 'CEFR', tags: ['A1','A2','B1','B2','C1'], langs: ['en','es','fr','de','it','pt','ru','ru_tr'] },
    { label: 'TOPIK', tags: ['TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','TOPIK6'], langs: ['ko','ko_roma'], stripPrefix: 'TOPIK' },
    { label: 'Frequency', tags: ['common','uncommon','rare'], langs: null }, // always show
];
var filteredGroups = groups.filter(function(g) {
    return !g.langs || g.langs.indexOf(currentLang) !== -1;
});
```

Then iterate `filteredGroups` instead of the hardcoded groups array.

### 8b: Add TOPIK6 to Tag Filter Groups

**File:** `public/js/ui.js` line 299

**Current:**
```js
{ label: 'TOPIK', tags: ['TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5'], stripPrefix: 'TOPIK' },
```

**Fix:** Add `'TOPIK6'`:
```js
{ label: 'TOPIK', tags: ['TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','TOPIK6'], stripPrefix: 'TOPIK' },
```

### 8c: Add TOPIK6 to `getAllTags()` Sort Order

**File:** `public/js/data.js` line 106

**Current:**
```js
const order = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','common','uncommon','rare'];
```

**Fix:** Add `'TOPIK6'` after `'TOPIK5'`:
```js
const order = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','TOPIK6','common','uncommon','rare'];
```

### 8d: Update Exam Level Tooltip to Explain Frameworks

**File:** `public/js/ui.js` line 304

**Current:**
```html
<div id="exam-level-tooltip" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg max-w-[220px]">Levels are approximate — not all entries have every framework tag</div>
```

**Fix:** Replace with a tooltip that explains each framework:
```html
<div id="exam-level-tooltip" class="hidden fixed z-50 bg-slate-800 text-white text-[10px] rounded-lg px-4 py-3 shadow-lg max-w-[280px] w-auto leading-relaxed">
  <p class="mb-1"><strong class="text-indigo-300">JLPT</strong> — Japanese-Language Proficiency Test (N5→N1)</p>
  <p class="mb-1"><strong class="text-indigo-300">HSK</strong> — Hanyu Shuiping Kaoshi (HSK1→HSK6)</p>
  <p class="mb-1"><strong class="text-indigo-300">TOPIK</strong> — Test of Proficiency in Korean (TOPIK1→TOPIK6)</p>
  <p class="mb-1"><strong class="text-indigo-300">CEFR</strong> — Common European Framework (A1→C2)</p>
  <p class="text-slate-400 mt-1">Not all entries have every framework tag.</p>
</div>
```

### 8e: Remove Stale Footnote from Level Filter

**File:** `public/js/ui.js` line 262

**Current:**
```js
html += `<p class="text-[8px] text-slate-400 dark:text-neutral-600 mt-1 italic">TOPIK &amp; CEFR levels are approximated from JLPT proficiency</p></div>`;
```

**Fix:** Remove this line entirely — the app now has real HSK, TOPIK, and CEFR tags in the vocab data.

### 8f: Prevent Chip Wrapping in Level Filter

**File:** `public/js/ui.js` line 255

**Current:**
```js
html += `<button data-level="${lvl}" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${btnClass}" style="${style}">${lvl}</button>`;
```

**Fix:** Add `whitespace-nowrap` to prevent wrapping:
```js
html += `<button data-level="${lvl}" class="level-filter-btn px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 whitespace-nowrap ${btnClass}" style="${style}">${lvl}</button>`;
```

### 8g: Apply Viewport-Clamped Positioning to Exam Level Tooltip

**File:** `public/js/ui.js` lines 327-333

**Current:** The tooltip uses `fixed` positioning with `translateX(-50%)` — same pattern as the old chat tooltip that overflowed on mobile.

**Fix:** Replace with `requestAnimationFrame` + viewport clamping, same as the chat tooltip fix:

```js
infoIcon.onclick = function(e) {
    e.stopPropagation();
    tooltip.classList.toggle('hidden');
    if (tooltip.classList.contains('hidden')) return;
    requestAnimationFrame(function() {
        var rect = infoIcon.getBoundingClientRect();
        var tw = tooltip.offsetWidth;
        var th = tooltip.offsetHeight;
        var left = rect.left + rect.width / 2 - tw / 2;
        var top = rect.bottom + 4;
        if (left + tw > window.innerWidth) left = window.innerWidth - tw - 8;
        if (left < 8) left = 8;
        if (top + th > window.innerHeight) top = rect.top - th - 4;
        if (top < 8) top = 8;
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.transform = 'none';
    });
};
```

---

## Feature 8: Pitfalls & Mitigations

### Pitfall 1: Language detection inconsistency between tag filter and level filter

**Problem:** The tag filter (Feature 8a) would use `presetTarget` for language detection, but the level filter (`renderLevelFilter()` at `ui.js:211-212`) uses a different check: `p.flashFront === l || p.flashBack1 === l || ...`. If a user has `flashFront='ja'` but `presetTarget='ko'`, the two filters would show different frameworks.

**Mitigation:** Use the same language detection function for both filters. Extract a shared helper:
```js
function _getActiveLang() {
    var p = app.store.prefs;
    return p.presetTarget || p.chatLang || p.flashFront || p.sentencesQ || 'ja';
}
```
Use this in both `renderTagFilter()` and `renderLevelFilter()` instead of each having its own logic.

### Pitfall 2: Tag filter only renders on home screen

**Problem:** `renderTagFilter()` is called from `goHome()` inside `requestAnimationFrame`. If the language changes while a game is active (not on home screen), the tag filter isn't visible — it only renders on the home screen. The change takes effect when the user returns home.

**Mitigation:** This is acceptable behavior. The tag filter is a home-screen-only UI element. When the user returns to home, `goHome()` calls `renderTagFilter()` which picks up the current language. No code change needed.

### Pitfall 3: `getLevelBadge()` in game headers only checks JLPT

**Problem:** `game_core.js:397` only checks JLPT levels for the colored badge in game headers:
```js
const jlptLevels = ['N5','N4','N3','N2','N1'];
const level = tags.find(t => jlptLevels.includes(t));
```
HSK, TOPIK, and CEFR levels get no badge. Same for Grammar Gym's level extraction at `game_grammar.js:111`.

**Mitigation:** Expand the check to include all frameworks:
```js
const frameworkLevels = ['N5','N4','N3','N2','N1','HSK1','HSK2','HSK3','HSK4','HSK5','HSK6','A1','A2','B1','B2','C1','TOPIK1','TOPIK2','TOPIK3','TOPIK4','TOPIK5','TOPIK6'];
const level = tags.find(t => frameworkLevels.includes(t));
```
This is a **separate fix** from Feature 8 — it affects game headers, not the filter UI. Can be done as a follow-up.

### Pitfall 4: TOPIK6 already exists in `LEVEL_CONFIG` and `LEVEL_DIFFICULTY_MAP`

**Problem:** TOPIK6 is already defined in `config.js:75` and `llm_service.js:411`, but was missing from the tag filter group and sort order. Adding it is safe and consistent — no conflicts.

**Mitigation:** None needed. The addition is purely additive and matches existing data.

### Pitfall 5: Frequency group always shows even if no frequency tags exist

**Problem:** The Frequency group has `langs: null` (always show), but if the vocab data has no frequency tags (`common`, `uncommon`, `rare`), the group is skipped by the existing `existingTags` filter at `ui.js:310`.

**Mitigation:** This is correct behavior — the `existingTags` filter handles it. No code change needed.

### Pitfall 6: Removing the stale footnote is safe

**Problem:** The footnote at `ui.js:262` says "TOPIK & CEFR levels are approximated from JLPT proficiency." This is only in the level filter, not the tag filter. Need to verify it's not referenced elsewhere.

**Mitigation:** Grep confirms the footnote text only appears in `ui.js:262`. Removing it is safe.

### Pitfall 7: Tooltip click-outside listener may conflict with other click-outside listeners

**Problem:** The exam level tooltip has a `document.addEventListener('click', ...)` listener (ui.js:304-309). If the user opens the exam tooltip and then opens the chat info tooltip (or vice versa), both click-outside listeners fire. This is fine — each only closes its own tooltip.

**Mitigation:** None needed. The listeners are scoped to their respective tooltip IDs and don't interfere.

---

## Implementation Order

1. **Mic crash fix** (Feature 4) — highest priority, blocks usability
2. **Sticky bottom-scroll** (Feature 2) — improves UX immediately
3. **Typing indicator in message stream** (Feature 1) — visual polish
4. **Transcript save/load** (Feature 3) — persistence feature
5. **AI Tutor Level in Story Mode** (Feature 5) — consistency with Chat Mode
6. **Language-aware level extraction** (Feature 6) — use `_getLevelsForLang()` instead of hardcoded `difficultyOrder`
7. **Cancel audio + clear cache on language change** (Feature 7) — prevent stale TTS and wrong-language cached stories
8. **Fix HSK/TOPIK display issues** (Feature 8) — framework-aware tag filter, TOPIK6, tooltip, wrapping
