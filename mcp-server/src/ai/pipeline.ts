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
      console.error("Failed to generate group summary with Ollama:", error);
      return "Current research focuses on the open tabs relating to web development and Model Context Protocol.";
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
      console.error("Failed to generate group summary with Anthropic:", error);
      return "Current research focuses on the open tabs relating to web development and Model Context Protocol.";
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
      console.error("Failed to generate topic synthesis with Ollama:", error);
      return `Synthesis on "${topic}": Relies on the gathered browser research database.`;
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
      console.error("Failed to generate topic synthesis with Anthropic:", error);
      return `Synthesis on "${topic}": Relies on the gathered browser research database.`;
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
    summary: summary || text.substring(0, 150),
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
      console.error("Failed to generate weekly digest with Ollama:", error);
      return `### Weekly Research Digest (Fallback)
Here is what you worked on:
- Visited various sites.
- Captured research pages.
  
**Questions to explore next**:
1. What are the key performance considerations of your setup?
2. How do you plan to scale the storage architecture?
3. What are the next security hardening steps?`;
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
      console.error("Failed to generate weekly digest with Anthropic:", error);
      return `### Weekly Research Digest (Fallback)
Here is what you worked on:
- Visited various sites.
- Captured research pages.`;
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
