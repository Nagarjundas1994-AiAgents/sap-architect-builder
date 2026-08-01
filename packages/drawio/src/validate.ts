import { SAP_ICON_CATALOG } from "./icons.js";

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  cellCount: number;
  edgeCount: number;
  vertexCount: number;
}

/** Lightweight structural validation of Draw.io mxfile XML. */
export function validateDrawioXml(xml: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!xml.includes("<mxfile") || !xml.includes("<mxGraphModel")) {
    issues.push({
      level: "error",
      code: "NOT_MXFILE",
      message: "Document is not a Draw.io mxfile / mxGraphModel",
    });
    return { ok: false, issues, cellCount: 0, edgeCount: 0, vertexCount: 0 };
  }

  const idMatches = [...xml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const idSet = new Set(idMatches);
  if (idMatches.length !== idSet.size) {
    issues.push({
      level: "error",
      code: "DUPLICATE_IDS",
      message: "Duplicate cell IDs detected",
    });
  }

  const cells = [...xml.matchAll(/<mxCell\b([^>]*)\/?>/g)];
  let edgeCount = 0;
  let vertexCount = 0;

  for (const cell of cells) {
    const attrs = cell[1];
    const isEdge = /\bedge="1"/.test(attrs);
    const isVertex = /\bvertex="1"/.test(attrs);
    if (isEdge) edgeCount += 1;
    if (isVertex) vertexCount += 1;

    if (isEdge) {
      const id = attrs.match(/\bid="([^"]+)"/)?.[1];
      // A free-standing edge (network barrier, annotation) anchors on explicit
      // sourcePoint/targetPoint instead of cell ids — both forms are valid.
      const block = id
        ? xml.slice(xml.indexOf(`id="${id}"`), xml.indexOf(`id="${id}"`) + 900)
        : "";
      const hasPoints =
        /as="sourcePoint"/.test(block) && /as="targetPoint"/.test(block);
      const source = attrs.match(/\bsource="([^"]+)"/)?.[1];
      const target = attrs.match(/\btarget="([^"]+)"/)?.[1];
      if (!hasPoints && (!source || !idSet.has(source))) {
        issues.push({
          level: "error",
          code: "BAD_EDGE_SOURCE",
          message: `Edge missing or unknown source: ${source ?? "(none)"}`,
        });
      }
      if (!hasPoints && (!target || !idSet.has(target))) {
        issues.push({
          level: "error",
          code: "BAD_EDGE_TARGET",
          message: `Edge missing or unknown target: ${target ?? "(none)"}`,
        });
      }
    }

    const parent = attrs.match(/\bparent="([^"]+)"/)?.[1];
    if (parent && !idSet.has(parent) && parent !== "0" && parent !== "1") {
      // parent 0/1 always exist as roots
      if (!xml.includes(`id="${parent}"`)) {
        issues.push({
          level: "error",
          code: "BAD_PARENT",
          message: `Cell references unknown parent ${parent}`,
        });
      }
    }
  }

  // ── SAP Style Contract regression checks ────────────────────────────────
  // Areas and cards use absolute arcSize 24; interface pills use 50.
  const badArc = xml.match(/arcSize=(?!24\b|50\b)\d+/g);
  if (badArc?.length) {
    issues.push({
      level: "warning",
      code: "ARCSIZE_CONTRACT",
      message: `Non-contract arcSize values: ${[...new Set(badArc)].join(", ")}`,
    });
  }

  // Stroke width is 1.5 everywhere except 4px network barriers (icon chrome is 1).
  const badStroke = [...xml.matchAll(/strokeWidth=([\d.]+)/g)]
    .map((m) => m[1])
    .filter((w) => !["1", "1.5", "4"].includes(w));
  if (badStroke.length) {
    issues.push({
      level: "warning",
      code: "STROKEWIDTH_CONTRACT",
      message: `Non-contract strokeWidth values: ${[...new Set(badStroke)].join(", ")}`,
    });
  }

  // Arrowheads are blockThin; a plain endArrow=classic is off-contract.
  if (/endArrow=(classic|open|oval|diamond)\b/.test(xml)) {
    issues.push({
      level: "warning",
      code: "ARROWHEAD_CONTRACT",
      message: "Edges must use endArrow=blockThin",
    });
  }

  // Every edge must be orthogonally routed like the Architecture Center references.
  const straightEdges = [...xml.matchAll(/<mxCell\b[^>]*\bedge="1"[^>]*>/g)].filter(
    (m) => !/edgeStyle=(orthogonalEdgeStyle|none)/.test(m[0])
  );
  if (straightEdges.length) {
    issues.push({
      level: "warning",
      code: "EDGE_ROUTING",
      message: `${straightEdges.length} edge(s) are not orthogonally routed`,
    });
  }

  // mxgraph.sap.icon has no html=1 — markup would render as literal text.
  for (const m of xml.matchAll(/<mxCell\b[^>]*value="([^"]*)"[^>]*style="([^"]*)"/g)) {
    if (m[2].includes("mxgraph.sap.icon") && /&lt;\/?(b|i|div|font)&gt;/.test(m[1])) {
      issues.push({
        level: "error",
        code: "ICON_LABEL_HTML",
        message: "SAP icon labels must be plain text (the shape has no html=1)",
      });
      break;
    }
  }

  // A style key repeated in one string silently takes the last value. Bare tokens are
  // shape flags, not keys (`style="image;image=…"` is a legitimate Draw.io idiom).
  for (const m of xml.matchAll(/style="([^"]*)"/g)) {
    const keys = m[1]
      .split(";")
      .filter((kv) => kv.includes("="))
      .map((kv) => kv.slice(0, kv.indexOf("=")));
    const dupes = keys.filter((k, i) => k && keys.indexOf(k) !== i);
    if (dupes.length) {
      issues.push({
        level: "warning",
        code: "DUPLICATE_STYLE_KEY",
        message: `Duplicate style keys: ${[...new Set(dupes)].join(", ")}`,
      });
      break;
    }
  }

  // An unknown SAPIcon name renders as an empty shape, not an error — catch it here.
  const unknownIcons = [...xml.matchAll(/SAPIcon=([^;"]+)/g)]
    .map((m) => m[1])
    .filter((name) => !SAP_ICON_CATALOG.has(name));
  if (unknownIcons.length) {
    issues.push({
      level: "error",
      code: "UNKNOWN_SAP_ICON",
      message: `SAPIcon names not in the official catalog (render blank): ${[
        ...new Set(unknownIcons),
      ].join(", ")}`,
    });
  }

  if (/image=https?:\/\//.test(xml)) {
    issues.push({
      level: "error",
      code: "EXTERNAL_IMAGE",
      message: "External http(s) image URLs are not allowed",
    });
  }

  if (/&amp;lt;|&amp;gt;/.test(xml)) {
    issues.push({
      level: "warning",
      code: "DOUBLE_ESCAPE",
      message: "Possible double-escaped label markup",
    });
  }

  const ok = !issues.some((i) => i.level === "error");
  return {
    ok,
    issues,
    cellCount: cells.length,
    edgeCount,
    vertexCount,
  };
}
