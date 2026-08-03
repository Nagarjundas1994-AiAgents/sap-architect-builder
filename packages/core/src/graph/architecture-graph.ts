import { Annotation, Command, END, MemorySaver, START, StateGraph, interrupt } from "@langchain/langgraph";
import { generateDrawioXml } from "@sap-architect/drawio";
import type {
  ArchitectureModel,
  ExtractVisionRequest,
  GapFinding,
  MermaidView,
  PipelineResult,
  PipelineStepStatus,
  ReferenceArchitecture,
} from "@sap-architect/shared";
import { analyzeGaps } from "../agents/gaps.js";
import { buildMermaidViews } from "../agents/mermaid.js";
import { refineArchitecture } from "../agents/refine.js";
import { validateArchitectureModel, validateDiagram } from "../agents/validate.js";
import { loadCorpusIntoStore } from "../corpus/loader.js";
import { getVectorStore, type VectorStore } from "../vector/index.js";
import {
  extractArchitectureFromImage,
  type VisionExtractorOptions,
} from "../vision/extract.js";

export interface GraphRuntimeOptions extends VisionExtractorOptions {
  /** Pause after refine for architect approval (default true). */
  requireHumanReview?: boolean;
  onStep?: (steps: PipelineStepStatus[], result: PipelineResult) => void;
  vectorStore?: VectorStore;
  /** Ensure corpus is loaded once into the store. */
  ensureCorpus?: boolean;
}

type ScoredRef = { ref: ReferenceArchitecture; score: number };

const GraphState = Annotation.Root({
  jobId: Annotation<string>,
  request: Annotation<ExtractVisionRequest>,
  requireHumanReview: Annotation<boolean>,
  steps: Annotation<PipelineStepStatus[]>,
  extracted: Annotation<ArchitectureModel | undefined>,
  references: Annotation<ScoredRef[] | undefined>,
  gaps: Annotation<GapFinding[] | undefined>,
  refined: Annotation<ArchitectureModel | undefined>,
  approved: Annotation<ArchitectureModel | undefined>,
  drawioXml: Annotation<string | undefined>,
  mermaid: Annotation<MermaidView[] | undefined>,
  error: Annotation<string | undefined>,
  status: Annotation<PipelineResult["status"]>,
  createdAt: Annotation<string>,
  updatedAt: Annotation<string>,
});

type S = typeof GraphState.State;

function now() {
  return new Date().toISOString();
}

function baseSteps(): PipelineStepStatus[] {
  return [
    { id: "extract", name: "Vision extraction", status: "pending" },
    { id: "retrieve", name: "Reference architecture search", status: "pending" },
    { id: "gaps", name: "Gap analysis", status: "pending" },
    { id: "refine", name: "Architecture refinement", status: "pending" },
    { id: "mermaid", name: "Mermaid diagram generation", status: "pending" },
    { id: "human_review", name: "Human review", status: "pending" },
    { id: "generate", name: "Draw.io XML generation", status: "pending" },
    { id: "validate", name: "Validation", status: "pending" },
  ];
}

function mark(
  steps: PipelineStepStatus[],
  id: string,
  status: PipelineStepStatus["status"],
  patch?: Partial<PipelineStepStatus>
): PipelineStepStatus[] {
  return steps.map((s) =>
    s.id === id
      ? {
          ...s,
          ...patch,
          status,
          startedAt: status === "running" ? now() : s.startedAt,
          finishedAt:
            status === "completed" || status === "failed" || status === "skipped"
              ? now()
              : s.finishedAt,
        }
      : s
  );
}

function toResult(state: S): PipelineResult {
  return {
    jobId: state.jobId,
    status: state.status,
    steps: state.steps,
    extracted: state.extracted,
    references: state.references,
    gaps: state.gaps,
    refined: state.refined,
    approved: state.approved,
    drawioXml: state.drawioXml,
    mermaid: state.mermaid,
    error: state.error,
    engine: "langgraph",
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

/** Module-level checkpointer so HITL resume works across API requests. */
const checkpointer = new MemorySaver();
let corpusReady: Promise<void> | null = null;

function buildGraph(getStore: () => Promise<VectorStore>, vision: VisionExtractorOptions) {
  const extractNode = async (state: S): Promise<Partial<S>> => {
    let steps = mark(state.steps, "extract", "running");
    try {
      const extracted = await extractArchitectureFromImage(state.request, vision);
      const modelCheck = validateArchitectureModel(extracted);
      steps = mark(steps, "extract", "completed", {
        detail: {
          componentCount: extracted.components.length,
          modelOk: modelCheck.ok,
          modelIssues: modelCheck.issues,
        },
      });
      if (!modelCheck.ok) {
        throw new Error(`Invalid extracted model: ${modelCheck.issues.join("; ")}`);
      }
      return { steps, extracted, updatedAt: now(), status: "running" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps = mark(steps, "extract", "failed", { message });
      return { steps, error: message, status: "failed", updatedAt: now() };
    }
  };

  const retrieveNode = async (state: S): Promise<Partial<S>> => {
    if (state.status === "failed" || !state.extracted) return {};
    let steps = mark(state.steps, "retrieve", "running");
    try {
      const store = await getStore();
      const query = [
        state.extracted.title,
        state.extracted.summary,
        ...state.extracted.components.map((c) => c.officialName ?? c.label),
        ...state.extracted.zones.map((z) => z.label),
      ].join(" ");
      const references = await store.search(query, 3);
      steps = mark(steps, "retrieve", "completed", {
        detail: references.map((r) => ({
          id: r.ref.id,
          title: r.ref.title,
          score: Number(r.score.toFixed(4)),
        })),
      });
      return { steps, references, updatedAt: now() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps = mark(steps, "retrieve", "failed", { message });
      return { steps, error: message, status: "failed", updatedAt: now() };
    }
  };

  const gapsNode = async (state: S): Promise<Partial<S>> => {
    if (state.status === "failed" || !state.extracted) return {};
    let steps = mark(state.steps, "gaps", "running");
    try {
      const gaps = analyzeGaps(
        state.extracted,
        (state.references ?? []).map((r) => r.ref)
      );
      steps = mark(steps, "gaps", "completed", {
        detail: { count: gaps.length, high: gaps.filter((g) => g.severity === "high").length },
      });
      return { steps, gaps, updatedAt: now() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps = mark(steps, "gaps", "failed", { message });
      return { steps, error: message, status: "failed", updatedAt: now() };
    }
  };

  const refineNode = async (state: S): Promise<Partial<S>> => {
    if (state.status === "failed" || !state.extracted) return {};
    let steps = mark(state.steps, "refine", "running");
    try {
      const refined = refineArchitecture(
        state.extracted,
        state.gaps ?? [],
        state.references?.[0]?.ref
      );
      steps = mark(steps, "refine", "completed");
      return { steps, refined, updatedAt: now() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps = mark(steps, "refine", "failed", { message });
      return { steps, error: message, status: "failed", updatedAt: now() };
    }
  };

  const humanReviewNode = async (state: S): Promise<Partial<S>> => {
    if (state.status === "failed" || !state.refined) return {};

    if (!state.requireHumanReview) {
      const steps = mark(state.steps, "human_review", "skipped", {
        message: "Auto-approved (requireHumanReview=false)",
      });
      return {
        steps,
        approved: state.refined,
        status: "running",
        updatedAt: now(),
      };
    }

    // Signal waiting; interrupt payload is shown to the architect
    const stepsWaiting = mark(state.steps, "human_review", "waiting", {
      message: "Awaiting architect approval",
    });

    const resumed = interrupt({
      type: "human_review",
      jobId: state.jobId,
      refined: state.refined,
      gaps: state.gaps ?? [],
      references: (state.references ?? []).map((r) => ({
        id: r.ref.id,
        title: r.ref.title,
        score: r.score,
      })),
    }) as ArchitectureModel | { approved: ArchitectureModel };

    const approved =
      resumed && typeof resumed === "object" && "approved" in resumed
        ? resumed.approved
        : (resumed as ArchitectureModel);

    const steps = mark(stepsWaiting, "human_review", "completed", {
      message: "Architect approved",
    });

    return {
      steps,
      approved,
      refined: approved,
      // the architect may have edited the model in the review, so the views it was
      // approved with are no longer the views it should ship with
      mermaid: buildMermaidViews(approved),
      // ...and neither are the findings. The review gate is where a name gets fixed —
      // or newly invented — so the gaps must describe what was approved, not what was
      // proposed. Without this the panel reports the pre-edit model and the diagram
      // ships with an unflagged defect.
      gaps: analyzeGaps(approved, (state.references ?? []).map((r) => r.ref)),
      status: "running",
      updatedAt: now(),
    };
  };

  /**
   * Mermaid runs *before* the review gate, so the architect approves a picture rather
   * than a JSON blob — the whole point of pausing. It is re-run on the approved model
   * in `humanReviewNode`, because the review is where the model gets edited.
   *
   * It also never fails the job: a text diagram the team can paste into a pull request
   * is worth having even when the .drawio render is the thing that broke.
   */
  const mermaidNode = async (state: S): Promise<Partial<S>> => {
    if (state.status === "failed") return {};
    const model = state.approved ?? state.refined;
    if (!model) return {};
    let steps = mark(state.steps, "mermaid", "running");
    try {
      const mermaid = buildMermaidViews(model);
      const bad = mermaid.filter((v) => !v.ok);
      steps = mark(steps, "mermaid", "completed", {
        detail: { views: mermaid.length, invalid: bad.map((v) => ({ id: v.id, issues: v.issues })) },
      });
      return { steps, mermaid, updatedAt: now() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps = mark(steps, "mermaid", "skipped", { message });
      return { steps, updatedAt: now() };
    }
  };

  const generateNode = async (state: S): Promise<Partial<S>> => {
    if (state.status === "failed") return {};
    const model = state.approved ?? state.refined;
    if (!model) return {};
    let steps = mark(state.steps, "generate", "running");
    try {
      const drawioXml = generateDrawioXml(model);
      steps = mark(steps, "generate", "completed");
      return { steps, drawioXml, updatedAt: now() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps = mark(steps, "generate", "failed", { message });
      return { steps, error: message, status: "failed", updatedAt: now() };
    }
  };

  const validateNode = async (state: S): Promise<Partial<S>> => {
    if (state.status === "failed" || !state.drawioXml) return {};
    let steps = mark(state.steps, "validate", "running");
    try {
      const v = validateDiagram(state.drawioXml);
      steps = mark(steps, "validate", "completed", { detail: v });
      if (!v.ok) {
        throw new Error(`Draw.io validation failed: ${v.issues.map((i) => i.message).join("; ")}`);
      }
      return { steps, status: "completed", updatedAt: now() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps = mark(steps, "validate", "failed", { message });
      return { steps, error: message, status: "failed", updatedAt: now() };
    }
  };

  // Node names must not collide with state channel keys (extracted, gaps, refined, …)
  return new StateGraph(GraphState)
    .addNode("node_extract", extractNode)
    .addNode("node_retrieve", retrieveNode)
    .addNode("node_gap_analysis", gapsNode)
    .addNode("node_refine", refineNode)
    .addNode("node_human_review", humanReviewNode)
    .addNode("node_mermaid", mermaidNode)
    .addNode("node_generate", generateNode)
    .addNode("node_validate", validateNode)
    .addEdge(START, "node_extract")
    .addEdge("node_extract", "node_retrieve")
    .addEdge("node_retrieve", "node_gap_analysis")
    .addEdge("node_gap_analysis", "node_refine")
    .addEdge("node_refine", "node_mermaid")
    .addEdge("node_mermaid", "node_human_review")
    .addEdge("node_human_review", "node_generate")
    .addEdge("node_generate", "node_validate")
    .addEdge("node_validate", END)
    .compile({ checkpointer });
}

function getCompiled(options: GraphRuntimeOptions) {
  // Rebuild if vision options change is rare; compile once with closed-over vision via factory each run is safer
  const vision: VisionExtractorOptions = {
    provider: options.provider,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
  };

  const getStore = async () => {
    if (options.vectorStore) return options.vectorStore;
    if (options.ensureCorpus !== false) {
      corpusReady ??= loadCorpusIntoStore().then(() => undefined);
      await corpusReady;
    }
    return getVectorStore();
  };

  // Always build fresh graph with current vision options (checkpointer is shared)
  return buildGraph(getStore, vision);
}

function hasInterrupt(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.__interrupt__) && r.__interrupt__.length > 0) return true;
  // some versions nest under values
  return false;
}

export async function runLangGraphPipeline(
  req: ExtractVisionRequest,
  options: GraphRuntimeOptions = {}
): Promise<PipelineResult> {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = now();
  const requireHumanReview = options.requireHumanReview ?? true;
  const graph = getCompiled(options);

  const input: S = {
    jobId,
    request: req,
    requireHumanReview,
    steps: baseSteps(),
    extracted: undefined,
    references: undefined,
    gaps: undefined,
    refined: undefined,
    approved: undefined,
    drawioXml: undefined,
    mermaid: undefined,
    error: undefined,
    status: "running",
    createdAt,
    updatedAt: createdAt,
  };

  const config = { configurable: { thread_id: jobId } };
  const raw = await graph.invoke(input, config);

  const state = raw as S;
  const interrupted =
    hasInterrupt(raw) ||
    (requireHumanReview &&
      state.status !== "failed" &&
      state.status !== "completed" &&
      Boolean(state.refined) &&
      !state.drawioXml);

  // When interrupted, state is checkpointed; surface awaiting_review to the API/UI
  if (interrupted) {
    let steps = state.steps;
    if (!steps.some((s) => s.id === "human_review" && s.status === "waiting")) {
      steps = mark(steps, "human_review", "waiting", {
        message: "Awaiting architect approval",
      });
    }
    const result: PipelineResult = {
      ...toResult({ ...state, steps, status: "awaiting_review", updatedAt: now() }),
      status: "awaiting_review",
    };
    options.onStep?.(result.steps, result);
    return result;
  }

  const result = toResult(raw as S);
  options.onStep?.(result.steps, result);
  return result;
}

/**
 * Finish a job whose checkpoint is gone (process restart, or another BTP instance owns it).
 * The approved model is everything generation needs — the checkpoint only held history,
 * which the CAP layer already persists.
 */
async function generateFromApprovedModel(
  jobId: string,
  model: ArchitectureModel,
  options: GraphRuntimeOptions
): Promise<PipelineResult> {
  const createdAt = now();
  let steps = baseSteps().map((s) =>
    s.id === "generate" || s.id === "validate" || s.id === "mermaid" || s.id === "gaps"
      ? s
      : {
          ...s,
          status: (s.id === "human_review" ? "completed" : "skipped") as PipelineStepStatus["status"],
          message:
            s.id === "human_review" ? "Architect approved" : "Restored from persisted job",
          finishedAt: now(),
        }
  );

  const result: PipelineResult = {
    jobId,
    status: "running",
    engine: "langgraph",
    steps,
    refined: model,
    approved: model,
    createdAt,
    updatedAt: createdAt,
  };

  try {
    const check = validateArchitectureModel(model);
    if (!check.ok) throw new Error(`Invalid model: ${check.issues.join("; ")}`);

    // same contract as the graph path: what ships is what was checked
    result.gaps = analyzeGaps(model, []);
    steps = mark(steps, "gaps", "completed", {
      message: "Re-checked on the approved model",
      detail: { count: result.gaps.length, high: result.gaps.filter((g) => g.severity === "high").length },
    });

    result.mermaid = buildMermaidViews(model);
    steps = mark(steps, "mermaid", "completed", { detail: { views: result.mermaid.length } });

    result.drawioXml = generateDrawioXml(model);
    steps = mark(steps, "generate", "completed");

    const v = validateDiagram(result.drawioXml);
    steps = mark(steps, "validate", "completed", { detail: v });
    if (!v.ok) {
      throw new Error(`Draw.io validation failed: ${v.issues.map((i) => i.message).join("; ")}`);
    }
    result.status = "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps = mark(steps, result.drawioXml ? "validate" : "generate", "failed", { message });
    result.status = "failed";
    result.error = message;
  }

  result.steps = steps;
  result.updatedAt = now();
  options.onStep?.(steps, result);
  return result;
}

export async function resumeLangGraphPipeline(
  jobId: string,
  approvedModel: ArchitectureModel,
  options: GraphRuntimeOptions = {}
): Promise<PipelineResult> {
  const graph = getCompiled(options);
  const config = { configurable: { thread_id: jobId } };

  // ponytail: MemorySaver dies with the process and isn't shared across instances.
  // Swap in a persistent checkpointer only if resume needs the full graph history back.
  const snapshot = await graph.getState(config).catch(() => undefined);
  if (!snapshot?.next?.length) {
    return generateFromApprovedModel(jobId, approvedModel, options);
  }

  const raw = await graph.invoke(new Command({ resume: approvedModel }), config);
  const result = toResult(raw as S);
  // If somehow still interrupted, surface that
  if (hasInterrupt(raw)) {
    result.status = "awaiting_review";
  }
  options.onStep?.(result.steps, result);
  return result;
}

export function getCheckpointer() {
  return checkpointer;
}
