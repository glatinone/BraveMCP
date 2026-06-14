// Readability heuristic to extract main text content of the page
function getReadableContent() {
  // Common article container selectors
  const articleSelectors = [
    "article",
    "main",
    '[role="main"]',
    ".post",
    ".article",
    ".content",
    "#content",
    ".post-content",
    ".entry-content"
  ];

  for (const selector of articleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.trim().length > 300) {
      return element.innerText.trim();
    }
  }

  // Heuristic: Collect paragraphs and headings that look like real copy
  const paragraphs = Array.from(document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li"));
  const textContent = paragraphs
    .map(el => el.innerText.trim())
    .filter(text => text.length > 25) // Filter out small navigation snippets, dates, etc.
    .join("\n\n");

  if (textContent.length > 150) {
    return textContent;
  }

  // Absolute fallback to clean body text
  return document.body.innerText;
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract_content") {
    try {
      const title = document.title;
      const url = window.location.href;
      const content = getReadableContent();
      
      sendResponse({ url, title, content });
    } catch (error) {
      console.error("Extraction failed:", error);
      sendResponse({ error: error.message });
    }
  }
  return true; // Keep message channel open for response
});
