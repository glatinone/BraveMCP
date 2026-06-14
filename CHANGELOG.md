# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
