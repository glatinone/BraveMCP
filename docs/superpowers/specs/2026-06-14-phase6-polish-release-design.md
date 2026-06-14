# Phase 6 — Polish + Public Release (Design)

**Date:** 2026-06-14
**Status:** Approved for implementation
**Executor:** Claude Code (direct edits + build verification + staged commits)

## Context

Phase 6 scaffolding (CI workflow, issue templates, CONTRIBUTING, LICENSE, CHANGELOG,
README badges, comparison table, one-command setup script, GitHub repo) was already
built in the v0.1.0 release. This phase closes the remaining quality gaps that make
BraveMCP genuinely publishable.

Four work areas, confirmed with the user:

1. Strengthen AI tool output (extractive fallbacks)
2. Demo visual (SVG mockup now + slot/instructions for a real GIF)
3. Clean up docs & CI (incl. ESLint setup)
4. Robustness & error handling

## Problem: AI tool output is canned, not data-driven

Every LLM function in `mcp-server/src/ai/pipeline.ts` has a `catch` block that returns a
**hardcoded string ignoring the real input data**. When Ollama/Anthropic is unavailable
(the common local-first case), the tools emit useless boilerplate:

- `generateTopicSynthesis` → `"Synthesis on X: Relies on the gathered browser research database."` — ignores `pagesText`
- `generateGroupSummary` → `"...relating to web development and Model Context Protocol."` — hardcoded, identical for any tabs
- `generateWeeklyDigest` → generic template — ignores `statsText`
- `summarizeContent` → already uses real title/content (acceptable)

## Design

### Area 1 — Extractive fallbacks

**Principle:** LLM present → rich synthesis. LLM absent → deterministic extractive
summary built from real SQLite data. Tools must never emit canned text that ignores input.

Add pure helper functions (no network) in `pipeline.ts`:

- `extractiveTabSummary(tabsText)` — parse titles/URLs, group by domain, report tab count,
  unique domains, and the dominant domains with their page titles.
- `extractiveTopicSummary(topic, pagesText)` — list matched pages by domain, include real
  summary snippets, count of sources.
- `extractiveWeeklyDigest(statsText, contentSummaryText)` — build a real Markdown digest
  from actual counts/domains, with data-derived "questions to explore" instead of fixed ones.

Each LLM function's `catch` block calls its extractive counterpart instead of returning a
literal string. A short marker (e.g. `_(generated without LLM — extractive summary)_`) is
appended so the output is honest about its source.

**Acceptance:** With Ollama stopped, `summarize_open_tabs`, `summarize_research_topic`, and
`generate_weekly_digest` each produce output that visibly reflects the actual open
tabs / matched pages / weekly stats (different input → different output).

### Area 2 — Demo visual (both)

- **SVG mockup now:** A self-contained SVG rendering the before/after Claude conversation
  (the `find_forgotten_content` scenario), styled like a chat. Stored at
  `docs/assets/demo-conversation.svg`, embedded in README. Version-controlled, no recording.
- **Real GIF slot:** README gets a clearly-marked section + a `docs/RECORDING.md` with
  step-by-step instructions (ScreenToGif, what to show, where to drop the file). README
  references `docs/assets/demo.gif` with a note that it's pending.

### Area 3 — Docs & CI cleanup

- `CONTRIBUTING.md` — remove the obsolete `git init` / initial-commit boilerplate; keep
  fork → branch → build → PR flow. Add ESLint to the verification steps.
- `CLAUDE.md` — replace hardcoded `D:/50_Projects/...` path with a generic
  `/absolute/path/to/BraveMCP/...` placeholder; flip Phase 6 tracker to done at the end.
- `ANTIGRAVITY_MASTER_PROMPT.md` — move to `docs/` (internal workflow doc, not user-facing).
- **ESLint:** add `eslint` + `@typescript-eslint/*` as devDeps in `mcp-server`, a flat
  `eslint.config.js` (TypeScript, ESM, sensible defaults), and `npm run lint`.
- `ci.yml` — add an explicit type-check step (`tsc --noEmit`) and a lint step
  (`npm run lint`) after install, before/alongside build.

### Area 4 — Robustness & error handling

- Wrap each MCP tool handler so an exception returns a clear MCP text error instead of
  crashing the server.
- Tools requiring arguments (`find_related_content`, `find_forgotten_content`) — already
  schema-validated by the SDK; ensure the schema marks them required and the descriptions
  are clear. (Confirmed working in testing — keep as is, document.)
- `/api/status` health check — report SQLite (always), ChromaDB (port 8000 reachable),
  and Ollama (port 11434 reachable) status so the extension popup dot is meaningful.
- Graceful degradation messages already exist for ChromaDB (FTS5 fallback) and Ollama
  (extractive fallback after Area 1).

## Out of scope

- Recording the actual GIF (user does this; we provide the slot + instructions).
- Publishing to a marketplace / Chrome Web Store.
- New MCP tools beyond the existing 13.

## Execution plan

Staged commits, build-verified after each:

1. `feat(ai): extractive fallbacks for tab/topic/digest summaries`
2. `docs: add SVG demo + recording guide, embed in README`
3. `chore: ESLint setup + CI type-check & lint steps`
4. `refactor(mcp): wrap tool handlers, richer /api/status health check`
5. `docs: clean up CONTRIBUTING/CLAUDE, relocate master prompt, mark Phase 6 done`

Each commit is pushed to `origin/master` at the end.
