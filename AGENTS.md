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

## Testing Requirements
- **After any CSS/Tailwind change**: run the relevant Playwright diagnostic test, then take a screenshot and save to `screenshots/` folder.
- **Screenshots must confirm the fix visually**: don't just rely on test passing — the screenshot is the proof.
- **Use Playwright in headed or headless mode via `npx playwright test`**. Tests live in `test/e2e/`. Serve the app with `http-server` before running tests.

## Style Conventions
- **All custom colors** (`indigo-*`, `slate-*`, `neutral-*`) are CSS variables (`var(--p-*)`, `var(--n-*)`).
- **Never use `/opacity` modifiers** on these custom colors — Tailwind silently drops them during build. Use the base color (`dark:bg-neutral-900`) instead of `dark:bg-neutral-900/90`.
- For non-custom colors (amber, emerald, rose, cyan, violet, white, black), `/opacity` modifiers work normally.
- Always rebuild CSS after Tailwind config changes: `npm run build:css`.
- After any CSS/Tailwind rebuild, re-sync Android assets: `npm run prepare:android`.
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
