import { test, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Point the storage layer at a throwaway DB BEFORE importing it — database.ts
// opens the connection at module load and honors BRAVEMCP_DB_PATH.
const TMP_DB = join(tmpdir(), `bravemcp-test-${process.pid}-${Date.now()}.db`);
process.env.BRAVEMCP_DB_PATH = TMP_DB;

const dbm = await import("./database.js");

// Migrations are normally run by the server at startup, not at module load.
dbm.runMigrations();

after(() => {
  try {
    dbm.db.close();
  } catch {
    /* ignore */
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(TMP_DB + suffix);
    } catch {
      /* ignore */
    }
  }
});

test("saveBookmark persists and getBookmarks returns it", () => {
  const id = dbm.saveBookmark("https://example.com", "Example", "Test");
  assert.ok(id);
  const found = dbm.getBookmarks().find((b) => b.url === "https://example.com");
  assert.ok(found);
  assert.equal(found?.title, "Example");
  assert.equal(found?.folder, "Test");
});

test("savePageVisit increments visit_count on a repeat URL", async () => {
  const url = "https://repeat.test/page";
  await dbm.savePageVisit(url, "First Title");
  await dbm.savePageVisit(url, "Second Title");
  const page = dbm.getPageContent(url);
  assert.equal(page.visit_count, 2);
  assert.equal(page.title, "Second Title");
});

test("saveNote is retrievable via hybridSearch (FTS5 path)", async () => {
  await dbm.saveNote("Quokka selfie photography tips", "https://note.test/quokka");
  const results = await dbm.hybridSearch("quokka");
  assert.ok(results.length > 0);
  const hit = results.some((r) => /quokka/i.test(JSON.stringify(r)));
  assert.ok(hit, "expected a search result mentioning the saved note");
});

test("getRecentlyVisitedPages and getLastActivePage reflect recent visits", async () => {
  await dbm.savePageVisit("https://recent.test/a", "Recent A");
  const recent = dbm.getRecentlyVisitedPages();
  assert.ok(recent.length > 0);
  const last = dbm.getLastActivePage();
  assert.ok(last);
  assert.match(last!.url, /\.test\//);
});
