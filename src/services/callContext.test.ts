import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractHubspotDealIdFromMetadata,
  isPlaceholderEmail,
  sanitizeGuestEmail,
} from "./callContext.js";

describe("isPlaceholderEmail", () => {
  it("flags common placeholder addresses", () => {
    assert.equal(isPlaceholderEmail("need_email@example.com"), true);
    assert.equal(isPlaceholderEmail("placeholder@test.com"), true);
    assert.equal(isPlaceholderEmail("guest@example.org"), true);
  });

  it("allows real guest addresses", () => {
    assert.equal(isPlaceholderEmail("carolam79@icloud.com"), false);
  });
});

describe("sanitizeGuestEmail", () => {
  it("drops placeholder emails", () => {
    assert.equal(sanitizeGuestEmail("need_email@example.com"), undefined);
    assert.equal(sanitizeGuestEmail("carolam79@icloud.com"), "carolam79@icloud.com");
  });
});

describe("extractHubspotDealIdFromMetadata", () => {
  it("reads direct deal id fields", () => {
    assert.equal(
      extractHubspotDealIdFromMetadata({ hubspot_deal_id: "513590817012" }),
      "513590817012"
    );
  });

  it("reads HubSpot workflow object metadata", () => {
    assert.equal(
      extractHubspotDealIdFromMetadata({
        object: { objectId: 513590817012, objectType: "DEAL" },
      }),
      "513590817012"
    );
  });
});
