/**
 * CAP custom server — primary backend entry.
 * - OData V4 ArchitectService at /odata/v4/architect
 * - REST facade at /api/* for the React studio (same CAP service + auth context)
 */
const path = require("node:path");
const cds = require("@sap/cds");
const cors = require("cors");
const express = require("express");

// cds runs with cwd apps/cap, so the repo-root .env holding the provider keys
// is out of reach unless we load it ourselves. Real environment wins.
try {
  process.loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch {
  /* no .env — mock provider, which is the documented default */
}

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

  // Authenticate every /api request with CAP's own strategy — XSUAA in production,
  // mocked users locally. Without this the facade bypassed the service's @requires
  // annotations entirely, because it invented its own privileged user.
  // `context` first: the auth strategies write the resolved user onto cds.context,
  // so mounting auth alone crashes on a custom route that never established one.
  app.use("/api", cds.middlewares.context(), cds.middlewares.auth());

  /**
   * Run a service call as the caller.
   *
   * The user comes from the validated request, so the @requires annotations on
   * ArchitectService decide what is allowed — the facade grants nothing of its own.
   */
  async function asCaller(req, fn) {
    const user = req.user;
    if (!user || user._is_anonymous) {
      const err = new Error("Authentication required");
      err.status = 401;
      throw err;
    }
    return Architect.tx({ user }, async (tx) => fn(tx));
  }

  /**
   * Throttle the endpoints that spend money.
   *
   * A pipeline run is several LLM calls, so an authenticated user in a loop is a
   * bill, not just load.
   *
   * ponytail: in-memory and per-instance — with more than one app instance the
   * effective limit multiplies. Move to a shared store (Redis) or an API-Management
   * policy before scaling out.
   */
  const RATE_MAX = Number(process.env.RATE_LIMIT_PER_MINUTE || 20);
  const hits = new Map();
  function rateLimit(req, res, next) {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    const window = hits.get(key)?.filter((t) => now - t < 60_000) ?? [];
    if (window.length >= RATE_MAX) {
      res.status(429).json({ error: `Rate limit exceeded (${RATE_MAX}/min)` });
      return;
    }
    window.push(now);
    hits.set(key, window);
    // the map would otherwise grow with every distinct caller
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
    next();
  }
  app.use(["/api/demo", "/api/pipeline", "/api/jobs/:id/approve", "/api/corpus/seed"], rateLimit);

  /**
   * HTTP status for a thrown error.
   *
   * CAP reports authorization failures on `code`/`statusCode` rather than `status`,
   * so reading only one of them turned every 403 into a 500 and hid the real reason.
   */
  function errStatus(e, fallback = 500) {
    for (const v of [e?.status, e?.statusCode, e?.code]) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 400 && n <= 599) return n;
    }
    return fallback;
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

  app.get("/api/health", async (req, res) => {
    try {
      const info = await asCaller(req, (tx) => tx.send("health"));
      res.json(info);
    } catch (e) {
      res.status(errStatus(e)).json({ ok: false, backend: "cap", error: e.message });
    }
  });

  app.get("/api/references", async (req, res) => {
    try {
      const { SELECT } = cds.ql;
      const rows = await asCaller(req, (tx) =>
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
      res.status(errStatus(e)).json({ error: e.message });
    }
  });

  app.post("/api/demo", async (req, res) => {
    try {
      const jobResult = await asCaller(req, (tx) =>
        tx.send("runDemo", {
          hints: req.body?.hints || "agentic joule custom agents",
          fileName: req.body?.fileName || "whiteboard-agentic.png",
          autoApprove: Boolean(req.body?.autoApprove),
          provider: req.body?.provider,
        })
      );
      sendUi(res, jobResult);
    } catch (e) {
      console.error("[cap/api/demo]", e);
      res.status(errStatus(e)).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/pipeline", async (req, res) => {
    try {
      const body = req.body || {};
      const jobResult = await asCaller(req, (tx) =>
        tx.send("runPipeline", {
          hints: body.hints,
          fileName: body.fileName || "upload.png",
          imageBase64: body.imageBase64 || "",
          mimeType: body.mimeType || "image/png",
          autoApprove: body.autoApprove === true || body.autoApprove === "true",
          provider: body.provider,
        })
      );
      sendUi(res, jobResult);
    } catch (e) {
      console.error("[cap/api/pipeline]", e);
      res.status(errStatus(e)).json({ error: e.message || String(e) });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const jobResult = await asCaller(req, (tx) =>
        tx.send("getJob", { jobId: req.params.id })
      );
      sendUi(res, jobResult);
    } catch (e) {
      res.status(errStatus(e, /not found/i.test(e.message) ? 404 : 500)).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/jobs/:id/approve", async (req, res) => {
    try {
      const model = req.body?.model ?? req.body;
      if (!model?.id || !model?.components) {
        res.status(400).json({ error: "Body must be an ArchitectureModel (or { model })" });
        return;
      }
      const jobResult = await asCaller(req, (tx) =>
        tx.send("approvePipeline", {
          jobId: req.params.id,
          modelJson: JSON.stringify(model),
        })
      );
      sendUi(res, jobResult);
    } catch (e) {
      console.error("[cap/api/approve]", e);
      res.status(errStatus(e, 400)).json({ error: e.message || String(e) });
    }
  });

  app.get("/api/jobs/:id/drawio", async (req, res) => {
    try {
      const jobResult = await asCaller(req, (tx) =>
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
      res.status(errStatus(e)).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/corpus/seed", async (req, res) => {
    try {
      const out = await asCaller(req, (tx) =>
        tx.send("seedCorpus", { discover: Boolean(req.body?.discover) })
      );
      res.json(out);
    } catch (e) {
      res.status(errStatus(e)).json({ error: e.message || String(e) });
    }
  });

  /**
   * JSON errors for /api.
   *
   * Express's default handler renders an HTML page containing the stack trace, so an
   * oversized upload replied with absolute server paths. Mounted last so it only sees
   * what the routes above did not handle.
   */
  app.use("/api", (err, _req, res, next) => {
    if (res.headersSent) return next(err);
    const status = errStatus(err, err?.type === "entity.too.large" ? 413 : 500);
    console.error("[cap/api]", err?.message || err);
    res.status(status).json({
      error:
        status === 413
          ? "Upload too large — the limit is 16 MB. Try a smaller image."
          : err?.message || "Request failed",
    });
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
