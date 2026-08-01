# SAP CAP (CAPM) — primary backend

This is the **main backend** for SAP Architect Builder.

```
React studio (:5173)
        │  /api/*
        ▼
CAP server.js REST facade (:4004)
        │
        ▼
ArchitectService (OData V4 + ApplicationService)
        │
        ▼
@sap-architect/core  (LangGraph · vision · Draw.io · vector corpus)
```

## Run locally

From monorepo root (after `npm install` + build packages):

```bash
# Terminal 1 — CAP backend
npm run dev:cap

# Terminal 2 — React UI (proxies /api → :4004)
npm run dev:web
```

| Endpoint | Purpose |
|---|---|
| http://localhost:4004 | CAP landing / OData |
| http://localhost:4004/api/health | Health (REST facade) |
| http://localhost:4004/odata/v4/architect/ | OData V4 service |
| http://localhost:5173 | React studio |

### Mock users (development)

| User | Password | Roles |
|---|---|---|
| `architect` | `architect` | Architect, Viewer |
| `viewer` | `viewer` | Viewer |

REST `/api/*` runs actions as Architect for the UI. OData requires Basic auth:

```http
GET /odata/v4/architect/Jobs
Authorization: Basic YXJjaGl0ZWN0OmFyY2hpdGVjdA==
```

### OData actions

```http
POST /odata/v4/architect/runDemo
Content-Type: application/json
Authorization: Basic YXJjaGl0ZWN0OmFyY2hpdGVjdA==

{ "hints": "agentic joule", "fileName": "wb.png", "autoApprove": false }
```

```http
POST /odata/v4/architect/approvePipeline
Content-Type: application/json

{ "jobId": "job-…", "modelJson": "{…ArchitectureModel…}" }
```

## Project layout

| File | Role |
|---|---|
| `db/schema.cds` | Jobs, ReferenceArchitectures, Feedback |
| `srv/architect-service.cds` | Service definition + XSUAA roles |
| `srv/architect-service.js` | Handlers → `@sap-architect/core` |
| `server.js` | CORS + `/api` REST facade for React |
| `xs-security.json` | XSUAA scopes / role collections |
| `mta.yaml` | BTP multi-target deploy |

## BTP

```bash
npm install -g mbt
mbt build
cf deploy mta_archives/sap-architect-builder_*.mtar
```

Assign role collections `ArchitectBuilder_Architect` / `ArchitectBuilder_Viewer` in the cockpit.
