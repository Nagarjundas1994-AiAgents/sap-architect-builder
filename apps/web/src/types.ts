export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting";

export interface PipelineStepStatus {
  id: string;
  name: string;
  status: StepStatus;
  message?: string;
  detail?: unknown;
}

export interface ArchitectureComponent {
  id: string;
  label: string;
  subtitle?: string;
  kind: string;
  zoneId: string;
  officialName?: string;
  confidence?: number;
  notes?: string;
}

export interface ArchitectureActor {
  id: string;
  label: string;
  role?: string;
}

export interface ArchitectureZone {
  id: string;
  label: string;
  kind: string;
  parentId?: string;
}

export interface ArchitectureFlow {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  protocol?: string;
  mode?: string;
  bidirectional?: boolean;
}

export interface ArchitectureModel {
  id: string;
  title: string;
  level: string;
  summary: string;
  actors: ArchitectureActor[];
  zones: ArchitectureZone[];
  components: ArchitectureComponent[];
  flows: ArchitectureFlow[];
  assumptions: Array<{ id: string; text: string; severity: string }>;
  sourceImageName?: string;
  createdAt?: string;
}

export interface GapFinding {
  id: string;
  category: string;
  severity: "low" | "medium" | "high";
  message: string;
  suggestion?: string;
}

export interface ScoredRef {
  ref: {
    id: string;
    title: string;
    summary: string;
    products: string[];
    sourceUrl?: string;
  };
  score: number;
}

/** One renderable Mermaid view from the Mermaid agent. */
export interface MermaidView {
  id: "landscape" | "context" | "container" | "sequence" | "identity";
  label: string;
  kind: string;
  note: string;
  code: string;
  ok: boolean;
  issues: string[];
}

export interface PipelineResult {
  jobId: string;
  status: "queued" | "running" | "awaiting_review" | "completed" | "failed";
  steps: PipelineStepStatus[];
  extracted?: ArchitectureModel;
  refined?: ArchitectureModel;
  approved?: ArchitectureModel;
  gaps?: GapFinding[];
  references?: ScoredRef[];
  /** Companion artifacts derived from the same approved model as the diagram. */
  artifacts?: {
    contextC4: string;
    containerC4: string;
    sequence: string;
    identityFlow: string;
    plantUml: string;
    adr: string;
  };
  /** Renderable Mermaid views, produced before the Draw.io render. */
  mermaid?: MermaidView[];
  drawioXml?: string;
  error?: string;
  engine?: string;
}
