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
  FLOW_COLOR,
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
  dividerLabelStyle,
  dividerStyle,
  footerLabelStyle,
  footerRuleStyle,
  iconNodeStyle,
  stackShadowStyle,
  groupCardStyle,
  moduleStyle,
  type Emphasis,
  chipStyle,
  connectorStyle,
  legendStyle,
  legendEntryStyle,
  legendLineStyle,
  legendSwatchStyle,
  separatorStyle,
  subtitleStyle,
  titleStyle,
  zoneMarkStyle,
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
const ICON_NODE = 56;
const ICON_NODE_H = 92; // glyph + label beneath
const FOOTER_H = 56;
const CARD_W_MAX = 320;
const EDGE_LABEL_MAX = 28;
const CHIP_LABEL_MAX = 18;

/**
 * Connector labels ride the line, so an overlong one has nowhere to go and lands on
 * whatever is nearby. Clamp what is drawn; the full text stays on the cell so
 * nothing is lost to a reader who inspects it.
 */
function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Size a card to its content.
 *
 * A fixed width silently truncates or overflows long product names, and enterprise
 * names are long. Widths are approximated from Helvetica metrics and snapped to the
 * grid — close enough that text always fits, without needing a text measurer.
 */
function measureCard(
  title: string,
  subtitle: string | undefined,
  opts: { glyph?: boolean; compact?: boolean } = {}
): { w: number; h: number } {
  const CH_TITLE = opts.compact ? 5.9 : 6.6; // bold 11 / 12px
  const CH_SUB = 5.6; // italic 11px
  const padX = SPACE.md + (opts.glyph ? GLYPH + SPACE.sm : 0);
  const minW = opts.compact ? MODULE_W : CARD_W;

  const titleW = title.length * CH_TITLE;
  const subW = subtitle ? subtitle.length * CH_SUB : 0;
  // aim for at most two lines before growing the box
  const wanted = Math.max(titleW, subW) / 2 + padX;
  const w = Math.min(CARD_W_MAX, Math.max(minW, Math.ceil(wanted / GRID) * GRID));

  const inner = Math.max(40, w - padX);
  const titleLines = Math.max(1, Math.ceil(titleW / inner));
  const subLines = subtitle ? Math.max(1, Math.ceil(subW / inner)) : 0;
  const needed = SPACE.sm + titleLines * 15 + subLines * 14;
  const h = Math.max(opts.compact ? MODULE_H : CARD_H, Math.ceil(needed / GRID) * GRID);
  return { w, h };
}
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
  agent: "agent",
  authorization: "authorization",
  provisioning: "provisioning",
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

/**
 * Colour follows meaning, and the protocol usually states the meaning outright.
 * A model that labels an edge "SAML" or "A2A" but omits `mode` still gets the right
 * colour, so the drawing stays readable regardless of how carefully it was tagged.
 */
function flowSemantic(mode?: FlowMode, protocol?: string, label?: string): FlowSemantic {
  if (mode) return FLOW_SEMANTIC[mode] ?? "data";
  const text = `${protocol ?? ""} ${label ?? ""}`;
  if (!text.trim()) return "data";
  if (/\ba2a\b|agent[- ]?to[- ]?agent|agent2agent/i.test(text)) return "agent";
  if (/\bscim\b|provision/i.test(text)) return "provisioning";
  if (/\bsaml\b|\boidc\b|\boauth\b|\bjwt\b|\bsso\b|trust|federat|authenticat/i.test(text))
    return "trust";
  if (/authoriz|\bauthz\b|\bpolicy\b|\bscope\b|role collection/i.test(text)) return "authorization";
  if (/\bmcp\b|websocket|\bsse\b/i.test(text)) return "async";
  if (/event|kafka|mesh|pubsub|\bamqp\b|\bmqtt\b/i.test(text)) return "event";
  if (/batch|nightly|scheduled|replicat/i.test(text)) return "batch";
  return "data";
}

export interface GenerateOptions {
  pageName?: string;
  /** Force canvas size; by default it is measured from the content. */
  pageWidth?: number;
  pageHeight?: number;
  /**
   * Widest the drawing may get relative to its height before long flow chains are
   * wrapped into stacked bands. 0 disables wrapping and restores the plain
   * left-to-right ribbon.
   */
  targetRatio?: number;
}


/**
 * Make a model safe to draw without losing anything.
 *
 * A diagram that silently omits a component is worse than one that looks wrong: the
 * reader has no way to know something is missing. So every dangling reference is
 * repaired into something visible rather than dropped — unresolved parents are cut,
 * cycles are broken, homeless components get an explicit holding area, and repeated
 * ids are made unique instead of overwriting each other.
 */
function normalizeModel(model: ArchitectureModel): ArchitectureModel {
  const zones = [...(model.zones ?? [])];
  const components = [...(model.components ?? [])];
  const actors = [...(model.actors ?? [])];

  // 1. unique ids across every addressable object
  const seen = new Set<string>();
  const rename = new Map<string, string>();
  const uniq = (id: string) => {
    let out = id || "cell";
    for (let n = 2; seen.has(out); n++) out = `${id}-${n}`;
    seen.add(out);
    if (out !== id) rename.set(id, out);
    return out;
  };
  // first occurrence keeps its id; later duplicates are suffixed
  const zoneIds = zones.map((z) => uniq(z.id));
  const compIds = components.map((c) => uniq(c.id));
  const actorIds = actors.map((a) => uniq(a.id));
  const fixedZones = zones.map((z, i) => ({ ...z, id: zoneIds[i] }));
  const fixedComponents = components.map((c, i) => ({ ...c, id: compIds[i] }));
  const fixedActors = actors.map((a, i) => ({ ...a, id: actorIds[i] }));

  const zoneSet = new Set(fixedZones.map((z) => z.id));
  const compSet = new Set(fixedComponents.map((c) => c.id));

  // 2. a zone whose parent does not exist becomes a root zone
  for (const z of fixedZones) if (z.parentId && !zoneSet.has(z.parentId)) delete z.parentId;
  // break zone parent cycles
  for (const z of fixedZones) {
    const path = new Set([z.id]);
    let cur = z;
    while (cur.parentId) {
      if (path.has(cur.parentId)) {
        delete cur.parentId;
        break;
      }
      path.add(cur.parentId);
      const next = fixedZones.find((x) => x.id === cur.parentId);
      if (!next) break;
      cur = next;
    }
  }

  // 3. components: unresolvable or circular parents are cut
  const byId = new Map(fixedComponents.map((c) => [c.id, c]));
  for (const c of fixedComponents) if (c.parentId && !compSet.has(c.parentId)) delete c.parentId;
  for (const c of fixedComponents) {
    const path = new Set([c.id]);
    let cur = c;
    while (cur.parentId) {
      if (path.has(cur.parentId)) {
        delete cur.parentId;
        break;
      }
      path.add(cur.parentId);
      const next = byId.get(cur.parentId);
      if (!next) break;
      cur = next;
    }
  }
  // a nested component belongs to whatever zone its outermost ancestor sits in
  for (const c of fixedComponents) {
    let root = c;
    for (let i = 0; root.parentId && i < 8; i++) root = byId.get(root.parentId) ?? root;
    if (root !== c) c.zoneId = root.zoneId;
  }

  // 4. homeless components get a visible holding area rather than disappearing
  const HOLDING = "unassigned";
  let needsHolding = false;
  for (const c of fixedComponents) {
    if (!zoneSet.has(c.zoneId)) {
      c.zoneId = HOLDING;
      needsHolding = true;
    }
  }
  if (needsHolding && !zoneSet.has(HOLDING)) {
    fixedZones.push({
      id: HOLDING,
      label: "Unassigned",
      kind: "custom",
      role: "neutral",
    } as ArchitectureZone);
  }

  // 4b. Actors are placed in the top-level zone marked kind:"user". Models often
  // label that zone "Devices" or "Channels" and give it some other kind, which used
  // to strand every actor outside the landscape and leave the zone drawn but empty.
  // Promote the most likely candidate instead: a top-level zone holding nothing.
  if (fixedActors.length && !fixedZones.some((z) => !z.parentId && z.kind === "user")) {
    const occupied = new Set(fixedComponents.map((c) => c.zoneId));
    const hasChildZone = new Set(fixedZones.map((z) => z.parentId).filter(Boolean));
    const empty = fixedZones.filter(
      (z) => !z.parentId && !occupied.has(z.id) && !hasChildZone.has(z.id)
    );
    const looksUserFacing = /device|user|client|channel|front|consumer|endpoint/i;
    const entry =
      empty.find((z) => looksUserFacing.test(`${z.id} ${z.label}`)) ?? empty[0];
    if (entry) entry.kind = "user";
  }

  // 4c. A zone with nothing in it is always a mistake — an empty labelled box that
  // reads as a missing part of the architecture. Drop it, keeping any zone that is
  // still earning its place as an ancestor or as the actors' home.
  const userZoneId = fixedZones.find((z) => !z.parentId && z.kind === "user")?.id;
  for (let pass = 0; pass < 4; pass++) {
    const occupied = new Set(fixedComponents.map((c) => c.zoneId));
    const parents = new Set(fixedZones.map((z) => z.parentId).filter(Boolean));
    const dead = fixedZones.filter(
      (z) =>
        !occupied.has(z.id) &&
        !parents.has(z.id) &&
        !(z.id === userZoneId && fixedActors.length > 0)
    );
    if (!dead.length) break;
    for (const z of dead) fixedZones.splice(fixedZones.indexOf(z), 1);
  }

  // 5. flows follow any renames and drop only if an endpoint truly does not exist
  const placed = new Set([...compSet, ...fixedActors.map((a) => a.id)]);
  const flows = (model.flows ?? [])
    .map((f, i) => ({
      ...f,
      id: uniq(f.id || `flow-${i}`),
      sourceId: rename.get(f.sourceId) ?? f.sourceId,
      targetId: rename.get(f.targetId) ?? f.targetId,
    }))
    .filter((f) => placed.has(f.sourceId) && placed.has(f.targetId) && f.sourceId !== f.targetId);

  return { ...model, zones: fixedZones, components: fixedComponents, actors: fixedActors, flows };
}

export function generateDrawioXml(
  model: ArchitectureModel,
  options: GenerateOptions = {}
): string {
  const profile = profileFor(model.style);
  if (profile.temporal) return generateSequenceXml(model, { pageName: options.pageName });

  model = normalizeModel(model);
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
      if (c.shape === "icon") return { id: c.id, w: ICON_NODE + SPACE.lg, h: ICON_NODE_H };
      const compact = depth > 0;
      const glyph =
        !compact && c.emphasis !== "muted"
          ? Boolean(resolveSapIcon(c.officialName, c.label, c.sapIcon))
          : false;
      const m = measureCard(c.officialName ?? c.label, compact ? undefined : c.subtitle, {
        glyph,
        compact,
      });
      return { id: c.id, w: m.w, h: m.h };
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

  // Ownership reads left to right: the people, then the ground you run, then the
  // ground you do not. Layering alone cannot know this — a zone with no inbound flow
  // lands in the first column, which is how an on-premise estate ends up drawn to the
  // left of the platform that reaches into it. These edges are layout hints only:
  // they order the columns and are never emitted as connectors.
  const rootZones = (model.zones ?? []).filter((z) => !z.parentId);
  const rank = (z: ArchitectureZone) =>
    z.kind === "user" ? 0 : ["on-premise", "hyperscaler", "partner"].includes(z.kind) ? 2 : 1;
  for (const from of rootZones) {
    for (const to of rootZones) {
      if (rank(from) < rank(to)) {
        edges.push({ id: `order-${from.id}-${to.id}`, source: from.id, target: to.id });
      }
    }
  }

  // Connector labels and interface chips sit in the gap between columns, so the gap
  // has to be wide enough for the widest of them. Without this the layout is tight
  // and correct while the labels have nowhere to go.
  const annotationWidth = (f: (typeof flows)[number]) => {
    const label = Math.min((f.label ?? "").length, EDGE_LABEL_MAX) * 6;
    const chip = Math.min((f.protocol ?? "").length, CHIP_LABEL_MAX) * 8 + 16;
    return Math.max(label, chip);
  };
  const flowById = new Map(flows.map((f) => [f.id, f]));
  const gutterFor = (ids: string[]) => {
    let widest = 0;
    for (const id of ids) {
      const f = flowById.get(id);
      if (f) widest = Math.max(widest, annotationWidth(f));
    }
    return widest ? Math.min(240, Math.ceil((widest + SPACE.md) / GRID) * GRID) : 0;
  };
  // floor for gutters nothing is labelled across — still a routing channel
  const columnGap = SPACE.xl + SPACE.md;

  const laid = layoutTree(tree, edges, {
    origin: { x: SPACE.lg, y: HEADER_H + SPACE.md },
    columnGap,
    nodeGap: SPACE.lg, // 40 — routing channel between stacked cards
    header: SPACE.lg - GRID,
    pad: SPACE.md,
    targetRatio: options.targetRatio,
    gapFor: gutterFor,
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

    // A top-level zone is the landscape itself and is always drawn as a filled
    // panel, even when it also marks a trust or network boundary — models label
    // almost every zone with one, and rendering those as transparent dashed
    // overlays turned the whole drawing into outlines. The dashed overlay is kept
    // for boundaries drawn *inside* a landscape, which is what it is for; the
    // boundary kind stays on the cell either way.
    const asOverlay = Boolean(z.boundary) && Boolean(z.parentId);
    const marked = !asOverlay && !z.parentId && (z.kind === "sap-btp" || z.kind === "sap-cloud");
    const style = asOverlay ? boundaryStyle(role) : areaStyle(role, depth, marked);
    const target = asOverlay ? lBounds : lArch;
    // a boundary overlay is not a container, so it stays on the layer, not nested
    const useParent = asOverlay ? lBounds.id : parent;
    const useOrigin = asOverlay ? { x: 0, y: 0 } : origin;
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

    // SAP-owned ground carries the mark in its header, the way the published
    // reference sheets title "SAP BTP" and "SAP Cloud Solutions".
    if (marked && !asOverlay) {
      doc.shape(target, {
        id: `${z.id}-mark`,
        label: "",
        style: zoneMarkStyle(),
        x: SPACE.sm,
        y: SPACE.xs + 2,
        w: 34,
        h: 17,
        parent: z.id,
        attrs: { type: "zone-mark" },
      });
    }
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
    if (!group && c.shape === "icon") {
      const g = resolveSapIcon(c.officialName, c.label, c.sapIcon);
      const cx = box.x - origin.x + Math.round((box.w - ICON_NODE) / 2);
      doc.shape(lArch, {
        id: c.id,
        label: esc(c.officialName ?? c.label),
        style: iconNodeStyle(role, emphasis),
        x: cx,
        y: box.y - origin.y,
        w: ICON_NODE,
        h: ICON_NODE,
        parent,
        attrs: { type: "service", kind: c.kind, role, emphasis, product: c.officialName },
      });
      if (g) {
        lArch.cells.push(
          `        <mxCell id="${esc(c.id)}-glyph" value="" style="shape=mxgraph.sap.icon;SAPIcon=${g};strokeWidth=1;strokeColor=none;fillColor=none;gradientColor=none;aspect=fixed;html=1;" vertex="1" parent="${esc(c.id)}">
          <mxGeometry x="${Math.round((ICON_NODE - GLYPH) / 2)}" y="${Math.round((ICON_NODE - GLYPH) / 2)}" width="${GLYPH}" height="${GLYPH}" as="geometry"/>
        </mxCell>`
        );
      }
      continue;
    }
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

    if (c.shape === "stack" && !group) {
      for (const [i, off] of [[1, 5], [2, 10]] as Array<[number, number]>) {
        lArch.cells.push(
          `        <mxCell id="${esc(c.id)}-stack${i}" value="" style="${stackShadowStyle(role)}" vertex="1" parent="${esc(parent)}">
          <mxGeometry x="${box.x - origin.x + off}" y="${box.y - origin.y - off}" width="${box.w}" height="${box.h}" as="geometry"/>
        </mxCell>`
        );
      }
    }

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

  let labelLane = 0;
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
    const semantic = flowSemantic(f.mode, f.protocol, f.label);
    usedSemantics.add(semantic);

    const srcId = attachPoint(f.sourceId, f.targetId);
    const tgtId = attachPoint(f.targetId, f.sourceId);
    if (srcId === tgtId) continue;
    const from = nodeBox(srcId)!;
    const to = nodeBox(tgtId)!;
    if (!from || !to) continue;
    const chip = profile.interfaceChips && f.protocol && hasRoomForChip(from, to, f.protocol);
    const lane = labelLane++;
    const k = fanIndex.get(srcId) ?? 0;
    fanIndex.set(srcId, k + 1);
    const fan = fanSize.get(srcId) ?? 1;
    // spread across [-0.7, -0.2] when several edges share this source
    // One connector: the midpoint is the gap between the two ends, which is exactly
    // the space reserved for it. Several from the same node: spread them, because a
    // shared midpoint is how labels pile up.
    const labelSpread = fan > 1 ? -0.7 + (k / Math.max(1, fan - 1)) * 0.5 : 0;

    const tagged = semantic === "trust";
    const crossesZone = topZoneOf(f.sourceId) !== topZoneOf(f.targetId);
    const labelAt = labelSpread;
    doc.edge(lFlows, {
      id: f.id,
      label: tagged || chip ? "" : esc(clamp(f.label ?? f.protocol ?? "", EDGE_LABEL_MAX)),
      style: connectorStyle(semantic, { bidirectional: f.bidirectional }),
      source: srcId,
      target: tgtId,
      labelPos: !tagged && !chip && f.label ? labelAt : undefined,
      // edges leaving one node often share their first segment, so separate the
      // labels across the path normal as well as along it
      labelOffset:
        !tagged && !chip && f.label
          ? {
              x: 0,
              y:
                (fan > 1 ? Math.round((k - (fan - 1) / 2) * 32) : 0) +
                ((lane % 3) - 1) * 14,
            }
          : undefined,
      attrs: {
        type: "flow",
        semantic,
        protocol: f.protocol,
        description: f.label,
        direction: f.bidirectional ? "bidirectional" : "unidirectional",
      },
    });

    // A tag wider than the run it sits on will always spill onto the target. The
    // green connector already states "trust"; the tag is an addition, not a
    // requirement, so it is dropped when it cannot sit clear.
    const tagText = clamp(f.label ?? "Trust", CHIP_LABEL_MAX);
    const tagW = Math.max(48, tagText.length * 7 + 16);
    if (tagged && hasRoomForChip(from, to, tagText.padEnd(Math.ceil(tagW / 8), " "))) {
      const text = tagText;
      doc.edgeLabel(lFlows, {
        id: `${f.id}-tag`,
        label: text,
        style: chipStyle("trust"),
        parent: f.id,
        w: tagW,
        h: 22,
        // sits near the end it governs, the way a trust marker reads on a boundary
        // just short of the target, lifted clear of the line
        pos: 0.62,
        offsetY: -16 + (fan > 1 ? Math.round((k - (fan - 1) / 2) * 26) : 0),
      });
    }

    if (chip) {
      const crossZone = crossesZone;
      doc.edgeLabel(lFlows, {
        id: `${f.id}-interface`,
        label: clamp(f.protocol!, CHIP_LABEL_MAX),
        style: chipStyle(semantic),
        parent: f.id,
        w: Math.max(48, Math.min(f.protocol!.length, CHIP_LABEL_MAX) * 8 + 16),
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

  // A key belongs on a drawing whose colours carry meaning. It is drawn as real
  // swatches — a dot in the connector's own colour, a sample of its line — because a
  // legend that only names hues in prose cannot be checked against the diagram.
  const keyRows = buildLegendRows(model, usedSemantics, zones);
  const legendY = maxY + SPACE.lg;
  let legendH = 0;
  if (model.legend !== false && keyRows.length) {
    const COLS = keyRows.length > 5 ? 2 : 1;
    const rows = Math.ceil(keyRows.length / COLS);
    const COL_W = 250;
    const ROW_H = 22;
    legendH = 34 + rows * ROW_H + SPACE.xs;
    const legendW = COLS * COL_W + SPACE.md;

    doc.shape(lNotes, {
      id: "legend",
      label: "&lt;b&gt;Legend&lt;/b&gt;",
      style: legendStyle(),
      x: SPACE.lg,
      y: legendY,
      w: legendW,
      h: legendH,
      parent: lNotes.id,
      attrs: { type: "legend" },
    });

    keyRows.forEach((row, i) => {
      const col = Math.floor(i / rows);
      const rowIndex = i % rows;
      const x = SPACE.lg + SPACE.sm + col * COL_W;
      const y = legendY + 30 + rowIndex * ROW_H;

      doc.shape(lNotes, {
        id: `legend-swatch-${i}`,
        label: "",
        style:
          row.kind === "line"
            ? legendLineStyle(row.color, row.dashed)
            : legendSwatchStyle(row.color, row.kind),
        x,
        y: row.kind === "line" ? y + 5 : y + 1,
        w: row.kind === "line" ? 26 : 12,
        h: row.kind === "line" ? 2 : 12,
        parent: lNotes.id,
        attrs: { type: "legend-key" },
      });
      doc.shape(lNotes, {
        id: `legend-label-${i}`,
        label: esc(row.label),
        style: legendEntryStyle(),
        x: x + 34,
        y,
        w: COL_W - 44,
        h: 16,
        parent: lNotes.id,
        attrs: { type: "legend-key" },
      });
    });
  }

  // ── Network / ownership dividers ─────────────────────────────────────────
  // Where the landscape leaves SAP-managed ground for a third party or an
  // on-premise network, that crossing is the single most consequential fact on the
  // drawing. Models rarely declare it, so derive it: rule off before the leftmost
  // externally-owned root zone. An explicit `dividers` list always wins.
  const autoDividers = (): Array<{ label: string; afterZoneId: string }> => {
    const roots = (model.zones ?? [])
      .filter((z) => !z.parentId && zoneBox.has(z.id))
      .sort((a, b) => zoneBox.get(a.id)!.x - zoneBox.get(b.id)!.x);
    const firstExternal = roots.findIndex((z) =>
      ["on-premise", "hyperscaler", "partner"].includes(z.kind)
    );
    // needs something on both sides to be a boundary rather than a margin
    if (firstExternal <= 0) return [];
    return [{ label: "Network", afterZoneId: roots[firstExternal - 1].id }];
  };
  const dividers = model.dividers?.length ? model.dividers : autoDividers();

  for (const [i, d] of dividers.entries()) {
    const after = zoneBox.get(d.afterZoneId);
    if (!after) continue;
    const x = Math.round(after.x + after.w + SPACE.lg);
    doc.freeEdge(lBounds, {
      id: `divider-${i}`,
      style: dividerStyle(),
      from: { x, y: HEADER_H },
      to: { x, y: maxY + SPACE.sm },
    });
    doc.shape(lBounds, {
      id: `divider-${i}-label`,
      label: esc(d.label.toUpperCase()),
      style: dividerLabelStyle(),
      x: x - 60,
      y: HEADER_H - 26,
      w: 120,
      h: 20,
      parent: lBounds.id,
      attrs: { type: "divider", boundary: "network" },
    });
    maxX = Math.max(maxX, x + SPACE.sm);
  }

  // ── Title block ──────────────────────────────────────────────────────────
  const contentRight = Math.max(maxX, 900);
  let footerBottom = Math.max(maxY, legendH ? legendY + legendH : 0);
  // Every published reference sheet carries a title block: what it is, when it last
  // changed, and a short id to quote in review. Models rarely fill it in, so it is
  // derived rather than omitted — a drawing with no provenance is not reviewable.
  if (model.footer !== null) {
    const f = {
      label: model.footer?.label ?? model.title,
      updated: model.footer?.updated ?? (model.createdAt ?? new Date().toISOString()).slice(0, 10),
      reference: model.footer?.reference ?? shortId(model),
    };
    const y = footerBottom + SPACE.lg;
    doc.freeEdge(lNotes, {
      id: "footer-rule",
      style: footerRuleStyle(),
      from: { x: SPACE.lg, y },
      to: { x: contentRight, y },
    });
    doc.shape(lNotes, {
      id: "footer-label",
      label: esc(f.label ?? "Architecture"),
      style: footerLabelStyle(true),
      x: SPACE.lg,
      y: y + SPACE.sm,
      w: 420,
      h: 20,
      parent: lNotes.id,
      attrs: { type: "footer" },
    });
    if (f.updated) {
      doc.shape(lNotes, {
        id: "footer-updated",
        label: esc(`Last update ${f.updated}`),
        style: footerLabelStyle(false),
        x: SPACE.lg,
        y: y + SPACE.sm + 22,
        w: 420,
        h: 18,
        parent: lNotes.id,
        attrs: { type: "footer" },
      });
    }
    if (f.reference) {
      doc.shape(lNotes, {
        id: "footer-reference",
        label: esc(f.reference),
        style: footerLabelStyle(false).replace("align=left;", "align=center;"),
        x: Math.round(contentRight / 2) - 100,
        y: y + SPACE.sm + 12,
        w: 200,
        h: 18,
        parent: lNotes.id,
        attrs: { type: "footer", reference: f.reference },
      });
    }
    footerBottom = y + FOOTER_H;
  }

  // canvas is measured from content, so the page size is set once at the end
  doc.resize(
    options.pageWidth ?? ceilTo(maxX + SPACE.lg, GRID),
    options.pageHeight ?? ceilTo(footerBottom + SPACE.lg, GRID)
  );
  return doc.toXml();
}

function ceilTo(n: number, step: number) {
  return Math.ceil(n / step) * step;
}

/**
 * Short, stable identifier for the drawing — the thing a reviewer quotes in a mail
 * ("the one ending b6c158"). Derived from the content, so redrawing the same model
 * yields the same id and a genuine change yields a new one.
 */
function shortId(model: ArchitectureModel): string {
  const seed = [
    model.title,
    model.level,
    ...(model.zones ?? []).map((z) => z.id),
    ...(model.components ?? []).map((c) => `${c.id}:${c.label}`),
    ...(model.flows ?? []).map((f) => `${f.sourceId}>${f.targetId}`),
  ].join("|");
  // FNV-1a: tiny, dependency-free, and stable across runs
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
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

interface LegendRow {
  kind: "dot" | "area" | "line";
  color: string;
  label: string;
  dashed?: boolean;
}

/**
 * Rows for the key, in the order a reader needs them: what the colours of the
 * connectors mean first, then the area hues, then the line conventions. Only what
 * the drawing actually uses appears — a key listing absent symbols is noise.
 */
function buildLegendRows(
  model: ArchitectureModel,
  semantics: Set<FlowSemantic>,
  zones: Map<string, ArchitectureZone>
): LegendRow[] {
  const rows: LegendRow[] = [];

  for (const s of semantics) {
    rows.push({
      kind: "dot",
      color: FLOW_COLOR[s],
      label: FLOW_LABEL[s],
      dashed: s === "event" || s === "batch",
    });
  }

  const roleLabel: Partial<Record<Role, string>> = {
    platform: "Platform / hosted services",
    application: "Custom application domain",
    data: "Data & persistence",
    integration: "Integration & mediation",
    security: "Identity & security",
    external: "External / third party",
    edge: "Edge & network",
    neutral: "Users & channels",
  };
  const roles = new Set<Role>();
  for (const z of zones.values()) roles.add(zoneRole(z));
  for (const r of roles) {
    if (roleLabel[r]) rows.push({ kind: "area", color: PALETTE[r].line, label: roleLabel[r]! });
  }

  if ((model.zones ?? []).some((z) => z.boundary)) {
    rows.push({ kind: "line", color: PALETTE.security.line, label: "Trust boundary", dashed: true });
  }
  if ((model.flows ?? []).some((f) => f.mode === "event" || f.mode === "batch")) {
    rows.push({ kind: "line", color: FLOW_COLOR.event, label: "Asynchronous / scheduled", dashed: true });
  }
  if ((model.flows ?? []).some((f) => f.protocol)) {
    rows.push({ kind: "dot", color: INK.muted, label: "Chip — interface / protocol" });
  }
  return rows;
}

export { CARD_W, CARD_H };
