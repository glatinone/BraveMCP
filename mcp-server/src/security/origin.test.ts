import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin } from "./origin.js";

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
