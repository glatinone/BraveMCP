# BraveMCP — Master Prompt for Antigravity

> Paste prompt ini ke Antigravity di awal setiap phase baru.
> Claude Code berperan sebagai orchestrator: review output, tentukan next phase, dan kasih feedback.

---

## 🧠 SYSTEM CONTEXT (Paste sekali di awal project)

You are a senior full-stack engineer building **BraveMCP** — a local-first browser memory system that turns browsing activity into a searchable second brain, accessible by Claude Code Desktop via MCP protocol.

**Stack:**
- Browser Extension: Manifest V3 (Chrome/Brave compatible)
- MCP Server: Node.js + TypeScript
- Storage: SQLite (structured) + ChromaDB (vector embeddings)
- AI Pipeline: Ollama (local) or Anthropic API for summarization + embedding
- Protocol: Model Context Protocol (MCP) over stdio

**Project structure target:**
```
brave-mcp/
├── extension/          # Manifest V3 browser extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   └── popup/
├── mcp-server/         # MCP server exposing tools to Claude
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/
│   │   ├── storage/
│   │   └── ai/
│   ├── package.json
│   └── tsconfig.json
├── storage/            # SQLite DB + ChromaDB data
├── scripts/            # Setup, install, dev scripts
├── docs/               # Architecture docs
├── README.md
└── CLAUDE.md           # Instructions for Claude Code orchestrator
```

**Core principle:** Everything runs locally. No cloud dependency. Data never leaves the machine.

---

## 📋 OUTPUT FORMAT RULES

After completing each phase, always output:

```
## ✅ COMPLETED
[list what was built]

## 📁 FILES CREATED
[exact file paths and brief description]

## 🔌 HOW TO TEST
[exact commands to verify it works]

## ⚠️ KNOWN ISSUES / ASSUMPTIONS
[anything Claude should know before next phase]

## 📋 READY FOR CLAUDE REVIEW
[paste this section to Claude Code for orchestration decision]
```

---

---

# PHASE 1 — Project Scaffold + MCP Server Skeleton

## Goal
Set up the full project structure and a working (but empty) MCP server that Claude Code Desktop can connect to.

## Tasks

### 1.1 Initialize project
```
brave-mcp/
├── mcp-server/
│   ├── src/index.ts        ← MCP server entry point
│   ├── package.json
│   └── tsconfig.json
├── extension/              ← empty folder for now
├── storage/                ← empty folder for now
├── README.md
└── CLAUDE.md
```

### 1.2 MCP Server skeleton
Use `@modelcontextprotocol/sdk` (official MCP TypeScript SDK).

Expose these stub tools (return mock data for now):
- `get_open_tabs()` → returns `[{url, title, tabId}]`
- `get_active_tab()` → returns `{url, title}`
- `get_bookmarks()` → returns `[{url, title, folder}]`
- `search_memory(query: string)` → returns `[{url, title, summary, relevance}]`
- `capture_current_page()` → returns `{status: "captured", url}`
- `save_note(content: string, source_url?: string)` → returns `{status: "saved", id}`

### 1.3 CLAUDE.md
Write a CLAUDE.md at root with:
- Project overview
- How to start MCP server
- How to connect to Claude Code Desktop (claude_desktop_config.json snippet)
- Phase status tracker

### 1.4 README.md
Basic README with:
- What this project does
- Installation steps
- Claude Code Desktop config
- Architecture diagram (ASCII)

## Deliverable
A working MCP server that:
1. Starts with `npm run dev`
2. Claude Code can connect to it
3. All 6 stub tools return mock data
4. README has clear setup instructions

---

---

# PHASE 2 — SQLite Storage Layer

## Goal
Replace mock data with real persistent storage using SQLite.

## Tasks

### 2.1 Setup SQLite
Use `better-sqlite3` package.

Database file: `storage/brave-mcp.db`

### 2.2 Create tables

```sql
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  summary TEXT,
  domain TEXT,
  created_at INTEGER,
  last_visited INTEGER,
  visit_count INTEGER DEFAULT 1
);

CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  folder TEXT,
  created_at INTEGER
);

CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  page_id TEXT,
  text TEXT NOT NULL,
  note TEXT,
  created_at INTEGER,
  FOREIGN KEY (page_id) REFERENCES pages(id)
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source_url TEXT,
  created_at INTEGER
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  urls TEXT,  -- JSON array
  created_at INTEGER,
  ended_at INTEGER
);
```

### 2.3 Wire MCP tools to SQLite
- `save_note()` → insert into `notes`
- `save_bookmark()` → insert into `bookmarks`
- `search_memory(query)` → full-text search over `pages.title` + `pages.summary` + `notes.content`
- `get_bookmarks()` → query `bookmarks` table

### 2.4 Add migration system
Simple version-based migration runner (no ORM needed).

## Deliverable
- Database auto-created on first run
- `save_note()` and `save_bookmark()` persist data
- `search_memory()` returns real SQLite FTS results
- Data survives server restart

---

---

# PHASE 3 — Browser Extension (Manifest V3)

## Goal
Build a Chrome/Brave extension that sends browsing activity to the MCP server via a local HTTP bridge.

## Why HTTP bridge?
MCP server uses stdio (for Claude). Extension can't speak stdio. Solution: add a small HTTP endpoint to the MCP server that the extension can POST to.

## Tasks

### 3.1 Add HTTP bridge to MCP server
Add Express endpoint alongside MCP:

```
POST /api/page-visit    → save page visit to SQLite
POST /api/capture       → save full page content
POST /api/bookmark      → save bookmark
POST /api/highlight     → save text selection
GET  /api/status        → health check
```

Port: `3747` (memorable: 3-7-4-7 = "BRAIN")

### 3.2 Browser extension

`manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "BraveMCP",
  "version": "0.1.0",
  "permissions": ["tabs", "activeTab", "bookmarks", "storage", "scripting"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }],
  "action": { "default_popup": "popup/popup.html" }
}
```

`background.js` — listen for:
- `chrome.tabs.onActivated` → POST `/api/page-visit`
- `chrome.tabs.onUpdated` → POST `/api/page-visit` (on complete)
- `chrome.bookmarks.onCreated` → POST `/api/bookmark`

`content.js` — expose:
- `getReadableContent()` → extract article text using Readability-like logic
- Listen for text selection → send highlight on user trigger

`popup/` — minimal UI:
- "Capture this page" button
- "Save note" quick input
- Connection status indicator (green/red dot)

### 3.3 Tab tracking via CDP (bonus if time)
Add a note in CLAUDE.md about how to enable CDP:
```
brave --remote-debugging-port=9222
```
And a stub tool `get_open_tabs_cdp()` that reads from localhost:9222/json.

## Deliverable
- Extension loadable in Brave via `chrome://extensions` → Load unpacked
- Visiting any page → record appears in SQLite
- "Capture" button → full content saved
- Popup shows connection status

---

---

# PHASE 4 — Vector Search + AI Pipeline

## Goal
Add semantic search so Claude can find content by meaning, not just keywords.

## Tasks

### 4.1 Setup ChromaDB
Use `chromadb` npm package.
ChromaDB runs as local HTTP server: `pip install chromadb && chroma run --path ./storage/chroma`

Add to README: ChromaDB setup instructions.

### 4.2 Embedding pipeline
When a page is saved:
1. Take `title + summary + first 500 chars of content`
2. Generate embedding via:
   - Option A: Ollama (`nomic-embed-text` model) — fully local
   - Option B: Anthropic API (`voyage-3` embeddings) — fallback
3. Store embedding in ChromaDB with metadata: `{url, title, page_id, created_at}`

### 4.3 AI summarization
When page captured:
1. Extract readable content (from extension or CDP)
2. Send to LLM for summary (max 3 sentences)
3. Extract 5 key entities/topics
4. Store summary in `pages.summary`

Use Ollama (`llama3.2` or `mistral`) first, fallback to Anthropic API.

Config in `.env`:
```
AI_PROVIDER=ollama  # or "anthropic"
OLLAMA_URL=http://localhost:11434
ANTHROPIC_API_KEY=optional
```

### 4.4 Wire semantic search to MCP
`search_memory(query)` now:
1. Generate embedding for query
2. Query ChromaDB for top-5 similar chunks
3. Fetch full page data from SQLite
4. Return ranked results with relevance score

### 4.5 New MCP tools
- `summarize_open_tabs()` → get all open tabs (from DB), generate cluster summary
- `find_related_content(query)` → semantic search + keyword search combined
- `summarize_research_topic(topic)` → aggregate all pages about a topic

## Deliverable
- Semantic search works: asking "MCP security" finds articles even if title says "Claude agent hardening"
- AI summaries auto-generated on capture
- ChromaDB running locally

---

---

# PHASE 5 — Advanced Tools + Digests

## Goal
Add the "second brain" layer — research sessions, weekly digests, tab management.

## Tasks

### 5.1 Research session detection
Auto-group related tabs into sessions:
- Detect topic clusters from open tabs
- Group by domain overlap + content similarity
- `get_research_sessions()` tool

### 5.2 Weekly/monthly digest
`generate_weekly_digest()`:
- Topics explored (from embeddings clustering)
- Most visited domains
- Pages captured
- Highlights saved
- "Questions you might still have" (inferred from research gaps)

### 5.3 Tab management tools
`suggest_tab_cleanup()`:
- Returns: Keep / Archive / Read Later / Close
- Based on: visit frequency, recency, content relevance to current research

### 5.4 Forgetting recovery
`find_forgotten_content(vague_description)`:
- Semantic search with time-decay weighting
- Prioritize pages visited multiple times
- "Article about MCP with a diagram I opened 3 times" → finds it

## Deliverable
- Weekly digest generates in < 10 seconds
- Tab cleanup suggestions work
- Vague queries successfully retrieve forgotten content

---

---

# PHASE 6 — Polish + GitHub Release

## Goal
Make this publishable as an open-source project.

## Tasks

### 6.1 One-command setup
```bash
npm run setup
# Should: install deps, init DB, start ChromaDB, start MCP server
```

### 6.2 Claude Code Desktop config
Add to README:
```json
// claude_desktop_config.json
{
  "mcpServers": {
    "brave-memory": {
      "command": "node",
      "args": ["/path/to/brave-mcp/mcp-server/dist/index.js"]
    }
  }
}
```

### 6.3 GitHub repo structure
```
.github/
  workflows/
    ci.yml          ← lint + type check
  ISSUE_TEMPLATE/
    bug_report.md
    feature_request.md
CONTRIBUTING.md
LICENSE             ← MIT
CHANGELOG.md
```

### 6.4 Demo
Record or document:
- Before: "I remember reading something about X..."
- After: Claude finds it via `search_memory()`

### 6.5 Final README
- Badges (license, version, stars)
- GIF/screenshot of it working
- Full feature list
- Comparison: "This vs Notion Web Clipper"

## Deliverable
- `git clone` → `npm run setup` → works
- Clean GitHub repo ready to share
- CONTRIBUTING.md for community PRs

---

---

## 🎯 HOW TO USE THIS WITH CLAUDE (Opsi 3 Workflow)

```
Loop per phase:

1. Kamu paste Phase N prompt ke Antigravity
2. Antigravity build + output file list
3. Kamu paste output summary ke Claude Code
4. Claude review, kasih feedback / approval
5. Kalau ada issues → Claude tulis fix instructions → paste ke Antigravity
6. Kalau approved → lanjut Phase N+1
```

### Template untuk laporan ke Claude setelah tiap phase:

```
Claude, Antigravity sudah selesai Phase [N].

Summary dari Antigravity:
[paste bagian "READY FOR CLAUDE REVIEW" dari Antigravity]

File structure saat ini:
[paste output `tree` command]

Questions:
- [anything you're unsure about]

Apakah kita lanjut ke Phase [N+1] atau ada yang perlu di-fix dulu?
```

---

*BraveMCP — Turn your browser into a second brain.*
*Built with Claude + Antigravity + MCP*
