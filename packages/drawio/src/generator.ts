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

function labelHtml(title: string, subtitle?: string): string {
  const t = esc(title);
  if (!subtitle) return `&lt;b&gt;${t}&lt;/b&gt;`;
  return `&lt;b&gt;${t}&lt;/b&gt;&lt;div&gt;&lt;i&gt;${esc(subtitle)}&lt;/i&gt;&lt;/div&gt;`;
}

function zoneStyle(kind: ZoneKind): string {
  switch (kind) {
    case "sap-btp":
    case "sap-cloud":
      return STYLE.sapArea;
    case "custom":
      return STYLE.accentArea;
    default:
      return STYLE.nonSapArea;
  }
}

function cardStyle(kind: ArchitectureComponent["kind"]): string {
  switch (kind) {
    case "agent":
    case "custom-app":
      return STYLE.cardAccent;
    case "external":
    case "actor":
      return STYLE.cardNeutral;
    default:
      return STYLE.card;
  }
}

function edgeStyle(mode?: string): string {
  if (mode === "trust") return STYLE.edgeTrust;
  if (mode === "event" || mode === "async") return STYLE.edgeAccent;
  return STYLE.edge;
}

interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CARD_W = 148;
const CARD_H = 64;
const ICON_SIZE = 64;
const ICON_SLOT_H = 100; // 64 icon + label space
const PAD = 28;
const GAP = 24;

function componentFootprint(c: ArchitectureComponent): { w: number; h: number } {
  const icon = resolveSapIcon(c.officialName, c.label, c.sapIcon);
  if (icon && isIconKind(c.kind)) {
    return { w: Math.max(ICON_SIZE + 16, 100), h: ICON_SLOT_H };
  }
  return { w: CARD_W, h: CARD_H };
}

function layoutZones(model: ArchitectureModel): Map<string, LayoutBox> {
  const topZones = model.zones.filter((z) => !z.parentId);
  const map = new Map<string, LayoutBox>();
  let x = 40;
  const y = 100;

  for (const zone of topZones) {
    const children = model.components.filter((c) => c.zoneId === zone.id);
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(children.length, 1))));
    const rows = Math.max(1, Math.ceil(Math.max(children.length, 1) / cols));
    const cellW = Math.max(...children.map((c) => componentFootprint(c).w), CARD_W);
    const cellH = Math.max(...children.map((c) => componentFootprint(c).h), CARD_H);
    const w = Math.max(300, cols * (cellW + GAP) + PAD * 2);
    const h = Math.max(280, rows * (cellH + GAP) + PAD * 2 + 36);
    map.set(zone.id, { x, y, w, h });
    x += w + 40;
  }

  for (const zone of model.zones.filter((z) => z.parentId)) {
    const parent = map.get(zone.parentId!);
    if (!parent) continue;
    map.set(zone.id, {
      x: parent.x + 20,
      y: parent.y + 44,
      w: parent.w - 40,
      h: parent.h - 64,
    });
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

  for (const [zoneId, comps] of byZone) {
    const zone = zoneLayout.get(zoneId);
    if (!zone) continue;
    const cols = Math.max(1, Math.ceil(Math.sqrt(comps.length)));
    const cellW = Math.max(...comps.map((c) => componentFootprint(c).w), CARD_W);
    const cellH = Math.max(...comps.map((c) => componentFootprint(c).h), CARD_H);
    comps.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const fp = componentFootprint(c);
      map.set(c.id, {
        x: zone.x + PAD + col * (cellW + GAP) + Math.floor((cellW - fp.w) / 2),
        y: zone.y + PAD + 28 + row * (cellH + GAP),
        w: fp.w,
        h: fp.h,
      });
    });
  }
  return map;
}

function actorLayout(model: ArchitectureModel): Map<string, LayoutBox> {
  const map = new Map<string, LayoutBox>();
  model.actors.forEach((a, i) => {
    map.set(a.id, { x: 40, y: 110 + i * 100, w: 110, h: 56 });
  });
  return map;
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
  const compLayout = layoutComponents(model, zoneLayout);
  const actors = actorLayout(model);

  const actorOffset = model.actors.length ? 160 : 0;
  if (actorOffset) {
    for (const box of zoneLayout.values()) box.x += actorOffset;
    for (const box of compLayout.values()) box.x += actorOffset;
  }

  let maxX = 1400;
  let maxY = 900;
  for (const b of [...zoneLayout.values(), ...compLayout.values(), ...actors.values()]) {
    maxX = Math.max(maxX, b.x + b.w + 80);
    maxY = Math.max(maxY, b.y + b.h + 160);
  }
  const pageWidth = options.pageWidth ?? Math.ceil(maxX / 100) * 100;
  const pageHeight = options.pageHeight ?? Math.ceil(maxY / 100) * 100;

  const cells: string[] = [];
  cells.push(`        <mxCell id="0"/>`);
  cells.push(`        <mxCell id="1" parent="0"/>`);

  cells.push(
    `        <mxCell id="title" value="${esc(model.title)}" style="${STYLE.title}" vertex="1" parent="1">
          <mxGeometry x="40" y="20" width="${Math.min(pageWidth - 80, 1000)}" height="36" as="geometry"/>
        </mxCell>`
  );

  if (model.summary) {
    cells.push(
      `        <mxCell id="subtitle" value="${esc(model.summary)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontFamily=Helvetica;fontSize=12;fontColor=#556B82;" vertex="1" parent="1">
          <mxGeometry x="40" y="52" width="${Math.min(pageWidth - 80, 1100)}" height="36" as="geometry"/>
        </mxCell>`
    );
  }

  for (const actor of model.actors) {
    const box = actors.get(actor.id)!;
    const value = labelHtml(actor.label, actor.role);
    cells.push(
      `        <mxCell id="${esc(actor.id)}" value="${value}" style="${STYLE.cardNeutral}" vertex="1" parent="1">
          <mxGeometry x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" as="geometry"/>
        </mxCell>`
    );
  }

  const orderedZones: ArchitectureZone[] = [
    ...model.zones.filter((z) => !z.parentId),
    ...model.zones.filter((z) => z.parentId),
  ];
  for (const zone of orderedZones) {
    const box = zoneLayout.get(zone.id);
    if (!box) continue;
    cells.push(
      `        <mxCell id="${esc(zone.id)}" value="${esc(zone.label)}" style="${zoneStyle(zone.kind)}" vertex="1" parent="1">
          <mxGeometry x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" as="geometry"/>
        </mxCell>`
    );
  }

  for (const comp of model.components) {
    const box = compLayout.get(comp.id);
    if (!box) continue;
    const iconName = resolveSapIcon(comp.officialName, comp.label, comp.sapIcon);
    const useIcon = Boolean(iconName && isIconKind(comp.kind));

    if (useIcon && iconName) {
      // Official SAP service icon: plain-text label, 64x64, grey chrome (Style Contract)
      const label = (comp.officialName ?? comp.label).replace(/ /g, (m, offset, s) => {
        // soft wrap long names roughly mid-word boundaries for &#xa;
        return m;
      });
      let display = comp.officialName ?? comp.label;
      if (display.length > 18 && display.includes(" ")) {
        const parts = display.split(" ");
        const mid = Math.ceil(parts.length / 2);
        display = `${parts.slice(0, mid).join(" ")}\n${parts.slice(mid).join(" ")}`;
      }
      cells.push(
        sapIconCell(comp.id, iconName, display, box.x + Math.floor((box.w - ICON_SIZE) / 2), box.y, ICON_SIZE)
      );
    } else {
      // Product / custom / external: white card (SaaS products have no SAPIcon)
      const value = labelHtml(comp.officialName ?? comp.label, comp.subtitle);
      cells.push(
        `        <mxCell id="${esc(comp.id)}" value="${value}" style="${cardStyle(comp.kind)}" vertex="1" parent="1">
          <mxGeometry x="${box.x}" y="${box.y}" width="${CARD_W}" height="${CARD_H}" as="geometry"/>
        </mxCell>`
      );
    }
  }

  for (const flow of model.flows) {
    const sourceExists =
      model.components.some((c) => c.id === flow.sourceId) ||
      model.actors.some((a) => a.id === flow.sourceId);
    const targetExists =
      model.components.some((c) => c.id === flow.targetId) ||
      model.actors.some((a) => a.id === flow.targetId);
    if (!sourceExists || !targetExists) continue;

    let style = edgeStyle(flow.mode);
    if (flow.bidirectional) {
      style = style.replace("startArrow=none", "startArrow=blockThin;startFill=1");
    }
    const labelParts: string[] = [];
    if (flow.label) labelParts.push(flow.label);
    if (flow.protocol) labelParts.push(flow.protocol);
    const value =
      flow.mode === "trust"
        ? `&lt;font color=&quot;#188918&quot; size=&quot;1&quot;&gt;&lt;b&gt;TRUST&lt;/b&gt;&lt;/font&gt;`
        : esc(labelParts.join(" · "));

    cells.push(
      `        <mxCell id="${esc(flow.id)}" value="${value}" style="${style}" edge="1" parent="1" source="${esc(flow.sourceId)}" target="${esc(flow.targetId)}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>`
    );

    // Protocol pills on accent channels
    if (flow.protocol && (flow.mode === "async" || flow.mode === "event" || flow.protocol.match(/A2A|MCP|OData/i))) {
      const isPink = /MCP|Vision/i.test(flow.protocol);
      const pillStyle = isPink
        ? "rounded=1;whiteSpace=wrap;html=1;arcSize=50;strokeColor=#CC00DC;fillColor=#fff0fa;strokeWidth=1.5;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=11;fontColor=default;"
        : STYLE.pill;
      const srcBox = compLayout.get(flow.sourceId) ?? actors.get(flow.sourceId);
      const tgtBox = compLayout.get(flow.targetId) ?? actors.get(flow.targetId);
      if (srcBox && tgtBox) {
        const px = Math.floor((srcBox.x + srcBox.w + tgtBox.x) / 2) - 28;
        const py = Math.floor((srcBox.y + tgtBox.y) / 2);
        cells.push(
          `        <mxCell id="pill-${esc(flow.id)}" value="${esc(flow.protocol)}" style="${pillStyle}" vertex="1" parent="1">
          <mxGeometry x="${px}" y="${py}" width="${Math.max(48, flow.protocol.length * 8)}" height="22" as="geometry"/>
        </mxCell>`
        );
      }
    }
  }

  const legendY = maxY - 130;
  const legendValue = [
    "Legend",
    "• Blue area — SAP / SAP BTP",
    "• Grey area — non-SAP / partner / user",
    "• Indigo — custom domain / agents",
    "• Green edge — trust / authentication",
    "• Teal / pink — accent channels + pills",
    "• 64×64 grey tiles — official SAP icons",
  ]
    .map((line) => esc(line))
    .join("&#xa;");
  cells.push(
    `        <mxCell id="legend" value="${legendValue}" style="${STYLE.legend}" vertex="1" parent="1">
          <mxGeometry x="40" y="${legendY}" width="300" height="120" as="geometry"/>
        </mxCell>`
  );

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
