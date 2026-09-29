import { describe, it, expect } from "vitest";
import { cumulativeFraction, scaleForYear, hourHistogram } from "./guideActivity.ts";

// Same MIN/MAX_SCALE-shaped curve GuideLayer.tsx's own `scaleFor` uses, kept
// local to this test so it doesn't have to import the .tsx component file.
function scaleFor(reviews: number, photos: number): number {
  return Math.min(0.2, Math.max(0.07, Math.sqrt(reviews + photos) * 0.035));
}

describe("cumulativeFraction", () => {
  it("is 0 for a place with no recorded years", () => {
    expect(cumulativeFraction([], 2026)).toBe(0);
  });

  it("is 0 before the place's first recorded year", () => {
    // Bhopal per mapsPlaces.ts: [2017, 2018, 2019, 2022]
    expect(cumulativeFraction([2017, 2018, 2019, 2022], 2016)).toBe(0);
  });

  it("grows as the scrub year passes recorded years, one at a time", () => {
    const years = [2017, 2018, 2019, 2022];
    expect(cumulativeFraction(years, 2017)).toBe(0.25);
    expect(cumulativeFraction(years, 2018)).toBe(0.5);
    expect(cumulativeFraction(years, 2019)).toBe(0.75);
    expect(cumulativeFraction(years, 2021)).toBe(0.75); // no activity recorded in 2020/2021
  });

  it("is 1 once the scrub year reaches (or passes) the last recorded year", () => {
    const years = [2017, 2018, 2019, 2022];
    expect(cumulativeFraction(years, 2022)).toBe(1);
    expect(cumulativeFraction(years, 2026)).toBe(1);
  });
});

describe("scaleForYear", () => {
  it("is 0 before any recorded activity, never the lifetime-total floor", () => {
    // scaleFor's own MIN_SCALE floor (0.07) would otherwise leak through a
    // fraction-of-zero place and draw a ring for a year with no activity.
    expect(scaleForYear(scaleFor, 18, 9, [2017, 2018, 2019, 2022], 2016)).toBe(0);
  });

  it("equals the lifetime scale once every recorded year is reached", () => {
    const years = [2017, 2018, 2019, 2022];
    const lifetime = scaleForYear(scaleFor, 18, 9, years, 2022);
    expect(scaleForYear(scaleFor, 18, 9, years, 2030)).toBe(lifetime);
    expect(lifetime).toBeGreaterThan(0);
  });

  it("is monotonically non-decreasing as the scrub year advances", () => {
    const years = [2017, 2019, 2020, 2024];
    let prev = 0;
    for (let y = 2016; y <= 2025; y++) {
      const s = scaleForYear(scaleFor, 9, 16, years, y);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe("hourHistogram", () => {
  it("excludes invalid timestamps before applying the minimum-event gate", () => {
    const valid = new Array(4).fill({ at: "2026-09-28T01:00:00Z" });
    expect(hourHistogram([...valid, { at: "invalid" }])).toBeNull();
    const histogram = hourHistogram([...valid, valid[0], { at: "invalid" }])!;
    expect(histogram.reduce((a, b) => a + b, 0)).toBe(5);
  });
  it("returns null when there are fewer than 5 events (the honesty gate)", () => {
    expect(hourHistogram(undefined)).toBeNull();
    expect(hourHistogram([])).toBeNull();
    const four = ["2026-09-28T01:00:00Z", "2026-09-28T02:00:00Z", "2026-09-28T03:00:00Z", "2026-09-28T04:00:00Z"].map((at) => ({ at }));
    expect(hourHistogram(four)).toBeNull();
  });

  it("buckets at least 5 events into 24 IST hours summing to the event count", () => {
    const items = [
      "2026-09-28T01:00:00Z",
      "2026-09-28T02:00:00Z",
      "2026-09-28T03:00:00Z",
      "2026-09-28T04:00:00Z",
      "2026-09-28T05:00:00Z",
    ].map((at) => ({ at }));
    const hist = hourHistogram(items);
    expect(hist).not.toBeNull();
    expect(hist).toHaveLength(24);
    expect(hist!.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("converts UTC to Asia/Kolkata (+05:30) before bucketing, not a raw UTC hour", () => {
    // 18:30 UTC is 00:00 IST the next day; 5 identical timestamps should all
    // land in the same IST hour bucket, not the UTC one.
    const items = new Array(5).fill(null).map(() => ({ at: "2026-09-27T18:30:00Z" }));
    const hist = hourHistogram(items)!;
    expect(hist[0]).toBe(5); // IST hour 0
    expect(hist[18]).toBe(0); // NOT the UTC hour
  });
});
