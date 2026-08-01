/**
 * Frontend API client — targets SAP CAP (CAPM) backend.
 * Dev: Vite proxies /api → CAP :4004 (REST facade on CAP server).
 * Prod: same paths via App Router / destination to CAP srv.
 */
import type { ArchitectureModel, PipelineResult } from "./types";

export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mimeType: file.type || "image/png" };
}

export async function runDemo(opts: {
  hints: string;
  fileName?: string;
  autoApprove?: boolean;
}): Promise<PipelineResult> {
  const res = await fetch("/api/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hints: opts.hints,
      fileName: opts.fileName ?? "whiteboard-agentic.png",
      autoApprove: opts.autoApprove ?? false,
    }),
  });
  return parseResult(res);
}

export async function runPipeline(opts: {
  hints: string;
  file?: File | null;
  fileName?: string;
  autoApprove?: boolean;
}): Promise<PipelineResult> {
  let imageBase64 = "";
  let mimeType = "image/png";
  let fileName = opts.fileName ?? "upload.png";

  if (opts.file) {
    const converted = await fileToBase64(opts.file);
    imageBase64 = converted.base64;
    mimeType = converted.mimeType;
    fileName = opts.file.name || fileName;
  }

  const res = await fetch("/api/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hints: opts.hints,
      fileName,
      imageBase64,
      mimeType,
      autoApprove: opts.autoApprove ?? false,
    }),
  });
  return parseResult(res);
}

export async function approveJob(
  jobId: string,
  model: ArchitectureModel
): Promise<PipelineResult> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  return parseResult(res);
}

export async function getHealth(): Promise<{
  ok: boolean;
  backend?: string;
  service?: string;
  vectorKind?: string;
  vectorCount?: number;
  error?: string;
}> {
  try {
    const res = await fetch("/api/health");
    return await res.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
