/**
 * Smoke checks for the non-obvious logic. Run: npm test (needs npm run build first).
 * ponytail: one file, node:test, no framework — grow it only when something else breaks.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  SAP_ICON_BY_SERVICE,
  SAP_ICON_CATALOG,
  generateDrawioXml,
  resolveSapIcon,
  validateDrawioXml,
} from "@sap-architect/drawio";
import { resumeArchitecturePipeline, validateArchitectureModel } from "@sap-architect/core";

const MODEL = {
  id: "m1",
  title: "Test L1",
  level: "L1",
  summary: "smoke",
  actors: [{ id: "a1", label: "User" }],
  zones: [{ id: "z1", label: "SAP BTP", kind: "sap-btp" }],
  components: [{ id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "z1" }],
  flows: [{ id: "f1", sourceId: "a1", targetId: "c1", label: "uses" }],
};

test("validator reports issues instead of throwing on malformed models", () => {
  for (const bad of [null, {}, { title: "T", components: "nope" }, { title: "T" }]) {
    const r = validateArchitectureModel(bad);
    assert.equal(r.ok, false);
    assert.ok(r.issues.length > 0);
  }
  assert.equal(validateArchitectureModel({ ...MODEL, components: [] }).ok, false);
  assert.equal(validateArchitectureModel(MODEL).ok, true);
});

test("validator catches dangling references", () => {
  const orphan = validateArchitectureModel({
    ...MODEL,
    components: [{ id: "c1", label: "X", kind: "sap-service", zoneId: "missing" }],
  });
  assert.match(orphan.issues.join(";"), /zone missing/);

  const badFlow = validateArchitectureModel({
    ...MODEL,
    flows: [{ id: "f1", sourceId: "ghost", targetId: "c1" }],
  });
  assert.match(badFlow.issues.join(";"), /bad source/);
});

test("icon lookup ignores ambiguous short tokens", () => {
  assert.equal(resolveSapIcon(undefined, "SAP"), undefined);
  assert.equal(resolveSapIcon(undefined, "AI"), undefined);
  assert.equal(resolveSapIcon(undefined, "Core"), undefined);
  assert.equal(resolveSapIcon(undefined, "SAP Integration Suite"), "SAP_Integration_Suite");
  assert.equal(resolveSapIcon(undefined, "Joule"), "SAP_Digital_Assistant");
});

test("generated XML is well formed and wires every flow", () => {
  const xml = generateDrawioXml(MODEL);
  assert.match(xml, /<mxfile/);
  assert.match(xml, /edge="1"[^>]*source="a1"[^>]*target="c1"/);
  const ids = [...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size, "duplicate cell ids");
});

/** Parse cells and resolve parent transforms into absolute boxes. */
function parseCells(xml) {
  const cells = [];
  const re = /<mxCell\s+id="([^"]+)"([^>]*?)>\s*<mxGeometry([^>]*)/g;
  for (const m of xml.matchAll(re)) {
    const g = m[3];
    const n = (k) => {
      const v = g.match(new RegExp(`\\b${k}="([-0-9.]+)"`));
      return v ? parseFloat(v[1]) : undefined;
    };
    cells.push({
      id: m[1],
      style: (m[2].match(/style="([^"]*)"/) || [, ""])[1],
      parent: (m[2].match(/parent="([^"]+)"/) || [, "1"])[1],
      x: n("x"), y: n("y"), w: n("width"), h: n("height"),
      rel: /relative="1"/.test(g),
    });
  }
  const by = new Map(cells.map((c) => [c.id, c]));
  const abs = new Map();
  const resolve = (c) => {
    if (abs.has(c.id)) return abs.get(c.id);
    if (c.x === undefined || c.rel) return undefined;
    const p = by.get(c.parent);
    const o = p && p.x !== undefined && !p.rel ? resolve(p) : undefined;
    const box = { x: c.x + (o?.x ?? 0), y: c.y + (o?.y ?? 0), w: c.w, h: c.h };
    abs.set(c.id, box);
    return box;
  };
  for (const c of cells) resolve(c);
  return { cells, by, abs };
}
const boxes = (xml) => parseCells(xml).abs;
const inside = (outer, inner) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

const NESTED_MODEL = {
  ...MODEL,
  zones: [
    { id: "z1", label: "SAP BTP", kind: "sap-btp" },
    { id: "z2", label: "Custom agents", kind: "custom", parentId: "z1" },
  ],
  components: [
    { id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "z1" },
    { id: "c2", label: "SAP HANA Cloud", kind: "database", zoneId: "z1" },
    { id: "c3", label: "Procurement Agent", kind: "agent", zoneId: "z2" },
  ],
  flows: [
    { id: "f1", sourceId: "c1", targetId: "c3", label: "calls", protocol: "A2A", mode: "async" },
  ],
};

test("nested zones stack instead of overlaying the parent's components", () => {
  const nested = NESTED_MODEL;
  const b = boxes(generateDrawioXml(nested));

  assert.ok(inside(b.get("z1"), b.get("z2")), "child zone must sit inside its parent");
  assert.ok(inside(b.get("z2"), b.get("c3")), "child component must sit inside its child zone");
  for (const id of ["c1", "c2"]) assert.ok(inside(b.get("z1"), b.get(id)), `${id} outside z1`);

  // no two positioned cells may collide unless one fully contains the other
  const ids = [...b.keys()];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = b.get(ids[i]), c = b.get(ids[j]);
      const hit =
        Math.min(a.x + a.w, c.x + c.w) > Math.max(a.x, c.x) &&
        Math.min(a.y + a.h, c.y + c.h) > Math.max(a.y, c.y);
      assert.ok(
        !hit || inside(a, c) || inside(c, a),
        `${ids[i]} overlaps ${ids[j]}`
      );
    }

  // protocol pill must ride the edge, not float over the canvas
  assert.ok(!b.has("pill-f1"), "pill must not be absolutely positioned");
  assert.match(generateDrawioXml(nested), /id="pill-f1"[^>]*parent="f1"/);

  // components belong to their zone cell so a zone drags its contents with it
  const { by } = parseCells(generateDrawioXml(nested));
  assert.equal(by.get("c3").parent, "z2");
  assert.equal(by.get("c1").parent, "z1");
  assert.equal(by.get("z2").parent, "z1");
});

test("nested area fills alternate so no two stacked levels look identical", () => {
  const deep = {
    ...NESTED_MODEL,
    zones: [
      { id: "z1", label: "SAP BTP", kind: "sap-btp" },
      { id: "zs", label: "Subaccount", kind: "sap-btp", parentId: "z1" },
      { id: "z2", label: "Custom agents", kind: "custom", parentId: "zs" },
    ],
    components: [
      { id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "zs" },
      { id: "c2", label: "SAP HANA Cloud", kind: "database", zoneId: "zs" },
      { id: "c3", label: "Procurement Agent", kind: "agent", zoneId: "z2" },
    ],
  };
  const xml = generateDrawioXml(deep);
  const { by, abs } = parseCells(xml);
  const fill = (id) => (by.get(id).style.match(/fillColor=([^;]+)/) || [])[1];

  assert.notEqual(fill("z1"), fill("zs"), "subaccount must not repeat its parent's fill");
  assert.notEqual(fill("zs"), fill("z2"), "domain area must not repeat the subaccount's fill");
  assert.equal(fill("zs").toLowerCase(), "#ffffff", "level 1 nests as a white area");

  // containment must survive three levels
  const inside3 = (o, i) =>
    i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h;
  assert.ok(inside3(abs.get("z1"), abs.get("zs")));
  assert.ok(inside3(abs.get("zs"), abs.get("z2")));
  assert.ok(inside3(abs.get("z2"), abs.get("c3")));
});

test("network barriers appear only at real cloud / on-premise boundaries", () => {
  const hybrid = {
    ...MODEL,
    zones: [
      { id: "z1", label: "SAP BTP", kind: "sap-btp" },
      { id: "z2", label: "On-Premise", kind: "on-premise" },
    ],
    components: [
      { id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "z1" },
      { id: "c2", label: "Cloud Connector", kind: "integration", zoneId: "z2" },
    ],
    flows: [{ id: "f1", sourceId: "c1", targetId: "c2", protocol: "RFC", mode: "sync" }],
  };
  const withBarrier = generateDrawioXml(hybrid);
  assert.match(withBarrier, /id="network-barrier-0"/);
  assert.match(withBarrier, /strokeWidth=4;strokeColor=#475e75;jumpStyle=gap/);
  assert.match(withBarrier, /Thick grey line — network barrier/);

  // an all-cloud model must not invent a boundary that is not there
  assert.doesNotMatch(generateDrawioXml(NESTED_MODEL), /network-barrier/);

  // the barrier sits in the gutter between the two zones, not through either
  const { abs } = parseCells(withBarrier);
  const a = abs.get("z1"), b = abs.get("z2");
  const bx = +withBarrier.match(/<mxPoint x="(\d+)"[^>]*as="sourcePoint"/)[1];
  assert.ok(bx > a.x + a.w && bx < b.x, `barrier at ${bx} must fall between zones`);
});

test("bidirectional flows get arrowheads at both ends", () => {
  const mutual = {
    ...NESTED_MODEL,
    flows: [{ id: "f1", sourceId: "c1", targetId: "c2", label: "sync", bidirectional: true }],
  };
  const xml = generateDrawioXml(mutual);
  const edge = xml.match(/<mxCell id="f1"[^>]*>/)[0];
  assert.match(edge, /startArrow=blockThin;startFill=1/);
  assert.match(edge, /endArrow=blockThin;endFill=1/);
  assert.doesNotMatch(edge, /startArrow=none/);
});

test("every emitted SAPIcon exists in the official catalog", () => {
  // an unlisted name renders as a blank shape in Draw.io, not an error
  for (const xml of [generateDrawioXml(MODEL), generateDrawioXml(NESTED_MODEL)]) {
    for (const m of xml.matchAll(/SAPIcon=([^;"]+)/g)) {
      assert.ok(SAP_ICON_CATALOG.has(m[1]), `unknown SAPIcon: ${m[1]}`);
    }
  }
  for (const name of Object.values(SAP_ICON_BY_SERVICE)) {
    assert.ok(SAP_ICON_CATALOG.has(name), `mapping points at unknown icon: ${name}`);
  }
});

test("generated diagrams pass the SAP Style Contract checks", () => {
  for (const m of [MODEL, NESTED_MODEL]) {
    const r = validateDrawioXml(generateDrawioXml(m));
    assert.deepEqual(r.issues, [], `contract issues: ${JSON.stringify(r.issues)}`);
    assert.equal(r.ok, true);
  }
});

test("icon labels stay plain text (mxgraph.sap.icon has no html=1)", () => {
  const xml = generateDrawioXml(NESTED_MODEL);
  for (const m of xml.matchAll(/<mxCell[^>]*value="([^"]*)"[^>]*style="([^"]*)"/g)) {
    if (m[2].includes("mxgraph.sap.icon")) {
      assert.doesNotMatch(m[1], /&lt;\/?(b|i|div|font)&gt;/, "icon label contains markup");
    }
  }
});

test("approve still generates when the graph checkpoint is gone (restart / other instance)", async () => {
  const r = await resumeArchitecturePipeline("job-never-checkpointed", MODEL, {
    provider: "mock",
    skipCorpusLoad: true,
  });
  assert.equal(r.status, "completed");
  assert.ok(r.drawioXml?.includes("<mxfile"));
  assert.equal(r.approved.id, MODEL.id);
});
