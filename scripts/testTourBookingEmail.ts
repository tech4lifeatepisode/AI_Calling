import "dotenv/config";
import { resetEnvCache } from "../src/services/env.js";
import { sendTourBookingNotification } from "../src/services/tourBookingEmail.js";

function ensureRequiredEnv(): void {
  const defaults: Record<string, string> = {
    MCP_SERVER_SECRET: "test-secret",
    HUBSPOT_ACCESS_TOKEN: "test-token",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    HUBSPOT_IN_PERSON_MEETING_URL:
      "https://meetings-eu1.hubspot.com/info-madrid?uuid=6287d1e5-54df-4049-9ed4-324f5c17e566",
    HUBSPOT_VIRTUAL_MEETING_URL:
      "https://meetings-eu1.hubspot.com/info-madrid/virtual-tour-booking-carabanchel?uuid=a6d00f82-9ae1-4a50-97a0-e27712ea6b17",
    HUBSPOT_IN_PERSON_SLUG: "info-madrid",
    HUBSPOT_VIRTUAL_SLUG: "info-madrid/virtual-tour-booking-carabanchel",
    TOUR_BOOKING_EMAIL_ENABLED: "true",
    TOUR_BOOKING_NOTIFY_EMAIL: process.env.TOUR_BOOKING_NOTIFY_EMAIL ?? "claudio@episode.life",
    SMTP_HOST: process.env.SMTP_HOST ?? "smtp.gmail.com",
    SMTP_PORT: process.env.SMTP_PORT ?? "587",
    SMTP_SECURE: process.env.SMTP_SECURE ?? "false",
    SMTP_USER: process.env.SMTP_USER ?? "claudio@episode.life",
    SMTP_FROM: process.env.SMTP_FROM ?? "claudio@episode.life",
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  if (!process.env.SMTP_PASSWORD) {
    throw new Error("SMTP_PASSWORD is required to send the test email");
  }
}

async function main(): Promise<void> {
  ensureRequiredEnv();
  resetEnvCache();

  const sampleDealId = process.env.TEST_HUBSPOT_DEAL_ID ?? "123456789";
  const sampleContactId = process.env.TEST_HUBSPOT_CONTACT_ID ?? "987654321";
  const portalId = process.env.HUBSPOT_PORTAL_ID ?? "145000000";

  process.env.HUBSPOT_PORTAL_ID = portalId;

  const startTime = new Date();
  startTime.setDate(startTime.getDate() + 2);
  startTime.setHours(11, 0, 0, 0);

  const result = await sendTourBookingNotification({
    tourType: "in_person",
    startTime: startTime.toISOString(),
    timezone: "Europe/Madrid",
    guestEmail: "guest@example.com",
    guestFirstName: "Maria",
    guestLastName: "Garcia",
    hubspotDealId: sampleDealId,
    hubspotContactId: sampleContactId,
  });

  if (!result.success) {
    console.error("Failed to send test email:", result.error);
    process.exit(1);
  }

  console.log("Test tour booking notification email sent successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
