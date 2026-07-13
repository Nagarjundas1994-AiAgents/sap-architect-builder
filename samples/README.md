# Samples

## Corpus (`corpus/architecture-center/`)

Curated seed of SAP Architecture Center–style reference architectures (offline JSON).

```bash
# Load into memory or pgvector (if DATABASE_URL is set)
npm run corpus:seed

# Optional live link discovery from architecture.learning.sap.com
set CORPUS_DISCOVER=1
npm run corpus:seed
```

## pgvector

```bash
npm run db:up
set DATABASE_URL=postgresql://architect:architect@localhost:5432/architect
npm run corpus:seed
```

## Generated demos

`output/` receives `.drawio` files from `npm run demo:pipeline`.

Open any `.drawio` at [https://app.diagrams.net](https://app.diagrams.net).
