import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { waterBedGain } from "../audio.ts";
import { riverDischargeIst } from "./live/liveBinding.ts";
import type { River } from "../../lib/sky.ts";

const fixture = (name: string): River => JSON.parse(readFileSync(new URL(`../../../e2e/fixtures/${name}`, import.meta.url), "utf8")).river;

describe("S6 water bed", () => {
  it.each(["weather-2026-09-24.json", "weather-wet-2026-09-24.json"])("matches the normalised gain for %s", (name) => {
    const river = fixture(name);
    const [min, max] = river.range7d;
    const discharge = riverDischargeIst(new Date("2026-09-24T12:27:00+05:30"), river);
    expect(waterBedGain(discharge, river.range7d)).toBeCloseTo(0.025 + 0.075 * (river.dischargeM3s - min) / (max - min), 12);
  });

  it("clamps the range and keeps missing or invalid readings silent", () => {
    expect(waterBedGain(0, [10, 20])).toBe(0.025);
    expect(waterBedGain(30, [10, 20])).toBe(0.1);
    expect(waterBedGain(10, [10, 10])).toBe(0.025);
    for (const discharge of [null, NaN, Infinity, -1]) expect(waterBedGain(discharge, [10, 20])).toBe(0);
    expect(waterBedGain(15, null)).toBe(0);
    expect(waterBedGain(15, [20, 10])).toBe(0);
    expect(waterBedGain(15, [NaN, 20])).toBe(0);
  });
});
