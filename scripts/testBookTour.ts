import dotenv from "dotenv";
import { bookTour, getTourAvailability } from "../src/services/hubspot.js";
import { logger } from "../src/services/logger.js";

dotenv.config();

async function main(): Promise<void> {
  if (process.env.RUN_BOOKING_TEST !== "true") {
    logger.warn(
      "Skipping live booking test. Set RUN_BOOKING_TEST=true and TEST_BOOKING_EMAIL to run."
    );
    process.exit(0);
  }

  const email = process.env.TEST_BOOKING_EMAIL;
  if (!email) {
    throw new Error("TEST_BOOKING_EMAIL is required when RUN_BOOKING_TEST=true");
  }

  const tourType = (process.env.TEST_TOUR_TYPE ?? "virtual") as "virtual" | "in_person";
  logger.info("Fetching availability for booking test", { tourType });

  const availability = await getTourAvailability({ tourType });
  const slot = availability.slots[0];

  if (!slot) {
    throw new Error("No available slots found for booking test");
  }

  logger.info("Attempting booking", {
    tourType,
    startTime: slot.startTime,
    email,
  });

  const result = await bookTour({
    tourType,
    startTime: slot.startTime,
    email,
    firstName: process.env.TEST_BOOKING_FIRST_NAME ?? "Test",
    lastName: process.env.TEST_BOOKING_LAST_NAME ?? "Guest",
    phone: process.env.TEST_BOOKING_PHONE,
    likelyAvailableUserIds: slot.likelyAvailableUserIds,
  });

  logger.info("Booking result", { result });
}

main().catch((err) => {
  logger.error("testBookTour failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
