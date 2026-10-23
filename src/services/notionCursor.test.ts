import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextCursor,
  notionSyncLagMinutes,
  NOTION_SYNC_LAG_LIMIT_MINUTES,
} from "./notionCursor.js";

describe("nextCursor", () => {
  it("advances through successful rows in timestamp order", () => {
    const cursor = nextCursor("2026-10-01T00:00:00.000Z", [
      { updatedAt: "2026-10-02T00:00:00.000Z", ok: true },
      { updatedAt: "2026-10-03T00:00:00.000Z", ok: true },
    ]);

    assert.equal(cursor, "2026-10-03T00:00:00.000Z");
  });

  it("stops before a failed timestamp and does not jump over it", () => {
    const cursor = nextCursor("2026-10-01T00:00:00.000Z", [
      { updatedAt: "2026-10-02T00:00:00.000Z", ok: true },
      { updatedAt: "2026-10-03T00:00:00.000Z", ok: false },
      { updatedAt: "2026-10-04T00:00:00.000Z", ok: true },
    ]);

    assert.equal(cursor, "2026-10-02T00:00:00.000Z");
  });

  it("does not advance when any row in a shared timestamp failed", () => {
    const cursor = nextCursor("2026-10-01T00:00:00.000Z", [
      { updatedAt: "2026-10-02T00:00:00.000Z", ok: true },
      { updatedAt: "2026-10-02T00:00:00.000Z", ok: false },
    ]);

    assert.equal(cursor, "2026-10-01T00:00:00.000Z");
  });
});

describe("notionSyncLagMinutes", () => {
  it("is zero when the cursor has reached the latest row", () => {
    const lag = notionSyncLagMinutes({
      latestUpdatedAt: "2026-10-23T10:00:00.000Z",
      cursor: "2026-10-23T10:00:00.000Z",
      now: Date.parse("2026-10-23T12:00:00.000Z"),
    });

    assert.equal(lag, 0);
  });

  it("measures how far the cursor is behind the latest row", () => {
    const lag = notionSyncLagMinutes({
      latestUpdatedAt: "2026-10-23T11:00:00.000Z",
      cursor: "2026-10-23T10:00:00.000Z",
    });

    assert.equal(lag, 60);
    assert.ok(lag > NOTION_SYNC_LAG_LIMIT_MINUTES);
  });

  it("treats a missing cursor as the age of the oldest row", () => {
    const lag = notionSyncLagMinutes({
      latestUpdatedAt: "2026-10-23T12:00:00.000Z",
      oldestUpdatedAt: "2026-10-23T10:00:00.000Z",
      cursor: null,
      now: Date.parse("2026-10-23T12:30:00.000Z"),
    });

    assert.equal(lag, 150);
  });
});
