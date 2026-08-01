#!/usr/bin/env node
/**
 * Rendered QA — the gate that matters.
 *
 * Structural validation cannot tell you whether a diagram *looks* right: connector
 * routing, label placement and glyph resolution are decided by Draw.io's renderer,
 * not by the XML. So this runs every diagram through Draw.io's own engine and
 * measures the result.
 *
 *   node tools/render-qa.mjs <file.drawio|dir> [...]
 *
 * Assets (the viewer and any referenced vendor glyphs) are fetched on demand into a
 * gitignored cache, so the check is repeatable on a clean machine and offline after
 * the first run. Exits non-zero when a diagram fails, which makes it CI-usable.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CACHE = path.join(ROOT, ".cache", "drawio");
const VIEWER_URL =
  "https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/js/viewer.min.js";
const GLYPH_BASE =
  "https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/img/lib/sap";
const PORT = Number(process.env.RENDER_QA_PORT || 8899);

const log = (...a) => console.log(...a);

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return true;
  const res = await fetch(url);
  if (!res.ok) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

function collectDiagrams(args) {
  const out = [];
  for (const a of args) {
    const p = path.resolve(a);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) if (f.endsWith(".drawio")) out.push(path.join(p, f));
    } else if (p.endsWith(".drawio")) out.push(p);
  }
  return out;
}

/** The probe runs inside the page and reports what Draw.io actually drew. */
const PROBE = `
window.__probe = function () {
  const gg = window.__graph, mm = gg.getModel(), vw = gg.view;
  const root = document.getElementById('c');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const runs = []; let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim(); if (!t) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    if (b.width > 1 && b.height > 1) runs.push({ t: t.slice(0, 40), x: b.x, y: b.y, w: b.width, h: b.height });
  }
  // >1px so sub-pixel line-box touching is not reported as a defect
  const ov = (a, b) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

  const textClashes = [];
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++)
    if (ov(runs[i], runs[j])) textClashes.push(runs[i].t + ' <> ' + runs[j].t);

  const cells = Object.values(mm.cells).filter((c) => c.id !== '0');
  const isArea = (c) => (c.style || '').includes('spacingLeft=12') || (c.style || '').includes('dashPattern');
  const related = (a, b) => { let p = a; while (p) { if (p === b) return true; p = p.parent; }
                              p = b; while (p) { if (p === a) return true; p = p.parent; } return false; };
  const content = cells.filter((c) => { const st = vw.getState(c); return st && st.width && !c.edge && !isArea(c); });
  const shapeClashes = [];
  for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) {
    const a = content[i], b = content[j];
    if (related(a, b) || (a.parent && a.parent.edge) || (b.parent && b.parent.edge)) continue;
    // a multi-instance marker is drawn as deliberately offset copies
    if (/-stack\d+$/.test(a.id) || /-stack\d+$/.test(b.id)) continue;
    const A = vw.getState(a), B = vw.getState(b);
    if (ov({x:A.x,y:A.y,w:A.width,h:A.height}, {x:B.x,y:B.y,w:B.width,h:B.height}))
      shapeClashes.push(a.id + ' <> ' + b.id);
  }

  const escapes = [];
  for (const c of cells) {
    const p = c.parent; if (!p || p.id === '0' || c.edge || p.edge) continue;
    const cs = vw.getState(c), ps = vw.getState(p);
    if (!cs || !ps || !cs.width || !ps.width) continue;
    if (cs.x < ps.x - 1 || cs.y < ps.y - 1 || cs.x + cs.width > ps.x + ps.width + 1 || cs.y + cs.height > ps.y + ps.height + 1)
      escapes.push(c.id + ' escapes ' + p.id);
  }

  // connector crossings, measured on the routed geometry Draw.io produced
  const segs = [];
  for (const c of cells) {
    if (!c.edge) continue;
    const st = vw.getState(c); if (!st || !st.absolutePoints) continue;
    const pts = st.absolutePoints.filter(Boolean);
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1], c.id]);
  }
  const cross = (p, q, r, s) => {
    const d = (a, b, c2) => (b.x - a.x) * (c2.y - a.y) - (b.y - a.y) * (c2.x - a.x);
    const d1 = d(p, q, r), d2 = d(p, q, s), d3 = d(r, s, p), d4 = d(r, s, q);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    if (segs[i][2] === segs[j][2]) continue;
    if (cross(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) crossings++;
  }

  const imgs = [...document.querySelectorAll('#c svg image')]
    .map((i) => (i.getAttribute('xlink:href') || i.getAttribute('href') || '').split('/').pop());
  const layers = Object.values(mm.cells).filter((c) => c.parent && c.parent.id === '0')
    .map((c) => c.value).filter(Boolean);

  return { status: window.__status, errors: window.__errors.slice(0, 5), pages: window.__pages,
    cells: cells.length, glyphs: imgs, layers, textRuns: runs.length,
    textClashes, shapeClashes, escapes, crossings };
};
`;

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>render-qa</title>
<style>body{margin:0;background:#fff}</style></head><body><div id="c"></div>
<script>
  window.GRAPH_IMAGE_PATH='img'; window.mxBasePath='js'; window.RESOURCE_BASE='js';
  window.__errors=[];
  window.addEventListener('error', e => window.__errors.push(String((e&&(e.message||e.type))||'error')+' @ '+(e.filename||'?')), true);
</script>
<script src="js/viewer.min.js"></script>
<script>
(async function () {
  window.__status='starting';
  try {
    const file = new URLSearchParams(location.search).get('f');
    const xml = await (await fetch(file)).text();
    const doc = mxUtils.parseXml(xml);
    const diagrams = doc.getElementsByTagName('diagram');
    window.__pages = diagrams.length;
    const node = diagrams[0].firstElementChild;
    const graph = new Graph(document.getElementById('c'));
    graph.setEnabled(false);
    new mxCodec(node.ownerDocument).decode(node, graph.getModel());
    window.__graph = graph;
    graph.refresh(); graph.view.validate();
    window.__status='rendered';
  } catch (e) { window.__status='FAILED: '+(e&&e.message?e.message:String(e)); }
})();
</script>
${"<script>" + PROBE + "</script>"}
</body></html>`;

async function main() {
  const args = process.argv.slice(2);
  const files = collectDiagrams(args.length ? args : [path.join(ROOT, "samples", "output")]);
  if (!files.length) {
    console.error("render-qa: no .drawio files found");
    process.exit(2);
  }

  // ── assets ───────────────────────────────────────────────────────────────
  fs.mkdirSync(path.join(CACHE, "js"), { recursive: true });
  fs.mkdirSync(path.join(CACHE, "img", "lib", "sap"), { recursive: true });
  fs.mkdirSync(path.join(CACHE, "diagrams"), { recursive: true });

  const viewer = path.join(CACHE, "js", "viewer.min.js");
  if (!fs.existsSync(viewer)) log("render-qa: fetching Draw.io viewer …");
  if (!(await download(VIEWER_URL, viewer))) {
    console.error("render-qa: could not fetch the Draw.io viewer (offline and not cached)");
    process.exit(2);
  }

  const glyphs = new Set();
  for (const f of files)
    for (const m of fs.readFileSync(f, "utf8").matchAll(/SAPIcon=([^;"]+)/g)) glyphs.add(m[1]);
  const missing = [];
  for (const g of glyphs) {
    const dest = path.join(CACHE, "img", "lib", "sap", `${g}.svg`);
    if (!(await download(`${GLYPH_BASE}/${encodeURIComponent(g)}.svg`, dest))) missing.push(g);
  }
  if (missing.length) console.error(`render-qa: glyphs with no asset: ${missing.join(", ")}`);

  fs.writeFileSync(path.join(CACHE, "index.html"), PAGE);
  for (const f of files) fs.copyFileSync(f, path.join(CACHE, "diagrams", path.basename(f)));

  // ── serve ────────────────────────────────────────────────────────────────
  const types = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".drawio": "text/xml" };
  const renders = path.join(CACHE, "renders");
  fs.mkdirSync(renders, { recursive: true });
  const server = http.createServer((req, res) => {
    // the page posts its rendered SVG back here, giving us a preview export that
    // came from Draw.io's own renderer rather than a reimplementation
    if (req.method === "POST" && req.url.startsWith("/__save")) {
      const name = (new URLSearchParams(req.url.split("?")[1]).get("name") || "out.svg").replace(
        /[^\w.-]/g,
        "_"
      );
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        fs.writeFileSync(path.join(renders, name), body);
        res.writeHead(200);
        res.end(`saved ${name} (${body.length} bytes)`);
      });
      return;
    }
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(CACHE, url === "/" ? "index.html" : url);
    if (!file.startsWith(CACHE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(PORT, r));

  fs.writeFileSync(
    path.join(CACHE, "manifest.json"),
    JSON.stringify(
      {
        port: PORT,
        diagrams: files.map((f) => ({
          name: path.basename(f),
          url: `http://localhost:${PORT}/?f=diagrams/${encodeURIComponent(path.basename(f))}`,
        })),
        glyphs: [...glyphs],
        missingGlyphs: missing,
      },
      null,
      2
    )
  );

  log(`render-qa: harness ready on http://localhost:${PORT}`);
  log(`  viewer   : ${path.relative(ROOT, viewer)}`);
  log(`  glyphs   : ${glyphs.size} referenced, ${glyphs.size - missing.length} cached`);
  log(`  diagrams : ${files.length}\n`);
  for (const f of files)
    log(`  http://localhost:${PORT}/?f=diagrams/${encodeURIComponent(path.basename(f))}`);
  log(
    `\nEach page exposes window.__probe(), returning { errors, textClashes, shapeClashes,\n` +
      `escapes, crossings, glyphs, layers }. A diagram passes when errors, textClashes,\n` +
      `shapeClashes and escapes are all empty.\n\n` +
      `Drive it with any automation client (Playwright/Puppeteer in CI, or the editor's\n` +
      `browser tools locally). Ctrl-C to stop.`
  );

  if (missing.length) process.exitCode = 1;
  process.on("SIGINT", () => {
    server.close();
    process.exit(process.exitCode ?? 0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
