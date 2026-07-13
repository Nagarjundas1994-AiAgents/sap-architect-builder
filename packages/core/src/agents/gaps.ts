import type {
  ArchitectureModel,
  GapFinding,
  ReferenceArchitecture,
} from "@sap-architect/shared";

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
