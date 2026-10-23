import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapRowToNotionProperties, normalizeSentiment } from "./notionMap.js";
import type { RetellSessionRow } from "../types/supabase.js";

function row(overrides: Partial<RetellSessionRow> = {}): RetellSessionRow {
  return {
    session_id: "call_123",
    session_time: "2026-10-07T10:30:00.000Z",
    duration_seconds: 95,
    cost: 42,
    session_status: "ended",
    session_outcome: "tour_booked",
    user_sentiment: "positive",
    direction: "outbound",
    hubspot_contact_name: "Ada Lovelace",
    hubspot_contact_email: "ada@example.com",
    hubspot_contact_phone: "+34 612 345 678",
    hubspot_deal_name: "Carabanchel",
    hubspot_deal_stage: "Contacted",
    agent_name: "Cara",
    recording_url: "https://example.com/recording",
    public_log_url: "https://example.com/log",
    transcript: "hello",
    transcript_with_tool_calls: "agent: booked",
    latest_total_price: 1000,
    updated_at: "2026-10-07T11:00:00.000Z",
    ...overrides,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

describe("mapRowToNotionProperties", () => {
  it("keeps cost in cents and maps the live database fields", () => {
    const properties = mapRowToNotionProperties(row());
    const sentiment = asRecord(asRecord(properties.Sentiment).select);
    const outcome = asRecord(asRecord(properties.Outcome).select);
    const title = asRecord(asRecord(properties["Session ID"]).title);
    const firstTitle = asRecord(Array.isArray(title) ? title[0] : undefined);

    assert.equal(properties.Cost?.number, 42);
    assert.equal(properties["Duration (s)"]?.number, 95);
    assert.equal(sentiment.name, "Positive");
    assert.equal(outcome.name, "tour_booked");
    assert.equal(properties.Phone?.phone_number, "+34612345678");
    assert.equal(asRecord(firstTitle.text).content, "call_123");
    assert.ok(properties.call_transcript);
    assert.ok(properties.transcript_with_tool_calls);
  });

  it("omits null values and formula properties", () => {
    const properties = mapRowToNotionProperties(
      row({
        session_outcome: null,
        user_sentiment: null,
        hubspot_contact_email: "not-an-email",
        hubspot_contact_phone: "call me",
        recording_url: null,
        transcript: null,
        transcript_with_tool_calls: null,
      })
    );

    assert.equal(properties.Outcome, undefined);
    assert.equal(properties.Sentiment, undefined);
    assert.equal(properties.Email, undefined);
    assert.equal(properties.Phone, undefined);
    assert.equal(properties.Recording, undefined);
    assert.equal(properties.call_transcript, undefined);
    assert.equal("Cost (€)" in properties, false);
    assert.equal("Talk minutes" in properties, false);
    assert.equal("Country" in properties, false);
    assert.equal("Week (Sat start)" in properties, false);
  });

  it("passes unknown select values through", () => {
    const properties = mapRowToNotionProperties(row({ session_outcome: "new_outcome" }));
    assert.equal(asRecord(asRecord(properties.Outcome).select).name, "new_outcome");
    assert.equal(normalizeSentiment("Negative"), "Negative");
  });
});
