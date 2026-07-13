/**
 * Verified / commonly used Draw.io native SAPIcon names (mxgraph.sap.icon).
 * Prefer names proven in Architecture Center RA0029 and the official SAP set.
 * Never invent names — unknown services fall back to white product cards.
 */
export const SAP_ICON_BY_SERVICE: Record<string, string> = {
  // Identity & security
  "sap cloud identity services": "SAP_Cloud_Identity_Service",
  "cloud identity services": "SAP_Cloud_Identity_Service",
  ias: "SAP_Cloud_Identity_Service",
  "authorization and trust management": "SAP_Authorization_and_Trust_Management_Service",
  xsuaa: "SAP_Authorization_and_Trust_Management_Service",

  // AI
  joule: "SAP_Digital_Assistant",
  "digital assistant": "SAP_Digital_Assistant",
  "sap ai core": "SAP_AI_Core",
  "ai core": "SAP_AI_Core",
  "sap ai launchpad": "SAP_AI_Launchpad",
  "ai launchpad": "SAP_AI_Launchpad",
  "generative ai hub": "SAP_AI_Core", // accessed via AI Core / Launchpad

  // Data
  "sap hana cloud": "SAP_HANA_Cloud",
  "hana cloud": "SAP_HANA_Cloud",
  "sap datasphere": "SAP_Datasphere",
  datasphere: "SAP_Datasphere",
  "sap analytics cloud": "SAP_Analytics_Cloud",

  // Integration
  "sap integration suite": "SAP_Integration_Suite",
  "integration suite": "SAP_Integration_Suite",
  "api management": "SAP_Integration_Suite_-_API_Managment",
  "event mesh": "SAP_Event_Mesh",
  "cloud connector": "Cloud_Connector2",

  // Runtime / app services
  "cloud foundry": "SAP_BTP,_Cloud_Foundry_runtime",
  "cloud foundry runtime": "SAP_BTP,_Cloud_Foundry_runtime",
  "html5 application repository": "HTML5_Application_Repository",
  "object store": "Object_Store",
  "document management": "SAP_Document_Management_Service",
  "destination service": "Destination",
  connectivity: "Connectivity",
  "work zone": "SAP_Build_Work_Zone",
  "sap build work zone": "SAP_Build_Work_Zone",
};

const ICON_STYLE_BASE =
  "shape=mxgraph.sap.icon;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;strokeWidth=1;strokeColor=#D5DADD;fillColor=#EDEFF0;gradientColor=#FCFCFC;gradientDirection=west;aspect=fixed;fontFamily=Helvetica;fontSize=11;fontColor=default;fontStyle=1;";

export function resolveSapIcon(
  officialName?: string,
  label?: string,
  explicit?: string
): string | undefined {
  if (explicit) return explicit;
  const keys = [officialName, label]
    .filter(Boolean)
    .map((s) => s!.toLowerCase().trim());
  for (const k of keys) {
    if (SAP_ICON_BY_SERVICE[k]) return SAP_ICON_BY_SERVICE[k];
    // partial match
    for (const [name, icon] of Object.entries(SAP_ICON_BY_SERVICE)) {
      if (k.includes(name) || name.includes(k)) return icon;
    }
  }
  return undefined;
}

/** Icon labels must be plain text with &#xa; line breaks — never HTML. */
export function sapIconCell(
  id: string,
  sapIcon: string,
  label: string,
  x: number,
  y: number,
  size = 64
): string {
  const plain = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#xa;");
  const style = `${ICON_STYLE_BASE}SAPIcon=${sapIcon};`;
  return `        <mxCell id="${id}" value="${plain}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${size}" height="${size}" as="geometry"/>
        </mxCell>`;
}

export function isIconKind(kind: string): boolean {
  return (
    kind === "sap-service" ||
    kind === "identity" ||
    kind === "integration" ||
    kind === "database"
  );
}
