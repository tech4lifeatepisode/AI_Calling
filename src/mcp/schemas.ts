import { z } from "zod";

export const tourTypeSchema = z.enum(["virtual", "in_person"]);

// Use separate optional fields (not shared Zod instances) so JSON Schema has no $ref/null unions.
const retellContextFields = {
  sessionId: z
    .string()
    .optional()
    .describe(
      "Retell call_id for this live call. Always pass when available. Never pass JSON null."
    ),
  hubspotContactId: z
    .string()
    .optional()
    .describe(
      "HubSpot contact ID from the contact_id dynamic variable or pre-call get_hubspot_contact. Always pass on live calls. Never pass JSON null."
    ),
  hubspotDealId: z
    .string()
    .optional()
    .describe(
      "HubSpot deal ID from the deal_id dynamic variable or pre-call get_hubspot_deal. Always pass on live calls. Never pass JSON null."
    ),
  execution_message: z.string().optional(),
};

export const getTourAvailabilityInputSchema = z.object({
  tourType: tourTypeSchema,
  timezone: z.string().optional(),
  monthOffset: z.number().int().min(0).optional(),
  preferredDay: z.string().optional(),
  preferredTime: z.string().optional(),
  ...retellContextFields,
});

export const bookTourInputSchema = z.object({
  tourType: tourTypeSchema,
  startTime: z.string().min(1),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Meeting duration in minutes from the chosen availableSlots entry. Optional — resolved from HubSpot availability when omitted."
    ),
  timezone: z.string().optional(),
  email: z
    .string()
    .optional()
    .describe(
      "Guest email from pre-call get_hubspot_contact, using the contact_email dynamic variable. Always pass this on book_tour. Never use placeholders like need_email@example.com. Never pass JSON null."
    ),
  firstName: z
    .string()
    .optional()
    .describe("Guest first name from contact_first_name when available. Never pass JSON null."),
  lastName: z
    .string()
    .optional()
    .describe("Guest last name from contact_last_name when available. Never pass JSON null."),
  phone: z
    .string()
    .optional()
    .describe("Guest phone from contact_phone when available. Never pass JSON null."),
  hubspotContactId: retellContextFields.hubspotContactId,
  hubspotDealId: retellContextFields.hubspotDealId,
  sessionId: retellContextFields.sessionId,
  execution_message: retellContextFields.execution_message,
});

export const logRetellSessionInputSchema = z.object({
  time: z.string().optional(),
  duration: z.union([z.number(), z.string()]).optional(),
  channelType: z.string().optional(),
  cost: z.union([z.number(), z.string()]).optional(),
  sessionId: z
    .string()
    .optional()
    .describe("Retell call_id. Always pass on live calls. Never pass JSON null."),
  endReason: z.string().optional(),
  sessionStatus: z.string().optional(),
  userSentiment: z.string().optional(),
  agentId: z.string().optional(),
  agentVersion: z.string().optional(),
  agentName: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  direction: z.string().optional(),
  sessionOutcome: z.string().optional(),
  endToEndLatency: z.union([z.number(), z.string()]).optional(),
  recordingUrl: z.string().optional(),
  scrubbedRecordingUrl: z.string().optional(),
  publicLogUrl: z.string().optional(),
  transcript: z.string().optional(),
  transcriptWithToolCalls: z.string().optional(),
  scrubbedTranscriptWithToolCalls: z.string().optional(),
  rawPayload: z.record(z.unknown()).optional(),
  execution_message: z.string().optional(),
});

export const logTourPreferenceInputSchema = z.object({
  sessionId: retellContextFields.sessionId,
  hubspotContactId: retellContextFields.hubspotContactId,
  hubspotDealId: retellContextFields.hubspotDealId,
  tourType: z.enum(["virtual", "in_person", "unknown"]).optional(),
  requestedDay: z.string().optional(),
  requestedTime: z.string().optional(),
  guestEmail: z
    .string()
    .optional()
    .describe("Guest email from contact_email. Never pass JSON null."),
  guestPhone: z
    .string()
    .optional()
    .describe("Guest phone from contact_phone. Never pass JSON null."),
  status: z.enum(["interested", "not_interested", "asked_to_send_links", "booking_failed"]),
  execution_message: retellContextFields.execution_message,
});

const episodeContextFields = {
  sessionId: retellContextFields.sessionId,
  hubspotContactId: retellContextFields.hubspotContactId,
  hubspotDealId: retellContextFields.hubspotDealId,
  execution_message: retellContextFields.execution_message,
};

export const listSelectableRoomTypesInputSchema = z.object({
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  ...episodeContextFields,
});

export const checkRoomAvailabilityInputSchema = z.object({
  unitTypeSlug: z.string().min(1),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  ...episodeContextFields,
});

export const getRoomPricingInputSchema = z.object({
  unitTypeSlug: z.string().min(1),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  people: z.number().int().min(1).max(2),
  promoCode: z.string().optional(),
  paymentOption: z.string().optional(),
  ...episodeContextFields,
});

export type GetTourAvailabilityInput = z.infer<typeof getTourAvailabilityInputSchema>;
export type BookTourInput = z.infer<typeof bookTourInputSchema>;
export type LogRetellSessionInput = z.infer<typeof logRetellSessionInputSchema>;
export type LogTourPreferenceInput = z.infer<typeof logTourPreferenceInputSchema>;
export type ListSelectableRoomTypesInput = z.infer<typeof listSelectableRoomTypesInputSchema>;
export type CheckRoomAvailabilityInput = z.infer<typeof checkRoomAvailabilityInputSchema>;
export type GetRoomPricingInput = z.infer<typeof getRoomPricingInputSchema>;
