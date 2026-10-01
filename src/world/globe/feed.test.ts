import { describe, it, expect, beforeEach } from "vitest";
import { useFeedStore, publish, formatRelative, minuteBucket, bucketLabel, type FeedItem } from "./feed.ts";

function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "quake:test",
    kind: "quake",
    title: "M5.0 Test Trench",
    detail: "10 km deep",
    whenMs: 1_000,
    source: "USGS",
    live: true,
    severity: "warn",
    ...over,
  };
}

beforeEach(() => {
  useFeedStore.getState().clear();
});

describe("publish", () => {
  it("adds a new item to the front (newest first)", () => {
    publish(item({ id: "a", whenMs: 1 }));
    publish(item({ id: "b", whenMs: 2 }));
    expect(useFeedStore.getState().items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("de-dupes by id — a publisher re-announcing the same occurrence is a no-op", () => {
    publish(item({ id: "a", detail: "first" }));
    publish(item({ id: "a", detail: "second" })); // same id, different payload
    const items = useFeedStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].detail).toBe("first"); // first announcement wins
  });

  it("caps the ring buffer at 200, dropping the oldest", () => {
    for (let i = 0; i < 205; i++) publish(item({ id: `q${i}`, whenMs: i }));
    const items = useFeedStore.getState().items;
    expect(items).toHaveLength(200);
    expect(items[0].id).toBe("q204"); // newest survives
    expect(items.at(-1)?.id).toBe("q5"); // the oldest 5 fell off
  });
});

describe("formatRelative", () => {
  it("reads 'just now' inside 5s", () => {
    expect(formatRelative(1000, 1000)).toBe("just now");
    expect(formatRelative(1000, 4000)).toBe("just now");
  });
  it("reads seconds, then minutes, then hours, then days", () => {
    expect(formatRelative(0, 30_000)).toBe("30s ago");
    expect(formatRelative(0, 5 * 60_000)).toBe("5m ago");
    expect(formatRelative(0, 3 * 3_600_000)).toBe("3h ago");
    expect(formatRelative(0, 2 * 86_400_000)).toBe("2d ago");
  });
  it("reads a future whenMs (an upcoming launch) as 'in X', never clamped to 'ago'", () => {
    // Regression: visual QA caught every upcoming launch reading "just now"
    // before this branch existed (the old code clamped a negative delta to
    // zero) -- an honest future timestamp is "in 5h", not a fabricated past one.
    expect(formatRelative(3_000, 0)).toBe("just now");
    expect(formatRelative(5 * 60_000, 0)).toBe("in 5m");
    expect(formatRelative(3 * 3_600_000, 0)).toBe("in 3h");
  });
});

describe("minuteBucket", () => {
  it("groups two whenMs values in the same minute", () => {
    expect(minuteBucket(60_000)).toBe(minuteBucket(60_000 + 59_000));
    expect(minuteBucket(60_000)).not.toBe(minuteBucket(120_000));
  });
});

describe("bucketLabel", () => {
  it("is a non-empty clock string", () => {
    expect(bucketLabel(Date.parse("2026-09-29T10:32:00Z")).length).toBeGreaterThan(0);
  });

  // Visual QA caught two rows 105 days apart sharing an identical bare
  // "05:30 AM" header -- a same-time-of-day coincidence across days that
  // reads as time going backwards. A whenMs on a different calendar day
  // from nowMs must carry a date so the two never collide.
  it("disambiguates a bucket that falls on a different day than now", () => {
    const now = Date.parse("2026-09-29T10:32:00Z");
    const longAgo = Date.parse("2026-06-16T10:32:00Z"); // 105 days earlier, same clock time
    const today = bucketLabel(now, now);
    const old = bucketLabel(longAgo, now);
    expect(old).not.toBe(today);
    expect(old).toMatch(/Jun/);
  });
});
