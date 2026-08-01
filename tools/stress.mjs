#!/usr/bin/env node
/**
 * Adversarial cases the happy path never exercises.
 *
 *   node tools/stress.mjs [outDir]
 *
 * Every case is generated in every diagram style and structurally validated. Pass an
 * output directory to write the documents for rendered QA:
 *
 *   node tools/stress.mjs .cache/stress && node tools/render-qa.mjs .cache/stress
 */
import fs from "node:fs";
import { generateDrawioXml, validateDrawioXml, STYLE_PROFILES } from "@sap-architect/drawio";

const OUT = process.argv[2];
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const base = (over = {}) => ({
  id: "t", title: "Test", level: "L1", summary: "s",
  actors: [], zones: [], components: [], flows: [], assumptions: [],
  createdAt: "2026-08-01T00:00:00.000Z", ...over,
});

const Z = (id, over = {}) => ({ id, label: id, kind: "sap-btp", ...over });
const C = (id, zoneId, over = {}) => ({ id, label: id, kind: "sap-service", zoneId, ...over });
const F = (id, s, t, over = {}) => ({ id, sourceId: s, targetId: t, ...over });

const cases = {
  "empty model": base(),
  "one component, no zone": base({ components: [C("solo", "missing")] }),
  "one zone, no components": base({ zones: [Z("z")] }),
  "component without flows": base({ zones: [Z("z")], components: [C("a", "z")] }),
  "self loop": base({ zones: [Z("z")], components: [C("a", "z")], flows: [F("f", "a", "a")] }),
  "two-node cycle": base({
    zones: [Z("z")], components: [C("a", "z"), C("b", "z")],
    flows: [F("f1", "a", "b"), F("f2", "b", "a")],
  }),
  "long cycle across zones": base({
    zones: [Z("z1"), Z("z2"), Z("z3")],
    components: [C("a", "z1"), C("b", "z2"), C("c", "z3")],
    flows: [F("f1", "a", "b"), F("f2", "b", "c"), F("f3", "c", "a")],
  }),
  "flow to nonexistent node": base({
    zones: [Z("z")], components: [C("a", "z")], flows: [F("f", "a", "ghost")],
  }),
  "duplicate ids": base({
    zones: [Z("z"), Z("z")], components: [C("a", "z"), C("a", "z")],
  }),
  "very long labels": base({
    zones: [Z("z", { label: "A container whose name someone pasted from a ticket title and never shortened" })],
    components: [
      C("a", "z", { label: "An extremely long component name that will not fit on one line at all", subtitle: "and a subtitle that is also unreasonably long for a card" }),
      C("b", "z", { label: "Short" }),
    ],
    flows: [F("f", "a", "b", { label: "a connector label that is far too long to sit on a connector", protocol: "AN-EXTREMELY-LONG-PROTOCOL-NAME" })],
  }),
  "unicode and markup in labels": base({
    zones: [Z("z", { label: "Zone <b>bold</b> & \"quoted\"" })],
    components: [
      C("a", "z", { label: "Ünïcödé — ✓ <script>alert(1)</script>", subtitle: "a & b < c > d" }),
      C("b", "z", { label: "日本語のコンポーネント" }),
    ],
    flows: [F("f", "a", "b", { label: "<img src=x onerror=1>", protocol: "A&B" })],
  }),
  "deep nesting (6 levels)": (() => {
    const zones = [Z("z")];
    const comps = [];
    let parent;
    for (let i = 0; i < 6; i++) {
      const id = `lvl${i}`;
      comps.push(C(id, "z", parent ? { parentId: parent } : {}));
      parent = id;
    }
    return base({ zones, components: comps });
  })(),
  "wide zone (24 components)": base({
    zones: [Z("z")],
    components: Array.from({ length: 24 }, (_, i) => C(`c${i}`, "z")),
    flows: Array.from({ length: 23 }, (_, i) => F(`f${i}`, `c${i}`, `c${i + 1}`)),
  }),
  "disconnected islands": base({
    zones: [Z("z1"), Z("z2")],
    components: [C("a", "z1"), C("b", "z1"), C("c", "z2"), C("d", "z2")],
    flows: [F("f1", "a", "b"), F("f2", "c", "d")],
  }),
  "orphan zone parent": base({
    zones: [Z("z", { parentId: "nope" })], components: [C("a", "z")],
  }),
  "component parent cycle": base({
    zones: [Z("z")],
    components: [C("a", "z", { parentId: "b" }), C("b", "z", { parentId: "a" })],
  }),
  "all actors, no components": base({
    actors: [{ id: "u1", label: "One" }, { id: "u2", label: "Two" }],
  }),
  "boundary zone only": base({
    zones: [Z("z", { boundary: "trust" })], components: [C("a", "z")],
  }),
  "divider pointing at missing zone": base({
    zones: [Z("z")], components: [C("a", "z")],
    dividers: [{ label: "Net", afterZoneId: "nope" }],
  }),
  "real product names (glyph resolution)": base({
    zones: [Z("z")],
    components: [
      C("a", "z", { label: "SAP Integration Suite", kind: "integration" }),
      C("b", "z", { label: "SAP HANA Cloud", kind: "database" }),
      C("c", "z", { label: "SAP Cloud Identity Services", kind: "identity" }),
      C("d", "z", { label: "SAP AI Core", kind: "sap-service" }),
      C("e", "z", { label: "SAP Build Work Zone", kind: "sap-service" }),
      C("f", "z", { label: "Cloud Connector", kind: "integration" }),
    ],
  }),
  "large landscape (60 components)": (() => {
    const zones = Array.from({ length: 6 }, (_, i) => Z(`z${i}`));
    const comps = [];
    const flows = [];
    for (let z = 0; z < 6; z++) for (let i = 0; i < 10; i++) comps.push(C(`z${z}c${i}`, `z${z}`));
    let n = 0;
    for (let z = 0; z < 5; z++)
      for (let i = 0; i < 10; i += 2)
        flows.push(F(`f${n++}`, `z${z}c${i}`, `z${z + 1}c${(i * 3) % 10}`));
    return base({ zones, components: comps, flows });
  })(),
};

let failures = 0;
console.log("case".padEnd(38), "styles".padStart(6), "  worst result");
console.log("-".repeat(92));

for (const [name, model] of Object.entries(cases)) {
  const problems = [];
  for (const style of Object.keys(STYLE_PROFILES)) {
    let xml;
    try {
      xml = generateDrawioXml({ ...model, style });
    } catch (e) {
      problems.push(`${style}: THREW ${e.message}`);
      continue;
    }
    const r = validateDrawioXml(xml);
    if (!r.ok) problems.push(`${style}: ${r.issues.filter((i) => i.level === "error").map((i) => i.code).join(",")}`);
    else if (r.issues.length) problems.push(`${style}: warn ${r.issues.map((i) => i.code).join(",")}`);
    if (OUT && style === "solution") fs.writeFileSync(`${OUT}/${name.replace(/[^\w]+/g, "-")}.drawio`, xml);
  }
  if (problems.length) failures++;
  console.log(
    name.padEnd(38),
    String(Object.keys(STYLE_PROFILES).length).padStart(6),
    "  " + (problems.length ? problems.slice(0, 2).join(" | ").slice(0, 100) : "clean")
  );
}
console.log("\n" + (failures ? `${failures} case(s) with problems` : "all cases clean"));
process.exit(failures ? 1 : 0);
