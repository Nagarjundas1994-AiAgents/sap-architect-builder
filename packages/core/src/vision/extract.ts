import type { ArchitectureModel, ExtractVisionRequest } from "@sap-architect/shared";
import { mockExtractFromImage } from "./mock.js";

export interface VisionExtractorOptions {
  provider?: "mock" | "openai";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const SYSTEM_PROMPT = `You are an SAP solution architect assistant.
Analyze the uploaded whiteboard sketch, architecture diagram photo, or notes.
Extract a structured architecture model as JSON only (no markdown).

Return this shape:
{
  "title": string,
  "level": "L0" | "L1" | "L2",
  "summary": string,
  "actors": [{ "id": string, "label": string, "role"?: string }],
  "zones": [{ "id": string, "label": string, "kind": "sap-btp"|"sap-cloud"|"on-premise"|"hyperscaler"|"partner"|"user"|"network"|"custom", "parentId"?: string }],
  "components": [{ "id": string, "label": string, "subtitle"?: string, "kind": "sap-service"|"sap-product"|"custom-app"|"agent"|"database"|"integration"|"identity"|"external"|"actor"|"generic", "zoneId": string, "sapIcon"?: string, "officialName"?: string, "confidence"?: number, "notes"?: string }],
  "flows": [{ "id": string, "sourceId": string, "targetId": string, "label"?: string, "protocol"?: string, "mode"?: "sync"|"async"|"event"|"batch"|"trust"|"admin", "bidirectional"?: boolean, "confidence"?: number }],
  "assumptions": [{ "id": string, "text": string, "severity": "info"|"warning"|"critical" }]
}

Rules:
- Prefer exact current SAP product names when recognizable.
- If unsure of a product, use a generic label and add an assumption.
- Infer relationships from arrows, grouping, and proximity — not only OCR text.
- Use stable kebab-case ids.
- confidence is 0-1.
`;

function normalizeModel(raw: Partial<ArchitectureModel>, fileName?: string): ArchitectureModel {
  const now = new Date().toISOString();
  return {
    id: raw.id ?? `arch-${Date.now()}`,
    title: raw.title ?? "Extracted Architecture",
    level: raw.level ?? "L1",
    summary: raw.summary ?? "",
    actors: raw.actors ?? [],
    zones: raw.zones ?? [],
    components: raw.components ?? [],
    flows: raw.flows ?? [],
    assumptions: raw.assumptions ?? [],
    sourceImageName: fileName ?? raw.sourceImageName,
    createdAt: raw.createdAt ?? now,
  };
}

export async function extractArchitectureFromImage(
  req: ExtractVisionRequest,
  options: VisionExtractorOptions = {}
): Promise<ArchitectureModel> {
  const provider = options.provider ?? (options.apiKey ? "openai" : "mock");

  if (provider === "mock" || !options.apiKey) {
    return mockExtractFromImage(req);
  }

  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = options.model ?? "gpt-4o";
  const dataUrl = `data:${req.mimeType};base64,${req.imageBase64}`;

  const userText = [
    "Extract the architecture model from this image.",
    req.hints ? `Architect hints: ${req.hints}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vision API failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Vision API returned empty content");

  const parsed = JSON.parse(content) as Partial<ArchitectureModel>;
  return normalizeModel(parsed, req.fileName);
}

export { SYSTEM_PROMPT };
