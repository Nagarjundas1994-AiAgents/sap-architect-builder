import type { ReferenceArchitecture } from "@sap-architect/shared";
import {
  type ScoredReference,
  type VectorStore,
  ensureEmbedding,
  scoreLocal,
} from "./store.js";

export class MemoryVectorStore implements VectorStore {
  readonly kind = "memory" as const;
  private byId = new Map<string, ReferenceArchitecture>();

  async upsert(refs: ReferenceArchitecture[]): Promise<void> {
    for (const r of refs) {
      this.byId.set(r.id, ensureEmbedding(r));
    }
  }

  async search(query: string, limit = 3): Promise<ScoredReference[]> {
    return scoreLocal(query, [...this.byId.values()], limit);
  }

  async list(): Promise<ReferenceArchitecture[]> {
    return [...this.byId.values()].map(({ embedding: _e, ...r }) => r as ReferenceArchitecture);
  }

  async count(): Promise<number> {
    return this.byId.size;
  }
}
