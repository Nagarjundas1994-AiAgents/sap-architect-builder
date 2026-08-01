/**
 * Diagram-style profiles.
 *
 * Every style shares one engine (containment tree → layered layout → themed cells).
 * A profile is the set of conventions that make a diagram read as a *kind* of
 * diagram: what a container means, how a node is labelled, which relationships are
 * worth drawing, and what the legend has to explain.
 *
 * Sequence diagrams are the exception — they are laid out on a time axis rather than
 * a flow graph — and are rendered by their own path.
 */
import type { ArchitectureComponent, ArchitectureZone, DiagramStyle } from "@sap-architect/shared";
import type { Role } from "./theme.js";

export interface StyleProfile {
  /** Page name in the Draw.io tab. */
  page: string;
  /** One line describing what the reader should take away. */
  intent: string;
  /** Stereotype shown above a component name, C4/UML style. */
  stereotype?: (c: ArchitectureComponent) => string | undefined;
  /** Stereotype for a container. */
  zoneStereotype?: (z: ArchitectureZone) => string | undefined;
  /** Force a role for every component (data-flow diagrams read in one hue). */
  roleOverride?: (c: ArchitectureComponent, inferred: Role) => Role;
  /** Show protocol chips on connectors. */
  interfaceChips: boolean;
  /** Extra legend lines specific to the convention. */
  legend: string[];
  /** Laid out on a time axis instead of a flow graph. */
  temporal?: boolean;
}

const titleCase = (s: string) => s.replace(/(^|[\s-])(\w)/g, (_, a, b) => a + b.toUpperCase());

const KIND_STEREOTYPE: Record<string, string> = {
  "sap-service": "service",
  "sap-product": "system",
  "custom-app": "application",
  agent: "agent",
  database: "datastore",
  integration: "integration",
  identity: "identity provider",
  external: "external system",
  generic: "component",
};

export const STYLE_PROFILES: Record<DiagramStyle, StyleProfile> = {
  reference: {
    page: "Reference Architecture",
    intent: "The recommended shape of the solution, independent of any one customer.",
    interfaceChips: true,
    legend: [],
  },

  solution: {
    page: "Solution Architecture",
    intent: "How this specific solution is composed and integrated.",
    interfaceChips: true,
    legend: [],
  },

  integration: {
    page: "Integration Architecture",
    intent: "Which systems exchange what, over which interface, in which direction.",
    interfaceChips: true,
    legend: ["Every connector is labelled with its interface and direction"],
  },

  "c4-context": {
    page: "System Context",
    intent: "The system in scope, its users, and the systems it depends on.",
    stereotype: (c) => (c.kind === "external" ? "external system" : "software system"),
    zoneStereotype: () => undefined,
    interfaceChips: false,
    legend: ["Boxes are systems, not deployable units", "Relationships read “A uses B”"],
  },

  "c4-container": {
    page: "Container View",
    intent: "The deployable/runnable units inside the system and how they talk.",
    stereotype: (c) => KIND_STEREOTYPE[c.kind] ?? "container",
    zoneStereotype: (z) => (z.parentId ? undefined : "system boundary"),
    interfaceChips: true,
    legend: ["A container is something that runs — an app, a service, a datastore"],
  },

  component: {
    page: "Component View",
    intent: "The internal building blocks of one container and their dependencies.",
    stereotype: (c) => KIND_STEREOTYPE[c.kind] ?? "component",
    interfaceChips: false,
    legend: ["Arrows are compile-time or runtime dependencies"],
  },

  deployment: {
    page: "Deployment View",
    intent: "Where each unit runs: environment, region, tenancy and network placement.",
    zoneStereotype: (z) =>
      z.environment ? `environment · ${z.environment}` : z.tenant ? `tenant · ${z.tenant}` : "node",
    stereotype: (c) => (c.kind === "database" ? "datastore" : "deployed unit"),
    interfaceChips: true,
    legend: ["Containers are deployment targets", "Dashed enclosures are network or trust boundaries"],
  },

  dataflow: {
    page: "Data Flow",
    intent: "How data moves, where it rests, and which boundaries it crosses.",
    roleOverride: (c, inferred) => (c.kind === "database" ? "data" : inferred),
    interfaceChips: true,
    legend: [
      "Connectors show data movement, not control",
      "Crossing a dashed enclosure is a boundary crossing worth reviewing",
    ],
  },

  sequence: {
    page: "Sequence",
    intent: "The order in which participants exchange messages.",
    interfaceChips: false,
    temporal: true,
    legend: ["Time flows downward", "Each vertical line is one participant's lifeline"],
  },

  "enterprise-ai": {
    page: "Enterprise AI Architecture",
    intent: "How models, agents, tools and governed data combine to serve a business task.",
    stereotype: (c) => (c.kind === "agent" ? "agent" : undefined),
    interfaceChips: true,
    legend: ["Agent and tool channels are distinguished by connector colour"],
  },
};

export function profileFor(style?: DiagramStyle): StyleProfile {
  return STYLE_PROFILES[style ?? "solution"] ?? STYLE_PROFILES.solution;
}

/**
 * Render a stereotype the way UML/C4 conventionally do, above the name.
 *
 * The result is placed in an XML attribute, so the quotes inside the inline style
 * must be entities — a raw `"` closes the attribute and truncates the document.
 */
export function stereotypeMarkup(text: string): string {
  return `&lt;font style=&quot;font-size: 10px;&quot;&gt;«${titleCase(text)}»&lt;/font&gt;&lt;br/&gt;`;
}
