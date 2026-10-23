import "dotenv/config";
import { runNotionBackfill } from "../src/services/notionSync.js";

function readSince(): string {
  const withEquals = process.argv.find((arg) => arg.startsWith("--since="));
  if (withEquals) {
    return withEquals.slice("--since=".length);
  }

  const index = process.argv.indexOf("--since");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value ?? "2026-10-01T00:00:00Z";
}

const dryRun = process.argv.includes("--dry-run");
const since = readSince();
const result = await runNotionBackfill({ since, dryRun });

console.log(JSON.stringify({ since, ...result }, null, 2));

if (!dryRun && result.failed > 0) {
  process.exitCode = 1;
}
