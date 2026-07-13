import { EMBEDDING_DIMS } from "@sap-architect/shared";

/** Tokenize for bag-of-words / feature hashing. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+/.-]+/)
    .filter((t) => t.length > 2);
}

/** Simple stable string hash → non-negative int. */
function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** L2-normalized fixed-size embedding via feature hashing (offline-friendly). */
export function embedText(text: string, dims: number = EMBEDDING_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0);
  for (const t of tokenize(text)) {
    const idx = hashToken(t) % dims;
    vec[idx] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n.toFixed(6) : "0")).join(",")}]`;
}
