/**
 * Mirror the SAP icon artwork the generated .drawio files reference.
 *
 * The generator emits `shape=mxgraph.sap.icon;SAPIcon=<name>`, and Draw.io paints that
 * by loading `img/lib/sap/<name>.svg` from its own webapp. The in-app preview has no
 * such library, so it drew a grey placeholder instead. This copies the same artwork
 * into apps/web/public/sap-icons/ where the preview can reference it by URL — one
 * request per icon a diagram actually uses, so nothing lands in the JS bundle.
 *
 *   node scripts/fetch-sap-icons.mjs
 *
 * Re-run to refresh against upstream. Source: jgraph/drawio (Apache-2.0); the icons
 * themselves are SAP marks — check your redistribution rights before shipping.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "apps/web/public/sap-icons");
const BASE = "https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/img/lib/sap";

const catalogSource = await readFile(path.join(root, "packages/drawio/src/icons.ts"), "utf8");
const block = catalogSource.match(/SAP_ICON_CATALOG[\s\S]*?\]\)/);
if (!block) throw new Error("Could not find SAP_ICON_CATALOG in packages/drawio/src/icons.ts");
// names carry hyphens and dots too ("SAP_Integration_Suite_-_Event_Mesh")
const names = [...block[0].matchAll(/"([A-Za-z0-9_.-]+)"/g)].map((m) => m[1]);

await mkdir(OUT, { recursive: true });

let ok = 0;
const missing = [];
// modest concurrency — enough to be quick, not enough to get rate limited
for (let i = 0; i < names.length; i += 8) {
  await Promise.all(
    names.slice(i, i + 8).map(async (name) => {
      const res = await fetch(`${BASE}/${name}.svg`);
      if (!res.ok) {
        missing.push(name);
        return;
      }
      await writeFile(path.join(OUT, `${name}.svg`), await res.text(), "utf8");
      ok++;
    })
  );
}

console.log(`saved ${ok}/${names.length} icons to apps/web/public/sap-icons`);
if (missing.length) console.log(`no artwork upstream for: ${missing.join(", ")}`);
