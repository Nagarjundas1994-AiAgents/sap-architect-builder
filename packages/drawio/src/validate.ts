import { SAP_ICON_CATALOG } from "./icons.js";
import { RADIUS, STROKE } from "./theme.js";

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

const ALLOWED_ARC = new Set([RADIUS.area, RADIUS.card, RADIUS.chip].map(String));
const ALLOWED_STROKE = new Set(
  [STROKE.hairline, STROKE.regular, STROKE.emphasis, STROKE.boundary].map(String)
);

/**
 * Structural and design-system validation of a generated document.
 *
 * The design-system checks are driven by the theme tokens, so the validator cannot
 * drift from the styles the generator emits.
 */
export function validateDrawioXml(xml: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!xml.includes("<mxfile") || !xml.includes("<mxGraphModel")) {
    return {
      ok: false,
      issues: [{ level: "error", code: "NOT_MXFILE", message: "Not a Draw.io document" }],
      cellCount: 0,
      edgeCount: 0,
      vertexCount: 0,
    };
  }

  // ── Well-formedness ──────────────────────────────────────────────────────
  // A raw quote inside a label attribute silently truncates the document: Draw.io
  // parses what it can and drops the rest, so the file "opens" but is near-empty.
  for (const m of xml.matchAll(/<(object|mxCell)\b([^>]*)>/g)) {
    const attrs = m[2];
    // strip well-formed key="value" pairs; anything left holding a quote is broken
    const residue = attrs.replace(/\s+[\w.:-]+="[^"]*"/g, "").trim();
    if (residue.includes('"')) {
      issues.push({
        level: "error",
        code: "MALFORMED_ATTRIBUTE",
        message: `Unescaped quote in <${m[1]}> attributes near: ${attrs.slice(0, 70)}`,
      });
      break;
    }
  }

  const openTags = (xml.match(/<mxCell\b/g) ?? []).length;
  const closeTags =
    (xml.match(/<\/mxCell>/g) ?? []).length + (xml.match(/<mxCell\b[^>]*\/>/g) ?? []).length;
  if (openTags !== closeTags) {
    issues.push({
      level: "error",
      code: "UNBALANCED_CELLS",
      message: `${openTags} <mxCell> opened, ${closeTags} closed`,
    });
  }

  // ── Identity ─────────────────────────────────────────────────────────────
  const ids = [...xml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const idSet = new Set(ids);
  if (ids.length !== idSet.size) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    issues.push({
      level: "error",
      code: "DUPLICATE_IDS",
      message: `Duplicate cell ids: ${[...new Set(dupes)].slice(0, 5).join(", ")}`,
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
      const anchor = id ? xml.indexOf(`id="${id}"`) : -1;
      const block = anchor >= 0 ? xml.slice(anchor, anchor + 900) : "";
      const hasPoints = /as="sourcePoint"/.test(block) && /as="targetPoint"/.test(block);
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
    if (parent && parent !== "0" && !idSet.has(parent)) {
      issues.push({
        level: "error",
        code: "BAD_PARENT",
        message: `Cell references unknown parent ${parent}`,
      });
    }
  }

  // ── Editability ──────────────────────────────────────────────────────────
  if (!/<mxCell id="[^"]+" value="[^"]*" parent="0"\/>/.test(xml)) {
    issues.push({
      level: "warning",
      code: "NO_NAMED_LAYERS",
      message: "Document has no named layers; editors cannot isolate parts of it",
    });
  }
  const objects = [...xml.matchAll(/<object\b[^>]*\bid="([^"]+)"/g)].length;
  if (objects === 0 && vertexCount > 2) {
    issues.push({
      level: "warning",
      code: "NO_SEMANTIC_OBJECTS",
      message: "Shapes carry no semantic metadata (expected <object> wrappers)",
    });
  }

  // ── Design system ────────────────────────────────────────────────────────
  const badArc = [...xml.matchAll(/arcSize=([\d.]+)/g)]
    .map((m) => m[1])
    .filter((v) => !ALLOWED_ARC.has(v));
  if (badArc.length) {
    issues.push({
      level: "warning",
      code: "ARCSIZE_TOKEN",
      message: `Corner radii outside the design system: ${[...new Set(badArc)].join(", ")}`,
    });
  }

  const badStroke = [...xml.matchAll(/strokeWidth=([\d.]+)/g)]
    .map((m) => m[1])
    .filter((v) => !ALLOWED_STROKE.has(v));
  if (badStroke.length) {
    issues.push({
      level: "warning",
      code: "STROKEWIDTH_TOKEN",
      message: `Stroke weights outside the design system: ${[...new Set(badStroke)].join(", ")}`,
    });
  }

  if (/endArrow=(classic|open|oval|diamond)\b/.test(xml)) {
    issues.push({
      level: "warning",
      code: "ARROWHEAD_TOKEN",
      message: "Connectors must use endArrow=blockThin",
    });
  }

  const straight = [...xml.matchAll(/<mxCell\b[^>]*\bedge="1"[^>]*>/g)].filter(
    (m) => !/edgeStyle=(orthogonalEdgeStyle|none)/.test(m[0])
  );
  if (straight.length) {
    issues.push({
      level: "warning",
      code: "EDGE_ROUTING",
      message: `${straight.length} connector(s) are not orthogonally routed`,
    });
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

  // An unknown vendor glyph name renders as an empty shape, not an error.
  const unknownIcons = [...xml.matchAll(/SAPIcon=([^;"]+)/g)]
    .map((m) => m[1])
    .filter((name) => !SAP_ICON_CATALOG.has(name));
  if (unknownIcons.length) {
    issues.push({
      level: "error",
      code: "UNKNOWN_GLYPH",
      message: `Glyph names with no asset (render blank): ${[...new Set(unknownIcons)].join(", ")}`,
    });
  }

  if (/image=https?:\/\//.test(xml)) {
    issues.push({
      level: "error",
      code: "EXTERNAL_IMAGE",
      message: "External http(s) image URLs are not allowed (they expire)",
    });
  }

  if (/&amp;lt;|&amp;gt;/.test(xml)) {
    issues.push({
      level: "warning",
      code: "DOUBLE_ESCAPE",
      message: "Possible double-escaped label markup",
    });
  }

  return {
    ok: !issues.some((i) => i.level === "error"),
    issues,
    cellCount: cells.length,
    edgeCount,
    vertexCount,
  };
}
