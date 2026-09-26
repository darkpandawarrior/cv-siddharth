import { describe, expect, it } from "vitest";
import { NIGHT_SUN_POS, worldLighting } from "./skyBinding.ts";
import { skyState } from "../lib/sky.ts";
import {
  NIGHT_HEMI_GROUND_HEX,
  NIGHT_HEMI_INTENSITY,
  NIGHT_HEMI_SKY_HEX,
  NIGHT_HORIZON_HEX,
  NIGHT_SUN_INTENSITY,
  NIGHT_SURVEY,
  NIGHT_ZENITH_HEX,
} from "../lib/nightSurvey.ts";

// The same deep-night instant every other Night Survey test in this repo
// uses (sky.test.ts, world-reality.spec.ts): 2026-09-24T03:15 IST, sun
// altitude well below sky.ts's -18deg night breakpoint.
const NIGHT = new Date("2026-09-24T03:15:00+05:30");
// Solar noon-ish, comfortably above the golden-hour breakpoint — used only
// to prove the day branch does NOT fall back to the night rig position.
const NOON = new Date("2026-09-24T12:27:00+05:30");

describe("worldLighting at night", () => {
  it("deep-equals today's Night Survey constants, exactly, on every tier", () => {
    const s = skyState(NIGHT, null);
    for (const tier of [1, 2, 3] as const) {
      const lighting = worldLighting(s, tier);
      expect(lighting.sunPos).toStrictEqual(NIGHT_SUN_POS);
      expect(lighting.sunColor).toStrictEqual(NIGHT_SURVEY.sun);
      expect(lighting.sunI).toBe(NIGHT_SUN_INTENSITY);
      expect(lighting.hemi).toStrictEqual([NIGHT_HEMI_SKY_HEX, NIGHT_HEMI_GROUND_HEX, NIGHT_HEMI_INTENSITY]);
      expect(lighting.zenith).toBe(NIGHT_ZENITH_HEX);
      expect(lighting.horizon).toBe(NIGHT_HORIZON_HEX);
    }
  });

  it("is byte-for-byte the same position object sky.ts's own keyframe pins, never a trig near-miss", () => {
    // Verified via a deep altitude, not just the exact -18deg edge, since
    // keyframeAt never extrapolates past its first breakpoint (sky.ts's own
    // comment) — every altitude at or below it carries the identical row.
    const deepNight = skyState(new Date("2026-09-24T02:00:00+05:30"), null);
    expect(worldLighting(deepNight, 1).sunPos).toStrictEqual([-122, 28, 18]);
  });
});

describe("worldLighting in daylight", () => {
  it("does not use the night rig position once the sun is up", () => {
    const s = skyState(NOON, null);
    const lighting = worldLighting(s, 1);
    expect(lighting.sunPos).not.toStrictEqual(NIGHT_SUN_POS);
    // Local noon in Pune sits the sun to the sky's south — the key light's
    // north/south (-Z/+Z) component should read positive (south) rather
    // than the night rig's own negative-x/positive-z corner.
    expect(lighting.sunI).toBeGreaterThan(NIGHT_SUN_INTENSITY);
  });

  it("keeps the light's throw at the night rig's own distance from origin", () => {
    const s = skyState(NOON, null);
    const [x, y, z] = worldLighting(s, 1).sunPos;
    const radius = Math.hypot(x, y, z);
    const nightRadius = Math.hypot(...NIGHT_SUN_POS);
    expect(radius).toBeCloseTo(nightRadius, 5);
  });
});

describe("worldLighting's fog", () => {
  it("tightens to whichever of the sky keyframe or the device tier pulls it in furthest", () => {
    const s = skyState(NOON, null);
    const desktop = worldLighting(s, 1).fog;
    const throttled = worldLighting(s, 3).fog;
    // Tier 3's own budget (deviceTier.ts) is tighter than the day
    // keyframe's atmospheric range, so it wins on a throttled device.
    expect(throttled[1]).toBeLessThan(desktop[1]);
    expect(throttled[0]).toBeGreaterThanOrEqual(desktop[0]);
  });

  it("never widens the sky keyframe's own range past the tier budget", () => {
    const s = skyState(NIGHT, null);
    const [, far] = worldLighting(s, 1).fog;
    expect(far).toBeLessThanOrEqual(NIGHT_SURVEY.fogFar);
  });
});
