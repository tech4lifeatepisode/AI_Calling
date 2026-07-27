import { render } from "@react-email/render";
import { TourBookingNotificationEmail } from "../emails/TourBookingNotification.js";
import type { TourType } from "../types/hubspot.js";
import { getEnv } from "./env.js";
import { sendEmail } from "./email.js";
import { formatDisplayTimeMadrid } from "./hubspot.js";
import {
  buildHubSpotContactUrl,
  buildHubSpotDealUrl,
  getHubSpotPortalId,
} from "./hubspotPortal.js";
import { getHubSpotDealName } from "./guestContactResolver.js";
import { logger } from "./logger.js";

function tourTypeLabel(tourType: TourType): string {
  return tourType === "virtual" ? "Virtual tour" : "In-person tour";
}

function guestDisplayName(firstName?: string, lastName?: string, email?: string): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email || "Guest";
}

export async function sendTourBookingNotification(input: {
  tourType: TourType;
  startTime: string;
  timezone: string;
  guestEmail: string;
  guestFirstName?: string;
  guestLastName?: string;
  hubspotDealId?: string;
  hubspotContactId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const env = getEnv();

  if (!env.TOUR_BOOKING_EMAIL_ENABLED || !env.TOUR_BOOKING_NOTIFY_EMAIL) {
    return { success: false, error: "Tour booking email notifications are disabled" };
  }

  const portalId = await getHubSpotPortalId(env.HUBSPOT_PORTAL_ID);
  const dealName = input.hubspotDealId
    ? await getHubSpotDealName(input.hubspotDealId)
    : null;

  const dealUrl =
    portalId && input.hubspotDealId
      ? buildHubSpotDealUrl(portalId, input.hubspotDealId)
      : null;
  const contactUrl =
    portalId && input.hubspotContactId
      ? buildHubSpotContactUrl(portalId, input.hubspotContactId)
      : null;

  const guestName = guestDisplayName(
    input.guestFirstName,
    input.guestLastName,
    input.guestEmail
  );
  const scheduledTimeLabel = formatDisplayTimeMadrid(input.startTime);
  const tourLabel = tourTypeLabel(input.tourType);

  const html = await render(
    TourBookingNotificationEmail({
      guestName,
      guestEmail: input.guestEmail,
      tourTypeLabel: tourLabel,
      scheduledTimeLabel,
      timezone: input.timezone,
      dealName,
      dealUrl,
      contactUrl,
    })
  );

  const textLines = [
    "Tour booked via Cara",
    "",
    `Guest: ${guestName} (${input.guestEmail})`,
    `Tour type: ${tourLabel}`,
    `Scheduled: ${scheduledTimeLabel} (${input.timezone})`,
  ];

  if (dealName) {
    textLines.push(`Deal: ${dealName}`);
  }
  if (dealUrl) {
    textLines.push(`Deal link: ${dealUrl}`);
  }
  if (contactUrl) {
    textLines.push(`Contact link: ${contactUrl}`);
  }

  const subject = `Tour booked: ${guestName} — ${scheduledTimeLabel}`;

  const result = await sendEmail({
    to: env.TOUR_BOOKING_NOTIFY_EMAIL.split(",").map((e) => e.trim()),
    subject,
    html,
    text: textLines.join("\n"),
  });

  if (!result.success) {
    logger.warn("Tour booking notification email failed", {
      error: result.error,
      hubspotDealId: input.hubspotDealId,
    });
  } else {
    logger.info("Tour booking notification email sent", {
      hubspotDealId: input.hubspotDealId,
      guestEmail: input.guestEmail,
    });
  }

  return result;
}
