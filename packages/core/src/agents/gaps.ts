import type {
  ArchitectureModel,
  GapFinding,
  ReferenceArchitecture,
} from "@sap-architect/shared";
import { claimsToBeSap, verifySapProduct } from "../knowledge/sap-catalog.js";

/** Zone kinds that sit outside the SAP-managed cloud, reached over a network hop. */
const OUTSIDE = new Set(["on-premise", "partner", "hyperscaler"]);

export function analyzeGaps(
  model: ArchitectureModel,
  topRefs: ReferenceArchitecture[]
): GapFinding[] {
  const gaps: GapFinding[] = [];
  const labels = new Set(
    model.components.map((c) => (c.officialName ?? c.label).toLowerCase())
  );

  const nameOf = (c: { label: string; officialName?: string }) =>
    (c.officialName ?? c.label).toLowerCase();
  const byId = new Map(model.components.map((c) => [c.id, c]));
  const zoneById = new Map(model.zones.map((z) => [z.id, z]));
  /** Walk up the zone tree — a component in a subaccount is still in the platform. */
  const zoneChain = (c: { zoneId: string }) => {
    const out: typeof model.zones = [];
    let z = zoneById.get(c.zoneId);
    for (let i = 0; z && i < 8; i++) {
      out.push(z);
      z = z.parentId ? zoneById.get(z.parentId) : undefined;
    }
    return out;
  };
  const isOutside = (c?: { zoneId: string }) =>
    Boolean(c && zoneChain(c).some((z) => OUTSIDE.has(z.kind)));
  const present = (re: RegExp) => [...labels].some((l) => re.test(l));

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

  // A mediation layer must be a real one — a customer app called "Integration Layer"
  // used to satisfy this check, which is exactly the point-to-point design it exists
  // to catch. ECC and Business Suite count too; the rule was never about S/4 alone.
  const hasIntegration = present(
    /integration suite|process orchestration|process integration|api management|event mesh|event broker|edge integration cell|\bcpi\b/
  );
  const businessSystems = model.components.filter((c) =>
    /\bs\/4|s4hana|\becc\b|business suite|\bsap erp\b/i.test(c.officialName ?? c.label)
  );
  if (businessSystems.length && !hasIntegration) {
    gaps.push({
      id: "gap-integration",
      category: "best-practice",
      severity: "medium",
      message: `${businessSystems.map((c) => `"${c.label}"`).join(", ")} integrated without a mediation layer.`,
      suggestion:
        "Route through SAP Integration Suite (or Event Mesh for decoupled paths). Point-to-point into a business system re-creates the interface sprawl a clean-core programme is meant to remove.",
      relatedComponentIds: businessSystems.map((c) => c.id),
    });
  }

  // ── SAP architecture rules ───────────────────────────────────────────────
  //
  // These are the findings a solution architect raises in an SAP design review, and
  // the reason this is a review and not a drawing tool. Each one is evidenced by the
  // model itself — a rule that cannot point at a component or a flow is not raised.

  // Clean core. Modifying the core is the decision that costs the most later: it is
  // what stops a customer taking an upgrade, and it is invisible on a diagram unless
  // someone names it.
  const CORE = /\bs\/4|s4hana|\becc\b|\berp\b|business suite|\br\/3\b/i;
  const MODIFICATION = /\bz[_-]|\bmodification|custom (abap|code|development)|user ?exit|badi|enhancement|append structure|core extension/i;
  for (const c of model.components) {
    const name = c.officialName ?? c.label;
    const inCore =
      MODIFICATION.test(name) &&
      (CORE.test(name) ||
        model.flows.some(
          (f) =>
            (f.sourceId === c.id && CORE.test(nameOf(byId.get(f.targetId) ?? { label: "" }))) ||
            (f.targetId === c.id && CORE.test(nameOf(byId.get(f.sourceId) ?? { label: "" })))
        ));
    if (!inCore) continue;
    gaps.push({
      id: `gap-cleancore-${c.id}`,
      category: "best-practice",
      severity: "high",
      message: `"${c.label}" modifies the digital core.`,
      suggestion:
        "Clean core: move this to a side-by-side extension on SAP BTP, or an on-stack ABAP Cloud extension using released APIs. Core modifications block upgrades.",
      relatedComponentIds: [c.id],
    });
  }

  // Connectivity. A call from the platform into an on-premise or partner system has a
  // prescribed shape — Cloud Connector for the tunnel, Destination service for the
  // endpoint, principal propagation for the user. Missing any of the three is a
  // finding, and the first two are checkable against the component list.
  const hasCloudConnector = present(/cloud connector/);
  const hasDestination = present(/destination/);
  const crossings = model.flows.filter((f) => {
    const s = byId.get(f.sourceId);
    const t = byId.get(f.targetId);
    if (!s || !t) return false;
    // outbound from the SAP-managed side into somewhere else
    return !isOutside(s) && isOutside(t) && f.mode !== "trust";
  });
  if (crossings.length && !hasCloudConnector) {
    const onPrem = crossings.filter((f) => {
      const t = byId.get(f.targetId);
      return t && zoneChain(t).some((z) => z.kind === "on-premise");
    });
    if (onPrem.length) {
      gaps.push({
        id: "gap-cloud-connector",
        category: "missing-component",
        severity: "high",
        message: `${onPrem.length} flow${onPrem.length > 1 ? "s reach" : " reaches"} an on-premise system with no SAP Cloud Connector.`,
        suggestion:
          "Add SAP Cloud Connector — it is the supported tunnel from SAP BTP into a private network. A direct connection implies an inbound firewall opening, which security will not approve.",
        relatedComponentIds: onPrem.map((f) => f.targetId),
      });
    }
  }
  if (crossings.length && !hasDestination) {
    gaps.push({
      id: "gap-destination",
      category: "missing-component",
      severity: "medium",
      message: "Outbound calls leave the platform with no SAP Destination service.",
      suggestion:
        "Add the SAP Destination service so endpoints and credentials are configuration rather than code, and can be changed per environment without a redeploy.",
      relatedComponentIds: crossings.map((f) => f.sourceId),
    });
  }

  // Principal propagation. An RFC or OData hop into a business system that carries no
  // identity is a technical user in production, which is the audit finding nobody
  // wants to explain.
  for (const f of crossings) {
    const t = byId.get(f.targetId)!;
    const carriesIdentity = /principal propagation|oauth|saml|jwt|x\.?509|user token|sso/i.test(
      `${f.label ?? ""} ${f.protocol ?? ""}`
    );
    if (carriesIdentity || !CORE.test(nameOf(t))) continue;
    gaps.push({
      id: `gap-principal-${f.id}`,
      category: "security",
      severity: "medium",
      message: `"${f.label ?? f.protocol ?? "Call"}" into ${t.label} states no user identity.`,
      suggestion:
        "Show principal propagation (or OAuth SAML bearer). Without it the call runs as a technical user and business authorizations in the target system are not enforced.",
      relatedComponentIds: [f.targetId],
    });
  }

  // Transport. A named protocol that is plainly unencrypted, on a hop that leaves the
  // platform, is worth one line in the review.
  for (const f of model.flows) {
    const proto = (f.protocol ?? "").trim();
    if (!/^(http|ftp|telnet|rfc)$/i.test(proto)) continue;
    const t = byId.get(f.targetId);
    if (!isOutside(t) && !/ftp|telnet/i.test(proto)) continue;
    gaps.push({
      id: `gap-transport-${f.id}`,
      category: "security",
      severity: "high",
      message: `${proto.toUpperCase()} is used to reach "${t?.label ?? f.targetId}".`,
      suggestion:
        /rfc/i.test(proto)
          ? "Use secure RFC (SNC) through SAP Cloud Connector, or replace with an OData/SOAP interface over TLS."
          : "Use the TLS-protected equivalent (HTTPS / SFTP). Plain transport off-platform will not pass a security review.",
      relatedComponentIds: t ? [t.id] : [],
    });
  }

  // Exposure. Anything a person or a third party reaches directly should sit behind
  // API Management, both for the policy set and so the interface can be versioned.
  const hasApim = present(/api management|api gateway|apim/);
  if (!hasApim) {
    const exposed = model.components.filter((c) => {
      if (isOutside(c) || c.kind === "identity" || c.kind === "external") return false;
      return model.flows.some((f) => {
        if (f.targetId !== c.id || f.mode === "trust") return false;
        const s = byId.get(f.sourceId);
        // an actor, or something in an outside zone, reaching in
        return !s || isOutside(s);
      });
    });
    if (exposed.length) {
      gaps.push({
        id: "gap-apim",
        category: "best-practice",
        severity: "medium",
        message: `${exposed.length} component${exposed.length > 1 ? "s are" : " is"} reached from outside with no API Management in front.`,
        suggestion:
          "Front external entry points with SAP Integration Suite — API Management for rate limiting, threat protection, and a versioned contract you can change without breaking consumers.",
        relatedComponentIds: exposed.map((c) => c.id),
      });
    }
  }

  // Lifecycle. ECC and Business Suite 7 mainstream maintenance ends 2027 (2030 with
  // extended maintenance). A landscape drawing that shows one without a successor is
  // describing a system that has to move inside the planning horizon.
  const legacy = model.components.filter((c) =>
    /\becc\b|\br\/3\b|business suite 7|sap erp\b/i.test(c.officialName ?? c.label)
  );
  if (legacy.length && !present(/s\/4|s4hana/)) {
    gaps.push({
      id: "gap-lifecycle",
      category: "best-practice",
      severity: "medium",
      message: `${legacy.map((c) => `"${c.label}"`).join(", ")} is on the classic ERP stack with no successor shown.`,
      suggestion:
        "Mainstream maintenance for SAP ERP 6.0 / Business Suite 7 ends 2027 (extended to 2030). Show the target — SAP S/4HANA Cloud — or record the decision to stay as an assumption.",
      relatedComponentIds: legacy.map((c) => c.id),
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
  // Connectivity infrastructure answers and stops by design: the Cloud Connector is a
  // tunnel the target reaches through, the Destination service returns an endpoint.
  // Drawing them as dead ends was a false positive on every correct hybrid landscape.
  // Inference endpoints answer and stop too — a model returns a completion, it does
  // not forward the request onward.
  const TERMINAL_LABEL =
    /hana|database|\bdb\b|data ?lake|warehouse|object store|identity|authentication|directory|\bidp\b|cloud connector|destination|connectivity|credential store|audit log|private link|ai core|generative ai hub|foundation model|\bllm\b|document grounding/i;
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
