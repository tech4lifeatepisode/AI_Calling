import dotenv from "dotenv";
import { getTourAvailability } from "../src/services/hubspot.js";
import { logger } from "../src/services/logger.js";

dotenv.config();

async function main(): Promise<void> {
  logger.info("Testing HubSpot tour availability...");

  for (const tourType of ["virtual", "in_person"] as const) {
    logger.info(`Checking ${tourType} availability`);
    const result = await getTourAvailability({ tourType, monthOffset: 0 });
    logger.info(`${tourType} slots found`, {
      count: result.slots.length,
      firstSlot: result.slots[0] ?? null,
    });

    if (result.slots.length === 0) {
      logger.warn(`${tourType} raw HubSpot response (debug)`, {
        raw: JSON.stringify(result.rawResponse).slice(0, 1000),
      });
    }
  }
}

main().catch((err) => {
  logger.error("testAvailability failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
