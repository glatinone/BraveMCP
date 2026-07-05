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
const openrouterModel = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5";

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

// Last-resort fallback: smart no-LLM consolidation. Clusters by shared title
// tokens first (cross-domain capable), then consolidates leftovers by domain.
// Deliberately NEVER emits catch-all buckets or one group per tiny domain —
// true singletons simply stay ungrouped, which is calmer than spam.
const FALLBACK_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "you", "how",
  "what", "when", "where", "which", "best", "top", "new", "free", "guide",
  "home", "page", "pages", "official", "site", "website", "search", "login",
  "dashboard", "inbox", "untitled", "google", "youtube", "github", "reddit",
  "gmail", "twitter", "facebook", "linkedin", "instagram", "tiktok", "medium",
  "penelusuran", "docs", "documentation", "tutorial", "online", "watch",
]);

export function clusterTabsIntoGroupsFallback(tabs: TabInput[]): TabGroup[] {
  const MAX_GROUPS = 10;
  const info = tabs.map(t => {
    let host = "";
    try { host = new URL(t.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    const tokens = new Set(
      (t.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9à-ſ\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 4 && !FALLBACK_STOPWORDS.has(w))
    );
    return { tab: t, host, tokens };
  });

  const remaining = new Set(info.map((_, i) => i));
  const groups: TabGroup[] = [];

  // Pass 1: thematic clusters — the most-shared meaningful title token wins
  while (groups.length < MAX_GROUPS) {
    const counts = new Map<string, number[]>();
    for (const i of remaining) {
      for (const tok of info[i].tokens) {
        if (!counts.has(tok)) counts.set(tok, []);
        counts.get(tok)!.push(i);
      }
    }
    let best: [string, number[]] | null = null;
    for (const entry of counts) {
      if (entry[1].length >= 2 && (!best || entry[1].length > best[1].length)) {
        best = entry;
      }
    }
    if (!best) break;
    const [token, members] = best;
    for (const i of members) remaining.delete(i);
    groups.push({
      name: token.charAt(0).toUpperCase() + token.slice(1),
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
      tabIds: members.map(i => info[i].tab.tabId),
    });
  }

  // Pass 2: consolidate leftovers by domain, only when a domain has >= 2 tabs
  const byHost = new Map<string, number[]>();
  for (const i of remaining) {
    const host = info[i].host || "site";
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(i);
  }
  const multiTabHosts = [...byHost.entries()]
    .filter(([, members]) => members.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [host, members] of multiTabHosts) {
    if (groups.length >= MAX_GROUPS) break;
    const label = host.split(".")[0];
    for (const i of members) remaining.delete(i);
    groups.push({
      name: `${label.charAt(0).toUpperCase() + label.slice(1)} pages`,
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
      tabIds: members.map(i => info[i].tab.tabId),
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Self-healing grouping pipeline:
//   Phase 1 (Generation)  — LLM produces a draft grouping
//   Phase 2 (Evaluation)  — deterministic scoring engine rates it 0–100
//   Phase 3 (Self-fixing) — score < 85 feeds the draft + failure reasons back
//                           into a repair prompt; max 3 attempts, then clean
//                           domain fallback
// ---------------------------------------------------------------------------

const QUALITY_THRESHOLD = 90;
const MAX_GENERATION_ATTEMPTS = 3;

const BLACKLISTED_GROUP_NAMES = /^(other|others|misc|miscellaneous|general|untitled|various|uncategorized|mixed|random|stuff|tech links)$/i;
const PLATFORM_ONLY_NAMES = /^(youtube|github|reddit|google|twitter|x|facebook|instagram|linkedin|gmail|tiktok|medium)(\s*\.?\s*(com|ai|io|net|org|to))?$/i;
const DOMAIN_LIKE_NAMES = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export interface GroupQualityReport {
  score: number;
  reasons: string[];
}

// Phase 2: deterministic scoring engine.
// Structural integrity carries 60% weight, semantic/name quality 40%,
// fragmentation subtracts up to 30 points, blacklisted names are an
// instant rejection (score 0).
export function evaluateGroupQuality(groups: TabGroup[], tabs: TabInput[]): GroupQualityReport {
  const reasons: string[] = [];
  if (groups.length === 0) {
    return { score: 0, reasons: ["Draft contains no groups"] };
  }

  // Blacklist Name Penalty — instant rejection
  for (const g of groups) {
    const name = (g.name || "").trim();
    if (BLACKLISTED_GROUP_NAMES.test(name)) {
      return {
        score: 0,
        reasons: [`Group name "${name}" is a forbidden catch-all. Every group needs a specific topic name.`],
      };
    }
    if (PLATFORM_ONLY_NAMES.test(name)) {
      return {
        score: 0,
        reasons: [`Group name "${name}" is a bare platform name. Name the group after what those tabs are ABOUT (their topic), not the website.`],
      };
    }
    if (DOMAIN_LIKE_NAMES.test(name)) {
      return {
        score: 0,
        reasons: [`Group name "${name}" is a raw domain. Domains are NEVER valid group names — name the THEME or PROJECT these tabs share (e.g. "Browser Automation Tools", not "github.com").`],
      };
    }
  }

  // Structural Integrity (60%): every input tab mapped exactly once
  const inputIds = new Set(tabs.map(t => t.tabId));
  const assignments = new Map<number, number>();
  for (const g of groups) {
    for (const id of g.tabIds) {
      assignments.set(id, (assignments.get(id) || 0) + 1);
    }
  }
  const missing = [...inputIds].filter(id => !assignments.has(id));
  const duplicated = [...assignments.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const foreign = [...assignments.keys()].filter(id => !inputIds.has(id));

  if (missing.length > 0) {
    const missingIndices = missing
      .slice(0, 15)
      .map(id => tabs.findIndex(t => t.tabId === id))
      .filter(i => i !== -1);
    reasons.push(`${missing.length} tab(s) are missing from all groups (tab indices: ${missingIndices.join(", ")}). Every index must appear in exactly one group.`);
  }
  if (duplicated.length > 0) {
    reasons.push(`${duplicated.length} tab(s) are assigned to more than one group. Each index must appear exactly once.`);
  }
  if (foreign.length > 0) {
    reasons.push(`${foreign.length} referenced index(es) do not exist in the tab list.`);
  }

  const structuralErrors = missing.length + duplicated.length * 2 + foreign.length * 2;
  const structural = 60 * Math.max(0, 1 - structuralErrors / Math.max(1, tabs.length));

  // Semantic Cohesion (40%): names must be real, unique, reasonably sized
  const nameCounts = new Map<string, number>();
  for (const g of groups) {
    const key = (g.name || "").trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1);

  let validNames = 0;
  for (const g of groups) {
    const name = (g.name || "").trim();
    if (name.length >= 3 && name.length <= 48) {
      validNames++;
    } else {
      reasons.push(`Group name "${name}" is ${name.length < 3 ? "too short" : "too long (max 48 chars)"}.`);
    }
  }
  let semantic = 40 * (validNames / groups.length);
  if (duplicateNames.length > 0) {
    // Duplicate names are the visual spam this pipeline exists to prevent —
    // penalize hard enough that a duplicated draft can never pass threshold.
    semantic = Math.max(0, semantic - 20 * duplicateNames.length);
    reasons.push(`Duplicate group names: ${duplicateNames.map(([n]) => `"${n}"`).join(", ")}. Merge them into one group each.`);
  }

  // Fragmentation Penalty (up to -40): explosion of tiny groups
  const singles = groups.filter(g => g.tabIds.length === 1).length;
  const singleFraction = singles / groups.length;
  let fragmentation = 0;
  if (groups.length >= 3 && singleFraction > 0.4) {
    fragmentation = Math.round(40 * Math.min(1, (singleFraction - 0.4) / 0.6));
    reasons.push(`${singles} of ${groups.length} groups contain only 1 tab. Merge related single-tab groups under broader project/theme umbrellas (ideal group size: 2-8 tabs).`);
  }

  // Cross-Domain Cohesion Bonus (up to +30): groups that bind tabs from
  // DIFFERENT domains under one theme prove real semantic clustering.
  // Only awarded when structure is flawless, so the bonus can never mask
  // missing or duplicated tabs.
  let cohesionBonus = 0;
  if (missing.length === 0 && duplicated.length === 0 && foreign.length === 0) {
    const domainOf = new Map<number, string>();
    for (const t of tabs) {
      let d = "";
      try { d = new URL(t.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      domainOf.set(t.tabId, d);
    }
    const multiTabGroups = groups.filter(g => g.tabIds.length >= 2);
    if (multiTabGroups.length > 0) {
      const crossDomainGroups = multiTabGroups.filter(
        g => new Set(g.tabIds.map(id => domainOf.get(id) || "")).size >= 2
      ).length;
      cohesionBonus = Math.round(30 * (crossDomainGroups / multiTabGroups.length));
    }
  }

  let score = Math.max(0, Math.min(100, Math.round(structural + semantic + cohesionBonus - fragmentation)));
  // Hard caps: structural corruption must never ride past the threshold on
  // the strength of good names alone.
  if (duplicated.length > 0 || foreign.length > 0) score = Math.min(score, 75);
  if (missing.length > Math.max(1, Math.ceil(tabs.length * 0.05))) score = Math.min(score, 85);
  return { score, reasons };
}

// Strict parser: returns null on any failure instead of silently falling back,
// so the self-fixing loop can react to malformed output.
function parseGroupsJsonStrict(text: string, tabs: TabInput[]): TabGroup[] | null {
  try {
    const cleanText = text.replace(/```json|```/g, "").trim();
    const start = cleanText.indexOf("[");
    const end = cleanText.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return null;
    const raw = JSON.parse(cleanText.slice(start, end + 1)) as Array<{ name: string; color: string; indices: number[] }>;
    if (!Array.isArray(raw)) return null;
    const groups = raw.map((g, i) => ({
      name: (g.name || `Group ${i + 1}`).trim(),
      color: (GROUP_COLORS.includes(g.color as TabGroupColor)
        ? g.color
        : GROUP_COLORS[i % GROUP_COLORS.length]) as TabGroupColor,
      tabIds: (Array.isArray(g.indices) ? g.indices : [])
        .map(idx => tabs[idx]?.tabId)
        .filter((id): id is number => id !== undefined),
    })).filter(g => g.tabIds.length > 0);
    return groups.length > 0 ? groups : null;
  } catch {
    return null;
  }
}

function buildClusteringPrompt(
  tabs: TabInput[],
  repair?: { previousDraft: string; score: number; reasons: string[] }
): string {
  const tabList = tabs.map((t, i) => {
    let host = t.url;
    let path = "";
    try {
      const u = new URL(t.url);
      host = u.hostname.replace(/^www\./, "");
      path = u.pathname.length > 1 ? u.pathname.substring(0, 40) : "";
    } catch { /* ignore */ }
    return `${i}: "${t.title}" — ${host}${path}`;
  }).join("\n");

  const base = `You are an expert knowledge-worker assistant organizing browser tabs. Your job is to reconstruct the user's WORKFLOWS: what projects, research threads, or tasks are they actually in the middle of? Group tabs by that intent — NEVER by which website they're on.

Tabs (by index, format: "title" — domain/path):
${tabList}

CORE PRINCIPLE — CROSS-DOMAIN THINKING:
Tabs from DIFFERENT websites often belong to the SAME group. A GitHub repo, a Google search, and a docs page about the same subject are ONE cognitive thread — bind them together. Read both the title AND the URL path (e.g. "ycombinator.com/rfs" means startup ideas, not a generic YC bucket).

STRICT RULES:
1. Group names describe a THEME, PROJECT, or TASK.
   GOOD: "MCP Protocol & Tooling Research", "Malware Analysis Lab Setup", "Frontend UI Component Crafting", "Personal Communications & Mail", "Browser Automation Tools"
   BAD (instant rejection): "google.com", "github.com", "YouTube", "Gmail", "Other", "Misc", "General", "Tech Links"
2. NEVER use a domain name or website name as a group name.
3. NEVER use catch-all names ("Other", "Miscellaneous", "Various", "Uncategorized", "Mixed").
4. Every group name must be UNIQUE.
5. Prefer groups of 2-8 tabs. Unify small related clusters under one broader umbrella theme instead of creating many 1-tab groups.
6. Every tab index must appear in exactly one group — no omissions, no duplicates.
7. Pick one color per group: blue, green, red, yellow, purple, pink, cyan, orange, grey
8. Return ONLY a valid JSON array — no explanation, no markdown, no preamble text.

Format:
[{"name": "MCP Protocol & Tooling Research", "color": "blue", "indices": [0, 3, 7]}, {"name": "Personal Communications & Mail", "color": "green", "indices": [1, 2]}, ...]`;

  if (!repair) return base;

  return `${base}

YOUR PREVIOUS ATTEMPT FAILED QUALITY REVIEW (score: ${repair.score}/100, minimum required: ${QUALITY_THRESHOLD}).

Previous draft:
${repair.previousDraft}

Problems that MUST be fixed:
${repair.reasons.map(r => `- ${r}`).join("\n")}

Produce a corrected JSON array that fixes EVERY problem listed above. Return ONLY the JSON array.`;
}

// Phase 1: one LLM generation call. Returns the raw text or null on failure.
async function callClusteringLLM(
  prompt: string,
  cfg: { provider: string; apiKey?: string; openrouterKey?: string; openrouterModel: string },
  maxTokens: number
): Promise<string | null> {
  try {
    if (cfg.provider === "ollama") {
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
      if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return data.message.content;
    }

    if (cfg.provider === "openrouter") {
      // Adaptive token budgeting: a 402 tells us exactly how many tokens the
      // account can still afford ("can only afford N") — clamp and retry once
      // instead of failing the whole generation pass.
      let tokenBudget = maxTokens;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cfg.openrouterKey || ""}`,
            "HTTP-Referer": "https://github.com/glatinone/BraveMCP",
            "X-Title": "BraveMCP Tab Organizer"
          },
          body: JSON.stringify({
            model: cfg.openrouterModel,
            max_tokens: tokenBudget,
            temperature: 0.1,
            messages: [{ role: "user", content: prompt }]
          })
        });
        if (res.ok) {
          const data = (await res.json()) as { choices: { message: { content: string } }[] };
          return data.choices[0].message.content;
        }
        const errText = await res.text();
        const afford = errText.match(/can only afford (\d+)/);
        if (res.status === 402 && afford && attempt === 0) {
          tokenBudget = Math.max(400, parseInt(afford[1], 10) - 100);
          console.error(`[grouping] OpenRouter 402 — retrying with affordable budget of ${tokenBudget} tokens`);
          continue;
        }
        throw new Error(`OpenRouter error: ${errText}`);
      }
      throw new Error("OpenRouter error: retries exhausted");
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
    const data = (await res.json()) as { content: { text: string }[] };
    return data.content[0].text;
  } catch (error) {
    console.error(`[grouping] LLM call failed (${cfg.provider}):`, error);
    return null;
  }
}

export async function clusterTabsIntoGroups(tabs: TabInput[]): Promise<TabGroup[]> {
  if (tabs.length === 0) return [];

  // Re-read .env on each call so env changes don't require a server restart
  dotenv.config({ path: join(__dirname, "..", "..", "..", ".env"), override: true });
  const cfg = {
    provider: process.env.AI_PROVIDER || provider,
    apiKey: process.env.ANTHROPIC_API_KEY || apiKey,
    openrouterKey: process.env.OPENROUTER_API_KEY || openrouterKey,
    openrouterModel: process.env.OPENROUTER_MODEL || openrouterModel,
  };
  // Scale output budget with tab count. The output is only names + index
  // arrays (~15 tokens per group + ~3 per tab), so this stays lean — huge
  // budgets get rejected outright by OpenRouter on low-credit accounts (402).
  const maxTokens = Math.min(4000, 600 + tabs.length * 15);

  let repair: { previousDraft: string; score: number; reasons: string[] } | undefined;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const prompt = buildClusteringPrompt(tabs, repair);
    const rawText = await callClusteringLLM(prompt, cfg, maxTokens);
    if (rawText === null) {
      console.error(`[Pass ${attempt}] Generation call failed. Retrying...`);
      continue;
    }

    const groups = parseGroupsJsonStrict(rawText, tabs);
    if (!groups) {
      console.error(`[Pass ${attempt}] Score: 0. Penalty: output was not a valid JSON group array. Retrying...`);
      repair = {
        previousDraft: rawText.substring(0, 2000),
        score: 0,
        reasons: ["Output was not a valid JSON array of {name, color, indices} objects. Return ONLY the JSON array."],
      };
      continue;
    }

    const { score, reasons } = evaluateGroupQuality(groups, tabs);
    if (score >= QUALITY_THRESHOLD) {
      console.error(`[Pass ${attempt}] Score: ${score}/100. Verified. Halting loop and applying ${groups.length} groups.`);
      return groups;
    }
    console.error(
      `[Pass ${attempt}] Score: ${score}/100 (threshold ${QUALITY_THRESHOLD}). ` +
      `Penalties: ${reasons.join(" | ") || "below threshold"}. Retrying with feedback...`
    );

    repair = {
      previousDraft: JSON.stringify(
        groups.map(g => ({ name: g.name, color: g.color, indices: g.tabIds.map(id => tabs.findIndex(t => t.tabId === id)) }))
      ).substring(0, 2000),
      score,
      reasons,
    };
  }

  console.error(`[Fallback] All ${MAX_GENERATION_ATTEMPTS} passes stayed below ${QUALITY_THRESHOLD}. Applying consolidated thematic fallback.`);
  return clusterTabsIntoGroupsFallback(tabs);
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
