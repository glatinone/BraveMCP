# LinkedIn Post — BraveMCP launch

**Formula:** F9 Curiosity-Gap + build-log hybrid
**Voice:** enthusiastic builder, technical
**Char count:** ~1,250 (within the long-form range; hook lands well before "…see more")
**Suggested window:** Tue/Wed/Thu, 7:30–9:00 AM local
**Attach:** `hook-before-after.svg` exported to PNG (scroll-stopper)
**Link:** goes in the FIRST COMMENT, not the body (algorithm rule)

---

## Post body

Claude can read your files, your terminal, even your screen.

But it has no clue what you read in your browser last week.

So I spent the last month building BraveMCP: a local-first second brain that hands Claude Desktop my browsing history, bookmarks, and highlights through the Model Context Protocol.

The part that took three rewrites to get right:

MCP talks to Claude over stdio. A browser extension can't speak stdio, it can only fire outbound HTTP. The two halves literally cannot talk to each other.

My fix was a small Express bridge on port 3747, running inside the MCP server. The extension POSTs each page visit to it. The server stores everything in SQLite for keyword search and ChromaDB for vector similarity, then exposes 13 tools Claude can call.

So now I ask "that MCP security article I read last week?" and Claude runs find_forgotten_content, ranks by recency and visit count, and pulls up the page. Fully offline. Nothing leaves my laptop.

The bug I did not see coming: dotenv v17 printed one status line to stdout, which quietly corrupted the whole JSON-RPC channel. Two hours gone to a single log line.

It is open source now. All six build phases, the tests, the ugly commits, all of it.

What would you want your AI to actually remember?

#MCP #AI

---

## First comment (post immediately after)

Code, architecture write-up, and the 13 MCP tools are here: https://github.com/glatinone/BraveMCP

Built it as a deep-dive into MCP. Full technical breakdown in the article linked in the repo.
