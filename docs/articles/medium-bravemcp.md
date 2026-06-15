# Giving Claude a Memory of Everything I Browse

### A technical deep-dive into BraveMCP: a local-first browser second brain wired to Claude Desktop through the Model Context Protocol

*(Medium has no frontmatter. Paste the body below into the editor. Use `cover-banner.svg` exported to PNG as the title image, and drop the other visuals where marked.)*

![BraveMCP](https://raw.githubusercontent.com/glatinone/BraveMCP/master/docs/assets/cover-banner.svg)

---

Claude can read my files, my terminal, even my screen. But it had no idea what I read in my browser yesterday.

I kept hitting the same wall. I'd read three great articles on a topic over the week, then ask Claude about it and get: *"I don't have access to your browsing history."* The context was sitting right there in my browser, completely invisible to the one tool I wanted to reason over it.

So over the last month I built **BraveMCP**, a local-first "second brain" that gives Claude Desktop access to my browsing history, bookmarks, highlights, and notes. Everything runs on my machine. Nothing touches a cloud.

This is the technical story: the one constraint that shaped the whole architecture, how the search layer works, and the two bugs that ate the most hours.

## One constraint shaped the entire design

MCP servers communicate with Claude Desktop over **stdio**, a JSON-RPC stream on standard in and out. A browser extension runs in a locked-down sandbox and cannot speak stdio at all. It can only make outbound HTTP requests.

Sit with that for a second. The browser half and the Claude half of this system physically cannot talk to each other. There is no direct channel.

![How BraveMCP works](https://raw.githubusercontent.com/glatinone/BraveMCP/master/docs/assets/architecture.svg)

The answer was a bridge. I run a small Express server on port `3747` inside the very same process as the MCP server. The extension POSTs every page visit, bookmark, and highlight to that bridge. The MCP server writes it all to a local database. When Claude later calls a tool, the server reads from that same database. The two halves never speak directly; they pass notes through shared storage.

## Hybrid search: keywords and meaning

Keyword search misses synonyms. Vector search misses exact terms. I wanted both, so BraveMCP runs them together.

SQLite with the FTS5 extension handles BM25 keyword ranking. ChromaDB handles cosine vector similarity, which is what lets a search for "MCP security" surface a page actually titled "Claude agent hardening." Results that show up in both get a relevance boost.

And if ChromaDB happens to be down, the server quietly falls back to keyword-only search rather than throwing an error. Local-first software has to cope with whatever services you actually have running at the moment.

## The fallback that taught me a lesson

When BraveMCP captures a page, it generates a summary and a vector embedding. It tries Ollama first, fully local, then falls back to the Anthropic API.

My first version had a lazy failure mode. With no LLM available, the synthesis tools returned a fixed sentence: *"Synthesis on X: relies on the gathered browser research database."* It said the exact same thing regardless of what you asked. Worthless.

So I rewrote every fallback to be **extractive**. Instead of a canned line, the tools now parse the real captured data and build a summary from it: the actual matching pages, grouped by domain, with real snippets. Ask for a topic and you get the genuine sources, even with no AI model running anywhere. The feature degrades gracefully instead of degrading into noise.

## Recovering what you forgot

My favorite tool is `find_forgotten_content`. You hand it a fuzzy description and it runs hybrid search, then re-ranks the results with time decay and a visit-count boost:

```
timeDecay  = max(0.5, exp(-0.01 * daysElapsed))
visitBoost = 1 + 0.2 * log(visitCount)
adjusted   = relevance * timeDecay * visitBoost
```

A page you opened three times last week outranks one you glanced at once today. That is much closer to how human memory actually behaves than a flat relevance score.

![Before and after](https://raw.githubusercontent.com/glatinone/BraveMCP/master/docs/assets/hook-before-after.svg)

## Two bugs worth remembering

**dotenv printed one line and broke everything.** MCP speaks over stdout. dotenv v17 prints a friendly status line to stdout when it loads your environment. That single line corrupted the JSON-RPC stream, and Claude Desktop rejected the server with an opaque parse error. Pinning to dotenv v16 fixed it. I lost two hours to one log statement.

**Two processes, one truth.** Claude Desktop and my development client each spawn their own MCP server. Only one can bind port `3747`, so only one receives the extension's data. The other sat there with empty in-memory state and returned nothing. The lesson: in-memory state is a lie when more than one process exists. I moved the source of truth into SQLite, which every instance shares.

## What it is now

BraveMCP ships a Manifest V3 extension, an MCP server with 13 tools, the SQLite plus ChromaDB hybrid search layer, an AI pipeline with graceful fallbacks, and a test suite running in CI. It is open source under the MIT license.

The repo, with the full tool list and setup guide, is here: **[github.com/glatinone/BraveMCP](https://github.com/glatinone/BraveMCP)**

If you are building anything on MCP, the stdio-versus-HTTP bridge is the pattern worth taking with you. And I am still curious: what would you want your AI to remember?
