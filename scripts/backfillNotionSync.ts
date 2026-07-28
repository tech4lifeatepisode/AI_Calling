import "dotenv/config";
import { runNotionSync } from "../src/services/notionSync.js";

async function main(): Promise<void> {
  const full = process.argv.includes("--full");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const result = await runNotionSync({
    full,
    syncType: full ? "backfill" : "manual",
    limit,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
