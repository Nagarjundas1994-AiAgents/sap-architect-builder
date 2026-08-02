/**
 * Platform checks. Run: npm test (after npm run build).
 *
 * These cover the invariants that make a generated diagram usable: containment,
 * design-system compliance, semantic structure, and the pipeline's resume path.
 * Rendered quality (routing, label placement, glyph resolution) is checked
 * separately by tools/render-qa.mjs, which runs Draw.io's own engine.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  SAP_ICON_BY_SERVICE,
  SAP_ICON_CATALOG,
  generateDrawioXml,
  layoutTree,
  layoutLayered,
  resolveSapIcon,
  theme,
  validateDrawioXml,
} from "@sap-architect/drawio";
import { resumeArchitecturePipeline, validateArchitectureModel } from "@sap-architect/core";

const MODEL = {
  id: "m1",
  title: "Test L1",
  level: "L1",
  summary: "smoke",
  actors: [{ id: "a1", label: "User", role: "Requester" }],
  zones: [{ id: "z1", label: "Platform", kind: "sap-btp" }],
  components: [{ id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "z1" }],
  flows: [{ id: "f1", sourceId: "a1", targetId: "c1", label: "uses", protocol: "HTTPS" }],
  assumptions: [],
  createdAt: new Date().toISOString(),
};

const NESTED = {
  ...MODEL,
  zones: [
    { id: "zu", label: "Channels", kind: "user" },
    { id: "z1", label: "Platform", kind: "sap-btp" },
    { id: "zs", label: "Subaccount", kind: "sap-btp", parentId: "z1" },
    { id: "z2", label: "Custom domain", kind: "custom", parentId: "zs" },
    { id: "zx", label: "Systems of record", kind: "sap-cloud" },
  ],
  components: [
    { id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "zs" },
    { id: "c2", label: "SAP HANA Cloud", kind: "database", zoneId: "zs" },
    { id: "c3", label: "Procurement Agent", subtitle: "Custom", kind: "agent", zoneId: "z2" },
    { id: "c4", label: "ERP", kind: "sap-product", zoneId: "zx" },
  ],
  flows: [
    { id: "f1", sourceId: "a1", targetId: "c1", label: "uses", protocol: "HTTPS" },
    { id: "f2", sourceId: "c1", targetId: "c3", label: "calls", protocol: "A2A", mode: "async" },
    { id: "f3", sourceId: "c3", targetId: "c2", label: "reads", mode: "sync" },
    { id: "f4", sourceId: "c1", targetId: "c4", label: "posts", protocol: "OData" },
  ],
};

/** Parse cells and resolve parent transforms into absolute boxes. */
function parseCells(xml) {
  const cells = [];
  const re = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  for (const m of xml.matchAll(re)) {
    const a = m[1];
    const inner = m[2] || "";
    const g = (inner.match(/<mxGeometry\b([^>]*)/) || [, ""])[1];
    const n = (k) => {
      const v = g.match(new RegExp(`\\b${k}="([-0-9.]+)"`));
      return v ? parseFloat(v[1]) : undefined;
    };
    // <object> wrappers carry the id; the inner mxCell does not
    const before = xml.slice(0, m.index);
    const objId = (before.match(/<object\b[^>]*\bid="([^"]+)"[^>]*>\s*$/) || [])[1];
    cells.push({
      id: (a.match(/id="([^"]*)"/) || [])[1] ?? objId,
      style: (a.match(/style="([^"]*)"/) || [, ""])[1],
      parent: (a.match(/parent="([^"]+)"/) || [, "1"])[1],
      edge: /edge="1"/.test(a),
      x: n("x"), y: n("y"), w: n("width"), h: n("height"),
      rel: /relative="1"/.test(g),
    });
  }
  const by = new Map(cells.filter((c) => c.id).map((c) => [c.id, c]));
  const abs = new Map();
  const resolve = (c) => {
    if (!c.id) return undefined;
    if (abs.has(c.id)) return abs.get(c.id);
    if (c.x === undefined || c.rel || c.edge) return undefined;
    const p = by.get(c.parent);
    const o = p && p.x !== undefined && !p.rel && !p.edge ? resolve(p) : undefined;
    const box = { x: c.x + (o?.x ?? 0), y: c.y + (o?.y ?? 0), w: c.w, h: c.h };
    abs.set(c.id, box);
    return box;
  };
  for (const c of cells) resolve(c);
  return { cells, by, abs };
}
const inside = (o, i) =>
  i.x >= o.x - 1 && i.y >= o.y - 1 && i.x + i.w <= o.x + o.w + 1 && i.y + i.h <= o.y + o.h + 1;

// ── Model validation ───────────────────────────────────────────────────────
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
  assert.match(
    validateArchitectureModel({
      ...MODEL,
      components: [{ id: "c1", label: "X", kind: "sap-service", zoneId: "missing" }],
    }).issues.join(";"),
    /zone missing/
  );
  assert.match(
    validateArchitectureModel({ ...MODEL, flows: [{ id: "f", sourceId: "ghost", targetId: "c1" }] })
      .issues.join(";"),
    /bad source/
  );
});

// ── Layout engine ──────────────────────────────────────────────────────────
test("layered layout reduces edge crossings", () => {
  const nodes = ["a1", "a2", "a3", "b1", "b2", "b3"].map((id) => ({ id, w: 160, h: 56 }));
  const edges = [
    { id: "e1", source: "a1", target: "b3" },
    { id: "e2", source: "a2", target: "b2" },
    { id: "e3", source: "a3", target: "b1" },
  ];
  const naive = layoutLayered(nodes, edges, { sweeps: 0 }).crossings;
  const tuned = layoutLayered(nodes, edges).crossings;
  assert.ok(tuned <= naive, `ordering must not make crossings worse (${naive} -> ${tuned})`);
  assert.equal(tuned, 0, "this graph is planar when ordered correctly");
});

test("containment holds at every depth of the tree layout", () => {
  const tree = {
    id: "root",
    header: 0,
    pad: 0,
    children: [
      {
        id: "outer",
        children: [
          { id: "leafA", w: 200, h: 64 },
          { id: "inner", children: [{ id: "leafB", w: 200, h: 64 }] },
        ],
      },
    ],
  };
  const r = layoutTree(tree, [{ id: "e", source: "leafA", target: "leafB" }]);
  assert.ok(inside(r.boxes.get("outer"), r.boxes.get("inner")));
  assert.ok(inside(r.boxes.get("outer"), r.boxes.get("leafA")));
  assert.ok(inside(r.boxes.get("inner"), r.boxes.get("leafB")));
});

// ── Generated documents ────────────────────────────────────────────────────
test("generated XML is well formed and wires every flow", () => {
  const xml = generateDrawioXml(NESTED);
  assert.match(xml, /<mxfile/);
  for (const f of NESTED.flows) {
    assert.match(xml, new RegExp(`source="${f.sourceId}" target="${f.targetId}"`));
  }
  const ids = [...xml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size, "duplicate cell ids");
});

test("every shape is nested inside its container in the emitted document", () => {
  const { by, abs } = parseCells(generateDrawioXml(NESTED));
  assert.ok(inside(abs.get("z1"), abs.get("zs")), "subaccount inside platform");
  assert.ok(inside(abs.get("zs"), abs.get("z2")), "domain inside subaccount");
  assert.ok(inside(abs.get("z2"), abs.get("c3")), "agent inside its domain");
  assert.equal(by.get("c3").parent, "z2", "component is parented to its zone, so they move together");
  assert.equal(by.get("z2").parent, "zs");

  // no two unrelated shapes may overlap
  // root cell "0" and layer "1" reference each other, so the walk needs a stop
  const ancestors = (id) => {
    const out = [];
    let c = by.get(id);
    for (let i = 0; c && c.parent && c.parent !== "0" && i < 12; i++) {
      out.push(c.parent);
      c = by.get(c.parent);
    }
    return out;
  };
  const ids = [...abs.keys()].filter((id) => !["title", "subtitle", "legend"].includes(id));
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = abs.get(ids[i]);
      const b = abs.get(ids[j]);
      if (ancestors(ids[i]).includes(ids[j]) || ancestors(ids[j]).includes(ids[i])) continue;
      const hit =
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
      assert.ok(!hit, `${ids[i]} overlaps ${ids[j]}`);
    }
});

test("document is editable: named layers and semantic metadata", () => {
  const xml = generateDrawioXml(NESTED);
  for (const name of ["Architecture", "Boundaries", "Connections", "Annotations"]) {
    assert.match(xml, new RegExp(`value="${name}" parent="0"`), `missing layer ${name}`);
  }
  assert.match(xml, /<object label="[^"]*" type="zone"/);
  assert.match(xml, /<object label="[^"]*" type="component"[^>]*role="/);
  assert.match(xml, /<object label="[^"]*" type="flow"[^>]*semantic="/);
});

test("nested areas alternate fill so stacked levels stay legible", () => {
  const { by } = parseCells(generateDrawioXml(NESTED));
  const fill = (id) => (by.get(id).style.match(/fillColor=([^;]+)/) || [])[1];
  assert.notEqual(fill("z1"), fill("zs"));
  assert.notEqual(fill("zs"), fill("z2"));
  assert.equal(fill("zs").toLowerCase(), theme.INK.surface.toLowerCase());
});

test("trust boundaries render as dashed enclosures on their own layer", () => {
  const withBoundary = {
    ...NESTED,
    zones: NESTED.zones.map((z) => (z.id === "z2" ? { ...z, boundary: "trust" } : z)),
  };
  const xml = generateDrawioXml(withBoundary);
  assert.match(xml, /type="boundary:trust"/);
  assert.match(xml, /dashed=1;dashPattern/);
  assert.match(xml, /parent="layer-boundaries"/);
});

test("generated diagrams pass the design-system checks", () => {
  for (const m of [MODEL, NESTED]) {
    const r = validateDrawioXml(generateDrawioXml(m));
    assert.deepEqual(r.issues, [], `issues: ${JSON.stringify(r.issues)}`);
    assert.equal(r.ok, true);
  }
});

test("bidirectional flows get arrowheads at both ends", () => {
  const xml = generateDrawioXml({
    ...MODEL,
    flows: [{ id: "f1", sourceId: "a1", targetId: "c1", label: "sync", bidirectional: true }],
  });
  const edge = xml.match(/<mxCell style="[^"]*edgeStyle[^"]*"[^>]*>/)[0];
  assert.match(edge, /startArrow=blockThin;startFill=1/);
  assert.match(edge, /endArrow=blockThin;endFill=1/);
});

// ── Vendor glyphs ──────────────────────────────────────────────────────────
test("every emitted glyph name exists in the official catalog", () => {
  for (const xml of [generateDrawioXml(MODEL), generateDrawioXml(NESTED)])
    for (const m of xml.matchAll(/SAPIcon=([^;"]+)/g))
      assert.ok(SAP_ICON_CATALOG.has(m[1]), `unknown glyph: ${m[1]}`);
  for (const name of Object.values(SAP_ICON_BY_SERVICE))
    assert.ok(SAP_ICON_CATALOG.has(name), `mapping points at unknown glyph: ${name}`);
});

test("glyph lookup ignores ambiguous short tokens", () => {
  assert.equal(resolveSapIcon(undefined, "SAP"), undefined);
  assert.equal(resolveSapIcon(undefined, "AI"), undefined);
  assert.equal(resolveSapIcon(undefined, "SAP Integration Suite"), "SAP_Integration_Suite");
});

// ── Robustness ─────────────────────────────────────────────────────────────
test("a broken model still draws everything it contains", () => {
  // Silently omitting a component is worse than drawing it awkwardly: the reader
  // has no way to know something is missing.
  const broken = {
    ...MODEL,
    zones: [
      { id: "z", label: "Zone", kind: "sap-btp", parentId: "does-not-exist" },
      { id: "zc1", label: "Cycle A", kind: "custom", parentId: "zc2" },
      { id: "zc2", label: "Cycle B", kind: "custom", parentId: "zc1" },
    ],
    components: [
      { id: "dup", label: "First", kind: "sap-service", zoneId: "z" },
      { id: "dup", label: "Second", kind: "sap-service", zoneId: "z" },
      { id: "orphan", label: "Homeless", kind: "sap-service", zoneId: "no-such-zone" },
      { id: "pa", label: "Parent cycle A", kind: "sap-service", zoneId: "z", parentId: "pb" },
      { id: "pb", label: "Parent cycle B", kind: "sap-service", zoneId: "z", parentId: "pa" },
      { id: "ghost", label: "Missing parent", kind: "sap-service", zoneId: "z", parentId: "nope" },
    ],
    flows: [{ id: "f", sourceId: "dup", targetId: "orphan" }],
  };
  const xml = generateDrawioXml(broken);

  for (const label of ["First", "Second", "Homeless", "Parent cycle A", "Parent cycle B", "Missing parent", "Zone"])
    assert.ok(xml.includes(label), `${label} was dropped from the diagram`);
  assert.match(xml, /Unassigned/, "homeless components need a visible holding area");

  const ids = [...xml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size, "duplicate cell ids");
  assert.deepEqual(validateDrawioXml(xml).issues, []);
});

test("cards grow to fit long names instead of overflowing", () => {
  const long = "An extremely long component name that will not fit on one line at all";
  const xml = generateDrawioXml({
    ...MODEL,
    components: [
      { id: "c1", label: long, subtitle: "and a subtitle that is also unreasonably long for a card", kind: "sap-service", zoneId: "z1" },
      { id: "c2", label: "Short", kind: "sap-service", zoneId: "z1" },
    ],
    flows: [],
  });
  const { abs } = parseCells(xml);
  const big = abs.get("c1");
  const small = abs.get("c2");
  assert.ok(big.w > small.w, `long name should widen the card (${big.w} vs ${small.w})`);
  assert.ok(big.h > small.h, `wrapped text should heighten the card (${big.h} vs ${small.h})`);
  // but not without bound, or one label distorts the whole canvas
  assert.ok(big.w <= 320, `card width must stay bounded, got ${big.w}`);
});

test("connector labels are bounded so they cannot swamp the canvas", () => {
  const xml = generateDrawioXml({
    ...MODEL,
    flows: [{
      id: "f1", sourceId: "a1", targetId: "c1",
      label: "a connector label that is far too long to sit on any connector",
      protocol: "AN-EXTREMELY-LONG-PROTOCOL-NAME",
    }],
  });
  for (const m of xml.matchAll(/<object label="([^"]*)"[^>]*type="flow"/g))
    assert.ok(m[1].length <= 30, `edge label not clamped: ${m[1]}`);
  // the full text is preserved on the cell for anyone who inspects it
  assert.match(xml, /description="a connector label that is far too long/);
});

test("output is deterministic", () => {
  assert.equal(generateDrawioXml(NESTED), generateDrawioXml(NESTED));
});

// ── Pipeline ───────────────────────────────────────────────────────────────
test("approve still generates when the graph checkpoint is gone (restart / other instance)", async () => {
  const r = await resumeArchitecturePipeline("job-never-checkpointed", MODEL, {
    provider: "mock",
    skipCorpusLoad: true,
  });
  assert.equal(r.status, "completed");
  assert.ok(r.drawioXml?.includes("<mxfile"));
  assert.equal(r.approved.id, MODEL.id);
});

test("a long flow chain wraps instead of drawing an unreadable ribbon", () => {
  // Longest-path layering puts one column per hop, so a sequential architecture
  // used to come out as a band several thousand px wide and one card tall.
  const chain = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
  const model = {
    ...MODEL,
    title: "Long chain",
    actors: [],
    zones: [{ id: "z1", label: "Platform", kind: "sap-btp" }],
    components: chain.map((id) => ({
      id,
      label: `Service ${id.toUpperCase()}`,
      kind: "sap-service",
      zoneId: "z1",
    })),
    flows: chain.slice(0, -1).map((s, i) => ({ id: `f${i}`, sourceId: s, targetId: chain[i + 1] })),
  };

  const extent = (xml) => {
    // top-level cells are page-absolute; children are relative to their parent
    const boxes = [...xml.matchAll(/<mxGeometry x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
    let w = 0;
    let h = 0;
    for (const b of boxes) {
      w = Math.max(w, +b[1] + +b[3]);
      h = Math.max(h, +b[2] + +b[4]);
    }
    return w / h;
  };

  const wide = extent(generateDrawioXml(model, { targetRatio: 0 }));
  const wrapped = extent(generateDrawioXml(model, {}));

  assert.ok(wide > 5, `unwrapped chain should be a ribbon, got ${wide.toFixed(2)}`);
  assert.ok(wrapped < wide / 2, `wrapping should roughly halve the ratio: ${wrapped.toFixed(2)} vs ${wide.toFixed(2)}`);
  assert.deepEqual(validateDrawioXml(generateDrawioXml(model, {})).issues, [], "wrapped output must still validate");
});
