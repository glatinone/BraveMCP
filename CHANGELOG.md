# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Demo Visual**: Self-contained SVG mockup of a Claude conversation embedded in the README, plus `docs/RECORDING.md` with instructions for recording a real GIF.
- **ESLint**: Flat-config ESLint 9 + typescript-eslint setup with `npm run lint` and `npm run typecheck` scripts; CI now runs type-check and lint before build.
- **Health Check**: `/api/status` now reports live SQLite, ChromaDB, and Ollama reachability instead of a static `ok`.

### Changed
- **AI Fallbacks**: When no LLM is available, `summarize_open_tabs`, `summarize_research_topic`, and `generate_weekly_digest` now build genuine extractive summaries from real data (domain grouping, source listings, data-driven digests) instead of returning canned text.
- **Docs**: Rewrote the README for clarity; cleaned up CONTRIBUTING and CLAUDE.md; moved the internal Antigravity master prompt into `docs/`.

### Fixed
- **MCP stdio**: Pinned dotenv to v16 to stop stdout pollution that corrupted the JSON-RPC channel.
- **Dual-process state**: Tab-dependent tools fall back to SQLite when in-memory extension state is empty; the second server instance no longer crashes on a port conflict.
- **Error handling**: Tool handlers now return readable tool-execution errors to Claude instead of raw protocol errors.

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
