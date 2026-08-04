import "dotenv/config";
import { syncMcpToolsDocToNotion } from "../src/services/notionMcpToolsDoc.js";

async function main(): Promise<void> {
  const result = await syncMcpToolsDocToNotion();
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
