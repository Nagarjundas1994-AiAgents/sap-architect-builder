import type {
  ArchitectureComponent,
  ArchitectureModel,
  ArchitectureRole,
  ArchitectureZone,
  ComponentKind,
  FlowMode,
  ZoneKind,
} from "@sap-architect/shared";
import { resolveSapIcon } from "./icons.js";
import { generateSequenceXml } from "./sequence.js";
import { profileFor, stereotypeMarkup } from "./styles.js";
import { layoutTree, type LayoutEdge, type TreeNode } from "./layout.js";
import { DiagramDoc, esc, labelMarkup } from "./mxfile.js";
import {
  FLOW_LABEL,
  GRID,
  INK,
  PALETTE,
  SPACE,
  TYPE,
  actorStyle,
  areaStyle,
  boundaryStyle,
  cardStyle,
  groupCardStyle,
  moduleStyle,
  type Emphasis,
  chipStyle,
  connectorStyle,
  legendStyle,
  separatorStyle,
  subtitleStyle,
  titleStyle,
  type FlowSemantic,
  type Role,
} from "./theme.js";

// ── Uniform object sizes keep the grid honest and the layout tidy ──────────
const CARD_W = 200;
const CARD_H = 64;
const GLYPH = 40;
const MODULE_W = 176;
const MODULE_H = 32;
const GROUP_HEADER = 40;
const GLYPH_SM = 24;
const ACTOR_W = 48;
const ACTOR_H = 64;
const HEADER_H = 96;

const ZONE_ROLE: Record<ZoneKind, Role> = {
  "sap-btp": "platform",
  "sap-cloud": "platform",
  "on-premise": "external",
  hyperscaler: "external",
  partner: "external",
  user: "neutral",
  network: "edge",
  custom: "application",
};

const COMPONENT_ROLE: Partial<Record<ComponentKind, Role>> = {
  database: "data",
  integration: "integration",
  identity: "security",
  agent: "application",
  "custom-app": "application",
  external: "external",
  actor: "neutral",
};

const FLOW_SEMANTIC: Record<FlowMode, FlowSemantic> = {
  sync: "control",
  async: "async",
  event: "event",
  batch: "batch",
  trust: "trust",
  admin: "control",
};

function zoneRole(z: ArchitectureZone): Role {
  return (z.role as Role | undefined) ?? ZONE_ROLE[z.kind] ?? "neutral";
}

function componentRole(c: ArchitectureComponent, zones: Map<string, ArchitectureZone>): Role {
  if (c.role) return c.role as Role;
  const own = COMPONENT_ROLE[c.kind];
  if (own) return own;
  const z = zones.get(c.zoneId);
  return z ? zoneRole(z) : "neutral";
}

function flowSemantic(mode?: FlowMode, protocol?: string): FlowSemantic {
  if (mode) return FLOW_SEMANTIC[mode] ?? "data";
  if (protocol && /event|kafka|mesh|pubsub/i.test(protocol)) return "event";
  return "data";
}

export interface GenerateOptions {
  pageName?: string;
  /** Force canvas size; by default it is measured from the content. */
  pageWidth?: number;
  pageHeight?: number;
}

export function generateDrawioXml(
  model: ArchitectureModel,
  options: GenerateOptions = {}
): string {
  const profile = profileFor(model.style);
  if (profile.temporal) return generateSequenceXml(model, { pageName: options.pageName });

  const zones = new Map((model.zones ?? []).map((z) => [z.id, z]));
  const components = model.components ?? [];
  const actors = model.actors ?? [];
  const flows = model.flows ?? [];

  // Innermost zone owns a component; ancestors are derived as bounding boxes.
  const ancestorsOf = (zoneId: string): ArchitectureZone[] => {
    const chain: ArchitectureZone[] = [];
    let z = zones.get(zoneId);
    for (let i = 0; z && i < 8; i++) {
      chain.push(z);
      z = z.parentId ? zones.get(z.parentId) : undefined;
    }
    return chain;
  };

  // Actors live in whichever zone is marked user-facing, else a synthetic entry zone.
  const entryZone = zones.get(
    (model.zones ?? []).find((z) => !z.parentId && z.kind === "user")?.id ?? ""
  );
  const ACTOR_GROUP = entryZone?.id ?? "__actors__";

  // ── Layout ───────────────────────────────────────────────────────────────
  // Build the containment tree: zones nest, components and actors are the leaves.
  // A container is sized from its children, so nothing can escape its parent.
  const childZones = (parentId?: string) =>
    (model.zones ?? []).filter((z) => (z.parentId ?? undefined) === parentId);

  // A component may contain other components (a runtime holding its services), so
  // the leaves of the zone tree are themselves trees.
  const childComponents = (parentId?: string) =>
    components.filter((c) => (c.parentId ?? undefined) === parentId);

  const buildComponent = (c: ArchitectureComponent, depth: number): TreeNode => {
    const kids = childComponents(c.id);
    if (!kids.length) {
      return depth === 0
        ? { id: c.id, w: CARD_W, h: CARD_H }
        : { id: c.id, w: MODULE_W, h: MODULE_H };
    }
    return {
      id: c.id,
      header: GROUP_HEADER,
      pad: SPACE.sm,
      children: kids.map((k) => buildComponent(k, depth + 1)),
    };
  };

  const buildZone = (z: ArchitectureZone): TreeNode => ({
    id: z.id,
    header: SPACE.lg - GRID,
    pad: SPACE.md,
    children: [
      ...(z.id === ACTOR_GROUP
        ? actors.map((a) => ({ id: a.id, w: ACTOR_W, h: ACTOR_H }))
        : []),
      ...components
        .filter((c) => c.zoneId === z.id && !c.parentId)
        .map((c) => buildComponent(c, 0)),
      ...childZones(z.id).map(buildZone),
    ],
  });

  const rootChildren: TreeNode[] = childZones(undefined).map(buildZone);
  if (!entryZone && actors.length) {
    rootChildren.unshift(...actors.map((a) => ({ id: a.id, w: ACTOR_W, h: ACTOR_H })));
  }
  const tree: TreeNode = {
    id: "__canvas__",
    header: 0,
    pad: 0,
    children: rootChildren,
  };

  const edges: LayoutEdge[] = flows.map((f) => ({
    id: f.id,
    source: f.sourceId,
    target: f.targetId,
  }));

  const laid = layoutTree(tree, edges, {
    origin: { x: SPACE.lg, y: HEADER_H + SPACE.md },
    columnGap: SPACE.xl + SPACE.md, // 88 — room for interface chips
    nodeGap: SPACE.lg, // 40 — routing channel between stacked cards
    header: SPACE.lg - GRID,
    pad: SPACE.md,
  });

  const zoneBox = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const z of model.zones ?? []) {
    const b = laid.boxes.get(z.id);
    if (b) zoneBox.set(z.id, b);
  }
  const nodeBox = (id: string) => laid.boxes.get(id);

  // ── Document ─────────────────────────────────────────────────────────────
  const doc = new DiagramDoc(options.pageName ?? `${profile.page} · ${model.level}`, {
    width: 1600,
    height: 1000,
  });
  // first layer keeps id "1" so the file opens with a conventional default layer
  const lArch = doc.layer("1", "Architecture");
  const lBounds = doc.layer("layer-boundaries", "Boundaries");
  const lFlows = doc.layer("layer-flows", "Connections");
  const lNotes = doc.layer("layer-annotations", "Annotations");

  for (const z of [...zones.values()]) doc.uniqueId(z.id);
  for (const c of components) doc.uniqueId(c.id);
  for (const a of actors) doc.uniqueId(a.id);

  // Zones: outermost first so children paint on top; each parented to its parent zone.
  const depthOf = (z: ArchitectureZone) => ancestorsOf(z.id).length - 1;
  const ordered = [...(model.zones ?? [])]
    .filter((z) => zoneBox.has(z.id))
    .sort((a, b) => depthOf(a) - depthOf(b));

  for (const z of ordered) {
    const b = zoneBox.get(z.id)!;
    const parent = z.parentId && zoneBox.has(z.parentId) ? z.parentId : lArch.id;
    const origin = parent === lArch.id ? { x: 0, y: 0 } : zoneBox.get(parent)!;
    const depth = depthOf(z);
    const role = zoneRole(z);
    const style = z.boundary ? boundaryStyle(role) : areaStyle(role, depth);
    const target = z.boundary ? lBounds : lArch;
    // a boundary overlay is not a container, so it stays on the layer, not nested
    const useParent = z.boundary ? lBounds.id : parent;
    const useOrigin = z.boundary ? { x: 0, y: 0 } : origin;
    doc.shape(target, {
      id: z.id,
      label:
        (profile.zoneStereotype?.(z) ? stereotypeMarkup(profile.zoneStereotype(z)!) : "") +
        esc(z.label),
      style,
      x: b.x - useOrigin.x,
      y: b.y - useOrigin.y,
      w: b.w,
      h: b.h,
      parent: useParent,
      attrs: {
        type: z.boundary ? `boundary:${z.boundary}` : "zone",
        role,
        environment: z.environment,
        tenant: z.tenant,
      },
    });
  }

  // Actors
  for (const a of actors) {
    const box = nodeBox(a.id);
    if (!box) continue;
    const parent = entryZone && zoneBox.has(ACTOR_GROUP) ? ACTOR_GROUP : lArch.id;
    const origin = parent === lArch.id ? { x: 0, y: 0 } : zoneBox.get(parent)!;
    doc.shape(lArch, {
      id: a.id,
      label: esc(a.role ? `${a.label}\n${a.role}` : a.label).replace(/\n/g, "&#xa;"),
      style: actorStyle(),
      x: box.x - origin.x,
      y: box.y - origin.y,
      w: box.w,
      h: box.h,
      parent,
      attrs: { type: "actor", role: "neutral", persona: a.role },
    });
  }

  // Components — uniform cards; a vendor glyph, when one exists, is inset at the left.
  const componentById = new Map(components.map((c) => [c.id, c]));
  const hasChildren = (id: string) => components.some((c) => c.parentId === id);
  const depthOfComponent = (c: ArchitectureComponent) => {
    let d = 0;
    let cur = c;
    while (cur.parentId && componentById.has(cur.parentId) && d < 8) {
      cur = componentById.get(cur.parentId)!;
      d++;
    }
    return d;
  };

  // parents before children so a child paints on top of its group card
  const paintOrder = [...components].sort((a, b) => depthOfComponent(a) - depthOfComponent(b));
  for (const c of paintOrder) {
    const box = nodeBox(c.id);
    if (!box) continue;
    const inComponent = c.parentId && laid.boxes.has(c.parentId);
    const parent = inComponent ? c.parentId! : zoneBox.has(c.zoneId) ? c.zoneId : lArch.id;
    const origin =
      parent === lArch.id ? { x: 0, y: 0 } : (laid.boxes.get(parent) ?? { x: 0, y: 0 });
    const inferredRole = componentRole(c, zones);
    const role = profile.roleOverride ? profile.roleOverride(c, inferredRole) : inferredRole;
    const stereo = profile.stereotype?.(c);
    const emphasis: Emphasis = c.emphasis ?? "normal";
    const group = hasChildren(c.id);
    const depth = depthOfComponent(c);
    const isModule = depth > 0 && !group;
    const glyph =
      emphasis === "muted" || isModule
        ? undefined
        : resolveSapIcon(c.officialName, c.label, c.sapIcon);

    let style: string;
    if (group) {
      style = groupCardStyle(role, emphasis);
      if (glyph) style = style.replace("spacingLeft=10;", `spacingLeft=${GLYPH_SM + SPACE.sm};`);
    } else if (depth > 0) {
      style = moduleStyle(role, emphasis);
    } else {
      style = cardStyle(role, emphasis);
      if (glyph) style = style.replace("align=center;", `align=left;spacingLeft=${GLYPH + SPACE.sm};`);
    }

    doc.shape(lArch, {
      id: c.id,
      label:
        (stereo ? stereotypeMarkup(stereo) : "") +
        (depth > 0 && !group
          ? esc(c.officialName ?? c.label)
          : labelMarkup(c.officialName ?? c.label, c.subtitle)),
      style,
      x: box.x - origin.x,
      y: box.y - origin.y,
      w: box.w,
      h: box.h,
      parent,
      attrs: {
        type: group ? "component-group" : depth > 0 ? "module" : "component",
        kind: c.kind,
        role,
        emphasis,
        product: c.officialName,
        interfaces: c.exposes?.join(", "),
        confidence: c.confidence !== undefined ? String(c.confidence) : undefined,
      },
    });

    if (glyph) {
      const size = group ? GLYPH_SM : GLYPH;
      const gy = group ? Math.round((GROUP_HEADER - size) / 2) : Math.round((box.h - size) / 2);
      lArch.cells.push(
        `        <mxCell id="${esc(c.id)}-glyph" value="" style="shape=mxgraph.sap.icon;SAPIcon=${glyph};strokeWidth=1;strokeColor=${INK.hairline};fillColor=${PALETTE[role].wash};gradientColor=none;aspect=fixed;html=1;" vertex="1" parent="${esc(c.id)}">
          <mxGeometry x="${group ? SPACE.xs : SPACE.sm - 4}" y="${gy}" width="${size}" height="${size}" as="geometry"/>
        </mxCell>`
      );
    }
  }

  // ── Connectors ───────────────────────────────────────────────────────────
  // Edges leaving the same node run together near that node, so their labels would
  // stack. Spread them along their own paths instead.
  const fanIndex = new Map<string, number>();
  const fanSize = new Map<string, number>();
  // counted after endpoints are lifted, further down

  const topZoneOf = (entityId: string): string | undefined => {
    const c = components.find((x) => x.id === entityId);
    const zid = c ? c.zoneId : actors.some((a) => a.id === entityId) ? ACTOR_GROUP : undefined;
    if (!zid) return undefined;
    const chain = ancestorsOf(zid);
    return chain.length ? chain[chain.length - 1].id : zid;
  };

  const usedSemantics = new Set<FlowSemantic>();
  const placed = new Set([...components.map((c) => c.id), ...actors.map((a) => a.id)]);

  /**
   * Attach a connector to the outermost group that does not also contain the other
   * end. A line tunnelling out of a deeply nested module crosses everything between;
   * leaving the group boundary says the same thing and reads far better.
   */
  const componentChain = (id: string): string[] => {
    const chain: string[] = [];
    let c = componentById.get(id);
    for (let i = 0; c && i < 8; i++) {
      chain.push(c.id);
      c = c.parentId ? componentById.get(c.parentId) : undefined;
    }
    return chain; // innermost -> outermost
  };
  const attachPoint = (self: string, other: string): string => {
    const mine = componentChain(self);
    if (!mine.length) return self;
    const theirs = new Set(componentChain(other));
    // walk outward while the ancestor does not swallow the other endpoint
    let best = self;
    for (const id of mine) {
      if (theirs.has(id)) break;
      best = id;
    }
    return best;
  };

  for (const f of flows) {
    if (!placed.has(f.sourceId) || !placed.has(f.targetId)) continue;
    const a = attachPoint(f.sourceId, f.targetId);
    const b = attachPoint(f.targetId, f.sourceId);
    if (a !== b) fanSize.set(a, (fanSize.get(a) ?? 0) + 1);
  }

  for (const f of flows) {
    if (!placed.has(f.sourceId) || !placed.has(f.targetId)) continue;
    const semantic = flowSemantic(f.mode, f.protocol);
    usedSemantics.add(semantic);

    const srcId = attachPoint(f.sourceId, f.targetId);
    const tgtId = attachPoint(f.targetId, f.sourceId);
    if (srcId === tgtId) continue;
    const from = nodeBox(srcId)!;
    const to = nodeBox(tgtId)!;
    if (!from || !to) continue;
    const chip = profile.interfaceChips && f.protocol && hasRoomForChip(from, to, f.protocol);
    const k = fanIndex.get(srcId) ?? 0;
    fanIndex.set(srcId, k + 1);
    const fan = fanSize.get(srcId) ?? 1;
    // spread across [-0.7, -0.2] when several edges share this source
    const labelSpread = fan > 1 ? -0.7 + (k / Math.max(1, fan - 1)) * 0.5 : -0.55;

    doc.edge(lFlows, {
      id: f.id,
      label: esc(f.label ?? (chip ? "" : f.protocol ?? "")),
      style: connectorStyle(semantic, { bidirectional: f.bidirectional }),
      source: srcId,
      target: tgtId,
      labelPos: f.label ? labelSpread : undefined,
      // edges leaving one node often share their first segment, so separate the
      // labels across the path normal as well as along it
      labelOffset:
        f.label && fan > 1 ? { x: 0, y: Math.round((k - (fan - 1) / 2) * 26) } : undefined,
      attrs: {
        type: "flow",
        semantic,
        protocol: f.protocol,
        direction: f.bidirectional ? "bidirectional" : "unidirectional",
      },
    });

    if (chip) {
      const crossZone = topZoneOf(f.sourceId) !== topZoneOf(f.targetId);
      doc.edgeLabel(lFlows, {
        id: `${f.id}-interface`,
        label: f.protocol!,
        style: chipStyle(semantic),
        parent: f.id,
        w: Math.max(48, f.protocol!.length * 8 + 16),
        h: 24,
        // a chip at the midpoint of a cross-zone hop lands inside the target zone,
        // on top of its cards; the gutter between zones is the clear run
        pos: crossZone ? -0.5 : fan > 1 ? 0.3 : 0,
        offsetY: fan > 1 ? Math.round((k - (fan - 1) / 2) * 26) : 0,
      });
    }
  }

  // ── Canvas extent ────────────────────────────────────────────────────────
  let maxX = 0;
  let maxY = 0;
  for (const b of [...zoneBox.values(), ...[...laid.boxes.values()]]) {
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  // ── Annotations ──────────────────────────────────────────────────────────
  const titleW = Math.max(600, Math.min(maxX - SPACE.lg, 1100));
  doc.shape(lNotes, {
    id: "title",
    label: esc(model.title),
    style: titleStyle(),
    x: SPACE.lg,
    y: SPACE.md,
    w: titleW,
    h: 32,
    parent: lNotes.id,
    attrs: { type: "title" },
  });
  if (model.summary) {
    doc.shape(lNotes, {
      id: "subtitle",
      label: esc(model.summary),
      style: subtitleStyle(),
      x: SPACE.lg,
      y: SPACE.md + 36,
      w: titleW,
      h: 36,
      parent: lNotes.id,
      attrs: { type: "subtitle" },
    });
  }

  const legendEntries = model.legend
    ? [...buildLegend(model, usedSemantics, zones), ...profile.legend]
    : [];
  const legendH = legendEntries.length ? 32 + legendEntries.length * 18 : 0;
  const legendY = maxY + SPACE.lg;
  if (legendEntries.length) doc.shape(lNotes, {
    id: "legend",
    label: [`&lt;b&gt;Legend&lt;/b&gt;`, ...legendEntries.map((e) => esc(`— ${e}`))].join("&#xa;"),
    style: legendStyle(),
    x: SPACE.lg,
    y: legendY,
    w: 360,
    h: legendH,
    parent: lNotes.id,
    attrs: { type: "legend" },
  });

  // canvas is measured from content, so the page size is set once at the end
  doc.resize(
    options.pageWidth ?? ceilTo(maxX + SPACE.lg, GRID),
    options.pageHeight ?? ceilTo(legendY + legendH + SPACE.lg, GRID)
  );
  return doc.toXml();
}

function ceilTo(n: number, step: number) {
  return Math.ceil(n / step) * step;
}

function diagramPageName(model: ArchitectureModel): string {
  const style = model.style ?? "solution";
  const map: Record<string, string> = {
    reference: "Reference Architecture",
    solution: "Solution Architecture",
    integration: "Integration Architecture",
    "c4-context": "System Context",
    "c4-container": "Container View",
    component: "Component View",
    deployment: "Deployment View",
    dataflow: "Data Flow",
    sequence: "Sequence",
    "enterprise-ai": "Enterprise AI Architecture",
  };
  return `${map[style] ?? "Solution Architecture"} · ${model.level}`;
}

/** A chip needs a clear run of connector; between close neighbours it would sit on a shape. */
function hasRoomForChip(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  protocol: string
): boolean {
  const chipW = Math.max(48, protocol.length * 8 + 16);
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  return gapX >= chipW + 24 || gapY >= 48;
}

function buildLegend(
  model: ArchitectureModel,
  semantics: Set<FlowSemantic>,
  zones: Map<string, ArchitectureZone>
): string[] {
  const out: string[] = [];
  const roles = new Set<Role>();
  for (const z of zones.values()) roles.add(zoneRole(z));

  const roleLabel: Partial<Record<Role, string>> = {
    platform: "Platform / hosted services",
    application: "Custom-built application domain",
    data: "Data & persistence",
    integration: "Integration & mediation",
    security: "Identity & security",
    external: "External / third-party",
    edge: "Edge & network",
    neutral: "Users & channels",
  };
  for (const r of roles) if (roleLabel[r]) out.push(`${roleLabel[r]} (${r} hue)`);
  if ((model.zones ?? []).some((z) => z.boundary)) out.push("Dashed enclosure — trust boundary");
  for (const s of semantics) out.push(FLOW_LABEL[s]);
  if ((model.flows ?? []).some((f) => f.bidirectional)) out.push("Double arrow — mutual flow");
  if ((model.flows ?? []).some((f) => f.protocol)) out.push("Rounded chip — interface / protocol");
  return out;
}

export { CARD_W, CARD_H };
