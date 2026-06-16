import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from workspace root
dotenv.config({ path: join(__dirname, "..", "..", "..", ".env") });

const provider = process.env.AI_PROVIDER || "ollama";
const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
const apiKey = process.env.ANTHROPIC_API_KEY;
const openrouterKey = process.env.OPENROUTER_API_KEY;
const openrouterModel = process.env.OPENROUTER_MODEL || "anthropic/claude-3-haiku";

// Generate embedding for text
export async function getEmbedding(text: string): Promise<number[]> {
  if (provider === "ollama") {
    try {
      const res = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nomic-embed-text",
          prompt: text
        })
      });
      if (!res.ok) throw new Error(`Ollama embedding error: ${await res.text()}`);
      const data = (await res.json()) as { embedding: number[] };
      return data.embedding;
    } catch (error) {
      console.error("Failed to generate embedding with Ollama, using mock fallback:", error);
      // Return a mock embedding array of 768 elements (nomic-embed-text size is 768)
      return new Array(768).fill(0).map(() => Math.random() - 0.5);
    }
  } else {
    // Anthropic API / Voyage fallback
    try {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          input: [text],
          model: "voyage-3"
        })
      });
      if (!res.ok) throw new Error(`Voyage AI embedding error: ${await res.text()}`);
      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return data.data[0].embedding;
    } catch (error) {
      console.error("Failed to generate embedding with Voyage/Anthropic fallback, using mock:", error);
      return new Array(1024).fill(0).map(() => Math.random() - 0.5); // Voyage-3 size is 1024
    }
  }
}

// Generate Summary and Topics (max 3 sentences, 5 key topics)
export async function summarizeContent(title: string, content: string): Promise<{ summary: string; topics: string[] }> {
  const truncatedContent = content.substring(0, 4000); // Truncate to avoid context window issues
  const prompt = `You are a summarization assistant for a personal "second brain" search system.
Analyze the following web page content:
Title: ${title}
Content: ${truncatedContent}

Provide two things:
1. A summary of the content in maximum 3 sentences.
2. Exactly 5 key topics/tags/entities as a comma-separated list.

Format your output EXACTLY as follows:
Summary: [your 3-sentence summary]
Topics: [topic1, topic2, topic3, topic4, topic5]`;

  if (provider === "ollama") {
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2", // or mistral
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0.3 },
          stream: false
        })
      });
      if (!res.ok) throw new Error(`Ollama chat error: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return parseSummaryResponse(data.message.content, title, truncatedContent);
    } catch (error) {
      console.error("Ollama summary generation failed, using fallback summary:", error);
      return {
        summary: `A page titled "${title}" containing content about ${truncatedContent.substring(0, 100)}...`,
        topics: ["webpage", "captured"]
      };
    }
  } else {
    // Anthropic API Claude fallback
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
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic summary error: ${await res.text()}`);
      const data = (await res.json()) as { content: { text: string }[] };
      return parseSummaryResponse(data.content[0].text, title, truncatedContent);
    } catch (error) {
      console.error("Anthropic summary generation failed, using fallback summary:", error);
      return {
        summary: `A page titled "${title}" containing content about ${truncatedContent.substring(0, 100)}...`,
        topics: ["webpage", "captured"]
      };
    }
  }
}

// Generate a summary from a group of open tabs
export async function generateGroupSummary(tabsText: string): Promise<string> {
  const prompt = `You are a research assistant. Below is a list of open tabs and their summaries/titles:
${tabsText}

Please generate a structured synthesis/summary of what the user is currently researching or working on, in maximum 4 sentences. Make it sound professional and insightful.`;

  if (provider === "ollama") {
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0.3 },
          stream: false
        })
      });
      if (!res.ok) throw new Error(`Ollama group summary error: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return data.message.content.trim();
    } catch (error) {
      console.error("Failed to generate group summary with Ollama, using extractive fallback:", error);
      return extractiveTabSummary(tabsText);
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
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic group summary error: ${await res.text()}`);
      const data = (await res.json()) as { content: { text: string }[] };
      return data.content[0].text.trim();
    } catch (error) {
      console.error("Failed to generate group summary with Anthropic, using extractive fallback:", error);
      return extractiveTabSummary(tabsText);
    }
  }
}

// Generate synthesis on a research topic
export async function generateTopicSynthesis(topic: string, pagesText: string): Promise<string> {
  const prompt = `You are a research assistant synthesizing information for a "second brain" database.
The user wants a summary of the topic: "${topic}".
Here are the relevant pages captured from their browsing history:
${pagesText}

Please write a comprehensive synthesis of this research topic. Detail the key concepts, main findings, and how these sources connect. Keep the summary under 6 sentences.`;

  if (provider === "ollama") {
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0.3 },
          stream: false
        })
      });
      if (!res.ok) throw new Error(`Ollama topic synthesis error: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return data.message.content.trim();
    } catch (error) {
      console.error("Failed to generate topic synthesis with Ollama, using extractive fallback:", error);
      return extractiveTopicSummary(topic, pagesText);
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
          max_tokens: 500,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic topic synthesis error: ${await res.text()}`);
      const data = (await res.json()) as { content: { text: string }[] };
      return data.content[0].text.trim();
    } catch (error) {
      console.error("Failed to generate topic synthesis with Anthropic, using extractive fallback:", error);
      return extractiveTopicSummary(topic, pagesText);
    }
  }
}

function parseSummaryResponse(text: string, title: string, content: string): { summary: string; topics: string[] } {
  let summary = "";
  let topics: string[] = [];

  const lines = text.split("\n");
  for (const line of lines) {
    if (line.toLowerCase().startsWith("summary:")) {
      summary = line.substring(8).trim();
    } else if (line.toLowerCase().startsWith("topics:")) {
      topics = line
        .substring(7)
        .split(",")
        .map(t => t.trim().replace(/^\[|\]$/g, ""))
        .filter(Boolean);
    }
  }

  // Fallback if parsing failed
  if (!summary) {
    const parts = text.split(/topics:/i);
    summary = parts[0].replace(/summary:/i, "").trim();
  }
  if (topics.length === 0) {
    const match = text.match(/topics:\s*(.*)/i);
    if (match && match[1]) {
      topics = match[1].split(",").map(t => t.trim().replace(/^\[|\]$/g, "")).filter(Boolean);
    }
  }

  return {
    summary:
      summary ||
      (text.trim()
        ? text.substring(0, 150)
        : `Page "${title}": ${content.substring(0, 120)}`),
    topics: topics.length > 0 ? topics : ["general"]
  };
}

// Generate weekly/monthly research digest
export async function generateWeeklyDigest(statsText: string, contentSummaryText: string): Promise<string> {
  const prompt = `You are a personal research assistant.
Here are the statistics of the user's browsing activity over the last 7 days:
${statsText}

Here are the summaries of the pages and notes they captured:
${contentSummaryText}

Please write a beautiful weekly research digest containing:
1. **Activity Summary**: A brief, encouraging summary of what they accomplished.
2. **Major Themes**: Cluster the topics they explored into 2-3 major logical themes.
3. **Research Gaps / Questions You Might Still Have**: Suggest exactly 3 insightful questions or areas they might want to investigate next, based on gaps in their current research.

Format your output in clean Markdown with clear headings.`;

  if (provider === "ollama") {
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2",
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0.4 },
          stream: false
        })
      });
      if (!res.ok) throw new Error(`Ollama weekly digest error: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return data.message.content.trim();
    } catch (error) {
      console.error("Failed to generate weekly digest with Ollama, using extractive fallback:", error);
      return extractiveWeeklyDigest(statsText, contentSummaryText);
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
          max_tokens: 800,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic weekly digest error: ${await res.text()}`);
      const data = (await res.json()) as { content: { text: string }[] };
      return data.content[0].text.trim();
    } catch (error) {
      console.error("Failed to generate weekly digest with Anthropic, using extractive fallback:", error);
      return extractiveWeeklyDigest(statsText, contentSummaryText);
    }
  }
}

// Cluster recent page visits into research sessions
export async function detectSessionsWithAI(pagesText: string): Promise<Array<{ name: string; urls: string[] }>> {
  const prompt = `You are a data clustering assistant for a personal second brain database.
Analyze the following list of recently visited URLs and titles:
${pagesText}

Group these URLs into logical "Research Sessions" based on their topics (e.g. if the user visited multiple pages about "TypeScript" and "MCP", group them together).
Provide a short descriptive name for each session.

Format your response EXACTLY as a JSON array of objects with "name" and "urls" fields. Do not include any markdown styling or extra text. Example:
[
  { "name": "Model Context Protocol Research", "urls": ["https://modelcontextprotocol.io", "https://github.com/mcp"] }
]`;

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
      if (!res.ok) throw new Error(`Ollama session clustering error: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return parseSessionsJson(data.message.content, pagesText);
    } catch (error) {
      console.error("Ollama clustering failed, using domain fallback:", error);
      return fallbackClustering(pagesText);
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
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic clustering error: ${await res.text()}`);
      const data = (await res.json()) as { content: { text: string }[] };
      return parseSessionsJson(data.content[0].text, pagesText);
    } catch (error) {
      console.error("Anthropic clustering failed, using domain fallback:", error);
      return fallbackClustering(pagesText);
    }
  }
}

function parseSessionsJson(text: string, pagesText: string): Array<{ name: string; urls: string[] }> {
  try {
    const cleanText = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Failed to parse sessions JSON from LLM response:", error);
    return fallbackClustering(pagesText);
  }
}

function fallbackClustering(pagesText: string): Array<{ name: string; urls: string[] }> {
  const lines = pagesText.split("\n");
  const domainMap = new Map<string, string[]>();

  for (const line of lines) {
    const match = line.match(/URL:\s*(https?:\/\/[^\s]+)/i);
    if (match && match[1]) {
      const url = match[1];
      try {
        const domain = new URL(url).hostname;
        if (!domainMap.has(domain)) {
          domainMap.set(domain, []);
        }
        domainMap.get(domain)!.push(url);
      } catch {
        // ignore invalid urls
      }
    }
  }

  const sessions = [];
  for (const [domain, urls] of domainMap.entries()) {
    sessions.push({
      name: `Browsing on ${domain}`,
      urls: Array.from(new Set(urls))
    });
  }
  return sessions;
}

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
  const sorted = [...domainMap.entries()].sort((a, b) => b[1].length - a[1].length);
  const MAX_GROUPS = 6;
  if (sorted.length <= MAX_GROUPS) {
    return sorted.map(([domain, tabIds], i) => ({
      name: domain,
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      tabIds,
    }));
  }
  const top = sorted.slice(0, MAX_GROUPS - 1);
  const otherTabIds = sorted.slice(MAX_GROUPS - 1).flatMap(([, ids]) => ids);
  return [
    ...top.map(([domain, tabIds], i) => ({
      name: domain,
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      tabIds,
    })),
    { name: "Other", color: GROUP_COLORS[MAX_GROUPS - 1] as TabGroupColor, tabIds: otherTabIds },
  ];
}

function parseGroupsJson(text: string, tabs: TabInput[]): TabGroup[] {
  try {
    const cleanText = text.replace(/```json|```/g, "").trim();
    // Model sometimes adds preamble text before the JSON array ("Here is the result...").
    // Extract just the [...] portion so surrounding prose doesn't break parsing.
    const start = cleanText.indexOf("[");
    const end = cleanText.lastIndexOf("]");
    if (start === -1 || end === -1) return clusterTabsIntoGroupsFallback(tabs);
    const raw = JSON.parse(cleanText.slice(start, end + 1)) as Array<{ name: string; color: string; indices: number[] }>;
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

  // Re-read .env on each call so env changes don't require a server restart
  dotenv.config({ path: join(__dirname, "..", "..", "..", ".env"), override: true });
  const currentProvider = process.env.AI_PROVIDER || provider;
  const currentApiKey = process.env.ANTHROPIC_API_KEY || apiKey;
  const currentOpenrouterKey = process.env.OPENROUTER_API_KEY || openrouterKey;
  const currentOpenrouterModel = process.env.OPENROUTER_MODEL || openrouterModel;

  const tabList = tabs.map((t, i) => {
    let host = t.url;
    try { host = new URL(t.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    return `${i}: "${t.title}" (${host})`;
  }).join("\n");

  const prompt = `You are a browser tab organizer. Group these tabs the way a focused human would — by what they are actually doing, not by broad topic labels.

Tabs (by index):
${tabList}

Rules:
- Create 3–10 groups based on what genuinely makes sense for THESE specific tabs
- Name each group after the specific site, project, or task — NOT a generic category
  GOOD names: "lowlevel.academy", "GitHub Repos", "RAG with Ollama", "Playwright MCP", "OpenRouter Setup"
  BAD names: "AI Research", "Tech Content", "Learning", "Productivity"
- If many tabs are from the same site on the same topic, name the group after that site + topic
- If tabs are clearly one active task or project, name it after that project
- Pick one color per group from: blue, green, red, yellow, purple, pink, cyan, orange, grey
- Every tab index must appear in exactly one group
- Return ONLY a JSON array, no explanation, no markdown

Format:
[{"name": "lowlevel.academy", "color": "blue", "indices": [0, 1, 2]}, ...]`;

  if (currentProvider === "ollama") {
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
  } else if (currentProvider === "openrouter") {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentOpenrouterKey || ""}`,
          "HTTP-Referer": "https://github.com/glatinone/BraveMCP",
          "X-Title": "BraveMCP Tab Organizer"
        },
        body: JSON.stringify({
          model: currentOpenrouterModel,
          max_tokens: 1500,
          temperature: 0.1,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`OpenRouter tab clustering error: ${await res.text()}`);
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      return parseGroupsJson(data.choices[0].message.content, tabs);
    } catch (error) {
      console.error("OpenRouter tab clustering failed, using domain fallback:", error);
      return clusterTabsIntoGroupsFallback(tabs);
    }
  } else {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": currentApiKey || "",
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

// ---------------------------------------------------------------------------
// Extractive (no-LLM) fallbacks
//
// When Ollama / Anthropic are unavailable, these build a genuinely useful
// summary from the real data passed in, instead of returning a canned string.
// They parse the "- Title: / URL: / Summary:" block format produced by index.ts.
// ---------------------------------------------------------------------------

interface ParsedEntry {
  title: string;
  url: string;
  summary: string;
  domain: string;
}

function parseEntries(text: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  let cur: Partial<ParsedEntry> | null = null;

  const flush = () => {
    if (cur && (cur.title || cur.url)) {
      let domain = "";
      try {
        domain = cur.url ? new URL(cur.url).hostname.replace(/^www\./, "") : "";
      } catch {
        domain = "";
      }
      entries.push({
        title: cur.title || "(untitled)",
        url: cur.url || "",
        summary: cur.summary || "",
        domain,
      });
    }
    cur = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const t = line.match(/^-?\s*Title:\s*(.*)$/i);
    const u = line.match(/^URL:\s*(.*)$/i);
    const s = line.match(/^Summary:\s*(.*)$/i);
    if (t) {
      flush();
      cur = { title: t[1].trim() };
    } else if (u && cur) {
      cur.url = u[1].trim();
    } else if (s && cur) {
      cur.summary = s[1].trim();
    }
  }
  flush();
  return entries;
}

function groupByDomain(entries: ParsedEntry[]): Map<string, ParsedEntry[]> {
  const map = new Map<string, ParsedEntry[]>();
  for (const e of entries) {
    const key = e.domain || "other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

const NO_LLM_TAG = "_(generated without LLM — extractive summary)_";

export function extractiveTabSummary(tabsText: string): string {
  const entries = parseEntries(tabsText);
  if (entries.length === 0) return "No open tabs available to summarize.";

  const byDomain = groupByDomain(entries);
  const ranked = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);
  const focus = ranked.slice(0, 3).map(([domain, es]) => {
    const titles = es.slice(0, 3).map(e => e.title).join("; ");
    return `- **${domain}** (${es.length} ${es.length === 1 ? "page" : "pages"}: ${titles})`;
  });

  return [
    `You currently have **${entries.length} tabs** open across **${byDomain.size} ${byDomain.size === 1 ? "site" : "sites"}**.`,
    ``,
    `Main focus areas:`,
    ...focus,
    ``,
    NO_LLM_TAG,
  ].join("\n");
}

export function extractiveTopicSummary(topic: string, pagesText: string): string {
  const entries = parseEntries(pagesText);
  if (entries.length === 0) return `No captured pages found for "${topic}".`;

  const byDomain = groupByDomain(entries);
  const sources = entries.slice(0, 8).map(e => {
    const snippet = e.summary
      ? ` — ${e.summary.substring(0, 140)}${e.summary.length > 140 ? "…" : ""}`
      : "";
    return `- **${e.title}** (${e.domain || e.url})${snippet}`;
  });

  return [
    `### Research synthesis: "${topic}"`,
    ``,
    `Found **${entries.length} ${entries.length === 1 ? "source" : "sources"}** across **${byDomain.size} ${byDomain.size === 1 ? "domain" : "domains"}** (${[...byDomain.keys()].join(", ")}).`,
    ``,
    `**Sources:**`,
    ...sources,
    ``,
    NO_LLM_TAG,
  ].join("\n");
}

function parseContentItems(text: string): string[] {
  const items: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const p = line.match(/^-\s*Page:\s*(.*)$/i);
    const n = line.match(/^-\s*Note:\s*(.*)$/i);
    if (p) items.push(`Page: ${p[1].trim()}`);
    else if (n) items.push(`Note: ${n[1].trim()}`);
  }
  return items;
}

function deriveDigestQuestions(topDomains: string): string[] {
  const names = topDomains
    .split(",")
    .map(d => d.replace(/\(.*?\)/g, "").trim())
    .filter(Boolean);
  const qs: string[] = [];
  if (names[0]) qs.push(`You spent the most time on ${names[0]} — is there a related topic worth a deeper dive?`);
  if (names[1]) qs.push(`How do your findings from ${names[1]} connect to the rest of this week's research?`);
  qs.push(`Which of these pages is worth turning into a permanent note or bookmark?`);
  return qs.slice(0, 3);
}

export function extractiveWeeklyDigest(statsText: string, contentSummaryText: string): string {
  const items = parseContentItems(contentSummaryText);
  const domainsMatch = statsText.match(/Most Active Domains:\s*(.*)/i);
  const topDomains = domainsMatch ? domainsMatch[1].trim() : "";

  const captures = items.length
    ? items.slice(0, 5).map(i => `- ${i}`)
    : ["- No detailed page summaries captured this week."];
  const questions = deriveDigestQuestions(topDomains);

  return [
    `### 📊 Weekly Research Digest`,
    ``,
    `**Activity Summary**`,
    statsText,
    ``,
    `**Major Themes**`,
    topDomains && topDomains !== "None"
      ? `Your activity clustered around: ${topDomains}.`
      : `Not enough domain data to cluster themes yet.`,
    ``,
    `**Recent Captures**`,
    ...captures,
    ``,
    `**Questions to explore next**`,
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    ``,
    `_(generated without LLM — extractive digest)_`,
  ].join("\n");
}
