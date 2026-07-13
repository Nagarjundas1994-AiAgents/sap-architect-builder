import { MemoryVectorStore } from "./memory-store.js";
import { PgVectorStore } from "./pgvector-store.js";
import type { VectorStore } from "./store.js";

export type { VectorStore, ScoredReference } from "./store.js";
export { MemoryVectorStore } from "./memory-store.js";
export { PgVectorStore } from "./pgvector-store.js";
export { embedText, cosineSimilarity, tokenize } from "./embed.js";
export { buildCorpusText, ensureEmbedding, scoreLocal } from "./store.js";

let singleton: VectorStore | null = null;

/**
 * Resolve vector store: pgvector when DATABASE_URL is set, else in-memory.
 */
export async function getVectorStore(options?: {
  databaseUrl?: string;
  forceMemory?: boolean;
}): Promise<VectorStore> {
  if (options?.forceMemory) {
    return new MemoryVectorStore();
  }
  if (singleton) return singleton;

  const url = options?.databaseUrl ?? process.env.DATABASE_URL;
  if (url) {
    try {
      const store = new PgVectorStore(url);
      // force init
      await store.count();
      singleton = store;
      return store;
    } catch (err) {
      console.warn(
        "[vector] pgvector unavailable, falling back to memory:",
        err instanceof Error ? err.message : err
      );
    }
  }

  singleton = new MemoryVectorStore();
  return singleton;
}

export function resetVectorStoreSingleton(): void {
  singleton = null;
}
