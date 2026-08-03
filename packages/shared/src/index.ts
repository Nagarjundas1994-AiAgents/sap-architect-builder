/** Semantic architecture model shared across vision, orchestration, and Draw.io. */

export type DiagramLevel = "L0" | "L1" | "L2";

export type ComponentKind =
  | "sap-service"
  | "sap-product"
  | "custom-app"
  | "agent"
  | "database"
  | "integration"
  | "identity"
  | "external"
  | "actor"
  | "generic";

export type ZoneKind =
  | "sap-btp"
  | "sap-cloud"
  | "on-premise"
  | "hyperscaler"
  | "partner"
  | "user"
  | "network"
  | "custom";

/**
 * What a connector means. Drives its colour and the legend, so these are the
 * distinctions SAP's own architecture drawings make rather than transport details:
 * authentication is not authorization, and an agent-to-agent call is not a REST call.
 */
export type FlowMode =
  | "sync"
  | "async"
  | "event"
  | "batch"
  | "trust"
  | "admin"
  /** Agent-to-agent (A2A) conversation between orchestrators and agents. */
  | "agent"
  /** Policy, scope or role decision — distinct from authenticating the caller. */
  | "authorization"
  /** Identity or content provisioning: SCIM, replication of users and roles. */
  | "provisioning";

export interface ArchitectureActor {
  id: string;
  label: string;
  role?: string;
}

/** Visual/semantic role a container plays. Drives colour, not vendor branding. */
export type ArchitectureRole =
  | "platform"
  | "application"
  | "data"
  | "integration"
  | "security"
  | "external"
  | "edge"
  | "neutral";

/** A container drawn as a dashed enclosure rather than a filled area. */
export type BoundaryKind = "trust" | "network" | "tenant" | "compliance";

export interface ArchitectureZone {
  id: string;
  label: string;
  kind: ZoneKind;
  parentId?: string;
  /** Overrides the role inferred from `kind`. */
  role?: ArchitectureRole;
  /** Render as a boundary enclosure (dashed) carrying this meaning. */
  boundary?: BoundaryKind;
  /** Deployment environment this zone belongs to (dev / test / prod / region). */
  environment?: string;
  /** Tenant or subscription owning the zone. */
  tenant?: string;
}

export interface ArchitectureComponent {
  id: string;
  label: string;
  subtitle?: string;
  kind: ComponentKind;
  zoneId: string;
  /** Official Draw.io SAPIcon name when known */
  sapIcon?: string;
  /** Official product/service name when verified */
  officialName?: string;
  confidence?: number;
  notes?: string;
  /** Overrides the role inferred from the owning zone. */
  role?: ArchitectureRole;
  /** Interfaces this component exposes (drawn as chips on inbound connectors). */
  exposes?: string[];
  /**
   * Enclosing component. Lets a diagram show real composition — a runtime holding a
   * service holding its modules — instead of flattening everything into one row.
   */
  parentId?: string;
  /**
   * Visual weight. `focus` outlines what the diagram is actually about; `muted`
   * keeps surrounding platform context visible without competing for attention.
   */
  emphasis?: "focus" | "normal" | "muted";
  /**
   * How the object is drawn. `icon` is a glyph with its label beneath and no card —
   * the conventional treatment for a pass-through platform service. `stack` marks a
   * multi-instance component.
   */
  shape?: "card" | "icon" | "stack";
}

export interface ArchitectureFlow {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  protocol?: string;
  mode?: FlowMode;
  bidirectional?: boolean;
  confidence?: number;
}

export interface ArchitectureAssumption {
  id: string;
  text: string;
  severity: "info" | "warning" | "critical";
}

/** Diagram conventions the renderer should follow. */
export type DiagramStyle =
  | "reference"
  | "solution"
  | "integration"
  | "c4-context"
  | "c4-container"
  | "component"
  | "deployment"
  | "dataflow"
  | "sequence"
  | "enterprise-ai";

export interface ArchitectureModel {
  id: string;
  title: string;
  level: DiagramLevel;
  /** Rendering convention; defaults to "solution". */
  style?: DiagramStyle;
  /** Draw a legend box. Off by default: a consistent grammar should not need one. */
  legend?: boolean;
  /** Title-block strip along the bottom edge. */
  /**
   * Title block along the bottom edge. Drawn by default with values derived from the
   * model; set to null to suppress it entirely.
   */
  footer?: { label?: string; updated?: string; reference?: string } | null;
  /** Vertical rules marking a network or ownership separation between zone columns. */
  dividers?: Array<{ label: string; afterZoneId: string }>;
  summary: string;
  actors: ArchitectureActor[];
  zones: ArchitectureZone[];
  components: ArchitectureComponent[];
  flows: ArchitectureFlow[];
  assumptions: ArchitectureAssumption[];
  sourceImageName?: string;
  createdAt: string;
}

export interface ReferenceArchitecture {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  products: string[];
  /** Plain-text embedding corpus for demo retrieval */
  corpus: string;
  /** Optional precomputed embedding (mock or real) */
  embedding?: number[];
  /** Path relative to samples/ */
  drawioPath?: string;
  /** Architecture Center or other source URL */
  sourceUrl?: string;
  /** e.g. architecture-center | curated | user */
  source?: string;
}

export interface GapFinding {
  id: string;
  category: "missing-component" | "missing-flow" | "naming" | "security" | "best-practice";
  severity: "low" | "medium" | "high";
  message: string;
  suggestion?: string;
  relatedComponentIds?: string[];
}

export interface PipelineStepStatus {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "waiting";
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  detail?: unknown;
}

export type PipelineStatus =
  | "queued"
  | "running"
  | "awaiting_review"
  | "completed"
  | "failed";

export interface PipelineResult {
  jobId: string;
  status: PipelineStatus;
  steps: PipelineStepStatus[];
  extracted?: ArchitectureModel;
  references?: Array<{ ref: ReferenceArchitecture; score: number }>;
  gaps?: GapFinding[];
  refined?: ArchitectureModel;
  /** Architect-approved model after HITL (may equal refined) */
  approved?: ArchitectureModel;
  drawioXml?: string;
  drawioPath?: string;
  error?: string;
  engine?: "langgraph" | "sequential";
  createdAt: string;
  updatedAt: string;
}

export interface ExtractVisionRequest {
  imageBase64: string;
  mimeType: string;
  fileName?: string;
  hints?: string;
}

export interface HumanReviewPayload {
  jobId: string;
  refined: ArchitectureModel;
  gaps: GapFinding[];
  references: Array<{ id: string; title: string; score: number }>;
}

export const STYLE = {
  sapArea:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#0070F2;fillColor=#EBF8FF;arcSize=24;absoluteArcSize=1;strokeWidth=1.5;fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;fontSize=16;fontStyle=1;fontColor=default;",
  nonSapArea:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#475E75;fillColor=#F5F6F7;arcSize=24;absoluteArcSize=1;strokeWidth=1.5;fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;fontSize=16;fontStyle=1;fontColor=default;",
  nestedArea:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#475E75;strokeWidth=1.5;arcSize=24;absoluteArcSize=1;fillColor=#ffffff;fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;fontSize=16;fontStyle=1;fontColor=default;",
  accentArea:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#5d36ff;fillColor=#f1ecff;strokeWidth=1.5;arcSize=24;absoluteArcSize=1;fontSize=12;fontFamily=Helvetica;fontColor=default;align=center;fontStyle=1;verticalAlign=middle;container=0;recursiveResize=0;collapsible=0;",
  card:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#0070F2;strokeWidth=1.5;fillColor=#FFFFFF;align=center;verticalAlign=middle;fontSize=12;fontFamily=Helvetica;fontColor=default;arcSize=24;absoluteArcSize=1;fontStyle=1;container=0;recursiveResize=0;collapsible=0;",
  cardAccent:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#5d36ff;strokeWidth=1.5;fillColor=#FFFFFF;align=center;verticalAlign=middle;fontSize=12;fontFamily=Helvetica;fontColor=default;arcSize=24;absoluteArcSize=1;fontStyle=1;container=0;recursiveResize=0;collapsible=0;",
  cardNeutral:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#475E75;strokeWidth=1.5;fillColor=#FFFFFF;align=center;verticalAlign=middle;fontSize=12;fontFamily=Helvetica;fontColor=default;arcSize=24;absoluteArcSize=1;fontStyle=1;container=0;recursiveResize=0;collapsible=0;",
  edge:
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#475E75;strokeWidth=1.5;endArrow=blockThin;endFill=1;startArrow=none;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=11;fontColor=default;labelBackgroundColor=default;",
  edgeTrust:
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#188918;strokeWidth=1.5;endArrow=blockThin;endFill=1;startArrow=none;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=11;fontColor=default;labelBackgroundColor=default;",
  edgeAccent:
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#07838f;strokeWidth=1.5;endArrow=blockThin;endFill=1;startArrow=none;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=11;fontColor=default;labelBackgroundColor=default;",
  pill:
    "rounded=1;whiteSpace=wrap;html=1;arcSize=50;strokeColor=#07838f;fillColor=#dafdf5;strokeWidth=1.5;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=12;fontColor=default;",
  /** Title band: RA0029 uses Arial 19 bold here — the one place Arial appears. */
  title:
    "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontFamily=Arial;fontSize=19;fontStyle=1;fontColor=#1D2D3E;",
  legend:
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#475E75;fillColor=#FFFFFF;arcSize=24;absoluteArcSize=1;strokeWidth=1.5;fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=8;fontSize=12;fontColor=default;",
  sapIcon:
    "shape=mxgraph.sap.icon;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;strokeWidth=1;strokeColor=#D5DADD;fillColor=#EDEFF0;gradientColor=#FCFCFC;gradientDirection=west;aspect=fixed;fontFamily=Helvetica;fontSize=12;fontColor=default;",
} as const;

/** Fixed embedding dimension for pgvector / hashed BoW */
export const EMBEDDING_DIMS = 256;
