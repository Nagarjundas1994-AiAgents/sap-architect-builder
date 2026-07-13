# SAP Architect Builder (Prototype)

Turn whiteboard sketches and architecture notes into **editable SAP-grade Draw.io diagrams** — not static PNGs.

```
Upload / mock sketch
        ↓
 Vision extraction  →  ArchitectureModel
        ↓
 Reference retrieval (memory or pgvector + Architecture Center corpus)
        ↓
 Gap analysis + refinement
        ↓
 ★ Human-in-the-loop review (edit ArchitectureModel)
        ↓
 Draw.io XML (SAP Architecture Center style contract)
        ↓
 Validate + download .drawio
```

Orchestration uses **LangGraph** (extract → retrieve → gaps → refine → human_review → generate → validate) with checkpoint resume for HITL.

## Monorepo layout

```
apps/
  web/          React + Vite — upload, pipeline, HITL editor, download
  api/          Express API (dev) — multipart + approve + corpus seed
  cap/          SAP CAP + XSUAA scaffold for BTP
packages/
  shared/       Architecture model types + style constants
  drawio/       Semantic model → Draw.io XML + validator
  core/         LangGraph, vision, vector store, corpus loader, agents
samples/
  corpus/       Architecture Center seed JSON
  output/       Generated .drawio demos
docker-compose.yml   pgvector (Postgres 16)
```

## Quick start

```bash
npm install
npm run build
```

### Terminal A — API

```bash
npm run dev:api
# http://localhost:4000
```

### Terminal B — Web

```bash
npm run dev:web
# http://localhost:5173
```

1. Click **Run mock demo** → pipeline pauses at **Human review**.
2. Edit ArchitectureModel JSON if needed → **Approve & generate Draw.io**.
3. Download the `.drawio` file.

### CLI demo (includes simulated HITL)

```bash
npm run demo:pipeline
```

### Optional: pgvector

```bash
npm run db:up
# set DATABASE_URL=postgresql://architect:architect@localhost:5432/architect
npm run corpus:seed
npm run dev:api
```

### CAP + XSUAA (BTP path)

```bash
cd apps/cap
npm install
npx cds watch
# mock user architect / architect — see apps/cap/README.md
```

## API (Express)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health, engine, vector store |
| `GET` | `/api/references` | Loaded reference architectures |
| `POST` | `/api/corpus/seed` | Reload Architecture Center corpus |
| `POST` | `/api/demo` | Mock pipeline (`autoApprove` optional) |
| `POST` | `/api/pipeline` | Upload image + run graph |
| `GET` | `/api/jobs/:id` | Job status |
| `POST` | `/api/jobs/:id/approve` | HITL resume with edited model |
| `GET` | `/api/jobs/:id/drawio` | Download `.drawio` |

## Environment

See `.env.example`:

| Variable | Default | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `mock` \| `openai` |
| `PIPELINE_ENGINE` | `langgraph` | `langgraph` \| `sequential` |
| `REQUIRE_HUMAN_REVIEW` | `true` | Pause before Draw.io generation |
| `DATABASE_URL` | _(unset)_ | Enables pgvector; else memory store |
| `OPENAI_*` | | Real vision / Generative AI Hub |

## Feature map

| # | Feature | Location |
|---|---|---|
| 1 | **LangGraph wrapper** | `packages/core/src/graph/architecture-graph.ts` |
| 2 | **pgvector + Architecture Center corpus** | `packages/core/src/vector/*`, `corpus/*`, `samples/corpus/`, `docker-compose.yml` |
| 3 | **Human-in-the-loop** | Graph `human_review` interrupt + `POST /api/jobs/:id/approve` + UI editor |
| 4 | **CAP + XSUAA** | `apps/cap` (CDS service, `xs-security.json`, `mta.yaml`) |

## Technology map

| Layer | Prototype | Production path |
|---|---|---|
| Frontend | React + Vite | SAP UI5 / React on BTP |
| Backend | Express | CAP (`apps/cap`) |
| Auth | None (Express) / mocked (CAP) | XSUAA + IAS |
| Orchestration | LangGraph | LangGraph (same) |
| LLM / Vision | Mock or OpenAI-compatible | Generative AI Hub |
| Vector search | Memory or pgvector | HANA Vector Engine / pgvector |
| Diagrams | Draw.io XML | Draw.io (+ exports later) |

## License

Prototype / internal use — align with your organization's SAP and third-party terms.
