/**
 * CAP custom server — primary backend entry.
 * - OData V4 ArchitectService at /odata/v4/architect
 * - REST facade at /api/* for the React studio (same CAP service + auth context)
 */
const cds = require("@sap/cds");
const cors = require("cors");
const express = require("express");

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

cds.on("bootstrap", (app) => {
  app.use(
    cors({
      origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "16mb" }));
});

cds.on("served", () => {
  const app = cds.app;
  const Architect = cds.services.ArchitectService;

  if (!Architect) {
    console.warn("[cap] ArchitectService not found — REST facade disabled");
    return;
  }

  /** Run service action as Architect (mocked/XSUAA roles). */
  async function asArchitect(fn) {
    const user = new cds.User({
      id: "architect",
      roles: ["Architect", "Viewer", "authenticated-user"],
      attr: {},
    });
    return Architect.tx({ user }, async (tx) => fn(tx));
  }

  function httpStatus(result) {
    if (!result) return 500;
    if (result.status === "failed") return 422;
    if (result.status === "awaiting_review") return 202;
    return 200;
  }

  function sendUi(res, jobResult) {
    const ui = Architect.toUiPipelineResult(jobResult);
    res.status(httpStatus(ui)).json(ui);
  }

  // ── REST facade (React studio) ──────────────────────────────────────────

  app.get("/api/health", async (_req, res) => {
    try {
      const info = await asArchitect((tx) => tx.send("health"));
      res.json(info);
    } catch (e) {
      res.status(500).json({ ok: false, backend: "cap", error: e.message });
    }
  });

  app.get("/api/references", async (_req, res) => {
    try {
      const { SELECT } = cds.ql;
      const rows = await asArchitect((tx) =>
        tx.run(SELECT.from(Architect.entities.ReferenceArchitectures))
      );
      res.json({
        store: "cap",
        items: (rows || []).map((r) => ({
          id: r.id,
          title: r.title,
          summary: r.summary,
          tags: safeJson(r.tags, []),
          products: safeJson(r.products, []),
          corpus: r.corpus,
          sourceUrl: r.sourceUrl,
          source: r.source,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/demo", async (req, res) => {
    try {
      const jobResult = await asArchitect((tx) =>
        tx.send("runDemo", {
          hints: req.body?.hints || "agentic joule custom agents",
          fileName: req.body?.fileName || "whiteboard-agentic.png",
          autoApprove: Boolean(req.body?.autoApprove),
        })
      );
      sendUi(res, jobResult);
    } catch (e) {
      console.error("[cap/api/demo]", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/pipeline", async (req, res) => {
    try {
      const body = req.body || {};
      const jobResult = await asArchitect((tx) =>
        tx.send("runPipeline", {
          hints: body.hints,
          fileName: body.fileName || "upload.png",
          imageBase64: body.imageBase64 || "",
          mimeType: body.mimeType || "image/png",
          autoApprove: body.autoApprove === true || body.autoApprove === "true",
        })
      );
      sendUi(res, jobResult);
    } catch (e) {
      console.error("[cap/api/pipeline]", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const jobResult = await asArchitect((tx) =>
        tx.send("getJob", { jobId: req.params.id })
      );
      sendUi(res, jobResult);
    } catch (e) {
      const code = /not found/i.test(e.message) ? 404 : 500;
      res.status(code).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/jobs/:id/approve", async (req, res) => {
    try {
      const model = req.body?.model ?? req.body;
      if (!model?.id || !model?.components) {
        res.status(400).json({ error: "Body must be an ArchitectureModel (or { model })" });
        return;
      }
      const jobResult = await asArchitect((tx) =>
        tx.send("approvePipeline", {
          jobId: req.params.id,
          modelJson: JSON.stringify(model),
        })
      );
      sendUi(res, jobResult);
    } catch (e) {
      console.error("[cap/api/approve]", e);
      res.status(400).json({ error: e.message || String(e) });
    }
  });

  app.get("/api/jobs/:id/drawio", async (req, res) => {
    try {
      const jobResult = await asArchitect((tx) =>
        tx.send("getJob", { jobId: req.params.id })
      );
      if (!jobResult?.drawioXml) {
        res.status(404).json({ error: "Diagram not ready" });
        return;
      }
      const name = `${(jobResult.title || jobResult.jobId).replace(/[^\w.-]+/g, "-")}.drawio`;
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.send(jobResult.drawioXml);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/corpus/seed", async (req, res) => {
    try {
      const out = await asArchitect((tx) =>
        tx.send("seedCorpus", { discover: Boolean(req.body?.discover) })
      );
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  console.log("[cap] REST facade ready at /api/* (UI backend)");
  console.log("[cap] OData V4 at /odata/v4/architect");
});

function safeJson(value, fallback) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = cds.server;
