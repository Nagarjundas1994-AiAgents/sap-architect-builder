/**
 * Architecture artifacts derived from the reviewed model.
 *
 * The Draw.io file is the picture an architect hands to a stakeholder. These are the
 * companions that go into the design document and the repository: C4 views, a
 * sequence for the runtime path, an identity/trust view, and an ADR recording what
 * was decided and why.
 *
 * Every artifact is derived from the same `ArchitectureModel` that was approved at
 * the review gate, so nothing here can drift from the diagram or invent a component
 * the architect never saw. Text formats only — Mermaid and PlantUML render wherever
 * the team already works (GitHub, Confluence, an IDE) with nothing installed.
 */

import type {
  ArchitectureComponent,
  ArchitectureFlow,
  ArchitectureModel,
  GapFinding,
} from "@sap-architect/shared";

/** Mermaid and PlantUML both treat quotes as delimiters; ids must be identifier-safe. */
const safeId = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_") || "n";
const safeText = (s: string) => s.replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** Human label, preferring the verified product name. */
const nameOf = (c: { label: string; officialName?: string }) =>
  safeText(c.officialName ?? c.label);

/** C4 element type per component kind — actors are people, the rest are systems. */
function c4Kind(kind: ArchitectureComponent["kind"]): "System_Ext" | "SystemDb" | "System" {
  if (kind === "external") return "System_Ext";
  if (kind === "database") return "SystemDb";
  return "System";
}

const technologyOf = (c: ArchitectureComponent) =>
  safeText(c.subtitle ?? (c.kind === "agent" ? "AI agent" : c.kind.replace(/-/g, " ")));

/**
 * C4 level 1 — system context.
 *
 * Actors and the systems they touch, with zones as boundaries. Deliberately drops
 * component nesting: a context diagram that shows internals is not a context diagram.
 */
export function toMermaidContext(model: ArchitectureModel): string {
  const lines = ["C4Context", `  title System context — ${safeText(model.title)}`];

  for (const a of model.actors ?? []) {
    lines.push(`  Person(${safeId(a.id)}, "${safeText(a.label)}", "${safeText(a.role ?? "User")}")`);
  }

  const topZones = (model.zones ?? []).filter((z) => !z.parentId);
  for (const z of topZones) {
    const members = model.components.filter((c) => {
      let zone = model.zones.find((x) => x.id === c.zoneId);
      for (let i = 0; zone && i < 8; i++) {
        if (zone.id === z.id) return true;
        zone = zone.parentId ? model.zones.find((x) => x.id === zone!.parentId) : undefined;
      }
      return false;
    });
    if (!members.length) continue;
    lines.push(`  Enterprise_Boundary(${safeId(z.id)}, "${safeText(z.label)}") {`);
    for (const c of members) {
      lines.push(
        `    ${c4Kind(c.kind)}(${safeId(c.id)}, "${nameOf(c)}", "${technologyOf(c)}")`
      );
    }
    lines.push("  }");
  }

  for (const f of model.flows ?? []) {
    const label = safeText(f.label ?? f.protocol ?? "uses");
    const tech = f.protocol && f.label ? `, "${safeText(f.protocol)}"` : "";
    lines.push(`  Rel(${safeId(f.sourceId)}, ${safeId(f.targetId)}, "${label}"${tech})`);
  }
  return lines.join("\n");
}

/**
 * C4 level 2 — containers.
 *
 * Keeps component composition (`parentId`), because at container level a runtime
 * holding its services is exactly the information the reader needs.
 */
export function toMermaidContainer(model: ArchitectureModel): string {
  const lines = ["C4Container", `  title Container view — ${safeText(model.title)}`];

  for (const a of model.actors ?? []) {
    lines.push(`  Person(${safeId(a.id)}, "${safeText(a.label)}", "${safeText(a.role ?? "User")}")`);
  }

  const zoneById = new Map(model.zones.map((z) => [z.id, z]));
  const emit = (zoneId: string, indent: string) => {
    const z = zoneById.get(zoneId);
    if (!z) return;
    lines.push(`${indent}Container_Boundary(${safeId(z.id)}, "${safeText(z.label)}") {`);
    for (const c of model.components.filter((x) => x.zoneId === zoneId && !x.parentId)) {
      const children = model.components.filter((x) => x.parentId === c.id);
      if (children.length) {
        lines.push(`${indent}  Container_Boundary(${safeId(c.id)}_g, "${nameOf(c)}") {`);
        for (const k of children) {
          lines.push(
            `${indent}    Container(${safeId(k.id)}, "${nameOf(k)}", "${technologyOf(k)}")`
          );
        }
        lines.push(`${indent}  }`);
      } else {
        lines.push(`${indent}  Container(${safeId(c.id)}, "${nameOf(c)}", "${technologyOf(c)}")`);
      }
    }
    for (const child of model.zones.filter((x) => x.parentId === zoneId)) {
      emit(child.id, `${indent}  `);
    }
    lines.push(`${indent}}`);
  };
  for (const z of model.zones.filter((x) => !x.parentId)) emit(z.id, "  ");

  for (const f of model.flows ?? []) {
    const label = safeText(f.label ?? "uses");
    const proto = f.protocol ? `, "${safeText(f.protocol)}"` : "";
    lines.push(`  Rel(${safeId(f.sourceId)}, ${safeId(f.targetId)}, "${label}"${proto})`);
  }
  return lines.join("\n");
}

/**
 * Runtime sequence.
 *
 * Flows are declared in narrative order by every extractor we use, so that order is
 * the call sequence. Async and event flows get the dashed arrow Mermaid reserves for
 * non-blocking messages, which is the distinction that actually matters in review.
 */
export function toMermaidSequence(model: ArchitectureModel): string {
  const lines = ["sequenceDiagram", "  autonumber"];
  const named = new Map<string, string>();
  for (const a of model.actors ?? []) named.set(a.id, safeText(a.label));
  for (const c of model.components) named.set(c.id, nameOf(c));

  // only participants that actually take part, in first-appearance order
  const seen = new Set<string>();
  for (const f of model.flows ?? []) {
    for (const id of [f.sourceId, f.targetId]) {
      if (seen.has(id) || !named.has(id)) continue;
      seen.add(id);
      const isActor = (model.actors ?? []).some((a) => a.id === id);
      lines.push(`  ${isActor ? "actor" : "participant"} ${safeId(id)} as ${named.get(id)}`);
    }
  }

  for (const f of model.flows ?? []) {
    if (!named.has(f.sourceId) || !named.has(f.targetId)) continue;
    const async = f.mode === "async" || f.mode === "event" || f.mode === "batch";
    const arrow = async ? "-)" : "->>";
    const parts = [f.label, f.protocol].filter(Boolean).map((p) => safeText(p!));
    lines.push(`  ${safeId(f.sourceId)}${arrow}${safeId(f.targetId)}: ${parts.join(" · ") || "call"}`);
    if (f.bidirectional) {
      lines.push(`  ${safeId(f.targetId)}-->>${safeId(f.sourceId)}: response`);
    }
  }
  return lines.join("\n");
}

/**
 * Identity and trust view.
 *
 * Trust relationships are the flows reviewers most often have to hunt for in a busy
 * landscape diagram, so they get their own artifact: every identity provider, every
 * trust edge, and every authentication path, and nothing else.
 */
export function toMermaidIdentityFlow(model: ArchitectureModel): string {
  const isTrust = (f: ArchitectureFlow) =>
    f.mode === "trust" ||
    /trust|auth|sso|saml|oidc|oauth|scim|jwt/i.test(`${f.label ?? ""} ${f.protocol ?? ""}`);

  const identity = model.components.filter((c) => c.kind === "identity");
  const trustFlows = (model.flows ?? []).filter(isTrust);

  if (!identity.length && !trustFlows.length) {
    return "%% No identity components or trust relationships in this model.";
  }

  const lines = ["flowchart LR", `  %% Identity and trust — ${safeText(model.title)}`];
  const involved = new Set<string>();
  for (const f of trustFlows) {
    involved.add(f.sourceId);
    involved.add(f.targetId);
  }
  for (const c of identity) involved.add(c.id);

  for (const a of model.actors ?? []) {
    if (involved.has(a.id)) lines.push(`  ${safeId(a.id)}(["${safeText(a.label)}"])`);
  }
  for (const c of model.components) {
    if (!involved.has(c.id)) continue;
    lines.push(
      c.kind === "identity"
        ? `  ${safeId(c.id)}[["${nameOf(c)}"]]`
        : `  ${safeId(c.id)}["${nameOf(c)}"]`
    );
  }
  for (const f of trustFlows) {
    lines.push(
      `  ${safeId(f.sourceId)} -- "${safeText(f.label ?? f.protocol ?? "trust")}" --> ${safeId(f.targetId)}`
    );
  }
  return lines.join("\n");
}

/** PlantUML component view, for teams standardised on PlantUML rather than Mermaid. */
export function toPlantUml(model: ArchitectureModel): string {
  const lines = ["@startuml", "skinparam componentStyle rectangle", `title ${safeText(model.title)}`];
  const zoneById = new Map(model.zones.map((z) => [z.id, z]));

  const emit = (zoneId: string, indent: string) => {
    const z = zoneById.get(zoneId);
    if (!z) return;
    lines.push(`${indent}package "${safeText(z.label)}" {`);
    for (const c of model.components.filter((x) => x.zoneId === zoneId)) {
      const kw = c.kind === "database" ? "database" : c.kind === "actor" ? "actor" : "component";
      lines.push(`${indent}  ${kw} "${nameOf(c)}" as ${safeId(c.id)}`);
    }
    for (const child of model.zones.filter((x) => x.parentId === zoneId)) emit(child.id, `${indent}  `);
    lines.push(`${indent}}`);
  };
  for (const z of model.zones.filter((x) => !x.parentId)) emit(z.id, "");

  for (const a of model.actors ?? []) lines.push(`actor "${safeText(a.label)}" as ${safeId(a.id)}`);
  for (const f of model.flows ?? []) {
    const arrow = f.mode === "async" || f.mode === "event" ? "..>" : "-->";
    const label = [f.label, f.protocol].filter(Boolean).map((p) => safeText(p!)).join(" · ");
    lines.push(`${safeId(f.sourceId)} ${arrow} ${safeId(f.targetId)}${label ? ` : ${label}` : ""}`);
  }
  lines.push("@enduml");
  return lines.join("\n");
}

/**
 * Architecture Decision Record, MADR-shaped.
 *
 * Written from what the pipeline actually established — the products chosen, the
 * integration path, and the gaps raised at review. Unresolved high-severity gaps are
 * recorded as open risks rather than quietly dropped, because an ADR that hides them
 * is worse than no ADR.
 */
export function toAdr(model: ArchitectureModel, gaps: GapFinding[] = []): string {
  const date = (model.createdAt ?? new Date().toISOString()).slice(0, 10);
  const sapProducts = model.components
    .filter((c) => /^sap\b/i.test(c.officialName ?? c.label))
    .map((c) => nameOf(c));
  const unique = [...new Set(sapProducts)];
  const high = gaps.filter((g) => g.severity === "high");
  const others = gaps.filter((g) => g.severity !== "high");

  const zoneNames = model.zones.filter((z) => !z.parentId).map((z) => safeText(z.label));

  // null marks a section that does not apply; "" is a deliberate blank line, so the
  // two must not be filtered together or every paragraph break collapses
  const out: Array<string | null> = [
    `# ADR-001 — ${model.title}`,
    "",
    `- **Status:** Proposed`,
    `- **Date:** ${date}`,
    `- **Scope:** ${model.level} · ${model.components.length} components · ${model.flows.length} flows`,
    "",
    "## Context",
    "",
    model.summary || "_No summary was captured during extraction._",
    "",
    zoneNames.length ? `The landscape spans ${zoneNames.join(", ")}.` : null,
    "",
    "## Decision",
    "",
    unique.length
      ? `Use the following SAP services:\n\n${unique.map((p) => `- ${p}`).join("\n")}`
      : "No SAP products were identified in this model.",
    "",
    "## Consequences",
    "",
    "### Positive",
    "",
    "- Integration is mediated rather than point-to-point where a mediation layer is present.",
    "- Components are named against the SAP product catalogue, so the design can be costed and licensed.",
    "",
    "### Risks and open questions",
    "",
    high.length
      ? high.map((g) => `- **${g.message}**\n  - ${g.suggestion ?? "Needs an architectural decision."}`).join("\n")
      : "- No high-severity gaps were raised.",
    "",
    others.length ? "### Lower-severity findings" : null,
    others.length ? "" : null,
    others.length ? others.map((g) => `- ${g.message}`).join("\n") : null,
    others.length ? "" : null,
    "## Alternatives considered",
    "",
    "_Record the options weighed and why they were rejected. The pipeline cannot infer",
    "this — it is the architect's judgement and belongs in the record._",
    "",
    "## Verification",
    "",
    "- [ ] Reviewed against SAP Clean Core principles (no core modification).",
    "- [ ] Authentication and authorization flows confirmed end to end.",
    "- [ ] Non-functional requirements agreed (availability, RPO/RTO, throughput).",
    "- [ ] Costs modelled for the chosen SAP BTP service plans.",
  ];
  return out
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export interface ArchitectureArtifacts {
  contextC4: string;
  containerC4: string;
  sequence: string;
  identityFlow: string;
  plantUml: string;
  adr: string;
}

/** Every artifact for a reviewed model, ready to drop into a design document. */
export function buildArtifacts(
  model: ArchitectureModel,
  gaps: GapFinding[] = []
): ArchitectureArtifacts {
  return {
    contextC4: toMermaidContext(model),
    containerC4: toMermaidContainer(model),
    sequence: toMermaidSequence(model),
    identityFlow: toMermaidIdentityFlow(model),
    plantUml: toPlantUml(model),
    adr: toAdr(model, gaps),
  };
}
