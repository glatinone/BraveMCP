# Contributing to BraveMCP

Thank you for your interest in contributing to BraveMCP! This document provides guidelines for setting up your environment, code style, and submitting changes.

---

## 🛠️ Repository Setup

```bash
git clone https://github.com/glatinone/BraveMCP.git
cd BraveMCP
npm run setup
```

`npm run setup` installs server dependencies, builds the TypeScript, and
checks local service ports. Follow its printed instructions to link the
server to Claude Desktop and (optionally) start ChromaDB.

---

## 💻 Local Development

All commands below run inside `mcp-server/`:

```bash
npm run dev         # run the server live with tsx
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # compile to dist/
```

Before opening a PR, make sure `npm run typecheck`, `npm run lint`, and
`npm run build` all pass — the same three steps CI runs.

## 📝 Code Guidelines
- **ES Modules**: The project uses Node.js ES Modules (`"type": "module"`). All internal TypeScript imports must include the `.js` suffix (e.g. `import { db } from "./storage/database.js"`).
- **TypeScript**: Keep code strictly typed. `npm run typecheck` must pass with no errors.
- **Linting**: `npm run lint` must report no errors. `no-explicit-any` is a warning, reserved for dynamic MCP/HTTP payload boundaries — avoid adding new `any` elsewhere.
- **SQLite**: Keep schema migrations clean. All schema updates must be added as a new migration step in the `migrations` array inside `mcp-server/src/storage/database.ts`.

## 🚀 Pull Request Process
1. Fork the repository and create your branch from `main`.
2. Implement your feature or bug fix.
3. Verify compilation and tests pass successfully.
4. Submit your pull request with a descriptive title and detailed notes of the changes.
