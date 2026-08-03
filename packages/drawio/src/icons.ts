/**
 * Official Draw.io SAP shape set (`shape=mxgraph.sap.icon`).
 *
 * Only names in SAP_ICON_CATALOG render an icon — any other value silently draws an
 * empty shape, so every lookup is validated against the catalog before it is emitted.
 * Source: jgraph/drawio `Sidebar-SAP.js`, mirrored in the create-sap-drawio-architecture
 * skill at reference/sapicon-catalog.md (114 names).
 */

/** Every valid `SAPIcon=` value. Never emit a name that is not in this set. */
export const SAP_ICON_CATALOG: ReadonlySet<string> = new Set([
  // the corporate mark, used in zone headers as SAP's own diagrams do
  "SAP_Logo",
  "API_Business_Hub_Enterprise",
  "Application_Autoscaler",
  "Application_Frontend_Service",
  "Application_Vulnerability_Report",
  "Business_Application_Studio",
  "Business_Entity_Recognition",
  "Business_Process_Model_Connector_for_SAP_Signavio_Solutions",
  "Cloud_Connector2",
  "Cloud_Integration_Automation",
  "Data_Attribute_Recommendation",
  "Document_Information_Extraction",
  "Edge_Integration_Cell",
  "Extensibility_Service",
  "HTML5_App_Repository",
  "Identity_Authentication",
  "Identity_Authentication2",
  "Identity_Directory",
  "Identity_Directory2",
  "Identity_Provisioning",
  "Identity_Provisioning2",
  "Intelligent_Situation_Automation",
  "Invoice_Object_Recommendation2",
  "Landscape_Portal_for_SAP_S4HANA_Cloud_ABAP_Environment",
  "OAuth_20",
  "Object_Store_on_SAP_BTP",
  "Personalized_Recommendation",
  "SAP_AI_Core",
  "SAP_AI_Launchpad",
  "SAP_Alert_Notification_service_for_SAP_BTP",
  "SAP_Analytics_Cloud",
  "SAP_Analytics_Cloud_Embedded_Edition",
  "SAP_Application_Logging_service_for_SAP_BTP",
  "SAP_Asset_Performance_Management",
  "SAP_Audit_Log_Service",
  "SAP_Authorization_Management_Service",
  "SAP_Authorization_and_Trust_Management_service",
  "SAP_Automation_Pilot",
  "SAP_BTP,_ABAP_environment",
  "SAP_BTP,_Cloud_Foundry_runtime",
  "SAP_BTP,_Kyma_runtime",
  "SAP_Build",
  "SAP_Build_Apps",
  "SAP_Build_Code",
  "SAP_Build_Process_Automation",
  "SAP_Build_Work_Zone_-_Advanced_Edition",
  "SAP_Build_Work_Zone_-_Standard_Edition",
  "SAP_Business_Accelerator_Hub",
  "SAP_Business_Data_Cloud",
  "SAP_Cloud_ALM",
  "SAP_Cloud_Application_Programming_Model",
  "SAP_Cloud_Identity,_SAP_Malware_Scanning_Service",
  "SAP_Cloud_Identity_Service",
  "SAP_Cloud_Logging",
  "SAP_Cloud_Management_Service",
  "SAP_Cloud_Transport_Management",
  "SAP_Collaborative_Demand_and_Capacity_Management",
  "SAP_Connectivity_Service",
  "SAP_Content_Agent_Service",
  "SAP_Continuous_Integration_and_Delivery",
  "SAP_Credential_Store",
  "SAP_Custom_Domain_service",
  "SAP_Data_Privacy_Integration",
  "SAP_Data_Retention_Manager",
  "SAP_Datasphere",
  "SAP_Destination_service",
  "SAP_Digital_Assistant",
  "SAP_Digital_Assistant_Service",
  "SAP_Digital_Manufacturing",
  "SAP_Document_Grounding",
  "SAP_Document_Management_Service",
  "SAP_Event_Broker_for_SAP_Cloud_Applications",
  "SAP_Green_Token",
  "SAP_HANA_Cloud",
  "SAP_HANA_Spatial_Services",
  "SAP_Health_Data_Services_for_FHIR",
  "SAP_Integration_Suite",
  "SAP_Integration_Suite_-_API_Managment",
  "SAP_Integration_Suite_-_Advanced_Event_Mesh",
  "SAP_Integration_Suite_-_Cloud_Integration",
  "SAP_Integration_Suite_-_Data_Space_Integration",
  "SAP_Integration_Suite_-_Event_Mesh",
  "SAP_Integration_Suite_-_Integration_Advisor",
  "SAP_Integration_Suite_-_Integration_Assessment",
  "SAP_Integration_Suite_-_Migration_Assessment",
  "SAP_Integration_Suite_-_Open_Connectors",
  "SAP_Integration_Suite_-_SAP_Graph",
  "SAP_Integration_Suite_-_Trading_Partner_Management",
  "SAP_Job_Scheduling_service",
  "SAP_Keystore_Service",
  "SAP_Landscape_Management_Cloud",
  "SAP_Master_Data_Governance",
  "SAP_Master_Data_Integration",
  "SAP_Mobile_Services",
  "SAP_Monitoring_service_for_SAP_BTP",
  "SAP_Omnichannel_Promotion_Pricing",
  "SAP_PKI_Certificate_Service",
  "SAP_Persistence_Service_ASE",
  "SAP_Personal_Data_Manager",
  "SAP_Private_Link_service",
  "SAP_Project_and_Resource_Management",
  "SAP_Responsibility_Management_Service",
  "SAP_S4HANA_Cloud_for_Intelligent_Intercompany_Reconciliation",
  "SAP_S4HANA_for_MS_Teams",
  "SAP_Secure_Login_Service_for_SAP_GUI",
  "SAP_Service_Manager",
  "SAP_Software_as_a_Service_Provisioning_Service",
  "SAP_Solution_Lifecycle_Management_Service",
  "SAP_Sustainability_Data_Exchange",
  "SAP_Task_Center",
  "SAP_Translation_Hub",
  "SAP_Variant_Configuration_and_Pricing",
  "SAP_Watch_List_Screening",
  "Service_Ticket_Intelligence2",
  "UI5_flexibility_for_key_users",
  "UI_Theme_Designer",
]);

/**
 * Service label → official icon. Keys are lower-case; longest key wins so
 * "sap integration suite - event mesh" beats "sap integration suite".
 * SaaS products (S/4HANA Cloud, Ariba, SuccessFactors…) are deliberately absent —
 * the official set has no icon for them and they render as white product cards.
 */
export const SAP_ICON_BY_SERVICE: Record<string, string> = {
  // Identity & security
  "sap cloud identity services": "SAP_Cloud_Identity_Service",
  "cloud identity services": "SAP_Cloud_Identity_Service",
  "identity authentication": "Identity_Authentication",
  "identity provisioning": "Identity_Provisioning",
  ias: "SAP_Cloud_Identity_Service",
  "authorization and trust management": "SAP_Authorization_and_Trust_Management_service",
  xsuaa: "SAP_Authorization_and_Trust_Management_service",
  "audit log": "SAP_Audit_Log_Service",
  "credential store": "SAP_Credential_Store",

  // AI
  joule: "SAP_Digital_Assistant",
  "digital assistant": "SAP_Digital_Assistant",
  "sap ai core": "SAP_AI_Core",
  "ai core": "SAP_AI_Core",
  "generative ai hub": "SAP_AI_Core",
  "sap ai launchpad": "SAP_AI_Launchpad",
  "ai launchpad": "SAP_AI_Launchpad",
  "document grounding": "SAP_Document_Grounding",
  "document information extraction": "Document_Information_Extraction",

  // Data & analytics
  "sap hana cloud": "SAP_HANA_Cloud",
  "hana cloud": "SAP_HANA_Cloud",
  "sap datasphere": "SAP_Datasphere",
  datasphere: "SAP_Datasphere",
  "sap analytics cloud": "SAP_Analytics_Cloud",
  "analytics cloud": "SAP_Analytics_Cloud",
  "business data cloud": "SAP_Business_Data_Cloud",
  "master data integration": "SAP_Master_Data_Integration",
  "object store": "Object_Store_on_SAP_BTP",

  // Integration
  "sap integration suite": "SAP_Integration_Suite",
  "integration suite": "SAP_Integration_Suite",
  "cloud integration": "SAP_Integration_Suite_-_Cloud_Integration",
  "api management": "SAP_Integration_Suite_-_API_Managment",
  "advanced event mesh": "SAP_Integration_Suite_-_Advanced_Event_Mesh",
  "event mesh": "SAP_Integration_Suite_-_Event_Mesh",
  "event broker": "SAP_Event_Broker_for_SAP_Cloud_Applications",
  "open connectors": "SAP_Integration_Suite_-_Open_Connectors",
  "sap graph": "SAP_Integration_Suite_-_SAP_Graph",
  "edge integration cell": "Edge_Integration_Cell",
  "cloud connector": "Cloud_Connector2",
  "destination service": "SAP_Destination_service",
  destination: "SAP_Destination_service",
  "connectivity service": "SAP_Connectivity_Service",
  connectivity: "SAP_Connectivity_Service",
  "private link": "SAP_Private_Link_service",

  // Runtimes & app services
  "cloud foundry runtime": "SAP_BTP,_Cloud_Foundry_runtime",
  "cloud foundry": "SAP_BTP,_Cloud_Foundry_runtime",
  "kyma runtime": "SAP_BTP,_Kyma_runtime",
  kyma: "SAP_BTP,_Kyma_runtime",
  "abap environment": "SAP_BTP,_ABAP_environment",
  "html5 application repository": "HTML5_App_Repository",
  "html5 app repository": "HTML5_App_Repository",
  "cloud application programming model": "SAP_Cloud_Application_Programming_Model",
  "sap cap": "SAP_Cloud_Application_Programming_Model",
  "business application studio": "Business_Application_Studio",
  "document management": "SAP_Document_Management_Service",
  "job scheduling": "SAP_Job_Scheduling_service",
  "task center": "SAP_Task_Center",
  "application logging": "SAP_Application_Logging_service_for_SAP_BTP",
  "alert notification": "SAP_Alert_Notification_service_for_SAP_BTP",
  "cloud logging": "SAP_Cloud_Logging",
  "cloud alm": "SAP_Cloud_ALM",
  "transport management": "SAP_Cloud_Transport_Management",
  "continuous integration and delivery": "SAP_Continuous_Integration_and_Delivery",

  // Build & automation
  "sap build work zone, standard edition": "SAP_Build_Work_Zone_-_Standard_Edition",
  "sap build work zone, advanced edition": "SAP_Build_Work_Zone_-_Advanced_Edition",
  "sap build work zone": "SAP_Build_Work_Zone_-_Standard_Edition",
  "work zone": "SAP_Build_Work_Zone_-_Standard_Edition",
  "sap build process automation": "SAP_Build_Process_Automation",
  "process automation": "SAP_Build_Process_Automation",
  "sap build apps": "SAP_Build_Apps",
  "sap build code": "SAP_Build_Code",
  "sap build": "SAP_Build",
  "mobile services": "SAP_Mobile_Services",
};

const ICON_STYLE_BASE =
  "shape=mxgraph.sap.icon;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;strokeWidth=1;strokeColor=#D5DADD;fillColor=#EDEFF0;gradientColor=#FCFCFC;gradientDirection=west;aspect=fixed;fontFamily=Helvetica;fontSize=12;fontStyle=1;fontColor=default;";

/** Shortest token allowed to fuzzy-match an icon key. */
const MIN_FUZZY_LEN = 5;

/** Longest key first, so specific capabilities beat the umbrella service. */
const SERVICE_KEYS = Object.keys(SAP_ICON_BY_SERVICE).sort((a, b) => b.length - a.length);

/**
 * Resolve a component to an official icon, or undefined when the catalog has none
 * (SaaS products and custom components are drawn as white cards instead).
 * An explicit `sapIcon` is honoured only when it is a real catalog entry.
 */
export function resolveSapIcon(
  officialName?: string,
  label?: string,
  explicit?: string
): string | undefined {
  if (explicit) return SAP_ICON_CATALOG.has(explicit) ? explicit : undefined;

  const keys = [officialName, label].filter(Boolean).map((s) => s!.toLowerCase().trim());
  for (const k of keys) {
    const exact = SAP_ICON_BY_SERVICE[k];
    if (exact) return exact;
    // ponytail: substring match only on tokens long enough to be unambiguous — an
    // unguarded includes() maps "SAP" to Cloud Identity and "AI" to AI Core, which
    // breaks the "never show a wrong official icon" contract above.
    for (const name of SERVICE_KEYS) {
      if (name.length >= MIN_FUZZY_LEN && k.includes(name)) return SAP_ICON_BY_SERVICE[name];
      if (k.length >= MIN_FUZZY_LEN && name.includes(k)) return SAP_ICON_BY_SERVICE[name];
    }
  }
  return undefined;
}

/** Wrap a plain-text icon label onto at most two lines near `width` characters. */
export function wrapIconLabel(text: string, width = 16): string {
  const words = text.split(/\s+/);
  if (text.length <= width || words.length === 1) return text;
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  // two lines max — the icon is only 64px wide
  return lines.length <= 2 ? lines.join("\n") : [lines[0], lines.slice(1).join(" ")].join("\n");
}

/**
 * Official SAP service icon cell. Labels are PLAIN TEXT with &#xa; breaks —
 * `mxgraph.sap.icon` has no html=1, so markup would render as literal text.
 */
export function sapIconCell(
  id: string,
  sapIcon: string,
  label: string,
  x: number,
  y: number,
  size = 64,
  parent = "1"
): string {
  const plain = wrapIconLabel(label)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#xa;");
  const style = `${ICON_STYLE_BASE}SAPIcon=${sapIcon};`;
  return `        <mxCell id="${id}" value="${plain}" style="${style}" vertex="1" parent="${parent}">
          <mxGeometry x="${x}" y="${y}" width="${size}" height="${size}" as="geometry"/>
        </mxCell>`;
}

/** Component kinds that carry an official BTP service icon when the catalog has one. */
export function isIconKind(kind: string): boolean {
  return (
    kind === "sap-service" ||
    kind === "identity" ||
    kind === "integration" ||
    kind === "database"
  );
}
