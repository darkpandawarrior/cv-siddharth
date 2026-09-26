import { describe, it, expect } from "vitest";
import { moonPhase, moonPosition } from "./moon.ts";

// USNO oracle values recorded 2026-09-24 (live-data-spec.md#4 R6): fraction
// 0.94 waxing at 12:00 IST; USNO moonrise 16:59 IST, so altitude is negative
// shortly before and positive shortly after; 2026-09-26 22:19 IST reads full
// (fraction >= 0.99). USNO is never called at runtime — only these three
// recorded readings are test oracles.
const IST = (s: string) => new Date(`2026-09-24T${s}+05:30`);

describe("moonPhase", () => {
  it("reads 0.94 +/- 0.03 waxing at 2026-09-24 12:00 IST", () => {
    const { fraction, waxing } = moonPhase(IST("12:00:00"));
    expect(Math.abs(fraction - 0.94)).toBeLessThanOrEqual(0.03);
    expect(waxing).toBe(true);
  });

  it("reads >= 0.99 (full) at 2026-09-26 22:19 IST", () => {
    const { fraction } = moonPhase(new Date("2026-09-26T22:19:00+05:30"));
    expect(fraction).toBeGreaterThanOrEqual(0.99);
  });
});

describe("moonPosition", () => {
  it("is below the horizon at 16:40 IST and above it at 17:20 IST (USNO rise 16:59)", () => {
    expect(moonPosition(IST("16:40:00")).altitudeDeg).toBeLessThan(0);
    expect(moonPosition(IST("17:20:00")).altitudeDeg).toBeGreaterThan(0);
  });
});
