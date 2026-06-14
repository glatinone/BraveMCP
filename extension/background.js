const SERVER_URL = "http://localhost:3747";

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
});
