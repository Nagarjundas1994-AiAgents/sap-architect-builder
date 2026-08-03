import type { ArchitectureModel, ExtractVisionRequest } from "@sap-architect/shared";
import { mockExtractFromImage } from "./mock.js";
import {
  complete,
  extractJson,
  keyFromEnv,
  resolveProvider,
  type ProviderId,
} from "./providers.js";

export interface VisionExtractorOptions {
  provider?: ProviderId | string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const SYSTEM_PROMPT = `You are an enterprise solution architect.
Read the supplied sketch, diagram photo or notes and return one JSON architecture
model. Return JSON only — no prose, no markdown fence.

Shape:
{
  "title": string,
  "level": "L0" | "L1" | "L2",
  "style"?: "reference"|"solution"|"integration"|"c4-context"|"c4-container"|"component"|"deployment"|"dataflow"|"sequence"|"enterprise-ai",
  "summary": string,
  "actors": [{ "id": string, "label": string, "role"?: string }],
  "zones": [{ "id": string, "label": string, "kind": "sap-btp"|"sap-cloud"|"on-premise"|"hyperscaler"|"partner"|"user"|"network"|"custom", "parentId"?: string, "boundary"?: "trust"|"network"|"tenant"|"compliance", "environment"?: string, "tenant"?: string }],
  "components": [{ "id": string, "label": string, "subtitle"?: string, "kind": "sap-service"|"sap-product"|"custom-app"|"agent"|"database"|"integration"|"identity"|"external"|"actor"|"generic", "zoneId": string, "parentId"?: string, "officialName"?: string, "emphasis"?: "focus"|"normal"|"muted", "shape"?: "card"|"icon"|"stack", "confidence"?: number, "notes"?: string }],
  "flows": [{ "id": string, "sourceId": string, "targetId": string, "label"?: string, "protocol"?: string, "mode"?: "sync"|"async"|"event"|"batch"|"trust"|"admin", "bidirectional"?: boolean, "confidence"?: number }],
  "assumptions": [{ "id": string, "text": string, "severity": "info"|"warning"|"critical" }]
}

Rules:
- Use exact, current product names when you recognise them; otherwise a precise
  functional label plus an assumption saying what must be confirmed.
- Infer relationships from arrows, grouping and proximity, not only from text.
- Use "parentId" on a component when one thing genuinely runs inside another.
- Mark the subject of the diagram "focus" and surrounding context "muted".
- Stable kebab-case ids. confidence is 0-1.
- Never invent a product, protocol or trust relationship that is not evidenced.
- A statement that covers a group covers every member of it. "All users authenticate
  through X" means one flow per actor, not one flow in total. The same applies to
  "every system reaches Y through Z". Never collapse a group rule into one example.
- Actors are placed inside the zone whose "kind" is "user". If the people in the
  diagram sit in a zone — "Devices", "Channels", "Users" — give that zone
  kind:"user", even when it also holds phones or laptops. Exactly one zone.
- Every zone you declare must hold something. Do not emit a zone you put no
  components in and no actors in.
- Set "footer" to { "label": "<solution area>", "updated": "<ISO date>" } so the
  drawing carries a title block.
- Add a "dividers" entry when the landscape crosses an ownership or network
  boundary — for example { "label": "Network", "afterZoneId": "<last SAP zone>" }
  before a third-party or on-premise zone.
- Use "mode" on flows deliberately — the connector colour and the legend come from
  it, so it must state the meaning, not the transport:
    "trust"         authentication, SSO, SAML/OIDC federation        (green)
    "provisioning"  SCIM, identity or role replication               (violet)
    "authorization" policy, scope or role decisions                  (indigo)
    "agent"         agent-to-agent (A2A) conversations               (magenta)
    "async"         MCP, WebSocket and other non-blocking channels   (teal)
    "event"         published business events                        (amber, dashed)
    "batch"         scheduled or nightly replication                 (brown, dashed)
    "sync"          ordinary request/response                        (blue)
  Leave "mode" out only when none of these apply.`;

/**
 * Give every entity a unique id, rewriting the references that pointed at the
 * duplicates.
 *
 * Models reuse an id across kinds surprisingly often — a zone "users" and an actor
 * "users" in the same document. Validation rejects that outright, which threw away a
 * perfectly recoverable extraction and failed the whole run. Renaming the later
 * collision keeps the architecture and costs nothing.
 */
function dedupeIds(raw: Partial<ArchitectureModel>): void {
  const seen = new Set<string>();
  const rename = new Map<string, string>();

  const claim = (entity: { id?: string }, kind: string) => {
    const original = entity.id ?? "";
    let id = original || kind;
    for (let n = 2; !id || seen.has(id); n++) id = `${original || kind}-${n}`;
    seen.add(id);
    if (id !== original) rename.set(`${kind}:${original}`, id);
    entity.id = id;
  };

  for (const z of raw.zones ?? []) claim(z, "zone");
  for (const a of raw.actors ?? []) claim(a, "actor");
  for (const c of raw.components ?? []) claim(c, "component");
  for (const f of raw.flows ?? []) claim(f, "flow");

  if (!rename.size) return;
  // an endpoint may name an actor or a component, so try both origins
  const remap = (id?: string) =>
    id === undefined
      ? id
      : rename.get(`component:${id}`) ?? rename.get(`actor:${id}`) ?? id;
  for (const c of raw.components ?? []) {
    c.zoneId = rename.get(`zone:${c.zoneId}`) ?? c.zoneId;
    c.parentId = remap(c.parentId);
  }
  for (const z of raw.zones ?? []) z.parentId = rename.get(`zone:${z.parentId}`) ?? z.parentId;
  for (const f of raw.flows ?? []) {
    f.sourceId = remap(f.sourceId) ?? f.sourceId;
    f.targetId = remap(f.targetId) ?? f.targetId;
  }
}

/**
 * Level states how much detail the drawing carries, and reviewers read it that way.
 * Models routinely claim L1 for a landscape with two dozen components and nested
 * zones, which is an L2 by any reading — so an obviously wrong claim is corrected.
 */
function levelFor(raw: Partial<ArchitectureModel>): ArchitectureModel["level"] {
  const claimed = raw.level ?? "L1";
  const components = raw.components?.length ?? 0;
  const nested = (raw.zones ?? []).some((z) => z.parentId);
  if (claimed === "L0" && components > 6) return "L1";
  if (claimed !== "L2" && (components >= 14 || (components >= 10 && nested))) return "L2";
  return claimed;
}

function normalizeModel(raw: Partial<ArchitectureModel>, fileName?: string): ArchitectureModel {
  const now = new Date().toISOString();
  dedupeIds(raw);
  return {
    id: raw.id ?? `arch-${Date.now()}`,
    title: raw.title ?? "Extracted Architecture",
    level: levelFor(raw),
    style: raw.style,
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
  const profile = resolveProvider(options.provider);
  const apiKey = options.apiKey || keyFromEnv(profile);

  // Without a key there is nothing to call; the sample extractor keeps the studio
  // usable offline rather than failing.
  if (profile.id === "mock" || !apiKey) return mockExtractFromImage(req);

  const hasImage = Boolean(req.imageBase64);
  const userText = [
    hasImage && profile.vision
      ? "Extract the architecture model from the attached image."
      : "Build the architecture model from the description below.",
    req.hints ? `Architect notes: ${req.hints}` : "",
    hasImage && !profile.vision
      ? `(An image named ${req.fileName ?? "upload"} was supplied but this model cannot read images; rely on the notes and say so in the assumptions.)`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await complete({
    profile,
    apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    system: SYSTEM_PROMPT,
    user: userText,
    image: hasImage ? { base64: req.imageBase64, mimeType: req.mimeType } : undefined,
  });

  let parsed: Partial<ArchitectureModel>;
  try {
    parsed = JSON.parse(extractJson(text)) as Partial<ArchitectureModel>;
  } catch (e) {
    throw new Error(
      `${profile.label} returned unparseable JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  return normalizeModel(parsed, req.fileName);
}

export { SYSTEM_PROMPT };
export { PROVIDERS, resolveProvider, type ProviderId, type ProviderProfile } from "./providers.js";
