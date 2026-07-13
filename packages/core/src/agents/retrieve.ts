import type { ArchitectureModel, ReferenceArchitecture } from "@sap-architect/shared";
import { getVectorStore, scoreLocal, type ScoredReference } from "../vector/index.js";
import { REFERENCE_ARCHITECTURES } from "../samples/references.js";

export type { ScoredReference };

function queryFromModel(model: ArchitectureModel): string {
  return [
    model.title,
    model.summary,
    ...model.components.map((c) => c.officialName ?? c.label),
    ...model.zones.map((z) => z.label),
    ...model.flows.map((f) => `${f.label ?? ""} ${f.protocol ?? ""}`),
  ].join(" ");
}

/**
 * Retrieve reference architectures. Uses vector store when available;
 * falls back to in-memory scoring of the provided catalog / seed set.
 */
export async function retrieveReferences(
  model: ArchitectureModel,
  limit = 3,
  catalog?: ReferenceArchitecture[]
): Promise<ScoredReference[]> {
  const query = queryFromModel(model);

  if (catalog) {
    return scoreLocal(query, catalog, limit);
  }

  try {
    const store = await getVectorStore();
    const count = await store.count();
    if (count > 0) {
      return store.search(query, limit);
    }
  } catch {
    /* fall through */
  }

  return scoreLocal(query, REFERENCE_ARCHITECTURES, limit);
}

/** Sync helper for tests / simple callers. */
export function retrieveReferencesSync(
  model: ArchitectureModel,
  limit = 3,
  catalog: ReferenceArchitecture[] = REFERENCE_ARCHITECTURES
): ScoredReference[] {
  return scoreLocal(queryFromModel(model), catalog, limit);
}
