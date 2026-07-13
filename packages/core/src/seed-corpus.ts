import { loadCorpusIntoStore } from "./corpus/loader.js";
import { resetVectorStoreSingleton } from "./vector/index.js";

async function main() {
  resetVectorStoreSingleton();
  const result = await loadCorpusIntoStore({
    discover: process.env.CORPUS_DISCOVER === "1",
    databaseUrl: process.env.DATABASE_URL,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
