import { describe, it, expect } from "vitest";
import { recentGrowth } from "../data/profile.ts";
import { monthKey, shippedNewestFirst } from "./shipped.ts";

/**
 * The bug this replaced was silent: a positional `.slice(-4)` looked right
 * for as long as the authored order happened to match the dates, then quietly
 * dropped the newest entry when it stopped. Nothing rendered wrong, it just
 * rendered old.
 */
describe("shippedNewestFirst", () => {
  it("keeps every entry", () => {
    expect(shippedNewestFirst).toHaveLength(recentGrowth.length);
  });

  it("leads with the latest-dated entry", () => {
    const newest = Math.max(...recentGrowth.map((g) => monthKey(g.date)));
    expect(monthKey(shippedNewestFirst[0].date)).toBe(newest);
  });

  it("is monotonically non-increasing by date", () => {
    const keys = shippedNewestFirst.map((g) => monthKey(g.date));
    expect(keys.every((k, i) => i === 0 || keys[i - 1] >= k)).toBe(true);
  });

  it("reads a range date by its last month", () => {
    expect(monthKey("Jun–Aug 2026")).toBe(monthKey("Aug 2026"));
  });
});
