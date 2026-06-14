# Contributing to BraveMCP

Thank you for your interest in contributing to BraveMCP! This document provides guidelines for setting up your environment, code style, and submitting changes.

---

## 🛠️ Repository Setup

If this repository was initialized locally without Git tracking, start by initializing Git and making the initial commit:

```bash
# Initialize git repository
git init

# Add all files to staging
git add .

# Create initial commit
git commit -m "feat: initial BraveMCP release v0.1.0"
```

---

## 💻 Local Development Setup

To configure BraveMCP locally for making changes:

1. Run the setup orchestrator at root:
   ```bash
   npm run setup
   ```
2. Follow setup instructions to link the server to Claude Desktop and ChromaDB.
3. Test database logic and AI pipelines by running:
   ```bash
   npx tsx scratch/test-brain.ts
   ```

## 📝 Code Guidelines
- **ES Modules**: The project uses Node.js ES Modules (`"type": "module"`). All internal TypeScript imports must include the `.js` suffix (e.g. `import { db } from "./storage/database.js"`).
- **TypeScript**: Ensure all code is strictly typed. Run `npm run build` inside `mcp-server/` to verify there are no compilation errors.
- **SQLite**: Keep schema migrations clean. All schema updates must be added as a new migration step in the `migrations` array inside `mcp-server/src/storage/database.ts`.

## 🚀 Pull Request Process
1. Fork the repository and create your branch from `main`.
2. Implement your feature or bug fix.
3. Verify compilation and tests pass successfully.
4. Submit your pull request with a descriptive title and detailed notes of the changes.
