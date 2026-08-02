/**
 * Client-side preview of a generated .drawio document.
 *
 * Draw.io's own renderer is a 2.6 MB download, which is far too much to make an
 * architect wait for just to glance at a result. This reads the same mxGraphModel
 * and paints the parts that carry the meaning — containers, cards, connectors,
 * labels — so the studio can show the diagram the moment it exists. It is a preview,
 * not a replacement: the downloaded file is what gets opened in Draw.io.
 */

interface Cell {
  id: string;
  label: string;
  style: string;
  parent: string;
  edge: boolean;
  source?: string;
  target?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  relative: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const styleMap = (style: string) => {
  const m = new Map<string, string>();
  for (const kv of style.split(";")) {
    if (!kv) continue;
    const i = kv.indexOf("=");
    if (i > 0) m.set(kv.slice(0, i), kv.slice(i + 1));
    else m.set(kv, "1");
  }
  return m;
};

const decode = (s: string) =>
  s
    .replace(/&#xa;/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

const xesc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Line {
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
}

/** Flatten the small subset of label HTML the generator emits. */
function labelLines(raw: string): Line[] {
  const t = decode(raw);
  if (!t.trim()) return [];
  const out: Line[] = [];
  for (const block of t.split(/<div[^>]*>|<br\s*\/?>/i)) {
    for (const piece of block.replace(/<\/div>/gi, "").split("\n")) {
      const text = piece.replace(/<[^>]+>/g, "").trim();
      if (!text) continue;
      out.push({
        text,
        bold: /<b>/i.test(piece),
        italic: /<i>/i.test(piece),
        size: Number((piece.match(/font-size:\s*(\d+)px/) || [])[1]) || undefined,
      });
    }
  }
  return out;
}

function wrap(lines: Line[], maxWidth: number, base: number): Line[] {
  if (!maxWidth) return lines;
  const out: Line[] = [];
  for (const l of lines) {
    const size = l.size ?? base;
    const max = Math.max(4, Math.floor(maxWidth / (size * 0.55)));
    if (l.text.length <= max) {
      out.push(l);
      continue;
    }
    let cur = "";
    for (const word of l.text.split(/\s+/)) {
      if (cur && (cur + " " + word).length > max) {
        out.push({ ...l, text: cur });
        cur = word;
      } else cur = cur ? `${cur} ${word}` : word;
    }
    if (cur) out.push({ ...l, text: cur });
  }
  return out;
}

function textSvg(
  lines: Line[],
  x: number,
  y: number,
  anchor: "start" | "middle",
  base: number,
  color: string,
  boldAll = false
) {
  let dy = 0;
  return lines
    .map((l) => {
      const size = l.size ?? base;
      const el =
        `<text x="${x}" y="${y + dy}" text-anchor="${anchor}" font-family="Inter, Helvetica, Arial, sans-serif"` +
        ` font-size="${size}" font-weight="${l.bold || boldAll ? 600 : 400}"` +
        ` font-style="${l.italic ? "italic" : "normal"}" fill="${color}">${xesc(l.text)}</text>`;
      dy += size + 4;
      return el;
    })
    .join("");
}

function parse(xml: string) {
  const cells: Cell[] = [];
  // <object label=… id=…><mxCell …/></object>  and bare <mxCell …/>
  const re = /<(object|mxCell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (const m of xml.matchAll(re)) {
    const isObject = m[1] === "object";
    const outer = m[2];
    const inner = m[3] ?? "";
    const cellAttrs = isObject ? (inner.match(/<mxCell\b([^>]*)/) || [, ""])[1] : outer;
    const geom = (inner.match(/<mxGeometry\b([^>]*)/) || [, ""])[1] || "";
    const num = (k: string) => {
      const v = geom.match(new RegExp(`\\b${k}="([-0-9.]+)"`));
      return v ? parseFloat(v[1]) : undefined;
    };
    const attr = (src: string, k: string) => (src.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
    cells.push({
      id: attr(outer, "id") ?? attr(cellAttrs, "id") ?? "",
      label: (isObject ? attr(outer, "label") : attr(outer, "value")) ?? "",
      style: attr(cellAttrs, "style") ?? "",
      parent: attr(cellAttrs, "parent") ?? "1",
      edge: /edge="1"/.test(cellAttrs),
      source: attr(cellAttrs, "source"),
      target: attr(cellAttrs, "target"),
      x: num("x"),
      y: num("y"),
      w: num("width"),
      h: num("height"),
      relative: /relative="1"/.test(geom),
    });
  }

  const by = new Map(cells.filter((c) => c.id).map((c) => [c.id, c]));
  const abs = new Map<string, Box>();
  const resolve = (c: Cell): Box | undefined => {
    if (abs.has(c.id)) return abs.get(c.id);
    if (c.x === undefined || c.relative || c.edge) return undefined;
    const p = by.get(c.parent);
    const o = p && !p.edge && p.x !== undefined && !p.relative ? resolve(p) : undefined;
    const box = { x: c.x + (o?.x ?? 0), y: (c.y ?? 0) + (o?.y ?? 0), w: c.w ?? 0, h: c.h ?? 0 };
    abs.set(c.id, box);
    return box;
  };
  for (const c of cells) resolve(c);
  return { cells, by, abs };
}

const anchor = (b: Box, fx: number, fy: number) => ({ x: b.x + b.w * fx, y: b.y + b.h * fy });

/** Orthogonal route between two boxes, matching how the generator anchors edges. */
function route(from: Box, to: Box) {
  const p0 = anchor(from, 0.5, 0.5);
  const p1 = anchor(to, 0.5, 0.5);
  const horizontal = Math.abs(p1.x - p0.x) >= Math.abs(p1.y - p0.y);
  const a = horizontal
    ? anchor(from, p1.x >= p0.x ? 1 : 0, 0.5)
    : anchor(from, 0.5, p1.y >= p0.y ? 1 : 0);
  const b = horizontal
    ? anchor(to, p1.x >= p0.x ? 0 : 1, 0.5)
    : anchor(to, 0.5, p1.y >= p0.y ? 0 : 1);
  if (Math.abs(a.y - b.y) < 2 || Math.abs(a.x - b.x) < 2) return [a, b];
  return horizontal
    ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]
    : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b];
}

function arrow(a: { x: number; y: number }, b: { x: number; y: number }, color: string) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const L = 9;
  const W = 3.6;
  const p = (s: number) =>
    `${b.x - L * Math.cos(ang) + s * W * Math.sin(ang)},${b.y - L * Math.sin(ang) - s * W * Math.cos(ang)}`;
  return `<polygon points="${b.x},${b.y} ${p(1)} ${p(-1)}" fill="${color}"/>`;
}

export interface PreviewResult {
  svg: string;
  width: number;
  height: number;
  shapes: number;
  connectors: number;
}

export function renderPreview(xml: string): PreviewResult {
  const page = xml.slice(0, xml.indexOf("<diagram", xml.indexOf("<diagram") + 1) + 1 || undefined);
  const src = page.includes("<mxGraphModel") ? page : xml;
  const { cells, by, abs } = parse(src);

  const parts: string[] = [];
  const vertices = cells.filter((c) => !c.edge && abs.has(c.id) && (c.w ?? 0) > 0);
  // paint big containers first so their children land on top
  vertices.sort((a, b) => (b.w! * b.h!) - (a.w! * a.h!));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;

  for (const c of vertices) {
    const b = abs.get(c.id)!;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);

    const st = styleMap(c.style);
    const fill = st.get("fillColor");
    const stroke = st.get("strokeColor");
    const sw = Number(st.get("strokeWidth") ?? 1);
    const dash = st.get("dashed") === "1" ? ` stroke-dasharray="6 4"` : "";
    const size = Number(st.get("fontSize") ?? 12);
    const color = st.get("fontColor") && st.get("fontColor") !== "default" ? st.get("fontColor")! : "#1D2D3E";
    const shape = st.get("shape") ?? "";

    if (shape === "mxgraph.sap.icon") {
      // Draw.io paints these from its own img/lib/sap library; we mirror the same
      // artwork under /sap-icons (see scripts/fetch-sap-icons.mjs). Geometry matches
      // mxSAPIconShape: a filled disc with the glyph inset to the middle 60%.
      parts.push(
        `<circle cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" r="${b.w / 2}" fill="${fill && fill !== "none" ? fill : "#EAF4FD"}" stroke="#D9DEE3"/>`
      );
      const icon = st.get("SAPIcon");
      // names carry hyphens ("SAP_Integration_Suite_-_Event_Mesh"); keep the check
      // strict enough that a crafted style can never walk out of /sap-icons
      if (icon && /^[A-Za-z0-9_.-]+$/.test(icon) && !icon.includes("..")) {
        parts.push(
          `<image href="/sap-icons/${icon}.svg" x="${b.x + b.w * 0.2}" y="${b.y + b.h * 0.2}" width="${b.w * 0.6}" height="${b.h * 0.6}" preserveAspectRatio="xMidYMid meet"/>`
        );
      }
      continue;
    }
    if (shape === "actor") {
      const cx = b.x + b.w / 2;
      parts.push(
        `<circle cx="${cx}" cy="${b.y + b.h * 0.22}" r="${b.w * 0.24}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>` +
          `<path d="M ${b.x} ${b.y + b.h} L ${b.x} ${b.y + b.h * 0.62} Q ${b.x} ${b.y + b.h * 0.44} ${cx} ${b.y + b.h * 0.44} Q ${b.x + b.w} ${b.y + b.h * 0.44} ${b.x + b.w} ${b.y + b.h * 0.62} L ${b.x + b.w} ${b.y + b.h} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
      parts.push(
        textSvg(labelLines(c.label), cx, b.y + b.h + 13, "middle", 11, color, true)
      );
      continue;
    }
    if (st.get("ellipse") === "1" || c.style.startsWith("ellipse")) {
      parts.push(
        `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      );
      parts.push(textSvg(labelLines(c.label), b.x + b.w / 2, b.y + b.h + 14, "middle", 11, color, true));
      continue;
    }

    const rx = st.get("rounded") === "1" ? Math.min(Number(st.get("arcSize") ?? 8), b.h / 2) : 0;
    if ((fill && fill !== "none") || (stroke && stroke !== "none")) {
      parts.push(
        `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}"` +
          ` fill="${fill && fill !== "none" ? fill : "none"}"` +
          ` stroke="${stroke && stroke !== "none" ? stroke : "none"}" stroke-width="${sw}"${dash}/>`
      );
    }

    const lines = labelLines(c.label);
    if (!lines.length) continue;
    const left = st.get("align") === "left";
    const top = st.get("verticalAlign") === "top";
    const padL = Number(st.get("spacingLeft") ?? 0);
    const maxW = st.get("whiteSpace") === "wrap" ? b.w - padL - 12 : 0;
    const wrapped = wrap(lines, maxW, size);
    const total = wrapped.reduce((s, l) => s + (l.size ?? size) + 4, 0);
    const tx = left ? b.x + padL : b.x + b.w / 2;
    const ty = top ? b.y + Number(st.get("spacingTop") ?? 0) + size + 4 : b.y + b.h / 2 - total / 2 + size;
    parts.push(
      textSvg(wrapped, tx, ty, left ? "start" : "middle", size, color, st.get("fontStyle") === "1")
    );
  }

  let connectors = 0;
  for (const e of cells.filter((c) => c.edge)) {
    const from = e.source ? abs.get(e.source) : undefined;
    const to = e.target ? abs.get(e.target) : undefined;
    if (!from || !to) continue;
    connectors++;
    const st = styleMap(e.style);
    const color = st.get("strokeColor") ?? "#5C6B7A";
    const pts = route(from, to);
    const dash = st.get("dashed") === "1" ? ` stroke-dasharray="6 4"` : "";
    parts.push(
      `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${st.get("strokeWidth") ?? 1.25}"${dash}/>`,
      arrow(pts[pts.length - 2], pts[pts.length - 1], color)
    );

    const mid = pts.length === 4 ? { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 } : { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const chip = cells.find((c) => c.parent === e.id && !c.edge);
    const text = chip ? decode(chip.label) : labelLines(e.label).map((l) => l.text).join(" ");
    if (text) {
      const w = text.length * 6 + 14;
      const cs = chip ? styleMap(chip.style) : undefined;
      parts.push(
        `<rect x="${mid.x - w / 2}" y="${mid.y - 10}" width="${w}" height="20" rx="10" fill="${cs?.get("fillColor") ?? "#FFFFFF"}" stroke="${cs?.get("strokeColor") ?? "none"}" stroke-width="1"/>`,
        `<text x="${mid.x}" y="${mid.y + 4}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#1D2D3E">${xesc(text)}</text>`
      );
    }
  }

  const pad = 24;
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
  }
  const width = Math.max(1, maxX - minX + pad * 2);
  const height = Math.max(1, maxY - minY + pad * 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${width} ${height}" ` +
    `width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="${minX - pad}" y="${minY - pad}" width="${width}" height="${height}" fill="#FFFFFF"/>` +
    parts.join("") +
    `</svg>`;

  return { svg, width, height, shapes: vertices.length, connectors };
}
