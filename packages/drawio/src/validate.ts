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
      const source = attrs.match(/\bsource="([^"]+)"/)?.[1];
      const target = attrs.match(/\btarget="([^"]+)"/)?.[1];
      if (!source || !idSet.has(source)) {
        issues.push({
          level: "error",
          code: "BAD_EDGE_SOURCE",
          message: `Edge missing or unknown source: ${source ?? "(none)"}`,
        });
      }
      if (!target || !idSet.has(target)) {
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

  // Style contract spot checks
  if (xml.includes("arcSize=16") || /arcSize=(?!24\b|50\b)\d+/.test(xml)) {
    // allow only 24 (areas/cards) and 50 (pills) as primary contract values
    const bad = xml.match(/arcSize=(?!24\b|50\b)\d+/g);
    if (bad?.length) {
      issues.push({
        level: "warning",
        code: "ARCSIZE_CONTRACT",
        message: `Non-contract arcSize values: ${[...new Set(bad)].join(", ")}`,
      });
    }
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
