/**
 * Studio API client. The backend is the CAP service; in development Vite proxies
 * /api to it, in production the same paths are served by the app router.
 */
import type { ArchitectureModel, PipelineResult } from "./types";

export interface ProviderInfo {
  id: string;
  label: string;
  description: string;
  model: string;
  vision: boolean;
  /** A key is configured, so this provider can actually be called. */
  ready: boolean;
}

export interface Health {
  ok: boolean;
  backend?: string;
  service?: string;
  provider?: string;
  engine?: string;
  vectorKind?: string;
  vectorCount?: number;
  providers: ProviderInfo[];
  error?: string;
}

export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // chunked so a large upload cannot blow the argument limit
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { base64: btoa(binary), mimeType: file.type || "image/png" };
}

async function parseResult(res: Response): Promise<PipelineResult> {
  const data = (await res.json()) as PipelineResult & { error?: string; issues?: string[] };
  if (!res.ok && !data.jobId) {
    throw new Error(
      data.error
        ? `${data.error}${data.issues ? `: ${data.issues.join("; ")}` : ""}`
        : `Request failed (${res.status})`
    );
  }
  return data;
}

const post = (path: string, body: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export async function runDemo(opts: {
  hints: string;
  provider?: string;
  fileName?: string;
  autoApprove?: boolean;
}): Promise<PipelineResult> {
  return parseResult(
    await post("/api/demo", {
      hints: opts.hints,
      provider: opts.provider,
      fileName: opts.fileName ?? "sketch.png",
      autoApprove: opts.autoApprove ?? false,
    })
  );
}

export async function runPipeline(opts: {
  hints: string;
  file?: File | null;
  provider?: string;
  autoApprove?: boolean;
}): Promise<PipelineResult> {
  let imageBase64 = "";
  let mimeType = "image/png";
  let fileName = "upload.png";
  if (opts.file) {
    const converted = await fileToBase64(opts.file);
    imageBase64 = converted.base64;
    mimeType = converted.mimeType;
    fileName = opts.file.name || fileName;
  }
  return parseResult(
    await post("/api/pipeline", {
      hints: opts.hints,
      provider: opts.provider,
      fileName,
      imageBase64,
      mimeType,
      autoApprove: opts.autoApprove ?? false,
    })
  );
}

export async function approveJob(
  jobId: string,
  model: ArchitectureModel
): Promise<PipelineResult> {
  return parseResult(await post(`/api/jobs/${encodeURIComponent(jobId)}/approve`, { model }));
}

export async function getHealth(): Promise<Health> {
  try {
    const res = await fetch("/api/health");
    const raw = (await res.json()) as Record<string, unknown>;
    let providers: ProviderInfo[] = [];
    try {
      providers = JSON.parse(String(raw.providersJson ?? "[]")) as ProviderInfo[];
    } catch {
      providers = [];
    }
    return { ...(raw as unknown as Health), providers };
  } catch (e) {
    return { ok: false, providers: [], error: e instanceof Error ? e.message : String(e) };
  }
}
