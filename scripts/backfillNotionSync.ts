import "dotenv/config";
import { runNotionBackfill, runNotionIncrementalSync } from "../src/services/notionSync.js";

const full = process.argv.includes("--full");
const sinceArg = process.argv.find((arg) => arg.startsWith("--since="));
const since = sinceArg?.slice("--since=".length) ?? (full ? "1970-01-01T00:00:00Z" : undefined);

const result = since
  ? await runNotionBackfill({
      since,
      dryRun: process.argv.includes("--dry-run"),
    })
  : await runNotionIncrementalSync();

console.log(JSON.stringify(result, null, 2));
if (result.failed > 0) {
  process.exitCode = 1;
}
