import { z } from "zod";

export const tourTypeSchema = z.enum(["virtual", "in_person"]);

// Use separate optional fields (not shared Zod instances) so JSON Schema has no $ref/null unions.
export const getTourAvailabilityInputSchema = z.object({
  tourType: tourTypeSchema,
  timezone: z.string().optional(),
  monthOffset: z.number().int().min(0).optional(),
  preferredDay: z.string().optional(),
  preferredTime: z.string().optional(),
  sessionId: z.string().optional(),
  execution_message: z.string().optional(),
});

export const bookTourInputSchema = z.object({
  tourType: tourTypeSchema,
  startTime: z.string().min(1),
  durationMinutes: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  hubspotContactId: z.string().optional(),
  hubspotDealId: z.string().optional(),
  sessionId: z.string().optional(),
  execution_message: z.string().optional(),
});

export const logRetellSessionInputSchema = z.object({
  time: z.string().optional(),
  duration: z.union([z.number(), z.string()]).optional(),
  channelType: z.string().optional(),
  cost: z.union([z.number(), z.string()]).optional(),
  sessionId: z.string().optional(),
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
  sessionId: z.string().optional(),
  hubspotContactId: z.string().optional(),
  hubspotDealId: z.string().optional(),
  tourType: z.enum(["virtual", "in_person", "unknown"]).optional(),
  requestedDay: z.string().optional(),
  requestedTime: z.string().optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  status: z.enum(["interested", "not_interested", "asked_to_send_links", "booking_failed"]),
  execution_message: z.string().optional(),
});

const episodeContextFields = {
  sessionId: z.string().optional(),
  hubspotContactId: z.string().optional(),
  hubspotDealId: z.string().optional(),
  execution_message: z.string().optional(),
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
