const SERVER_URL = "http://localhost:3747";
const BACKGROUND_VERSION = 2;

// Helper to sync all tabs and notify page visit
async function syncTabsAndVisit(activeTabId) {
  try {
    // Get all open tabs
    const tabs = await chrome.tabs.query({});
    const openTabs = tabs
      .filter(t => t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("brave://") && !t.url.startsWith("about:"))
      .map(t => ({
        url: t.url,
        title: t.title || t.url,
        tabId: t.id
      }));

    // Find current active tab details
    let activeTab = tabs.find(t => t.active && t.windowId === chrome.windows.WINDOW_ID_CURRENT);
    if (!activeTab && activeTabId) {
      activeTab = tabs.find(t => t.id === activeTabId);
    }
    if (!activeTab) {
      activeTab = tabs.find(t => t.active);
    }

    if (!activeTab || !activeTab.url || activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("brave://") || activeTab.url.startsWith("about:")) {
      return;
    }

    const payload = {
      url: activeTab.url,
      title: activeTab.title || activeTab.url,
      tabId: activeTab.id,
      isActive: true,
      openTabs: openTabs
    };

    const response = await fetch(`${SERVER_URL}/api/page-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("Synced page visit:", data);
  } catch (error) {
    console.error("Failed to sync page visit to BraveMCP bridge:", error);
  }
}

// Listen for tab switching
chrome.tabs.onActivated.addListener((activeInfo) => {
  syncTabsAndVisit(activeInfo.tabId);
});

// Listen for page navigation/load complete
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    syncTabsAndVisit(tabId);
  }
});

// Create Context Menu Item on Installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-highlight",
    title: "Save Highlight to BraveMCP",
    contexts: ["selection"]
  });
});

// Handle Context Menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-highlight" && info.selectionText && tab) {
    const payload = {
      url: tab.url,
      text: info.selectionText,
      note: "" // Note can be appended by user if needed
    };
    fetch(`${SERVER_URL}/api/highlight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => console.log("Saved selection highlight:", data))
      .catch(err => console.error("Error saving highlight:", err));
  }
});

// Listen for bookmarks creation
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (!bookmark.url) return;
  try {
    let folder = "Other Bookmarks";
    if (bookmark.parentId) {
      try {
        const parent = await chrome.bookmarks.get(bookmark.parentId);
        if (parent && parent[0]) {
          folder = parent[0].title || folder;
        }
      } catch (e) {
        console.error("Failed to fetch bookmark folder title:", e);
      }
    }

    const payload = {
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
      folder: folder
    };

    const response = await fetch(`${SERVER_URL}/api/bookmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("Saved bookmark:", data);
  } catch (error) {
    console.error("Failed to send bookmark to BraveMCP bridge:", error);
  }
});

// Expose runtime message listener to handle popup requests
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
        // Fix (Important 3): surface HTTP-level errors before trying to parse JSON
        if (!res.ok) throw new Error(`Server error ${res.status}: ${await res.text()}`);
        const data = await res.json();

        if (!data.groups || data.groups.length === 0) {
          sendResponse({ status: "error", message: "No groups returned from server" });
          return;
        }

        // Build tabId → windowId lookup for fast per-window splitting
        const tabWindowMap = new Map(allTabs.map(t => [t.id, t.windowId]));

        const allGroupedTabIds = [];
        let appliedGroupCount = 0;
        for (const group of data.groups) {
          if (!group.tabIds || group.tabIds.length === 0) continue;

          // Split this group's tabs by window so chrome.tabs.group() never
          // receives cross-window IDs. Each window gets its own group with
          // the same name and color, giving full multi-window coverage.
          const byWindow = new Map();
          for (const tabId of group.tabIds) {
            const windowId = tabWindowMap.get(tabId);
            if (windowId === undefined) continue; // tab was closed
            if (!byWindow.has(windowId)) byWindow.set(windowId, []);
            byWindow.get(windowId).push(tabId);
          }

          for (const [windowId, windowTabIds] of byWindow) {
            if (windowTabIds.length === 0) continue;
            const groupId = await chrome.tabs.group({ tabIds: windowTabIds, createProperties: { windowId } });
            await chrome.tabGroups.update(groupId, { title: group.name, color: group.color });
            appliedGroupCount++;
            allGroupedTabIds.push(...windowTabIds);
            // Persist undo state incrementally so partial failures leave valid undo data
            await chrome.storage.session.set({ groupedTabIds: allGroupedTabIds });
          }
        }

        sendResponse({ status: "done", groupCount: appliedGroupCount });
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
        const allTabIds = stored.groupedTabIds || [];
        // Fix (Important 4): clear storage FIRST so a partial failure below never
        // leaves stale IDs that would make future undo attempts throw again.
        await chrome.storage.session.remove("groupedTabIds");
        if (allTabIds.length > 0) {
          // Filter to tabs that are still open — chrome.tabs.ungroup() throws on
          // any invalid ID, so passing a closed tab's ID would abort the whole call.
          const liveTabs = await chrome.tabs.query({});
          const liveIds = new Set(liveTabs.map(t => t.id));
          const validIds = allTabIds.filter(id => liveIds.has(id));
          if (validIds.length > 0) {
            await chrome.tabs.ungroup(validIds);
          }
        }
        sendResponse({ status: "done" });
      } catch (err) {
        console.error("undo_grouping failed:", err);
        sendResponse({ status: "error", message: err.message });
      }
    })();
    return true;
  }

  if (request.action === "get_version") {
    sendResponse({ version: BACKGROUND_VERSION });
    return false;
  }

  if (request.action === "check_group_state") {
    chrome.storage.session.get("groupedTabIds").then(stored => {
      sendResponse({ hasGroups: !!(stored.groupedTabIds && stored.groupedTabIds.length > 0) });
    });
    return true;
  }
});
