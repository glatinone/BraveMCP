import { ChromaClient } from "chromadb";

let client: ChromaClient | null = null;
let collection: any = null;

export async function initChroma() {
  try {
    client = new ChromaClient({ path: "http://localhost:8000" });
    const heart = await client.heartbeat();
    console.error(`ChromaDB Heartbeat: ${heart}`);

    collection = await client.getOrCreateCollection({
      name: "bravemcp_pages",
      metadata: { "hnsw:space": "cosine" }
    });
    console.error("ChromaDB collection initialized successfully");
  } catch (error) {
    console.error("Failed to initialize ChromaDB. Semantic search will be unavailable. Error:", error);
    collection = null;
  }
}

export async function addPageEmbedding(
  pageId: string,
  embedding: number[],
  metadata: { url: string; title: string; created_at: number },
  documentText: string
) {
  if (!collection) {
    console.error("ChromaDB is not initialized. Skipping embedding save.");
    return;
  }
  try {
    // Delete existing ID if present to avoid duplication conflicts
    try {
      await collection.delete({ ids: [pageId] });
    } catch {
      // Ignore if not present
    }

    await collection.add({
      ids: [pageId],
      embeddings: [embedding],
      metadatas: [metadata],
      documents: [documentText]
    });
    console.error(`Successfully indexed page in ChromaDB: ${metadata.url}`);
  } catch (error) {
    console.error("Failed to save embedding in ChromaDB:", error);
  }
}

export async function queryChroma(queryEmbedding: number[], limit: number = 5) {
  if (!collection) {
    console.error("ChromaDB is not initialized. Skipping similarity search.");
    return [];
  }
  try {
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit
    });

    if (!results || !results.ids || !results.ids[0]) return [];

    const matchedIds = results.ids[0];
    const distances = results.distances ? results.distances[0] : [];
    const metadatas = results.metadatas ? results.metadatas[0] : [];

    return matchedIds.map((id: string, index: number) => ({
      id,
      distance: distances[index] !== undefined ? distances[index] : 0.5,
      metadata: metadatas[index] || {}
    }));
  } catch (error) {
    console.error("ChromaDB query failed:", error);
    return [];
  }
}
export function isChromaConnected(): boolean {
  return collection !== null;
}
