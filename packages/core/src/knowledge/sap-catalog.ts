/**
 * Canonical SAP product and service names.
 *
 * A model is allowed to name any system it likes — customer apps, third-party tools,
 * legacy hosts. What it must never do is invent something that looks like an SAP
 * product. "SAP Workflow Cloud" and "SAP Data Orchestration Hub" read as real to a
 * reviewer and are not, and a diagram carrying one is worse than a diagram with a
 * generic box, because it will be believed.
 *
 * So the rule enforced here is narrow and checkable: anything presented as an SAP
 * product must resolve to a name on this list. Everything else is left alone.
 *
 * Source of truth is SAP's own Draw.io shape library (mirrored by
 * scripts/fetch-sap-icons.mjs), plus the on-premise and suite products that library
 * has no icon for. Where SAP has renamed a product, the old name is an alias so a
 * model using it is corrected rather than rejected.
 */

/** Products SAP ships. Compared case-insensitively, punctuation-insensitively. */
const CANONICAL = [
  // Business Technology Platform — runtimes and foundation
  "SAP Business Technology Platform",
  "SAP BTP, Cloud Foundry Runtime",
  "SAP BTP, Kyma Runtime",
  "SAP BTP, ABAP Environment",
  "SAP Business Application Studio",
  "SAP Continuous Integration and Delivery",
  "SAP Cloud Transport Management",
  "SAP Alert Notification Service",
  "SAP Application Autoscaler",
  "SAP Authorization and Trust Management Service",
  "SAP Destination Service",
  "SAP Connectivity Service",
  "SAP Cloud Connector",
  "SAP Private Link Service",
  "SAP Credential Store",
  "SAP Audit Log Service",
  "SAP Cloud Logging",
  "SAP Automation Pilot",
  "SAP Object Store",
  "SAP HTML5 Application Repository",
  "SAP Extensibility Service",

  // Identity
  "SAP Cloud Identity Services",
  "SAP Cloud Identity Services - Identity Authentication",
  "SAP Cloud Identity Services - Identity Provisioning",
  "SAP Cloud Identity Services - Identity Directory",
  "SAP Identity Management",
  "SAP Access Control",
  "SAP Cloud Identity Access Governance",

  // Integration
  "SAP Integration Suite",
  "SAP Integration Suite, advanced event mesh",
  "SAP Event Mesh",
  "SAP Event Broker for SAP Cloud Applications",
  "SAP API Management",
  "SAP Integration Advisor",
  "SAP Open Connectors",
  "SAP Trading Partner Management",
  "SAP Edge Integration Cell",
  "SAP Master Data Integration",
  "SAP Landscape Management Cloud",
  "SAP Business Accelerator Hub",
  "SAP Process Orchestration",

  // Data and analytics
  "SAP HANA Cloud",
  "SAP HANA Cloud, HANA Database",
  "SAP HANA Cloud, Data Lake",
  "SAP HANA Spatial Services",
  "SAP Datasphere",
  "SAP Analytics Cloud",
  "SAP Business Data Cloud",
  "SAP Data Intelligence Cloud",
  "SAP Master Data Governance",
  "SAP Business Warehouse",
  "SAP BW/4HANA",
  "SAP SQL Anywhere",
  "SAP PowerDesigner",

  // AI
  "SAP AI Core",
  "SAP AI Launchpad",
  "SAP Generative AI Hub",
  "SAP Joule",
  "SAP Joule Studio",
  "SAP Agent Gateway",
  "SAP Cloud SDK for AI",
  "SAP Document Information Extraction",
  "SAP Document Grounding",
  "SAP Business Entity Recognition",
  "SAP Data Attribute Recommendation",
  "SAP Personalized Recommendation",
  "SAP Invoice Object Recommendation",
  "SAP Intelligent Situation Automation",
  "SAP Translation Hub",

  // Development and automation
  "SAP Build",
  "SAP Build Apps",
  "SAP Build Code",
  "SAP Build Process Automation",
  "SAP Build Work Zone",
  "SAP Build Work Zone, standard edition",
  "SAP Build Work Zone, advanced edition",
  "SAP Cloud Application Programming Model",
  "SAP Fiori",
  "SAP Fiori Launchpad",
  "SAP UI5",
  "SAP Mobile Services",
  "SAP Mobile Start",
  "SAP Task Center",
  "SAP Workflow Management",
  "SAP Document Management Service",
  "SAP Forms Service by Adobe",
  "SAP Print Service",

  // Core business suite
  "SAP S/4HANA",
  "SAP S/4HANA Cloud",
  "SAP S/4HANA Cloud, public edition",
  "SAP S/4HANA Cloud, private edition",
  "SAP ERP",
  "SAP ECC",
  "SAP SuccessFactors",
  "SAP Ariba",
  "SAP Fieldglass",
  "SAP Concur",
  "SAP Customer Experience",
  "SAP Sales Cloud",
  "SAP Service Cloud",
  "SAP Commerce Cloud",
  "SAP Marketing Cloud",
  "SAP Emarsys",
  "SAP Integrated Business Planning",
  "SAP Business Network",
  "SAP Business ByDesign",
  "SAP Business One",
  "SAP Transportation Management",
  "SAP Extended Warehouse Management",
  "SAP Field Service Management",
  "SAP Subscription Billing",
  "SAP Entitlement Management",
  "SAP Signavio",
  "SAP LeanIX",
  "SAP Enable Now",

  // Operations
  "SAP Cloud ALM",
  "SAP4ME",
  "SAP Solution Manager",
  "SAP Focused Run",
  "SAP Landscape Management",
  "SAP Readiness Check",
];

/**
 * Renamed, abbreviated or colloquial names architects actually type, mapped to the
 * current official name. Keys are normalised on load.
 */
const ALIASES: Record<string, string> = {
  "sap cpi": "SAP Integration Suite",
  "cpi": "SAP Integration Suite",
  "sap cloud platform integration": "SAP Integration Suite",
  "sap cloud integration": "SAP Integration Suite",
  "sap po": "SAP Process Orchestration",
  "sap pi": "SAP Process Orchestration",
  "sap cloud platform": "SAP Business Technology Platform",
  "sap scp": "SAP Business Technology Platform",
  "btp": "SAP Business Technology Platform",
  "sap ias": "SAP Cloud Identity Services - Identity Authentication",
  "ias": "SAP Cloud Identity Services - Identity Authentication",
  "sap ips": "SAP Cloud Identity Services - Identity Provisioning",
  "ips": "SAP Cloud Identity Services - Identity Provisioning",
  "xsuaa": "SAP Authorization and Trust Management Service",
  "sap xsuaa": "SAP Authorization and Trust Management Service",
  // informal variants seen in real extractions — corrected, not alarmed about
  "cloud connector": "SAP Cloud Connector",
  "sap btp cloud connector": "SAP Cloud Connector",
  "sap btp connectivity cloud connector": "SAP Cloud Connector",
  "sap cf": "SAP BTP, Cloud Foundry Runtime",
  "cloud foundry": "SAP BTP, Cloud Foundry Runtime",
  "kyma": "SAP BTP, Kyma Runtime",
  "sap kyma": "SAP BTP, Kyma Runtime",
  "sap cap": "SAP Cloud Application Programming Model",
  "cap": "SAP Cloud Application Programming Model",
  "sapui5": "SAP UI5",
  "ui5": "SAP UI5",
  "sap sac": "SAP Analytics Cloud",
  "sac": "SAP Analytics Cloud",
  "sap bw": "SAP Business Warehouse",
  "sap mdg": "SAP Master Data Governance",
  "sap ibp": "SAP Integrated Business Planning",
  "sap ewm": "SAP Extended Warehouse Management",
  "sap tm": "SAP Transportation Management",
  "sap fsm": "SAP Field Service Management",
  "sap s4": "SAP S/4HANA",
  "s4hana": "SAP S/4HANA",
  "s/4hana": "SAP S/4HANA",
  "sap s/4": "SAP S/4HANA",
  "sap gen ai hub": "SAP Generative AI Hub",
  "generative ai hub": "SAP Generative AI Hub",
  "sap ai hub": "SAP Generative AI Hub",
  "sap dsp": "SAP Datasphere",
  "sap data warehouse cloud": "SAP Datasphere",
  "data warehouse cloud": "SAP Datasphere",
  "sap launchpad service": "SAP Build Work Zone, standard edition",
  "sap portal": "SAP Build Work Zone, advanced edition",
  // deliberately no bare "sap workflow" alias — it is generic enough to swallow
  // inventions like "SAP Workflow Orchestration Cloud" as a prefix match
  "sap irpa": "SAP Build Process Automation",
  "sap intelligent rpa": "SAP Build Process Automation",
  "sap appgyver": "SAP Build Apps",
  "sap event broker": "SAP Event Broker for SAP Cloud Applications",
  "sap advanced event mesh": "SAP Integration Suite, advanced event mesh",
  "sap aem": "SAP Integration Suite, advanced event mesh",
};

/** Lowercase, strip punctuation and filler so "SAP S/4HANA Cloud" ≈ "sap s4hana cloud". */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[®™]/g, "")
    .replace(/[\/\-–—_,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_KEY = new Map<string, string>();
for (const name of CANONICAL) BY_KEY.set(normalise(name), name);
for (const [alias, target] of Object.entries(ALIASES)) BY_KEY.set(normalise(alias), target);

/** Levenshtein, bounded — only used to suggest a correction, never to auto-apply one. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 6) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export interface ProductVerdict {
  /** `known` — on the list. `renamed` — an alias resolved. `unverified` — not found. */
  status: "known" | "renamed" | "unverified";
  /** Official name to display. Present for known and renamed. */
  canonical?: string;
  /** Closest catalogue entry, when the name could not be resolved. */
  suggestion?: string;
}

/**
 * Resolve a name against the catalogue.
 *
 * Only names presenting themselves as SAP products are judged — `verifySapProduct`
 * is deliberately silent about "Plant Historian DB" or "Salesforce", which are real
 * systems this tool has no business second-guessing.
 */
export function verifySapProduct(rawName: string): ProductVerdict {
  const key = normalise(rawName);
  if (!key) return { status: "unverified" };

  const exact = BY_KEY.get(key);
  if (exact) return { status: normalise(exact) === key ? "known" : "renamed", canonical: exact };

  // A real product may carry an edition or scope qualifier: "SAP S/4HANA Cloud for
  // Finance". Only those suffixes are accepted — anything else appended to a known
  // name is a new product noun, which is exactly how invented services are formed.
  // Editions and scopes, plus the part-of nouns SAP's own diagrams use to name a
  // piece of a product ("SAP Joule User Interface", "Agent Gateway"). These name a
  // component of something real; a fresh product noun does not, which is how an
  // invented service is formed.
  const QUALIFIER =
    /^(cloud|on premise|public edition|private edition|standard edition|advanced edition|enterprise edition|community edition|service|(service |offering |capability )?(for|on|in) .+|ui|user interface|orchestrator|gateway|runtime|api|apis|studio|launchpad|capabilities|skills|agent|agents|connector|console|cockpit)$/;
  let prefix: { canonical: string; len: number } | undefined;
  for (const [k, v] of BY_KEY) {
    if (k.length <= 6 || !key.startsWith(`${k} `)) continue;
    if (!QUALIFIER.test(key.slice(k.length + 1))) continue;
    if (!prefix || k.length > prefix.len) prefix = { canonical: v, len: k.length };
  }
  if (prefix) return { status: "known", canonical: prefix.canonical };

  // Diagrams often label one box with two products — "SAP Build Code / Joule Studio",
  // "Identity Authentication + Identity Provisioning". If every part is real the
  // label is real; only flag it when a part is not.
  if (/[/+]|\band\b/i.test(rawName)) {
    const parts = rawName
      .split(/\s*(?:[/+]|\band\b)\s*/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 2);
    if (parts.length > 1) {
      // the vendor prefix is usually written once: "SAP Build Code / Joule Studio"
      const verdicts = parts.map(
        (p) => BY_KEY.get(normalise(p)) ?? BY_KEY.get(normalise(`SAP ${p}`))
      );
      if (verdicts.every(Boolean)) {
        return { status: "known", canonical: verdicts.map((v) => v!).join(" / ") };
      }
    }
  }

  let best: { name: string; d: number } | undefined;
  for (const [k, v] of BY_KEY) {
    const d = distance(key, k);
    if (!best || d < best.d) best = { name: v, d };
  }
  // allow roughly one typo per five characters before calling it a suggestion
  const tolerance = Math.max(2, Math.floor(key.length / 5));
  return best && best.d <= tolerance
    ? { status: "unverified", suggestion: best.name }
    : { status: "unverified" };
}

/** Does this name claim to be an SAP product? Only these are held to the catalogue. */
export function claimsToBeSap(name: string): boolean {
  return /^sap\b/i.test(name.trim()) || /\bs\/4hana\b|\bsuccessfactors\b|\bariba\b|\bfieldglass\b/i.test(name);
}

export const __catalogSize = CANONICAL.length;
