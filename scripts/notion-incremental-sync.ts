import "dotenv/config";
import { runNotionIncrementalSync } from "../src/services/notionSync.js";

const result = await runNotionIncrementalSync();
console.log(JSON.stringify(result, null, 2));
