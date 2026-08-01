/**
 * Sequence diagrams.
 *
 * These do not fit the flow-graph engine: position carries *time*, not dependency.
 * Participants are columns, the vertical axis is ordering, and every message is a
 * horizontal hop between two lifelines. Flow order in the model is taken as message
 * order, which is the only ordering information a static model carries.
 */
import type { ArchitectureModel } from "@sap-architect/shared";
import { DiagramDoc, esc, labelMarkup } from "./mxfile.js";
import {
  FONT,
  GRID,
  INK,
  PALETTE,
  SPACE,
  STROKE,
  TYPE,
  cardStyle,
  connectorStyle,
  legendStyle,
  subtitleStyle,
  titleStyle,
  type FlowSemantic,
  type Role,
} from "./theme.js";

const HEAD_W = 200;
const HEAD_H = 56;
const LANE_GAP = 72;
const STEP = 56;
const TOP = 128;

function lifelineStyle(): string {
  return [
    "html=1;shape=line;direction=north;",
    `strokeColor=${INK.hairline};strokeWidth=${STROKE.regular};dashed=1;dashPattern=4 4;`,
    "labelPosition=center;verticalLabelPosition=bottom;align=center;",
  ].join("");
}

function activationStyle(role: Role): string {
  return [
    "html=1;rounded=0;",
    `fillColor=${PALETTE[role].tint};strokeColor=${PALETTE[role].line};strokeWidth=${STROKE.hairline};`,
  ].join("");
}

/** Message ordering is the model's flow order; participants are ordered by first use. */
export function generateSequenceXml(
  model: ArchitectureModel,
  options: { pageName?: string } = {}
): string {
  const flows = model.flows ?? [];
  const byId = new Map([
    ...(model.components ?? []).map((c) => [c.id, { label: c.officialName ?? c.label, sub: c.subtitle, kind: c.kind }] as const),
    ...(model.actors ?? []).map((a) => [a.id, { label: a.label, sub: a.role, kind: "actor" }] as const),
  ]);

  const order: string[] = [];
  for (const f of flows) {
    for (const id of [f.sourceId, f.targetId]) if (byId.has(id) && !order.includes(id)) order.push(id);
  }
  for (const [id] of byId) if (!order.includes(id)) order.push(id);

  const roleOf = (kind: string): Role =>
    kind === "database" ? "data" :
    kind === "identity" ? "security" :
    kind === "integration" ? "integration" :
    kind === "external" ? "external" :
    kind === "actor" ? "neutral" : "platform";

  const laneX = new Map(order.map((id, i) => [id, SPACE.lg + i * (HEAD_W + LANE_GAP)]));
  const messages = flows.filter((f) => byId.has(f.sourceId) && byId.has(f.targetId));
  const bottom = TOP + HEAD_H + STEP * (messages.length + 1);

  const doc = new DiagramDoc(options.pageName ?? "Sequence", { width: 1600, height: 1000 });
  const lParticipants = doc.layer("1", "Participants");
  const lMessages = doc.layer("layer-messages", "Messages");
  const lNotes = doc.layer("layer-annotations", "Annotations");

  // ── Participants and their lifelines ─────────────────────────────────────
  for (const id of order) {
    const p = byId.get(id)!;
    const x = laneX.get(id)!;
    const role = roleOf(p.kind);
    doc.shape(lParticipants, {
      id,
      label: labelMarkup(p.label, p.sub),
      style: cardStyle(role),
      x,
      y: TOP,
      w: HEAD_W,
      h: HEAD_H,
      parent: lParticipants.id,
      attrs: { type: "participant", role, kind: p.kind },
    });
    doc.shape(lParticipants, {
      id: `${id}-lifeline`,
      label: "",
      style: lifelineStyle(),
      x: x + HEAD_W / 2 - 4,
      y: TOP + HEAD_H,
      w: 8,
      h: bottom - (TOP + HEAD_H),
      parent: lParticipants.id,
      attrs: { type: "lifeline", participant: id },
    });
  }

  // ── Messages: one row each, top to bottom ────────────────────────────────
  messages.forEach((f, i) => {
    const y = TOP + HEAD_H + STEP * (i + 1);
    const sx = laneX.get(f.sourceId)! + HEAD_W / 2;
    const tx = laneX.get(f.targetId)! + HEAD_W / 2;
    const semantic: FlowSemantic =
      f.mode === "trust" ? "trust" : f.mode === "event" ? "event" : f.mode === "async" ? "async" : "control";

    // activation bar on the receiver, so the reader can see who is doing work
    const role = roleOf(byId.get(f.targetId)!.kind);
    doc.shape(lMessages, {
      id: `${f.id}-activation`,
      label: "",
      style: activationStyle(role),
      x: tx - 5,
      y: y - GRID,
      w: 10,
      h: STEP - GRID,
      parent: lMessages.id,
      attrs: { type: "activation", of: f.targetId },
    });

    const label = [f.label, f.protocol].filter(Boolean).join(" · ") || "message";
    // a message is a straight horizontal hop, so the orthogonal router is turned off
    // by rewriting the key rather than appending a second one
    const style = connectorStyle(semantic, { bidirectional: f.bidirectional })
      .replace("edgeStyle=orthogonalEdgeStyle;", "edgeStyle=none;")
      .replace("rounded=1;arcSize=8;", "rounded=0;");
    doc.freeEdge(lMessages, {
      id: f.id,
      label: `${i + 1}. ${label}`,
      style,
      from: { x: sx, y },
      to: { x: tx, y },
    });
  });

  // ── Annotations ──────────────────────────────────────────────────────────
  doc.shape(lNotes, {
    id: "title",
    label: esc(model.title),
    style: titleStyle(),
    x: SPACE.lg,
    y: SPACE.md,
    w: 1000,
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
      w: 1000,
      h: 32,
      parent: lNotes.id,
      attrs: { type: "subtitle" },
    });
  }
  const legend = [
    "&lt;b&gt;Legend&lt;/b&gt;",
    esc("— Time flows downward; messages are numbered"),
    esc("— Vertical dashed line is a participant's lifeline"),
    esc("— Filled bar shows the participant is active"),
  ].join("&#xa;");
  doc.shape(lNotes, {
    id: "legend",
    label: legend,
    style: legendStyle(),
    x: SPACE.lg,
    y: bottom + SPACE.md,
    w: 360,
    h: 84,
    parent: lNotes.id,
    attrs: { type: "legend" },
  });

  const width = SPACE.lg * 2 + order.length * (HEAD_W + LANE_GAP);
  doc.resize(Math.ceil(width / GRID) * GRID, Math.ceil((bottom + 140) / GRID) * GRID);
  return doc.toXml();
}
