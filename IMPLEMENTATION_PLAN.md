# VocabMaster Code Audit — Implementation Plan

## 🔴 CRITICAL

### C1: Firebase Service Account Key in Git History
- **Effort:** Medium (lines of code: 4)
- **Risk:** HIGH — live key with Firebase Admin access
- **Dependencies:** Firebase Console access to revoke key

#### Steps:
1. **Immediately** go to [Firebase Console](https://console.firebase.google.com/project/vocabmaster112225/settings/serviceaccounts/adminsdk) and **revoke/delete** the service account key (`vocabmaster112225-1e8a10d5f0a9.json`)
2. Stop exposing via git: `git rm --cached vocabmaster112225-1e8a10d5f0a9.json`
3. Add to `.gitignore` (already has pattern but confirm): `echo "vocabmaster112225-*.json" >> .gitignore`
4. Purge from all git history using `git filter-repo` or BFG:
   ```bash
   git filter-repo --path vocabmaster112225-1e8a10d5f0a9.json --invert-paths
   ```
5. Force-push all branches after purge
6. Generate a new service account key and store it in GitHub Secrets / Firebase Config (never in repo)
7. Update `scripts/sync-env.js` to read from env vars or a secure config path instead of `.env` for service account keys

#### Validation:
- Verify `git log --all -- vocabmaster112225-1e8a10d5f0a9.json` returns nothing
- Verify Firebase Admin SDK still works with new key

---

### C2: API Keys Exposed as `window.*` Globals
- **Effort:** Large (affects architecture)
- **Risk:** MEDIUM — requires XSS to exploit but widespread exposure
- **Dependencies:** C1 (key revocation)

#### Options (pick one):

**Option A — Proxy all LLM calls through Firebase Function (recommended)**
1. The existing `ollamaProxy` Firebase Function already supports proxying. Ensure it's the **only** route used in production.
2. Set `window.OLLAMA_PROXY_URL` as the default (already exists at `llm.js:28`)
3. Remove direct endpoint configuration from client settings UI (keep local-only for development)
4. The Firebase function holds the API key server-side, client never sees it

**Option B — Strip API keys from generated JS, load after auth**
1. Remove `window.ZEN_API_KEY` from `ollama_config.js`
2. After user authenticates (Firebase Auth), fetch API key from Firestore/RTDB
3. Cache in memory only (not localStorage)
4. This still exposes key at runtime but only to authenticated users

**Option C — Accept the risk (if app runs only on-device via Android APK)**
- Document that API keys are only safe when running via Capacitor APK (not web)
- Add a warning in settings UI: "API keys are visible to browser extensions"

#### Validation:
- Verify `window.ZEN_API_KEY` is not readable from browser devtools console (if Option A/B)

---

### C3: Plain-Text API Keys in `.env`
- **Effort:** Small
- **Risk:** LOW (`.env` is gitignored)
- **Dependencies:** C2

#### Steps:
1. Document in `.env.example` (create if missing) with placeholder values only
2. Add `.env` to `.gitignore` (already done — confirm with `git check-ignore .env`)
3. Add comment at top of `.env`: `# WARNING: Never commit this file. Never share these keys.`
4. Ensure `scripts/sync-env.js` warns if `.env` has world-readable permissions
5. Recommend OS keychain for local development

#### Validation:
- `git check-ignore .env` returns the path
- Running `git add .env` is rejected (dry run)

---

## 🟠 HIGH

### H1: `loadPrefs()` No Guard on `app.store`
- **Effort:** Trivial (1 line)
- **File:** `public/js/llm.js:192`

#### Steps:
```diff
- const p = app.store.prefs;
+ const p = (typeof app !== 'undefined' && app && app.store && app.store.prefs) ? app.store.prefs : {};
```
Or more concisely:
```diff
- const p = app.store.prefs;
+ const p = app?.store?.prefs || {};
```
(Optional chaining may need transpilation if supporting older Android WebViews — test first.)

#### Validation:
- `app.store.prefs` access is guarded in all code paths
- Starting the app before store init doesn't crash

---

### H2: `_callZenCompletion()` — No JSON Parse Timeout
- **Effort:** Trivial (5 lines)
- **File:** `public/js/llm.js:187`

#### Steps:
```diff
- const data = await resp.json();
+ const data = await Promise.race([
+     resp.json(),
+     new Promise((_, reject) =>
+         setTimeout(() => reject(new Error('Zen JSON parse timeout')), 10000)
+     )
+ ]);
```

#### Validation:
- Unit test with a slow JSON response
- Error message includes "Zen JSON parse timeout"

---

### H3: `game_grammar.js` Untracked
- **Effort:** Trivial
- **Files:** `public/js/game_grammar.js`, `android/app/src/main/assets/js/game_grammar.js`

#### Steps:
```bash
git add public/js/game_grammar.js
git add android/app/src/main/assets/js/game_grammar.js
```
(Only if these files should be part of the project. If Grammar Gym is experimental, decide whether to track or gitignore.)

#### Validation:
- `git status` shows no `??` for these files

---

### H4: `additionalProperties: false` Causes Full Rejection on Extra LLM Fields
- **Effort:** Small (2-3 lines)
- **File:** `public/js/llm.js:1233` (grammarExercise schema)

#### Options:

**Option A — Remove `additionalProperties: false` from exercise items (recommended)**
```diff
- additionalProperties: false
```
Remove it from the exercise item schema (line 1233). The `required` array already ensures all mandatory fields are present. Extra fields are harmless — they just get ignored by the renderer.

**Option B — Strip unknown fields after validation**
In `validate()` method, after validation passes, strip any fields not in the schema's `properties` list before returning.

#### Validation:
- LLM response with `"id": 123` or `"hint": "..."` passes validation
- The 12 exercises render correctly ignoring extra fields

---

### H5: `sync-env.js` Parsing Brittle
- **Effort:** Small
- **File:** `scripts/sync-env.js`

#### Steps:
1. Install `dotenv`: `npm install dotenv`
2. Rewrite parsing:
   ```js
   require('dotenv').config({ path: envPath });
   // process.env now has all values with proper quoting/escaping
   ```
   Or if avoiding dependencies, improve the manual parser:
   ```js
   function parseEnv(raw) {
     const result = {};
     for (const line of raw.split('\n')) {
       const trimmed = line.trim();
       if (!trimmed || trimmed.startsWith('#')) continue;
       const eq = trimmed.indexOf('=');
       if (eq === -1) continue;
       const key = trimmed.slice(0, eq).trim();
       let val = trimmed.slice(eq + 1).trim();
       if ((val.startsWith('"') && val.endsWith('"')) ||
           (val.startsWith("'") && val.endsWith("'"))) {
         val = val.slice(1, -1);
       }
       result[key] = val;
     }
     return result;
   }
   ```
3. Add warning if `.env` is missing:
   ```js
   if (!fs.existsSync(envPath)) {
     console.warn('⚠ .env not found at', envPath, '— using defaults only');
   }
   ```

#### Validation:
- `.env` with `KEY="value with spaces"` parses correctly
- `.env` with `KEY=value'with'quotes` parses correctly
- Missing `.env` warns but doesn't crash
- Generated `ollama_config.js` is valid JS

---

## 🟡 MEDIUM

### M1: Move "Alternate A/B" Instruction in Grammar Prompt
- **Effort:** Trivial (1 line moved)
- **File:** `public/js/llm.js:1700-1704`

#### Steps:
Move the instruction from the TONE RULES section to right before the JSON template:
```
OUTPUT ONLY THIS JSON (no extra text, no markdown):
IMPORTANT: The correct answer MUST alternate between "A" and "B". Do NOT always pick "A".
{
  "grammar": ...
```

#### Validation:
- Generated exercises have a mix of A and B answers (statistical check over multiple generations)

---

### M2: Harden Model Filtering
- **Effort:** Small
- **File:** `public/js/llm.js:43-46`

#### Options:
- **Do nothing** — current heuristic works for all known model names
- Add explicit allowlist: prefer models from `this.availableModels` that explicitly match known local models
- Use endpoint-based detection: if endpoint is `localhost` or `127.0.0.1`, don't filter at all

#### Steps (if implementing):
```diff
- return all.filter(m => !s.includes('cloud') && !s.includes('ollama.com'));
+ if (this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1')) {
+   return all; // local endpoint — trust whatever ollama4android reports
+ }
+ return all.filter(m => !s.includes('ollama.com'));
```

---

### M3: Add "Test Backup Connection" Button
- **Effort:** Small
- **Files:** `public/js/ui_llm.js`, `public/js/llm.js`

#### Steps:
1. Add a method to `LLMService`:
   ```js
   async testZenConnection() {
     if (!this.zenApiKey) return { ok: false, error: 'No API key configured' };
     try {
       const resp = await this._fetch(this.zenEndpoint + '/models', {
         headers: { 'Authorization': 'Bearer ' + this.zenApiKey }
       });
       const data = await resp.json();
       return { ok: resp.ok, models: data?.data?.length || 0 };
     } catch (e) {
       return { ok: false, error: e.message };
     }
   }
   ```
2. Add a button in settings HTML:
   ```html
   <button onclick="app.llm.testZenConnection().then(r => alert(r.ok ? 'Connected (' + r.models + ' models)' : 'Failed: ' + r.error))" ...>Test Backup</button>
   ```

#### Validation:
- Button shows "Connected" with model count or error message

---

### M4: Validate `zenEndpoint` URL
- **Effort:** Trivial
- **File:** `public/js/preferences_registry.js:90`

#### Steps:
```diff
- { key: 'zenEndpoint', type: 'text', ... }
+ { key: 'zenEndpoint', type: 'url', ... }
```
If `type: 'url'` is not supported by the preferences system, add client-side validation:
```js
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}
```

#### Validation:
- Entering `not-a-url` shows validation error
- Entering `https://opencode.ai/zen/go/v1/chat/completions` passes

---

### M5: Accept 2-4 Choices in Grammar Exercises
- **Effort:** Small
- **File:** `public/js/llm.js:1217-1218`

#### Steps:
```diff
- minItems: 2, maxItems: 2,
+ minItems: 2, maxItems: 4,
```
Update renderer in `game_grammar.js:144` to handle variable number of choices:
```js
const choicesHtml = ex.choices.map(ch => {
  // ... existing code handles any number of choices via .map()
}).join('');
```

#### Validation:
- LLM response with 3 choices renders all 3 buttons
- 2-choice exercises still work

---

### M6: Warn if `.env` Has World-Readable Permissions
- **Effort:** Trivial
- **File:** `scripts/sync-env.js`

#### Steps:
```js
const stat = fs.statSync(envPath);
const mode = stat.mode & 0o777;
if (mode & 0o004) {
  console.warn('⚠ .env is world-readable (mode', mode.toString(8), '). Run: chmod 600 .env');
}
```

---

## 🟢 LOW

### L1: Export ZEN_ENDPOINT/ZEN_MODEL Even Without ZEN_API_KEY
- **Effort:** Trivial
- **File:** `scripts/sync-env.js`

#### Steps:
```diff
- if (env.ZEN_API_KEY) {
+ // Always export Zen endpoint/model if configured, even without API key
+ if (env.ZEN_ENDPOINT || env.ZEN_MODEL || env.ZEN_API_KEY) {
```
This lets the UI pre-fill endpoint and model fields even if the user hasn't entered the key yet.

---

### L2: Deduplicate `.env` in `.gitignore`
- **Effort:** Trivial

#### Steps:
Remove duplicate `.env` line from `.gitignore` (there are two — lines 76 and 86).

---

### L3: Fix `ollama_config.js` Permissions
- **Effort:** Trivial

#### Steps:
Add to `scripts/sync-env.js`:
```js
fs.chmodSync(configPath, 0o600); // owner read/write only
```

---
