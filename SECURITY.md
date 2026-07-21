# Security Policy

## Reporting a vulnerability

If you find a security issue in BraveMCP, please report it privately via
[GitHub Security Advisories](https://github.com/glatinone/BraveMCP/security/advisories/new)
rather than opening a public issue. We aim to acknowledge reports within 72 hours.

## Scope & threat model

BraveMCP is a **local-first** tool: the browser extension, the HTTP bridge, and the
storage (SQLite / ChromaDB) all run on your own machine. Nothing is sent to a remote
BraveMCP-operated server.

- **HTTP bridge (`localhost:3747`).** A plain `localhost` bind is reachable by any
  browser tab's JavaScript, not just the extension. The bridge enforces an `Origin`
  allowlist (`chrome-extension://…` / `moz-extension://…`, or no `Origin` header at
  all for a same-machine non-browser client) so an ordinary website cannot call
  `/api/capture`, `/api/note`, `/api/stage-groups`, or any other route. See
  [Security](README.md#security) in the README and `mcp-server/src/security/origin.ts`.
- **Captured browsing data** is stored locally (SQLite, and ChromaDB if running) and
  is only ever read back by the MCP server you configured in your own AI client. It
  is not uploaded anywhere by this project.
- **AI provider keys.** If `AI_PROVIDER=anthropic`, your `ANTHROPIC_API_KEY` is read
  from your local `.env` and used only to call the Anthropic API directly from your
  machine — it is never logged or sent anywhere else. The default `ollama` provider
  makes no external network call at all.
- **Untrusted page content.** Captured pages are treated as data, not instructions —
  content from a visited page should never be able to make the MCP server or the AI
  client take an action on its behalf. If you find a case where it can (a prompt
  injection or memory-poisoning path), that is a valid, in-scope report.

## Handling of secrets

`.env` (holding `ANTHROPIC_API_KEY` if set) is git-ignored and never committed. The
server does not log request bodies or captured page content to any external service.
