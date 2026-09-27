import { describe, expect, test } from "vitest";
import {
  STAR_MAG_CEILING,
  starMagLimit,
  effectiveStarMagLimit,
  starFieldAlpha,
  moonDiscVisible,
  issMarkerState,
  activeFestivalForm,
} from "./nightSky.ts";
import { moonPhase, moonPosition } from "../../../lib/moon.ts";
import { hazeBinding } from "./liveBinding.ts";

// e2e/fixtures/live/weather-clear-fullmoon.json's own readings, reused here
// rather than restated literals drifting from the fixture: pm25 18.4,
// 2026-09-26T22:30 IST (this lane's own acceptance clock).
const FULL_MOON_AT = new Date("2026-09-26T22:30:00+05:30");
const FULL_MOON_PM25 = 18.4;

describe("row 13 — starMagLimit / effectiveStarMagLimit", () => {
  test("full-moon clear fixture: the real moon at 22:30 IST pulls the limit below 5.0", () => {
    const moon = moonPhase(FULL_MOON_AT);
    const pos = moonPosition(FULL_MOON_AT);
    const limit = starMagLimit(FULL_MOON_PM25, moon.fraction, pos.altitudeDeg);
    expect(limit).toBeLessThan(5.0);
  });

  test("null pm25 (haze unavailable) + no moon above the horizon -> the bare 5.0 design ceiling", () => {
    expect(starMagLimit(null, 0, -10)).toBeCloseTo(5.0 - 1.5 * 0.5, 5); // hazeBinding(null).starDeltaM = 1.5*0.5
  });

  test("moon below the horizon contributes nothing regardless of fraction (ss(0,20,·) clamps to 0)", () => {
    // hazeBinding(0)'s own lower clamp (hazeN >= 0.15) is the only reduction
    // left once the moon term is zeroed — never a second, restated haze
    // formula here.
    expect(starMagLimit(0, 1, -5)).toBeCloseTo(5.0 - hazeBinding(0).starDeltaM, 10);
  });

  test("tiers draw to 5.0 / 4.5 / 4.0 — a raw limit at the design ceiling is still capped per tier", () => {
    expect(STAR_MAG_CEILING).toEqual({ 1: 5.0, 2: 4.5, 3: 4.0 });
    expect(effectiveStarMagLimit(5.0, 1)).toBe(5.0);
    expect(effectiveStarMagLimit(5.0, 2)).toBe(4.5);
    expect(effectiveStarMagLimit(5.0, 3)).toBe(4.0);
  });

  test("a reduced raw limit stays below a tier's ceiling (min, not a second floor)", () => {
    expect(effectiveStarMagLimit(2.0, 1)).toBe(2.0);
  });
});

describe("row 13 — starFieldAlpha", () => {
  test("overcast fixture (cloud 0.95) -> alpha 0, at night, for a bright star", () => {
    expect(starFieldAlpha(-30, 95, 5.0, -1.46)).toBe(0);
  });

  test("null cloud (unavailable) is drawn clear, same as row 3's own fallback", () => {
    const clear = starFieldAlpha(-30, 0, 5.0, -1.46);
    const nullish = starFieldAlpha(-30, null, 5.0, -1.46);
    expect(nullish).toBe(clear);
  });

  test("daylight (alt > -6) -> alpha 0 regardless of cloud or magnitude", () => {
    expect(starFieldAlpha(10, 0, 5.0, -1.46)).toBe(0);
  });

  test("a star well past the magnitude limit -> alpha 0", () => {
    expect(starFieldAlpha(-30, 0, 5.0, 6.5)).toBe(0);
  });

  test("clear night, bright star, no limit pressure -> alpha > 0", () => {
    expect(starFieldAlpha(-30, 4, 5.0, -1.46)).toBeGreaterThan(0);
  });
});

describe("row 12 — moonDiscVisible", () => {
  test("above -1° -> visible", () => {
    expect(moonDiscVisible(0)).toBe(true);
    expect(moonDiscVisible(-0.9)).toBe(true);
  });
  test("at or below -1° -> hidden", () => {
    expect(moonDiscVisible(-1)).toBe(false);
    expect(moonDiscVisible(-30)).toBe(false);
  });
});

describe("row 14 — issMarkerState", () => {
  test("no reading (below the horizon, or not ready yet) -> below", () => {
    expect(issMarkerState(null)).toBe("below");
    expect(issMarkerState(undefined)).toBe("below");
  });
  test("classify() 'eye' (sunlit, Pune's sky dark) -> visible, the bright streak", () => {
    expect(issMarkerState({ state: "eye" })).toBe("visible");
  });
  test("classify() 'daylight' (sunlit but bright sky) -> above-not-visible, the faint ring", () => {
    expect(issMarkerState({ state: "daylight" })).toBe("above-not-visible");
  });
  test("classify() 'shadow' (above horizon, in Earth's shadow) -> above-not-visible, the faint ring", () => {
    expect(issMarkerState({ state: "shadow" })).toBe("above-not-visible");
  });
});

describe("row 15 — activeFestivalForm (M16: four ambient forms, never diyas)", () => {
  test("calendar-diwali fixture (2026-11-08, inside Diwali's 2026-11-06..11 span) -> diwali / RangoliDecal", () => {
    const form = activeFestivalForm(new Date("2026-11-08T12:00:00Z"));
    expect(form).toEqual({ slug: "diwali", node: "RangoliDecal" });
  });
  test("Ganeshotsav 2026 -> ganeshotsav / ToranGarland", () => {
    expect(activeFestivalForm(new Date("2026-09-20T12:00:00Z"))).toEqual({ slug: "ganeshotsav", node: "ToranGarland" });
  });
  test("Makar Sankranti 2026 -> makar-sankranti / PaperKite", () => {
    expect(activeFestivalForm(new Date("2026-01-14T12:00:00Z"))).toEqual({ slug: "makar-sankranti", node: "PaperKite" });
  });
  test("Gudi Padwa 2026 -> gudi-padwa / Gudi", () => {
    expect(activeFestivalForm(new Date("2026-03-19T12:00:00Z"))).toEqual({ slug: "gudi-padwa", node: "Gudi" });
  });
  test("no festival active -> null (nothing drawn)", () => {
    expect(activeFestivalForm(new Date("2026-08-01T12:00:00Z"))).toBeNull();
  });
  test("past validUntil -> null (a stale table asserts nothing)", () => {
    expect(activeFestivalForm(new Date("2028-11-08T12:00:00Z"))).toBeNull();
  });
});
