import dotenv from "dotenv";
import { getEnv } from "./services/env.js";
import { logger } from "./services/logger.js";
import { createApp } from "./server.js";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

try {
  const env = getEnv();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`, {
      nodeEnv: env.NODE_ENV,
    });
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("Failed to start server", { message });
  process.exit(1);
}
