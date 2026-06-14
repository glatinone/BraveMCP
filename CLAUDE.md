# CLAUDE.md — BraveMCP Orchestration Instructions

## Project Overview
BraveMCP is a local-first browser memory system that captures browsing history, bookmarks, text highlights, and manual notes, storing them in SQLite/ChromaDB. It exposes this database as a searchable "second brain" to Claude Desktop via the Model Context Protocol (MCP).

## Build & Run Commands

### MCP Server (`/mcp-server`)
- Install dependencies: `npm install`
- Run development server (live TS execution): `npm run dev`
- Build TypeScript files: `npm run build`
- Start built server: `npm run start`

---

## Claude Desktop Integration

To connect this local MCP server to Claude Desktop, add the following configuration to your `claude_desktop_config.json` (typically located at `%APPDATA%\Claude\claude_desktop_config.json`):

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

---

## ⚠️ Critical Architecture Note: Page Capture Flow

The `capture_current_page` MCP tool **cannot** trigger browser actions directly (because MCP runs over stdio in Claude Desktop, whereas the extension runs in the browser sandbox and can only make outbound POST requests to the HTTP bridge). 

This is handled by design using the following flow:
1. **User Action**: User clicks "Capture Content" in the extension popup. This triggers `content.js` to extract text from the DOM, which is then `POST`ed to `/api/capture` and saved to SQLite (along with AI-generated summaries and embeddings).
2. **Claude Lookup**: When Claude calls `capture_current_page()` (without arguments), the MCP server checks SQLite for any previously captured page matching the current active tab's URL and returns it.
3. **Claude Save**: If Claude calls `capture_current_page(url, title, content, summary)` with arguments, the MCP server saves it directly to the database.

---

## Phase Status Tracker

- [x] **Phase 1: Project Scaffold + MCP Server Skeleton** — Done
- [x] **Phase 2: SQLite Storage Layer** — Done
- [x] **Phase 3: Browser Extension (Manifest V3)** — Done
- [x] **Phase 4: Vector Search + AI Pipeline** — Done
- [ ] **Phase 5: Advanced Tools + Digests** — Pending
- [ ] **Phase 6: Polish + GitHub Release** — Pending
