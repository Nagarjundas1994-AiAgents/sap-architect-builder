/**
 * Draw.io document emission.
 *
 * Two things matter for an editable deliverable:
 *  - named layers, so an editor can hide connectors or annotations while working;
 *  - semantic identity, so cells are findable and scriptable. Shapes are wrapped in
 *    <object> with a readable label plus type/role metadata rather than being an
 *    anonymous <mxCell> with a colour.
 */

export function esc(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape a label that legitimately carries inline HTML (bold name / italic subtitle). */
export function labelMarkup(title: string, subtitle?: string): string {
  const t = `&lt;b&gt;${esc(title)}&lt;/b&gt;`;
  return subtitle ? `${t}&lt;div&gt;&lt;i&gt;${esc(subtitle)}&lt;/i&gt;&lt;/div&gt;` : t;
}

/** Plain-text label with newline breaks, for shapes whose style has no html=1. */
export function plainLabel(text: string): string {
  return esc(text).replace(/\n/g, "&#xa;");
}

export interface Layer {
  id: string;
  name: string;
  cells: string[];
}

export class DiagramDoc {
  private layers: Layer[] = [];
  private ids = new Set<string>();

  constructor(
    private readonly pageName: string,
    private opts: { width: number; height: number } = { width: 1600, height: 1000 }
  ) {}

  /** Canvas is measured from content, so the page size is set after assembly. */
  resize(width: number, height: number): void {
    this.opts = { width, height };
  }

  layer(id: string, name: string): Layer {
    const existing = this.layers.find((l) => l.id === id);
    if (existing) return existing;
    const l: Layer = { id, name, cells: [] };
    this.layers.push(l);
    return l;
  }

  /** Reserve a unique cell id, disambiguating collisions rather than emitting duplicates. */
  uniqueId(preferred: string): string {
    let id = preferred.replace(/[^\w.:-]+/g, "-");
    let n = 2;
    while (this.ids.has(id)) id = `${preferred}-${n++}`;
    this.ids.add(id);
    return id;
  }

  /**
   * A shape carrying semantic metadata. `attrs` become searchable properties in
   * Draw.io's Edit Data dialog.
   */
  shape(
    layer: Layer,
    args: {
      id: string;
      label: string;
      style: string;
      x: number;
      y: number;
      w: number;
      h: number;
      parent?: string;
      attrs?: Record<string, string | undefined>;
    }
  ): void {
    const attrs = Object.entries(args.attrs ?? {})
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}="${esc(v!)}"`)
      .join(" ");
    layer.cells.push(
      `        <object label="${args.label}" ${attrs} id="${esc(args.id)}">
          <mxCell style="${args.style}" vertex="1" parent="${esc(args.parent ?? layer.id)}">
            <mxGeometry x="${Math.round(args.x)}" y="${Math.round(args.y)}" width="${Math.round(args.w)}" height="${Math.round(args.h)}" as="geometry"/>
          </mxCell>
        </object>`
    );
  }

  /** A connector between two shapes. */
  edge(
    layer: Layer,
    args: {
      id: string;
      label?: string;
      style: string;
      source: string;
      target: string;
      /** Relative label position along the path, -1..1. */
      labelPos?: number;
      /** Pixel offset from that point, used to separate labels of coincident edges. */
      labelOffset?: { x: number; y: number };
      waypoints?: Array<{ x: number; y: number }>;
      attrs?: Record<string, string | undefined>;
    }
  ): void {
    const attrs = Object.entries(args.attrs ?? {})
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}="${esc(v!)}"`)
      .join(" ");
    const inner: string[] = [];
    if (args.labelPos !== undefined || args.labelOffset) {
      const o = args.labelOffset;
      inner.push(
        o ? `<mxPoint x="${Math.round(o.x)}" y="${Math.round(o.y)}" as="offset"/>` : `<mxPoint as="offset"/>`
      );
    }
    if (args.waypoints?.length) {
      inner.push(
        `<Array as="points">${args.waypoints
          .map((p) => `<mxPoint x="${Math.round(p.x)}" y="${Math.round(p.y)}"/>`)
          .join("")}</Array>`
      );
    }
    const pos = args.labelPos !== undefined ? ` x="${args.labelPos}"` : "";
    const geom = inner.length
      ? `<mxGeometry${pos} relative="1" as="geometry">${inner.join("")}</mxGeometry>`
      : `<mxGeometry${pos} relative="1" as="geometry"/>`;
    layer.cells.push(
      `        <object label="${args.label ?? ""}" ${attrs} id="${esc(args.id)}">
          <mxCell style="${args.style}" edge="1" parent="${esc(layer.id)}" source="${esc(args.source)}" target="${esc(args.target)}">
            ${geom}
          </mxCell>
        </object>`
    );
  }

  /** A free-standing line anchored on explicit points (separators, rules). */
  freeEdge(
    layer: Layer,
    args: { id: string; label?: string; style: string; from: { x: number; y: number }; to: { x: number; y: number } }
  ): void {
    layer.cells.push(
      `        <mxCell id="${esc(args.id)}" value="${esc(args.label ?? "")}" style="${args.style}" edge="1" parent="${esc(layer.id)}">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${Math.round(args.from.x)}" y="${Math.round(args.from.y)}" as="sourcePoint"/>
            <mxPoint x="${Math.round(args.to.x)}" y="${Math.round(args.to.y)}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>`
    );
  }

  /** A label attached to an edge (interface chip). */
  edgeLabel(
    layer: Layer,
    args: { id: string; label: string; style: string; parent: string; w: number; h: number; pos?: number }
  ): void {
    layer.cells.push(
      `        <mxCell id="${esc(args.id)}" value="${esc(args.label)}" style="${args.style}" vertex="1" connectable="0" parent="${esc(args.parent)}">
          <mxGeometry x="${args.pos ?? 0}" relative="1" width="${Math.round(args.w)}" height="${Math.round(args.h)}" as="geometry">
            <mxPoint as="offset"/>
          </mxGeometry>
        </mxCell>`
    );
  }

  toXml(): string {
    const layerCells = this.layers
      .map(
        (l) =>
          `        <mxCell id="${esc(l.id)}" value="${esc(l.name)}" parent="0"/>\n${l.cells.join("\n")}`
      )
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="Architecture Diagram Platform" version="28.1.2" pages="1">
  <diagram name="${esc(this.pageName)}" id="${esc(this.pageName.toLowerCase().replace(/[^\w]+/g, "-"))}">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="8" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.round(this.opts.width)}" pageHeight="${Math.round(this.opts.height)}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
${layerCells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
  }
}
