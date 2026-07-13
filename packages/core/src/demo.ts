import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runArchitecturePipeline, resumeArchitecturePipeline } from "./pipeline.js";
import { loadCorpusIntoStore } from "./corpus/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Seeding Architecture Center corpus (memory or pgvector)...");
  const seed = await loadCorpusIntoStore({
    discover: process.env.CORPUS_DISCOVER === "1",
  });
  console.log(`  store=${seed.storeKind} count=${seed.count}\n`);

  console.log("Running LangGraph pipeline (HITL auto-approve for CLI)...\n");
  const logged = new Set<string>();

  const onStep = (
    steps: { id: string; name: string; status: string; message?: string }[]
  ) => {
    for (const s of steps) {
      if ((s.status === "completed" || s.status === "skipped") && !logged.has(s.id)) {
        logged.add(s.id);
        console.log(`✓ ${s.name}${s.status === "skipped" ? " (skipped)" : ""}`);
      }
      if (s.status === "failed" && !logged.has(s.id)) {
        logged.add(s.id);
        console.log(`✗ ${s.name}${s.message ? ` — ${s.message}` : ""}`);
      }
      if (s.status === "waiting" && !logged.has(`${s.id}:wait`)) {
        logged.add(`${s.id}:wait`);
        console.log(`… ${s.name} — waiting`);
      }
    }
  };

  let result = await runArchitecturePipeline(
    {
      imageBase64: "",
      mimeType: "image/png",
      fileName: "whiteboard-agentic.png",
      hints: "agentic joule custom agents",
    },
    {
      provider: "mock",
      engine: "langgraph",
      requireHumanReview: true,
      onStep,
    }
  );

  if (result.status === "awaiting_review" && result.refined) {
    console.log("\n— Human-in-the-loop: simulating architect edit —");
    const edited = structuredClone(result.refined);
    edited.title = `${edited.title.replace(/ \(refined\)/i, "")} (architect-approved)`;
    edited.assumptions = [
      ...edited.assumptions,
      {
        id: "hitl-1",
        text: "Architect confirmed component set during human review.",
        severity: "info",
      },
    ];
    result = await resumeArchitecturePipeline(result.jobId, edited, {
      provider: "mock",
      onStep,
    });
  }

  console.log("\nStatus:", result.status);
  console.log("Engine:", result.engine);
  console.log("Title:", result.approved?.title ?? result.refined?.title);
  console.log("Components:", (result.approved ?? result.refined)?.components.length);
  console.log("Gaps:", result.gaps?.length);
  console.log(
    "Top references:",
    result.references?.map((r) => `${r.ref.title} (${r.score.toFixed(2)})`).join(" | ")
  );

  if (result.drawioXml) {
    const outDir = join(__dirname, "../../../samples/output");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "demo-agentic-architecture-l1.drawio");
    writeFileSync(outPath, result.drawioXml, "utf8");
    console.log("\nWrote:", outPath);
  }

  if (result.error) {
    console.error("Error:", result.error);
    process.exitCode = 1;
  }
}

main();
