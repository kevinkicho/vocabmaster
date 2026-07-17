# Web AI Parity via Firebase Proxy (Ollama Cloud)

**Date**: 2026-06 (work completed in this session)  
**Status**: Core implementation complete. **2026-07 update:** production entrypoint is **Cloud Run** (`functions/src/server.ts` → `lib/server.js`), not only the legacy Cloud Function `ollamaProxy` in `index.ts`. Hardening: path allowlist (`/api/tags`, `/api/generate`), body size cap, dual-mode Firebase Auth (`PROXY_AUTH_REQUIRED` default **true**), per-instance rate limit. Client never embeds `OLLAMA_API_KEY` (`scripts/sync-env.js` ban). See `docs/architecture.md` §3.5 and `docs/tiered-learning-ai-engagement-fab-chat.md` Part C.

## Strategic Decision (User Confirmed)

The goal is **full AI feature parity** between the web app (Firebase Hosting) and the Android APK.

- Web and Android should deliver the same LLM-powered experiences (Smart Cloze in Sentences mode + full Story Mode with streaming generation, prefetch, comprehension questions, etc.).
- The **only** intentional difference is TTS quality:
  - Android: Uses native `TTSBridge.kt` + `NativeTTSBridge` to access Google/Samsung system voices (hundreds of high-quality voices). This is the primary reason the APK exists.
  - Web: Falls back to the browser's Web Speech API (more limited voices and quality).

Android Chrome / WebView does not expose the good system TTS engines in a usable way for language learners (pronunciation and prosody are often incomprehensible).

## Problem Before This Work

- `llm.js` always targeted `https://api.ollama.com` directly.
- Pure browser contexts (Firebase Hosting on `https://vocabmaster112225.web.app`) hit CORS errors.
- The `ollamaProxy` Cloud Function existed in `functions/src/index.ts` but was **never called** by the client.
- Streaming (required for Story Mode) was not supported in the proxy (it buffered the entire response).

## Solution Implemented

### 1. Transport Layer Abstraction (`public/js/llm/llm_service.js`)

Added detection and unified request helper:

```js
_isBrowserWeb() {
    if (typeof window === 'undefined') return false;
    if (window.NativeTTS || window.Capacitor) return false; // native wins
    const host = location.hostname;
    return location.protocol === 'https:' && host !== 'localhost' && host !== '127.0.0.1';
}
```

New method:

```js
async _ollamaRequest(path, payload, { stream = false, timeout } = {})
```

- When `_isBrowserWeb() && this.proxyUrl` → wraps the request and POSTs to the Firebase Function with `{ path, method, headers, body }`.
- Otherwise → direct call to `this.endpoint + path` (the Android / Capacitor / local dev path).
- `generate()` (non-stream, used by Smart Cloze / LLM-assisted features) and `streamGenerate()` (Story Mode) both use this.
- `checkConnection()` (model list) also uses it.
- `proxyUrl` has a sensible default for this project and can be overridden via `window.OLLAMA_PROXY_URL`.

This keeps the rest of the LLM code (free-tier model selection, queuing, response parsing, caching) unchanged.

### 2. Streaming Support in the Proxy (`functions/src/index.ts`)

Updated `ollamaProxy` to forward chunks instead of buffering:

```ts
proxyRes.on("data", (chunk) => { res.write(chunk); });
proxyRes.on("end", () => { res.end(); });
```

Also forwards `Content-Type` and `Transfer-Encoding` so the client can treat the response exactly like a direct Ollama call (NDJSON streaming works for Story mode).

The predeploy hook (`npm run build` in functions) ensures `lib/index.js` is always fresh.

### 3. Configuration

In browser context (before LLM init):

```js
window.OLLAMA_PROXY_URL = 'https://us-central1-vocabmaster112225.cloudfunctions.net/ollamaProxy';
```

A default is now baked into `llm.js` for this project ID.

The config lives alongside the existing `public/js/ollama_config.js` pattern (which is gitignored).

## Deployment Steps (One-time / When Changing Proxy Logic)

From project root:

```bash
# 1. Build functions (compiles src/ → lib/)
cd functions && npm run build
# or just run the firebase command below — it runs the predeploy hook automatically

# 2. Deploy the function
firebase deploy --only functions
```

The function is 1st Gen HTTP (`ollamaProxy`).

**Note on the service account error encountered**:
During an automated attempt, deployment failed with:
> "Default service account '1020976660084-compute@developer.gserviceaccount.com' doesn't exist. Please recreate this account or specify a different account."

This is a GCP/Firebase project infrastructure issue (not code). Common fix:
- Go to Google Cloud Console → IAM & Admin → Service Accounts
- Look for the Compute Engine default service account and re-enable/recreate it if missing.
- Or run the deploy from a fully authenticated local machine with owner permissions.

The source upload succeeded; only the function creation step hit the precondition.

## Testing Web AI Parity (After Successful Deploy)

1. Deploy functions (see above).
2. Deploy hosting if needed: `firebase deploy --only hosting`
3. Open the live web app in a clean browser (Incognito, no extensions that might interfere): `https://vocabmaster112225.web.app`
4. Go to Settings → AI section. It should show model list / connection status (uses `/api/tags` via proxy).
5. Test **Sentences mode** (Smart Cloze):
   - Load a Japanese (or other) item.
   - The LLM-assisted blanking should trigger and succeed (falls back to regex if LLM fails).
6. Test **Story Mode** (the most demanding):
   - Start a Story session.
   - Watch tokens stream in real-time (the proxy must stream NDJSON correctly).
   - Comprehension questions should appear and be answerable.
   - "Auto-read" and manual TTS buttons still use Web Speech on web (expected).

### Debugging
- Add `?debug=1` to the URL.
- Check browser DevTools Network tab for calls to the `ollamaProxy` function.
- Look for logs like `[LLM] Connected` and streaming "First token received".

## Design Principles & Rationale

- **Capability detection over user agent sniffing** — Presence of `window.NativeTTS` or `window.Capacitor` is the authoritative signal for "good native path available".
- **Minimal change to LLM business logic** — The free-tier model enforcement, request queuing, caching, and parsing stay in one place.
- **Proxy is a transparent transport** — Client code for streaming/JSON remains almost identical.
- **Android remains the premium TTS experience** — This was the explicit user requirement.
- **Future flexibility** — Easy to swap the backend (different LLM provider) by changing what the proxy forwards to, or by updating the direct endpoint.

## Related Code Locations

- Client transport: `public/js/llm/llm_service.js` (`_isBrowserWeb`, `_ollamaRequest`, `generate`, `streamGenerate`, `checkConnection`, constructor)
- Proxy implementation: `functions/src/index.ts` (and compiled `lib/index.js`)
- Android capability signal: `public/js/main.js` (handleAuthClick + init), `native_tts.js`, `MainActivity.kt`
- Existing (unused until now) proxy skeleton: was already in the functions codebase

## Remaining Medium-Term Work (from earlier roadmap)

See the overall plan. Key open items that build on this parity:

- Productize `vocabulary-collections.js` + integrate into filters, home, game selection.
- Wire analytics + `learning_loop.js` + `adaptive.js` into a real review queue that all 7 modes feed.
- Polish Story Mode to visibly leverage the newly enriched higher-tier data (N3/N2/N1) and tighter integration with the review system.
- Continue settings registry cleanup (presets centralization was left for after the render split).

## For Future Agents

When touching LLM code:
- Always respect the `_isBrowserWeb()` path so web users keep parity.
- If changing the proxy contract (`{path, method, headers, body}`), update both the Cloud Function and the wrapper in `_ollamaRequest`.
- Streaming is now a first-class requirement because Story Mode depends on it.
- Test both paths: native Android (direct) and pure web (proxy).

When adding new AI features (grammar explanations, listening passages, etc.), make sure they go through `_ollamaRequest` so they automatically get web support.

---

**Last updated**: This session (short-term hygiene + settings refactor + web AI parity implementation).