import { describe, expect, test } from "vitest";
import { sangamKeyframeAt, SANGAM_NIGHT_ROW, SANGAM_GOLDEN_ROW, SANGAM_BLUE_ROW, SANGAM_DAY_ROW } from "./sangamSky.ts";
import { NIGHT_SURVEY } from "../../../lib/nightSurvey.ts";

describe("sangamKeyframeAt — night row (M48: Night Survey, byte for byte)", () => {
  test("sangamKeyframeAt(-30) deep-equals SANGAM_NIGHT_ROW", () => {
    expect(sangamKeyframeAt(-30)).toEqual(SANGAM_NIGHT_ROW);
  });

  test("clamps at the -12° breakpoint, not just below it", () => {
    expect(sangamKeyframeAt(-12)).toEqual(SANGAM_NIGHT_ROW);
  });

  test("every SANGAM_NIGHT_ROW colour is Night Survey's own byte value, not a restated one", () => {
    // sun/sunI/lamp carry over 1:1 from NIGHT_SURVEY (v1's Keyframe); the
    // other three colours are decoded from the SAME hex constants
    // nightSurvey.ts exports, so this can never silently drift from the one
    // file both v1 and v2 read.
    expect(SANGAM_NIGHT_ROW.uSunCol).toEqual(NIGHT_SURVEY.sun);
    expect(SANGAM_NIGHT_ROW.sunI).toBe(NIGHT_SURVEY.sunI);
    expect(SANGAM_NIGHT_ROW.lamp).toBe(NIGHT_SURVEY.lamp);
  });
});

describe("sangamKeyframeAt — golden row (v2 §7 literals exactly)", () => {
  test("sangamKeyframeAt(8) deep-equals the v2 §7 literals", () => {
    expect(sangamKeyframeAt(8)).toEqual({
      uSkyZen: [0.1, 0.17, 0.29],
      uSkyUp: [0.3, 0.38, 0.44],
      uHorizonGlow: [1.0, 0.58, 0.26],
      uHaze: [0.86, 0.62, 0.38],
      uSunCol: [1.0, 0.74, 0.46],
      sunI: SANGAM_GOLDEN_ROW.sunI,
      lamp: SANGAM_GOLDEN_ROW.lamp,
    });
  });

  test("clamps at the +30° breakpoint into the day row", () => {
    expect(sangamKeyframeAt(30)).toEqual(SANGAM_DAY_ROW);
    expect(sangamKeyframeAt(90)).toEqual(SANGAM_DAY_ROW);
  });
});

describe("sangamKeyframeAt — lerp between rows", () => {
  test("halfway between blue (-3) and golden (8) lerps every field", () => {
    const mid = sangamKeyframeAt(2.5); // t = 0.5
    expect(mid.uSkyZen[0]).toBeCloseTo((SANGAM_BLUE_ROW.uSkyZen[0] + SANGAM_GOLDEN_ROW.uSkyZen[0]) / 2, 10);
    expect(mid.sunI).toBeCloseTo((SANGAM_BLUE_ROW.sunI + SANGAM_GOLDEN_ROW.sunI) / 2, 10);
  });

  test("never extrapolates below night or above day", () => {
    expect(sangamKeyframeAt(-90)).toEqual(SANGAM_NIGHT_ROW);
    expect(sangamKeyframeAt(89)).toEqual(SANGAM_DAY_ROW);
  });
});
