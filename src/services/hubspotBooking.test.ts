import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeLegalConsentOptions } from "./hubspot.js";
import type { HubSpotBookingInfo } from "../types/hubspot.js";

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
