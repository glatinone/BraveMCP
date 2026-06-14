# BraveMCP — Your Browser Memory, Accessible by Claude

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0-green.svg)](CHANGELOG.md)
[![Local First](https://img.shields.io/badge/local--first-yes-violet.svg)](#)
[![MCP Compliant](https://img.shields.io/badge/MCP-compliant-orange.svg)](https://modelcontextprotocol.io)

**BraveMCP** is a local-first browser extension + MCP server that captures everything you browse — pages, bookmarks, highlights, notes — and makes it searchable by Claude Desktop as a personal "second brain."

> Everything stays on your machine. No cloud. No tracking. Just your own memory, given to Claude.

---

## What It Does

| Without BraveMCP | With BraveMCP |
|---|---|
| "I don't have access to your history" | Claude searches your browsing history directly |
| You copy-paste URLs manually | Extension auto-captures pages as you browse |
| Forgotten tabs lost forever | Time-decay search resurfaces what you forgot |
| Manual research summaries | Claude synthesizes your sessions automatically |

### Example

> **You:** "Do you remember that article about MCP security I read last week?"
>
> **Claude:** *(calls `find_forgotten_content`)* → "Yes — you visited **MCP Security Guidelines** 4 days ago, 3 times. It covers sandbox credential handling and shell injection prevention. Want a summary?"

---

## How It Works

```
Brave Browser
    ↓ (tab visits, bookmarks, highlights)
Extension (Manifest V3)
    ↓ POST /api/...
HTTP Bridge (Express :3747)
    ↓
MCP Server ←→ SQLite + ChromaDB
    ↓ stdio JSON-RPC
Claude Desktop
```

- **Extension** — Manifest V3. Auto-captures tab changes, bookmarks, and context-menu text highlights.
- **HTTP Bridge** — Express server on port `3747`, runs inside the MCP server process to receive extension payloads.
- **Storage** — SQLite (FTS5 full-text search) + ChromaDB (local vector embeddings). Nothing leaves your machine.
- **AI Pipeline** — Ollama (`llama3.2` / `nomic-embed-text`) for local summarization and embeddings, with Anthropic API as fallback.
- **MCP Server** — Exposes 13 tools to Claude Desktop over stdio.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Brave](https://brave.com/) or Chrome browser
- [Claude Desktop](https://claude.ai/download)
- *(Optional)* [Ollama](https://ollama.com/) for local AI — `ollama pull llama3.2 && ollama pull nomic-embed-text`
- *(Optional)* Python 3.10+ for ChromaDB vector search — `pip install chromadb`

### Install

```bash
git clone https://github.com/YOUR_USERNAME/BraveMCP.git
cd BraveMCP
npm run setup
```

`npm run setup` handles everything: installs dependencies, builds TypeScript, and checks ports.

### Connect to Claude Desktop

Add this to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "brave-memory": {
      "command": "node",
      "args": ["/absolute/path/to/BraveMCP/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop.

### Load the Browser Extension

1. Open `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `/extension` folder

### (Optional) Start ChromaDB for Semantic Search

```bash
pip install chromadb
chroma run --path ./storage/chroma
```

ChromaDB runs at `http://localhost:8000`. Without it, BraveMCP falls back to SQLite keyword search — still works great.

---

## Available MCP Tools

Once connected, Claude can call any of these 13 tools:

| Tool | What it does |
|------|-------------|
| `get_open_tabs` | Get your currently open browser tabs |
| `get_active_tab` | Get the tab you're looking at right now |
| `get_bookmarks` | Retrieve your saved bookmarks |
| `search_memory` | Keyword + semantic search across your history |
| `find_related_content` | Find pages related to a search query |
| `find_forgotten_content` | Resurface old content using time-decay + visit scoring |
| `capture_current_page` | Save the active page's content to memory |
| `save_note` | Save a freeform note |
| `save_bookmark` | Save a bookmark with a folder |
| `summarize_open_tabs` | Synthesize what you're currently researching |
| `summarize_research_topic` | Deep-dive summary on a specific topic from your history |
| `get_research_sessions` | Auto-clustered browsing sessions by domain/topic |
| `generate_weekly_digest` | Weekly summary of your browsing and research gaps |
| `suggest_tab_cleanup` | Recommends tabs to close, archive, or keep |

---

## Page Capture Flow

The extension auto-syncs tab visits in the background. For full page content (text body + AI summary), click **"Capture Content"** in the extension popup. This sends the page body to the MCP server, which stores it in SQLite and generates an AI summary and vector embedding.

Claude can also save a page directly: `capture_current_page(url, title, content, summary)`.

---

## Project Structure

```
BraveMCP/
├── extension/              # Manifest V3 browser extension
│   ├── background.js       # Service worker: tab sync, bookmarks
│   ├── content.js          # DOM extraction for page capture
│   ├── manifest.json
│   └── popup/              # Extension UI
├── mcp-server/             # Node.js MCP server
│   ├── src/
│   │   ├── index.ts        # MCP tools + Express HTTP bridge
│   │   ├── storage/
│   │   │   ├── database.ts # SQLite schema, FTS5, migrations
│   │   │   └── chroma.ts   # ChromaDB client
│   │   └── ai/
│   │       └── pipeline.ts # Embeddings + summarization pipeline
│   └── tsconfig.json
├── scripts/
│   └── setup.js            # One-command setup script
├── storage/                # SQLite DB lives here (git-ignored)
└── package.json            # Root: runs setup script
```

---

## Roadmap

- [x] Phase 1 — MCP server scaffold
- [x] Phase 2 — SQLite storage layer (FTS5, migrations)
- [x] Phase 3 — Browser extension (Manifest V3)
- [x] Phase 4 — Vector search + AI pipeline (Ollama / Anthropic fallback)
- [x] Phase 5 — Advanced tools (digest, sessions, forgotten content, tab cleanup)
- [ ] Phase 6 — Polish + public release

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — built by Yehezkiel Tampubolon
