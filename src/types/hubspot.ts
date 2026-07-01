export type TourType = "virtual" | "in_person";

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  timezone: string;
  tourType: TourType;
  likelyAvailableUserIds?: string[];
}

export interface TourAvailabilityInput {
  tourType: TourType;
  timezone?: string;
  monthOffset?: number;
}

export interface TourAvailabilityResult {
  slots: AvailableSlot[];
  rawResponse: unknown;
}

export interface BookTourInput {
  tourType: TourType;
  startTime: string;
  durationMinutes?: number;
  timezone?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  hubspotContactId?: string;
  hubspotDealId?: string;
  sessionId?: string;
  formFields?: Array<{ name: string; value: string }>;
  likelyAvailableUserIds?: string[];
}

export interface BookTourSuccess {
  success: true;
  tourType: TourType;
  startTime: string;
  endTime: string;
  timezone: string;
  calendarEventId: string;
  contactId?: string;
  messageForAgent: string;
  hubspotResponse: unknown;
}

export interface BookTourFailure {
  success: false;
  error: string;
  fallbackMessageForAgent: string;
  hubspotResponse?: unknown;
}

export type BookTourResult = BookTourSuccess | BookTourFailure;

export interface UpdateHubspotDealInput {
  hubspotDealId: string;
  properties: Record<string, string>;
}

export interface HubSpotFormField {
  name: string;
  value: string;
}

export interface HubSpotLegalConsentOption {
  communicationTypeId: string;
  consented: boolean;
}

export interface HubSpotBookingInfo {
  customParams?: {
    formFields?: Array<{ name: string; label?: string; required?: boolean }>;
    legalConsentEnabled?: boolean;
    legalConsentOptions?: Array<{ communicationTypeId: string }>;
  };
  linkAvailability?: HubSpotLinkAvailability;
}

export interface HubSpotLinkAvailability {
  hasMore?: boolean;
  linkAvailabilityByDuration?: Record<
    string,
    {
      meetingDurationMillis?: number;
      availabilities?: Array<{
        startMillisUtc?: number;
        endMillisUtc?: number;
        start?: number;
        end?: number;
        likelyAvailableUserIds?: string[];
      }>;
    }
  >;
}

export interface HubSpotAvailabilityPageResponse {
  linkAvailability?: HubSpotLinkAvailability;
  [key: string]: unknown;
}

export interface HubSpotMeetingLink {
  id: string;
  slug: string;
  link: string;
  type: string;
}

export interface HubSpotBookingResponse {
  calendarEventId?: string;
  contactId?: string;
  start?: string;
  end?: string;
  bookingTimezone?: string;
  duration?: number;
  subject?: string;
  location?: string;
  webConferenceUrl?: string;
}
