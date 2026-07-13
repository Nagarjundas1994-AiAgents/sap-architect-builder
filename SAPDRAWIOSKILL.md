---
name: create-sap-drawio-architecture
description: Create, revise, review, and validate editable SAP-grade architecture diagrams in Draw.io (.drawio) using official SAP BTP Solution Diagram libraries, SAP Horizon visual conventions, correct SAP product and service names, nested landscape boundaries, semantic connectors, legends, and architecture-level detail. Use for SAP BTP, Joule, SAP Business Suite, SAP Integration Suite, SAP HANA Cloud, SAP Cloud Identity Services, hybrid, hyperscaler, agentic AI, integration, data, security, and clean-core solution architecture diagrams; for converting architecture descriptions or sketches into Draw.io; or for assessing whether an SAP diagram follows official SAP Architecture Center conventions.
---

# Create SAP Draw.io Architecture Diagrams

## Objective

Create an editable `.drawio` artifact that communicates a technically defensible SAP solution architecture with the visual quality of SAP Architecture Center diagrams — specifically matching the style of the published reference architectures (benchmark: RA0029 "Agentic AI & AI Agents", `https://architecture.learning.sap.com/docs/ref-arch/98efa0`).

Treat visual polish as the final layer. First establish architectural truth, scope, boundaries, ownership, interfaces, trust, and flow semantics. Never use an attractive diagram to conceal an unresolved architecture decision.

## Non-negotiable rules

1. Use official SAP BTP Solution Diagram icons and shapes when they exist.
2. Use the grey-background service-icon treatment exactly as the native Draw.io SAP shape set renders it (see the Style Contract).
3. Preserve official icon proportions, colors, padding, and background treatment.
4. Use exact, current SAP product and service names verified from an authoritative SAP source.
5. Distinguish SAP, non-SAP, custom-built, user/device, network, and external-party elements visually.
6. Make every important connector's meaning explicit through direction, line style, label, color, or a legend.
7. Keep the output editable. Do not flatten the architecture into a PNG or one giant SVG.
8. Avoid invented SAP icons, logos, service capabilities, protocols, or deployment relationships.
9. Do not imply certification, endorsement, availability, or support merely because a component appears in the diagram.
10. Deliver the `.drawio` source and validate it before claiming completion.

## Authoritative resources

Prefer these sources in this order:

1. SAP BTP Solution Diagram guideline: `https://sap.github.io/btp-solution-diagrams/`
2. Official libraries and editable presets: `https://github.com/SAP/btp-solution-diagrams`
3. SAP Architecture Center examples and downloadable `.drawio` sources: `https://architecture.learning.sap.com/` (every reference architecture page offers its `.drawio` for download — when matching a specific reference, download and inherit its styles rather than approximating them)
4. SAP Discovery Center for BTP service identity and scope: `https://discovery-center.cloud.sap/`
5. SAP Help Portal for product behavior and supported integration: `https://help.sap.com/`
6. Official product documentation for partner or hyperscaler components.

Use an Architecture Center diagram as a composition reference, not as authority for every product capability. Verify architecture facts independently.

---

## THE STYLE CONTRACT — verified from the RA0029 `.drawio` source

The following values were extracted from the actual XML of the SAP Architecture Center "Agentic AI & AI Agents" diagram. **Use these exact style strings.** Do not approximate, restyle, or "improve" them — matching the Architecture Center look means using its literal style grammar.

A local copy of the reference source ships with this skill at `reference/ra0029-agentic-ai.drawio` (relative to this SKILL.md). When in doubt about any style, geometry, or icon treatment, open that file and inherit the literal style string from the closest matching cell instead of guessing.

### Global document settings

- `<mxGraphModel grid="1" gridSize="2" ... page="1">` — fine 2px grid.
- One `<diagram>` page per deliverable view. Name pages descriptively (`L1 Overview`, `Legend`). Do not ship working copies ("Copy of Page-1") — the published reference contains one and it is a defect, not a convention.
- Stroke width everywhere: **1.5** (only network barriers differ: 4).
- Corner rounding for areas and cards: **`arcSize=24;absoluteArcSize=1`** (absolute 24, NOT percentage, NOT 16).
- Interface pills: **`arcSize=50`**.
- Fonts: **Helvetica** for nearly everything; **Arial** appears only in title-band and a few SAP-blue cards. Practical rule: `fontFamily=Helvetica` everywhere; Arial acceptable for the diagram title.
- `fontColor=default` and `labelBackgroundColor=default` are used so light/dark canvas both render — keep them.

### Typography (verified sizes)

| Text role | Size | Weight | How it is applied |
|---|---:|---|---|
| Diagram title | 18–19 | bold | Text cell or title area, Arial or Helvetica |
| Zone/area title | 16 | bold | Embedded in the area cell: `align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;fontSize=16;fontStyle=1` — or a small floating label cell (~45×23) anchored at the area's top-left edge for outer zones |
| Sub-area title | 14 | bold | Inline HTML in the label: `<font style="font-size: 14px;">Custom Agents</font>` |
| Component title | 12 | bold | Cell default fontSize=12 with `<b>Name</b>` |
| Component subtitle | 12 | italic | Second line: `<b>Joule</b><div><i>Agent Builder</i></div>` |
| Edge label | 11–12 | regular | On the edge cell itself |
| Semantic edge tag (TRUST etc.) | tiny (`size="1"`) | bold, colored | `<font color="#188918" size="1"><b>TRUST</b></font>` |

### Area (zone) styles — copy literally

SAP / SAP BTP area (blue):

```text
rounded=1;whiteSpace=wrap;html=1;strokeColor=#0070F2;fillColor=#EBF8FF;arcSize=24;absoluteArcSize=1;strokeWidth=1.5;fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;fontSize=16;fontStyle=1;fontColor=default;
```

Non-SAP / neutral area (grey):

```text
rounded=1;whiteSpace=wrap;html=1;strokeColor=#475E75;fillColor=#F5F6F7;arcSize=24;absoluteArcSize=1;strokeWidth=1.5;fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;fontSize=16;fontStyle=1;fontColor=default;
```

Nested area inside a filled area (alternate to white for contrast):

```text
rounded=1;whiteSpace=wrap;html=1;strokeColor=#475E75;strokeWidth=1.5;arcSize=24;absoluteArcSize=1;fillColor=#ffffff;fontFamily=Helvetica;align=left;verticalAlign=top;spacingLeft=10;spacingTop=1;fontSize=16;fontStyle=1;fontColor=default;
```

Accent domain area (example: indigo, used in RA0029 for the custom-agents domain):

```text
rounded=1;whiteSpace=wrap;html=1;strokeColor=#5d36ff;fillColor=#f1ecff;strokeWidth=1.5;arcSize=24;absoluteArcSize=1;fontSize=12;fontFamily=Helvetica;fontColor=default;align=center;fontStyle=1;verticalAlign=middle;container=0;recursiveResize=0;collapsible=0;
```

Alternation rule: filled zone → white nested area → filled sub-area. Never stack two identically filled levels.

### Component card — copy literally

White card with the owning domain's stroke color (swap `#5d36ff` for `#0070F2`, `#07838f`, `#cc00dc`, or `#475E75` per domain):

```text
rounded=1;whiteSpace=wrap;html=1;strokeColor=#5d36ff;strokeWidth=1.5;fillColor=#FFFFFF;align=center;verticalAlign=middle;fontSize=12;fontFamily=Helvetica;fontColor=default;arcSize=24;absoluteArcSize=1;fontStyle=1;container=0;recursiveResize=0;collapsible=0;
```

Label pattern: `<b>A2A Router</b><div><i>A2A Client</i></div>` — bold product/function name, italic implementation subtitle.

### SAP service icons — use the native Draw.io SAP shape set

Draw.io ships the official SAP icon set as `shape=mxgraph.sap.icon` with a `SAPIcon=` parameter. This is what the Architecture Center uses — the grey-background treatment is built into the shape. Copy literally and change only the `SAPIcon` name and label:

```text
shape=mxgraph.sap.icon;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;strokeWidth=1;strokeColor=#D5DADD;fillColor=#EDEFF0;gradientColor=#FCFCFC;gradientDirection=west;aspect=fixed;SAPIcon=SAP_Cloud_Identity_Service;fontFamily=Helvetica;fontSize=12;fontColor=default;
```

- **Icon labels are PLAIN TEXT — never HTML.** The `mxgraph.sap.icon` style has no `html=1`, so `<b>`, `<div>`, `<i>` tags render as literal text on the canvas. Write the label as plain text with `&#10;` (XML) / `\n` line breaks for wrapping, and add `fontStyle=1` to the style for bold — exactly as RA0029 does (`value="SAP Cloud&#xa;Identity Services"` + `fontStyle=1`). This differs from component cards, whose styles include `html=1` and use `<b>`/`<i>` markup.
- Standard icon geometry: **64×64** (`imageWidth=64` where image-based).
- The `SAPIcon` value must be an existing entry in the Draw.io SAP set. **A verified catalog of all 114 valid names ships with this skill at `reference/sapicon-catalog.md`** (extracted from the official Draw.io source), including a service→icon mapping table for the common BTP services (IAS, XSUAA, Destination, Connectivity, Cloud Connector, HANA Cloud, AI Core, AI Launchpad, Integration Suite and its capabilities, Event Mesh, Work Zone, HTML5 App Repository, CAP, Joule, Document Information Extraction, Task Center, Job Scheduling, SAC, Datasphere, …). Use only names from that catalog; never invent a name. Watch for official-set quirks: `SAP_Integration_Suite_-_API_Managment` (typo is in the set), `Cloud_Connector2`, names containing commas like `SAP_BTP,_Cloud_Foundry_runtime` (safe — the style string is semicolon-delimited).
- **Icon coverage rule: every SAP BTP service on the canvas gets its official icon** (64×64, label below) when the catalog has one. SaaS products (SAP S/4HANA Cloud, SAP Ariba, SAP SuccessFactors, SAP Business Network, …) have no icon in the set and are drawn as white product cards with blue stroke — exactly as the Architecture Center references do. Custom-built components (CAP services, agents, UI5 apps) stay white cards with domain-colored strokes.
- Label goes below the icon (`verticalLabelPosition=bottom`).
- SAP product logos (e.g. the SAP logo mark) come from Draw.io's built-in `img/lib/sap/SAP_Logo.svg`; brand-name shapes for products like SAP S/4HANA come from the official libraries.
- When an icon must be embedded (custom library asset), use a `data:` URI image cell. **Reject external `image=http(s)://` URLs** — the published RA0029 file itself contains one Cloudinary URL and that is a defect to avoid, not a pattern to copy.

### Actors

Users/personas in RA0029 are drawn with `shape=mxgraph.basic.oval_callout` head shapes (`fillColor=#FFCC99`) grouped with a label. Alternatively use the official generic actor from the BTP libraries. Either way: icon + visible text label, grouped so they move together.

### Interface pills — copy literally

Compact protocol pills placed ON the connector path (not floating nearby). Teal and pink are the two accent channels RA0029 uses (e.g. A2A teal, MCP pink):

```text
rounded=1;whiteSpace=wrap;html=1;arcSize=50;strokeColor=#07838f;fillColor=#dafdf5;strokeWidth=1.5;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=12;fontColor=default;
```

```text
rounded=1;whiteSpace=wrap;html=1;arcSize=50;strokeColor=#CC00DC;fillColor=#fff0fa;strokeWidth=1.5;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=12;fontColor=default;
```

Neutral grey pill (rotate for vertical paths): add `rotation=-90` and use `strokeColor=#475E75;fillColor=#f5f6f7`.

Match pill color to the connector color of the same protocol path — the pill and its line form one visual channel.

### Connectors — copy literally

Base orthogonal edge (neutral data/control flow, grey):

```text
edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#475E75;strokeWidth=1.5;endArrow=blockThin;endFill=1;startArrow=none;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=11;fontColor=default;labelBackgroundColor=default;
```

Semantic recolors of the same style:

| Meaning | strokeColor | Edge tag label |
|---|---|---|
| Ordinary data/control flow | `#475E75` | plain text, 11 pt |
| Trust / authentication | `#188918` | `<font color="#188918" size="1"><b>TRUST</b></font>` or `<b>Authenticate</b>` |
| Authorization | `#5d36ff` | indigo tag |
| Accent path A (e.g. A2A) | `#07838f` | teal pill on path |
| Accent path B (e.g. MCP) | `#cc00dc` | pink pill on path |

- Arrowheads: **`endArrow=blockThin;endFill=1`**. Bidirectional (genuinely mutual flow or trust only): add `startArrow=blockThin;startFill=1`. RA0029 uses 35 single-direction and 12 bidirectional edges — bidirectional is the exception, never the default.
- RA0029 encodes asynchrony and channel semantics with **color + pills + tags, not dashes** (the file contains zero dashed edges). Dashed (`dashed=1`) remains valid per the BTP guideline for async/indirect flow — if you use it, put it in the legend. When the goal is "look exactly like the Architecture Center reference", prefer solid colored channels with pills.
- Network barrier (firewall / trust boundary crossing):

```text
edgeStyle=none;orthogonalLoop=1;jettySize=auto;html=1;rounded=0;endArrow=none;endFill=0;strokeWidth=4;strokeColor=#475e75;jumpStyle=gap;fontFamily=Helvetica;fontSize=12;fontColor=default;
```

A thick grey line with `jumpStyle=gap` so ordinary connectors visibly "jump" it. Label it (`Network`) in grey `#475E75`.

### Core color palette (Horizon, verified in use)

| Purpose | Stroke/text | Fill |
|---|---:|---:|
| SAP / SAP BTP area | `#0070F2` | `#EBF8FF` |
| Non-SAP area, neutral flow | `#475E75` | `#F5F6F7` |
| Main title text | `#1D2D3E` | — |
| Supporting text | `#556B82` | — |
| Trust / authentication (green) | `#188918` | `#F5FAE5` |
| Indigo accent (domain/authz) | `#5D36FF` | `#F1ECFF` |
| Teal accent (channel A) | `#07838F` | `#DAFDF5` |
| Pink accent (channel B) | `#CC00DC` | `#FFF0FA` |
| Critical | `#C35500` | `#FFF8D6` |
| Negative | `#D20A0A` | `#FFEAF4` |
| Icon chrome (SAP shape set) | `#D5DADD` | `#EDEFF0` → gradient `#FCFCFC` |

Use blue for SAP areas and neutral grey for non-SAP areas. Dedicate each accent to ONE meaning per diagram and keep that mapping in the legend. Never color boxes differently merely for variety.

### Skeleton template

Start generated documents from this shell and add cells using the contract styles above:

```xml
<mxfile host="app.diagrams.net" version="28.1.2" pages="1">
  <diagram name="L1 Overview" id="l1-overview">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="2" guides="1" tooltips="1"
        connect="1" arrows="1" fold="1" page="1" pageScale="1"
        pageWidth="1600" pageHeight="1000" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- title, zones, components, edges, legend go here -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## Load the official Draw.io assets

Use **More Shapes > SAP** for the native collection (`mxgraph.sap.icon` set — the Architecture Center's primary source), or import current XML libraries from the official repository when the native set lacks a service. The practical minimum is:

- the native SAP icon shape set (enable it; verify `SAPIcon` names exist);
- the all-services `M` library for SAP BTP services;
- the AI `M` library for AI concepts and services;
- the generic `M` library for actors, APIs, tools, databases, and non-SAP concepts;
- the brand-name library for SAP product marks such as SAP S/4HANA;
- the area, connector, annotation, interface, and text libraries for complete documents.

Do not copy icons from screenshots or recreate them from memory. Match the library entry's exact title and verify that it represents the intended service or concept.

Official `.xml` libraries use this form:

```xml
<mxlibrary>[{"title":"...","xml":"..."},{"title":"...","data":"..."}]</mxlibrary>
```

When extracting assets programmatically:

1. Read as UTF-8 and isolate the `<mxlibrary>` JSON payload.
2. Remove XML comments from the payload before JSON parsing; do not remove arbitrary text that merely resembles a comment.
3. For an `xml` entry, HTML-unescape the value, parse its `<mxGraphModel>`, and reuse the official image cell/style and geometry.
4. For a `data` entry, reuse the exact data URI in an editable Draw.io image cell.
5. Add the icon as a child of its labeled component, with a stable unique ID such as `sapicon-<component-id>` and local geometry.
6. Add a tooltip naming the official library entry and source.
7. Preserve aspect ratio and the required grey-background treatment.
8. Embed the asset for offline rendering; reject `image=http://` and `image=https://` styles.

Make updates idempotent: reuse or replace the existing icon cell for a component. Never append another `sapicon-*` cell on every run.

## Choose the intended level before drawing

Declare the audience and level in working notes.

### Level 0 — executive overview

Show the business scenario, major SAP/non-SAP domains, essential actors, and a few simplified flows. Avoid runtime internals, protocol clutter, and a dense legend.

### Level 1 — solution architecture

Show major products, BTP services, deployment zones, security boundaries, principal integrations, and important data or trust flows. Use this as the default for an Architecture Center-style reference diagram. RA0029 is an L1 with selective L2 detail (subaccount nesting, protocol pills).

### Level 2 — technical architecture

Show subaccounts, environments, runtimes, application modules, destinations, identity services, interface types, protocol labels, integration mediation, network barriers, and operational dependencies. Keep implementation details that affect design decisions; omit code-level noise.

Do not silently mix levels. If one portion requires L2 detail inside an L1 diagram, use a clearly labeled inset or a second page.

## Gather the architecture specification

Before drawing, capture or infer the following. Mark every inference.

- Purpose and title.
- Intended audience and L0/L1/L2 level.
- Primary business actors and system actors.
- SAP products and BTP services.
- Custom applications, extensions, agents, APIs, and data stores.
- Non-SAP platforms and partner services.
- Landscape and ownership boundaries.
- BTP global account, directory, subaccount, space, namespace, cluster, or tenant boundaries when relevant.
- Cloud, on-premise, edge, user, and partner zones.
- Trust domains and identity providers.
- Synchronous, asynchronous, event, batch, administrative, and optional flows.
- Protocols and interfaces such as HTTPS, OData, REST, RFC, IDoc, SOAP, SFTP, JDBC, A2A, MCP, or events.
- Data sensitivity, residency, network, and security constraints.
- High availability, failover, monitoring, logging, and audit needs when in scope.
- Assumptions, exclusions, and unresolved decisions.

If exact components are unknown, use a generic neutral component with a precise functional label. Do not guess a specific SAP service.

## Build a semantic model first

Represent the planned diagram as structured data before placing shapes. Include title, level, zones, components, parent zone, type, exact label, icon entry, flows, direction, mode, interface, purpose, and assumptions. Require stable unique IDs and valid flow endpoints. Use this model to generate or review the Draw.io graph and keep repeated updates deterministic.

## Plan the visual story

Write one sentence that the diagram must make obvious. Examples:

- “Users access a clean-core extension on SAP BTP, which mediates all S/4HANA integration through governed APIs.”
- “Joule delegates work to custom agents through A2A while MCP exposes governed tools through SAP Integration Suite.”

Arrange the composition so a reader understands that sentence in five seconds.

Use a dominant left-to-right flow unless the subject naturally requires top-to-bottom. Place:

- actors and channels at the entry side;
- orchestration and application logic near the center;
- systems of record and data platforms downstream;
- cross-cutting identity, security, integration, and observability where their relationships remain legible (RA0029 places SAP Cloud Identity Services at the boundary with green TRUST/Authenticate edges fanning out);
- external or partner systems in neutral zones;
- network barriers at actual trust or connectivity boundaries.

Avoid decorative symmetry that misrepresents dependencies.

## Reproduce the Architecture Center composition pattern

For diagrams like RA0029:

- Title at the upper-left.
- User and system-trigger entry points on the left, drawn as actor groups.
- The copilot/orchestrator (e.g. Joule) inside its own SAP area near the entry.
- Custom agents and gateways nested truthfully: BTP zone → Subaccount area → domain area (accent color) → white component cards.
- SAP cloud solutions grouped in an SAP-blue area; hyperscalers/partners in grey non-SAP areas.
- Protocol pills (`A2A`, `MCP`, `OData`, `REST`) sitting on their colored connector channels.
- Trust and authentication as green edges with tiny bold green tags.
- Network barriers as thick grey `jumpStyle=gap` lines where flows cross trust/network boundaries.
- A compact `Legend` box listing only the symbols actually used.

Copy the grammar, not the exact topology. Adapt containment and flows to the requested solution.

## Use a legend when semantics are not self-evident

Add a compact legend for L1/L2 diagrams that use multiple line styles, colors, abbreviations, or special boundaries. Include only symbols actually used. Example entries:

- grey solid arrow — data/control flow (blockThin head);
- green — trust / authentication;
- indigo — authorization;
- teal — A2A channel; pink — MCP channel;
- thick grey line — network barrier;
- `MCP` — Model Context Protocol; `A2A` — agent-to-agent protocol.

Do not use the legend to compensate for vague architecture.

## Create the Draw.io document

Prefer adapting the current official starter kit, a downloaded Architecture Center `.drawio`, or a closely related editable preset. This preserves styles and official embedded assets. Otherwise generate from the skeleton template above using only Style Contract styles.

When generating XML programmatically:

1. Create a valid `<mxfile>` with one or more named `<diagram>` pages.
2. Create a root cell and default layer.
3. Assign every vertex and edge a unique stable ID.
4. Add parent containers before child components.
5. Set child `parent` IDs to preserve true grouping and movement.
6. Use `vertex="1"` for shapes and `edge="1"` for connectors.
7. Attach each edge to valid `source` and `target` IDs.
8. Store geometry in `<mxGeometry>` with `as="geometry"`.
9. Use relative edge geometry and explicit waypoints only where needed.
10. Preserve official library shape data exactly when reusing SAP icons.
11. Keep page names descriptive; never ship `Copy of …` working pages.
12. Use a UTF-8 XML declaration and preserve characters such as `·`, `—`, and `&` correctly.
13. Avoid external image URLs that may expire or require authentication.

### XML encoding and update safety

- With an XML API, set a cell `value` to literal label HTML such as `<b>Title</b><br>Detail`; let the serializer escape it exactly once.
- Never pre-escape label HTML before passing it to an XML serializer. Reject `&amp;lt;`, `&amp;gt;`, and repeated `&amp;amp;` sequences in serialized output.
- With raw string editing, escape XML attribute content exactly once and immediately parse the result to verify it.
- XML comments cannot contain `--`. Prefer removing generator comments from deliverables; otherwise use short comments without repeated hyphens.
- Parse styles as semicolon-delimited key/value pairs, update an ordered map, and serialize each key once. Reject duplicate keys such as `align`, `verticalAlign`, `spacingLeft`, `image`, or `strokeColor`.
- Parse and reserialize the complete document after programmatic edits to catch malformed entities and normalize encoding.
- Treat a Draw.io `#R` URL fragment as a browser preview only. The canonical deliverable is a descriptively named `.drawio` file.

## Layout algorithm for generated diagrams

Use this deterministic sequence:

1. Measure the title and reserve header space.
2. Place top-level zones on a coarse grid in flow order.
3. Size each zone from its children plus fixed padding; do not squeeze children afterward.
4. Place nested areas from outermost to innermost, alternating fills per the contract.
5. Place components in aligned rows or columns according to the dominant flow.
6. Align repeated components and equalize their dimensions (identical card sizes for peers; 64×64 icons).
7. Route primary connectors first, secondary flows second, cross-cutting trust/identity flows last.
8. Place protocol pills centered on their path segments; move labels away from intersections.
9. Add annotations and legend.
10. Expand the canvas where needed; never solve crowding by shrinking everything.

Use a consistent base spacing unit (RA0029 spacing reads as ~20px rhythm on a 2px grid; the official rule of thumb is roughly one SAP-logo height of clearance around objects). Prefer multiples of the unit for positions, padding, and gaps.

## Architecture review gates

### Gate 1 — semantic correctness

Verify:

- every component exists and has a current official name;
- deployment containment is truthful (no SaaS product inside a subaccount unless it deploys there);
- every connector represents a real dependency or flow;
- direction and protocol are correct;
- security and trust claims are supportable;
- SAP and non-SAP responsibility is clear;
- assumptions are documented outside or within the diagram as appropriate.

### Gate 2 — visual correctness (contract compliance)

Verify against the Style Contract:

- areas use `arcSize=24;absoluteArcSize=1`, strokeWidth 1.5, correct blue/grey treatment, alternating nested fills;
- components are white cards with domain-colored strokes and bold-name/italic-subtitle labels;
- SAP service icons use the native shape set (or embedded official assets) at 64×64 with labels below;
- pills use `arcSize=50` and match their channel color;
- edges are orthogonal, blockThin-headed, semantically colored; bidirectional only where mutual;
- network barriers are 4px grey with `jumpStyle=gap`;
- fonts are Helvetica at the verified sizes; no tiny shrunken text;
- accent colors are sparse, one meaning each, reflected in the legend;
- the primary flow is obvious left-to-right (or justified top-to-bottom).

### Gate 3 — Draw.io integrity

Verify:

- the XML parses;
- all IDs are unique;
- every edge source and target exists;
- every parent ID exists;
- all pages open without a repair warning;
- components remain individually selectable and editable;
- official icon assets render offline (no external image URLs);
- every official icon has a documented library title/source and no component has duplicate `sapicon-*` children;
- label values are escaped once and styles contain no duplicate keys;
- no object lies outside the intended page or export bounds.

### Gate 4 — rendered QA

Open the `.drawio` file in Draw.io and inspect the rendered result. Export a PNG or SVG only for QA and presentation. When browser automation is available, inspect page alerts and error dialogs after loading; a visible canvas alone is not sufficient proof of a clean import.

Inspect at full-page scale and at 100% zoom for:

- unreadable text;
- clipping;
- overlaps;
- accidental line-through-text;
- hidden arrowheads;
- uneven spacing;
- inconsistent visual hierarchy;
- excess whitespace;
- misleading proximity or grouping.

If a target reference diagram exists, place its exported image beside yours and compare zone treatment, pill styling, edge colors, and typography until they are indistinguishable in grammar (topology will differ; grammar must not).

Iterate until both the editable source and rendered view pass.

## XML validation logic

Use an XML parser, then enforce these graph checks:

```python
ids = {cell.id for cell in cells}
assert len(ids) == len(cells)
for cell in cells:
    if cell.parent:
        assert cell.parent in ids
    if cell.edge:
        assert cell.source in ids
        assert cell.target in ids
```

Also report orphan vertices, unconnected important components, duplicate labels that may be accidental, and edges without a documented meaning.

Add regression checks that fail on double-escaped label markup, duplicate style keys, duplicate icon IDs, non-data image URLs, icon cells whose parent component does not exist, areas whose `arcSize` is not `24`/`absoluteArcSize=1`, pills whose `arcSize` is not `50`, and edges whose strokeWidth is neither `1.5` nor `4`. Count expected icon mappings against actual embedded icon cells.

## Handle uncertainty safely

When authoritative information is unavailable:

- label the element generically (RA0029 itself uses `Client, not specified` and `Search, not specified` — copy that honesty);
- add an assumption note;
- distinguish conceptual from deployed components;
- avoid protocol labels unless verified;
- avoid placing a service inside a specific account, runtime, or network zone without evidence;
- state what must be confirmed by the solution owner.

Use `Proposed`, `Conceptual`, or `To be confirmed` where appropriate. Never present inference as an SAP recommendation.

## Common failure modes

Reject or revise diagrams that:

- use random internet icons or icons copied from screenshots;
- use SAP logos as generic decoration;
- use an official icon for the wrong service;
- place every component in an SAP-blue container;
- mix SAP, partner, and custom responsibilities without boundaries;
- show lines without direction or meaning;
- use colors with no semantic rule;
- make every flow bidirectional;
- encode security solely with a padlock icon;
- overuse accent colors;
- shrink text to fit a crowded canvas;
- contain more than one main story without pages or insets;
- flatten all components into one image;
- imply runtime deployment through visual nesting that is only conceptual;
- include obsolete product names;
- deviate from the Style Contract (percentage arcSize, 1px strokes, non-blockThin arrows, mixed fonts) — these are what make a diagram look "almost but not quite" Architecture Center grade;
- render well but fail to open as editable Draw.io.

## Deliverables

Provide:

1. the validated `.drawio` source;
2. an optional PNG or SVG preview when requested;
3. a short architecture summary;
4. the selected level and intended audience;
5. a legend or notation summary when needed;
6. assumptions and unresolved decisions;
7. authoritative sources used to verify products, services, and integrations.

Name files descriptively, for example:

```text
sap-procurement-agent-architecture-l1.drawio
sap-procurement-agent-architecture-l1.png
```

## Completion checklist

Do not claim completion until all answers are yes:

- Is the architecture technically defensible?
- Is the scope and diagram level explicit?
- Are official SAP icons and exact product names used where available?
- Are SAP, non-SAP, custom, and external boundaries obvious?
- Are containment relationships true?
- Are connectors directional, routed cleanly, and semantically explained?
- Does every style match the Style Contract literally (arcSize, strokes, fonts, arrows, pills, barriers)?
- Is the main story understandable in five seconds?
- Does the XML pass structural validation and the contract regression checks?
- Are labels escaped exactly once and style keys unique?
- Are official icons embedded, source-traceable, and idempotently mapped to components?
- Does Draw.io open the file without repair warnings?
- Is every important object editable?
- Has the rendered output been inspected — and compared against the reference grammar — for visual defects?
- Are assumptions and sources recorded?
