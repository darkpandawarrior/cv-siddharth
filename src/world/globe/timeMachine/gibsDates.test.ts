import { expect, it } from "vitest";
import { dayImageryAttempts, VIIRS_TRUE_COLOR } from "../layers/gibs.ts";
import { createGibsTimeline } from "./index.ts";

it("plans 7/3/0 real VIIRS URLs, newest first at 1024x512", () => {
  const now = new Date("2026-09-28T02:00:00+05:30");
  for (const tier of [1, 2, 3] as const) {
    const { frames } = createGibsTimeline(now, tier);
    expect(frames.length).toBe(tier === 1 ? 7 : tier === 2 ? 3 : 0);
    frames.forEach((frame, i) => {
      const params = new URL(frame.url).searchParams;
      expect(params.get("WIDTH")).toBe("1024");
      expect(params.get("HEIGHT")).toBe("512");
      expect(params.get("LAYERS")).toBe(VIIRS_TRUE_COLOR);
      expect(params.get("TIME")).toBe(frame.date);
      expect(frame.timeMs).toBe(Date.UTC(2026, 8, 26 - i));
    });
    if (frames.length) expect(frames[0].url).toBe(dayImageryAttempts(now, { width: 1024, height: 512 })[0].url);
  }
});

it("crossfades daily frames across UTC midnight, including leap day", () => {
  const timeline = createGibsTimeline(new Date("2024-03-02T12:00:00Z"), 2);
  expect(timeline.frames.map((f) => f.date)).toEqual(["2024-03-01", "2024-02-29", "2024-02-28"]);
  expect(timeline.frameForTime(Date.parse("2024-03-01T00:00:00Z"))).toEqual({ older: 1, newer: 1, blend: 0 });
  expect(timeline.frameForTime(Date.parse("2024-03-01T06:00:00Z"))).toEqual({ older: 1, newer: 0, blend: 0.25 });
  expect(timeline.frameForTime(Date.parse("2024-03-01T12:00:00Z"))).toEqual({ older: 1, newer: 0, blend: 0.5 });
  expect(timeline.frameForTime(Date.parse("2024-03-02T00:00:00Z"))).toEqual({ older: 0, newer: 0, blend: 0 });
  // Weighted timestamps check continuity without depending on index identity.
  for (const delta of [-1, 0, 1]) {
    const t = Date.parse("2024-03-01T00:00:00Z") + delta;
    const f = timeline.frameForTime(t)!;
    expect(timeline.frames[f.older].timeMs * (1 - f.blend) + timeline.frames[f.newer].timeMs * f.blend).toBeCloseTo(t - 86400000, 2);
  }
});

it("clamps window endpoints, reuses results and handles T3/invalid clocks", () => {
  const timeline = createGibsTimeline(new Date("2026-01-02Z"), 1);
  expect(timeline.frames[1].date).toBe("2025-12-31");
  const first = timeline.frameForTime(0);
  expect(first).toEqual({ older: 6, newer: 6, blend: 0 });
  expect(timeline.frameForTime(Date.UTC(2030, 0, 1))).toBe(first);
  expect(first).toEqual({ older: 0, newer: 0, blend: 0 });
  expect(timeline.frameForTime(NaN)).toBeNull();
  expect(createGibsTimeline(new Date(), 3).frameForTime(0)).toBeNull();
  expect(() => createGibsTimeline(new Date(NaN), 1)).toThrow(RangeError);
});
