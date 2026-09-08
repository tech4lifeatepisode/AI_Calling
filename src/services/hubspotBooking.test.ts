import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFormFields, findSlotByStartTime, normalizeLegalConsentOptions } from "./hubspot.js";
import type { AvailableSlot, BookTourInput, HubSpotBookingInfo } from "../types/hubspot.js";

describe("normalizeLegalConsentOptions", () => {
  it("returns empty array when consent options are missing", () => {
    assert.deepEqual(normalizeLegalConsentOptions(undefined), []);
    assert.deepEqual(normalizeLegalConsentOptions({ customParams: {} }), []);
  });

  it("handles a plain consent-options array", () => {
    const bookingInfo: HubSpotBookingInfo = {
      customParams: {
        legalConsentOptions: [{ communicationTypeId: "consent-a" }],
      },
    };

    assert.deepEqual(normalizeLegalConsentOptions(bookingInfo), [
      { communicationTypeId: "consent-a" },
    ]);
  });

  it("handles HubSpot object-shaped consent metadata", () => {
    const bookingInfo: HubSpotBookingInfo = {
      customParams: {
        legalConsentOptions: {
          communicationsCheckboxes: [
            { communicationTypeId: "consent-a" },
            { communicationTypeId: "consent-b" },
          ],
        } as unknown as Array<{ communicationTypeId: string }>,
      },
    };

    assert.deepEqual(normalizeLegalConsentOptions(bookingInfo), [
      { communicationTypeId: "consent-a" },
      { communicationTypeId: "consent-b" },
    ]);
  });

  it("deduplicates repeated consent type ids", () => {
    const bookingInfo: HubSpotBookingInfo = {
      customParams: {
        legalConsentOptions: [
          { communicationTypeId: "consent-a" },
          { communicationTypeId: "consent-a" },
        ],
      },
    };

    assert.deepEqual(normalizeLegalConsentOptions(bookingInfo), [
      { communicationTypeId: "consent-a" },
    ]);
  });
});

describe("findSlotByStartTime", () => {
  const slots: AvailableSlot[] = [
    {
      startTime: "2026-08-12T11:15:00.000Z",
      endTime: "2026-08-12T12:00:00.000Z",
      durationMinutes: 45,
      timezone: "Europe/Madrid",
      tourType: "virtual",
    },
  ];

  it("matches exact ISO start times", () => {
    const slot = findSlotByStartTime(slots, "2026-08-12T11:15:00.000Z");
    assert.equal(slot?.durationMinutes, 45);
  });

  it("matches equivalent ISO start times with different formatting", () => {
    const slot = findSlotByStartTime(slots, "2026-08-12T11:15:00Z");
    assert.equal(slot?.durationMinutes, 45);
  });

  it("returns undefined when no slot matches", () => {
    assert.equal(findSlotByStartTime(slots, "2026-08-12T12:00:00.000Z"), undefined);
  });
});

describe("buildFormFields", () => {
  const guest: BookTourInput = {
    tourType: "virtual",
    startTime: "2026-09-11T08:30:00.000Z",
    email: "guest@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+34600111222",
  };

  it("does not send extra HubSpot form fields for Episode tour pages", () => {
    const bookingInfo: HubSpotBookingInfo = {
      customParams: {
        formFields: [
          { name: "phone", required: false },
          { name: "company", required: false },
        ],
      },
    };

    assert.deepEqual(buildFormFields(guest, undefined), []);
    assert.deepEqual(buildFormFields(guest, bookingInfo), []);
  });
});
