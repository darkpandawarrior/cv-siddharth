import { describe, expect, it } from "vitest";
import { isPlausibleCloudPct, isPlausibleTempC, isPlausibleTimestamp } from "./plausibility.ts";

describe("isPlausibleTempC", () => {
  it("rejects 60 C — well outside Pune's real range", () => {
    expect(isPlausibleTempC(60)).toBe(false);
  });
  it("accepts the boundaries and the 2026-09-24 fixture reading", () => {
    expect(isPlausibleTempC(5)).toBe(true);
    expect(isPlausibleTempC(45)).toBe(true);
    expect(isPlausibleTempC(22.9)).toBe(true);
  });
});

describe("isPlausibleCloudPct", () => {
  it("rejects 120% — cloud cover cannot exceed 100", () => {
    expect(isPlausibleCloudPct(120)).toBe(false);
  });
  it("accepts the boundaries and the 2026-09-24 fixture's 97%", () => {
    expect(isPlausibleCloudPct(0)).toBe(true);
    expect(isPlausibleCloudPct(100)).toBe(true);
    expect(isPlausibleCloudPct(97)).toBe(true);
  });
});

describe("isPlausibleTimestamp", () => {
  const now = new Date("2026-09-24T12:27:00+05:30");
  it("rejects a timestamp one hour in the future", () => {
    expect(isPlausibleTimestamp("2026-09-24T13:27:00+05:30", now)).toBe(false);
  });
  it("accepts the fixture's own 03:30 reading, well before now", () => {
    expect(isPlausibleTimestamp("2026-09-24T03:30", now)).toBe(true);
  });
});
