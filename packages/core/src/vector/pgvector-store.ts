import type { ReferenceArchitecture } from "@sap-architect/shared";
import { EMBEDDING_DIMS } from "@sap-architect/shared";
import pg from "pg";
import { embedText, toPgVectorLiteral } from "./embed.js";
import {
  type ScoredReference,
  type VectorStore,
  buildCorpusText,
  ensureEmbedding,
} from "./store.js";

const { Pool } = pg;

export class PgVectorStore implements VectorStore {
  readonly kind = "pgvector" as const;
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query(`
        CREATE TABLE IF NOT EXISTS architecture_refs (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          tags TEXT[] NOT NULL DEFAULT '{}',
          products TEXT[] NOT NULL DEFAULT '{}',
          corpus TEXT NOT NULL DEFAULT '',
          source_url TEXT,
          source TEXT,
          drawio_path TEXT,
          embedding vector(${EMBEDDING_DIMS}) NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS architecture_refs_embedding_idx
        ON architecture_refs
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 10)
      `).catch(async () => {
        // ivfflat needs data; fall back to no index or hnsw if available
        await client.query(`
          CREATE INDEX IF NOT EXISTS architecture_refs_embedding_hnsw_idx
          ON architecture_refs
          USING hnsw (embedding vector_cosine_ops)
        `).catch(() => {
          /* index optional for small corpora */
        });
      });
    } finally {
      client.release();
    }
  }

  async upsert(refs: ReferenceArchitecture[]): Promise<void> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      for (const raw of refs) {
        const r = ensureEmbedding(raw);
        const emb = r.embedding ?? embedText(buildCorpusText(r));
        await client.query(
          `INSERT INTO architecture_refs
            (id, title, summary, tags, products, corpus, source_url, source, drawio_path, embedding, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector, NOW())
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             summary = EXCLUDED.summary,
             tags = EXCLUDED.tags,
             products = EXCLUDED.products,
             corpus = EXCLUDED.corpus,
             source_url = EXCLUDED.source_url,
             source = EXCLUDED.source,
             drawio_path = EXCLUDED.drawio_path,
             embedding = EXCLUDED.embedding,
             updated_at = NOW()`,
          [
            r.id,
            r.title,
            r.summary,
            r.tags,
            r.products,
            r.corpus,
            r.sourceUrl ?? null,
            r.source ?? null,
            r.drawioPath ?? null,
            toPgVectorLiteral(emb),
          ]
        );
      }
    } finally {
      client.release();
    }
  }

  async search(query: string, limit = 3): Promise<ScoredReference[]> {
    await this.ready;
    const q = embedText(query);
    const { rows } = await this.pool.query(
      `SELECT id, title, summary, tags, products, corpus, source_url, source, drawio_path,
              1 - (embedding <=> $1::vector) AS score
       FROM architecture_refs
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [toPgVectorLiteral(q), limit]
    );
    return rows.map((row) => ({
      score: Number(row.score) || 0,
      ref: rowToRef(row),
    }));
  }

  async list(): Promise<ReferenceArchitecture[]> {
    await this.ready;
    const { rows } = await this.pool.query(
      `SELECT id, title, summary, tags, products, corpus, source_url, source, drawio_path
       FROM architecture_refs ORDER BY title`
    );
    return rows.map(rowToRef);
  }

  async count(): Promise<number> {
    await this.ready;
    const { rows } = await this.pool.query(`SELECT COUNT(*)::int AS c FROM architecture_refs`);
    return rows[0]?.c ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowToRef(row: Record<string, unknown>): ReferenceArchitecture {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary),
    tags: (row.tags as string[]) ?? [],
    products: (row.products as string[]) ?? [],
    corpus: String(row.corpus ?? ""),
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    source: row.source ? String(row.source) : undefined,
    drawioPath: row.drawio_path ? String(row.drawio_path) : undefined,
  };
}
