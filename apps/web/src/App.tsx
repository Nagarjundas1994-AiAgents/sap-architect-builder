import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveJob,
  getHealth,
  runDemo,
  runPipeline,
  type Health,
  type ProviderInfo,
} from "./api";
import { renderPreview } from "./preview";
import type { ArchitectureModel, MermaidView, PipelineResult } from "./types";

/** One place that turns generated text into a file on disk. */
function saveFile(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (s: string) => s.replace(/[^\w.-]+/g, "-").toLowerCase();

const SCENARIOS = [
  { label: "Agentic AI", hints: "agentic joule custom agents", note: "Orchestrated agents on a platform" },
  { label: "Clean core", hints: "clean core s4 extension", note: "Side-by-side extension" },
  { label: "Hybrid", hints: "integration hybrid cpi", note: "On-premise and partner reach" },
];

const STEP_COPY: Record<string, string> = {
  extract: "Reading the sketch",
  retrieve: "Matching references",
  gaps: "Checking for gaps",
  refine: "Refining the model",
  mermaid: "Drawing Mermaid views",
  human_review: "Waiting for you",
  generate: "Drawing the diagram",
  validate: "Validating output",
};

/**
 * Draw.io editor, embedded.
 *
 * Self-hosted by default (`docker compose up -d drawio`) so architecture diagrams stay
 * on the network; point VITE_DRAWIO_URL at embed.diagrams.net to use the public one.
 *
 * The handshake is Draw.io's own JSON embed protocol: the editor announces `init`, we
 * reply with `load`, and it reports every change back as `autosave` — so edits made
 * here become the file you download. If no `init` arrives the service isn't running,
 * and the caller falls back to the built-in preview.
 */
const DRAWIO_URL = import.meta.env.VITE_DRAWIO_URL ?? "http://localhost:8080";

function DrawioEmbed({
  xml,
  onChange,
  onUnavailable,
}: {
  xml: string;
  onChange: (xml: string) => void;
  onUnavailable: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // the editor is loaded once, on init — later prop changes must not reload it and
  // throw away the user's in-progress edits
  const initial = useRef(xml);
  const latest = useRef({ onChange, onUnavailable });
  latest.current = { onChange, onUnavailable };

  const origin = useMemo(() => {
    try {
      return new URL(DRAWIO_URL, window.location.href).origin;
    } catch {
      return "*";
    }
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || typeof e.data !== "string") return;
      let msg: { event?: string; xml?: string };
      try {
        msg = JSON.parse(e.data) as { event?: string; xml?: string };
      } catch {
        return;
      }
      const post = (m: unknown) =>
        frame.current?.contentWindow?.postMessage(JSON.stringify(m), origin);

      if (msg.event === "init") {
        setReady(true);
        post({ action: "load", xml: initial.current, autosave: 1 });
      } else if ((msg.event === "autosave" || msg.event === "save") && msg.xml) {
        latest.current.onChange(msg.xml);
        if (msg.event === "save") {
          setSaved(new Date().toLocaleTimeString());
          post({ action: "status", message: "Saved to the studio", modified: false });
        }
      }
    };

    window.addEventListener("message", onMessage);
    // no handshake means nothing is serving the editor
    const timer = setTimeout(() => {
      if (!frame.current?.dataset.ready) latest.current.onUnavailable();
    }, 8000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, [origin]);

  const src = `${DRAWIO_URL}?embed=1&proto=json&spin=1&libraries=1&noExitBtn=1&saveAndExit=0&modified=unsavedChanges`;

  return (
    <div className="embed">
      {!ready && (
        <div className="embed-boot">
          <span className="spinner" /> Starting the Draw.io editor…
        </div>
      )}
      <iframe
        ref={frame}
        data-ready={ready ? "1" : undefined}
        className="embed-frame"
        title="Draw.io editor"
        src={src}
      />
      {ready && (
        <p className="embed-note">
          Editing in Draw.io · changes flow back to Download{saved ? ` · saved ${saved}` : ""}
        </p>
      )}
    </div>
  );
}

const ARTIFACTS = [
  { key: "plantUml", label: "PlantUML", lang: "plantuml", note: "Component view, for teams standardised on PlantUML" },
  { key: "adr", label: "Decision record", lang: "markdown", note: "MADR-shaped ADR" },
] as const;

/**
 * Companion artifacts for the design document.
 *
 * The diagram is what gets shown; these are what get committed next to the code and
 * pasted into the architecture review. The Mermaid views live in their own tab, where
 * they are rendered rather than quoted — this tab is what is left over.
 */
function Artifacts({ artifacts }: { artifacts: NonNullable<PipelineResult["artifacts"]> }) {
  const [pick, setPick] = useState<(typeof ARTIFACTS)[number]["key"]>("plantUml");
  const [copied, setCopied] = useState(false);
  const current = ARTIFACTS.find((a) => a.key === pick)!;
  const body = artifacts[pick] ?? "";

  return (
    <div className="artifacts">
      <div className="artifact-picker">
        {ARTIFACTS.map((a) => (
          <button
            key={a.key}
            type="button"
            className={pick === a.key ? "on" : ""}
            onClick={() => {
              setPick(a.key);
              setCopied(false);
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="artifact-body">
        <div className="artifact-head">
          <span className="artifact-note">{current.note}</span>
          <button
            className="btn sm"
            onClick={() => {
              void navigator.clipboard?.writeText(body);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : `Copy ${current.lang}`}
          </button>
        </div>
        <pre className="code">{body}</pre>
      </div>
    </div>
  );
}

/**
 * Mermaid views, rendered.
 *
 * The agent produces text; drawing it here with the real Mermaid parser is also the
 * only honest validation there is — what renders in this panel renders in GitHub, in
 * Confluence and in every IDE preview the team already has, because it is the same
 * parser. The diagram is available as soon as the model is extracted, so an architect
 * can look at the drawing before approving rather than after.
 *
 * `securityLevel: strict` and `htmlLabels: false` matter: component labels arrive from
 * a language model, and neither should be able to put markup into the page.
 */
function MermaidPanel({ views, title }: { views: MermaidView[]; title: string }) {
  const [pick, setPick] = useState<MermaidView["id"]>(views[0]?.id ?? "landscape");
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const current = views.find((v) => v.id === pick) ?? views[0];
  const code = current?.code ?? "";

  useEffect(() => {
    if (!code.trim() || code.trim().startsWith("%%")) {
      setSvg("");
      setFailed(code.trim() ? code.replace(/^%%\s*/, "") : "Nothing to draw for this view.");
      return;
    }
    let live = true;
    setFailed(null);
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
          suppressErrorRendering: true,
          flowchart: { htmlLabels: false, curve: "basis", nodeSpacing: 40, rankSpacing: 55 },
          sequence: { useMaxWidth: false },
        });
        // ids must be unique or a re-render collides with the previous temp node
        const { svg: out } = await mermaid.render(`mmd-${pick}-${Date.now()}`, code);
        if (live) setSvg(out);
      } catch (e) {
        if (live) {
          setSvg("");
          setFailed(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [pick, code]);

  if (!current) return null;

  return (
    <div className="artifacts">
      <div className="artifact-picker">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            className={pick === v.id ? "on" : ""}
            onClick={() => {
              setPick(v.id);
              setCopied(false);
            }}
          >
            {v.label}
            {!v.ok && <span className="pick-warn" title={v.issues.join("; ")}>!</span>}
          </button>
        ))}
      </div>

      <div className="artifact-body">
        <div className="artifact-head">
          <span className="artifact-note">{current.note}</span>
          <div className="head-actions">
            <button className="btn sm" onClick={() => setShowCode((c) => !c)}>
              {showCode ? "Diagram" : "Code"}
            </button>
            <button
              className="btn sm"
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="btn sm"
              onClick={() => saveFile(`${slug(title)}-${current.id}.mmd`, code, "text/plain")}
            >
              .mmd
            </button>
            <button
              className="btn sm"
              disabled={!svg}
              onClick={() => saveFile(`${slug(title)}-${current.id}.svg`, svg, "image/svg+xml")}
            >
              .svg
            </button>
          </div>
        </div>

        {showCode ? (
          <pre className="code">{code}</pre>
        ) : svg ? (
          <DiagramViewer svg={svg} />
        ) : (
          <div className="hollow hollow-copy">
            <h3>This view didn't render</h3>
            <p>{failed}</p>
            <button className="btn sm" onClick={() => setShowCode(true)}>
              Show the Mermaid source
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function statusTone(s: string) {
  if (s === "completed" || s === "skipped") return "done";
  if (s === "failed") return "failed";
  if (s === "running") return "running";
  if (s === "waiting") return "waiting";
  return "idle";
}

/**
 * Pan/zoom viewer for the generated diagram.
 *
 * A finished drawing is often 2000px+ wide, so scaling it to fit makes the labels
 * unreadable. Wheel zooms toward the cursor, drag pans, and the browser's own
 * fullscreen gives the drawing the whole screen without a lightbox to maintain.
 */
function DiagramViewer({ svg, shapes }: { svg: string; shapes?: number }) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [full, setFull] = useState(false);

  const fit = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  // React keeps this component mounted between runs, so without this a new drawing
  // opens at the previous zoom and pan — often scrolled to empty space.
  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 });
  }, [svg]);

  const zoomBy = useCallback((factor: number, at?: { x: number; y: number }) => {
    setView((v) => {
      const scale = Math.min(6, Math.max(0.25, v.scale * factor));
      if (!at) return { ...v, scale };
      // keep the point under the cursor fixed while the scale changes
      const k = scale / v.scale;
      return { scale, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
    });
  }, []);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // a non-passive listener is the only way to stop the page scrolling as you zoom
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  return (
    <div
      className={`viewer ${full ? "full" : ""}`}
      ref={frame}
      tabIndex={0}
      // scoped to the viewer, so +/-/0 never steal keys from the model editor
      onKeyDown={(e) => {
        if (e.key === "+" || e.key === "=") zoomBy(1.25);
        else if (e.key === "-") zoomBy(1 / 1.25);
        else if (e.key === "0") fit();
        else return;
        e.preventDefault();
      }}
    >
      <div
        className="viewer-stage"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setView((v) => ({ ...v, x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onDoubleClick={fit}
      >
        <div
          className="viewer-canvas"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <div className="viewer-dock">
        {/* a Mermaid sequence or C4 view has no comparable shape count — omit rather than lie */}
        {shapes !== undefined && (
          <>
            <span className="viewer-shapes">{shapes} shapes</span>
            <span className="viewer-sep" />
          </>
        )}
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="viewer-scale" onClick={fit} title="Reset">
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          +
        </button>
        <span className="viewer-sep" />
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void frame.current?.requestFullscreen?.();
          }}
        >
          {full ? "Exit" : "Expand"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [provider, setProvider] = useState("mock");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hints, setHints] = useState(SCENARIOS[0].hints);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<null | "run" | "approve">(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "diagram" | "mermaid" | "edit" | "artifacts" | "model" | "xml"
  >("diagram");
  const [editorDown, setEditorDown] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") !== "light");
  const [railOpen, setRailOpen] = useState(() => localStorage.getItem("rail") !== "off");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    void getHealth().then((h) => {
      setHealth(h);
      if (h.provider) setProvider(h.provider);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("rail", railOpen ? "on" : "off");
  }, [railOpen]);

  // The pipeline is one request, so there is no honest per-step progress to show.
  // A running clock at least tells you it is alive and how long it has taken.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [busy]);

  const providers = health?.providers ?? [];
  const active = providers.find((p) => p.id === provider);
  const model = result?.approved ?? result?.refined ?? result?.extracted;
  const awaiting = result?.status === "awaiting_review";
  const finished = result?.status === "completed" && Boolean(result.drawioXml);

  const preview = useMemo(() => {
    if (!result?.drawioXml) return null;
    try {
      return renderPreview(result.drawioXml);
    } catch {
      return null;
    }
  }, [result?.drawioXml]);

  const onFile = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
    setEditJson("");
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }, []);

  // Edits made in the embedded editor replace the generated XML, so Download, Copy
  // and the fast preview all reflect what the architect actually drew.
  const onEditorChange = useCallback((drawioXml: string) => {
    setResult((r) => (r ? { ...r, drawioXml } : r));
  }, []);

  async function start() {
    setBusy("run");
    setError(null);
    setEditError(null);
    setResult(null);
    try {
      const data = file
        ? await runPipeline({ hints, file, provider })
        : await runDemo({ hints, provider });
      setResult(data);
      const m = data.refined ?? data.extracted;
      if (m) setEditJson(JSON.stringify(m, null, 2));
      if (data.status === "failed") setError(data.error ?? "The pipeline did not finish");
      setTab(data.drawioXml ? "diagram" : "model");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!result?.jobId) return;
    setBusy("approve");
    setEditError(null);
    setError(null);
    try {
      let parsed: ArchitectureModel;
      try {
        parsed = JSON.parse(editJson) as ArchitectureModel;
      } catch {
        setEditError("That is not valid JSON — fix it before approving.");
        return;
      }
      const data = await approveJob(result.jobId, parsed);
      setResult(data);
      if (data.status === "failed") setError(data.error ?? "Generation failed after approval");
      else setTab("diagram");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function download() {
    if (!result?.drawioXml) return;
    saveFile(`${slug(model?.title ?? "architecture")}.drawio`, result.drawioXml, "application/xml");
  }

  const steps = result?.steps ?? [];
  const doneCount = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const progress = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <div className="app" data-rail={railOpen ? "on" : "off"}>
      {/* ── Bar ─────────────────────────────────────────────────── */}
      <header className="bar">
        <div className="bar-brand">
          <button
            type="button"
            className="icon-btn rail-toggle"
            onClick={() => setRailOpen((o) => !o)}
            aria-expanded={railOpen}
            aria-controls="rail"
            title={railOpen ? "Hide the input panel" : "Show the input panel"}
            aria-label={railOpen ? "Hide the input panel" : "Show the input panel"}
          >
            ☰
          </button>
          <span className="mark" aria-hidden="true" />
          <span className="mark-name">Architecture Studio</span>
        </div>

        <div className="bar-status">
          {health && (
            <span className={`live ${health.ok ? "" : "live-off"}`}>
              <span className="live-dot" />
              {health.ok ? `${health.vectorCount ?? 0} references` : "Backend offline"}
            </span>
          )}
          {active && <span className="bar-model">{active.model}</span>}
        </div>

        <div className="bar-end">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDark((d) => !d)}
            title={dark ? "Light" : "Dark"}
            aria-label="Toggle theme"
          >
            {dark ? "☾" : "☀"}
          </button>
          <a className="icon-btn" href="https://app.diagrams.net" target="_blank" rel="noreferrer">
            diagrams.net ↗
          </a>
        </div>
      </header>

      {/*
        The pipeline runs for the better part of a minute and changes state silently.
        One polite live region narrates it, so the run is followable without sight of
        the step list. Errors get their own assertive region below.
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {busy === "run"
          ? "Analysing the architecture."
          : busy === "approve"
            ? "Drawing the approved diagram."
            : awaiting
              ? `Model ready for review: ${model?.components.length ?? 0} components, ${result?.gaps?.length ?? 0} findings. Approve to draw.`
              : finished
                ? `Diagram generated. ${result?.gaps?.filter((g) => g.severity === "high").length ?? 0} high-severity findings.`
                : ""}
      </p>

      <div className="body">
        {/* ── Rail ──────────────────────────────────────────────── */}
        <aside className="rail" id="rail" inert={!railOpen || undefined}>
          <section className="block">
            <h2 className="block-title">Source</h2>

            <div
              className={`drop ${dragOver ? "over" : ""} ${file ? "has" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={file ? `Sketch: ${file.name}. Choose a different image.` : "Choose a sketch image to analyse"}
              onClick={() => document.getElementById("file")?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById("file")?.click();
                }
              }}
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
            >
              {previewUrl ? (
                <img className="thumb" src={previewUrl} alt="Your upload" />
              ) : (
                <>
                  <span className="drop-plus" aria-hidden="true">
                    +
                  </span>
                  <span className="drop-copy">
                    <strong>Drop a sketch</strong>
                    <em>PNG, JPG, WebP · optional</em>
                  </span>
                </>
              )}
              {file && <span className="drop-name">{file.name}</span>}
              <input
                id="file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {active?.vision === false && file && (
              <p className="note-inline">{active.label} can't read images — your notes are used instead.</p>
            )}

            <textarea
              className="prompt"
              rows={7}
              value={hints}
              onChange={(e) => setHints(e.target.value)}
              placeholder="Describe the solution — actors, zones, products, and how they connect."
            />

            <div className="presets">
              {SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  title={s.note}
                  className={`preset ${hints === s.hints ? "on" : ""}`}
                  onClick={() => setHints(s.hints)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <h2 className="block-title">Model provider</h2>
            <div className="providers">
              {providers.map((p: ProviderInfo) => (
                <button
                  key={p.id}
                  type="button"
                  className={`prov ${provider === p.id ? "on" : ""}`}
                  onClick={() => setProvider(p.id)}
                  aria-pressed={provider === p.id}
                >
                  <span className="prov-dot" aria-hidden="true" />
                  <span className="prov-text">
                    <strong>{p.label}</strong>
                    <em>{p.model}</em>
                  </span>
                  {!p.ready && <span className="prov-tag">no key</span>}
                  {p.ready && p.vision && <span className="prov-tag soft">vision</span>}
                </button>
              ))}
            </div>
          </section>

          <div className="rail-run" id="rail-run">
            <button className="btn btn-go" onClick={start} disabled={busy !== null}>
              {busy === "run" ? (
                <>
                  <span className="spinner" /> Working · {elapsed.toFixed(1)}s
                </>
              ) : (
                <>{file ? "Analyse sketch" : "Generate diagram"}</>
              )}
            </button>
          </div>

          {(steps.length > 0 || busy === "run") && (
            <section className="block">
              <h2 className="block-title">
                Pipeline
                {steps.length > 0 && <span className="block-meta">{progress}%</span>}
              </h2>
              <div className="track">
                <div className="track-fill" style={{ width: `${busy === "run" ? 100 : progress}%` }} />
              </div>
              <ol className="steps">
                {(busy === "run" ? Object.entries(STEP_COPY).map(([id, name]) => ({ id, name, status: "pending" })) : steps).map(
                  (s) => (
                    <li key={s.id} className={`step ${busy === "run" ? "pending" : statusTone(s.status)}`}>
                      <span className="step-dot" aria-hidden="true" />
                      <span className="step-name">{STEP_COPY[s.id] ?? s.name}</span>
                    </li>
                  )
                )}
              </ol>
            </section>
          )}
        </aside>

        {/*
          Collapse handle on the rail's own edge. The ☰ in the bar does the same thing,
          but the seam is where people reach for it — and it rides `--rail`, so it
          travels with the panel instead of jumping when the panel animates.
        */}
        <button
          type="button"
          className="rail-edge"
          onClick={() => setRailOpen((o) => !o)}
          aria-expanded={railOpen}
          aria-controls="rail"
          aria-label={railOpen ? "Hide the input panel" : "Show the input panel"}
          title={railOpen ? "Hide panel" : "Show panel"}
        >
          <span aria-hidden="true">{railOpen ? "‹" : "›"}</span>
        </button>

        {/* ── Stage ─────────────────────────────────────────────── */}
        <main className="stage">
          {error && (
            <div className="alert" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          {!model && !busy && (
            <div className="void">
              <div className="void-art" aria-hidden="true">
                <svg viewBox="0 0 240 140">
                  <rect className="v1" x="10" y="46" width="58" height="30" rx="6" />
                  <rect className="v2" x="91" y="46" width="58" height="30" rx="6" />
                  <rect className="v3" x="172" y="46" width="58" height="30" rx="6" />
                  <rect className="v4" x="91" y="100" width="58" height="30" rx="6" />
                  <path className="vl" d="M68 61 H88" />
                  <path className="vl" d="M149 61 H169" />
                  <path className="vl" d="M120 100 V79" />
                </svg>
              </div>
              <h1>Describe it. Get an editable drawing.</h1>
              <p>
                Your description becomes a structured model, grounded against reference
                architectures and paused for review — then plotted as a real Draw.io file.
              </p>
              <button className="btn btn-go" onClick={start} disabled={busy !== null}>
                Generate diagram
              </button>
            </div>
          )}

          {busy === "run" && !model && (
            <div className="void">
              <div className="pulse" aria-hidden="true" />
              <h1>Reading your architecture</h1>
              <p>{active?.label ?? "The model"} is extracting components and flows · {elapsed.toFixed(1)}s</p>
            </div>
          )}

          {model && (
            <>
              {/* fills the visible stage exactly, so references and gaps start below the fold */}
              <div className="stage-main">
              <div className="stage-head">
                <div className="stage-title">
                  <h1>{model.title}</h1>
                  <div className="chips">
                    <span className="chip">{model.level}</span>
                    <span className="chip">{model.components.length} components</span>
                    <span className="chip">{model.flows.length} flows</span>
                    {awaiting ? (
                      <span className="chip chip-wait">Awaiting your review</span>
                    ) : finished ? (
                      <span className="chip chip-ok">Generated</span>
                    ) : null}
                  </div>
                </div>

                <div className="stage-tools">
                  <div className="segmented" role="tablist">
                    {(["diagram", "mermaid", "edit", "artifacts", "model", "xml"] as const).map(
                      (t) => (
                        <button
                          key={t}
                          role="tab"
                          aria-selected={tab === t}
                          className={tab === t ? "on" : ""}
                          onClick={() => setTab(t)}
                          disabled={
                            t === "mermaid"
                              ? !result?.mermaid?.length
                              : t === "artifacts"
                                ? !result?.artifacts
                                : t !== "model" && !result?.drawioXml
                          }
                        >
                          {t === "diagram"
                            ? "Diagram"
                            : t === "mermaid"
                              ? "Mermaid"
                              : t === "edit"
                                ? "Edit"
                                : t === "artifacts"
                                  ? "Artifacts"
                                  : t === "model"
                                    ? "Model"
                                    : "XML"}
                        </button>
                      )
                    )}
                  </div>
                  {awaiting && (
                    <button className="btn btn-go sm" onClick={approve} disabled={busy !== null}>
                      {busy === "approve" ? (
                        <>
                          <span className="spinner" /> Drawing…
                        </>
                      ) : (
                        "Approve & draw"
                      )}
                    </button>
                  )}
                  {finished && (
                    <>
                      <button className="btn sm" onClick={download}>
                        Download
                      </button>
                      <button
                        className="btn sm"
                        onClick={() => navigator.clipboard?.writeText(result!.drawioXml!)}
                      >
                        Copy XML
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="stage-body">
                {tab === "diagram" &&
                  (preview ? (
                    <DiagramViewer svg={preview.svg} shapes={preview.shapes} />
                  ) : (
                    <div className="hollow">
                      <p>Approve the model and the drawing appears here.</p>
                    </div>
                  ))}

                {tab === "mermaid" &&
                  (result?.mermaid?.length ? (
                    <MermaidPanel views={result.mermaid} title={model.title} />
                  ) : (
                    <div className="hollow">
                      <p>Mermaid views appear once a model has been extracted.</p>
                    </div>
                  ))}

                {tab === "edit" &&
                  (result?.drawioXml && !editorDown ? (
                    <DrawioEmbed
                      xml={result.drawioXml}
                      onChange={onEditorChange}
                      onUnavailable={() => setEditorDown(true)}
                    />
                  ) : (
                    <div className="hollow hollow-copy">
                      <h3>The Draw.io editor isn't running</h3>
                      <p>
                        Start it and reopen this tab — the diagram loads with its SAP icons,
                        and your edits flow back into Download.
                      </p>
                      <code>docker compose up -d drawio</code>
                      <button className="btn sm" onClick={() => setEditorDown(false)}>
                        Try again
                      </button>
                    </div>
                  ))}

                {tab === "artifacts" &&
                  (result?.artifacts ? (
                    <Artifacts artifacts={result.artifacts} />
                  ) : (
                    <div className="hollow">
                      <p>Artifacts appear once a model has been extracted.</p>
                    </div>
                  ))}

                {tab === "model" && (
                  <div className="editor">
                    <textarea
                      className="code-edit"
                      spellCheck={false}
                      value={editJson}
                      onChange={(e) => setEditJson(e.target.value)}
                      disabled={!awaiting}
                    />
                    {editError && <div className="alert">{editError}</div>}
                  </div>
                )}

                {tab === "xml" && (
                  <div className="editor">
                    {(result?.drawioXml?.length ?? 0) > 6000 && (
                      <p className="artifact-note">
                        Showing the first 6,000 of{" "}
                        {result!.drawioXml!.length.toLocaleString()} characters — Download
                        and Copy XML give you the whole document.
                      </p>
                    )}
                    <pre className="code">{result?.drawioXml?.slice(0, 6000)}</pre>
                  </div>
                )}
              </div>
              </div>

              {(result?.steps?.some((s) => s.id === "retrieve") || (result?.gaps?.length ?? 0) > 0) && (
                <div className="insights">
                  {result?.references && result.references.length === 0 ? (
                    // retrieval now has a relevance floor, so an unmatched design says
                    // so instead of printing the least-bad hit as if it meant something
                    <div className="insight">
                      <h3>Closest references<span className="insight-count">none</span></h3>
                      <p className="artifact-note">
                        Nothing in the reference corpus is close enough to this design to
                        ground it. The diagram is drawn from your description alone.
                      </p>
                    </div>
                  ) : result?.references && result.references.length > 0 ? (
                    <div className="insight">
                      <h3>
                        Closest references
                        <span className="insight-count">{result.references.length}</span>
                      </h3>
                      {result.references.slice(0, 3).map((r) => (
                        <div key={r.ref.id} className="ref">
                          <span className="score">{Math.round(r.score * 100)}</span>
                          <div>
                            <strong>{r.ref.title}</strong>
                            <p>{r.ref.summary}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {result?.gaps && result.gaps.length > 0 && (
                    <div className="insight">
                      <h3>
                        Gaps found
                        <span className="insight-count">
                          {(() => {
                            const high = result.gaps.filter((g) => g.severity === "high").length;
                            return high ? `${high} to resolve` : `${result.gaps.length}`;
                          })()}
                        </span>
                      </h3>
                      {[...result.gaps]
                        // what blocks a sign-off goes first; nits should never bury it
                        .sort(
                          (a, b) =>
                            SEVERITY_RANK[a.severity ?? "low"] - SEVERITY_RANK[b.severity ?? "low"]
                        )
                        .map((g) => (
                          <div key={g.id} className={`gap ${g.severity}`}>
                            <span className={`gap-sev ${g.severity}`}>{g.severity}</span>
                            <strong>{g.message}</strong>
                            {g.suggestion && <p>{g.suggestion}</p>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
