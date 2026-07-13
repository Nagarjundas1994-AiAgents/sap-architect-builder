import { generateDrawioXml } from "@sap-architect/drawio";
import type {
  ArchitectureModel,
  ExtractVisionRequest,
  PipelineResult,
  PipelineStepStatus,
} from "@sap-architect/shared";
import { analyzeGaps } from "./agents/gaps.js";
import { refineArchitecture } from "./agents/refine.js";
import { validateArchitectureModel, validateDiagram } from "./agents/validate.js";
import { loadCorpusIntoStore } from "./corpus/loader.js";
import {
  runLangGraphPipeline,
  resumeLangGraphPipeline,
  type GraphRuntimeOptions,
} from "./graph/architecture-graph.js";
import { getVectorStore } from "./vector/index.js";
import {
  extractArchitectureFromImage,
  type VisionExtractorOptions,
} from "./vision/extract.js";

export interface PipelineOptions extends VisionExtractorOptions {
  onStep?: (steps: PipelineStepStatus[], result: PipelineResult) => void;
  /**
   * Orchestration engine. Default: langgraph.
   * sequential keeps the original linear path (no checkpoint / HITL).
   */
  engine?: "langgraph" | "sequential";
  /** When using langgraph, pause for human review before Draw.io generation (default true). */
  requireHumanReview?: boolean;
  /** Skip corpus bootstrap (tests). Default false. */
  skipCorpusLoad?: boolean;
  autoApproveModel?: ArchitectureModel;
}

function now() {
  return new Date().toISOString();
}

function step(
  id: string,
  name: string,
  status: PipelineStepStatus["status"] = "pending"
): PipelineStepStatus {
  return { id, name, status };
}

/** Sequential fallback (no LangGraph / no HITL interrupt). */
async function runSequentialPipeline(
  req: ExtractVisionRequest,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result: PipelineResult = {
    jobId,
    status: "running",
    engine: "sequential",
    steps: [
      step("extract", "Vision extraction"),
      step("retrieve", "Reference architecture search"),
      step("gaps", "Gap analysis"),
      step("refine", "Architecture refinement"),
      step("human_review", "Human review"),
      step("generate", "Draw.io XML generation"),
      step("validate", "Validation"),
    ],
    createdAt: now(),
    updatedAt: now(),
  };

  const emit = () => {
    result.updatedAt = now();
    options.onStep?.(result.steps, result);
  };

  const run = async (id: string, fn: () => Promise<void> | void) => {
    const s = result.steps.find((x) => x.id === id)!;
    s.status = "running";
    s.startedAt = now();
    emit();
    try {
      await fn();
      s.status = "completed";
      s.finishedAt = now();
      emit();
    } catch (err) {
      s.status = "failed";
      s.finishedAt = now();
      s.message = err instanceof Error ? err.message : String(err);
      result.status = "failed";
      result.error = s.message;
      emit();
      throw err;
    }
  };

  try {
    if (!options.skipCorpusLoad) {
      await loadCorpusIntoStore();
    }

    await run("extract", async () => {
      result.extracted = await extractArchitectureFromImage(req, options);
      const modelCheck = validateArchitectureModel(result.extracted);
      result.steps.find((s) => s.id === "extract")!.detail = {
        componentCount: result.extracted.components.length,
        modelOk: modelCheck.ok,
        modelIssues: modelCheck.issues,
      };
      if (!modelCheck.ok) {
        throw new Error(`Invalid extracted model: ${modelCheck.issues.join("; ")}`);
      }
    });

    await run("retrieve", async () => {
      const store = await getVectorStore();
      const query = [
        result.extracted!.title,
        result.extracted!.summary,
        ...result.extracted!.components.map((c) => c.officialName ?? c.label),
      ].join(" ");
      result.references = await store.search(query, 3);
      result.steps.find((s) => s.id === "retrieve")!.detail = result.references.map((r) => ({
        id: r.ref.id,
        title: r.ref.title,
        score: Number(r.score.toFixed(4)),
      }));
    });

    await run("gaps", () => {
      result.gaps = analyzeGaps(
        result.extracted!,
        (result.references ?? []).map((r) => r.ref)
      );
      result.steps.find((s) => s.id === "gaps")!.detail = {
        count: result.gaps.length,
        high: result.gaps.filter((g) => g.severity === "high").length,
      };
    });

    await run("refine", () => {
      result.refined = refineArchitecture(
        result.extracted!,
        result.gaps ?? [],
        result.references?.[0]?.ref
      );
    });

    // sequential mode: auto-approve or use provided model
    await run("human_review", () => {
      result.approved = options.autoApproveModel ?? result.refined;
      result.refined = result.approved;
    });

    await run("generate", () => {
      result.drawioXml = generateDrawioXml(result.approved ?? result.refined!);
    });

    await run("validate", () => {
      const v = validateDiagram(result.drawioXml!);
      result.steps.find((s) => s.id === "validate")!.detail = v;
      if (!v.ok) {
        throw new Error(
          `Draw.io validation failed: ${v.issues.map((i) => i.message).join("; ")}`
        );
      }
    });

    result.status = "completed";
    emit();
    return result;
  } catch {
    return result;
  }
}

/**
 * Primary entry: LangGraph multi-agent graph with optional human-in-the-loop.
 * Set `engine: "sequential"` for the linear path without checkpoints.
 */
export async function runArchitecturePipeline(
  req: ExtractVisionRequest,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const engine = options.engine ?? "langgraph";

  if (engine === "sequential") {
    return runSequentialPipeline(req, options);
  }

  const graphOpts: GraphRuntimeOptions = {
    provider: options.provider,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    requireHumanReview: options.requireHumanReview,
    onStep: options.onStep,
    ensureCorpus: !options.skipCorpusLoad,
  };

  // If caller supplies autoApproveModel, skip interrupt
  if (options.autoApproveModel) {
    graphOpts.requireHumanReview = false;
  }
  // CLI convenience: requireHumanReview explicitly false
  if (options.requireHumanReview === false) {
    graphOpts.requireHumanReview = false;
  }

  const result = await runLangGraphPipeline(req, graphOpts);

  // If autoApproveModel was set but graph still needs approve (shouldn't), force sequential generate
  if (result.status === "awaiting_review" && options.autoApproveModel) {
    return resumeArchitecturePipeline(result.jobId, options.autoApproveModel, options);
  }

  return result;
}

/** Resume a LangGraph job paused at human review. */
export async function resumeArchitecturePipeline(
  jobId: string,
  approvedModel: ArchitectureModel,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  return resumeLangGraphPipeline(jobId, approvedModel, {
    provider: options.provider,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    onStep: options.onStep,
    ensureCorpus: !options.skipCorpusLoad,
  });
}
