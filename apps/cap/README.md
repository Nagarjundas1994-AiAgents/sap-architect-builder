# CAP + XSUAA — Architect Builder

Enterprise deployment path for the prototype monorepo.

## What this module provides

| Piece | Purpose |
|---|---|
| `db/schema.cds` | Jobs, reference architectures, architect feedback |
| `srv/architect-service.cds` | OData/REST actions: `runPipeline`, `approvePipeline`, `seedCorpus` |
| `srv/architect-service.js` | Delegates to `@sap-architect/core` (LangGraph + vector store + Draw.io) |
| `xs-security.json` | XSUAA scopes/roles: **Architect**, **Viewer** |
| `mta.yaml` | BTP Multi-Target Application (CAP srv + XSUAA + HANA HDI) |

## Local development (mocked auth)

From monorepo root (after `npm install` + `npm run build`):

```bash
cd apps/cap
npm install
npx cds watch
```

Mock users (see `package.json` → `cds.requires.auth`):

| User | Password | Roles |
|---|---|---|
| `architect` | `architect` | Architect, Viewer |
| `viewer` | `viewer` | Viewer |

Open `http://localhost:4004` and try:

```http
POST /odata/v4/architect/runPipeline
Content-Type: application/json
Authorization: Basic YXJjaGl0ZWN0OmFyY2hpdGVjdA==

{
  "hints": "agentic joule custom agents",
  "fileName": "whiteboard.png",
  "imageBase64": "",
  "mimeType": "image/png",
  "autoApprove": false
}
```

Then approve with the returned `jobId` and edited `modelJson`.

## BTP deployment (outline)

1. Create BTP subaccount + Cloud Foundry space.
2. Configure **XSUAA** from `xs-security.json` (MTA does this).
3. Optional: **HANA Cloud** HDI for job persistence; **pgvector** or HANA Vector for retrieval (`DATABASE_URL`).
4. Point Generative AI Hub credentials at `OPENAI_BASE_URL` / `OPENAI_API_KEY` style env (or Destination).
5. Build & deploy:

```bash
npm install -g mbt
mbt build
cf deploy mta_archives/sap-architect-builder_*.mtar
```

6. Assign role collections `ArchitectBuilder_Architect` / `ArchitectBuilder_Viewer` to users in BTP Cockpit (or IAS).

## Relationship to Express prototype API

| Express `apps/api` | CAP `apps/cap` |
|---|---|
| Fast local UI backend | BTP-native service |
| No auth (dev) | XSUAA + role templates |
| In-memory jobs map | CAP entities (SQLite/HANA) |
| Same `@sap-architect/core` | Same `@sap-architect/core` |

Keep using Express + React for demos; promote to CAP when packaging for BTP.
