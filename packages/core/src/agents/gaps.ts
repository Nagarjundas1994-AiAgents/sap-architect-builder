import type {
  ArchitectureModel,
  GapFinding,
  ReferenceArchitecture,
} from "@sap-architect/shared";
import { claimsToBeSap, verifySapProduct } from "../knowledge/sap-catalog.js";

export function analyzeGaps(
  model: ArchitectureModel,
  topRefs: ReferenceArchitecture[]
): GapFinding[] {
  const gaps: GapFinding[] = [];
  const labels = new Set(
    model.components.map((c) => (c.officialName ?? c.label).toLowerCase())
  );

  const hasIdentity = [...labels].some(
    (l) => l.includes("identity") || l.includes("ias") || l.includes("xsuaa")
  );
  if (!hasIdentity) {
    gaps.push({
      id: "gap-identity",
      category: "security",
      severity: "high",
      message: "No identity / authentication component detected.",
      suggestion:
        "Add SAP Cloud Identity Services (IAS) and BTP trust (XSUAA) for production-grade auth.",
    });
  }

  const hasIntegration = [...labels].some(
    (l) => l.includes("integration") || l.includes("api management") || l.includes("event mesh")
  );
  const hasS4 = [...labels].some((l) => l.includes("s/4") || l.includes("s4hana"));
  if (hasS4 && !hasIntegration) {
    gaps.push({
      id: "gap-integration",
      category: "best-practice",
      severity: "medium",
      message: "S/4HANA present without an integration mediation layer.",
      suggestion:
        "Consider SAP Integration Suite (or Event Mesh) for governed access instead of direct point-to-point.",
      relatedComponentIds: model.components
        .filter((c) => (c.officialName ?? c.label).toLowerCase().includes("s/4"))
        .map((c) => c.id),
    });
  }

  // A name that presents itself as an SAP product must be one. An invented name is
  // more damaging than a generic box because a reviewer will believe it, so this is
  // raised high and surfaced before the diagram is drawn.
  for (const c of model.components) {
    const name = c.officialName ?? c.label;
    if (!claimsToBeSap(name)) continue;
    const verdict = verifySapProduct(name);
    if (verdict.status === "renamed" && verdict.canonical) {
      gaps.push({
        id: `gap-renamed-${c.id}`,
        category: "naming",
        severity: "low",
        message: `"${name}" is an older name for ${verdict.canonical}.`,
        suggestion: `Rename to "${verdict.canonical}" to match current SAP naming.`,
        relatedComponentIds: [c.id],
      });
    } else if (verdict.status === "unverified") {
      gaps.push({
        id: `gap-unverified-${c.id}`,
        category: "naming",
        severity: "high",
        message: `"${name}" is not a recognised SAP product name.`,
        suggestion: verdict.suggestion
          ? `Did you mean "${verdict.suggestion}"? Otherwise rename it to what it actually is — an invented SAP name will be taken as real.`
          : "Confirm against SAP Help Portal, or relabel it as a custom or third-party component.",
        relatedComponentIds: [c.id],
      });
    }
  }

  for (const c of model.components) {
    if ((c.confidence ?? 1) < 0.6) {
      gaps.push({
        id: `gap-conf-${c.id}`,
        category: "naming",
        severity: "low",
        message: `Low extraction confidence for "${c.label}".`,
        suggestion: "Confirm official product name with the architect.",
        relatedComponentIds: [c.id],
      });
    }
  }

  // A component with flows can still sit on a broken pipeline: data arrives and
  // stops. "Ingest IoT files into Integration Suite" with nothing downstream reads
  // as a working ingestion path and is not one — a worse defect than an orphan,
  // because nothing about the drawing looks wrong.
  // Some things are meant to be the end of the line: stores hold data, identity
  // providers answer and stop, people and third parties are outside our reach. Kind
  // alone is unreliable — models label SAP HANA Cloud a "sap-service" — so the label
  // and the inbound intent are consulted too.
  const TERMINAL_KIND = new Set(["database", "identity", "actor", "external"]);
  const TERMINAL_LABEL = /hana|database|\bdb\b|data ?lake|warehouse|object store|identity|authentication|directory|\bidp\b/i;
  for (const c of model.components) {
    const inbound = model.flows.filter((f) => f.targetId === c.id);
    const outbound = model.flows.filter((f) => f.sourceId === c.id);
    if (!inbound.length || outbound.length) continue;
    if (TERMINAL_KIND.has(c.kind) || TERMINAL_LABEL.test(c.officialName ?? c.label)) continue;
    // authentication and authorization terminate at whatever answers them
    if (inbound.every((f) => f.mode === "trust" || f.mode === "authorization")) continue;
    // integration and messaging exist to pass things on; stopping there is a hole
    const conveyor = c.kind === "integration" || /mesh|broker|gateway|queue|topic/i.test(c.label);
    gaps.push({
      id: `gap-deadend-${c.id}`,
      category: "missing-flow",
      severity: conveyor ? "high" : "medium",
      message: `"${c.label}" receives data but never passes it on.`,
      suggestion: conveyor
        ? `Show what consumes it — an ingestion or event path that ends here is incomplete.`
        : "Add the downstream flow, or mark it as the intended endpoint.",
      relatedComponentIds: [c.id],
    });
  }

  const floating = model.components.filter(
    (c) => !model.flows.some((f) => f.sourceId === c.id || f.targetId === c.id)
  );
  for (const c of floating) {
    if (c.kind === "identity") continue; // identity often cross-cutting
    gaps.push({
      id: `gap-float-${c.id}`,
      category: "missing-flow",
      severity: "medium",
      message: `Component "${c.label}" has no connected flows.`,
      suggestion: "Add interfaces or mark as out of scope.",
      relatedComponentIds: [c.id],
    });
  }

  if (topRefs[0]) {
    const refProducts = topRefs[0].products.map((p) => p.toLowerCase());
    for (const product of refProducts.slice(0, 4)) {
      const present = [...labels].some(
        (l) => l.includes(product) || product.includes(l) || fuzzyIncludes(l, product)
      );
      if (!present && product.includes("identity")) {
        // already covered
        continue;
      }
      if (!present && (product.includes("hana") || product.includes("build"))) {
        gaps.push({
          id: `gap-ref-${product.replace(/\s+/g, "-")}`,
          category: "missing-component",
          severity: "low",
          message: `Reference "${topRefs[0].title}" commonly includes ${topRefs[0].products.find((p) => p.toLowerCase() === product) ?? product}.`,
          suggestion: "Optional: add if in scope for this solution.",
        });
      }
    }
  }

  // de-dupe by id
  const seen = new Set<string>();
  return gaps.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

function fuzzyIncludes(a: string, b: string): boolean {
  const ta = a.split(/\s+/);
  const tb = b.split(/\s+/);
  return tb.some((t) => t.length > 3 && ta.some((x) => x.includes(t) || t.includes(x)));
}
