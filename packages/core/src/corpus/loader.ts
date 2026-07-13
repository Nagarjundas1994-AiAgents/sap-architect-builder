import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReferenceArchitecture } from "@sap-architect/shared";
import { getVectorStore, type VectorStore } from "../vector/index.js";
import { REFERENCE_ARCHITECTURES } from "../samples/references.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CorpusIndexFile {
  source?: string;
  portal?: string;
  references: ReferenceArchitecture[];
}

/** Resolve samples/corpus path from monorepo layout. */
export function resolveCorpusDir(explicit?: string): string {
  if (explicit) return resolve(explicit);
  if (process.env.CORPUS_DIR) return resolve(process.env.CORPUS_DIR);

  const candidates = [
    join(__dirname, "../../../../samples/corpus"),
    join(process.cwd(), "samples/corpus"),
    join(process.cwd(), "../../samples/corpus"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

export function loadCorpusFromDisk(corpusDir?: string): ReferenceArchitecture[] {
  const root = resolveCorpusDir(corpusDir);
  const refs: ReferenceArchitecture[] = [];
  const seen = new Set<string>();

  const add = (list: ReferenceArchitecture[]) => {
    for (const r of list) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      refs.push({
        ...r,
        source: r.source ?? "curated",
        tags: r.tags ?? [],
        products: r.products ?? [],
        corpus: r.corpus ?? `${r.title} ${r.summary}`,
      });
    }
  };

  // Architecture Center seed
  const acIndex = join(root, "architecture-center", "index.json");
  if (existsSync(acIndex)) {
    const parsed = JSON.parse(readFileSync(acIndex, "utf8")) as CorpusIndexFile;
    add(parsed.references ?? []);
  }

  // Any additional *.json under corpus/ (flat or nested one level)
  const walkJson = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) {
        walkJson(p);
        continue;
      }
      if (!name.name.endsWith(".json")) continue;
      if (p.replace(/\\/g, "/").endsWith("architecture-center/index.json")) continue;
      try {
        const data = JSON.parse(readFileSync(p, "utf8")) as
          | CorpusIndexFile
          | ReferenceArchitecture
          | ReferenceArchitecture[];
        if (Array.isArray(data)) add(data);
        else if ("references" in data && Array.isArray(data.references)) add(data.references);
        else if ("id" in data && "title" in data) add([data as ReferenceArchitecture]);
      } catch {
        /* skip invalid */
      }
    }
  };
  walkJson(root);

  // Fallback built-in seed
  if (refs.length === 0) {
    add(REFERENCE_ARCHITECTURES);
  }

  return refs;
}

/**
 * Optionally enrich corpus by fetching Architecture Center portal HTML titles (best-effort).
 * Does not replace curated entries; only adds discovery notes as lightweight refs when network works.
 */
export async function discoverArchitectureCenter(
  portalUrl = "https://architecture.learning.sap.com/"
): Promise<ReferenceArchitecture[]> {
  try {
    const res = await fetch(portalUrl, {
      headers: { Accept: "text/html", "User-Agent": "SAP-Architect-Builder-Corpus/0.1" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // Capture internal ref-arch style links if present
    const links = [...html.matchAll(/href="([^"]*ref-arch[^"]*)"/gi)].map((m) => m[1]);
    const unique = [...new Set(links)].slice(0, 20);
    return unique.map((href, i) => {
      const url = href.startsWith("http") ? href : new URL(href, portalUrl).toString();
      const slug = url.split("/").filter(Boolean).pop() ?? `disc-${i}`;
      return {
        id: `ac-discover-${slug}`,
        title: `Architecture Center reference (${slug})`,
        summary: `Discovered reference architecture link from ${portalUrl}`,
        tags: ["architecture-center", "discovered"],
        products: [],
        corpus: `sap architecture center reference ${slug} ${url}`,
        sourceUrl: url,
        source: "architecture-center-discover",
      } satisfies ReferenceArchitecture;
    });
  } catch {
    return [];
  }
}

export interface LoadCorpusOptions {
  corpusDir?: string;
  databaseUrl?: string;
  forceMemory?: boolean;
  discover?: boolean;
  store?: VectorStore;
}

export interface LoadCorpusResult {
  count: number;
  storeKind: "memory" | "pgvector";
  ids: string[];
}

/** Load Architecture Center (+ local) corpus into the vector store. */
export async function loadCorpusIntoStore(
  options: LoadCorpusOptions = {}
): Promise<LoadCorpusResult> {
  const store =
    options.store ??
    (await getVectorStore({
      databaseUrl: options.databaseUrl,
      forceMemory: options.forceMemory,
    }));

  let refs = loadCorpusFromDisk(options.corpusDir);
  if (options.discover) {
    const discovered = await discoverArchitectureCenter();
    const existing = new Set(refs.map((r) => r.id));
    refs = [...refs, ...discovered.filter((d) => !existing.has(d.id))];
  }

  await store.upsert(refs);
  return {
    count: refs.length,
    storeKind: store.kind,
    ids: refs.map((r) => r.id),
  };
}
