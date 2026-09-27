import { describe, expect, it } from "vitest";
import { dayImageryAttempts, describeImagerySource, gapFillUrl, gibsGetMapUrl, isoDateUTC, nightLightsUrl } from "./gibs.ts";

describe("isoDateUTC", () => {
  it("subtracts whole UTC days", () => {
    expect(isoDateUTC(new Date("2026-09-27T12:00:00Z"), 1)).toBe("2026-09-26");
    expect(isoDateUTC(new Date("2026-09-27T12:00:00Z"), 2)).toBe("2026-09-25");
    expect(isoDateUTC(new Date("2026-09-27T12:00:00Z"), 0)).toBe("2026-09-27");
  });

  it("crosses a month boundary", () => {
    expect(isoDateUTC(new Date("2026-10-01T03:00:00Z"), 1)).toBe("2026-09-30");
  });

  it("crosses a year boundary", () => {
    expect(isoDateUTC(new Date("2027-01-01T00:30:00Z"), 1)).toBe("2026-12-31");
  });

  it("uses the UTC day, not the local one", () => {
    // Pune is UTC+5:30 — 00:30 IST on the 2nd is still 19:00 UTC on the 1st.
    const puneJustAfterMidnight = new Date("2026-09-02T00:30:00+05:30");
    expect(isoDateUTC(puneJustAfterMidnight, 1)).toBe("2026-08-31");
  });
});

describe("gibsGetMapUrl", () => {
  it("builds a WMS 1.3.0 GetMap URL with the world BBOX", () => {
    const url = gibsGetMapUrl("VIIRS_SNPP_CorrectedReflectance_TrueColor", { width: 2048, height: 1024 }, "2026-09-26");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
    expect(parsed.searchParams.get("SERVICE")).toBe("WMS");
    expect(parsed.searchParams.get("VERSION")).toBe("1.3.0");
    expect(parsed.searchParams.get("CRS")).toBe("EPSG:4326");
    expect(parsed.searchParams.get("BBOX")).toBe("-90,-180,90,180");
    expect(parsed.searchParams.get("WIDTH")).toBe("2048");
    expect(parsed.searchParams.get("HEIGHT")).toBe("1024");
    expect(parsed.searchParams.get("FORMAT")).toBe("image/jpeg");
    expect(parsed.searchParams.get("TIME")).toBe("2026-09-26");
  });

  it("omits TIME when not given", () => {
    const url = gibsGetMapUrl("BlueMarble_ShadedRelief_Bathymetry", { width: 2048, height: 1024 });
    expect(new URL(url).searchParams.has("TIME")).toBe(false);
  });
});

describe("dayImageryAttempts", () => {
  const now = new Date("2026-09-27T09:00:00Z");
  const attempts = dayImageryAttempts(now, { width: 2048, height: 1024 });

  it("tries yesterday VIIRS, then the day before, then MODIS Terra", () => {
    expect(attempts).toHaveLength(3);
    expect(attempts[0].url).toContain("LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor");
    expect(attempts[0].url).toContain("TIME=2026-09-26");
    expect(attempts[1].url).toContain("LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor");
    expect(attempts[1].url).toContain("TIME=2026-09-25");
    expect(attempts[2].url).toContain("LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor");
    expect(attempts[2].url).toContain("TIME=2026-09-26");
  });

  it("names the source and date in `detail`", () => {
    expect(attempts[0].detail).toBe("NASA GIBS VIIRS true colour, 2026-09-26");
  });
});

describe("gapFillUrl / nightLightsUrl", () => {
  it("are static (no TIME) and name their own layer", () => {
    const base = gapFillUrl({ width: 2048, height: 1024 });
    const night = nightLightsUrl({ width: 1024, height: 512 });
    expect(new URL(base).searchParams.has("TIME")).toBe(false);
    expect(base).toContain("LAYERS=BlueMarble_ShadedRelief_Bathymetry");
    expect(new URL(night).searchParams.has("TIME")).toBe(false);
    expect(night).toContain("LAYERS=VIIRS_Black_Marble");
  });
});

describe("describeImagerySource", () => {
  it("reports yesterday UTC and the VIIRS source name", () => {
    expect(describeImagerySource(new Date("2026-09-27T09:00:00Z"))).toEqual({
      date: "2026-09-26",
      source: "NASA GIBS VIIRS SNPP Corrected Reflectance (True Color)",
    });
  });
});
