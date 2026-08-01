/**
 * Design system for generated architecture diagrams.
 *
 * This is an original visual language, not a reproduction of any vendor's diagram
 * style. Published reference architectures (SAP Architecture Center and others) are
 * used only as a quality bar — the tokens below are ours, and every emitted style
 * string is derived from them rather than copied from a source document.
 *
 * Design intent
 * - One hue per semantic role, so colour always means something.
 * - Areas read as calm containers: 6–10% tint, restrained stroke, generous radius.
 * - Foreground objects are white cards carrying their owner's hue, so the eye
 *   follows structure first and detail second.
 * - Everything sits on an 8px grid at a 1.25 modular type scale.
 */

// ── Geometry ───────────────────────────────────────────────────────────────
/** Base grid. All positions and sizes are multiples of this. */
export const GRID = 8;
export const SPACE = {
  xs: GRID, // 8
  sm: GRID * 2, // 16
  md: GRID * 3, // 24
  lg: GRID * 5, // 40
  xl: GRID * 8, // 64
} as const;

export const RADIUS = { area: 12, card: 8, chip: 999 } as const;
export const STROKE = { hairline: 1, regular: 1.25, emphasis: 2, boundary: 2.5 } as const;

/** 1.25 modular scale, rounded to whole pixels. */
export const TYPE = {
  title: 20,
  subtitle: 13,
  areaTitle: 15,
  subAreaTitle: 13,
  cardTitle: 12,
  cardMeta: 11,
  edge: 11,
  chip: 11,
  legend: 11,
} as const;

export const FONT = "Helvetica";

// ── Colour ─────────────────────────────────────────────────────────────────
/**
 * Semantic roles, not brand colours. Each role owns one hue; fills are tints of
 * the same hue so an area and its members read as one family.
 */
export type Role =
  | "platform"
  | "application"
  | "data"
  | "integration"
  | "security"
  | "external"
  | "edge"
  | "neutral";

export interface RoleColor {
  /** Stroke, icon chrome and text accents. */
  line: string;
  /** Area background — a low-saturation tint of `line`. */
  wash: string;
  /** Chip / badge background — slightly stronger than wash. */
  tint: string;
}

/**
 * Hues chosen for separation on both light backgrounds and greyscale print:
 * azure, violet, teal, cyan-slate, green, amber, magenta, slate.
 */
export const PALETTE: Record<Role, RoleColor> = {
  platform: { line: "#2F5EA8", wash: "#EEF3FB", tint: "#DCE6F6" },
  application: { line: "#6A4BB8", wash: "#F2EFFA", tint: "#E4DEF5" },
  data: { line: "#0E7C6B", wash: "#E9F6F3", tint: "#D2EDE7" },
  integration: { line: "#1F6F8B", wash: "#EAF4F7", tint: "#D3E8EF" },
  security: { line: "#1E7A4C", wash: "#EAF5EF", tint: "#D3EADF" },
  external: { line: "#5C6B7A", wash: "#F2F4F6", tint: "#E3E7EB" },
  edge: { line: "#A55A1B", wash: "#FBF2E9", tint: "#F4E2CD" },
  neutral: { line: "#5C6B7A", wash: "#F7F8FA", tint: "#E9ECEF" },
};

export const INK = {
  strong: "#16202B",
  muted: "#5A6B7C",
  faint: "#8A98A6",
  surface: "#FFFFFF",
  hairline: "#D8DEE4",
} as const;

/** Connector semantics. One meaning per colour, declared in the legend. */
export type FlowSemantic = "data" | "control" | "event" | "trust" | "async" | "batch";

export const FLOW_COLOR: Record<FlowSemantic, string> = {
  data: "#5C6B7A",
  control: "#2F5EA8",
  event: "#A55A1B",
  trust: "#1E7A4C",
  async: "#1F6F8B",
  batch: "#6A4BB8",
};

export const FLOW_LABEL: Record<FlowSemantic, string> = {
  data: "Data flow",
  control: "Control / request",
  event: "Event (asynchronous)",
  trust: "Trust / authentication",
  async: "Asynchronous channel",
  batch: "Batch / scheduled",
};

// ── Style builders ─────────────────────────────────────────────────────────
const join = (parts: Array<string | false | undefined>) => parts.filter(Boolean).join("");

/** Container for a landscape, zone, tenant or environment. */
export function areaStyle(role: Role, depth = 0): string {
  const c = PALETTE[role];
  // Alternate filled / plain so nesting stays legible instead of stacking tints.
  const fill = depth % 2 === 1 ? INK.surface : c.wash;
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.area};absoluteArcSize=1;`,
    `strokeColor=${c.line};fillColor=${fill};strokeWidth=${STROKE.regular};`,
    "align=left;verticalAlign=top;spacingLeft=12;spacingTop=4;",
    `fontFamily=${FONT};fontSize=${depth === 0 ? TYPE.areaTitle : TYPE.subAreaTitle};`,
    `fontStyle=1;fontColor=${INK.muted};`,
    "container=0;recursiveResize=0;collapsible=0;",
  ]);
}

/** A dashed container used for trust boundaries and security zones. */
export function boundaryStyle(role: Role = "security"): string {
  const c = PALETTE[role];
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.area};absoluteArcSize=1;`,
    `strokeColor=${c.line};fillColor=none;strokeWidth=${STROKE.boundary};dashed=1;dashPattern=8 6;`,
    "align=right;verticalAlign=top;spacingRight=12;spacingTop=4;",
    `fontFamily=${FONT};fontSize=${TYPE.subAreaTitle};fontStyle=2;fontColor=${c.line};`,
    "container=0;recursiveResize=0;collapsible=0;",
  ]);
}

/**
 * Visual weight.
 * - `focus`  — what this diagram is actually about: heavier stroke, accent hue.
 * - `normal` — the working set.
 * - `muted`  — surrounding platform context, present for orientation but stepped
 *   back so it never competes with the subject.
 */
export type Emphasis = "focus" | "normal" | "muted";

/** Accent reserved for the subject of the diagram. Used sparingly, by definition. */
export const FOCUS = { line: "#B0208C", wash: "#FDEFF8" } as const;

/** Foreground object: white card carrying its owner's hue. */
export function cardStyle(role: Role, emphasis: Emphasis = "normal"): string {
  const c = PALETTE[role];
  const line = emphasis === "focus" ? FOCUS.line : emphasis === "muted" ? INK.hairline : c.line;
  const text = emphasis === "muted" ? INK.faint : INK.strong;
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.card};absoluteArcSize=1;`,
    `strokeColor=${line};fillColor=${INK.surface};`,
    `strokeWidth=${emphasis === "focus" ? STROKE.emphasis : STROKE.regular};`,
    emphasis === "muted" && "dashed=1;dashPattern=4 4;",
    "align=center;verticalAlign=middle;",
    `fontFamily=${FONT};fontSize=${TYPE.cardTitle};fontColor=${text};fontStyle=1;`,
    "container=0;recursiveResize=0;collapsible=0;",
  ]);
}

/**
 * A component that holds other components: title sits top-left with the children
 * stacked beneath, the way a runtime visibly contains the things it runs.
 */
export function groupCardStyle(role: Role, emphasis: Emphasis = "normal"): string {
  const c = PALETTE[role];
  const line = emphasis === "focus" ? FOCUS.line : emphasis === "muted" ? INK.hairline : c.line;
  const fill = emphasis === "focus" ? FOCUS.wash : emphasis === "muted" ? INK.surface : c.wash;
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.card};absoluteArcSize=1;`,
    `strokeColor=${line};fillColor=${fill};`,
    `strokeWidth=${emphasis === "focus" ? STROKE.emphasis : STROKE.regular};`,
    "align=left;verticalAlign=top;spacingLeft=10;spacingTop=2;",
    `fontFamily=${FONT};fontSize=${TYPE.cardTitle};`,
    `fontColor=${emphasis === "muted" ? INK.faint : INK.strong};fontStyle=1;`,
    "container=0;recursiveResize=0;collapsible=0;",
  ]);
}

/** Compact single-line card for a module inside a group. */
export function moduleStyle(role: Role, emphasis: Emphasis = "normal"): string {
  const c = PALETTE[role];
  const line = emphasis === "focus" ? FOCUS.line : emphasis === "muted" ? INK.hairline : c.line;
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.card};absoluteArcSize=1;`,
    `strokeColor=${line};fillColor=${INK.surface};strokeWidth=${STROKE.regular};`,
    emphasis === "muted" && "dashed=1;dashPattern=4 4;",
    "align=center;verticalAlign=middle;",
    `fontFamily=${FONT};fontSize=${TYPE.cardMeta};`,
    `fontColor=${emphasis === "muted" ? INK.faint : INK.strong};`,
    "container=0;recursiveResize=0;collapsible=0;",
  ]);
}

/** Tile that hosts a vendor service glyph, with the label beneath it. */
export function glyphTileStyle(role: Role): string {
  const c = PALETTE[role];
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.card};absoluteArcSize=1;`,
    `strokeColor=${c.line};fillColor=${INK.surface};strokeWidth=${STROKE.regular};`,
    "verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;",
    `fontFamily=${FONT};fontSize=${TYPE.cardMeta};fontColor=${INK.strong};fontStyle=1;`,
  ]);
}

/** Human or system actor. */
export function actorStyle(): string {
  return join([
    "shape=actor;whiteSpace=wrap;html=1;",
    `fillColor=${PALETTE.neutral.tint};strokeColor=${PALETTE.neutral.line};strokeWidth=${STROKE.regular};`,
    "verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;",
    `fontFamily=${FONT};fontSize=${TYPE.cardMeta};fontColor=${INK.strong};fontStyle=1;`,
  ]);
}

/** Interface chip that rides a connector (protocol / API name). */
export function chipStyle(semantic: FlowSemantic): string {
  const color = FLOW_COLOR[semantic];
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.chip};`,
    `strokeColor=${color};fillColor=${INK.surface};strokeWidth=${STROKE.regular};`,
    "align=center;verticalAlign=middle;resizable=0;points=[];",
    `fontFamily=${FONT};fontSize=${TYPE.chip};fontColor=${INK.strong};`,
  ]);
}

/** Orthogonal connector carrying one semantic meaning. */
export function connectorStyle(semantic: FlowSemantic, opts: { bidirectional?: boolean } = {}): string {
  const color = FLOW_COLOR[semantic];
  const dashed = semantic === "event" || semantic === "batch";
  return join([
    "edgeStyle=orthogonalEdgeStyle;rounded=1;arcSize=8;orthogonalLoop=1;jettySize=auto;html=1;",
    `strokeColor=${color};strokeWidth=${STROKE.regular};`,
    dashed && "dashed=1;dashPattern=6 4;",
    "endArrow=blockThin;endFill=1;",
    opts.bidirectional ? "startArrow=blockThin;startFill=1;" : "startArrow=none;",
    "align=center;verticalAlign=middle;",
    `fontFamily=${FONT};fontSize=${TYPE.edge};fontColor=${INK.muted};labelBackgroundColor=${INK.surface};`,
  ]);
}

/** Thick divider marking a network or tenancy separation. */
export function separatorStyle(): string {
  return join([
    "edgeStyle=none;orthogonalLoop=1;jettySize=auto;html=1;rounded=0;",
    `endArrow=none;endFill=0;strokeWidth=${STROKE.boundary};strokeColor=${INK.faint};`,
    "jumpStyle=gap;jumpSize=8;",
    `fontFamily=${FONT};fontSize=${TYPE.cardMeta};fontColor=${INK.faint};verticalAlign=top;`,
  ]);
}

/** A platform service drawn as a glyph with its label beneath, rather than a card. */
export function iconNodeStyle(role: Role, emphasis: Emphasis = "normal"): string {
  const c = PALETTE[role];
  return join([
    "ellipse;whiteSpace=wrap;html=1;",
    `fillColor=${emphasis === "muted" ? INK.surface : c.wash};strokeColor=${
      emphasis === "muted" ? INK.hairline : c.line
    };strokeWidth=${STROKE.regular};`,
    "verticalLabelPosition=bottom;verticalAlign=top;labelPosition=center;align=center;",
    `fontFamily=${FONT};fontSize=${TYPE.cardMeta};fontStyle=1;`,
    `fontColor=${emphasis === "muted" ? INK.faint : INK.strong};`,
  ]);
}

/** Multi-instance marker: the card sits on top of two offset copies. */
export function stackShadowStyle(role: Role): string {
  const c = PALETTE[role];
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.card};absoluteArcSize=1;`,
    `strokeColor=${c.line};fillColor=${INK.surface};strokeWidth=${STROKE.regular};`,
    "opacity=60;",
  ]);
}

/** Title block along the bottom edge: what this is, when it changed, which revision. */
export function footerRuleStyle(): string {
  return join([
    "edgeStyle=none;html=1;rounded=0;endArrow=none;endFill=0;",
    `strokeWidth=${STROKE.hairline};strokeColor=${INK.hairline};`,
  ]);
}

export function footerLabelStyle(strong = false): string {
  return join([
    "text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;rounded=0;",
    "align=left;verticalAlign=middle;",
    `fontFamily=${FONT};fontSize=${strong ? TYPE.subtitle : TYPE.cardMeta};`,
    `fontStyle=${strong ? 1 : 2};fontColor=${strong ? INK.strong : INK.muted};`,
  ]);
}

/**
 * Vertical rule marking a network or ownership separation. `jumpStyle` makes
 * connectors visibly hop the rule, so a crossing reads as a deliberate traversal of
 * the boundary rather than an accident of layout.
 */
export function dividerStyle(): string {
  return join([
    "edgeStyle=none;html=1;rounded=0;endArrow=none;endFill=0;",
    `strokeWidth=${STROKE.boundary};strokeColor=${INK.faint};`,
    "jumpStyle=gap;jumpSize=8;",
  ]);
}

export function dividerLabelStyle(): string {
  return join([
    "text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;rounded=0;",
    "align=center;verticalAlign=middle;",
    `fontFamily=${FONT};fontSize=${TYPE.cardMeta};fontStyle=1;fontColor=${INK.faint};`,
  ]);
}

export function titleStyle(): string {
  return join([
    "text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;rounded=0;",
    "align=left;verticalAlign=middle;",
    `fontFamily=${FONT};fontSize=${TYPE.title};fontStyle=1;fontColor=${INK.strong};`,
  ]);
}

export function subtitleStyle(): string {
  return join([
    "text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;rounded=0;",
    "align=left;verticalAlign=top;",
    `fontFamily=${FONT};fontSize=${TYPE.subtitle};fontColor=${INK.muted};`,
  ]);
}

export function legendStyle(): string {
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.card};absoluteArcSize=1;`,
    `strokeColor=${INK.hairline};fillColor=${INK.surface};strokeWidth=${STROKE.hairline};`,
    "align=left;verticalAlign=top;spacingLeft=12;spacingTop=8;",
    `fontFamily=${FONT};fontSize=${TYPE.legend};fontColor=${INK.muted};`,
  ]);
}

export function noteStyle(): string {
  return join([
    "rounded=1;whiteSpace=wrap;html=1;",
    `arcSize=${RADIUS.card};absoluteArcSize=1;`,
    `strokeColor=${PALETTE.edge.line};fillColor=${PALETTE.edge.wash};strokeWidth=${STROKE.hairline};`,
    "align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;",
    `fontFamily=${FONT};fontSize=${TYPE.cardMeta};fontColor=${INK.strong};`,
  ]);
}
