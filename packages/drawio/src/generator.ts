import {
  ArchitectureComponent,
  ArchitectureModel,
  ArchitectureZone,
  STYLE,
  ZoneKind,
} from "@sap-architect/shared";
import { isIconKind, resolveSapIcon, sapIconCell } from "./icons.js";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Card label: bold name + italic subtitle, escaped exactly once. */
function labelHtml(title: string, subtitle?: string): string {
  const t = esc(title);
  if (!subtitle) return `&lt;b&gt;${t}&lt;/b&gt;`;
  return `&lt;b&gt;${t}&lt;/b&gt;&lt;div&gt;&lt;i&gt;${esc(subtitle)}&lt;/i&gt;&lt;/div&gt;`;
}

// ── Style Contract geometry: 20px rhythm on the 2px grid ────────────────────
const UNIT = 20;
const CARD_W = 180;
const CARD_H = 60;
const ICON_SIZE = 64;
const ICON_SLOT_W = 100;
const ICON_SLOT_H = 100; // 64 icon + label below
const PAD = UNIT;
const GAP = UNIT;
/**
 * Clearance between peer components. The Architecture Center rule of thumb is roughly
 * one SAP-logo height around objects; a tight grid leaves connectors no channel and
 * their pills end up printed on the neighbouring shape.
 */
const CELL_GAP = UNIT * 3;
const ZONE_HEADER = 32; // 16pt bold area title
const HEADER_H = 100; // title band above the canvas
const MAX_COLS = 3;

/** Stroke color that owns a zone's domain — cards inherit it. */
function domainStroke(kind: ZoneKind): string {
  switch (kind) {
    case "sap-btp":
    case "sap-cloud":
      return "#0070F2";
    case "custom":
      return "#5D36FF";
    default:
      return "#475E75";
  }
}

/** Area titles sit top-left so they never print over the contents. */
const AREA_TITLE_ALIGN = "align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;";

/**
 * Area fill alternates with depth per the Style Contract
 * (filled zone → white nested area → filled sub-area); stroke follows the domain.
 */
function zoneStyle(kind: ZoneKind, depth: number): string {
  if (depth % 2 === 1) {
    return STYLE.nestedArea.replace("strokeColor=#475E75", `strokeColor=${domainStroke(kind)}`);
  }
  if (kind === "custom") {
    // The contract's accent area centres its label; an area that holds components
    // needs the title top-left instead, or it prints across the cards.
    return STYLE.accentArea.replace("align=center;", AREA_TITLE_ALIGN).replace(
      "verticalAlign=middle;",
      ""
    );
  }
  if (kind === "sap-btp" || kind === "sap-cloud") return STYLE.sapArea;
  return STYLE.nonSapArea;
}

/** White card carrying the owning zone's stroke color. */
function cardStyle(stroke: string): string {
  return STYLE.card.replace("strokeColor=#0070F2", `strokeColor=${stroke}`);
}

function edgeStyle(mode?: string, protocol?: string): string {
  if (mode === "trust") return STYLE.edgeTrust;
  if (protocol && /MCP|Vision/i.test(protocol)) {
    return STYLE.edgeAccent.replace("strokeColor=#07838f", "strokeColor=#cc00dc");
  }
  if (mode === "event" || mode === "async") return STYLE.edgeAccent;
  return STYLE.edge;
}

interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function componentFootprint(c: ArchitectureComponent): { w: number; h: number } {
  const icon = resolveSapIcon(c.officialName, c.label, c.sapIcon);
  return icon && isIconKind(c.kind)
    ? { w: ICON_SLOT_W, h: ICON_SLOT_H }
    : { w: CARD_W, h: CARD_H };
}

/** Content extent of a component grid (excludes zone padding). */
function gridSize(comps: ArchitectureComponent[]) {
  const n = comps.length;
  const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(Math.max(n, 1)))));
  const rows = Math.max(1, Math.ceil(Math.max(n, 1) / cols));
  const cellW = Math.max(...comps.map((c) => componentFootprint(c).w), CARD_W);
  const cellH = Math.max(...comps.map((c) => componentFootprint(c).h), CARD_H);
  return {
    cols,
    cellW,
    cellH,
    w: n ? cols * cellW + (cols - 1) * CELL_GAP : 0,
    h: n ? rows * cellH + (rows - 1) * CELL_GAP : 0,
  };
}

/** Hop distance of every component from the entry actors, following the flows. */
function flowRanks(model: ArchitectureModel): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  for (const f of model.flows) {
    if (!adjacency.has(f.sourceId)) adjacency.set(f.sourceId, []);
    adjacency.get(f.sourceId)!.push(f.targetId);
  }

  const rank = new Map<string, number>();
  let frontier = model.actors.map((a) => a.id);
  // seed with actors; if the model has none, seed with flow sources that are never targets
  if (!frontier.length) {
    const targets = new Set(model.flows.map((f) => f.targetId));
    frontier = model.components.filter((c) => !targets.has(c.id)).map((c) => c.id);
  }
  const seen = new Set(frontier);
  for (let depth = 0; frontier.length && depth < 32; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (!rank.has(id)) rank.set(id, depth);
      for (const t of adjacency.get(id) ?? []) {
        if (!seen.has(t)) {
          seen.add(t);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return rank;
}

/**
 * Rank zones by hop distance from the actors so the dominant flow reads
 * left-to-right: entry channels, then orchestration, then systems of record.
 */
function zoneOrder(model: ArchitectureModel): ArchitectureZone[] {
  const compRank = flowRanks(model);
  const rank = new Map<string, number>();
  for (const c of model.components) {
    const r = compRank.get(c.id);
    if (r === undefined) continue;
    const cur = rank.get(c.zoneId);
    if (cur === undefined || r < cur) rank.set(c.zoneId, r);
  }

  // Rank a parent by its earliest descendant so nested zones travel with their parent.
  const effective = (z: ArchitectureZone): number => {
    const own = rank.get(z.id);
    const kids = model.zones.filter((k) => k.parentId === z.id).map((k) => rank.get(k.id));
    const all = [own, ...kids].filter((n): n is number => n !== undefined);
    return all.length ? Math.min(...all) : 99;
  };

  const index = new Map(model.zones.map((z, i) => [z.id, i]));
  const userZoneId = userEntryZone(model)?.id;
  return model.zones
    .filter((z) => !z.parentId)
    .sort(
      (a, b) =>
        // the user-entry zone is always the leftmost column
        Number(b.id === userZoneId) - Number(a.id === userZoneId) ||
        effective(a) - effective(b) ||
        index.get(a.id)! - index.get(b.id)!
    );
}

const ACTOR_W = 60;
const ACTOR_H = 76;
const ACTOR_SLOT_W = 140;
const ACTOR_SLOT_H = 116; // actor + label below

/** Top-level zone that represents the user/device entry side, if the model has one. */
function userEntryZone(model: ArchitectureModel): ArchitectureZone | undefined {
  return model.actors.length
    ? model.zones.find((z) => !z.parentId && z.kind === "user")
    : undefined;
}

/** Actors stack as a column inside the entry zone. */
function actorBlock(count: number) {
  return count
    ? { w: ACTOR_SLOT_W, h: count * ACTOR_SLOT_H + (count - 1) * GAP }
    : { w: 0, h: 0 };
}

/** A zone is worth drawing only if it (or something below it) holds content. */
function zoneHasContent(model: ArchitectureModel, zone: ArchitectureZone): boolean {
  if (model.components.some((c) => c.zoneId === zone.id)) return true;
  return model.zones
    .filter((z) => z.parentId === zone.id)
    .some((z) => zoneHasContent(model, z));
}

interface ZoneSize {
  w: number;
  h: number;
  own: { h: number };
  acts: { h: number };
  kids: Array<{ zone: ArchitectureZone; size: ZoneSize }>;
}

/** Recursive size of a zone: own component grid, then each nested area stacked below. */
function measureZone(
  model: ArchitectureModel,
  zone: ArchitectureZone,
  actorCount: number,
  depth = 0
): ZoneSize {
  const own = gridSize(model.components.filter((c) => c.zoneId === zone.id));
  const acts = actorBlock(actorCount);
  const kids =
    depth < 6
      ? model.zones
          .filter((z) => z.parentId === zone.id && zoneHasContent(model, z))
          .map((z) => ({ zone: z, size: measureZone(model, z, 0, depth + 1) }))
      : [];

  const w = Math.max(
    220,
    own.w + PAD * 2,
    acts.w + PAD * 2,
    ...kids.map((k) => k.size.w + PAD * 2)
  );
  const blocks = [acts.h, own.h, ...kids.map((k) => k.size.h)].filter((n) => n > 0);
  const stacked = blocks.reduce((s, n) => s + n, 0) + Math.max(0, blocks.length - 1) * GAP;
  const h = Math.max(160, ZONE_HEADER + PAD + stacked + PAD);
  return { w, h, own, acts, kids };
}

/** Absolute boxes for every zone (top-level laid out left-to-right, nested stacked below). */
function layoutZones(model: ArchitectureModel): Map<string, LayoutBox> {
  const map = new Map<string, LayoutBox>();
  const userZoneId = userEntryZone(model)?.id;
  let x = 40;
  const y = HEADER_H + UNIT;

  const place = (
    zone: ArchitectureZone,
    size: ZoneSize,
    bx: number,
    by: number,
    width: number
  ) => {
    map.set(zone.id, { x: bx, y: by, w: width, h: size.h });
    let cy = by + ZONE_HEADER + PAD;
    if (size.acts.h) cy += size.acts.h + GAP;
    if (size.own.h) cy += size.own.h + GAP;
    for (const k of size.kids) {
      place(k.zone, k.size, bx + PAD, cy, width - PAD * 2);
      cy += k.size.h + GAP;
    }
  };

  for (const zone of zoneOrder(model)) {
    // An area with nothing in it communicates nothing — drop it.
    if (!zoneHasContent(model, zone) && zone.id !== userZoneId) continue;
    const size = measureZone(model, zone, zone.id === userZoneId ? model.actors.length : 0);
    place(zone, size, x, y, size.w);
    // Wide gutter between zones: cross-zone connectors need room for their
    // orthogonal jog plus a protocol pill and an edge label without colliding.
    x += size.w + UNIT * 5;
  }
  return map;
}

function layoutComponents(
  model: ArchitectureModel,
  zoneLayout: Map<string, LayoutBox>
): Map<string, LayoutBox> {
  const map = new Map<string, LayoutBox>();
  const byZone = new Map<string, ArchitectureComponent[]>();
  for (const c of model.components) {
    const list = byZone.get(c.zoneId) ?? [];
    list.push(c);
    byZone.set(c.zoneId, list);
  }

  // Order peers by flow rank so connected components sit next to each other —
  // long crossing connectors are what drag pills and labels over other shapes.
  const rank = flowRanks(model);
  const order = new Map(model.components.map((c, i) => [c.id, i]));

  // A component that feeds a nested area drops its connector straight down into it.
  // Put those in the last row, adjacent to that area, so the connector does not cut
  // through the siblings sitting between them.
  const zoneById = new Map(model.zones.map((z) => [z.id, z]));
  const isDescendant = (child: string, ancestor: string) => {
    let z = zoneById.get(child);
    for (let i = 0; z?.parentId && i < 8; i++) {
      if (z.parentId === ancestor) return true;
      z = zoneById.get(z.parentId);
    }
    return false;
  };
  const compById = new Map(model.components.map((c) => [c.id, c]));
  const feedsNested = new Set<string>();
  for (const f of model.flows) {
    const s = compById.get(f.sourceId);
    const t = compById.get(f.targetId);
    if (!s || !t || s.zoneId === t.zoneId) continue;
    if (isDescendant(t.zoneId, s.zoneId)) feedsNested.add(s.id);
    if (isDescendant(s.zoneId, t.zoneId)) feedsNested.add(t.id);
  }

  for (const list of byZone.values()) {
    list.sort(
      (a, b) =>
        Number(feedsNested.has(a.id)) - Number(feedsNested.has(b.id)) ||
        (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) ||
        order.get(a.id)! - order.get(b.id)!
    );
  }

  const userZoneId = userEntryZone(model)?.id;
  for (const [zoneId, comps] of byZone) {
    const zone = zoneLayout.get(zoneId);
    if (!zone) continue;
    const acts = actorBlock(zoneId === userZoneId ? model.actors.length : 0);
    const top = zone.y + ZONE_HEADER + PAD + acts.h + (acts.h ? GAP : 0);
    const { cols, cellW, cellH } = gridSize(comps);
    comps.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fp = componentFootprint(c);
      map.set(c.id, {
        x: zone.x + PAD + col * (cellW + CELL_GAP) + Math.floor((cellW - fp.w) / 2),
        y: top + row * (cellH + CELL_GAP),
        w: fp.w,
        h: fp.h,
      });
    });
  }
  return map;
}

/** Actors sit inside the entry zone when the model has one, else in the left gutter. */
function actorLayout(
  model: ArchitectureModel,
  zoneLayout: Map<string, LayoutBox>
): Map<string, LayoutBox> {
  const map = new Map<string, LayoutBox>();
  const zone = userEntryZone(model);
  const box = zone ? zoneLayout.get(zone.id) : undefined;
  model.actors.forEach((a, i) => {
    const slotY = i * (ACTOR_SLOT_H + GAP);
    map.set(
      a.id,
      box
        ? {
            x: box.x + PAD + Math.floor((ACTOR_SLOT_W - ACTOR_W) / 2),
            y: box.y + ZONE_HEADER + PAD + slotY,
            w: ACTOR_W,
            h: ACTOR_H,
          }
        : {
            x: 40 + Math.floor((ACTOR_SLOT_W - ACTOR_W) / 2),
            y: HEADER_H + UNIT + slotY,
            w: ACTOR_W,
            h: ACTOR_H,
          }
    );
  });
  return map;
}

const CLOUD_KINDS = new Set<ZoneKind>(["sap-btp", "sap-cloud", "hyperscaler"]);
const PREMISE_KINDS = new Set<ZoneKind>(["on-premise", "partner"]);

/**
 * A real trust/connectivity boundary exists wherever a cloud zone abuts an
 * on-premise or partner zone. Derived from the model's own zone kinds — never
 * invented, because a barrier that is not really there misstates the security design.
 */
function networkBoundaries(
  ordered: ArchitectureZone[],
  zoneLayout: Map<string, LayoutBox>
): Array<{ x: number; y1: number; y2: number }> {
  const placed = ordered.filter((z) => zoneLayout.has(z.id));
  const out: Array<{ x: number; y1: number; y2: number }> = [];
  for (let i = 0; i < placed.length - 1; i++) {
    const a = placed[i];
    const b = placed[i + 1];
    const crosses =
      (CLOUD_KINDS.has(a.kind) && PREMISE_KINDS.has(b.kind)) ||
      (PREMISE_KINDS.has(a.kind) && CLOUD_KINDS.has(b.kind));
    if (!crosses) continue;
    const ba = zoneLayout.get(a.id)!;
    const bb = zoneLayout.get(b.id)!;
    out.push({
      x: Math.round((ba.x + ba.w + bb.x) / 2),
      y1: Math.min(ba.y, bb.y) - UNIT * 2,
      y2: Math.max(ba.y + ba.h, bb.y + bb.h) + UNIT,
    });
  }
  return out;
}

const UNDER = "exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;";

/**
 * Edge anchors follow the dominant flow direction so orthogonal routing stays clean.
 * `longHaul` marks a connector that skips over an intervening zone: routed straight it
 * would cross that zone's components, so it dips under the row instead.
 */
function edgeAnchors(from: LayoutBox, to: LayoutBox, longHaul = false): string {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  if (longHaul) return UNDER;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // A return path (event/callback) drawn straight back would cut through every
    // component between the two ends — send it under the row instead.
    return dx >= 0
      ? "exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;"
      : UNDER;
  }
  return dy >= 0
    ? "exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;"
    : "exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;";
}

export interface GenerateOptions {
  pageName?: string;
  pageWidth?: number;
  pageHeight?: number;
}

export function generateDrawioXml(
  model: ArchitectureModel,
  options: GenerateOptions = {}
): string {
  const pageName = options.pageName ?? "L1 Overview";
  const zoneLayout = layoutZones(model);
  // Without a user-entry zone, reserve a left gutter for the actor column.
  const gutter = model.actors.length && !userEntryZone(model) ? ACTOR_SLOT_W + UNIT * 2 : 0;
  if (gutter) for (const box of zoneLayout.values()) box.x += gutter;

  const compLayout = layoutComponents(model, zoneLayout);
  const actors = actorLayout(model, zoneLayout);

  const zoneById = new Map(model.zones.map((z) => [z.id, z]));
  const strokeOfZone = (zoneId: string) =>
    domainStroke(zoneById.get(zoneId)?.kind ?? "custom");
  const depthOf = (z: ArchitectureZone): number => {
    let d = 0;
    let cur = z;
    while (cur.parentId && zoneById.has(cur.parentId) && d < 8) {
      cur = zoneById.get(cur.parentId)!;
      d++;
    }
    return d;
  };

  const cells: string[] = [];
  cells.push(`        <mxCell id="0"/>`);
  cells.push(`        <mxCell id="1" parent="0"/>`);

  // ── Title band ────────────────────────────────────────────────────────────
  cells.push(
    `        <mxCell id="title" value="${esc(model.title)}" style="${STYLE.title}" vertex="1" parent="1">
          <mxGeometry x="40" y="28" width="1100" height="30" as="geometry"/>
        </mxCell>`
  );
  if (model.summary) {
    cells.push(
      `        <mxCell id="subtitle" value="${esc(model.summary)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontFamily=Helvetica;fontSize=12;fontColor=#556B82;" vertex="1" parent="1">
          <mxGeometry x="40" y="62" width="1100" height="32" as="geometry"/>
        </mxCell>`
    );
  }

  // ── Zones: outermost first, each child parented to its zone ───────────────
  const orderedZones = [...model.zones].sort((a, b) => depthOf(a) - depthOf(b));
  for (const zone of orderedZones) {
    const box = zoneLayout.get(zone.id);
    if (!box) continue;
    const depth = depthOf(zone);
    const parentId = zone.parentId && zoneLayout.has(zone.parentId) ? zone.parentId : "1";
    const origin = parentId === "1" ? { x: 0, y: 0 } : zoneLayout.get(parentId)!;
    const label =
      depth > 0
        ? `&lt;font style=&quot;font-size: 14px;&quot;&gt;${esc(zone.label)}&lt;/font&gt;`
        : esc(zone.label);
    cells.push(
      `        <mxCell id="${esc(zone.id)}" value="${label}" style="${zoneStyle(zone.kind, depth)}" vertex="1" parent="${esc(parentId)}">
          <mxGeometry x="${box.x - origin.x}" y="${box.y - origin.y}" width="${box.w}" height="${box.h}" as="geometry"/>
        </mxCell>`
    );
  }

  // ── Actors: native vector shape + label below, parented to the entry zone ─
  const entryZoneId = userEntryZone(model)?.id;
  const entryBox = entryZoneId ? zoneLayout.get(entryZoneId) : undefined;
  for (const actor of model.actors) {
    const box = actors.get(actor.id)!;
    const label = actor.role ? `${actor.label}\n${actor.role}` : actor.label;
    const parentId = entryBox ? entryZoneId! : "1";
    const origin = entryBox ?? { x: 0, y: 0 };
    cells.push(
      `        <mxCell id="${esc(actor.id)}" value="${esc(label).replace(/\n/g, "&#xa;")}" style="shape=actor;whiteSpace=wrap;html=1;fillColor=#FFCC99;strokeColor=#475E75;strokeWidth=1.5;verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;fontFamily=Helvetica;fontSize=12;fontStyle=1;fontColor=default;" vertex="1" parent="${esc(parentId)}">
          <mxGeometry x="${box.x - origin.x}" y="${box.y - origin.y}" width="${box.w}" height="${box.h}" as="geometry"/>
        </mxCell>`
    );
  }

  // ── Components, parented to their zone so groups move together ────────────
  let iconCount = 0;
  for (const comp of model.components) {
    const box = compLayout.get(comp.id);
    if (!box) continue;
    const zoneBox = zoneLayout.get(comp.zoneId);
    const parentId = zoneBox ? comp.zoneId : "1";
    const origin = zoneBox ?? { x: 0, y: 0 };
    const lx = box.x - origin.x;
    const ly = box.y - origin.y;

    const iconName = resolveSapIcon(comp.officialName, comp.label, comp.sapIcon);
    if (iconName && isIconKind(comp.kind)) {
      iconCount++;
      cells.push(
        sapIconCell(
          esc(comp.id),
          iconName,
          comp.officialName ?? comp.label,
          lx + Math.floor((box.w - ICON_SIZE) / 2),
          ly,
          ICON_SIZE,
          esc(parentId)
        )
      );
    } else {
      // SaaS products and custom components: white card, owning domain's stroke
      cells.push(
        `        <mxCell id="${esc(comp.id)}" value="${labelHtml(comp.officialName ?? comp.label, comp.subtitle)}" style="${cardStyle(strokeOfZone(comp.zoneId))}" vertex="1" parent="${esc(parentId)}">
          <mxGeometry x="${lx}" y="${ly}" width="${box.w}" height="${box.h}" as="geometry"/>
        </mxCell>`
      );
    }
  }

  // Column of the top-level zone each component lives in, so a connector can tell
  // whether it merely steps to the neighbouring zone or skips over one.
  const placedTop = zoneOrder(model).filter((z) => zoneLayout.has(z.id));
  const colOfZone = new Map(placedTop.map((z, i) => [z.id, i]));
  const topAncestor = (zoneId: string): string => {
    let z = zoneById.get(zoneId);
    for (let i = 0; z?.parentId && i < 8; i++) z = zoneById.get(z.parentId);
    return z?.id ?? zoneId;
  };
  const componentById = new Map(model.components.map((c) => [c.id, c]));
  const columnOf = (id: string): number | undefined => {
    const c = componentById.get(id);
    if (c) return colOfZone.get(topAncestor(c.zoneId));
    return entryZoneId ? colOfZone.get(entryZoneId) : undefined;
  };

  // ── Flows ─────────────────────────────────────────────────────────────────
  let underRoutes = 0;
  let underDip = 0;
  const usedTrust = { value: false };
  const usedTeal = { value: false };
  const usedPink = { value: false };

  for (const flow of model.flows) {
    const from = compLayout.get(flow.sourceId) ?? actors.get(flow.sourceId);
    const to = compLayout.get(flow.targetId) ?? actors.get(flow.targetId);
    if (!from || !to) continue;

    const sc = columnOf(flow.sourceId);
    const tc = columnOf(flow.targetId);
    // Cross-cutting trust/identity flows are routed last and beneath the row, so they
    // fan out from the identity boundary instead of cutting through the service grid.
    const longHaul =
      flow.mode === "trust" ||
      (sc !== undefined && tc !== undefined && Math.abs(tc - sc) > 1);
    const anchors = edgeAnchors(from, to, longHaul);
    if (anchors === UNDER) underRoutes++;
    let style = `${edgeStyle(flow.mode, flow.protocol)}${anchors}`;
    if (flow.bidirectional) {
      style = style.replace("startArrow=none", "startArrow=blockThin;startFill=1");
    }
    if (flow.mode === "trust") usedTrust.value = true;

    // A pill needs a clear run of connector to sit on. Between close neighbours the
    // midpoint falls inside one of the shapes, so fall back to a plain edge label.
    const pillW = flow.protocol ? Math.max(48, flow.protocol.length * 9) : 0;
    const gapX = Math.max(from.x, to.x) - Math.min(from.x + from.w, to.x + to.w);
    const gapY = Math.max(from.y, to.y) - Math.min(from.y + from.h, to.y + to.h);
    const room = gapX >= pillW + 24 || gapY >= 24 + 24;

    const usePill =
      Boolean(flow.protocol) &&
      room &&
      (flow.mode === "async" || flow.mode === "event" || /A2A|MCP|OData|REST/i.test(flow.protocol!));
    const isPink = Boolean(flow.protocol && /MCP|Vision/i.test(flow.protocol));
    if (usePill) {
      if (isPink) usedPink.value = true;
      else usedTeal.value = true;
    }

    const labelParts: string[] = [];
    if (flow.label) labelParts.push(flow.label);
    if (flow.protocol && !usePill) labelParts.push(flow.protocol);
    const value =
      flow.mode === "trust"
        ? `&lt;font color=&quot;#188918&quot; size=&quot;1&quot;&gt;&lt;b&gt;TRUST&lt;/b&gt;&lt;/font&gt;`
        : esc(labelParts.join(" · "));

    // The pill owns the midpoint, so shift the edge's own label toward the source;
    // both default to x=0 and would otherwise print on top of each other.
    const labelPos = usePill && value ? ` x="-0.6"` : "";
    const inner: string[] = [];
    if (usePill && value) inner.push(`<mxPoint as="offset"/>`);
    if (anchors === UNDER) {
      // An icon's label hangs below its 64px cell, so routing "just under the shape"
      // still crosses it. Pin the dip below the deepest label instead.
      const dip = Math.round(Math.max(from.y + from.h, to.y + to.h) + ICON_SLOT_H - ICON_SIZE + UNIT);
      const midX = Math.round((from.x + from.w / 2 + to.x + to.w / 2) / 2);
      underDip = Math.max(underDip, dip);
      inner.push(`<Array as="points"><mxPoint x="${midX}" y="${dip}"/></Array>`);
    }
    const labelGeom = inner.length
      ? `<mxGeometry${labelPos} relative="1" as="geometry">${inner.join("")}</mxGeometry>`
      : `<mxGeometry${labelPos} relative="1" as="geometry"/>`;
    cells.push(
      `        <mxCell id="${esc(flow.id)}" value="${value}" style="${style}" edge="1" parent="1" source="${esc(flow.sourceId)}" target="${esc(flow.targetId)}">
          ${labelGeom}
        </mxCell>`
    );

    // Protocol pill rides the connector — the pill and its line are one channel.
    if (usePill) {
      const pillStyle = isPink
        ? "rounded=1;whiteSpace=wrap;html=1;arcSize=50;strokeColor=#CC00DC;fillColor=#fff0fa;strokeWidth=1.5;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=12;fontColor=default;resizable=0;points=[];"
        : `${STYLE.pill}resizable=0;points=[];`;
      cells.push(
        `        <mxCell id="pill-${esc(flow.id)}" value="${esc(flow.protocol!)}" style="${pillStyle}" vertex="1" connectable="0" parent="${esc(flow.id)}">
          <mxGeometry x="0" relative="1" width="${Math.max(48, flow.protocol!.length * 9)}" height="24" as="geometry">
            <mxPoint as="offset"/>
          </mxGeometry>
        </mxCell>`
      );
    }
  }

  // ── Network barriers where a cloud zone meets on-premise / partner ────────
  const barriers = networkBoundaries(zoneOrder(model), zoneLayout);
  barriers.forEach((b, i) => {
    cells.push(
      `        <mxCell id="network-barrier-${i}" value="Network" style="edgeStyle=none;orthogonalLoop=1;jettySize=auto;html=1;rounded=0;endArrow=none;endFill=0;strokeWidth=4;strokeColor=#475e75;jumpStyle=gap;fontFamily=Helvetica;fontSize=12;fontColor=#475E75;labelBackgroundColor=default;verticalAlign=top;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${b.x}" y="${b.y1}" as="sourcePoint"/>
            <mxPoint x="${b.x}" y="${b.y2}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>`
    );
  });

  // ── Canvas extent ─────────────────────────────────────────────────────────
  let maxX = 900;
  let maxY = 520;
  for (const b of [...zoneLayout.values(), ...compLayout.values(), ...actors.values()]) {
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  // channel under the zones for connectors that dip below an intervening area
  if (underRoutes) maxY = Math.max(maxY + UNIT * 2, underDip + UNIT * 2);

  // ── Legend: only the symbols this diagram actually uses ───────────────────
  const kinds = new Set(model.zones.map((z) => z.kind));
  const entries: string[] = [];
  if ([...kinds].some((k) => k === "sap-btp" || k === "sap-cloud"))
    entries.push("Blue area — SAP / SAP BTP");
  if ([...kinds].some((k) => !["sap-btp", "sap-cloud", "custom"].includes(k)))
    entries.push("Grey area — non-SAP / partner / user");
  if (kinds.has("custom")) entries.push("Indigo area — custom-built domain");
  if (iconCount) entries.push("64×64 grey tile — official SAP service icon");
  entries.push("White card — SaaS product or custom component");
  entries.push("Grey arrow — data / control flow");
  if (usedTrust.value) entries.push("Green edge — trust / authentication");
  if (usedTeal.value) entries.push("Teal pill — agent / async channel");
  if (usedPink.value) entries.push("Pink pill — MCP tool channel");
  if (barriers.length) entries.push("Thick grey line — network barrier");
  if (model.flows.some((f) => f.bidirectional)) entries.push("Double arrow — mutual flow");

  const legendW = 320;
  const legendH = 40 + entries.length * 18;
  const legendY = maxY + UNIT * 2;
  const legendValue = [
    `&lt;b&gt;Legend&lt;/b&gt;`,
    ...entries.map((e) => `• ${esc(e)}`),
  ].join("&#xa;");
  cells.push(
    `        <mxCell id="legend" value="${legendValue}" style="${STYLE.legend}" vertex="1" parent="1">
          <mxGeometry x="40" y="${legendY}" width="${legendW}" height="${legendH}" as="geometry"/>
        </mxCell>`
  );

  const pageWidth = options.pageWidth ?? Math.ceil((maxX + 40) / UNIT) * UNIT;
  const pageHeight = options.pageHeight ?? Math.ceil((legendY + legendH + 40) / UNIT) * UNIT;

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="SAP Architect Builder" version="28.1.2" pages="1">
  <diagram name="${esc(pageName)}" id="l1-overview">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="2" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0">
      <root>
${cells.join("\n")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}
