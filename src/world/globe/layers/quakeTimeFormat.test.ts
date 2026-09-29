import { describe, it, expect } from "vitest";
import { formatQuakeTime } from "./quakeTimeFormat.ts";

describe("formatQuakeTime (data.md #3: relative age needs an absolute pair)", () => {
  it("pairs the relative age with an absolute UTC clock reading", () => {
    const eventMs = Date.parse("2026-09-30T19:16:00Z");
    const nowMs = eventMs + 3 * 60_000;
    expect(formatQuakeTime(nowMs, eventMs)).toBe("3 min ago · 19:16 UTC");
  });

  it("still pairs an absolute time for an older quake ('N hr ago')", () => {
    const eventMs = Date.parse("2026-09-30T02:00:00Z");
    const nowMs = Date.parse("2026-09-30T04:00:00Z");
    expect(formatQuakeTime(nowMs, eventMs)).toBe("2 hr ago · 02:00 UTC");
  });
});
