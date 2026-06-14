import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import {
  db,
  runMigrations,
  saveNote,
  saveBookmark,
  getBookmarks,
  savePageVisit,
  savePageContent,
  saveHighlight,
  getPageContent,
  hybridSearch,
  getRecentPageVisits,
  getRecentHighlights,
  getRecentNotes,
  saveResearchSession,
  getResearchSessions,
  getLastActivePage,
  getRecentlyVisitedPages,
} from "./storage/database.js";
import { initChroma, isChromaConnected } from "./storage/chroma.js";
import {
  summarizeContent,
  generateGroupSummary,
  generateTopicSynthesis,
  generateWeeklyDigest,
  detectSessionsWithAI,
} from "./ai/pipeline.js";

// In-memory state sync'd from browser extension
interface Tab {
  url: string;
  title: string;
  tabId: number;
}

let openTabs: Tab[] = [];
let activeTab: { url: string; title: string } | null = null;

// Initialize MCP Server
const server = new Server(
  {
    name: "brave-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register list of tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_open_tabs",
        description: "Get list of all open tabs in the browser (synchronized in real-time)",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_active_tab",
        description: "Get the currently active browser tab",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_bookmarks",
        description: "Get all saved bookmarks from the database",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_memory",
        description: "Search local memory database (pages, highlights, and notes) using hybrid search (semantic + keyword)",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to match against titles, summaries, or content",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "capture_current_page",
        description: "Capture page content. Can retrieve the active tab's page content or save new page content directly.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Optional URL of the page to save",
            },
            title: {
              type: "string",
              description: "Optional title of the page to save",
            },
            content: {
              type: "string",
              description: "Optional readable text content of the page to save",
            },
            summary: {
              type: "string",
              description: "Optional summary description of the page to save",
            },
          },
        },
      },
      {
        name: "save_note",
        description: "Save a manual note to the memory database",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The text content of the note",
            },
            source_url: {
              type: "string",
              description: "Optional URL associated with the note",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "save_bookmark",
        description: "Save a new bookmark to the memory database",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL of the bookmarked page",
            },
            title: {
              type: "string",
              description: "The title of the bookmarked page",
            },
            folder: {
              type: "string",
              description: "Optional folder path for the bookmark",
            },
          },
          required: ["url", "title"],
        },
      },
      {
        name: "summarize_open_tabs",
        description: "Generate a summary synthesis of what the user is researching based on their currently open browser tabs.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "find_related_content",
        description: "Find related content in the local memory database using a hybrid (semantic + keyword) query.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The semantic or keyword query to match against",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "summarize_research_topic",
        description: "Synthesize a summary of all captured research pages related to a specific topic.",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "The research topic to synthesize",
            },
          },
          required: ["topic"],
        },
      },
      {
        name: "get_research_sessions",
        description: "Group recently visited pages into logical research topic sessions.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "generate_weekly_digest",
        description: "Generate a weekly summary digest of all research, most visited domains, captured pages, highlights, and suggest future follow-up questions.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "suggest_tab_cleanup",
        description: "Analyze open browser tabs and suggest actions (Keep, Archive, Read Later, Close) based on recency and visit counts.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "find_forgotten_content",
        description: "Retrieve forgotten pages/notes using semantic search weighted by a time-decay factor and visit frequency boost.",
        inputSchema: {
          type: "object",
          properties: {
            vague_description: {
              type: "string",
              description: "Vague keywords or description of the forgotten item",
            },
          },
          required: ["vague_description"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
  switch (name) {
    case "get_open_tabs": {
      // Prefer in-memory (live from extension), fall back to SQLite (last 4 hours)
      const tabs = openTabs.length > 0 ? openTabs : getRecentlyVisitedPages();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tabs, null, 2),
          },
        ],
      };
    }

    case "get_active_tab": {
      // Prefer in-memory (live from extension), fall back to SQLite (most recent)
      const tab = activeTab ?? getLastActivePage() ?? { url: "", title: "No active tab detected" };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tab, null, 2),
          },
        ],
      };
    }

    case "get_bookmarks": {
      const bookmarks = getBookmarks();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(bookmarks, null, 2),
          },
        ],
      };
    }

    case "search_memory":
    case "find_related_content": {
      const query = String(args?.query || "");
      const results = await hybridSearch(query);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }

    case "capture_current_page": {
      const url = args?.url ? String(args.url) : undefined;
      const title = args?.title ? String(args.title) : undefined;
      const content = args?.content ? String(args.content) : undefined;
      let summary = args?.summary ? String(args.summary) : "";

      // If args are provided, save the page directly (called by client/AI)
      if (url && title && content) {
        if (!summary) {
          try {
            console.error(`Generating AI summary for capture tool: ${title}...`);
            const aiRes = await summarizeContent(title, content);
            summary = aiRes.summary;
          } catch (err) {
            console.error("AI summarization failed for capture tool:", err);
          }
        }
        const id = await savePageContent(url, title, content, summary);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ status: "captured", id, url, title, summary }, null, 2),
            },
          ],
        };
      }

      // Otherwise, return current active tab's page content
      if (!activeTab || !activeTab.url) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "No active tab detected." }, null, 2),
            },
          ],
        };
      }

      const pageContent = getPageContent(activeTab.url);
      if (!pageContent) {
        // Register visit if it doesn't exist
        await savePageVisit(activeTab.url, activeTab.title);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "registered_visit",
                  url: activeTab.url,
                  title: activeTab.title,
                  message: "Page visit registered. Full content not captured yet. Capture it using the extension popup.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "captured",
                url: pageContent.url,
                title: pageContent.title,
                content: pageContent.content,
                summary: pageContent.summary,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "save_note": {
      const content = String(args?.content || "");
      const source_url = args?.source_url ? String(args.source_url) : undefined;
      const id = await saveNote(content, source_url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "saved",
                id,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "save_bookmark": {
      const url = String(args?.url || "");
      const title = String(args?.title || "");
      const folder = args?.folder ? String(args.folder) : undefined;
      const id = saveBookmark(url, title, folder);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "saved",
                id,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "summarize_open_tabs": {
      const activeTabs = openTabs.length > 0 ? openTabs : getRecentlyVisitedPages();
      if (activeTabs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No open tabs are currently synchronized. Make sure the browser extension is active and running.",
            },
          ],
        };
      }

      let tabsText = "";
      for (const tab of activeTabs) {
        const page = getPageContent(tab.url);
        const summaryText = page?.summary || "No summary available. Page has not been captured yet.";
        tabsText += `- Title: ${tab.title}\n  URL: ${tab.url}\n  Summary: ${summaryText}\n\n`;
      }

      try {
        console.error("Synthesizing open tabs...");
        const synthesis = await generateGroupSummary(tabsText);
        return {
          content: [
            {
              type: "text",
              text: synthesis,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to summarize open tabs: ${err.message}`,
            },
          ],
        };
      }
    }

    case "summarize_research_topic": {
      const topic = String(args?.topic || "");
      if (!topic) {
        throw new Error("Missing topic parameter");
      }

      const matches = await hybridSearch(topic);
      const relevantMatches = matches.filter(m => m.summary);
      
      if (relevantMatches.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No relevant documents with text content found in memory for the topic: "${topic}".`,
            },
          ],
        };
      }

      let pagesText = "";
      for (const match of relevantMatches) {
        pagesText += `- Title: ${match.title}\n  URL: ${match.url}\n  Summary: ${match.summary}\n\n`;
      }

      try {
        console.error(`Synthesizing research topic: ${topic}...`);
        const synthesis = await generateTopicSynthesis(topic, pagesText);
        return {
          content: [
            {
              type: "text",
              text: synthesis,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate topic synthesis: ${err.message}`,
            },
          ],
        };
      }
    }

    case "get_research_sessions": {
      // 1. Return already stored sessions
      const savedSessions = getResearchSessions();
      if (savedSessions.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(savedSessions, null, 2),
            },
          ],
        };
      }

      // 2. If empty, query visits from last 3 days to auto-cluster them
      const recentVisits = getRecentPageVisits(3);
      if (recentVisits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "[]", // Return empty array if no pages visited
            },
          ],
        };
      }

      let pagesText = "";
      for (const visit of recentVisits) {
        pagesText += `Title: ${visit.title}\nURL: ${visit.url}\n\n`;
      }

      try {
        console.error("Detecting research sessions with LLM clustering...");
        const sessions = await detectSessionsWithAI(pagesText);
        
        // Save them to database
        for (const session of sessions) {
          saveResearchSession(session.name, session.urls);
        }

        const updatedSessions = getResearchSessions();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(updatedSessions, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to detect research sessions: ${err.message}`,
            },
          ],
        };
      }
    }

    case "generate_weekly_digest": {
      const recentVisits = getRecentPageVisits(7);
      const recentHighlights = getRecentHighlights(7);
      const recentNotes = getRecentNotes(7);

      if (recentVisits.length === 0 && recentHighlights.length === 0 && recentNotes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No activity recorded in the last 7 days. Capture content or visit pages to generate a digest!",
            },
          ],
        };
      }

      const totalVisits = recentVisits.length;
      const pagesCaptured = recentVisits.filter(v => v.summary !== null && v.summary !== "").length;
      const totalHighlights = recentHighlights.length;
      const totalNotes = recentNotes.length;

      // Group domains
      const domainCounts: { [domain: string]: number } = {};
      for (const visit of recentVisits) {
        domainCounts[visit.domain] = (domainCounts[visit.domain] || 0) + visit.visit_count;
      }
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain, count]) => `${domain} (${count} visits)`)
        .join(", ");

      const statsText = `
- Total Page Visits: ${totalVisits}
- Captured Pages: ${pagesCaptured}
- Highlights Saved: ${totalHighlights}
- Notes Written: ${totalNotes}
- Most Active Domains: ${topDomains || "None"}
      `.trim();

      let contentSummaryText = "";
      for (const visit of recentVisits) {
        if (visit.summary) {
          contentSummaryText += `- Page: ${visit.title} (${visit.url})\n  Summary: ${visit.summary}\n\n`;
        }
      }
      for (const note of recentNotes) {
        contentSummaryText += `- Note: "${note.content.substring(0, 150)}..."\n\n`;
      }

      try {
        console.error("Synthesizing weekly digest...");
        const digest = await generateWeeklyDigest(statsText, contentSummaryText || "No detailed summaries captured.");
        return {
          content: [
            {
              type: "text",
              text: digest,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate weekly digest: ${err.message}`,
            },
          ],
        };
      }
    }

    case "suggest_tab_cleanup": {
      const tabsForCleanup = openTabs.length > 0 ? openTabs : getRecentlyVisitedPages();
      if (tabsForCleanup.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No open tabs are currently synchronized. Suggestion: open browser tabs first.",
            },
          ],
        };
      }

      const suggestions = [];
      const now = Date.now();

      for (const tab of tabsForCleanup) {
        const page = getPageContent(tab.url);
        
        let action = "Keep";
        let reason = "Tab is active and recently visited.";

        if (page) {
          const visitCount = page.visit_count || 1;
          const lastVisited = page.last_visited || now;
          const daysElapsed = (now - lastVisited) / (24 * 60 * 60 * 1000);

          if (daysElapsed > 3 && visitCount === 1) {
            action = "Close";
            reason = `Infrequently visited. Opened ${Math.round(daysElapsed)} days ago with only 1 visit.`;
          } else if (daysElapsed > 5) {
            action = "Archive";
            reason = `Stale tab. Last visited ${Math.round(daysElapsed)} days ago. Content is captured in SQLite.`;
          } else if (visitCount > 5) {
            action = "Keep";
            reason = `High-frequency reference page (${visitCount} visits).`;
          } else {
            action = "Read Later";
            reason = "Page captured in database, but inactive recently.";
          }
        } else {
          action = "Keep";
          reason = "Tab has not been captured in SQLite yet. Suggest capturing if it contains useful research.";
        }

        suggestions.push({
          url: tab.url,
          title: tab.title,
          action,
          reason,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(suggestions, null, 2),
          },
        ],
      };
    }

    case "find_forgotten_content": {
      const vagueDescription = String(args?.vague_description || "");
      if (!vagueDescription) {
        throw new Error("Missing vague_description parameter");
      }

      const matches = await hybridSearch(vagueDescription);
      const now = Date.now();
      const adjustedResults = [];

      for (const match of matches) {
        let visitCount = 1;
        let lastVisited = now;

        const page = getPageContent(match.url);
        if (page) {
          visitCount = page.visit_count || 1;
          lastVisited = page.last_visited || now;
        } else {
          const note = db.prepare("SELECT created_at FROM notes WHERE content = ?").get(match.summary) as any;
          if (note) {
            lastVisited = note.created_at || now;
          }
        }

        const daysElapsed = (now - lastVisited) / (24 * 60 * 60 * 1000);
        
        // Time decay factor
        const timeDecay = Math.max(0.5, Math.exp(-0.01 * daysElapsed));
        
        // Frequent visit boost
        const visitBoost = 1 + 0.2 * Math.log(visitCount);

        const adjustedRelevance = Math.min(0.99, match.relevance * timeDecay * visitBoost);

        adjustedResults.push({
          url: match.url,
          title: match.title,
          summary: match.summary,
          relevance: match.relevance,
          adjusted_relevance: adjustedRelevance,
          visit_count: visitCount,
          last_visited_days_ago: Math.round(daysElapsed * 10) / 10,
        });
      }

      // Sort by adjusted relevance
      adjustedResults.sort((a, b) => b.adjusted_relevance - a.adjusted_relevance);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(adjustedResults.slice(0, 5), null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
  } catch (err) {
    // Any uncaught error from a tool handler is returned to Claude as a
    // readable tool-execution error instead of a raw JSON-RPC protocol error.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Tool "${name}" failed:`, message);
    return {
      content: [
        {
          type: "text",
          text: `⚠️ Tool "${name}" could not complete: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Setup Express HTTP Bridge
const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// Lightweight reachability check used by the health endpoint.
async function pingHttp(url: string, timeoutMs = 1000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

app.get("/api/status", async (_req, res) => {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  // SQLite is in-process — verify with a trivial query.
  let sqlite = false;
  try {
    db.prepare("SELECT 1").get();
    sqlite = true;
  } catch {
    sqlite = false;
  }

  // ChromaDB heartbeat moved path across versions; try v2 then v1.
  const [chromaV2, ollama] = await Promise.all([
    pingHttp("http://localhost:8000/api/v2/heartbeat"),
    pingHttp(`${ollamaUrl}/api/tags`),
  ]);
  const chromadb = chromaV2 || (await pingHttp("http://localhost:8000/api/v1/heartbeat")) || isChromaConnected();

  res.json({
    status: "ok",
    services: {
      sqlite,
      chromadb,
      ollama,
    },
    timestamp: Date.now(),
  });
});

app.post("/api/page-visit", async (req, res) => {
  const { url, title, isActive, openTabs: extensionOpenTabs } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  if (isActive) {
    activeTab = { url, title: title || url };
  }

  if (Array.isArray(extensionOpenTabs)) {
    openTabs = extensionOpenTabs;
  }

  try {
    const id = await savePageVisit(url, title || url);
    res.json({ status: "success", id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/capture", async (req, res) => {
  const { url, title, content } = req.body;
  if (!url || !content) {
    return res.status(400).json({ error: "Missing url or content parameter" });
  }

  try {
    console.error(`Generating AI summary for page: ${title || url}...`);
    const { summary, topics } = await summarizeContent(title || url, content);
    
    const id = await savePageContent(url, title || url, content, summary);
    res.json({ status: "success", id, summary, topics });
  } catch (err: any) {
    console.error("Capture processing failed, saving fallback:", err);
    try {
      const id = await savePageContent(url, title || url, content, "");
      res.json({ status: "success", id, summary: "", topics: [], error: err.message });
    } catch (dbErr: any) {
      res.status(500).json({ error: dbErr.message });
    }
  }
});

app.post("/api/bookmark", (req, res) => {
  const { url, title, folder } = req.body;
  if (!url || !title) {
    return res.status(400).json({ error: "Missing url or title parameter" });
  }

  try {
    const id = saveBookmark(url, title, folder);
    res.json({ status: "success", id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/highlight", async (req, res) => {
  const { url, text, note } = req.body;
  if (!url || !text) {
    return res.status(400).json({ error: "Missing url or text parameter" });
  }

  try {
    const id = await saveHighlight(url, text, note);
    res.json({ status: "success", id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/note", async (req, res) => {
  const { content, source_url } = req.body;
  if (!content) {
    return res.status(400).json({ error: "Missing content parameter" });
  }

  try {
    const id = await saveNote(content, source_url);
    res.json({ status: "success", id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Run the server
async function main() {
  console.error("Initializing SQLite database and migrations...");
  runMigrations();

  console.error("Initializing ChromaDB connection...");
  await initChroma();

  const HTTP_PORT = 3747;
  const httpServer = app.listen(HTTP_PORT, () => {
    console.error(`HTTP Bridge listening on http://localhost:${HTTP_PORT}`);
  });
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${HTTP_PORT} already in use — HTTP bridge disabled. Extension sync will route to the primary instance.`);
    } else {
      console.error("HTTP Bridge error:", err);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BraveMCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
