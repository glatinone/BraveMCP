import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { getEmbedding } from "../ai/pipeline.js";
import { addPageEmbedding, queryChroma, isChromaConnected } from "./chroma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get DB path
const getDbPath = (): string => {
  if (process.env.BRAVEMCP_DB_PATH) {
    return process.env.BRAVEMCP_DB_PATH;
  }
  try {
    const resolvedPath = join(__dirname, "..", "..", "..", "storage", "brave-mcp.db");
    return resolvedPath;
  } catch {
    return "./storage/brave-mcp.db";
  }
};

const dbPath = getDbPath();

// Ensure the storage directory exists
const dbDir = dirname(dbPath);
try {
  mkdirSync(dbDir, { recursive: true });
} catch (error) {
  console.error("Failed to create storage directory:", error);
}

console.error(`Connecting to SQLite database at: ${dbPath}`);
export const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Simple migration system
interface Migration {
  id: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS pages (
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

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        folder TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY,
        page_id TEXT,
        text TEXT NOT NULL,
        note TEXT,
        created_at INTEGER,
        FOREIGN KEY (page_id) REFERENCES pages(id)
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source_url TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT,
        urls TEXT,  -- JSON array
        created_at INTEGER,
        ended_at INTEGER
      );
    `
  },
  {
    id: 2,
    name: "fts5_setup",
    sql: `
      -- Create FTS5 virtual table for searching memory
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        source_id,
        source_type, -- 'page' or 'note' or 'highlight'
        title,
        summary,
        content
      );
    `
  }
];

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at INTEGER NOT NULL
    );
  `);

  const executed = db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[];
  const executedIds = new Set(executed.map((row) => row.id));

  for (const migration of migrations) {
    if (!executedIds.has(migration.id)) {
      console.error(`Running migration ${migration.id}: ${migration.name}...`);
      const transaction = db.transaction(() => {
        db.exec(migration.sql);
        db.prepare("INSERT INTO schema_migrations (id, name, executed_at) VALUES (?, ?, ?)").run(
          migration.id,
          migration.name,
          Date.now()
        );
      });
      transaction();
    }
  }
  console.error("Migrations completed or up-to-date");
}

// Database helper operations

// Save a note to the database, index in FTS5 and ChromaDB (semantic search)
export async function saveNote(content: string, sourceUrl?: string): Promise<string> {
  const id = randomUUID();
  const createdAt = Date.now();
  
  db.prepare(`
    INSERT INTO notes (id, content, source_url, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, content, sourceUrl || null, createdAt);

  db.prepare(`
    INSERT INTO search_index (source_id, source_type, title, summary, content)
    VALUES (?, 'note', '', '', ?)
  `).run(id, content);

  // Generate and save embedding asynchronously
  try {
    const embedding = await getEmbedding(content);
    await addPageEmbedding(
      id,
      embedding,
      {
        url: sourceUrl || `note://${id}`,
        title: "Manual Note",
        created_at: createdAt
      },
      content
    );
  } catch (error) {
    console.error("Failed to generate note embedding:", error);
  }

  return id;
}

// Save a bookmark
export function saveBookmark(url: string, title: string, folder?: string): string {
  const id = randomUUID();
  const createdAt = Date.now();

  db.prepare(`
    INSERT INTO bookmarks (id, url, title, folder, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, url, title, folder || null, createdAt);

  return id;
}

// Get all bookmarks
export function getBookmarks() {
  return db.prepare(`
    SELECT url, title, folder FROM bookmarks
    ORDER BY created_at DESC
  `).all() as Array<{ url: string; title: string; folder: string | null }>;
}

// Save a page visit (called when user navigates to a URL)
export async function savePageVisit(url: string, title: string): Promise<string> {
  const existing = db.prepare("SELECT id, visit_count FROM pages WHERE url = ?").get(url) as any;
  const now = Date.now();
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = "local";
  }

  if (existing) {
    db.prepare(`
      UPDATE pages
      SET last_visited = ?, visit_count = visit_count + 1, title = ?
      WHERE id = ?
    `).run(now, title, existing.id);

    db.prepare(`
      UPDATE search_index
      SET title = ?
      WHERE source_id = ? AND source_type = 'page'
    `).run(title, existing.id);

    return existing.id;
  } else {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO pages (id, url, title, domain, created_at, last_visited, visit_count)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, url, title, domain, now, now);

    db.prepare(`
      INSERT INTO search_index (source_id, source_type, title, summary, content)
      VALUES (?, 'page', ?, '', '')
    `).run(id, title);

    // Generate page visit embedding
    try {
      const embedding = await getEmbedding(title);
      await addPageEmbedding(
        id,
        embedding,
        { url, title, created_at: now },
        title
      );
    } catch (err) {
      console.error("Failed to generate page visit embedding:", err);
    }

    return id;
  }
}

// Save a full page capture content (with summary and vector indexing)
export async function savePageContent(url: string, title: string, content: string, summary: string = ""): Promise<string> {
  const existing = db.prepare("SELECT id FROM pages WHERE url = ?").get(url) as any;
  const now = Date.now();
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = "local";
  }

  let pageId = "";
  if (existing) {
    pageId = existing.id;
    db.prepare(`
      UPDATE pages
      SET title = ?, content = ?, summary = ?, last_visited = ?
      WHERE id = ?
    `).run(title, content, summary, now, pageId);

    const ftsExisting = db.prepare("SELECT rowid FROM search_index WHERE source_id = ? AND source_type = 'page'").get(pageId) as any;
    if (ftsExisting) {
      db.prepare(`
        UPDATE search_index
        SET title = ?, summary = ?, content = ?
        WHERE source_id = ? AND source_type = 'page'
      `).run(title, summary, content, pageId);
    } else {
      db.prepare(`
        INSERT INTO search_index (source_id, source_type, title, summary, content)
        VALUES (?, 'page', ?, ?, ?)
      `).run(pageId, title, summary, content);
    }
  } else {
    pageId = randomUUID();
    db.prepare(`
      INSERT INTO pages (id, url, title, content, summary, domain, created_at, last_visited, visit_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(pageId, url, title, content, summary, domain, now, now);

    db.prepare(`
      INSERT INTO search_index (source_id, source_type, title, summary, content)
      VALUES (?, 'page', ?, ?, ?)
    `).run(pageId, title, summary, content);
  }

  // Index in ChromaDB
  try {
    const indexText = `${title}\n\nSummary: ${summary}\n\n${content.substring(0, 1000)}`;
    const embedding = await getEmbedding(indexText);
    await addPageEmbedding(
      pageId,
      embedding,
      { url, title, created_at: now },
      indexText
    );
  } catch (err) {
    console.error("Failed to generate embedding for page capture:", err);
  }

  return pageId;
}

// Save a highlighted selection
export async function saveHighlight(url: string, text: string, note?: string): Promise<string> {
  let page = db.prepare("SELECT id FROM pages WHERE url = ?").get(url) as any;
  if (!page) {
    const pageId = await savePageVisit(url, url);
    page = { id: pageId };
  }

  const id = randomUUID();
  const createdAt = Date.now();

  db.prepare(`
    INSERT INTO highlights (id, page_id, text, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, page.id, text, note || null, createdAt);

  db.prepare(`
    INSERT INTO search_index (source_id, source_type, title, summary, content)
    VALUES (?, 'highlight', 'Text Highlight', ?, ?)
  `).run(id, note || "Highlight", text);

  // Index highlight in ChromaDB
  try {
    const indexText = `Highlight from ${url}: "${text}" ${note ? `(Note: ${note})` : ""}`;
    const embedding = await getEmbedding(indexText);
    await addPageEmbedding(
      id,
      embedding,
      { url, title: `Highlight from ${url}`, created_at: createdAt },
      indexText
    );
  } catch (err) {
    console.error("Failed to generate highlight embedding:", err);
  }

  return id;
}

// Get page content
export function getPageContent(url: string) {
  return db.prepare("SELECT url, title, content, summary, visit_count, last_visited FROM pages WHERE url = ?").get(url) as any;
}

// Hybrid Search: combines FTS5 SQLite queries with ChromaDB vector similarity matches
export async function hybridSearch(queryText: string) {
  const cleanQuery = queryText
    .replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" OR ");

  const mergedMap = new Map<string, { id: string; relevance: number; source: string }>();

  // 1. Vector Search via ChromaDB (if connected)
  if (isChromaConnected()) {
    try {
      const queryEmbedding = await getEmbedding(queryText);
      const chromaMatches = await queryChroma(queryEmbedding, 10);
      
      for (const match of chromaMatches) {
        // cosine distance ranges from 0 (identical) to 2 (opposite).
        // cosine similarity = 1 - distance
        const relevance = Math.max(0.1, Math.min(0.99, 1 - match.distance));
        mergedMap.set(match.id, {
          id: match.id,
          relevance,
          source: "semantic"
        });
      }
    } catch (err) {
      console.error("Error executing semantic query in ChromaDB:", err);
    }
  }

  // 2. Keyword Search via SQLite FTS5
  if (cleanQuery) {
    try {
      const sqliteMatches = db.prepare(`
        SELECT source_id, bm25(search_index) as score
        FROM search_index
        WHERE search_index MATCH ?
        ORDER BY score
        LIMIT 10
      `).all(cleanQuery) as Array<{ source_id: string; score: number }>;

      for (const match of sqliteMatches) {
        // Map bm25 score (usually negative for good matches) to a relevance score (0-1)
        const keywordRelevance = Math.max(0.1, Math.min(0.99, 1 / (1 + Math.exp(match.score))));
        
        if (mergedMap.has(match.source_id)) {
          const existing = mergedMap.get(match.source_id)!;
          // Boost score if match is found in both (hybrid match)
          existing.relevance = Math.min(0.99, Math.max(existing.relevance, keywordRelevance) * 1.1);
          existing.source = "hybrid";
        } else {
          mergedMap.set(match.source_id, {
            id: match.source_id,
            relevance: keywordRelevance,
            source: "keyword"
          });
        }
      }
    } catch (err) {
      console.error("Error executing FTS5 keyword query, falling back to LIKE matches:", err);
      // fallback simple LIKE logic (does not calculate BM25 score)
      try {
        const pages = db.prepare("SELECT id FROM pages WHERE title LIKE ? OR content LIKE ? LIMIT 5").all(`%${queryText}%`, `%${queryText}%`) as any[];
        const notes = db.prepare("SELECT id FROM notes WHERE content LIKE ? LIMIT 5").all(`%${queryText}%`) as any[];
        
        const fallbacks = [...pages.map(p => p.id), ...notes.map(n => n.id)];
        for (const fId of fallbacks) {
          if (!mergedMap.has(fId)) {
            mergedMap.set(fId, {
              id: fId,
              relevance: 0.5,
              source: "fallback"
            });
          }
        }
      } catch (fallbackErr) {
        console.error("Fallback search failed:", fallbackErr);
      }
    }
  }

  // 3. Hydrate matching IDs from database
  const results = [];
  for (const [id, value] of mergedMap.entries()) {
    // Check page
    const page = db.prepare("SELECT url, title, summary FROM pages WHERE id = ?").get(id) as any;
    if (page) {
      results.push({
        url: page.url,
        title: page.title || "Page",
        summary: page.summary || "",
        relevance: value.relevance
      });
      continue;
    }

    // Check highlight
    const highlight = db.prepare("SELECT highlights.text, highlights.note, pages.url FROM highlights LEFT JOIN pages ON highlights.page_id = pages.id WHERE highlights.id = ?").get(id) as any;
    if (highlight) {
      results.push({
        url: highlight.url || "",
        title: "Text Highlight: " + (highlight.note || ""),
        summary: highlight.text || "",
        relevance: value.relevance
      });
      continue;
    }

    // Check note
    const note = db.prepare("SELECT content, source_url FROM notes WHERE id = ?").get(id) as any;
    if (note) {
      results.push({
        url: note.source_url || "",
        title: "Manual Note",
        summary: note.content || "",
        relevance: value.relevance
      });
    }
  }

  // Sort by combined relevance score descending
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, 10);
}
export function getPagesWithContent() {
  return db.prepare("SELECT id, url, title, summary, content FROM pages WHERE content IS NOT NULL").all() as Array<{
    id: string;
    url: string;
    title: string;
    summary: string | null;
    content: string;
  }>;
}

// Get page visits within the last N days
export function getRecentPageVisits(limitDays: number) {
  const cutoff = Date.now() - (limitDays * 24 * 60 * 60 * 1000);
  return db.prepare(`
    SELECT id, url, title, summary, domain, last_visited, visit_count
    FROM pages
    WHERE last_visited >= ?
    ORDER BY last_visited DESC
  `).all(cutoff) as Array<{
    id: string;
    url: string;
    title: string;
    summary: string | null;
    domain: string;
    last_visited: number;
    visit_count: number;
  }>;
}

// Get text highlights within the last N days
export function getRecentHighlights(limitDays: number) {
  const cutoff = Date.now() - (limitDays * 24 * 60 * 60 * 1000);
  return db.prepare(`
    SELECT highlights.id, highlights.text, highlights.note, highlights.created_at, pages.title as page_title, pages.url as page_url
    FROM highlights
    LEFT JOIN pages ON highlights.page_id = pages.id
    WHERE highlights.created_at >= ?
    ORDER BY highlights.created_at DESC
  `).all(cutoff) as Array<{
    id: string;
    text: string;
    note: string | null;
    created_at: number;
    page_title: string | null;
    page_url: string | null;
  }>;
}

// Get manual notes within the last N days
export function getRecentNotes(limitDays: number) {
  const cutoff = Date.now() - (limitDays * 24 * 60 * 60 * 1000);
  return db.prepare(`
    SELECT id, content, source_url, created_at
    FROM notes
    WHERE created_at >= ?
    ORDER BY created_at DESC
  `).all(cutoff) as Array<{
    id: string;
    content: string;
    source_url: string | null;
    created_at: number;
  }>;
}

// Save a research session
export function saveResearchSession(name: string, urls: string[]): string {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (id, name, urls, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, name, JSON.stringify(urls), now);
  return id;
}

// Get all research sessions
export function getResearchSessions() {
  return db.prepare(`
    SELECT id, name, urls, created_at, ended_at
    FROM sessions
    ORDER BY created_at DESC
  `).all().map((row: any) => ({
    id: row.id as string,
    name: row.name as string | null,
    urls: JSON.parse((row.urls as string) || "[]") as string[],
    created_at: row.created_at as number,
    ended_at: row.ended_at as number | null
  }));
}

// Get the most recently visited page (proxy for active tab)
export function getLastActivePage() {
  return db.prepare(`
    SELECT url, title FROM pages
    ORDER BY last_visited DESC
    LIMIT 1
  `).get() as { url: string; title: string } | undefined;
}

// Get pages visited in the last 4 hours (proxy for open tabs)
export function getRecentlyVisitedPages() {
  const cutoff = Date.now() - (4 * 60 * 60 * 1000);
  return db.prepare(`
    SELECT url, title, last_visited as tabId FROM pages
    WHERE last_visited >= ?
    ORDER BY last_visited DESC
    LIMIT 20
  `).all(cutoff) as Array<{ url: string; title: string; tabId: number }>;
}
