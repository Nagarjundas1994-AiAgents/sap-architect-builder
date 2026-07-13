import type { ReferenceArchitecture } from "@sap-architect/shared";
import { cosineSimilarity, embedText } from "../vector/embed.js";

/**
 * Built-in seed (also mirrored under samples/corpus/architecture-center).
 * Prefer corpus loader + vector store in production paths.
 */
export const REFERENCE_ARCHITECTURES: ReferenceArchitecture[] = [
  {
    id: "ra-agentic-ai",
    title: "Agentic AI & AI Agents on SAP BTP",
    summary:
      "Joule orchestrates custom agents via A2A; MCP tools exposed through SAP Integration Suite; identity via SAP Cloud Identity Services.",
    tags: ["joule", "agents", "a2a", "mcp", "btp", "generative-ai"],
    products: [
      "Joule",
      "SAP Build",
      "SAP Integration Suite",
      "SAP Generative AI Hub",
      "SAP Cloud Identity Services",
      "SAP HANA Cloud",
    ],
    corpus:
      "agentic ai joule agent builder a2a mcp integration suite generative ai hub hana cloud identity services btp custom agents whiteboard orchestration multi-agent",
    sourceUrl: "https://architecture.learning.sap.com/docs/ref-arch/98efa0",
    source: "architecture-center",
  },
  {
    id: "ra-clean-core-extension",
    title: "Clean-Core Side-by-Side Extension",
    summary:
      "Extensions on SAP BTP call SAP S/4HANA via governed APIs (OData/Events); no core modifications.",
    tags: ["clean-core", "s4hana", "extension", "cap", "btp"],
    products: [
      "SAP S/4HANA Cloud",
      "SAP BTP",
      "SAP CAP",
      "SAP Integration Suite",
      "SAP Event Mesh",
      "SAP Build Work Zone",
    ],
    corpus:
      "clean core side-by-side extension s/4hana odata event mesh cap cloud foundry btp custom app api management whiteboard sketch",
    source: "architecture-center",
  },
  {
    id: "ra-integration-hub",
    title: "Enterprise Integration Hub",
    summary:
      "SAP Integration Suite as central mediation for SAP and non-SAP systems with monitoring and API management.",
    tags: ["integration", "api", "cpi", "hybrid"],
    products: [
      "SAP Integration Suite",
      "SAP API Management",
      "SAP Cloud Connector",
      "SAP Process Orchestration",
    ],
    corpus:
      "integration suite cpi api management cloud connector hybrid integration non-sap partner systems whiteboard diagram",
    source: "architecture-center",
  },
  {
    id: "ra-data-to-value",
    title: "Data-to-Value with SAP Datasphere & Analytics",
    summary:
      "SAP Datasphere + SAP Analytics Cloud for governed analytics over S/4 and external data.",
    tags: ["datasphere", "analytics", "data"],
    products: [
      "SAP Datasphere",
      "SAP Analytics Cloud",
      "SAP HANA Cloud",
      "SAP S/4HANA",
    ],
    corpus:
      "datasphere analytics cloud hana data lake warehouse reporting dashboard architecture sketch",
    source: "architecture-center",
  },
  {
    id: "ra-identity-zero-trust",
    title: "Identity & Zero-Trust Access",
    summary:
      "SAP Cloud Identity Services (IAS/IPS) with XSUAA for BTP apps; principal propagation to backends.",
    tags: ["identity", "security", "ias", "xsuaa"],
    products: [
      "SAP Cloud Identity Services",
      "SAP Authorization and Trust Management (XSUAA)",
      "SAP Cloud Connector",
    ],
    corpus:
      "identity authentication service ias ips xsuaa trust principal propagation security zero trust architecture",
    source: "architecture-center",
  },
];

export { embedText, cosineSimilarity };

export function withEmbeddings(
  refs: ReferenceArchitecture[] = REFERENCE_ARCHITECTURES
): ReferenceArchitecture[] {
  return refs.map((r) => ({
    ...r,
    embedding:
      r.embedding ??
      embedText(`${r.title} ${r.summary} ${r.corpus} ${r.products.join(" ")}`),
  }));
}
