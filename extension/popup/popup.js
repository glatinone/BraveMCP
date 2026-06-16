const SERVER_URL = "http://localhost:3747";
const REQUIRED_BG_VERSION = 2;
let activeTab = null;

// UI Elements
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const pageTitleEl = document.getElementById("page-title");
const pageUrlEl = document.getElementById("page-url");
const btnCapture = document.getElementById("btn-capture");
const btnSaveNote = document.getElementById("btn-save-note");
const noteContentEl = document.getElementById("note-content");
const captureFeedback = document.getElementById("capture-feedback");
const noteFeedback = document.getElementById("note-feedback");
const btnGroupTabs = document.getElementById("btn-group-tabs");
const btnUndoGrouping = document.getElementById("btn-undo-grouping");
const groupFeedback = document.getElementById("group-feedback");

// Check connection to HTTP Bridge
async function checkConnection() {
  try {
    const response = await fetch(`${SERVER_URL}/api/status`);
    const data = await response.json();
    if (data.status === "ok") {
      statusDot.classList.add("connected");
      statusText.textContent = "Online";
      btnCapture.disabled = !activeTab;
      btnSaveNote.disabled = false;
      btnGroupTabs.disabled = false;
      return true;
    }
  } catch (error) {
    console.error("Connection check failed:", error);
  }
  
  statusDot.classList.remove("connected");
  statusText.textContent = "Offline";
  btnCapture.disabled = true;
  btnSaveNote.disabled = true;
  btnGroupTabs.disabled = true;
  return false;
}

// Show temporary status feedback
function showFeedback(element, message, isError = false) {
  element.textContent = message;
  element.className = `feedback ${isError ? "error" : "success"}`;
  element.style.display = "block";
  setTimeout(() => {
    element.style.opacity = "1";
  }, 10);

  setTimeout(() => {
    element.style.opacity = "0";
    setTimeout(() => {
      element.style.display = "none";
    }, 300);
  }, 3000);
}

// Auto-reload if background service worker is outdated.
// popup.js always runs fresh, so this check fires on every popup open.
function ensureBackgroundCurrent() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "get_version" }, (response) => {
      if (chrome.runtime.lastError || !response || response.version < REQUIRED_BG_VERSION) {
        chrome.runtime.reload(); // reloads extension, popup closes automatically
        // never resolve — the reload closes this popup
      } else {
        resolve();
      }
    });
  });
}

// Initialize active tab details
async function init() {
  await ensureBackgroundCurrent();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      activeTab = tabs[0];
      pageTitleEl.textContent = activeTab.title || "Untitled";
      pageUrlEl.textContent = activeTab.url || "";
      
      // Let background script know we opened popup so it syncs tab state
      chrome.runtime.sendMessage({ action: "sync_tabs" });
    } else {
      pageTitleEl.textContent = "No active tab";
      pageUrlEl.textContent = "";
    }
  } catch (error) {
    console.error("Error getting active tab:", error);
    pageTitleEl.textContent = "Error loading tab";
  }

  // Check connection status
  await checkConnection();

  chrome.runtime.sendMessage({ action: "check_group_state" }, (response) => {
    if (response && response.hasGroups) {
      btnUndoGrouping.style.display = "block";
    }
  });
}

// Capture current page content
btnCapture.addEventListener("click", async () => {
  if (!activeTab) return;
  
  btnCapture.disabled = true;
  btnCapture.textContent = "Capturing...";
  
  try {
    // Send message to content script to extract readable content
    chrome.tabs.sendMessage(activeTab.id, { action: "extract_content" }, async (response) => {
      if (chrome.runtime.lastError) {
        showFeedback(captureFeedback, "Cannot capture: Reload page to initialize content script.", true);
        btnCapture.disabled = false;
        btnCapture.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 20H19V18H5V20ZM19 9H15V3H9V9H5L12 16L19 9Z" fill="currentColor"/>
          </svg> Capture Content`;
        return;
      }

      if (!response || response.error) {
        showFeedback(captureFeedback, "Extraction failed: " + (response?.error || "Unknown"), true);
        btnCapture.disabled = false;
        btnCapture.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 20H19V18H5V20ZM19 9H15V3H9V9H5L12 16L19 9Z" fill="currentColor"/>
          </svg> Capture Content`;
        return;
      }

      // Send the content to the HTTP Bridge
      try {
        const captureResponse = await fetch(`${SERVER_URL}/api/capture`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: response.url,
            title: response.title,
            content: response.content,
            summary: "" // AI summary done in Phase 4
          })
        });

        const data = await captureResponse.json();
        if (data.status === "success") {
          showFeedback(captureFeedback, "Page captured successfully!");
        } else {
          showFeedback(captureFeedback, "Save failed: " + (data.error || "Unknown"), true);
        }
      } catch (err) {
        showFeedback(captureFeedback, "Failed to connect to bridge server.", true);
      }
      
      btnCapture.disabled = false;
      btnCapture.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 20H19V18H5V20ZM19 9H15V3H9V9H5L12 16L19 9Z" fill="currentColor"/>
        </svg> Capture Content`;
    });
  } catch (error) {
    showFeedback(captureFeedback, "An unexpected error occurred", true);
    btnCapture.disabled = false;
    btnCapture.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 20H19V18H5V20ZM19 9H15V3H9V9H5L12 16L19 9Z" fill="currentColor"/>
      </svg> Capture Content`;
  }
});

// Save quick note
btnSaveNote.addEventListener("click", async () => {
  const content = noteContentEl.value.trim();
  if (!content) return;

  btnSaveNote.disabled = true;
  btnSaveNote.textContent = "Saving...";

  try {
    const response = await fetch(`${SERVER_URL}/api/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        source_url: activeTab ? activeTab.url : null
      })
    });

    const data = await response.json();
    if (data.status === "success") {
      showFeedback(noteFeedback, "Note saved successfully!");
      noteContentEl.value = "";
    } else {
      showFeedback(noteFeedback, "Failed to save: " + (data.error || "Unknown"), true);
    }
  } catch (error) {
    showFeedback(noteFeedback, "Failed to connect to bridge server.", true);
  }

  btnSaveNote.disabled = false;
  btnSaveNote.textContent = "Save Note";
});

btnGroupTabs.addEventListener("click", () => {
  btnGroupTabs.disabled = true;
  btnGroupTabs.textContent = "Grouping...";

  chrome.runtime.sendMessage({ action: "auto_group_tabs" }, (response) => {
    if (chrome.runtime.lastError) { /* suppress warning */ }
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
    if (chrome.runtime.lastError) { /* suppress warning */ }
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

// Run init
init();
