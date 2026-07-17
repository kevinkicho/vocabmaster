# VocabMaster Documentation Index

**Last verified against the workspace:** 2026-07-16

This index is the navigation page for VocabMaster documentation. Prefer current-state docs and source over historical roadmaps when they disagree.

## Authority

1. `AGENTS.md` — critical implementation invariants
2. Current source under `public/js/` and config
3. Current-state documents below
4. Status logs, roadmaps, and research snapshots

## Current-state documentation

| Document | Owns |
|---|---|
| [Root README](../README.md) | Product overview, game modes, file map |
| [Architecture](architecture.md) | Runtime pipelines, auth, AI transport, **memory engine / Today** (§3.4) |
| [Memory engine & Daily Session](memory-engine-daily-session.md) | FSRS design, Today UX, session plan, PR sequence (rev 4) |
| [Tiered Learning + AI Engagement + Chat FAB](tiered-learning-ai-engagement-fab-chat.md) | Path/units, tutor moments, secure Ollama transport, global Chat FAB — **Implemented on main** |
| [Learning Map · Sentences Cloze · Sentence Build · CJK Chunking](learning-map-sentences-cloze-sentence-build.md) | Path home UX, cloze blank reliability, Sentence Build, `SentenceUtils` — **Implemented on main (v1), rev 3** |
| [Telemetry & User Feedback](telemetry-feedback.md) | Analytics, question feedback, learning loop — **not** legacy “analytics owns SRS” |
| [Audio & TTS Architecture](audio-tts-architecture.md) | Browser/native TTS routing |
| [Web AI Parity Proxy](web-ai-parity-proxy-implementation.md) | Historical proxy notes; **runtime entrypoint is Cloud Run `functions/src/server.ts`** (see architecture §3.5) |
| [AGENTS.md](../AGENTS.md) | Agent constraints |

## Memory engine paths (quick map)

| Role | Path |
|------|------|
| Design | `docs/memory-engine-daily-session.md` |
| FSRS pure module | `public/js/fsrs.js` |
| MemoryService | `public/js/memory.js` (`MEMORY_ENGINE_ENABLED` default **true**) |
| Daily Session / Today runner | `public/js/daily_session.js` |
| Due-aware review queue (internal) | `public/js/data.js` → `getReviewWords` |
| Free-play grade → memory | `public/js/analytics.js` → `recordAttempt` |
| Home (no Smart Review CTA) | `public/js/main.js` → `goHome` |
| Learning path | `public/js/learning_path.js` |
| Placement (FSRS-safe) | `public/js/game_placement.js` |
| Chat FAB + ChatPanel | `public/js/chat_fab.js`, `chat_panel.js` |
| Tutor moments | `public/js/tutor_moments.js` |
| Engagement counters | `public/js/engagement.js` |
| SentenceUtils (cloze + chunk) | `public/js/sentence_utils.js` |
| Sentence Build | `public/js/game_sentence_build.js` |
| Learning map | `public/js/main.js` → `openLearningMap` |
| AI proxy (Cloud Run) | `functions/src/server.ts` |

**PR10:** Memory engine default on; legacy Smart Review home button / `launchSmartReview` removed. All 11 free-practice modes kept.

**Path + FAB (main):** Soft migrate existing users to free path; guided opt-in + placement; dual-universe Today; global AI tutor FAB.

## Status and planning records

| Document | Notes |
|---|---|
| [Current Status & Roadmap](current-status-and-roadmap.md) | Dated engineering log |
| [Medium-Term Roadmap](medium-term-roadmap.md) | Historical sequencing (Smart Review phase notes may be superseded by memory-engine doc) |
| [Codebase Modularization](codebase-modularization.md) | File-split record |
| [Lessons Learned](lessons-learned.md) | Incident knowledge |

## Research snapshots

Sensitivity experiments (June 2026): `SENSITIVITY_*.md` in this folder.
