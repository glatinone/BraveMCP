# BraveMCP — Local Browser Memory System for Claude Desktop

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release Version](https://img.shields.io/badge/version-v0.1.0-emerald.svg)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/local--first-yes-violet.svg)](#)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compliant-orange.svg)](https://modelcontextprotocol.io)

BraveMCP is a local-first browser extension and Model Context Protocol (MCP) server that turns your web browsing activity (pages visited, bookmarks, text highlights, manual notes) into a searchable "second brain", accessible natively by Claude Desktop.

---

## Architecture

```
[Brave Browser] → [Extension] → [HTTP Bridge :3747] → [MCP Server] → [Claude Desktop]
```

- **Browser Extension**: Manifest V3 extension captures tab changes, bookmarks, and text highlights.
- **HTTP Bridge**: Runs an Express listener on port `3747` in the background of the MCP server process to receive extension payloads.
- **Storage Layer**: SQLite for structured records and notes; ChromaDB for local vector embeddings.
- **AI Pipeline**: Ollama (local models) or Anthropic API for generating page summaries, active research topic syntheses, and vector embeddings.
- **MCP Server**: Exposes tools to Claude Desktop over stdio for exploring your memory.

---

## ⚖️ BraveMCP vs Notion Web Clipper

| Feature | Notion Web Clipper | BraveMCP |
| --- | --- | --- |
| **Data Privacy** | Cloud-based (Notion servers) | 🔒 **100% Local-first** (SQLite + ChromaDB) |
| **Search Method** | Keyword only (Notion Search) | 🧠 **Hybrid Search** (Keyword FTS5 + semantic vector similarity) |
| **Access by AI** | None | 🔌 **Native MCP interface** (Claude Desktop reads it directly) |
| **Automatic tracking** | Manual clip only | ⚙️ **Auto tab-sync + context menu selection highlights** |
| **Research Synthesis** | None | 📚 **Auto-clusters research sessions + weekly digest generation** |

---

## 💡 Demo Scenario (How Claude Uses BraveMCP)

Here is a look at how Claude retrieves forgotten information from your second brain.

### Before (Without BraveMCP)
> **User**: "Hey Claude, do you remember that article I read a few days ago about some new protocol security hardening?"
>
> **Claude**: "I'm sorry, I don't have access to your browsing history or past activities. Could you provide the name of the protocol or share the text?"

### After (With BraveMCP)
> **User**: "Hey Claude, do you remember that article I read a few days ago about some new protocol security hardening?"
>
> **Claude**: *(Calls `find_forgotten_content(vague_description: "protocol security hardening")`)*
>
> **BraveMCP Server**: *(Returns hybrid search matches adjusted by time-decay and visit boosting)*
> ```json
> [
>   {
>     "url": "https://modelcontextprotocol.io/docs/security",
>     "title": "Model Context Protocol Security Guidelines",
>     "summary": "This document outlines standard security rules for MCP hosts and clients to prevent shell injection and handle sandbox credentials securely.",
>     "adjusted_relevance": 0.94,
>     "visit_count": 3,
>     "last_visited_days_ago": 4.2
>   }
> ]
> ```
>
> **Claude**: "Yes, you visited the **Model Context Protocol Security Guidelines** (https://modelcontextprotocol.io/docs/security) 4 days ago. You opened it 3 times. The article outlines how hosts and clients can prevent shell injection and handle sandbox credentials safely. Would you like me to summarize those security principles?"

---

## Installation & Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Python 3.10+](https://www.python.org/) (required to run ChromaDB locally)
- [Ollama](https://ollama.com/) (required to run AI models locally: install the `nomic-embed-text` and `llama3.2` models)

### 2. Git Initialization
If you are running this project from a local directory, initialize the git repository first:
```bash
git init
git add .
git commit -m "feat: initial BraveMCP release v0.1.0"
```

### 3. Run Setup Command
BraveMCP includes a root setup command that installs server dependencies, builds TypeScript code, and verifies ports:
```bash
npm run setup
```

### 4. Running ChromaDB
Start the vector database locally by running:
```bash
pip install chromadb
chroma run --path ./storage/chroma
```
ChromaDB will listen at `http://localhost:8000`.

### 5. Configure Claude Desktop Integration
Link the MCP server to Claude Desktop by adding the server config details to your `claude_desktop_config.json` (located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "brave-memory": {
      "command": "node",
      "args": [
        "D:/50_Projects/01_Projects/BraveMCP/mcp-server/dist/index.js"
      ]
    }
  }
}
```

Restart Claude Desktop after adding these configurations.

### 6. Load Browser Extension
- Open Brave or Chrome at `chrome://extensions/`.
- Toggle **Developer mode** on in the top-right corner.
- Click **Load unpacked** and select the `/extension` directory in this project root.

---

## Exposed Tools

The MCP server implements the following tools:
1. `get_open_tabs` - Get list of open browser tabs (synchronized from extension).
2. `get_active_tab` - Get current active browser tab.
3. `get_bookmarks` - Retrieve browser bookmarks.
4. `search_memory` / `find_related_content` - Search notes and page summaries using hybrid search (combining SQLite FTS5 keywords and ChromaDB semantic vector matching).
5. `capture_current_page` - Capture page content. Can retrieve the active tab's page content from SQLite or save page content directly.
6. `save_note` - Save a custom text note.
7. `save_bookmark` - Save a new bookmark.
8. `summarize_open_tabs` - Synthesize a topic digest of what you're currently researching in active tabs.
9. `summarize_research_topic` - Generate a research synthesis of captured history relating to a specific topic.
10. `get_research_sessions` - Retrieve auto-clustered groups of URLs and page visits grouped by topic.
11. `generate_weekly_digest` - Generates a markdown weekly summary of all browsing metrics and AI research gaps.
12. `suggest_tab_cleanup` - Reviews open tabs and suggests cleaning actions (`Close`, `Archive`, `Keep`) based on stats.
13. `find_forgotten_content` - Performs time-decay and visit-boosted searches for stale items.
