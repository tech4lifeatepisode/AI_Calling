import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeMcpRequestBody, stripInvisibleChars } from "./sanitizeToolInput.js";

function callArgs(args: Record<string, unknown>): Record<string, unknown> | undefined {
  const body = sanitizeMcpRequestBody({
    method: "tools/call",
    params: { arguments: args },
  }) as { params?: { arguments?: Record<string, unknown> } };
  return body.params?.arguments;
}

describe("stripInvisibleChars", () => {
  it("removes zero-width spaces around emails", () => {
    assert.equal(stripInvisibleChars("guest@example.com\u200B"), "guest@example.com");
  });
});

describe("sanitizeMcpRequestBody", () => {
  it("omits JSON nulls", () => {
    const args = callArgs({ email: null, hubspotDealId: "123" });
    assert.deepEqual(args, { hubspotDealId: "123" });
  });

  it("coerces HubSpot IDs from numbers to strings", () => {
    const args = callArgs({
      hubspotDealId: 513590817012,
      hubspotContactId: 99123,
      durationMinutes: 45,
    });
    assert.equal(args?.hubspotDealId, "513590817012");
    assert.equal(args?.hubspotContactId, "99123");
    assert.equal(args?.durationMinutes, 45);
  });

  it("drops unsubstituted Retell templates and zero-width characters", () => {
    const args = callArgs({
      email: "{{contact_email}}\u200B",
      hubspotDealId: "513590817012\u200B",
    });
    assert.deepEqual(args, { hubspotDealId: "513590817012" });
  });

  it("coerces durationMinutes from strings", () => {
    const args = callArgs({ durationMinutes: "45" });
    assert.equal(args?.durationMinutes, 45);
  });
});
