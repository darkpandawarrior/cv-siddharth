import { describe, it, expect } from "vitest";
import { airRow, riverRow, seasonRow, sunRow, weatherRow } from "./ledgerText";
import type { Air, River, Season, Weather } from "./sky";

const WEATHER: Weather = {
  at: "2026-09-24T03:30",
  intervalSec: 900,
  tempC: 22.9,
  code: 3,
  cloudPct: 95,
  precipMmH: 0,
  windKmh: 10,
  windFromDeg: 270,
  humidityPct: 94,
  visibilityM: 11420,
};

const AIR: Air = { at: "2026-09-24T03:30", pm25: 29.2, pm10: 40, usAqi: 77, euAqi: 50, aod: 0.7 };
const RIVER: River = { date: "2026-09-24", dischargeM3s: 78.98, next: [54.46], range7d: [32.27, 99.46] };
const SEASON: Season = { days: 30, sumMm: 140 };

describe("sunRow", () => {
  it("names altitude and both times, no em dash", () => {
    const row = sunRow(42, new Date("2026-09-24T06:24:00+05:30"), new Date("2026-09-24T18:30:00+05:30"));
    expect(row).toContain("altitude 42");
    expect(row).toContain("06:24");
    expect(row).toContain("18:30");
    expect(row).not.toContain("—");
  });
});

describe("weatherRow", () => {
  it("formats the live sample, no em dash", () => {
    const row = weatherRow(WEATHER);
    expect(row).toContain("22.9");
    expect(row).toContain("overcast");
    expect(row).toContain("cloud 95%");
    expect(row).toContain("from W");
    expect(row).toContain("11.4 km");
    expect(row).not.toContain("—");
  });

  it("degrades to unavailable on null", () => {
    expect(weatherRow(null)).toContain("unavailable right now");
  });
});

describe("airRow", () => {
  it("names AQI band and the word modelled", () => {
    const row = airRow(AIR);
    expect(row).toContain("PM2.5 29");
    expect(row).toContain("US AQI 77");
    expect(row).toContain("moderate");
    expect(row).toContain("modelled");
  });

  it("degrades to unavailable on null", () => {
    expect(airRow(null)).toContain("unavailable right now");
  });
});

describe("riverRow", () => {
  it("names the river and says not a gauge", () => {
    const row = riverRow(RIVER);
    expect(row).toContain("Mula-Mutha");
    expect(row).toContain("79 m³/s");
    expect(row).toContain("not a gauge");
  });

  it("degrades to unavailable on null", () => {
    expect(riverRow(null)).toContain("unavailable right now");
  });
});

describe("seasonRow", () => {
  it("renders a ratio against the normal when one is supplied", () => {
    expect(seasonRow(SEASON, 100)).toBe("Season · last 30 days 1.4x the 2015-2025 mean for these dates · computed");
  });

  it("falls back to the raw total without a normal", () => {
    expect(seasonRow(SEASON)).toBe("Season · last 30 days 140 mm · computed");
  });

  it("degrades to unavailable on null", () => {
    expect(seasonRow(null)).toContain("unavailable right now");
  });
});
