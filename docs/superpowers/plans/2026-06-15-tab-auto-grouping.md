# Tab Auto-Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Auto-Group Tabs" button to the BraveMCP extension popup that uses AI to cluster open tabs into named, colored browser groups — with a one-click Undo that dissolves all groups.

**Architecture:** Popup sends `auto_group_tabs` message to background.js → background queries all open tabs → POSTs to new `/api/suggest-grouping` endpoint on MCP server → server AI clusters tabs into named groups (Ollama/Anthropic, domain-based fallback) → returns `{groups: [{name, color, tabIds[]}]}` → background applies groups via `chrome.tabGroups` API → stores grouped tab IDs in `chrome.storage.session` → popup shows Undo button. Undo sends `undo_grouping` message → background ungrouped all stored tab IDs → clears session storage.

**Tech Stack:** Chrome Extension MV3 (`chrome.tabGroups`, `chrome.storage.session`), Node.js/TypeScript Express MCP server, existing Ollama/Anthropic/extractive AI pipeline pattern.

---

### Task 1: Add `tabGroups` permission to manifest

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: Add permission**

Edit `extension/manifest.json` — add `"tabGroups"` to the permissions array:

```json
{
  "manifest_version": 3,
  "name": "BraveMCP",
  "version": "0.1.0",
  "description": "Local Browser Memory system that connects browsing activity to Claude Desktop via MCP.",
  "permissions": [
    "tabs",
    "activeTab",
    "bookmarks",
    "storage",
    "scripting",
    "contextMenus",
    "tabGroups"
  ],
  "host_permissions": [
    "http://localhost:3747/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/manifest.json
git commit -m "feat(extension): add tabGroups permission"
```

---

### Task 2: Add `clusterTabsIntoGroups` to pipeline.ts

**Files:**
- Modify: `mcp-server/src/ai/pipeline.ts`
- Test: `mcp-server/src/ai/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the end of `mcp-server/src/ai/pipeline.test.ts`, updating the import to include `clusterTabsIntoGroupsFallback`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractiveTabSummary,
  extractiveTopicSummary,
  extractiveWeeklyDigest,
  clusterTabsIntoGroupsFallback,
} from "./pipeline.js";
```

Then add these tests at the end of the file:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```
cd mcp-server && node --test --experimental-strip-types src/ai/pipeline.test.ts
```

Expected: `SyntaxError` or import error — `clusterTabsIntoGroupsFallback` not exported yet.

- [ ] **Step 3: Add types and functions to pipeline.ts**

Add the following after the existing `fallbackClustering` function (around line 425) in `mcp-server/src/ai/pipeline.ts`:

```typescript
// ---------------------------------------------------------------------------
// Tab Auto-Grouping
// ---------------------------------------------------------------------------

const GROUP_COLORS = ["blue", "green", "red", "yellow", "purple", "pink", "cyan", "orange", "grey"] as const;
type TabGroupColor = typeof GROUP_COLORS[number];

export interface TabInput {
  tabId: number;
  url: string;
  title: string;
}

export interface TabGroup {
  name: string;
  color: TabGroupColor;
  tabIds: number[];
}

export function clusterTabsIntoGroupsFallback(tabs: TabInput[]): TabGroup[] {
  const domainMap = new Map<string, number[]>();
  for (const tab of tabs) {
    let domain = "other";
    try { domain = new URL(tab.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(tab.tabId);
  }
  return [...domainMap.entries()].map(([domain, tabIds], i) => ({
    name: domain,
    color: GROUP_COLORS[i % GROUP_COLORS.length],
    tabIds,
  }));
}

function parseGroupsJson(text: string, tabs: TabInput[]): TabGroup[] {
  try {
    const cleanText = text.replace(/```json|```/g, "").trim();
    const raw = JSON.parse(cleanText) as Array<{ name: string; color: string; indices: number[] }>;
    return raw.map((g, i) => ({
      name: g.name || `Group ${i + 1}`,
      color: (GROUP_COLORS.includes(g.color as TabGroupColor)
        ? g.color
        : GROUP_COLORS[i % GROUP_COLORS.length]) as TabGroupColor,
      tabIds: (g.indices || [])
        .map(idx => tabs[idx]?.tabId)
        .filter((id): id is number => id !== undefined),
    })).filter(g => g.tabIds.length > 0);
  } catch {
    return clusterTabsIntoGroupsFallback(tabs);
  }
}

export async function clusterTabsIntoGroups(tabs: TabInput[]): Promise<TabGroup[]> {
  if (tabs.length === 0) return [];

  const tabList = tabs.map((t, i) => {
    let host = t.url;
    try { host = new URL(t.url).hostname; } catch { /* ignore */ }
    return `${i}: "${t.title}" (${host})`;
  }).join("\n");

  const prompt = `You are a browser tab organizer. Cluster the following open tabs into 2–6 logical groups based on topic.

Tabs (by index):
${tabList}

Rules:
- Each group gets a short descriptive name (2–4 words, Title Case)
- Pick one color per group from: blue, green, red, yellow, purple, pink, cyan, orange, grey
- Every tab index must appear in exactly one group
- Return ONLY a JSON array — no markdown fences, no explanation

Format:
[{"name": "AI Research", "color": "blue", "indices": [0, 1, 2]}, ...]`;

  if (provider === "ollama") {
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0.1 },
          stream: false
        })
      });
      if (!res.ok) throw new Error(`Ollama tab clustering error: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return parseGroupsJson(data.message.content, tabs);
    } catch (error) {
      console.error("Ollama tab clustering failed, using domain fallback:", error);
      return clusterTabsIntoGroupsFallback(tabs);
    }
  } else {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic tab clustering error: ${await res.text()}`);
      const data = (await res.json()) as { content: { text: string }[] };
      return parseGroupsJson(data.content[0].text, tabs);
    } catch (error) {
      console.error("Anthropic tab clustering failed, using domain fallback:", error);
      return clusterTabsIntoGroupsFallback(tabs);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd mcp-server && node --test --experimental-strip-types src/ai/pipeline.test.ts
```

Expected: all tests PASS (8 total — 5 existing + 3 new).

- [ ] **Step 5: Typecheck**

```
cd mcp-server && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/ai/pipeline.ts mcp-server/src/ai/pipeline.test.ts
git commit -m "feat(ai): add clusterTabsIntoGroups for browser tab grouping"
```

---

### Task 3: Add `/api/suggest-grouping` endpoint to index.ts

**Files:**
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Add clusterTabsIntoGroups to the import**

In `mcp-server/src/index.ts`, update the import from `./ai/pipeline.js` to include `clusterTabsIntoGroups`:

```typescript
import {
  summarizeContent,
  generateGroupSummary,
  generateTopicSynthesis,
  generateWeeklyDigest,
  detectSessionsWithAI,
  clusterTabsIntoGroups,
} from "./ai/pipeline.js";
```

- [ ] **Step 2: Add the endpoint**

Add the following after the `app.post("/api/highlight", ...)` block and before the `app.post("/api/note", ...)` block in `mcp-server/src/index.ts`:

```typescript
app.post("/api/suggest-grouping", async (req, res) => {
  const { tabs } = req.body as { tabs: Array<{ tabId: number; url: string; title: string }> };
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return res.status(400).json({ error: "Missing or empty tabs array" });
  }

  try {
    const groups = await clusterTabsIntoGroups(tabs);
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Typecheck**

```
cd mcp-server && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(server): add POST /api/suggest-grouping endpoint"
```

---

### Task 4: Add grouping message handlers to background.js

**Files:**
- Modify: `extension/background.js`

- [ ] **Step 1: Replace the message listener**

In `extension/background.js`, replace the entire `chrome.runtime.onMessage.addListener(...)` block (lines 124–129) with:

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sync_tabs") {
    syncTabsAndVisit().then(() => sendResponse({ status: "done" }));
    return true;
  }

  if (request.action === "auto_group_tabs") {
    (async () => {
      try {
        const allTabs = await chrome.tabs.query({});
        const tabs = allTabs
          .filter(t => t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("brave://") && !t.url.startsWith("about:"))
          .map(t => ({ tabId: t.id, url: t.url, title: t.title || t.url }));

        const res = await fetch(`${SERVER_URL}/api/suggest-grouping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabs })
        });
        const data = await res.json();

        if (!data.groups || data.groups.length === 0) {
          sendResponse({ status: "error", message: "No groups returned from server" });
          return;
        }

        const allGroupedTabIds = [];
        for (const group of data.groups) {
          if (!group.tabIds || group.tabIds.length === 0) continue;
          // Use the windowId of the first tab in the group to avoid cross-window errors
          const firstTab = allTabs.find(t => t.id === group.tabIds[0]);
          const groupOptions = firstTab?.windowId !== undefined
            ? { tabIds: group.tabIds, createProperties: { windowId: firstTab.windowId } }
            : { tabIds: group.tabIds };
          const groupId = await chrome.tabs.group(groupOptions);
          await chrome.tabGroups.update(groupId, { title: group.name, color: group.color });
          allGroupedTabIds.push(...group.tabIds);
        }

        await chrome.storage.session.set({ groupedTabIds: allGroupedTabIds });
        sendResponse({ status: "done", groupCount: data.groups.length });
      } catch (err) {
        console.error("auto_group_tabs failed:", err);
        sendResponse({ status: "error", message: err.message });
      }
    })();
    return true;
  }

  if (request.action === "undo_grouping") {
    (async () => {
      try {
        const stored = await chrome.storage.session.get("groupedTabIds");
        const tabIds = stored.groupedTabIds || [];
        if (tabIds.length > 0) {
          await chrome.tabs.ungroup(tabIds);
        }
        await chrome.storage.session.remove("groupedTabIds");
        sendResponse({ status: "done" });
      } catch (err) {
        console.error("undo_grouping failed:", err);
        sendResponse({ status: "error", message: err.message });
      }
    })();
    return true;
  }

  if (request.action === "check_group_state") {
    chrome.storage.session.get("groupedTabIds").then(stored => {
      sendResponse({ hasGroups: !!(stored.groupedTabIds && stored.groupedTabIds.length > 0) });
    });
    return true;
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add extension/background.js
git commit -m "feat(extension): add auto_group_tabs and undo_grouping message handlers"
```

---

### Task 5: Add "Auto-Group Tabs" section to popup.html

**Files:**
- Modify: `extension/popup/popup.html`

- [ ] **Step 1: Add secondary button CSS**

In the `<style>` block, add after the `.btn:disabled` rule:

```css
.btn-secondary {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--card-border);
  box-shadow: none;
  margin-top: 8px;
}

.btn-secondary:hover {
  background: var(--card-bg);
  color: var(--text);
  box-shadow: none;
  transform: none;
}
```

- [ ] **Step 2: Add the Tab Groups section**

In `popup.html`, add the following section AFTER the `</div>` that closes the "Quick Note" section, and BEFORE `<div class="footer">`:

```html
<div class="section">
  <h3 class="section-title">Tab Groups</h3>
  <button id="btn-group-tabs" class="btn" disabled>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6h16M4 10h16M4 14h8M4 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    Auto-Group Tabs
  </button>
  <div id="group-feedback" class="feedback"></div>
  <button id="btn-undo-grouping" class="btn btn-secondary" style="display:none;">
    Undo Grouping
  </button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add extension/popup/popup.html
git commit -m "feat(popup): add Auto-Group Tabs section to UI"
```

---

### Task 6: Wire up buttons in popup.js

**Files:**
- Modify: `extension/popup/popup.js`

- [ ] **Step 1: Add element references**

At the top of `popup.js`, after the existing UI element declarations (line 13), add:

```javascript
const btnGroupTabs = document.getElementById("btn-group-tabs");
const btnUndoGrouping = document.getElementById("btn-undo-grouping");
const groupFeedback = document.getElementById("group-feedback");
```

- [ ] **Step 2: Enable/disable btnGroupTabs with connection state**

In `checkConnection()`, in the `if (data.status === "ok")` block where `btnSaveNote.disabled = false;` is set, also add:

```javascript
btnGroupTabs.disabled = false;
```

In the offline fallback (after the try/catch, where `btnSaveNote.disabled = true;` is set), also add:

```javascript
btnGroupTabs.disabled = true;
```

- [ ] **Step 3: Check group state on init**

In the `init()` function, after `await checkConnection();`, add:

```javascript
chrome.runtime.sendMessage({ action: "check_group_state" }, (response) => {
  if (response && response.hasGroups) {
    btnUndoGrouping.style.display = "block";
  }
});
```

- [ ] **Step 4: Add Auto-Group Tabs click handler**

At the end of `popup.js`, BEFORE `init();`, add:

```javascript
btnGroupTabs.addEventListener("click", () => {
  btnGroupTabs.disabled = true;
  btnGroupTabs.textContent = "Grouping...";

  chrome.runtime.sendMessage({ action: "auto_group_tabs" }, (response) => {
    btnGroupTabs.disabled = false;
    btnGroupTabs.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6h16M4 10h16M4 14h8M4 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Auto-Group Tabs`;

    if (response && response.status === "done") {
      showFeedback(groupFeedback, `Grouped into ${response.groupCount} clusters!`);
      btnUndoGrouping.style.display = "block";
    } else {
      showFeedback(groupFeedback, response?.message || "Grouping failed.", true);
    }
  });
});

btnUndoGrouping.addEventListener("click", () => {
  btnUndoGrouping.disabled = true;
  btnUndoGrouping.textContent = "Undoing...";

  chrome.runtime.sendMessage({ action: "undo_grouping" }, (response) => {
    btnUndoGrouping.disabled = false;
    btnUndoGrouping.textContent = "Undo Grouping";

    if (response && response.status === "done") {
      btnUndoGrouping.style.display = "none";
      showFeedback(groupFeedback, "Grouping undone.");
    } else {
      showFeedback(groupFeedback, response?.message || "Undo failed.", true);
    }
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add extension/popup/popup.js
git commit -m "feat(popup): wire up Auto-Group Tabs and Undo Grouping buttons"
```
