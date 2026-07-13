/**
 * CAP service implementation — wires XSUAA-protected actions to @sap-architect/core.
 *
 * Local: `cds watch` with mocked users (architect/architect).
 * BTP:   bind XSUAA + (optional) HANA / Object Store; set DATABASE_URL for pgvector.
 */
const cds = require("@sap/cds");

async function loadCore() {
  // ESM package — dynamic import from CAP CJS handler
  return import("@sap-architect/core");
}

module.exports = class ArchitectService extends cds.ApplicationService {
  async init() {
    const core = await loadCore();

    // Bootstrap corpus once per process
    try {
      await core.loadCorpusIntoStore();
    } catch (e) {
      console.warn("[cap] corpus seed:", e.message);
    }

    this.on("runPipeline", async (req) => {
      const {
        hints,
        fileName,
        imageBase64 = "",
        mimeType = "image/png",
        autoApprove = false,
      } = req.data;

      const result = await core.runArchitecturePipeline(
        {
          imageBase64: imageBase64 || "",
          mimeType: mimeType || "image/png",
          fileName: fileName || "upload.png",
          hints: hints || undefined,
        },
        {
          provider: process.env.LLM_PROVIDER || "mock",
          apiKey: process.env.OPENAI_API_KEY,
          baseUrl: process.env.OPENAI_BASE_URL,
          model: process.env.OPENAI_MODEL,
          engine: "langgraph",
          requireHumanReview: !autoApprove,
        }
      );

      await this._persistJob(result, { hints, fileName });

      return this._toJobResult(result);
    });

    this.on("approvePipeline", async (req) => {
      const { jobId, modelJson } = req.data;
      if (!jobId || !modelJson) {
        return req.error(400, "jobId and modelJson are required");
      }

      let model;
      try {
        model = JSON.parse(modelJson);
      } catch {
        return req.error(400, "modelJson must be valid JSON ArchitectureModel");
      }

      const check = core.validateArchitectureModel(model);
      if (!check.ok) {
        return req.error(400, `Invalid model: ${check.issues.join("; ")}`);
      }

      const result = await core.resumeArchitecturePipeline(jobId, model, {
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
      const r = await core.loadCorpusIntoStore({ discover });

      // also mirror into CAP SQLite for OData browse
      const { ReferenceArchitectures } = this.entities;
      const store = await core.getVectorStore();
      const list = await store.list();
      for (const ref of list) {
        const row = {
          id: ref.id,
          title: ref.title,
          summary: ref.summary,
          tags: JSON.stringify(ref.tags),
          products: JSON.stringify(ref.products),
          corpus: ref.corpus,
          sourceUrl: ref.sourceUrl,
          source: ref.source,
        };
        const found = await SELECT.one.from(ReferenceArchitectures).where({ id: ref.id });
        if (found) await UPDATE(ReferenceArchitectures).set(row).where({ id: ref.id });
        else await INSERT.into(ReferenceArchitectures).entries(row);
      }

      return {
        count: r.count,
        storeKind: r.storeKind,
        idsJson: JSON.stringify(r.ids),
      };
    });

    return super.init();
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
      gapsJson: JSON.stringify(result.gaps || []),
      drawioXml: result.drawioXml || "",
      error: result.error || "",
    };
  }

  async _persistJob(result, meta) {
    try {
      const { Jobs } = this.entities;
      const model = result.approved || result.refined || result.extracted;
      const existing = await SELECT.one.from(Jobs).where({ externalId: result.jobId });
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
        gapsJson: result.gaps ? JSON.stringify(result.gaps) : "",
        drawioXml: result.drawioXml || "",
        error: result.error || "",
      };
      if (existing) {
        await UPDATE(Jobs).set(row).where({ ID: existing.ID });
      } else {
        await INSERT.into(Jobs).entries(row);
      }
    } catch (e) {
      console.warn("[cap] persist job failed:", e.message);
    }
  }
};
