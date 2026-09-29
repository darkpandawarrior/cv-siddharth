import { describe, it, expect } from "vitest";
import {
  classifyFlare,
  parseLatestFlare,
  protonScale,
  parseLatestProton,
  parseSolarWindSpeed,
  parseSolarWindMag,
  spaceWeatherDetail,
} from "./solarFlare.ts";

describe("classifyFlare", () => {
  it("classifies across every class boundary", () => {
    expect(classifyFlare(5e-5)).toBe("M5.0");
    expect(classifyFlare(2.5e-4)).toBe("X2.5");
    expect(classifyFlare(3e-6)).toBe("C3.0");
    expect(classifyFlare(4e-7)).toBe("B4.0");
    expect(classifyFlare(5e-9)).toBe("A0.0"); // below A1.0's own floor
    expect(classifyFlare(1e-8)).toBe("A1.0");
  });
});

describe("parseLatestFlare", () => {
  it("picks the latest 0.1-0.8nm row by time_tag, ignoring the short channel and other satellites' older rows", () => {
    const json = [
      { time_tag: "2026-09-29T19:35:00Z", energy: "0.1-0.8nm", flux: 1e-6 },
      { time_tag: "2026-09-29T19:36:00Z", energy: "0.05-0.4nm", flux: 9e-6 }, // short channel, must be ignored
      { time_tag: "2026-09-29T19:37:00Z", energy: "0.1-0.8nm", flux: 2.3e-5 }, // latest long-channel row
    ];
    const reading = parseLatestFlare(json);
    expect(reading).not.toBeNull();
    expect(reading!.flareClass).toBe("M2.3");
    expect(reading!.timeIso).toBe("2026-09-29T19:37:00Z");
  });

  it("returns null on a malformed or empty feed", () => {
    expect(parseLatestFlare(null)).toBeNull();
    expect(parseLatestFlare([])).toBeNull();
    expect(parseLatestFlare([{ energy: "0.1-0.8nm" }])).toBeNull();
  });
});

describe("protonScale", () => {
  it("classifies across every S-scale boundary", () => {
    expect(protonScale(5)).toBe("S0");
    expect(protonScale(10)).toBe("S1");
    expect(protonScale(250)).toBe("S2");
    expect(protonScale(5000)).toBe("S3");
    expect(protonScale(50000)).toBe("S4");
    expect(protonScale(200000)).toBe("S5");
  });
});

describe("parseLatestProton", () => {
  it("picks the latest >=10 MeV row, ignoring other energy channels", () => {
    const json = [
      { time_tag: "2026-09-29T19:30:00Z", energy: ">=50 MeV", flux: 1000 },
      { time_tag: "2026-09-29T19:30:00Z", energy: ">=10 MeV", flux: 15 },
      { time_tag: "2026-09-29T19:31:00Z", energy: ">=10 MeV", flux: 120 },
    ];
    const reading = parseLatestProton(json);
    expect(reading).not.toBeNull();
    expect(reading!.scale).toBe("S2");
    expect(reading!.fluxPfu).toBe(120);
  });

  it("returns null on a malformed feed", () => {
    expect(parseLatestProton(undefined)).toBeNull();
    expect(parseLatestProton({})).toBeNull();
  });
});

describe("parseSolarWindSpeed / parseSolarWindMag", () => {
  it("reads the single-element summary reading", () => {
    const speed = parseSolarWindSpeed([{ proton_speed: 285, time_tag: "2026-09-29T19:32:00Z" }]);
    expect(speed).toEqual({ speedKmS: 285, timeIso: "2026-09-29T19:32:00Z" });
    const mag = parseSolarWindMag([{ bt: 3, bz_gsm: -2, time_tag: "2026-09-29T19:32:00Z" }]);
    expect(mag).toEqual({ bt: 3, bz: -2, timeIso: "2026-09-29T19:32:00Z" });
  });

  it("returns null on an empty or malformed feed", () => {
    expect(parseSolarWindSpeed([])).toBeNull();
    expect(parseSolarWindSpeed(null)).toBeNull();
    expect(parseSolarWindMag([{ bt: 3 }])).toBeNull();
  });
});

describe("spaceWeatherDetail", () => {
  it("joins only the parts that actually loaded", () => {
    const flare = { flareClass: "M1.2", flux: 1.2e-5, timeIso: "x" };
    const proton = { scale: "S1", fluxPfu: 12, timeIso: "x" };
    const wind = { speedKmS: 420.4, timeIso: "x" };
    const mag = { bt: 5, bz: -6, timeIso: "x" };
    expect(spaceWeatherDetail(flare, proton, wind, mag)).toBe("X-ray M1.2 · protons S1 · wind 420 km/s · Bz -6 nT");
    expect(spaceWeatherDetail(flare, null, null, null)).toBe("X-ray M1.2");
    expect(spaceWeatherDetail(null, null, null, null)).toBe("");
  });
});
