import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDays, todayDateOnly } from "./dateUtils.js";
import {
  checkRoomSelectability,
  isRoomEnabledForSelectedStay,
  isTwoPeopleAllowedForRoom,
  listSelectableRoomTypes,
  validateStayDates,
} from "./reservarSelectability.js";

function futureCheckIn(daysAhead: number): string {
  return addDays(todayDateOnly(), daysAhead);
}

describe("validateStayDates", () => {
  it("rejects check-in within 4-day buffer", () => {
    const checkIn = futureCheckIn(2);
    const checkOut = addDays(checkIn, 30);
    const result = validateStayDates(checkIn, checkOut);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /at least 4 days/);
    }
  });

  it("rejects stays shorter than 30 nights", () => {
    const checkIn = futureCheckIn(10);
    const checkOut = addDays(checkIn, 29);
    const result = validateStayDates(checkIn, checkOut);
    assert.equal(result.ok, false);
  });

  it("accepts 30-night stay", () => {
    const checkIn = futureCheckIn(10);
    const checkOut = addDays(checkIn, 30);
    const result = validateStayDates(checkIn, checkOut);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.nights, 30);
  });

  it("accepts 363-night stay", () => {
    const checkIn = futureCheckIn(10);
    const checkOut = addDays(checkIn, 363);
    const result = validateStayDates(checkIn, checkOut);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.nights, 363);
  });

  it("rejects 364-night stay", () => {
    const checkIn = futureCheckIn(10);
    const checkOut = addDays(checkIn, 364);
    const result = validateStayDates(checkIn, checkOut);
    assert.equal(result.ok, false);
  });
});

describe("isRoomEnabledForSelectedStay", () => {
  it("rejects the-standard for 92 nights", () => {
    const checkIn = "2026-08-01";
    const checkOut = "2026-11-01";
    const result = isRoomEnabledForSelectedStay("the-standard", 92, checkIn, checkOut);
    assert.equal(result.selectable, false);
    assert.match(result.reason ?? "", /180/);
  });

  it("accepts the-standard for 180 nights", () => {
    const checkIn = futureCheckIn(10);
    const checkOut = addDays(checkIn, 180);
    const result = isRoomEnabledForSelectedStay(
      "the-standard",
      180,
      checkIn,
      checkOut
    );
    assert.equal(result.selectable, true);
  });

  it("rejects the-two-bedroom-2-1 outside summer window", () => {
    const result = isRoomEnabledForSelectedStay(
      "the-two-bedroom-2-1",
      92,
      "2026-08-01",
      "2026-11-01"
    );
    assert.equal(result.selectable, false);
    assert.match(result.reason ?? "", /June 1 to August 31/);
  });

  it("accepts the-two-bedroom-2-1 within summer window", () => {
    const result = isRoomEnabledForSelectedStay(
      "the-two-bedroom-2-1",
      60,
      "2026-06-15",
      "2026-08-15"
    );
    assert.equal(result.selectable, true);
  });

  it("never selects the-rooftop", () => {
    const checkIn = futureCheckIn(10);
    const checkOut = addDays(checkIn, 60);
    const result = isRoomEnabledForSelectedStay("the-rooftop", 60, checkIn, checkOut);
    assert.equal(result.selectable, false);
  });
});

describe("isTwoPeopleAllowedForRoom", () => {
  it("rejects two guests for the-standard", () => {
    assert.equal(isTwoPeopleAllowedForRoom("the-standard"), false);
  });

  it("allows two guests for the-comfort", () => {
    assert.equal(isTwoPeopleAllowedForRoom("the-comfort"), true);
  });
});

describe("listSelectableRoomTypes", () => {
  it("marks the-standard not selectable for 92-night summer stay", () => {
    const rooms = listSelectableRoomTypes("2026-08-01", "2026-11-01");
    const standard = rooms.find((r) => r.slug === "the-standard");
    assert.ok(standard);
    assert.equal(standard.selectable, false);
  });

  it("marks the-comfort selectable for 92-night stay with valid check-in buffer", () => {
    const checkIn = futureCheckIn(10);
    const checkOut = addDays(checkIn, 92);
    const rooms = listSelectableRoomTypes(checkIn, checkOut);
    const comfort = rooms.find((r) => r.slug === "the-comfort");
    assert.ok(comfort);
    assert.equal(comfort.selectable, true);
  });
});

describe("checkRoomSelectability", () => {
  it("rejects the-standard for Aug-Nov 2026 without calling Episode", () => {
    const result = checkRoomSelectability("the-standard", "2026-08-01", "2026-11-01");
    assert.equal(result.selectableOnWebsite, false);
    assert.equal(result.nights, 92);
  });
});
