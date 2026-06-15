import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractiveTabSummary,
  extractiveTopicSummary,
  extractiveWeeklyDigest,
  clusterTabsIntoGroupsFallback,
} from "./pipeline.js";

const TABS = `- Title: MCP Tools - Model Context Protocol
  URL: https://modelcontextprotocol.io/docs/concepts/tools
  Summary: Reference for MCP tool definitions.

- Title: Model Context Protocol
  URL: https://modelcontextprotocol.io
  Summary: No summary available.

- Title: browserbase/stagehand
  URL: https://github.com/browserbase/stagehand
  Summary: SDK for browser agents.
`;

test("extractiveTabSummary groups tabs by domain", () => {
  const out = extractiveTabSummary(TABS);
  assert.match(out, /3 tabs/);
  assert.match(out, /2 sites/);
  assert.match(out, /modelcontextprotocol\.io/);
  assert.match(out, /github\.com/);
});

test("extractiveTabSummary handles empty input", () => {
  assert.match(extractiveTabSummary(""), /No open tabs/i);
});

const PAGES = `- Title: MCP Tools
  URL: https://modelcontextprotocol.io/docs/concepts/tools
  Summary: How to define and register MCP tools.

- Title: MCP Home
  URL: https://modelcontextprotocol.io
  Summary: The official MCP landing page.
`;

test("extractiveTopicSummary lists sources and counts domains", () => {
  const out = extractiveTopicSummary("Model Context Protocol", PAGES);
  assert.match(out, /Model Context Protocol/);
  assert.match(out, /2 sources/);
  assert.match(out, /1 domain/);
  assert.match(out, /MCP Tools/);
});

test("extractiveTopicSummary handles empty input", () => {
  assert.match(extractiveTopicSummary("X", ""), /No captured pages/i);
});

const STATS = `- Total Page Visits: 24
- Captured Pages: 9
- Highlights Saved: 3
- Notes Written: 2
- Most Active Domains: modelcontextprotocol.io (6 visits), github.com (3 visits)`;
const CONTENT = `- Page: MCP Tools (https://modelcontextprotocol.io/docs/concepts/tools)
  Summary: How to define MCP tools.

- Note: "Test note..."
`;

test("extractiveWeeklyDigest reflects real stats and derives a question from top domain", () => {
  const out = extractiveWeeklyDigest(STATS, CONTENT);
  assert.match(out, /Weekly Research Digest/);
  assert.match(out, /Total Page Visits: 24/);
  assert.match(out, /modelcontextprotocol\.io/);
  assert.match(out, /most time on modelcontextprotocol\.io/);
});

test("extractiveWeeklyDigest handles no captures", () => {
  const out = extractiveWeeklyDigest("- Most Active Domains: None", "");
  assert.match(out, /No detailed page summaries/i);
});

test("clusterTabsIntoGroupsFallback groups tabs by domain", () => {
  const tabs = [
    { tabId: 1, url: "https://github.com/user/repo1", title: "repo1" },
    { tabId: 2, url: "https://github.com/user/repo2", title: "repo2" },
    { tabId: 3, url: "https://mem0.ai/docs", title: "Mem0 docs" },
  ];
  const groups = clusterTabsIntoGroupsFallback(tabs);
  assert.strictEqual(groups.length, 2);
  const githubGroup = groups.find(g => g.tabIds.includes(1) && g.tabIds.includes(2));
  assert.ok(githubGroup, "github tabs should be in same group");
  assert.ok(githubGroup!.name.length > 0);
  assert.ok(githubGroup!.color.length > 0);
});

test("clusterTabsIntoGroupsFallback handles empty input", () => {
  const groups = clusterTabsIntoGroupsFallback([]);
  assert.strictEqual(groups.length, 0);
});

test("clusterTabsIntoGroupsFallback assigns different colors to different groups", () => {
  const tabs = [
    { tabId: 1, url: "https://github.com/a", title: "a" },
    { tabId: 2, url: "https://google.com/b", title: "b" },
  ];
  const groups = clusterTabsIntoGroupsFallback(tabs);
  assert.strictEqual(groups.length, 2);
  assert.notStrictEqual(groups[0].color, groups[1].color);
});
