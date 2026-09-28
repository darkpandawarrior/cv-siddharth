import { describe, expect, it } from "vitest";
import { sliderToOffset, offsetToSlider, snapStepMinutes, snapOffset, labelOffset, MIN_OFFSET_MIN, MAX_OFFSET_MIN } from "./index.ts";

describe("time range", () => {
  it("pins endpoints and reserves finer resolution near now", () => {
    expect([-1, -0.75, -0.5, 0, 0.5, 1].map(sliderToOffset)).toEqual([MIN_OFFSET_MIN, -4320, -360, 0, 360, MAX_OFFSET_MIN]);
    expect(sliderToOffset(0.001)).toBeLessThan(1);
    expect(sliderToOffset(-0.001)).toBeGreaterThan(-1);
  });
  it("round trips 2001 slider positions monotonically", () => {
    let previous = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const p = (i - 1000) / 1000;
      const offset = sliderToOffset(p);
      expect(offset).toBeGreaterThan(previous);
      expect(offsetToSlider(offset)).toBeCloseTo(p, 12);
      previous = offset;
    }
  });
  it("round trips minutes throughout the whole horizon and at knots", () => {
    for (let m = MIN_OFFSET_MIN; m <= MAX_OFFSET_MIN; m += 7.5) expect(sliderToOffset(offsetToSlider(m))).toBeCloseTo(m, 8);
    for (const m of [-4320.001, -4320, -4319.999, -360.001, -360, -359.999, 0, 359.999, 360, 360.001]) {
      expect(sliderToOffset(offsetToSlider(m))).toBeCloseTo(m, 8);
    }
  });
  it("clamps finite overshoots and rejects nonfinite clocks", () => {
    expect(sliderToOffset(-2)).toBe(MIN_OFFSET_MIN);
    expect(sliderToOffset(2)).toBe(MAX_OFFSET_MIN);
    expect(offsetToSlider(-100000)).toBe(-1);
    expect(offsetToSlider(100000)).toBe(1);
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const fn of [sliderToOffset, offsetToSlider, snapOffset, snapStepMinutes]) expect(() => fn(bad)).toThrow(RangeError);
      expect(() => labelOffset(0, bad)).toThrow(RangeError);
    }
  });
  it("snaps symmetric ties and respects distance thresholds", () => {
    expect([0, 360, 360.01, 4320, 4320.01].map(snapStepMinutes)).toEqual([15, 15, 60, 60, 1440]);
    expect([7.5, -7.5, 389, -390, -5000, -50000, 50000].map(snapOffset)).toEqual([15, -15, 360, -420, -4320, -43200, 2880]);
    expect(Object.is(snapOffset(-1), -0)).toBe(false);
  });
  it("labels real calendar days in UTC without em dashes", () => {
    const now = Date.UTC(2026, 8, 28, 14);
    const offsets = [0, -5, 5, -360, 360, -1440, 1440, -12 * 1440, 2880, -600, -2880];
    const labels = offsets.map((m) => labelOffset(m, now));
    expect(labels).toEqual(["now", "5 min ago", "in 5 min", "6 h ago", "in 6 h", "yesterday 14:00", "tomorrow 14:00", "12 days ago", "in 2 days", "10 h ago", "2 days ago"]);
    expect(labels.join()).not.toContain("\u2014");
    expect(labelOffset(-420, Date.UTC(2026, 0, 1, 2))).toBe("yesterday 19:00");
  });
});
