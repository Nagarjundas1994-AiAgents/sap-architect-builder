# SAP Architect Builder

Turn whiteboard sketches into **editable SAP Architecture Center–grade Draw.io diagrams**.

**Backend: SAP CAP (CAPM)**

```
React studio (:5173)
        │  /api/*  (Vite proxy)
        ▼
SAP CAP (:4004)
  · REST  /api/*
  · OData /odata/v4/architect
  · XSUAA roles Architect / Viewer
        │
        ▼
@sap-architect/core
  LangGraph · Vision · Architecture Center RAG · Draw.io
```

## Layout

```
apps/
  web/     React studio
  cap/     SAP CAP + XSUAA + MTA
packages/
  shared/  Types + style constants
  drawio/  Draw.io XML + SAP icons
  core/    LangGraph pipeline, vision, vector store
samples/
  corpus/  Architecture Center seed
  output/  Sample .drawio files
```

## Quick start

```bash
npm install
npm run build

# Terminal 1
npm run dev:cap

# Terminal 2
npm run dev:web
```

| URL | Purpose |
|---|---|
| http://localhost:5173 | Studio UI |
| http://localhost:4004/api/health | CAP health |
| http://localhost:4004/odata/v4/architect | OData V4 |

1. **Run mock demo** → pauses for human review  
2. Edit model → **Approve & generate Draw.io**  
3. Download `.drawio` → open in [diagrams.net](https://app.diagrams.net)

Mock CAP users: `architect` / `architect`, `viewer` / `viewer`.

## Other commands

```bash
npm run demo:pipeline   # CLI pipeline (no UI)
npm run corpus:seed     # load Architecture Center seed
npm run db:up           # optional pgvector (docker)
```

## Environment

See `.env.example` (`LLM_PROVIDER`, `DATABASE_URL`, `CORS_ORIGIN`, …).

## BTP

See `apps/cap/README.md` and `apps/cap/mta.yaml`.
