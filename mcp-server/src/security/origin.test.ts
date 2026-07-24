import { test, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { isAllowedOrigin, decideOrigin, loadPinnedOrigin, savePinnedOrigin } from "./origin.js";

test("allows requests with no Origin header (non-browser clients)", () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin(null), true);
  assert.equal(isAllowedOrigin(""), true);
});

test("allows the browser extension's own origin", () => {
  assert.equal(isAllowedOrigin("chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef"), true);
  assert.equal(isAllowedOrigin("moz-extension://12345678-1234-1234-1234-123456789012"), true);
});

test("rejects any ordinary website origin", () => {
  assert.equal(isAllowedOrigin("https://evil.com"), false);
  assert.equal(isAllowedOrigin("http://localhost:3000"), false);
  assert.equal(isAllowedOrigin("https://attacker.example"), false);
});

test("rejects the sandboxed-iframe 'null' origin", () => {
  assert.equal(isAllowedOrigin("null"), false);
});

test("rejects an origin merely containing the extension scheme as a substring", () => {
  assert.equal(isAllowedOrigin("https://chrome-extension://evil.com"), false);
});

test("decideOrigin: no-Origin requests always pass through with the pin untouched", () => {
  assert.deepEqual(decideOrigin(undefined, null), { allow: true, pinnedOrigin: null });
  assert.deepEqual(decideOrigin(null, "chrome-extension://real"), {
    allow: true,
    pinnedOrigin: "chrome-extension://real",
  });
});

test("decideOrigin: rejects a non-extension origin outright, pin untouched", () => {
  assert.deepEqual(decideOrigin("https://evil.com", null), { allow: false, pinnedOrigin: null });
  assert.deepEqual(decideOrigin("https://evil.com", "chrome-extension://real"), {
    allow: false,
    pinnedOrigin: "chrome-extension://real",
  });
});

test("decideOrigin: first extension-shaped origin is trusted and pinned", () => {
  const result = decideOrigin("chrome-extension://abc123", null);
  assert.deepEqual(result, { allow: true, pinnedOrigin: "chrome-extension://abc123" });
});

test("decideOrigin: matching the existing pin keeps passing", () => {
  const result = decideOrigin("chrome-extension://abc123", "chrome-extension://abc123");
  assert.deepEqual(result, { allow: true, pinnedOrigin: "chrome-extension://abc123" });
});

test("decideOrigin: a different extension is rejected once a pin exists (closes the 'any neighbor extension' gap)", () => {
  const result = decideOrigin("chrome-extension://malicious-neighbor", "chrome-extension://abc123");
  assert.deepEqual(result, { allow: false, pinnedOrigin: "chrome-extension://abc123" });
});

test("persisted pin: round-trips through savePinnedOrigin/loadPinnedOrigin", () => {
  const path = join(tmpdir(), `bravemcp-trust-test-${process.pid}-${Date.now()}.json`);
  after(() => {
    try {
      rmSync(path);
    } catch {
      /* ignore */
    }
  });

  assert.equal(loadPinnedOrigin(path), null);
  savePinnedOrigin("chrome-extension://abc123", path);
  assert.equal(loadPinnedOrigin(path), "chrome-extension://abc123");
});

test("persisted pin: loadPinnedOrigin tolerates a missing or corrupt file", () => {
  const path = join(tmpdir(), `bravemcp-trust-missing-${process.pid}-${Date.now()}.json`);
  assert.equal(loadPinnedOrigin(path), null);
});
