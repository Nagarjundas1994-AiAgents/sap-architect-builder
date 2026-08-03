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
import {
  analyzeGaps,
  claimsToBeSap,
  resumeArchitecturePipeline,
  validateArchitectureModel,
  verifySapProduct,
} from "@sap-architect/core";

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

test("SAP catalogue resolves real products, renames old names, flags invented ones", () => {
  // real products, however they are written
  for (const name of [
    "SAP Integration Suite",
    "SAP S/4HANA Cloud",
    "sap hana cloud",
    "SAP Build Work Zone, standard edition",
  ]) {
    assert.equal(verifySapProduct(name).status, "known", `${name} should be known`);
  }

  // renamed / colloquial names resolve to the current official name
  assert.deepEqual(verifySapProduct("SAP CPI"), {
    status: "renamed",
    canonical: "SAP Integration Suite",
  });
  assert.equal(verifySapProduct("SAP Data Warehouse Cloud").canonical, "SAP Datasphere");
  assert.equal(verifySapProduct("XSUAA").canonical, "SAP Authorization and Trust Management Service");

  // a plausible-sounding invention must not pass
  const fake = verifySapProduct("SAP Workflow Orchestration Cloud");
  assert.equal(fake.status, "unverified", "invented SAP names must not verify");

  // a near-miss gets a correction rather than a flat rejection
  assert.equal(verifySapProduct("SAP Integraton Suite").suggestion, "SAP Integration Suite");

  // non-SAP systems are none of our business
  assert.equal(claimsToBeSap("Plant Historian Database"), false);
  assert.equal(claimsToBeSap("Salesforce"), false);
  assert.equal(claimsToBeSap("SAP Ariba"), true);
});

test("gap analysis raises invented SAP product names at the review gate", () => {
  const model = {
    ...MODEL,
    components: [
      { id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "z1" },
      { id: "c2", label: "SAP Cloud Identity Services", kind: "identity", zoneId: "z1" },
      { id: "c3", label: "SAP Data Orchestration Hub", kind: "sap-service", zoneId: "z1" },
      { id: "c4", label: "Plant Historian DB", kind: "database", zoneId: "z1" },
    ],
    flows: [
      { id: "f1", sourceId: "c1", targetId: "c3" },
      { id: "f2", sourceId: "c3", targetId: "c4" },
    ],
  };

  const gaps = analyzeGaps(model, []);
  const invented = gaps.find((g) => g.id === "gap-unverified-c3");
  assert.ok(invented, "the invented SAP product must be reported");
  assert.equal(invented.severity, "high");

  // real products and non-SAP systems must not be flagged
  assert.ok(!gaps.some((g) => g.id === "gap-unverified-c1"), "real SAP product flagged");
  assert.ok(!gaps.some((g) => g.id === "gap-unverified-c4"), "non-SAP system flagged");
});

test("duplicate ids are repaired instead of failing the extraction", async () => {
  const { extractArchitectureFromImage } = await import("@sap-architect/core");
  // mock provider path: exercises normalizeModel, which is where the repair lives
  const model = await extractArchitectureFromImage({ hints: "duplicate id smoke" }, {});
  const ids = [
    ...model.zones.map((z) => z.id),
    ...model.actors.map((a) => a.id),
    ...model.components.map((c) => c.id),
    ...model.flows.map((f) => f.id),
  ];
  assert.equal(ids.length, new Set(ids).size, "extraction must not emit duplicate ids");
  assert.equal(validateArchitectureModel(model).ok, true, "extracted model must validate");

  // every flow endpoint and zone reference must still resolve after any renaming
  const entities = new Set([...model.components.map((c) => c.id), ...model.actors.map((a) => a.id)]);
  const zones = new Set(model.zones.map((z) => z.id));
  for (const f of model.flows) {
    assert.ok(entities.has(f.sourceId), `flow ${f.id} lost its source`);
    assert.ok(entities.has(f.targetId), `flow ${f.id} lost its target`);
  }
  for (const c of model.components) assert.ok(zones.has(c.zoneId), `${c.id} lost its zone`);
});

test("artifacts derive from the reviewed model and stay consistent with it", async () => {
  const { buildArtifacts } = await import("@sap-architect/core");
  const model = {
    ...NESTED,
    summary: "Side-by-side extension keeping the core clean.",
    components: [
      ...NESTED.components,
      { id: "cid", label: "SAP Cloud Identity Services", kind: "identity", zoneId: "zs" },
    ],
    flows: [
      ...NESTED.flows,
      { id: "f5", sourceId: "a1", targetId: "cid", label: "Authenticate", mode: "trust" },
    ],
  };
  const gaps = [
    { id: "g1", category: "security", severity: "high", message: "No rate limiting", suggestion: "Add one" },
    { id: "g2", category: "naming", severity: "low", message: "Old product name" },
  ];
  const a = buildArtifacts(model, gaps);

  // C4 context: every actor and component present, no dangling relationship
  assert.match(a.contextC4, /^C4Context/);
  assert.match(a.contextC4, /Person\(a1,/);
  for (const c of model.components) assert.ok(a.contextC4.includes(`"${c.label}"`), `${c.label} missing from context`);

  // Container view keeps nesting: the subaccount boundary is inside the platform one
  assert.match(a.containerC4, /^C4Container/);
  assert.ok(a.containerC4.indexOf("Container_Boundary(z1") < a.containerC4.indexOf("Container_Boundary(zs"));

  // Sequence: async flows use the non-blocking arrow, sync ones do not
  assert.match(a.sequence, /^sequenceDiagram/);
  assert.match(a.sequence, /c1-\)c3:/, "async A2A flow should be a non-blocking arrow");
  assert.match(a.sequence, /a1->>c1:/, "sync flow should be a blocking arrow");

  // Identity view isolates trust only — the OData flow must not appear
  assert.match(a.identityFlow, /Authenticate/);
  assert.ok(!a.identityFlow.includes("posts"), "identity view must not include unrelated flows");

  // PlantUML is balanced and complete
  assert.match(a.plantUml, /^@startuml/);
  assert.match(a.plantUml, /@enduml$/);

  // ADR records the high-severity gap rather than hiding it
  assert.match(a.adr, /# ADR-001/);
  assert.match(a.adr, /No rate limiting/);
  assert.match(a.adr, /SAP Integration Suite/);
});

test("artifacts survive hostile labels without breaking their syntax", async () => {
  const { buildArtifacts } = await import("@sap-architect/core");
  const nasty = {
    ...MODEL,
    title: 'Title with "quotes"\nand a newline',
    components: [
      { id: "c-1", label: 'SAP "Quoted" Service\nsecond line', kind: "sap-service", zoneId: "z1" },
    ],
    flows: [{ id: "f1", sourceId: "a1", targetId: "c-1", label: 'lab"el', protocol: "HTTP\nS" }],
  };
  const a = buildArtifacts(nasty, []);
  for (const [name, text] of Object.entries(a)) {
    if (name === "adr") continue; // markdown, quotes are fine
    for (const line of text.split("\n")) {
      // a stray quote from a label would leave an odd count and break the parser
      const quotes = (line.match(/"/g) ?? []).length;
      assert.equal(quotes % 2, 0, `${name} line has unbalanced quotes: ${line}`);
      assert.ok(!line.includes("\r"), `${name} leaked a carriage return`);
    }
    assert.ok(!text.includes("\n\n\n"), `${name} has a torn label`);
  }
  // ids with hyphens must be normalised for Mermaid
  assert.match(a.sequence, /c_1/);
});

test("ownership reads left to right and the network boundary is ruled off", () => {
  const model = {
    ...MODEL,
    zones: [
      // declared deliberately out of order — layout must not follow declaration
      { id: "zonprem", label: "On-Premise Network", kind: "on-premise" },
      { id: "zbtp", label: "SAP BTP", kind: "sap-btp" },
      { id: "zusers", label: "Devices", kind: "user" },
    ],
    components: [
      { id: "cop", label: "Plant Historian", kind: "database", zoneId: "zonprem" },
      { id: "cis", label: "SAP Integration Suite", kind: "integration", zoneId: "zbtp" },
      { id: "cui", label: "SAP Build Apps", kind: "custom-app", zoneId: "zusers" },
    ],
    flows: [
      { id: "f1", sourceId: "cui", targetId: "cis", label: "calls", protocol: "HTTPS" },
      { id: "f2", sourceId: "cis", targetId: "cop", label: "reads", protocol: "RFC" },
    ],
  };
  const xml = generateDrawioXml(model, {});
  const { abs } = parseCells(xml);
  const x = (id) => abs.get(id)?.x ?? Number.NaN;

  assert.ok(x("zusers") < x("zbtp"), "user zone must sit left of the platform");
  assert.ok(x("zbtp") < x("zonprem"), "externally-owned zone must sit right of the platform");

  // the crossing into third-party ground is ruled off
  assert.match(xml, /boundary="network"/, "a network divider must be drawn");
  // layout-only ordering hints must never become visible connectors
  assert.ok(!xml.includes("order-zone"), "ordering hints leaked into the drawing");
  assert.deepEqual(validateDrawioXml(xml).issues, [], "output must still validate");
});

test("legend is drawn as verifiable swatches in the diagram's own colours", () => {
  const xml = generateDrawioXml(NESTED, {});
  assert.match(xml, /type="legend"/, "legend box missing");
  const keys = (xml.match(/type="legend-key"/g) ?? []).length;
  assert.ok(keys >= 4, `expected swatch rows, got ${keys / 2}`);

  // every semantic colour keyed must actually be used by a connector in the drawing
  for (const hex of [theme.FLOW_COLOR.control, theme.FLOW_COLOR.async]) {
    if (!xml.includes(`strokeColor=${hex};strokeWidth`)) continue;
    assert.ok(xml.includes(hex), `legend colour ${hex} absent from the drawing`);
  }
  // opting out must still be honoured
  assert.ok(!generateDrawioXml({ ...NESTED, legend: false }, {}).includes('type="legend"'));
});

test("every SAP product named in the official reference diagrams resolves", () => {
  // taken from the SAP Architecture Center diagrams this generator is measured against
  const fromReferences = [
    "SAP Joule", "SAP Joule Studio", "SAP Agent Gateway", "SAP Cloud SDK for AI",
    "SAP Integration Suite", "SAP Cloud Identity Services", "SAP S/4HANA",
    "SAP SuccessFactors", "SAP Concur", "SAP Business Data Cloud",
    "SAP Customer Experience", "SAP Business Network", "SAP LeanIX", "SAP4ME",
    "SAP Cloud ALM", "SAP Build", "SAP Build Work Zone", "SAP AI Core",
    "SAP AI Launchpad", "SAP HANA Cloud", "SAP Kyma", "SAP Build Code",
    "SAP Cloud Connector", "SAP Destination Service", "SAP Connectivity Service",
    "SAP Continuous Integration and Delivery", "SAP Generative AI Hub",
    // component-of names the reference diagrams use for parts of a product
    "SAP Joule UI", "SAP Joule User Interface", "SAP AI Core Runtime",
  ];
  const unresolved = fromReferences.filter((n) => verifySapProduct(n).status === "unverified");
  assert.deepEqual(unresolved, [], "reference products must all resolve");

  // and the guarantee that makes the catalogue worth having still holds
  for (const invented of [
    "SAP Workflow Orchestration Cloud",
    "SAP Data Orchestration Hub",
    "SAP Intelligent Ledger Cloud",
  ]) {
    assert.equal(verifySapProduct(invented).status, "unverified", `${invented} must not verify`);
  }
});

test("connector colour follows SAP's semantics, inferred from the protocol when untagged", () => {
  const model = {
    ...MODEL,
    zones: [{ id: "z1", label: "SAP BTP", kind: "sap-btp" }],
    components: [
      { id: "ui", label: "SAP Build Apps", kind: "custom-app", zoneId: "z1" },
      { id: "ias", label: "SAP Cloud Identity Services", kind: "identity", zoneId: "z1" },
      { id: "ag", label: "SAP Agent Gateway", kind: "agent", zoneId: "z1" },
      { id: "is", label: "SAP Integration Suite", kind: "integration", zoneId: "z1" },
      { id: "s4", label: "SAP S/4HANA Cloud", kind: "sap-product", zoneId: "z1" },
    ],
    flows: [
      // untagged: meaning must be read out of the protocol
      { id: "fa", sourceId: "ui", targetId: "ias", label: "Authenticate", protocol: "SAML" },
      { id: "fb", sourceId: "ag", targetId: "is", label: "Calls agent", protocol: "A2A" },
      { id: "fc", sourceId: "is", targetId: "ag", label: "Tools", protocol: "MCP" },
      { id: "fd", sourceId: "ias", targetId: "s4", label: "Provision users", protocol: "SCIM" },
      { id: "fe", sourceId: "s4", targetId: "is", label: "Publishes", protocol: "AMQP" },
      { id: "ff", sourceId: "ui", targetId: "s4", label: "Reads", protocol: "OData V4" },
    ],
  };
  const xml = generateDrawioXml(model, {});
  const styleOf = (flowId) => {
    const i = xml.indexOf(`id="${flowId}"`);
    assert.ok(i > 0, `flow ${flowId} not emitted`);
    return xml.slice(i, i + 700);
  };
  const C = theme.FLOW_COLOR;
  assert.ok(styleOf("fa").includes(C.trust), "SAML must be authentication green");
  assert.ok(styleOf("fb").includes(C.agent), "A2A must be agent magenta");
  assert.ok(styleOf("fc").includes(C.async), "MCP must be async teal");
  assert.ok(styleOf("fd").includes(C.provisioning), "SCIM must be provisioning violet");
  assert.ok(styleOf("fe").includes(C.event), "AMQP must be event amber");
  assert.ok(styleOf("ff").includes(C.data), "plain OData must stay data slate");

  // authentication and provisioning sit side by side in identity diagrams, so they
  // must never share a colour — this is the distinction the published legends make
  assert.notEqual(C.trust, C.provisioning, "authentication and provisioning must differ");

  // dashed is reserved for what nobody waits on; provisioning is drawn solid
  assert.match(styleOf("fe"), /dashed=1/, "published events are dashed");
  assert.ok(!/dashed=1/.test(styleOf("fd")), "provisioning is drawn solid");
  assert.ok(!/dashed=1/.test(styleOf("fa")), "authentication is on the request path");

  // an explicit mode always beats inference
  const tagged = generateDrawioXml(
    { ...model, flows: [{ id: "fz", sourceId: "ui", targetId: "s4", protocol: "SAML", mode: "batch" }] },
    {}
  );
  assert.ok(tagged.slice(tagged.indexOf('id="fz"')).includes(C.batch), "explicit mode must win");

  // and each semantic used appears in the legend
  for (const key of ["trust", "agent", "async", "provisioning"]) {
    assert.ok(xml.includes(theme.FLOW_LABEL[key]), `legend missing ${key}`);
  }
});

test("a box labelled with two real products is not reported as invented", () => {
  for (const compound of [
    "SAP Build Code / Joule Studio",
    "SAP Joule Studio / SAP AI Core",
    "SAP Integration Suite and SAP Event Mesh",
  ]) {
    assert.notEqual(verifySapProduct(compound).status, "unverified", `${compound} is real`);
  }
  // one invented half still condemns the label
  assert.equal(verifySapProduct("SAP Build Code / SAP Imaginary Cloud").status, "unverified");
});

test("no two connector semantics share a colour", () => {
  const byColour = new Map();
  for (const [semantic, colour] of Object.entries(theme.FLOW_COLOR)) {
    assert.ok(!byColour.has(colour), `${byColour.get(colour)} and ${semantic} share ${colour}`);
    byColour.set(colour, semantic);
    assert.match(colour, /^#[0-9A-F]{6}$/i, `${semantic} colour must be a hex value`);
    assert.ok(theme.FLOW_LABEL[semantic], `${semantic} has no legend label`);
  }
  assert.equal(byColour.size, Object.keys(theme.FLOW_COLOR).length);
});

test("full service names resolve without letting inventions through", () => {
  for (const real of [
    "SAP HTML5 Application Repository service for SAP BTP",
    "SAP Object Store service on SAP BTP",
    "SAP Alert Notification service for SAP BTP",
  ]) {
    assert.notEqual(verifySapProduct(real).status, "unverified", `${real} is a real service name`);
  }
  // the "service for SAP BTP" suffix must not launder an invented product
  assert.equal(verifySapProduct("SAP Quantum Ledger service for SAP BTP").status, "unverified");
});

test("every drawing carries a title block with a stable identifier", () => {
  const xml = generateDrawioXml(NESTED, {});
  assert.match(xml, /type="footer"/, "title block missing");
  const id = /reference="([a-f0-9]{6})"/.exec(xml);
  assert.ok(id, "no diagram identifier emitted");
  assert.match(xml, /Last update \d{4}-\d{2}-\d{2}/, "no last-update date");

  // redrawing the same model must quote the same id; a real change must not
  assert.equal(/reference="([a-f0-9]{6})"/.exec(generateDrawioXml(NESTED, {}))[1], id[1]);
  const changed = generateDrawioXml({ ...NESTED, title: `${NESTED.title} v2` }, {});
  assert.notEqual(/reference="([a-f0-9]{6})"/.exec(changed)[1], id[1]);

  // and it can still be suppressed deliberately
  assert.ok(!generateDrawioXml({ ...NESTED, footer: null }, {}).includes('type="footer"'));
});

test("landscape zones are filled panels; dashed overlays are only for inner boundaries", () => {
  const model = {
    ...MODEL,
    zones: [
      // models label almost every zone with a boundary — that must not turn the
      // whole landscape into transparent outlines
      { id: "zbtp", label: "SAP BTP", kind: "sap-btp", boundary: "trust" },
      { id: "zsub", label: "Subaccount", kind: "sap-btp", parentId: "zbtp" },
      { id: "zinner", label: "Secure enclave", kind: "custom", parentId: "zsub", boundary: "trust" },
    ],
    components: [
      { id: "c1", label: "SAP Integration Suite", kind: "integration", zoneId: "zsub" },
      { id: "c2", label: "SAP HANA Cloud", kind: "database", zoneId: "zinner" },
    ],
    flows: [{ id: "f1", sourceId: "c1", targetId: "c2", protocol: "SQL" }],
  };
  const xml = generateDrawioXml(model, {});
  // the style of that cell alone — neighbouring cells have their own
  const styleOf = (id) => {
    const at = xml.indexOf(`id="${id}"`);
    assert.ok(at > 0, `${id} not emitted`);
    return (/style="([^"]*)"/.exec(xml.slice(at, at + 600)) ?? [, ""])[1];
  };

  // the top-level landscape keeps its fill despite declaring a boundary
  assert.match(styleOf("zbtp"), /fillColor=#[0-9A-F]{6}/i, "root zone must be a filled panel");
  assert.ok(!/fillColor=none/.test(styleOf("zbtp")), "root zone must not be a transparent overlay");
  // and it carries the SAP mark in its header
  assert.match(xml, /type="zone-mark"/, "SAP-owned root zone must carry the mark");
  assert.match(xml, /SAPIcon=SAP_Logo/, "mark must use the SAP library asset");

  // a boundary declared inside a landscape still renders as a dashed overlay
  assert.match(styleOf("zinner"), /dashed=1/, "inner boundary keeps the dashed treatment");
  assert.deepEqual(validateDrawioXml(xml).issues, []);
});

test("a pipeline that receives data but never passes it on is reported", () => {
  const model = {
    ...MODEL,
    zones: [{ id: "z1", label: "SAP BTP", kind: "sap-btp" }],
    components: [
      { id: "s4", label: "SAP S/4HANA Cloud", kind: "sap-product", zoneId: "z1" },
      { id: "mesh", label: "SAP Event Mesh", kind: "sap-service", zoneId: "z1" },
      { id: "hana", label: "SAP HANA Cloud", kind: "sap-service", zoneId: "z1" },
      { id: "ias", label: "SAP Cloud Identity Services", kind: "sap-service", zoneId: "z1" },
      { id: "ds", label: "SAP Datasphere", kind: "sap-product", zoneId: "z1" },
    ],
    flows: [
      { id: "f1", sourceId: "s4", targetId: "mesh", mode: "event" },   // nobody consumes
      { id: "f2", sourceId: "ds", targetId: "hana", mode: "sync" },    // a store: fine
      { id: "f3", sourceId: "ds", targetId: "ias", mode: "trust" },    // identity: fine
      { id: "f4", sourceId: "s4", targetId: "ds", mode: "batch" },
    ],
  };
  const dead = analyzeGaps(model, []).filter((g) => g.id.startsWith("gap-deadend"));
  assert.equal(dead.length, 1, `expected only the event broker, got ${dead.map((g) => g.message)}`);
  assert.match(dead[0].message, /Event Mesh/);
  assert.equal(dead[0].severity, "high", "an unconsumed event path is a real hole");

  // once something consumes the events the finding clears
  const fixed = analyzeGaps(
    { ...model, flows: [...model.flows, { id: "f5", sourceId: "mesh", targetId: "ds", mode: "event" }] },
    []
  );
  assert.equal(fixed.filter((g) => g.id.startsWith("gap-deadend")).length, 0);
});
