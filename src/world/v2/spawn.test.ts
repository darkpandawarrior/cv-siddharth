import { describe, expect, it } from "vitest";
import { daypartFor, sunPosition, sunTimes } from "../../lib/sky.ts";
import { spawnPose } from "./spawn.ts";

const DAY = "2026-09-24";

function sunAt(hhmm: string) {
  const d = new Date(`${DAY}T${hhmm}:00+05:30`);
  const sun = sunPosition(d);
  const times = sunTimes(d);
  const morning = d.getTime() < times.solarNoon.getTime();
  return { sun, daypart: daypartFor(sun.altitudeDeg, morning) };
}

describe("spawnPose pins facing at the reality-spec fixture times (2026-09-24)", () => {
  it("03:15 -> night -> sangam", () => {
    const { sun, daypart } = sunAt("03:15");
    expect(daypart).toBe("night");
    expect(spawnPose(daypart, sun.azimuthDeg).facing).toBe("sangam");
  });

  it("06:24 -> dawn -> downstream", () => {
    const { sun, daypart } = sunAt("06:24");
    expect(daypart).toBe("dawn");
    expect(spawnPose(daypart, sun.azimuthDeg).facing).toBe("downstream");
  });

  it("12:27 -> day -> downstream (either side of solar noon, day is always downstream)", () => {
    const { sun, daypart } = sunAt("12:27");
    expect(daypart).toBe("day");
    expect(spawnPose(daypart, sun.azimuthDeg).facing).toBe("downstream");
  });

  it("18:30 -> dusk -> upstream", () => {
    const { sun, daypart } = sunAt("18:30");
    expect(daypart).toBe("dusk");
    expect(spawnPose(daypart, sun.azimuthDeg).facing).toBe("upstream");
  });
});

describe("spawnPose disambiguates golden by sunAzDeg (the one daypart that happens twice a day)", () => {
  it("golden in the morning (sun still rising) -> downstream", () => {
    const { sun, daypart } = sunAt("06:40");
    expect(daypart).toBe("golden");
    expect(spawnPose(daypart, sun.azimuthDeg).facing).toBe("downstream");
  });

  it("golden in the evening (sun past the meridian) -> upstream", () => {
    const { sun, daypart } = sunAt("18:10");
    expect(daypart).toBe("golden");
    expect(spawnPose(daypart, sun.azimuthDeg).facing).toBe("upstream");
  });
});

describe("spawnPose returns a finite, non-degenerate pose for every branch", () => {
  for (const [daypart, az] of [
    ["night", 71] as const,
    ["dawn", 90] as const,
    ["day", 180] as const,
    ["dusk", 270] as const,
    ["golden", 90] as const,
    ["golden", 270] as const,
  ]) {
    it(`${daypart} @ az=${az}`, () => {
      const pose = spawnPose(daypart, az);
      expect(pose.pos.every(Number.isFinite)).toBe(true);
      expect(pose.look.every(Number.isFinite)).toBe(true);
      expect(pose.pos).not.toEqual(pose.look);
    });
  }
});
