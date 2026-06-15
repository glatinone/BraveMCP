---
title: "I gave Claude a memory of everything I browse — here's the architecture"
published: false
description: "How I wired a browser extension to Claude Desktop through the Model Context Protocol, with a local SQLite + ChromaDB hybrid search and a graceful no-LLM fallback."
tags: mcp, ai, typescript, opensource
cover_image: https://raw.githubusercontent.com/glatinone/BraveMCP/master/docs/assets/cover-banner.svg
---

> Note: dev.to may not render SVG covers/images. Export the SVGs in `docs/assets/` to PNG before publishing.

Claude can read my files, my terminal, even my screen. But it had no idea what I read in my browser yesterday.

That gap bugged me enough to build **[BraveMCP](https://github.com/glatinone/BraveMCP)**: a local-first "second brain" that gives Claude Desktop access to my browsing history, bookmarks, highlights, and notes through the Model Context Protocol (MCP). Everything stays on my machine. No cloud, no tracking.

This is the technical write-up: the architecture, the one constraint that shaped the whole design, and the bugs that cost me the most time.

## The constraint that shaped everything

MCP servers talk to Claude Desktop over **stdio** — a JSON-RPC stream on stdin/stdout. A browser extension lives in a sandbox and **cannot speak stdio**. It can only make outbound HTTP requests.

So the two halves of the system physically cannot talk to each other directly. That single fact drove the entire design.

![BraveMCP architecture](https://raw.githubusercontent.com/glatinone/BraveMCP/master/docs/assets/architecture.svg)

The fix is a small **HTTP bridge**: an Express server running on port `3747`, *inside the same process* as the MCP server. The extension POSTs browsing events to it; the MCP server reads from the shared database when Claude calls a tool.

```
Browser → Extension (MV3) → HTTP bridge :3747 → MCP server ⇄ Claude (stdio)
                                                      ↑
                                          SQLite + ChromaDB + AI pipeline
```

## The storage layer: hybrid search

Keyword search and semantic search each miss things keyword-only or vector-only setups would catch. So BraveMCP runs both and merges them.

- **SQLite with FTS5** for fast BM25 keyword ranking over titles, summaries, notes, and highlights.
- **ChromaDB** for cosine vector similarity, so "MCP security" still finds a page titled "Claude agent hardening."

```ts
// Merge keyword + vector hits; boost items that appear in both
const merged = new Map<string, Match>();
for (const m of chromaMatches) merged.set(m.id, { ...m, source: "semantic" });
for (const m of ftsMatches) {
  const existing = merged.get(m.id);
  if (existing) existing.relevance *= 1.1; // appears in both → boost
  else merged.set(m.id, { ...m, source: "keyword" });
}
```

If ChromaDB is not running, the server degrades to FTS5-only instead of failing. Local-first means it has to work with whatever services you actually have up.

## The AI pipeline, and why the fallback matters

When a page is captured, BraveMCP generates a summary and an embedding. It tries **Ollama** first (fully local: `llama3.2` for summaries, `nomic-embed-text` for embeddings), then falls back to the **Anthropic API**.

But here's the trap I walked into. The first version, when *no* LLM was available, returned canned strings:

```ts
// before: this ignores the actual data entirely
return `Synthesis on "${topic}": Relies on the gathered browser research database.`;
```

That is useless. It says the same thing no matter what you searched. So I rewrote every fallback to be **extractive** — to build a real summary from the actual data:

```ts
export function extractiveTopicSummary(topic: string, pagesText: string): string {
  const entries = parseEntries(pagesText);
  if (entries.length === 0) return `No captured pages found for "${topic}".`;
  const byDomain = groupByDomain(entries);
  // ...lists real sources, domains, and snippets pulled from SQLite
}
```

Now, with no LLM at all, asking for a topic synthesis returns the actual matching pages grouped by domain with real snippets. Different input produces different output. The "AI" tools stay useful even when there is no AI running.

## Recovering forgotten pages

The tool I use most is `find_forgotten_content`. You give it a vague description and it does hybrid search, then re-ranks with **time decay** and a **visit-count boost**:

```ts
const timeDecay  = Math.max(0.5, Math.exp(-0.01 * daysElapsed));
const visitBoost = 1 + 0.2 * Math.log(visitCount);
const adjusted   = Math.min(0.99, relevance * timeDecay * visitBoost);
```

A page you opened three times last week beats one you glanced at once today. That matches how memory actually feels.

![Before and after BraveMCP](https://raw.githubusercontent.com/glatinone/BraveMCP/master/docs/assets/hook-before-after.svg)

## Two bugs that cost me hours

**1. dotenv v17 broke the entire protocol.** MCP communicates over stdout. dotenv v17 prints a status line (`◇ injected env...`) to stdout by default. That one line corrupted the JSON-RPC channel and Claude Desktop refused to connect with a cryptic `Unexpected token` error. The fix was pinning `dotenv@16`. Two hours on a single log line.

**2. The dual-process state problem.** Claude Desktop and my dev client each spawn their own copy of the MCP server. Only the instance that grabs port `3747` receives extension data. The other had empty in-memory state, so tab tools returned nothing. The fix: stop treating in-memory state as the source of truth and fall back to SQLite, which both processes share.

## What's in the box

- A Manifest V3 extension (tab sync, bookmarks, context-menu highlights)
- An MCP server exposing **13 tools** (`search_memory`, `find_forgotten_content`, `summarize_research_topic`, `generate_weekly_digest`, `suggest_tab_cleanup`, and more)
- SQLite + ChromaDB hybrid search
- A test suite on Node's built-in runner, wired into CI

It is open source, MIT licensed: **https://github.com/glatinone/BraveMCP**

If you are building on MCP, the stdio-vs-HTTP bridge pattern is the part worth stealing. What would you want your AI to remember?
