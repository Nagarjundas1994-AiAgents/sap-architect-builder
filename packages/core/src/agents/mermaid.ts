/**
 * Mermaid agent — the second renderer.
 *
 * Draw.io is what an architect hands to a stakeholder; Mermaid is what lives in the
 * repository, the pull request and the wiki, where a binary diagram goes stale the
 * day after it is drawn. Both are drawn from the same approved `ArchitectureModel`,
 * so the picture in the design document and the picture in the README cannot disagree.
 *
 * The agent owns one view the artifact module never had — `landscape`, the zone-nested
 * flowchart that is the direct Mermaid counterpart of the Draw.io drawing — and reuses
 * the existing C4 / sequence / identity generators for the rest. Every view is checked
 * for the structural mistakes that make Mermaid refuse to render (unbalanced blocks,
 * edges to nodes that were never declared) before it reaches the browser.
 */

import type {
  ArchitectureComponent,
  ArchitectureFlow,
  ArchitectureModel,
  ArchitectureRole,
  MermaidView,
} from "@sap-architect/shared";
import {
  toMermaidContainer,
  toMermaidContext,
  toMermaidIdentityFlow,
  toMermaidSequence,
} from "../artifacts/index.js";

/** Mermaid keywords that break a diagram when used as a node id. */
const RESERVED = new Set(["end", "graph", "subgraph", "click", "class", "style", "direction"]);

const safeId = (id: string) => {
  const s = (id || "n").replace(/[^A-Za-z0-9_]/g, "_");
  return RESERVED.has(s.toLowerCase()) || /^\d/.test(s) ? `n_${s}` : s;
};
const safeText = (s: string) => s.replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const nameOf = (c: { label: string; officialName?: string }) => safeText(c.officialName ?? c.label);

/** Node shape carries the kind, so the flowchart reads without a legend. */
function nodeShape(c: ArchitectureComponent): [string, string] {
  switch (c.kind) {
    case "database":
      return ['[("', '")]'];
    case "identity":
      return ['[["', '"]]'];
    case "agent":
      return ['{{"', '"}}'];
    case "actor":
      return ['(["', '"])'];
    case "external":
      return ['[/"', '"/]'];
    default:
      return ['["', '"]'];
  }
}

/** Colour class per semantic role — the same palette the Draw.io renderer uses. */
function roleOf(c: ArchitectureComponent, model: ArchitectureModel): ArchitectureRole {
  if (c.role) return c.role;
  if (c.kind === "identity") return "security";
  if (c.kind === "database") return "data";
  if (c.kind === "integration") return "integration";
  if (c.kind === "external" || c.kind === "actor") return "external";
  if (c.kind === "agent") return "application";
  const zone = model.zones.find((z) => z.id === c.zoneId);
  if (zone?.role) return zone.role;
  if (zone?.kind === "on-premise" || zone?.kind === "partner") return "external";
  return "platform";
}

const CLASS_DEFS: Record<string, string> = {
  platform: "fill:#EBF8FF,stroke:#0070F2,stroke-width:1.5px,color:#1D2D3E",
  application: "fill:#F1ECFF,stroke:#5D36FF,stroke-width:1.5px,color:#1D2D3E",
  data: "fill:#DAFDF5,stroke:#07838F,stroke-width:1.5px,color:#1D2D3E",
  integration: "fill:#FFF4E5,stroke:#E76500,stroke-width:1.5px,color:#1D2D3E",
  security: "fill:#EAF7EA,stroke:#188918,stroke-width:1.5px,color:#1D2D3E",
  external: "fill:#F5F6F7,stroke:#475E75,stroke-width:1.5px,color:#1D2D3E",
  edge: "fill:#FFFFFF,stroke:#475E75,stroke-width:1.5px,color:#1D2D3E",
  neutral: "fill:#FFFFFF,stroke:#475E75,stroke-width:1.5px,color:#1D2D3E",
};

/** Arrow grammar mirrors the connector semantics: dotted is non-blocking, thick is A2A. */
function edgeFor(f: ArchitectureFlow): [string, string] {
  switch (f.mode) {
    case "async":
    case "event":
    case "batch":
      return ["-. ", " .->"];
    case "trust":
    case "authorization":
    case "provisioning":
      return ["-. ", " .->"];
    case "agent":
      return ["== ", " ==>"];
    default:
      return ["-- ", " -->"];
  }
}

/**
 * Landscape view — zones as subgraphs, components inside them, flows between.
 *
 * This is the Mermaid equivalent of the Draw.io drawing: the same nesting, the same
 * composition, the same connector meanings. Nesting is emitted recursively for both
 * zones and components so a runtime holding its services survives the translation
 * instead of being flattened into one row.
 */
export function toMermaidLandscape(model: ArchitectureModel): string {
  const lines = [
    "flowchart TB",
    `%% ${safeText(model.title)} — ${model.level}`,
  ];

  const inZone = (zoneId: string) => model.components.filter((c) => c.zoneId === zoneId);

  const emitComponent = (c: ArchitectureComponent, indent: string) => {
    const children = model.components.filter((x) => x.parentId === c.id);
    if (children.length) {
      lines.push(`${indent}subgraph ${safeId(c.id)}_g["${nameOf(c)}"]`);
      lines.push(`${indent}  direction LR`);
      for (const k of children) emitComponent(k, `${indent}  `);
      lines.push(`${indent}end`);
      return;
    }
    const [open, close] = nodeShape(c);
    lines.push(`${indent}${safeId(c.id)}${open}${nameOf(c)}${close}`);
  };

  const emitZone = (zoneId: string, indent: string) => {
    const z = model.zones.find((x) => x.id === zoneId);
    if (!z) return;
    lines.push(`${indent}subgraph ${safeId(z.id)}["${safeText(z.label)}"]`);
    lines.push(`${indent}  direction TB`);
    for (const c of inZone(zoneId).filter((c) => !c.parentId)) emitComponent(c, `${indent}  `);
    for (const child of model.zones.filter((x) => x.parentId === zoneId)) {
      emitZone(child.id, `${indent}  `);
    }
    lines.push(`${indent}end`);
  };

  for (const a of model.actors ?? []) {
    lines.push(`${safeId(a.id)}(["${safeText(a.label)}"])`);
  }
  for (const z of model.zones.filter((x) => !x.parentId)) emitZone(z.id, "");

  // Edges live outside every subgraph: declared inside, Mermaid pulls the far node in.
  const known = new Set([
    ...model.components.map((c) => c.id),
    ...(model.actors ?? []).map((a) => a.id),
  ]);
  for (const f of model.flows ?? []) {
    if (!known.has(f.sourceId) || !known.has(f.targetId)) continue;
    const [open, close] = edgeFor(f);
    const label = safeText([f.label, f.protocol].filter(Boolean).join(" · ")) || "uses";
    const arrow = `${open}"${label}"${close}`;
    lines.push(`${safeId(f.sourceId)} ${arrow} ${safeId(f.targetId)}`);
    if (f.bidirectional) {
      lines.push(`${safeId(f.targetId)} -- "response" --> ${safeId(f.sourceId)}`);
    }
  }

  const used = new Set<string>();
  for (const c of model.components) {
    if (model.components.some((x) => x.parentId === c.id)) continue; // subgraph, not a node
    used.add(roleOf(c, model));
  }
  for (const role of used) lines.push(`classDef ${role} ${CLASS_DEFS[role] ?? CLASS_DEFS.neutral}`);
  if (model.actors?.length) lines.push(`classDef actor ${CLASS_DEFS.external}`);

  for (const c of model.components) {
    if (model.components.some((x) => x.parentId === c.id)) continue;
    lines.push(`class ${safeId(c.id)} ${roleOf(c, model)}`);
  }
  for (const a of model.actors ?? []) lines.push(`class ${safeId(a.id)} actor`);

  return lines.join("\n");
}

/**
 * Structural check.
 *
 * Not a Mermaid parser — the real one lives in the browser and would drag a megabyte
 * of renderer into the backend. This catches the two failures that actually happen
 * when a diagram is generated from a model: a block left open, and an edge pointing
 * at a node that was never declared.
 */
export function validateMermaid(code: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const body = code.trim();
  if (!body) return { ok: false, issues: ["Empty diagram"] };
  if (body.startsWith("%%")) return { ok: true, issues: [] }; // deliberate "nothing to draw"

  const header = body.split("\n")[0].trim();
  if (!/^(flowchart|graph|sequenceDiagram|C4Context|C4Container|classDiagram|erDiagram|stateDiagram)/.test(header)) {
    issues.push(`Unrecognised diagram type: ${header.slice(0, 40)}`);
  }

  if (/^(flowchart|graph)/.test(header)) {
    let depth = 0;
    const declared = new Set<string>();
    const referenced: string[] = [];
    for (const raw of body.split("\n").slice(1)) {
      const line = raw.trim();
      if (!line || line.startsWith("%%")) continue;
      if (/^subgraph\b/.test(line)) {
        depth++;
        const m = /^subgraph\s+([A-Za-z0-9_]+)/.exec(line);
        if (m) declared.add(m[1]);
        continue;
      }
      if (line === "end") {
        depth--;
        if (depth < 0) issues.push("Unbalanced block: 'end' without 'subgraph'");
        continue;
      }
      if (/^(classDef|class|style|direction|linkStyle|click)\b/.test(line)) continue;

      // an edge line names two nodes; a declaration names one and gives it a shape
      const edge = /^([A-Za-z0-9_]+)\s+[-=.].*?[-=.]>+\s*\|?.*?\|?\s*([A-Za-z0-9_]+)\s*$/.exec(line);
      if (edge) {
        referenced.push(edge[1], edge[2]);
        continue;
      }
      const decl = /^([A-Za-z0-9_]+)\s*[[({]/.exec(line);
      if (decl) declared.add(decl[1]);
    }
    if (depth > 0) issues.push(`Unbalanced block: ${depth} 'subgraph' without 'end'`);
    for (const id of new Set(referenced)) {
      if (!declared.has(id)) issues.push(`Edge references undeclared node: ${id}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

const VIEWS: Array<{
  id: MermaidView["id"];
  label: string;
  kind: string;
  note: string;
  build: (m: ArchitectureModel) => string;
}> = [
  {
    id: "landscape",
    label: "Landscape",
    kind: "flowchart",
    note: "Zones, components and flows — the Mermaid twin of the Draw.io drawing",
    build: toMermaidLandscape,
  },
  {
    id: "context",
    label: "C4 context",
    kind: "C4Context",
    note: "Actors and the systems they touch; no internals",
    build: toMermaidContext,
  },
  {
    id: "container",
    label: "C4 container",
    kind: "C4Container",
    note: "Keeps composition and nesting",
    build: toMermaidContainer,
  },
  {
    id: "sequence",
    label: "Sequence",
    kind: "sequenceDiagram",
    note: "Runtime call order; dashed arrows are non-blocking",
    build: toMermaidSequence,
  },
  {
    id: "identity",
    label: "Identity & trust",
    kind: "flowchart",
    note: "Trust relationships only",
    build: toMermaidIdentityFlow,
  },
];

/**
 * Run the Mermaid agent over a reviewed model.
 *
 * A view that throws is reported as a failed view rather than taking the run down —
 * a broken sequence diagram is no reason to withhold the landscape.
 */
export function buildMermaidViews(model: ArchitectureModel): MermaidView[] {
  return VIEWS.map((v) => {
    try {
      const code = v.build(model);
      const check = validateMermaid(code);
      return { id: v.id, label: v.label, kind: v.kind, note: v.note, code, ...check };
    } catch (err) {
      return {
        id: v.id,
        label: v.label,
        kind: v.kind,
        note: v.note,
        code: "",
        ok: false,
        issues: [err instanceof Error ? err.message : String(err)],
      };
    }
  });
}
