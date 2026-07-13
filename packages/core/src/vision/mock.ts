import type { ArchitectureModel, ExtractVisionRequest } from "@sap-architect/shared";

/**
 * Deterministic mock extraction for offline demos.
 * Simulates a whiteboard: custom agent on BTP talking to S/4 via Integration Suite + Joule.
 */
export function mockExtractFromImage(req: ExtractVisionRequest): ArchitectureModel {
  const hints = (req.hints ?? "").toLowerCase();
  const name = (req.fileName ?? "").toLowerCase();
  const isIntegration =
    hints.includes("integration") || name.includes("integration") || name.includes("cpi");
  const isCleanCore =
    hints.includes("clean") || hints.includes("extension") || name.includes("s4");

  if (isIntegration && !isCleanCore) {
    return integrationSketch(req.fileName);
  }
  if (isCleanCore) {
    return cleanCoreSketch(req.fileName);
  }
  return agenticSketch(req.fileName);
}

function agenticSketch(fileName?: string): ArchitectureModel {
  return {
    id: "mock-agentic-1",
    title: "Custom Agentic Architecture (from whiteboard)",
    level: "L1",
    summary:
      "Business user interacts with Joule; custom agents on BTP use tools via MCP and reach S/4HANA through Integration Suite.",
    actors: [
      { id: "actor-user", label: "Business User", role: "Requester" },
      { id: "actor-architect", label: "Solution Architect", role: "Designer" },
    ],
    zones: [
      { id: "zone-user", label: "User Channel", kind: "user" },
      { id: "zone-btp", label: "SAP BTP", kind: "sap-btp" },
      { id: "zone-agents", label: "Custom Agents", kind: "custom", parentId: "zone-btp" },
      { id: "zone-sap", label: "SAP Cloud Solutions", kind: "sap-cloud" },
    ],
    components: [
      {
        id: "comp-joule",
        label: "Joule",
        subtitle: "Digital Assistant",
        kind: "sap-service",
        zoneId: "zone-btp",
        officialName: "Joule",
        sapIcon: "SAP_Digital_Assistant",
        confidence: 0.82,
      },
      {
        id: "comp-agent",
        label: "Procurement Agent",
        subtitle: "Custom",
        kind: "agent",
        zoneId: "zone-agents",
        confidence: 0.7,
        notes: "Inferred from handwritten 'Proc Agent' box",
      },
      {
        id: "comp-gai",
        label: "SAP AI Core",
        subtitle: "Generative AI Hub access",
        kind: "sap-service",
        zoneId: "zone-btp",
        officialName: "SAP AI Core",
        sapIcon: "SAP_AI_Core",
        confidence: 0.65,
      },
      {
        id: "comp-is",
        label: "Integration Suite",
        subtitle: "Mediation",
        kind: "integration",
        zoneId: "zone-btp",
        officialName: "SAP Integration Suite",
        sapIcon: "SAP_Integration_Suite",
        confidence: 0.78,
      },
      {
        id: "comp-ias",
        label: "Cloud Identity Services",
        subtitle: "IAS / IPS",
        kind: "identity",
        zoneId: "zone-btp",
        officialName: "SAP Cloud Identity Services",
        sapIcon: "SAP_Cloud_Identity_Service",
        confidence: 0.6,
      },
      {
        id: "comp-hana",
        label: "SAP HANA Cloud",
        subtitle: "Vector Engine",
        kind: "database",
        zoneId: "zone-btp",
        officialName: "SAP HANA Cloud",
        sapIcon: "SAP_HANA_Cloud",
        confidence: 0.7,
      },
      {
        id: "comp-s4",
        label: "S/4HANA Cloud",
        subtitle: "System of record",
        kind: "sap-product",
        zoneId: "zone-sap",
        officialName: "SAP S/4HANA Cloud",
        confidence: 0.85,
      },
    ],
    flows: [
      {
        id: "flow-user-joule",
        sourceId: "actor-user",
        targetId: "comp-joule",
        label: "Chat",
        protocol: "HTTPS",
        mode: "sync",
        confidence: 0.8,
      },
      {
        id: "flow-joule-agent",
        sourceId: "comp-joule",
        targetId: "comp-agent",
        label: "Delegate",
        protocol: "A2A",
        mode: "async",
        confidence: 0.72,
      },
      {
        id: "flow-agent-gai",
        sourceId: "comp-agent",
        targetId: "comp-gai",
        label: "Reason",
        mode: "sync",
        confidence: 0.68,
      },
      {
        id: "flow-agent-is",
        sourceId: "comp-agent",
        targetId: "comp-is",
        label: "Tools / APIs",
        protocol: "MCP / REST",
        mode: "sync",
        confidence: 0.7,
      },
      {
        id: "flow-is-s4",
        sourceId: "comp-is",
        targetId: "comp-s4",
        label: "Business API",
        protocol: "OData",
        mode: "sync",
        confidence: 0.8,
      },
      {
        id: "flow-ias-trust",
        sourceId: "comp-ias",
        targetId: "comp-joule",
        label: "Authenticate",
        mode: "trust",
        confidence: 0.55,
      },
    ],
    assumptions: [
      {
        id: "a1",
        text: "Handwritten 'MCP' arrow interpreted as tool protocol via Integration Suite — confirm with architect.",
        severity: "warning",
      },
      {
        id: "a2",
        text: "Identity placement inferred; whiteboard did not show IAS explicitly.",
        severity: "info",
      },
    ],
    sourceImageName: fileName,
    createdAt: new Date().toISOString(),
  };
}

function cleanCoreSketch(fileName?: string): ArchitectureModel {
  return {
    id: "mock-cleancore-1",
    title: "Clean-Core Extension (from whiteboard)",
    level: "L1",
    summary:
      "Side-by-side CAP extension on BTP integrates with S/4HANA Cloud via OData and events; UI on Work Zone.",
    actors: [{ id: "actor-user", label: "Business User", role: "End user" }],
    zones: [
      { id: "zone-btp", label: "SAP BTP", kind: "sap-btp" },
      { id: "zone-s4", label: "SAP S/4HANA", kind: "sap-cloud" },
    ],
    components: [
      {
        id: "comp-ui",
        label: "Extension UI",
        subtitle: "SAPUI5 / Work Zone",
        kind: "custom-app",
        zoneId: "zone-btp",
        confidence: 0.75,
      },
      {
        id: "comp-cap",
        label: "CAP Service",
        subtitle: "Node.js",
        kind: "custom-app",
        zoneId: "zone-btp",
        officialName: "SAP Cloud Application Programming Model",
        confidence: 0.8,
      },
      {
        id: "comp-is",
        label: "Integration Suite",
        kind: "integration",
        zoneId: "zone-btp",
        officialName: "SAP Integration Suite",
        confidence: 0.7,
      },
      {
        id: "comp-em",
        label: "Event Mesh",
        kind: "integration",
        zoneId: "zone-btp",
        officialName: "SAP Event Mesh",
        confidence: 0.65,
      },
      {
        id: "comp-s4",
        label: "S/4HANA Cloud",
        kind: "sap-product",
        zoneId: "zone-s4",
        officialName: "SAP S/4HANA Cloud",
        confidence: 0.9,
      },
    ],
    flows: [
      {
        id: "f1",
        sourceId: "actor-user",
        targetId: "comp-ui",
        protocol: "HTTPS",
        mode: "sync",
      },
      {
        id: "f2",
        sourceId: "comp-ui",
        targetId: "comp-cap",
        protocol: "OData",
        mode: "sync",
      },
      {
        id: "f3",
        sourceId: "comp-cap",
        targetId: "comp-is",
        protocol: "REST",
        mode: "sync",
      },
      {
        id: "f4",
        sourceId: "comp-is",
        targetId: "comp-s4",
        protocol: "OData",
        mode: "sync",
      },
      {
        id: "f5",
        sourceId: "comp-s4",
        targetId: "comp-em",
        protocol: "Events",
        mode: "event",
        bidirectional: false,
      },
      {
        id: "f6",
        sourceId: "comp-em",
        targetId: "comp-cap",
        protocol: "Events",
        mode: "event",
      },
    ],
    assumptions: [
      {
        id: "a1",
        text: "No core modification implied — clean-core side-by-side assumed.",
        severity: "info",
      },
    ],
    sourceImageName: fileName,
    createdAt: new Date().toISOString(),
  };
}

function integrationSketch(fileName?: string): ArchitectureModel {
  return {
    id: "mock-integration-1",
    title: "Hybrid Integration Hub (from whiteboard)",
    level: "L1",
    summary: "Integration Suite mediates SAP and partner systems; Cloud Connector for on-prem.",
    actors: [{ id: "actor-ops", label: "Integration Admin", role: "Ops" }],
    zones: [
      { id: "zone-btp", label: "SAP BTP", kind: "sap-btp" },
      { id: "zone-onprem", label: "On-Premise", kind: "on-premise" },
      { id: "zone-partner", label: "Partner", kind: "partner" },
    ],
    components: [
      {
        id: "comp-is",
        label: "Integration Suite",
        kind: "integration",
        zoneId: "zone-btp",
        officialName: "SAP Integration Suite",
        confidence: 0.88,
      },
      {
        id: "comp-apim",
        label: "API Management",
        kind: "integration",
        zoneId: "zone-btp",
        officialName: "SAP API Management",
        confidence: 0.7,
      },
      {
        id: "comp-cc",
        label: "Cloud Connector",
        kind: "integration",
        zoneId: "zone-onprem",
        officialName: "SAP Cloud Connector",
        confidence: 0.8,
      },
      {
        id: "comp-ecc",
        label: "ERP On-Prem",
        subtitle: "Legacy",
        kind: "sap-product",
        zoneId: "zone-onprem",
        confidence: 0.6,
      },
      {
        id: "comp-partner",
        label: "Partner API",
        kind: "external",
        zoneId: "zone-partner",
        confidence: 0.75,
      },
    ],
    flows: [
      {
        id: "f1",
        sourceId: "comp-apim",
        targetId: "comp-is",
        protocol: "REST",
        mode: "sync",
      },
      {
        id: "f2",
        sourceId: "comp-is",
        targetId: "comp-cc",
        protocol: "RFC / HTTPS",
        mode: "sync",
      },
      {
        id: "f3",
        sourceId: "comp-cc",
        targetId: "comp-ecc",
        mode: "sync",
      },
      {
        id: "f4",
        sourceId: "comp-is",
        targetId: "comp-partner",
        protocol: "REST",
        mode: "sync",
      },
    ],
    assumptions: [
      {
        id: "a1",
        text: "Legacy ERP label not fully readable; treated as generic on-prem ERP.",
        severity: "warning",
      },
    ],
    sourceImageName: fileName,
    createdAt: new Date().toISOString(),
  };
}
