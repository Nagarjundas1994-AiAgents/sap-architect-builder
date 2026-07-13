import { useCallback, useMemo, useState } from "react";
import type { ArchitectureModel, PipelineResult } from "./types";

const DEMO_HINTS = [
  {
    label: "Agentic AI / Joule",
    hints: "agentic joule custom agents",
    desc: "Multi-agent on BTP",
  },
  {
    label: "Clean-core extension",
    hints: "clean core s4 extension",
    desc: "Side-by-side CAP",
  },
  {
    label: "Integration hub",
    hints: "integration hybrid cpi",
    desc: "Hybrid CPI landscape",
  },
];

const FLOW_PREVIEW = [
  { label: "Vision extract", tag: "GPT Vision" },
  { label: "Reference retrieve", tag: "Architecture Center" },
  { label: "Gap analysis", tag: "Best practices" },
  { label: "Human review", tag: "Architect HITL" },
  { label: "Draw.io generate", tag: "Style Contract" },
];

function stepIcon(status: string): string {
  if (status === "completed" || status === "skipped") return "✓";
  if (status === "failed") return "!";
  if (status === "running" || status === "waiting") return "…";
  return "";
}

function phaseClass(result: PipelineResult | null): {
  input: string;
  pipeline: string;
  review: string;
} {
  if (!result) return { input: "active", pipeline: "", review: "" };
  if (result.status === "awaiting_review")
    return { input: "done", pipeline: "done", review: "wait" };
  if (result.status === "completed")
    return { input: "done", pipeline: "done", review: "done" };
  if (result.status === "running" || result.status === "queued")
    return { input: "done", pipeline: "active", review: "" };
  if (result.status === "failed")
    return { input: "done", pipeline: "active", review: "" };
  return { input: "active", pipeline: "", review: "" };
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hints, setHints] = useState("agentic joule custom agents");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const onFile = useCallback(
    (f: File | null) => {
      setFile(f);
      setResult(null);
      setError(null);
      setEditJson("");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(f ? URL.createObjectURL(f) : null);
    },
    [previewUrl]
  );

  const model = result?.approved ?? result?.refined ?? result?.extracted;
  const awaiting = result?.status === "awaiting_review";
  const canDownload = Boolean(result?.drawioXml && result.status === "completed");
  const phases = phaseClass(result);

  const downloadDrawio = () => {
    if (!result?.drawioXml) return;
    const blob = new Blob([result.drawioXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(model?.title ?? "architecture").replace(/[^\w.-]+/g, "-")}.drawio`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncEditor = (data: PipelineResult) => {
    const m = data.refined ?? data.extracted;
    if (m) setEditJson(JSON.stringify(m, null, 2));
  };

  const runPipeline = async (mode: "upload" | "demo") => {
    setLoading(true);
    setError(null);
    setResult(null);
    setEditError(null);
    try {
      let res: Response;
      if (mode === "demo") {
        res = await fetch("/api/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hints,
            fileName: file?.name ?? "whiteboard-agentic.png",
            autoApprove: false,
          }),
        });
      } else {
        const fd = new FormData();
        if (file) fd.append("image", file);
        fd.append("hints", hints);
        if (file?.name) fd.append("fileName", file.name);
        res = await fetch("/api/pipeline", { method: "POST", body: fd });
      }
      const data = (await res.json()) as PipelineResult & { error?: string };
      if (!res.ok && !data.jobId) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setResult(data);
      syncEditor(data);
      if (data.status === "failed") {
        setError(data.error ?? "Pipeline failed");
      }
      document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    if (!result?.jobId) return;
    setLoading(true);
    setEditError(null);
    setError(null);
    try {
      let parsed: ArchitectureModel;
      try {
        parsed = JSON.parse(editJson) as ArchitectureModel;
      } catch {
        setEditError("Invalid JSON — fix the ArchitectureModel before approving.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/jobs/${result.jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: parsed }),
      });
      const data = (await res.json()) as PipelineResult & { error?: string; issues?: string[] };
      if (!res.ok) {
        throw new Error(
          data.error
            ? `${data.error}${data.issues ? `: ${data.issues.join("; ")}` : ""}`
            : `Approve failed (${res.status})`
        );
      }
      setResult(data);
      if (data.status === "failed") setError(data.error ?? "Pipeline failed after approve");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const steps = useMemo(() => result?.steps ?? [], [result]);

  const scrollToWorkspace = () => {
    document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="shell">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-mark">AB</div>
          <div className="nav-titles">
            <strong>SAP Architect Builder</strong>
            <span>Whiteboard → Architecture Center diagrams</span>
          </div>
        </div>
        <div className="nav-links">
          <button type="button" className="nav-link" onClick={scrollToWorkspace}>
            Workspace
          </button>
          <a
            className="nav-link"
            href="https://architecture.learning.sap.com/"
            target="_blank"
            rel="noreferrer"
          >
            Architecture Center
          </a>
          <button
            type="button"
            className="nav-link nav-cta"
            disabled={loading}
            onClick={() => {
              scrollToWorkspace();
              void runPipeline("demo");
            }}
          >
            Try demo
          </button>
        </div>
      </nav>

      {/* Hero */}
      <header className="hero">
        <div className="hero-inner">
          <div>
            <div className="hero-eyebrow">
              <span className="dot-live" />
              Prototype · LangGraph · SAP BTP ready
            </div>
            <h1>
              From whiteboard sketch to <em>editable SAP architecture</em>
            </h1>
            <p className="hero-lead">
              Multi-agent AI extracts intent from photos and notes, grounds designs in SAP
              Architecture Center references, and generates Draw.io XML you can open and edit —
              not a static picture you redraw.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={loading}
                onClick={() => {
                  scrollToWorkspace();
                  void runPipeline(file ? "upload" : "demo");
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Running pipeline…
                  </>
                ) : (
                  <>Start with mock demo</>
                )}
              </button>
              <button type="button" className="btn btn-secondary btn-lg" onClick={scrollToWorkspace}>
                Upload a sketch
              </button>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <strong>7 agents</strong>
                <span>Inspectable LangGraph steps</span>
              </div>
              <div className="stat">
                <strong>Official icons</strong>
                <span>SAP Horizon Style Contract</span>
              </div>
              <div className="stat">
                <strong>HITL review</strong>
                <span>Architect approval gate</span>
              </div>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-visual-top">
              <span>Pipeline preview</span>
              <span className="pill-status">Production path</span>
            </div>
            <div className="flow-preview">
              {FLOW_PREVIEW.map((s, i) => (
                <div key={s.label} className="flow-step">
                  <span className="n">{i + 1}</span>
                  <span className="label">{s.label}</span>
                  <span className="tag">{s.tag}</span>
                </div>
              ))}
            </div>
            <div className="hero-visual-foot">
              <span className="mini-badge">Draw.io XML</span>
              <span className="mini-badge indigo">Vector RAG</span>
              <span className="mini-badge teal">XSUAA ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Capabilities */}
      <section className="section-band">
        <div className="section-head">
          <h2>Built for enterprise architecture work</h2>
          <p>
            Designed around how SAP architects actually deliver — grounded references, official
            visual language, and governance-friendly review.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon blue">◎</div>
            <h3>Vision, not plain OCR</h3>
            <p>
              Infers components, zones, and flows from messy whiteboards — relationships, not only
              text boxes.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon indigo">◈</div>
            <h3>Architecture Center RAG</h3>
            <p>
              Retrieves real SAP reference architectures so the model does not invent plausible but
              nonexistent patterns.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon teal">⬡</div>
            <h3>Editable Draw.io output</h3>
            <p>
              Emits Style Contract XML with official SAP icons — open in diagrams.net and keep
              editing.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon green">✓</div>
            <h3>Human-in-the-loop</h3>
            <p>
              Architects approve or correct the structured model before generation — audit-friendly
              checkpoints.
            </p>
          </article>
        </div>
      </section>

      {/* Workspace */}
      <main className="workspace" id="workspace">
        <div className="workspace-panel">
          <div className="workspace-header">
            <div>
              <h2>Architecture studio</h2>
              <p>Upload a sketch or run a scenario — review, approve, download.</p>
            </div>
            <div className="phase-pills">
              <span className={`phase-pill ${phases.input}`}>1 · Input</span>
              <span className={`phase-pill ${phases.pipeline}`}>2 · Pipeline</span>
              <span className={`phase-pill ${phases.review}`}>3 · Review</span>
            </div>
          </div>

          <div className="workspace-body">
            <div className="grid">
              {/* Input */}
              <section className="card">
                <div className="card-head">
                  <span className="step-badge">1</span>
                  <div>
                    <h2>Input</h2>
                    <p className="subtitle">
                      Whiteboard photo, architecture sketch, or handwritten notes.
                    </p>
                  </div>
                </div>

                <div
                  className={`dropzone ${dragOver ? "dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) onFile(f);
                  }}
                  onClick={() => document.getElementById("file-input")?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      document.getElementById("file-input")?.click();
                    }
                  }}
                >
                  <div className="dropzone-icon">↑</div>
                  <strong>
                    {file ? file.name : "Drop an image here or click to browse"}
                  </strong>
                  <span>PNG, JPG, WebP · max 15 MB · mock mode works without a key</span>
                  <input
                    id="file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                {previewUrl && (
                  <div className="preview">
                    <img src={previewUrl} alt="Upload preview" />
                  </div>
                )}

                <div className="field">
                  <label htmlFor="hints">Architect hints (optional)</label>
                  <textarea
                    id="hints"
                    rows={3}
                    value={hints}
                    onChange={(e) => setHints(e.target.value)}
                    placeholder="e.g. clean-core extension to S/4 with Integration Suite"
                  />
                </div>

                <div className="field">
                  <label>Quick scenarios</label>
                  <div className="chips">
                    {DEMO_HINTS.map((d) => (
                      <button
                        key={d.label}
                        type="button"
                        className={`chip ${hints === d.hints ? "active" : ""}`}
                        onClick={() => setHints(d.hints)}
                        title={d.desc}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={() => runPipeline(file ? "upload" : "demo")}
                  >
                    {loading ? (
                      <>
                        <span className="spinner" /> Running…
                      </>
                    ) : file ? (
                      "Analyze upload"
                    ) : (
                      "Run mock demo"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canDownload}
                    onClick={downloadDrawio}
                  >
                    Download .drawio
                  </button>
                </div>

                {error && (
                  <div className="banner error-banner">
                    <span className="banner-icon">!</span>
                    <span>{error}</span>
                  </div>
                )}
                {result?.status === "awaiting_review" && (
                  <div className="banner info-banner">
                    <span className="banner-icon">…</span>
                    <span>
                      Pipeline paused for <strong>human review</strong>. Edit the model below, then
                      approve to generate Draw.io XML.
                    </span>
                  </div>
                )}
                {result?.status === "completed" && (
                  <div className="banner success-banner">
                    <span className="banner-icon">✓</span>
                    <span>
                      Pipeline completed ({result.engine ?? "langgraph"}). Open the file in{" "}
                      <a href="https://app.diagrams.net" target="_blank" rel="noreferrer">
                        diagrams.net
                      </a>
                      .
                    </span>
                  </div>
                )}
              </section>

              {/* Pipeline */}
              <section className="card">
                <div className="card-head">
                  <span className="step-badge two">2</span>
                  <div>
                    <h2>Pipeline</h2>
                    <p className="subtitle">
                      LangGraph: extract → retrieve → gaps → refine → review → generate → validate
                    </p>
                  </div>
                </div>

                {steps.length === 0 ? (
                  <div className="empty-pipeline">
                    <p>
                      Run a demo or upload a sketch to watch each agent complete.
                      <br />
                      Steps stay inspectable for debugging and governance.
                    </p>
                  </div>
                ) : (
                  <ul className="steps">
                    {steps.map((s) => (
                      <li key={s.id} className={`step ${s.status}`}>
                        <span className="dot">{stepIcon(s.status)}</span>
                        <span className="step-name">{s.name}</span>
                        <span className="step-status">{s.status}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {result?.references && result.references.length > 0 && (
                  <div className="section">
                    <h3>Matched references</h3>
                    {result.references.map((r) => (
                      <div key={r.ref.id} className="ref-card">
                        <span className="score">{(r.score * 100).toFixed(0)}%</span>
                        <h4>{r.ref.title}</h4>
                        <p>{r.ref.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Review */}
              {(model || awaiting) && (
                <section className="card full-width">
                  <div className="card-head">
                    <span className="step-badge three">3</span>
                    <div>
                      <h2>Human review</h2>
                      <p className="subtitle">
                        Edit the ArchitectureModel, then approve to resume generation.
                      </p>
                    </div>
                  </div>

                  {model && (
                    <div className="model-meta">
                      <span className="tag">{model.title}</span>
                      <span className="tag">{model.level}</span>
                      <span className="tag">{model.components.length} components</span>
                      {result?.engine && <span className="tag">{result.engine}</span>}
                    </div>
                  )}

                  {result?.gaps && result.gaps.length > 0 && (
                    <div className="section">
                      <h3>Gap analysis</h3>
                      {result.gaps.map((g) => (
                        <div key={g.id} className={`gap ${g.severity}`}>
                          <strong>
                            [{g.severity}] {g.message}
                          </strong>
                          {g.suggestion && <p>{g.suggestion}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="model-json">ArchitectureModel (JSON)</label>
                    <textarea
                      id="model-json"
                      className="mono"
                      rows={16}
                      value={editJson}
                      onChange={(e) => setEditJson(e.target.value)}
                      spellCheck={false}
                      disabled={!awaiting && result?.status === "completed"}
                    />
                  </div>
                  {editError && (
                    <div className="banner error-banner">
                      <span className="banner-icon">!</span>
                      <span>{editError}</span>
                    </div>
                  )}

                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!awaiting || loading}
                      onClick={approve}
                    >
                      {loading ? (
                        <>
                          <span className="spinner" /> Generating…
                        </>
                      ) : (
                        "Approve & generate Draw.io"
                      )}
                    </button>
                    {canDownload && (
                      <button type="button" className="btn btn-secondary" onClick={downloadDrawio}>
                        Download .drawio
                      </button>
                    )}
                  </div>

                  {model && (
                    <div className="section">
                      <h3>Components</h3>
                      <div className="chips">
                        {(result?.approved ?? result?.refined ?? model).components.map((c) => (
                          <div key={c.id} className="chip static">
                            <strong>{c.officialName ?? c.label}</strong>
                            {c.subtitle && <span className="meta">{c.subtitle}</span>}
                            <span className="meta">
                              {c.kind}
                              {typeof c.confidence === "number"
                                ? ` · ${(c.confidence * 100).toFixed(0)}% conf`
                                : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result?.drawioXml && (
                    <div className="section">
                      <h3>Draw.io XML preview</h3>
                      <pre className="xml-preview">{result.drawioXml.slice(0, 2500)}…</pre>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <strong>SAP Architect Builder</strong>
            <span>
              Prototype for whiteboard-to-architecture automation. Align product names and icons
              with SAP Architecture Center and BTP Solution Diagram guidelines.
            </span>
          </div>
          <div className="footer-meta">
            <span>LangGraph</span>
            <span>Draw.io XML</span>
            <span>pgvector / HANA Vector</span>
            <span>CAP + XSUAA path</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
