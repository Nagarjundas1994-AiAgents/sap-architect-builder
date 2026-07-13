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
