import type {
  ArchitectureModel,
  GapFinding,
  ReferenceArchitecture,
} from "@sap-architect/shared";

/**
 * Apply lightweight, deterministic refinements from gap analysis + top reference.
 * In production this becomes a dedicated "modifier" agent with LLM assistance.
 */
export function refineArchitecture(
  model: ArchitectureModel,
  gaps: GapFinding[],
  topRef?: ReferenceArchitecture
): ArchitectureModel {
  const refined: ArchitectureModel = structuredClone(model);
  refined.id = `${model.id}-refined`;
  refined.title = model.title.includes("(refined)")
    ? model.title
    : `${model.title.replace(/ \(from whiteboard\)/i, "")} (refined)`;

  const needsIdentity = gaps.some((g) => g.id === "gap-identity");
  if (needsIdentity && !refined.components.some((c) => c.kind === "identity")) {
    const btpZone =
      refined.zones.find((z) => z.kind === "sap-btp") ??
      refined.zones[0] ??
      ({ id: "zone-btp", label: "SAP BTP", kind: "sap-btp" as const } as const);

    if (!refined.zones.some((z) => z.id === btpZone.id)) {
      refined.zones.push({ ...btpZone });
    }

    refined.components.push({
      id: "comp-ias-added",
      label: "Cloud Identity Services",
      subtitle: "IAS / IPS (proposed)",
      kind: "identity",
      zoneId: btpZone.id,
      officialName: "SAP Cloud Identity Services",
      sapIcon: "SAP_Cloud_Identity_Service",
      confidence: 0.5,
      notes: "Added by gap analysis — confirm placement",
    });

    const joule = refined.components.find((c) =>
      (c.officialName ?? c.label).toLowerCase().includes("joule")
    );
    const target = joule ?? refined.components.find((c) => c.kind === "custom-app" || c.kind === "agent");
    if (target) {
      refined.flows.push({
        id: "flow-ias-added",
        sourceId: "comp-ias-added",
        targetId: target.id,
        label: "Authenticate",
        mode: "trust",
        confidence: 0.5,
      });
    }

    refined.assumptions.push({
      id: `asm-identity-${Date.now()}`,
      text: "SAP Cloud Identity Services added as a proposed component from gap analysis.",
      severity: "info",
    });
  }

  // BTP services are always provisioned inside a subaccount. Architecture Center L1
  // diagrams show that boundary, so make it explicit rather than implying that
  // services float directly in the platform.
  const btp = refined.zones.find((z) => z.kind === "sap-btp" && !z.parentId);
  const hasSubaccount = refined.zones.some(
    (z) => z.parentId === btp?.id && /subaccount/i.test(z.label)
  );
  if (btp && !hasSubaccount && refined.components.some((c) => c.zoneId === btp.id)) {
    const subId = `${btp.id}-subaccount`;
    refined.zones.push({
      id: subId,
      label: "Subaccount",
      kind: "sap-btp",
      parentId: btp.id,
    });
    for (const c of refined.components) if (c.zoneId === btp.id) c.zoneId = subId;
    for (const z of refined.zones) {
      if (z.parentId === btp.id && z.id !== subId) z.parentId = subId;
    }
    refined.assumptions.push({
      id: "asm-subaccount",
      text: "SAP BTP services grouped into a single subaccount boundary — confirm the actual subaccount and space split with the solution owner.",
      severity: "warning",
    });
  }

  if (topRef) {
    refined.assumptions.push({
      id: `asm-ref-${topRef.id}`,
      text: `Aligned against reference: ${topRef.title} — ${topRef.summary}`,
      severity: "info",
    });
  }

  // Prefer official names when confidence is decent and label looks unofficial
  for (const c of refined.components) {
    if (c.officialName && c.label !== c.officialName && (c.confidence ?? 0) >= 0.7) {
      if (!c.subtitle) c.subtitle = c.label;
      c.label = c.officialName;
    }
  }

  return refined;
}
