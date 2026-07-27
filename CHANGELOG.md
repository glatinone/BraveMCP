# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-24

### Security
- **Extension-origin pinning (trust-on-first-use)**: the HTTP bridge's `Origin`
  allowlist previously matched by scheme only (`chrome-extension://…` /
  `moz-extension://…`), which means *any* installed browser extension — not
  just BraveMCP's own — presents an equally legitimate origin of that shape
  and could talk to `/api/capture`, `/api/note`, `/api/stage-groups`, etc.
  exactly as freely as the real extension. This is the same "unauthenticated
  internal channel trusts any sender" gap disclosed in Claude for Chrome's
  extension-messaging vulnerability (2026-07), applied to a directly
  comparable architecture (extension + local backend + sensitive browsing
  data). Fixed by pinning the specific extension origin seen on first contact
  (`storage/trusted-origin.json`, git-ignored) and rejecting every other
  extension-shaped origin afterward — no user configuration required, since a
  browser can't be tricked into lying about which extension sent a request.
  New `decideOrigin`/`loadPinnedOrigin`/`savePinnedOrigin` in
  `mcp-server/src/security/origin.ts`. Verified against a live server with
  curl: the first extension origin to connect is trusted and pinned, that
  same origin keeps working across a server restart, and a second,
  different extension origin gets 403 even though it matches the scheme
  check. 7 new tests; 35 tests passing (was 28).

### Added
- **Docs**: README Configuration section documenting `.env` variables (`AI_PROVIDER`, `OLLAMA_URL`, `ANTHROPIC_API_KEY`) and where the server reads them from. README Troubleshooting section covering the port-3747 conflict, Claude Desktop not detecting the server, ChromaDB fallback behavior, generic-looking summaries, and extension capture issues, plus a new entry for re-pinning after the trusted-origin change above.
- **Docs**: `SECURITY.md` describing the local-first threat model (HTTP bridge origin allowlist, local-only storage, how AI provider keys are used) and how to report a vulnerability privately.

### Changed
- **Docs**: Roadmap checklist now reflects that Phase 6 (polish + public release) actually shipped in v0.2.0.

## [0.2.0] - 2026-07-13

### Added
- **Test Suite**: Automated tests via Node's built-in test runner (run with tsx, no new deps) covering the extractive AI summaries and the SQLite storage layer (temp-DB isolated). CI runs `npm test` after build on Node 20.
- **Demo Visual**: Self-contained SVG mockup of a Claude conversation embedded in the README, plus `docs/RECORDING.md` with instructions for recording a real GIF.
- **ESLint**: Flat-config ESLint 9 + typescript-eslint setup with `npm run lint` and `npm run typecheck` scripts; CI now runs type-check and lint before build.
- **Health Check**: `/api/status` now reports live SQLite, ChromaDB, and Ollama reachability instead of a static `ok`.
- **Tab grouping**: `get_all_open_tabs` and `apply_tab_grouping` tools, backed by a critic engine (`evaluateGroupQuality`, minimum score 90/100) that rejects domain-name or catch-all group names before they reach the browser.

### Changed
- **AI Fallbacks**: When no LLM is available, `summarize_open_tabs`, `summarize_research_topic`, and `generate_weekly_digest` now build genuine extractive summaries from real data (domain grouping, source listings, data-driven digests) instead of returning canned text.
- **Docs**: Rewrote the README for clarity; cleaned up CONTRIBUTING and CLAUDE.md; moved the internal Antigravity master prompt into `docs/`. Fixed a placeholder clone URL, corrected the MCP tool count (13 → 16, two tab-grouping tools were undocumented), and added a Security section.

### Fixed
- **MCP stdio**: Pinned dotenv to v16 to stop stdout pollution that corrupted the JSON-RPC channel.
- **Dual-process state**: Tab-dependent tools fall back to SQLite when in-memory extension state is empty; the second server instance no longer crashes on a port conflict.
- **Error handling**: Tool handlers now return readable tool-execution errors to Claude instead of raw protocol errors.

### Security
- **HTTP bridge CORS lockdown**: The Express bridge on `localhost:3747` previously used `cors()` with no origin restriction, meaning any website open in the browser could POST directly to `/api/capture`, `/api/note`, `/api/stage-groups`, etc. and write attacker-controlled content into the local memory database or stage arbitrary tab groups — a plain `localhost` bind offers no same-origin protection against a browser tab's own JavaScript. Replaced with an explicit `Origin` allowlist (`src/security/origin.ts`) that only permits `chrome-extension://`/`moz-extension://` origins or requests with no `Origin` header (non-browser clients); every other origin is rejected with 403, including at the CORS-preflight stage so the browser never sends the real request. Verified against a live server with curl: a spoofed `https://evil.com` origin is blocked, the extension's `chrome-extension://` origin and no-origin requests both pass.

## [0.1.0] - 2026-06-14

### Added
- **MCP Server Skeleton**: Setup standard MCP server over stdio with Node.js and TypeScript.
- **SQLite Storage**: Created schema tables (`pages`, `bookmarks`, `highlights`, `notes`, `sessions`) and custom migration system.
- **FTS5 Virtual Search**: Enabled full-text index searching on titles, summaries, and text contents.
- **Browser Extension (Manifest V3)**: Implemented tab sync, bookmarks tracking, readability content extraction, native context menu highlight saves, and a premium glassmorphic popup UI.
- **HTTP Bridge Server**: Starts Express listener on port `3747` in same process as MCP to pipe extension payloads.
- **Local AI Pipeline**: Added local embeddings via Ollama (`nomic-embed-text`) and summarization via Ollama (`llama3.2`) with fallbacks.
- **ChromaDB Vector Indexing**: Configured vector matching for semantic similarity searches.
- **Hybrid Search**: Combined vector and SQLite matching with BM25/cosine relevance weights.
- **Advanced Tools**: Implemented `get_research_sessions`, `generate_weekly_digest`, `suggest_tab_cleanup`, and time-decay weighted `find_forgotten_content`.
- **Project Scaffolding Setup**: Root automation setup script.

[Unreleased]: https://github.com/glatinone/BraveMCP/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/glatinone/BraveMCP/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/glatinone/BraveMCP/compare/48833e6...v0.2.0
[0.1.0]: https://github.com/glatinone/BraveMCP/commit/48833e6
