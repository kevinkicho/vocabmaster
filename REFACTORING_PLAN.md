# Refactoring & Hygiene Plan

**Purpose**: Address the push-back items from the June 2026 code review. These are maintainability, safety, and hygiene fixes — not new features. Tracked separately from `IMPLEMENTATION_PLAN.md` (which holds feature work).

**Status as of 2026-06-17**: All items below are **NOT STARTED**. This file is the plan only.

**Principles**:
- Each item is independently shippable — no cross-dependencies.
- Order is by risk/impact: safety first (P1), then maintainability (P2), then hygiene (P3).
- Every item ends with a verification step (build + smoke test).
- No new dependencies. No new test frameworks. Use what's already here (Vitest + Playwright + `check_critical.js`).

---

## P1 — Safety & Correctness

### R1: Soften Global Error Hook

**File**: `public/js/main.js:4-11`

**Problem**: `window.onerror` and `unhandledrejection` both call `app.goHome(false)`. This silently resets users to home on *any* unhandled promise — including ones that are genuinely fatal and should surface a message. It also hides bugs from you during development by wiping the screen state.

**Current**:
```js
window.onerror = (msg, url, line) => {
  console.error(`Global: ${msg} (${url}:${line})`);
  if(app && app.goHome) app.goHome(false);
};
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled Promise:', e.reason);
  if(app && app.goHome) app.goHome(false);
});
```

**Target**: Distinguish recoverable from fatal. Log to the in-app debug buffer (already exists via `L()`). Only go home for errors thrown *during* a game session — never wipe the home screen itself.

**Changes**:
1. Add a guard: only call `goHome(false)` if `app.game` is non-null (i.e., a game is active). Errors on the home screen or settings modal should not reset the view.
2. Tag known fatal inits so they're not auto-recovered. Introduce `app._fatalError` (already half-wired at `main.js:27`) — if set, the hook shows an error toast instead of going home.
3. Route both hooks through a single `_handleUncaught(label, detail)` helper so behavior is consistent.
4. In dev mode (`?debug=1` or `VM_DEBUG`), show a non-blocking toast with the error message so you actually see what's failing instead of being silently reset.

**Target code**:
```js
function _handleUncaught(label, detail) {
  console.error(`[${label}]`, detail);
  try { L('UNCAUGHT', label, detail); } catch (_) {}
  if (app && app._fatalError) {
    // Already in a broken-init state — surface it, don't loop-reset.
    if (app.ui) app.ui.showToast('Fatal: ' + (detail && detail.message || detail), 'error');
    return;
  }
  // Only auto-recover when a game is mid-flight; home/settings can stay put.
  if (app && app.game && app.goHome) {
    if (app.ui) app.ui.showToast('Recovered from an error — returned home', 'error');
    app.goHome(false);
  }
}
window.onerror = (msg, url, line) => _handleUncaught('window.onerror', `${msg} (${url}:${line})`);
window.addEventListener('unhandledrejection', (e) => _handleUncaught('unhandledrejection', e.reason));
```

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | Some games currently rely on the hook to escape soft-crash states | Keep the `app.game`-based recovery — it preserves that escape hatch, just stops over-triggering |
| 2 | `L()` may not be defined yet when the hook fires during early load | Wrap in try/catch (done in target code) |
| 3 | Toast may not be ready during early load | `app.ui` null-guarded; falls back to console only |
| 4 | `e.reason` may be a non-Error object (string, undefined) | `_handleUncaught` stringifies via template literal — safe |

**Verify**: `npm run validate:critical` + manual: trigger a bad `await` in a game (temp) → confirm toast + return home; trigger one on home screen → confirm no reset, toast appears.

---

### R2: Surface Constructor Init Failures

**File**: `public/js/main.js:23-38`

**Problem**: Each service constructor is wrapped in try/catch that swallows the error and logs it. If `AudioService` or `LLMService` construction throws, `this.audio = undefined`, and the next `this.audio.cancel()` throws again — now swallowed by the global hook. This creates cascading silent failures.

**Current**:
```js
try { this.audio = new AudioService(); } catch(e) { L("Audio constructor failed:", e); }
try { this.data = new DataService(); } catch(e) { L("Data constructor failed:", e); }
// ... 7 more like this
```

**Target**: Mark failed services explicitly. Downstream code can null-check instead of throwing. Surface a user-visible banner if a *critical* service (data, llm, auth) fails.

**Changes**:
1. Wrap the 9 try/catches in a single helper `_initService(name, factory, critical)` that:
   - Returns the instance or `null` on failure
   - Records failures on `this._failedServices = {}` (name → error)
   - For `critical: true` services, sets `this._fatalError = true` and throws to the caller (so init() can show the fatal screen)
2. Mark `store`, `auth`, `data`, `llm` as critical. `audio`, `notes`, `fitter`, `celebration`, `analytics`, `presets` are non-critical (degrade gracefully).
3. Audit call sites of each service for `undefined` access. The riskiest are `app.audio.cancel()` (called from many places) and `app.llm.*`. Add a one-liner guard pattern at the top of each method: `if (!app.audio) return;` — or, cleaner, make `app.audio` a no-op stub when construction fails so callers don't need guards.

**Target code (sketch)**:
```js
this._failedServices = {};
const init = (name, fn, critical) => {
  try { const v = fn(); this[name] = v; return v; }
  catch (e) {
    L(`${name} constructor failed:`, e);
    this._failedServices[name] = e;
    if (critical) {
      this._fatalError = true;
      try { this.ui && this.ui.showToast(`Fatal: ${name} failed to start — ${e.message}`, 'error'); } catch (_) {}
    }
    // Provide a no-op stub so callers don't throw on undefined access.
    this[name] = this._noopService(name);
    return null;
  }
};
init('store',      () => new Store(),         true);
init('ui',         () => new UIManager(this.store), false);
init('auth',       () => new AuthManager(),   true);
init('audio',      () => new AudioService(),  false);
init('data',       () => new DataService(),   true);
init('notes',      () => new NoteService(),   false);
init('fitter',     () => new TextFitter(),     false);
init('celebration',() => new CelebrationService(), false);
init('analytics',  () => new AnalyticsService(), false);
init('llm',        () => new LLMService(),    true);
init('presets',    () => new PresetManager(), false);
```

**No-op stub**: A tiny object with trap-no-op methods for the common service surfaces (`cancel()`, `play()`, `recordAttempt()`, etc.). Build it once, reuse for any failed service. This is the safer alternative to scattering `if (app.audio)` guards across 30 call sites.

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | No-op stub must cover every public method callers use | Audit via `rg 'app\.(audio|llm|data|auth)\.\w'` — list every method called; stub covers those |
| 2 | Critical services failing means app is unusable — user needs a clear message | `_fatalError` already triggers the "No vocabulary loaded" red banner path; extend it |
| 3 | `this.ui` is itself constructed in the loop — if it fails, toast won't show | `_fatalError` is still set; `init()` falls back to `console.error` |
| 4 | Existing code may check `if (app.llm)` (truthy) — no-op stub is truthy | That's fine — calls become no-ops instead of crashes; behavior is "graceful degradation" |
| 5 | `window._initLearningLoop` call at line 40 assumes services exist | Guard it: `if (typeof window._initLearningLoop === 'function' && !this._fatalError)` |

**Verify**: `npm run validate` (310/310 expected) + manual: temporarily break one constructor (e.g., throw in `AudioService` ctor) → confirm app still loads, audio silently no-ops, banner shows for critical breakage.

---

## P2 — Maintainability

### R3: Split `ui.js` (1393 lines)

**File**: `public/js/ui.js` (largest JS file in the codebase)

**Problem**: `ui.js` holds `header()`, `audioBar()`, `loadSettings()`, theme/font/preset/celebration renderers, level/tag filters, AI settings injection, tooltip positioning, and more. It's the only file that didn't get split when `ui_settings.js`, `ui_stats.js`, `ui_llm.js`, `ui_modals.js` were carved out.

**Target**: Split into focused modules under `public/js/`. Each <300 lines. No behavior changes — pure extraction.

**Proposed split** (based on grep of `ui.js` contents):
| New file | Contents | Est. lines |
|----------|----------|------------|
| `ui.js` (slimmed) | `UIManager` class shell, constructor, `header()`, `audioBar()`, `nav()`, `showToast()`, shared helpers | ~250 |
| `ui_home.js` | `renderTagFilter()`, `renderLevelFilter()`, `getLevelBadge()`, exam-level tooltip positioning, `_getActiveLang()` helper | ~350 |
| `ui_themes.js` | Theme grid, font family/style/weight controls, `applyTheme()` renderer | ~200 |
| `ui_celebrations.js` | Celebration/confetti effect toggles + per-effect enable/disable UI | ~150 |
| `ui_presets.js` | Preset grid rendering, preset apply button, first-run banner | ~200 |
| `ui_settings.js` (extend existing) | Absorb the remaining `renderFlashcardSettings`, `renderQuizSettings`, etc. that currently live in `ui.js` | +250 |

**Pattern** (matches existing `ui_settings.js`, `ui_stats.js`): Each file attaches methods to `UIManager.prototype` after the class is defined. No ES module imports — this is a no-bundler codebase, so file order in `index.html` matters. The `UIManager` class must be defined before any `ui_*.js` that extends its prototype.

**Implementation steps**:
1. Read `ui.js` end-to-end, build a function-to-file map (which function goes where).
2. Add the new `<script>` tags to `index.html` in the correct order (after `ui.js`, before `main.js`).
3. Move functions one file at a time. After each move: `npm run validate:critical` + smoke test in browser (open app, exercise settings + home filters).
4. Keep `ui.js`'s top-of-file comment block listing which sub-files exist (mirror the LLM pipeline's pattern in `llm_service.js:1-21`).
5. Final: `npm run build:css` (in case any Tailwind classes move with the code — they shouldn't, but rebuild is free insurance).

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | `const`/`let`/`class` don't cross `<script>` boundaries (AGENTS.md rule) | Use `UIManager.prototype.fn = ...` (var-like) — methods, not lexically-scoped consts |
| 2 | Script load order breaks if `UIManager` not defined first | `ui.js` must be the first `ui_*.js` loaded; verify in `index.html` |
| 3 | Private-by-convention helpers (`_foo`) may be called across files | Grep each moved function for callers; if a caller is in a file that stays in `ui.js`, the prototype method still resolves — no issue |
| 4 | `this` binding in event handlers | Existing code already uses `.bind(this)` or arrow functions — preserve as-is on move |
| 5 | Dark mode classes / Tailwind purging | Run `npm run build:css` after the split — Tailwind scans source files; moved classes still scan because they're still in `public/js/*.js` |
| 6 | `check_critical.js` regex patterns may break if functions move | Run it after each file split; update patterns if needed (it greps `public/js/*.js` recursively so paths don't matter) |
| 7 | Test files may reference `ui.js` internals by path | `tests/` only tests public APIs via `new Function` eval — should be unaffected. Verify with `npm test`. |

**Verify**: `npm run validate` (310/310) + Playwright `app.spec.js` (smoke) + manual click-through: settings modal, home filters, theme picker, preset apply, celebrations.

---

### R4: Document or Split `game_chat.js` (758 lines)

**File**: `public/js/game_chat.js` — undocumented in README's file table, second-largest JS file.

**Problem**: README's "File Structure" table skips it entirely. It's also the file where Features 1-4 (mic crash, sticky scroll, typing indicator, transcript save) live, but those aren't documented anywhere except indirectly in `docs/current-status-and-roadmap.md` narrative.

**Target**: Two-part fix.

**Part A — Document**: Add `game_chat.js` to README's file table with a one-line purpose. Add a header comment to the file itself (matching the pattern in `llm_service.js:1-21`) listing its responsibilities and the features it implements.

**Part B — Split (lower priority, defer unless it grows)**: If R3 goes smoothly and the file is still hard to navigate, split along natural seams:
- `game_chat.js` (slimmed) — `ChatMode` class shell, constructor, render, send/receive loop, memory summaries
- `game_chat_ui.js` — bubble rendering, markdown rendering (snarkdown), typing indicator, dark mode badge, tooltip
- `game_chat_stt.js` — SpeechRecognition setup, locale mapping, mic button handling

Defer the split until after R3 is done. Only split if the file keeps growing or if a reviewer can't trace a bug in <2 min.

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | Chat features (1-4) are working — risk of regression from split is high vs. reward | Document first; split only if file grows past 1000 lines or gets unwieldy |
| 2 | README table is the source of truth for "what's in this repo" | Keep it in sync with any future splits |

**Verify**: `npm run validate:critical` + manual: open Chat mode, send a message, use mic, verify typing indicator + scroll behavior.

---

### R5: Normalize JS Style in `llm_service.js`

**File**: `public/js/llm_service.js`

**Problem**: Uses `function () {}.bind(this)` extensively while peer files (and the rest of the codebase) use arrow functions. Inconsistent and harder to read.

**Target**: Convert all `function () {}.bind(this)` to arrow functions. Convert `var` to `const`/`let` where the value isn't reassigned. No behavior changes.

**Changes**:
1. Grep `llm_service.js` for `function` + `.bind(this)` patterns.
2. Replace with arrow functions (`() => {}`).
3. Replace `var x = ...` (where `x` isn't reassigned) with `const x = ...`.
4. Run `npm run validate` to confirm nothing broke.

**Example**:
```js
// Before
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        this._ping();
    }
}.bind(this));

// After
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') this._ping();
});
```

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | Arrow functions don't have their own `arguments` object | Grep for `arguments` usage in this file — if any, leave those as `function` |
| 2 | Arrow functions can't be used with `new` | None of these are constructors — safe |
| 3 | `this` binding changes inside arrow vs `.bind(this)` — both bind to enclosing `this` | Identical behavior; this is a safe mechanical change |

**Verify**: `npm run validate` + manual: trigger LLM connection (Settings → AI → Retry), confirm `_ping` still fires on `visibilitychange`.

---

## P3 — Repo Hygiene

### R6: Remove Stray Files from Repo Root

**Problem**: Repo root has clutter that shouldn't be there:
- `nul` — Windows `> nul` redirect artifact (empty file accidentally created)
- `test.html` — stray test page at root (real tests are in `tests/` and `tests-e2e/`)
- `SENSITIVITY_ANALYSIS_PLAN.md`, `SENSITIVITY_DELAYS.md`, `SENSITIVITY_DIFFICULTY.md`, `SENSITIVITY_MATCH.md`, `SENSITIVITY_SCORING.md` — 5 planning docs (584 lines total) cluttering root

**Target**:
1. Delete `nul` and `test.html` (verify they're not referenced first).
2. Move `SENSITIVITY_*.md` into `docs/` — they're planning docs, belong with the rest.
3. Update any references to the moved files (grep `SENSITIVITY_` across `.md` files).

**Changes**:
```bash
# Verify nul is empty/junk
wc -c nul   # expect 0 or tiny
# Verify test.html isn't loaded anywhere
rg 'test\.html' --type-add 'web:*.{html,js,md,json}' -t web
# Move sensitivity docs
git mv SENSITIVITY_ANALYSIS_PLAN.md docs/
git mv SENSITIVITY_DELAYS.md docs/
git mv SENSITIVITY_DIFFICULTY.md docs/
git mv SENSITIVITY_MATCH.md docs/
git mv SENSITIVITY_SCORING.md docs/
# Delete junk
git rm nul test.html
```

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | `nul` is a reserved name on Windows — `rm` may fail | Use `git rm -- -nul` or `rm -- -nul` (the `--` stops flag parsing); alternatively `del \\?\C:\...\nul` from cmd |
| 2 | `test.html` might be a manual test harness someone uses | Grep for references first; if it's standalone and unused, delete |
| 3 | SENSITIVITY docs may reference each other by relative path | After move, grep for `SENSITIVITY_` in `.md` files and fix any relative links |
| 4 | README's doc list at the bottom may reference these | README line 230-239 lists `docs/` files — add the moved files there |

**Verify**: `git status` clean except intended moves; `npm run validate:critical` still passes; no broken links in `docs/`.

---

### R7: Consolidate Test Directories

**Problem**: Test layout is fragmented and confusing:
- `tests/` — Vitest unit tests + standalone audit scripts (some committed)
- `tests-e2e/` — Playwright specs (committed, the actual e2e suite per `playwright.config.js`)
- `test/` — gitignored, must be "regenerated" per README (but `package.json` scripts reference `test/e2e/` and `test/audit/`)
- `playwright-report/` — Playwright output (should be gitignored, probably is)
- `test-results/` — Playwright artifacts (should be gitignored)

**Target**: Consolidate to one clear structure. Two options:

**Option A (recommended, lower risk)**: Keep current committed dirs, fix the gitignored `test/` mismatch.
- Move all Vitest tests from `tests/` → `tests/unit/` (rename dir).
- Keep `tests-e2e/` as-is (it's the actual e2e suite).
- Update `package.json` scripts:
  - `"test": "vitest run tests/unit"` (currently `vitest run` — relies on default discovery, fine but explicit is better)
  - `"test:e2e": "playwright test tests-e2e"` (currently `playwright test` — same)
  - `"audit": "node tests/unit/audit/grammar_audit.mjs"` (currently `test/audit/...` — broken if `test/` doesn't exist)
  - `"feedback": "node tests/unit/audit/grammar_feedback.mjs"`
- Delete the gitignored `test/` reference from README §"Test Structure" — it's misleading since `test/` must be "generated locally". Replace with the real `tests/` + `tests-e2e/` layout.
- `gitignore` additions: `playwright-report/`, `test-results/` (verify not already ignored).

**Option B (higher risk, defer)**: Full consolidation to `tests/unit/` + `tests/e2e/` + `tests/audit/`. Requires moving Playwright config and updating all script paths. Only do this if Option A leaves things confusing.

**Changes (Option A)**:
```bash
mkdir tests/unit tests/audit
git mv tests/*.test.js tests/unit/        # vitest specs
git mv tests/ocr.js tests/check_critical.js tests/inspect_cloze.js tests/unit/  # tools
# (grammar_audit.mjs and grammar_feedback.mjs may not exist yet — package.json references them, check)
# Update package.json scripts (see above)
# Update .gitignore for playwright-report/ and test-results/
# Update README "Test Structure" section to match reality
```

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | `playwright.config.js` may point to a specific test dir | Read it first — update `testDir` if it references `test/e2e/` (it likely points to `tests-e2e/` already based on `package.json`) |
| 2 | `grammar_audit.mjs` / `grammar_feedback.mjs` referenced in scripts but may not exist | Check before moving — if missing, scripts are already broken; fix or remove the script entries |
| 3 | Vitest config (if any) may specify test dirs | Check for `vitest.config.*`; update if it does |
| 4 | Husky pre-commit may run tests | `.husky/pre-commit` — read it; update paths if it references `test/` |
| 5 | CI workflow (`.github/`) may reference paths | Read `.github/workflows/` — update any test paths |

**Verify**: `npm test` passes from new paths; `npm run test:e2e` discovers specs; `npm run validate` (if `check_critical.js` moved, the script must point to new location).

---

### R8: Document or Remove Stray Dependency

**File**: `package.json:35`

**Problem**: `"@rolldown/binding-linux-x64-gnu": "^1.1.1"` is a direct dependency but rolldown isn't used anywhere in the codebase (no `rolldown.config.*`, no imports). Looks like a stray transitive that got pinned into `dependencies` instead of being left in `node_modules`.

**Target**: Determine if it's actually used. If not, remove it. If something depends on it transitively, move it to `devDependencies` with a comment explaining why.

**Changes**:
1. `rg 'rolldown' --type-add 'config:*.{js,ts,json,mjs,cjs}' -t config -t js -t ts` — confirm no usage.
2. Check `npm ls @rolldown/binding-linux-x64-gnu` — see who depends on it.
3. If nothing in the project depends on it directly: remove from `package.json`, `npm install`, confirm `npm run build:css` and `npm test` still work.
4. If a dev tool (e.g., Vite, Vitest) pulls it transitively and it's just hoisted: move to `devDependencies` or leave as-is with a comment.

**Pitfalls**:
| # | Pitfall | Mitigation |
|---|---------|------------|
| 1 | Removing it may break a transitive resolution that currently works because it's pinned | Test with `npm install` (no lockfile) + `npm run build` after removal |
| 2 | It may be platform-specific (linux-x64-gnu) and break on Windows/Mac | If kept, note in commit that it's a platform-specific native binding |

**Verify**: `npm install` succeeds; `npm run build:css` produces same `tailwind.css`; `npm test` passes.

---

## P4 — Minor / Acknowledged (No Action Required)

These were noted in the review but don't need a plan — just awareness:

- **Hardcoded proxy URL** (`llm_service.js:28`) and **admin email** (`kevinkicho@gmail.com` in several files): Fine for a personal-use app. If you ever open-source, move to env vars / Firebase custom claims only. No action now.
- **`IMPLEMENTATION_PLAN.md` stale state**: Features 5–8 are done in code but still documented as "Target" in the plan. Feature 9 is planned but unimplemented. Recommend: after completing R1-R8 above, sweep `IMPLEMENTATION_PLAN.md` to mark Features 5–8 as `[DONE]` and either implement Feature 9 or move it to a backlog section.

---

## Implementation Order

| Step | Item | Risk | Est. effort |
|------|------|------|--------------|
| 1 | R6 (delete stray files, move SENSITIVITY docs) | Low | 15 min |
| 2 | R8 (audit rolldown dep) | Low | 10 min |
| 3 | R5 (arrow functions in llm_service.js) | Low | 30 min |
| 4 | R1 (soften global error hook) | Medium | 45 min |
| 5 | R2 (surface constructor init failures) | Medium | 1-2 hrs (requires stub + call-site audit) |
| 6 | R7 (consolidate test dirs) | Medium | 1 hr |
| 7 | R3 (split ui.js) | Medium-High | 2-3 hrs (move + verify after each file) |
| 8 | R4 (document game_chat.js; split only if needed) | Low | 30 min (doc) / 2 hrs (split) |

**Recommended batching**: Do R6 + R8 + R5 in one short session (all low-risk mechanical). Then R1 + R2 in a safety-focused session. Then R7. Then R3 as its own session (it's the biggest and benefits from focused attention). R4 is a follow-up.

**After all items**: Sweep `IMPLEMENTATION_PLAN.md` to mark Features 5–8 as done. Decide on Feature 9 (implement or backlog).

---

## Verification Per Item

Every item must pass before moving to the next:
1. `npm run validate:critical` — fast syntax/defs check
2. `npm run validate` — full gate (critical + Playwright smoke)
3. Manual smoke test where specified (open app, click the affected surface)
4. `git status` clean (no stray files introduced)
5. Commit with message matching repo style (e.g., `refactor: split ui.js into focused modules`)

Do NOT batch all items into one commit. One commit per item (or per logical group like R6+R8+R5) so a bad change is easy to revert.