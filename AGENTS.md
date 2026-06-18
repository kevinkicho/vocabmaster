# Agent Rules for VocabMaster

## Screenshots
- Always save screenshots in `screenshots/` folder at project root.
- Name screenshots descriptively with a timestamp or sequence number.
- The AI cannot read or describe images — it can only extract computed CSS values programmatically via Playwright `page.evaluate()`.

## AI Accountability
- Every time AI is involved, output the exact prompt and exact response **in a markdown table** in your reply to the user.
- Table format:
  | # | Role | Full Prompt | Full Response |
  |---|------|-------------|---------------|
  | 1 | generate | `...` | `...` |
  | 2 | critique | `...` | `...` |
- Do NOT truncate or summarize prompts/responses. Show them verbatim.
- Never use mock data. Never create mock data. Always use real AI.

## Style Conventions
- **All custom colors** (`indigo-*`, `slate-*`, `neutral-*`) are CSS variables (`var(--p-*)`, `var(--n-*)`).
- **Never use `/opacity` modifiers** on these custom colors — Tailwind silently drops them during build. Use the base color (`dark:bg-neutral-900`) instead of `dark:bg-neutral-900/90`.
- For non-custom colors (amber, emerald, rose, cyan, violet, white, black), `/opacity` modifiers work normally.
- Always rebuild CSS after Tailwind config changes: `npm run build:css`.
- **`@tailwindcss/typography`** plugin is installed and registered in `tailwind.config.js`. The `prose`, `prose-sm`, `dark:prose-invert` classes on `#note-body` depend on it.
- **`animate-shake`** animation is defined in `tailwind.config.js` (`theme.extend.animation` + `theme.extend.keyframes`). Used in voice game (`game_voice.js`) on incorrect answers.

## Languages
- When testing Grammar Gym or any AI feature, randomise the language and word ID on each run to prove fresh generation.

## Grammar Gym Labels
- `labelA`/`labelB` are computed deterministically from (type, answer) in `LLMService.resolveLabels()`.
- Labels are shown on choice buttons at all times.

## Todo List Discipline
- **After completing any task**, immediately update the todo list to mark it `completed`. Never leave completed work as `pending` or `in_progress`.
- **Before replying to the user**, verify all todos reflect their true state. Stale todos are a bug.
- When a multi-step task finishes, mark all sub-items complete in one batch update.

## Critical: `const`/`let`/`class` Do Not Cross `<script>` Tag Boundaries

In JavaScript, `const`, `let`, and `class` declarations in one `<script>` tag are **not visible** to other `<script>` tags — only `var` and explicit `window.*` assignments cross script boundaries. This is a fundamental JS behavior that differs from how bundled/compiled code works.

**Example of the bug (TTS fix, June 2026):**
```js
// native_tts.js — defines NativeTTSBridge
const NativeTTSBridge = (() => {
    window.NativeTTSBridge = bridge;  // ← the actual global
    return bridge;
})();

// services.js — tries to read it
this.useNative = (typeof NativeTTSBridge !== 'undefined')  // ← ALWAYS undefined!
```

**Fix:** Always use `window.*` prefix when accessing a value defined in another `<script>` tag:
```js
this.useNative = (typeof window.NativeTTSBridge !== 'undefined') && window.NativeTTSBridge.isAvailable();
```

This applies to all files loaded via separate `<script>` tags in `index.html` — which is all of them (no bundler).

## Critical: `onAuthStateChanged(null)` Is Not a Terminal State

Firebase `auth.onAuthStateChanged(user)` fires with `null` when no user is signed in. This is **not** "auth is done and there's no user" — it means "no user signed in yet." Treating it as terminal (setting `resolved = true` and clearing the anonymous-sign-in timeout) hangs the auth Promise forever in fresh browser contexts.

**The bug (auth.js, June 2026):**
```js
// waitForAuth() — old code
var unsubscribe = auth.onAuthStateChanged(function(user) {
    if (resolved) return;
    resolved = true;       // ← BUG: sets resolved on null too
    clearTimeout(timeout);  // ← cancels the signInAnonymously() timeout
    unsubscribe();
    if (user) { ... }       // ← user is null, does nothing, Promise hangs
});
```

**Fix:** Only set `resolved = true` when a real `user` arrives. Let the timeout fire to call `signInAnonymously()` when `user` is `null`:
```js
auth.onAuthStateChanged(function(user) {
    if (resolved) return;
    if (user) {             // ← only act on a real user
        resolved = true;
        clearTimeout(timeout);
        unsubscribe();
        this.currentUser = user;
        resolve(user);
    }
    // null → do nothing, let timeout fire
});
```

This is invisible in production (cached anon session fires with a real user) but blocks fresh contexts (Playwright, incognito). See `docs/architecture.md` §10.2.

## Read Docs Before Editing

Before making code changes, read the relevant docs (`docs/architecture.md`, `docs/development.md`, `AGENTS.md`) to understand the existing patterns and constraints. Blaming external factors (Firebase, proxy, network) for issues caused by your own edits is a process failure — verify your changes didn't break things first by testing against the baseline.
