import cors from "cors";
import express from "express";
import multer from "multer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runArchitecturePipeline,
  resumeArchitecturePipeline,
  loadCorpusIntoStore,
  getVectorStore,
  REFERENCE_ARCHITECTURES,
} from "@sap-architect/core";
import type { ArchitectureModel, PipelineResult } from "@sap-architect/shared";
import { validateArchitectureModel } from "@sap-architect/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../../..");
const uploadDir = join(__dirname, "../uploads");
const outputDir = join(__dirname, "../output");
mkdirSync(uploadDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? "mock") as "mock" | "openai";
const PIPELINE_ENGINE = (process.env.PIPELINE_ENGINE ?? "langgraph") as
  | "langgraph"
  | "sequential";
const REQUIRE_HUMAN_REVIEW = (process.env.REQUIRE_HUMAN_REVIEW ?? "true") !== "false";

const jobs = new Map<string, PipelineResult>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image uploads are supported (png, jpg, webp, gif)"));
  },
});

function persistJob(result: PipelineResult): PipelineResult {
  if (result.drawioXml) {
    const outPath = join(outputDir, `${result.jobId}.drawio`);
    writeFileSync(outPath, result.drawioXml, "utf8");
    result.drawioPath = outPath;
  }
  jobs.set(result.jobId, result);
  return result;
}

function pipelineOpts(onStep?: (s: PipelineResult["steps"], r: PipelineResult) => void) {
  return {
    provider: LLM_PROVIDER,
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
    engine: PIPELINE_ENGINE,
    requireHumanReview: REQUIRE_HUMAN_REVIEW,
    onStep,
  } as const;
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", async (_req, res) => {
  let vector: { kind: string; count: number } | undefined;
  try {
    const store = await getVectorStore();
    vector = { kind: store.kind, count: await store.count() };
  } catch {
    vector = undefined;
  }
  res.json({
    ok: true,
    service: "sap-architect-builder-api",
    provider: LLM_PROVIDER,
    engine: PIPELINE_ENGINE,
    requireHumanReview: REQUIRE_HUMAN_REVIEW,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    vector,
  });
});

app.get("/api/references", async (_req, res) => {
  try {
    const store = await getVectorStore();
    const items = await store.list();
    res.json({
      store: store.kind,
      items: items.length ? items : REFERENCE_ARCHITECTURES,
    });
  } catch {
    res.json({ store: "fallback", items: REFERENCE_ARCHITECTURES });
  }
});

app.post("/api/corpus/seed", async (req, res) => {
  try {
    const discover = Boolean(req.body?.discover);
    const result = await loadCorpusIntoStore({ discover });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (req.query.light === "1") {
    const { drawioXml: _x, ...rest } = job;
    res.json(rest);
    return;
  }
  res.json(job);
});

app.get("/api/jobs/:id/drawio", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job?.drawioXml) {
    res.status(404).json({ error: "Diagram not ready" });
    return;
  }
  const name = `${(job.approved ?? job.refined)?.title?.replace(/[^\w.-]+/g, "-") ?? job.jobId}.drawio`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(job.drawioXml);
});

/**
 * Human-in-the-loop: approve (optionally edit) ArchitectureModel and resume graph.
 * Body: { model: ArchitectureModel } or raw ArchitectureModel
 */
app.post("/api/jobs/:id/approve", async (req, res) => {
  try {
    const existing = jobs.get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (existing.status !== "awaiting_review") {
      res.status(409).json({
        error: `Job is not awaiting review (status=${existing.status})`,
      });
      return;
    }

    const model = (req.body?.model ?? req.body) as ArchitectureModel;
    if (!model?.id || !model?.components) {
      res.status(400).json({ error: "Body must be an ArchitectureModel (or { model })" });
      return;
    }

    const check = validateArchitectureModel(model);
    if (!check.ok) {
      res.status(400).json({ error: "Invalid model", issues: check.issues });
      return;
    }

    let currentId = existing.jobId;
    const result = await resumeArchitecturePipeline(existing.jobId, model, {
      ...pipelineOpts((_steps, partial) => {
        jobs.set(currentId, { ...partial });
      }),
    });

    persistJob(result);
    res.status(result.status === "failed" ? 422 : 200).json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post("/api/pipeline", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    const hints = typeof req.body?.hints === "string" ? req.body.hints : undefined;
    const fileName =
      typeof req.body?.fileName === "string"
        ? req.body.fileName
        : file?.originalname ?? "upload.png";
    const autoApprove =
      req.body?.autoApprove === "true" ||
      req.body?.autoApprove === true ||
      req.query.autoApprove === "1";

    if (!file && LLM_PROVIDER !== "mock") {
      res.status(400).json({ error: "image file is required when not in mock mode" });
      return;
    }

    if (file) {
      writeFileSync(join(uploadDir, `${Date.now()}-${file.originalname}`), file.buffer);
    }

    const imageBase64 = file ? file.buffer.toString("base64") : "";
    const mimeType = file?.mimetype ?? "image/png";

    let currentId = `pending-${Date.now()}`;
    jobs.set(currentId, {
      jobId: currentId,
      status: "queued",
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await runArchitecturePipeline(
      { imageBase64, mimeType, fileName, hints },
      {
        ...pipelineOpts((_steps, partial) => {
          if (partial.jobId !== currentId) {
            jobs.delete(currentId);
            currentId = partial.jobId;
          }
          jobs.set(currentId, { ...partial });
        }),
        requireHumanReview: autoApprove ? false : REQUIRE_HUMAN_REVIEW,
      }
    );

    jobs.delete(currentId);
    persistJob(result);

    const code =
      result.status === "failed" ? 422 : result.status === "awaiting_review" ? 202 : 200;
    res.status(code).json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/** Demo: mock vision; by default pauses for HITL unless autoApprove=true */
app.post("/api/demo", async (req, res) => {
  const hints =
    typeof req.body?.hints === "string" ? req.body.hints : "agentic joule custom agents";
  const fileName =
    typeof req.body?.fileName === "string" ? req.body.fileName : "whiteboard-agentic.png";
  const autoApprove = Boolean(req.body?.autoApprove);

  const result = await runArchitecturePipeline(
    { imageBase64: "", mimeType: "image/png", fileName, hints },
    {
      provider: "mock",
      engine: PIPELINE_ENGINE,
      requireHumanReview: autoApprove ? false : REQUIRE_HUMAN_REVIEW,
    }
  );
  persistJob(result);
  const code =
    result.status === "failed" ? 422 : result.status === "awaiting_review" ? 202 : 200;
  res.status(code).json(result);
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    res.status(400).json({ error: err.message });
  }
);

async function boot() {
  try {
    const seed = await loadCorpusIntoStore({
      discover: process.env.CORPUS_DISCOVER === "1",
    });
    console.log(`Corpus loaded: ${seed.count} refs via ${seed.storeKind}`);
  } catch (err) {
    console.warn("Corpus seed failed (continuing):", err);
  }

  app.listen(PORT, () => {
    console.log(`SAP Architect Builder API on http://localhost:${PORT}`);
    console.log(`  LLM provider: ${LLM_PROVIDER}`);
    console.log(`  Engine:       ${PIPELINE_ENGINE}`);
    console.log(`  HITL review:  ${REQUIRE_HUMAN_REVIEW}`);
    console.log(`  CORS origin:  ${CORS_ORIGIN}`);
    console.log(`  workspace:    ${rootDir}`);
  });
}

boot();
