import { describe, it, expect } from "vitest";
import {
  applyWeather,
  daypartFor,
  keyframeAt,
  KEYFRAMES,
  skyState,
  subsolarPoint,
  sunPosition,
  sunTimes,
  WMO_LABEL,
  type Weather,
} from "./sky";
import { NIGHT_SURVEY } from "./nightSurvey";

// Fixed reference day, verified live against Open-Meteo on 2026-09-24
// (design-brief §2): sunrise 06:23, sunset 18:29 IST, per the direct read;
// the NOAA math (scratchpad/sun-probe.mjs) agreed within 1 minute.
const IST = (s: string) => new Date(`2026-09-24T${s}+05:30`);

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

describe("sunTimes", () => {
  it("puts sunrise and sunset within 2 minutes of the verified Open-Meteo reading", () => {
    const t = sunTimes(IST("12:00:00"));
    expect(minutesBetween(t.sunrise, IST("06:23:00"))).toBeLessThanOrEqual(2);
    expect(minutesBetween(t.sunset, IST("18:29:00"))).toBeLessThanOrEqual(2);
  });
});

describe("sunPosition", () => {
  it("reads solar-noon altitude as 70.98deg +/- 0.3 on 2026-09-24", () => {
    const { altitudeDeg } = sunPosition(IST("12:27:00"));
    expect(altitudeDeg).toBeCloseTo(70.98, 0);
    expect(Math.abs(altitudeDeg - 70.98)).toBeLessThanOrEqual(0.3);
  });

  it("reads 80.20deg +/- 0.3 at the 2026-06-21 solstice noon", () => {
    const { altitudeDeg } = sunPosition(new Date("2026-06-21T12:00:00+05:30"));
    expect(Math.abs(altitudeDeg - 80.2)).toBeLessThanOrEqual(0.3);
  });

  it("is negative in the middle of the night", () => {
    expect(sunPosition(IST("03:15:00")).altitudeDeg).toBeLessThan(0);
  });
});

describe("daypartFor", () => {
  it("is night below -6deg, day at/above +6deg, twilight between", () => {
    expect(daypartFor(-45, true)).toBe("night");
    expect(daypartFor(-6.1, true)).toBe("night");
    expect(daypartFor(-3, true)).toBe("dawn");
    expect(daypartFor(-3, false)).toBe("dusk");
    expect(daypartFor(3, true)).toBe("golden");
    expect(daypartFor(6, true)).toBe("day");
    expect(daypartFor(70, true)).toBe("day");
  });
});

describe("keyframeAt", () => {
  it("deep-equals the Night Survey constants at and below the night breakpoint", () => {
    expect(keyframeAt(-30)).toStrictEqual(KEYFRAMES[0]);
    expect(keyframeAt(-18)).toStrictEqual(KEYFRAMES[0]);
    // The night row IS src/lib/nightSurvey.ts's NIGHT_SURVEY (M48) — Sky.tsx
    // and World.tsx import the same constants, so this can never drift.
    expect(keyframeAt(-30)).toStrictEqual(NIGHT_SURVEY);
    expect(KEYFRAMES[0].zenith).toBe("#0a0f10");
    expect(KEYFRAMES[0].horizon).toBe("#16292b");
    expect(KEYFRAMES[0].hemiSky).toBe("#9dbbb3");
    expect(KEYFRAMES[0].hemiGround).toBe("#26362b");
    expect(KEYFRAMES[0].sunI).toBe(1.8);
    expect(KEYFRAMES[0].hemiI).toBe(1.2);
  });

  it("clamps above the day breakpoint instead of extrapolating", () => {
    expect(keyframeAt(89)).toStrictEqual(KEYFRAMES[KEYFRAMES.length - 1]);
  });

  it("lerps strictly between two neighbouring rows mid-range", () => {
    const mid = keyframeAt(0); // halfway between dawn/dusk (-6) and golden (6)
    expect(mid.sunI).toBeGreaterThan(KEYFRAMES[1].sunI);
    expect(mid.sunI).toBeLessThan(KEYFRAMES[2].sunI);
  });
});

const BASE_WEATHER: Weather = {
  at: "now",
  intervalSec: 900,
  tempC: 22.9,
  code: 3,
  cloudPct: 0,
  precipMmH: 0,
  windKmh: 0,
  windFromDeg: 0,
  humidityPct: 60,
  visibilityM: 20000,
};

describe("applyWeather", () => {
  const k = keyframeAt(45);

  it("is the identity (same reference) when weather is null", () => {
    expect(applyWeather(k, null)).toBe(k);
  });

  it("dims sunI by up to 60% under full cloud", () => {
    const overcast: Weather = { ...BASE_WEATHER, cloudPct: 100 };
    expect(applyWeather(k, overcast).sunI).toBeCloseTo(k.sunI * 0.4, 5);
  });

  it("leaves sunI untouched under clear sky", () => {
    const clear: Weather = { ...BASE_WEATHER, cloudPct: 0, tempC: 25, code: 0, windKmh: 5, windFromDeg: 180 };
    expect(applyWeather(k, clear).sunI).toBeCloseTo(k.sunI, 5);
  });

  it("tightens fogFar by 30% when it is raining", () => {
    const wet: Weather = { ...BASE_WEATHER, code: 61, cloudPct: 90, precipMmH: 2.4, windKmh: 10, windFromDeg: 200 };
    expect(applyWeather(k, wet).fogFar).toBeCloseTo(k.fogFar * 0.7, 5);
  });
});

describe("WMO_LABEL", () => {
  it("labels the code from the verified live Open-Meteo sample", () => {
    expect(WMO_LABEL[3]).toBe("overcast");
  });
});

describe("skyState", () => {
  it("reports progress near 0.5 at solar noon and marks it live, not preview", () => {
    const s = skyState(IST("12:27:00"), null);
    expect(s.progress).toBeGreaterThan(0.4);
    expect(s.progress).toBeLessThan(0.6);
    expect(s.daypart).toBe("day");
    expect(s.preview).toBe(false);
  });

  it("reports progress outside [0,1] at night", () => {
    const s = skyState(IST("03:15:00"), null);
    expect(s.progress < 0 || s.progress > 1).toBe(true);
    expect(s.daypart).toBe("night");
  });

  it("carries the preview flag through unchanged", () => {
    expect(skyState(IST("12:27:00"), null, true).preview).toBe(true);
  });
});

describe("subsolarPoint", () => {
  it("puts the subsolar longitude within 0.5deg of Pune's at Pune's own solar noon", () => {
    const { lon } = subsolarPoint(IST("12:27:00"));
    expect(Math.abs(lon - 73.86)).toBeLessThanOrEqual(0.5);
  });

  it("puts the subsolar latitude near the equator close to the equinox", () => {
    const { lat } = subsolarPoint(IST("12:27:00"));
    expect(Math.abs(lat)).toBeLessThan(2);
  });
});
