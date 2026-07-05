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

// --- Tab Archaeology banner --------------------------------------------------
// Renders a floating alert inside an isolated Shadow Root so host-page CSS
// cannot alter or break it. All dynamic strings are assigned via textContent
// (never innerHTML interpolation) so stored titles can't inject markup.

function archaeologyTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "earlier today";
  const days = Math.floor(diff / day);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months <= 1) return "1 month ago";
  return `${months} months ago`;
}

function showArchaeologyBanner(match) {
  const HOST_ID = "bravemcp-archaeology-host";
  if (document.getElementById(HOST_ID)) return; // one banner per page

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;";

  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .card {
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #1e1f24;
      color: #e8e6e3;
      border: 1px solid #3a3b42;
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.35);
      animation: bravemcp-slide-in 0.35s ease-out;
    }
    @keyframes bravemcp-slide-in {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #d9a24a; }
    .close {
      background: none; border: none; cursor: pointer; color: #8b8d96;
      font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px;
    }
    .close:hover { color: #e8e6e3; background: #2c2d34; }
    .when { font-size: 13px; color: #b9bbc4; margin: 0 0 6px; }
    .title { font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #f2f0ed; }
    .summary {
      font-size: 12px; color: #a5a7b0; margin: 0 0 10px; line-height: 1.5;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
    }
    .link {
      display: inline-block; font-size: 12px; font-weight: 600; color: #d9a24a;
      text-decoration: none; border: 1px solid #4a4335; border-radius: 6px; padding: 5px 10px;
    }
    .link:hover { background: #2c2820; }
  `;

  const card = document.createElement("div");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "head";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "\u{1F3FA} Archaeology alert";

  const closeBtn = document.createElement("button");
  closeBtn.className = "close";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => host.remove());

  head.appendChild(label);
  head.appendChild(closeBtn);

  const when = document.createElement("p");
  when.className = "when";
  when.textContent = `You researched this topic ${archaeologyTimeAgo(match.timestamp)}. Here is what you found:`;

  const title = document.createElement("p");
  title.className = "title";
  title.textContent = match.pastTitle || "";

  card.appendChild(head);
  card.appendChild(when);
  card.appendChild(title);

  if (match.pastSummary) {
    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = match.pastSummary;
    card.appendChild(summary);
  }

  if (match.pastUrl) {
    const link = document.createElement("a");
    link.className = "link";
    link.href = match.pastUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Revisit past find →";
    card.appendChild(link);
  }

  shadow.appendChild(style);
  shadow.appendChild(card);
  document.documentElement.appendChild(host);

  // Auto-dismiss after 30s so it never lingers as clutter
  setTimeout(() => host.remove(), 30000);
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

  if (request.action === "show_archaeology") {
    try {
      if (request.match && request.match.matchFound) {
        showArchaeologyBanner(request.match);
      }
      sendResponse({ shown: true });
    } catch (error) {
      console.error("Archaeology banner failed:", error);
      sendResponse({ error: error.message });
    }
  }

  return true; // Keep message channel open for response
});
