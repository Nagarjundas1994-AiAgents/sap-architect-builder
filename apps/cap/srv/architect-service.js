/**
 * CAP ApplicationService — primary backend for Architect Builder.
 * Wires XSUAA-protected actions to @sap-architect/core (LangGraph pipeline).
 *
 * Local:  npm run dev:cap  →  http://localhost:4004
 * BTP:    bind XSUAA (+ optional HANA / Object Store / Generative AI Hub)
 */
const cds = require("@sap/cds");

async function loadCore() {
  return import("@sap-architect/core");
}

module.exports = class ArchitectService extends cds.ApplicationService {
  async init() {
    this.core = await loadCore();

    try {
      await this.core.loadCorpusIntoStore();
      console.log("[cap] Architecture Center corpus loaded");
    } catch (e) {
      console.warn("[cap] corpus seed:", e.message);
    }

    this.on("health", async () => this._health());

    this.on("getJob", async (req) => {
      const jobId = req.data?.jobId;
      if (!jobId) return req.error(400, "jobId is required");
      const db = await this._db();
      const row = await db.run(SELECT.one.from(this.entities.Jobs).where({ externalId: jobId }));
      if (!row) return req.error(404, "Job not found");
      return this._rowToJobResult(row);
    });

    this.on("runPipeline", async (req) => {
      const {
        hints,
        fileName,
        imageBase64 = "",
        mimeType = "image/png",
        autoApprove = false,
      } = req.data || {};

      return this._runPipeline(
        {
          imageBase64: imageBase64 || "",
          mimeType: mimeType || "image/png",
          fileName: fileName || "upload.png",
          hints: hints || undefined,
        },
        { autoApprove: Boolean(autoApprove), meta: { hints, fileName } }
      );
    });

    this.on("runDemo", async (req) => {
      const {
        hints = "agentic joule custom agents",
        fileName = "whiteboard-agentic.png",
        autoApprove = false,
      } = req.data || {};

      return this._runPipeline(
        {
          imageBase64: "",
          mimeType: "image/png",
          fileName,
          hints: hints || undefined,
        },
        {
          autoApprove: Boolean(autoApprove),
          provider: "mock",
          meta: { hints, fileName },
        }
      );
    });

    this.on("approvePipeline", async (req) => {
      const { jobId, modelJson } = req.data || {};
      if (!jobId || !modelJson) {
        return req.error(400, "jobId and modelJson are required");
      }

      let model;
      try {
        model = typeof modelJson === "string" ? JSON.parse(modelJson) : modelJson;
      } catch {
        return req.error(400, "modelJson must be valid JSON ArchitectureModel");
      }

      const check = this.core.validateArchitectureModel(model);
      if (!check.ok) {
        return req.error(400, `Invalid model: ${check.issues.join("; ")}`);
      }

      const result = await this.core.resumeArchitecturePipeline(jobId, model, {
        provider: process.env.LLM_PROVIDER || "mock",
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_MODEL,
      });

      await this._persistJob(result, {});
      return this._toJobResult(result);
    });

    this.on("seedCorpus", async (req) => {
      const discover = Boolean(req.data?.discover);
      const r = await this.core.loadCorpusIntoStore({ discover });
      await this._mirrorReferences();
      return {
        count: r.count,
        storeKind: r.storeKind,
        idsJson: JSON.stringify(r.ids),
      };
    });

    await super.init();

    // Seed CAP SQLite after service + DB are fully ready
    setImmediate(() => {
      this._mirrorReferences()
        .then(() => console.log("[cap] Reference architectures mirrored to SQLite"))
        .catch((e) => console.warn("[cap] reference mirror:", e.message));
    });

    return this;
  }

  /** Queries run outside a db tx (REST facade uses a service tx), so bind explicitly. */
  async _db() {
    return cds.db || cds.connect.to("db");
  }

  async _runPipeline(extractReq, { autoApprove = false, provider, meta = {} } = {}) {
    const result = await this.core.runArchitecturePipeline(extractReq, {
      provider: provider || process.env.LLM_PROVIDER || "mock",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
      engine: process.env.PIPELINE_ENGINE || "langgraph",
      requireHumanReview: !autoApprove && process.env.REQUIRE_HUMAN_REVIEW !== "false",
    });

    await this._persistJob(result, meta);
    return this._toJobResult(result);
  }

  async _health() {
    let vectorKind = "unknown";
    let vectorCount = 0;
    try {
      const store = await this.core.getVectorStore();
      vectorKind = store.kind;
      vectorCount = await store.count();
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      backend: "cap",
      service: "ArchitectService",
      provider: process.env.LLM_PROVIDER || "mock",
      engine: process.env.PIPELINE_ENGINE || "langgraph",
      requireHumanReview: process.env.REQUIRE_HUMAN_REVIEW !== "false",
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      vectorKind,
      vectorCount,
    };
  }

  _toJobResult(result) {
    const model = result.approved || result.refined || result.extracted;
    return {
      jobId: result.jobId,
      status: result.status,
      engine: result.engine || "langgraph",
      title: model?.title || "",
      stepsJson: JSON.stringify(result.steps || []),
      modelJson: model ? JSON.stringify(model) : "",
      extractedJson: result.extracted ? JSON.stringify(result.extracted) : "",
      refinedJson: result.refined ? JSON.stringify(result.refined) : "",
      approvedJson: result.approved ? JSON.stringify(result.approved) : "",
      referencesJson: result.references ? JSON.stringify(result.references) : "[]",
      gapsJson: JSON.stringify(result.gaps || []),
      resultJson: JSON.stringify(result),
      drawioXml: result.drawioXml || "",
      error: result.error || "",
      createdAt: result.createdAt || new Date().toISOString(),
      updatedAt: result.updatedAt || new Date().toISOString(),
    };
  }

  _rowToJobResult(row) {
    if (row.resultJson) {
      try {
        const full = JSON.parse(row.resultJson);
        return this._toJobResult(full);
      } catch {
        /* fall through */
      }
    }
    return {
      jobId: row.externalId,
      status: row.status,
      engine: row.engine || "langgraph",
      title: row.title || "",
      stepsJson: row.stepsJson || "[]",
      modelJson: row.approvedJson || row.refinedJson || row.extractedJson || "",
      extractedJson: row.extractedJson || "",
      refinedJson: row.refinedJson || "",
      approvedJson: row.approvedJson || "",
      referencesJson: row.referencesJson || "[]",
      gapsJson: row.gapsJson || "[]",
      resultJson: row.resultJson || "",
      drawioXml: row.drawioXml || "",
      error: row.error || "",
      createdAt: row.createdAt || "",
      updatedAt: row.modifiedAt || row.updatedAt || "",
    };
  }

  /** Expand CAP JobResult into the PipelineResult shape the React UI expects. */
  toUiPipelineResult(jobResult) {
    if (jobResult?.resultJson) {
      try {
        return JSON.parse(jobResult.resultJson);
      } catch {
        /* rebuild */
      }
    }
    const parse = (s, fallback) => {
      if (!s) return fallback;
      try {
        return JSON.parse(s);
      } catch {
        return fallback;
      }
    };
    return {
      jobId: jobResult.jobId,
      status: jobResult.status,
      engine: jobResult.engine,
      steps: parse(jobResult.stepsJson, []),
      extracted: parse(jobResult.extractedJson, undefined),
      refined: parse(jobResult.refinedJson, undefined),
      approved: parse(jobResult.approvedJson, undefined),
      references: parse(jobResult.referencesJson, []),
      gaps: parse(jobResult.gapsJson, []),
      drawioXml: jobResult.drawioXml || undefined,
      error: jobResult.error || undefined,
      createdAt: jobResult.createdAt,
      updatedAt: jobResult.updatedAt,
    };
  }

  async _persistJob(result, meta) {
    try {
      const { Jobs } = this.entities;
      const model = result.approved || result.refined || result.extracted;
      const row = {
        externalId: result.jobId,
        status: result.status,
        engine: result.engine || "langgraph",
        title: model?.title || "",
        sourceFileName: meta.fileName || model?.sourceImageName || "",
        hints: meta.hints || "",
        extractedJson: result.extracted ? JSON.stringify(result.extracted) : "",
        refinedJson: result.refined ? JSON.stringify(result.refined) : "",
        approvedJson: result.approved ? JSON.stringify(result.approved) : "",
        referencesJson: result.references ? JSON.stringify(result.references) : "[]",
        stepsJson: JSON.stringify(result.steps || []),
        gapsJson: result.gaps ? JSON.stringify(result.gaps) : "[]",
        resultJson: JSON.stringify(result),
        drawioXml: result.drawioXml || "",
        error: result.error || "",
      };

      const db = await this._db();
      const existing = await db.run(SELECT.one.from(Jobs).where({ externalId: result.jobId }));
      if (existing) {
        await db.run(UPDATE(Jobs).set(row).where({ ID: existing.ID }));
      } else {
        await db.run(INSERT.into(Jobs).entries(row));
      }
    } catch (e) {
      console.warn("[cap] persist job failed:", e.message);
    }
  }

  async _mirrorReferences() {
    const { ReferenceArchitectures } = this.entities;
    const db = await this._db();
    const store = await this.core.getVectorStore();
    const list = await store.list();
    for (const ref of list) {
      const row = {
        id: ref.id,
        title: ref.title,
        summary: ref.summary,
        tags: JSON.stringify(ref.tags || []),
        products: JSON.stringify(ref.products || []),
        corpus: ref.corpus || "",
        sourceUrl: ref.sourceUrl || "",
        source: ref.source || "",
      };
      const found = await db.run(SELECT.one.from(ReferenceArchitectures).where({ id: ref.id }));
      if (found) await db.run(UPDATE(ReferenceArchitectures).set(row).where({ id: ref.id }));
      else await db.run(INSERT.into(ReferenceArchitectures).entries(row));
    }
  }
};
