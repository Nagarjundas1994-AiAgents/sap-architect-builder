import type { ReferenceArchitecture } from "@sap-architect/shared";
import { cosineSimilarity, embedText } from "./embed.js";

export interface ScoredReference {
  ref: ReferenceArchitecture;
  score: number;
}

export interface VectorStore {
  readonly kind: "memory" | "pgvector";
  upsert(refs: ReferenceArchitecture[]): Promise<void>;
  search(query: string, limit?: number): Promise<ScoredReference[]>;
  list(): Promise<ReferenceArchitecture[]>;
  count(): Promise<number>;
  close?(): Promise<void>;
}

/**
 * Below this, a hit is hash noise rather than a match.
 *
 * Embeddings here are 256-dimension feature hashing, so unrelated vocabularies still
 * collide into shared buckets: "banana helicopter tuesday marmalade" scored 0.11
 * against the integration reference. Returning that as the closest reference is worse
 * than returning nothing, because the gap agent then recommends products from it and
 * the studio prints a percentage that reads like a confidence.
 */
export const RELEVANCE_FLOOR = 0.3;

export function scoreLocal(
  query: string,
  refs: ReferenceArchitecture[],
  limit = 3
): ScoredReference[] {
  const q = embedText(query);
  return refs
    .map((ref) => {
      const emb = ref.embedding ?? embedText(buildCorpusText(ref));
      return { ref: { ...ref, embedding: emb }, score: cosineSimilarity(q, emb) };
    })
    .filter((s) => s.score >= RELEVANCE_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildCorpusText(ref: ReferenceArchitecture): string {
  return [ref.title, ref.summary, ref.tags.join(" "), ref.products.join(" "), ref.corpus]
    .filter(Boolean)
    .join(" ");
}

export function ensureEmbedding(ref: ReferenceArchitecture): ReferenceArchitecture {
  if (ref.embedding?.length) return ref;
  return { ...ref, embedding: embedText(buildCorpusText(ref)) };
}
