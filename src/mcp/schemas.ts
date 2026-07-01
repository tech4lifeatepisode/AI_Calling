import { z } from "zod";

export const tourTypeSchema = z.enum(["virtual", "in_person"]);

const nullableString = z.string().nullable().optional();
const nullableEmail = z.string().email().nullable().optional();

export const getTourAvailabilityInputSchema = z.object({
  tourType: tourTypeSchema,
  timezone: z.string().optional(),
  monthOffset: z.number().int().min(0).optional(),
  preferredDay: nullableString,
  preferredTime: nullableString,
  sessionId: nullableString,
  execution_message: z.string().optional(),
});

export const bookTourInputSchema = z.object({
  tourType: tourTypeSchema,
  startTime: z.string().min(1),
  durationMinutes: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  email: z.string().email(),
  firstName: nullableString,
  lastName: nullableString,
  phone: nullableString,
  hubspotContactId: nullableString,
  hubspotDealId: nullableString,
  sessionId: nullableString,
  execution_message: z.string().optional(),
});

export const logRetellSessionInputSchema = z.object({
  time: nullableString,
  duration: z.union([z.number(), z.string(), z.null()]).optional(),
  channelType: nullableString,
  cost: z.union([z.number(), z.string(), z.null()]).optional(),
  sessionId: nullableString,
  endReason: nullableString,
  sessionStatus: nullableString,
  userSentiment: nullableString,
  agentId: nullableString,
  agentVersion: nullableString,
  agentName: nullableString,
  from: nullableString,
  to: nullableString,
  direction: nullableString,
  sessionOutcome: nullableString,
  endToEndLatency: z.union([z.number(), z.string(), z.null()]).optional(),
  recordingUrl: nullableString,
  scrubbedRecordingUrl: nullableString,
  publicLogUrl: nullableString,
  transcript: nullableString,
  transcriptWithToolCalls: nullableString,
  scrubbedTranscriptWithToolCalls: nullableString,
  rawPayload: z.record(z.unknown()).nullable().optional(),
  execution_message: z.string().optional(),
});

export const logTourPreferenceInputSchema = z.object({
  sessionId: nullableString,
  hubspotContactId: nullableString,
  hubspotDealId: nullableString,
  tourType: z.enum(["virtual", "in_person", "unknown"]).optional(),
  requestedDay: nullableString,
  requestedTime: nullableString,
  guestEmail: nullableEmail,
  guestPhone: nullableString,
  status: z.enum(["interested", "not_interested", "asked_to_send_links", "booking_failed"]),
  execution_message: z.string().optional(),
});

export type GetTourAvailabilityInput = z.infer<typeof getTourAvailabilityInputSchema>;
export type BookTourInput = z.infer<typeof bookTourInputSchema>;
export type LogRetellSessionInput = z.infer<typeof logRetellSessionInputSchema>;
export type LogTourPreferenceInput = z.infer<typeof logTourPreferenceInputSchema>;
