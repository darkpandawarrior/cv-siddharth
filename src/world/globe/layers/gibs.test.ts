import { describe, expect, it } from "vitest";
import { MUR_SEA_ICE, dayImageryAttempts, describeImagerySource, gapFillUrl, gibsGetMapUrl, isoDateUTC, nightLightsUrl, seaIceAttempts, shouldUpgradeHiDay, subdailyInstantUTC } from "./gibs.ts";

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

describe("seaIceAttempts", () => {
  it("asks for the MUR L4 map as a transparent PNG, two then three days back", () => {
    const [first, second] = seaIceAttempts(new Date("2026-09-27T10:00:00Z"), { width: 1024, height: 512 });
    const a = new URL(first.url);
    expect(a.searchParams.get("LAYERS")).toBe(MUR_SEA_ICE);
    expect(a.searchParams.get("FORMAT")).toBe("image/png");
    expect(a.searchParams.get("TRANSPARENT")).toBe("true");
    expect(a.searchParams.get("TIME")).toBe("2026-09-25");
    expect(new URL(second.url).searchParams.get("TIME")).toBe("2026-09-24");
  });

  it("leaves the JPEG layers opaque", () => {
    const u = new URL(gibsGetMapUrl("X", { width: 2, height: 1 }));
    expect(u.searchParams.get("FORMAT")).toBe("image/jpeg");
    expect(u.searchParams.has("TRANSPARENT")).toBe(false);
  });
});

// LANE V1 (wave 7, step A): the subdaily (PT10M) rounding for GOES/Himawari.
describe("subdailyInstantUTC", () => {
  it("10-minute step, 40-minute lag, rounds down (the acceptance example)", () => {
    expect(subdailyInstantUTC(new Date("2026-09-29T01:07:00Z"), 10, 40)).toBe("2026-09-29T00:20:00Z");
  });

  it("lands exactly on a step boundary even when `now` doesn't", () => {
    expect(subdailyInstantUTC(new Date("2026-09-29T01:07:59Z"), 10, 40)).toBe("2026-09-29T00:20:00Z");
  });

  it("crosses a day boundary", () => {
    expect(subdailyInstantUTC(new Date("2026-09-29T00:05:00Z"), 10, 40)).toBe("2026-09-28T23:20:00Z");
  });

  // Break-it: prove the floor is real, not a lucky round-number coincidence —
  // one second earlier must NOT still read the same 10-minute mark.
  it("break-it: one second before a step boundary still rounds down to the PREVIOUS boundary", () => {
    const justBefore = subdailyInstantUTC(new Date("2026-09-29T01:09:59Z"), 10, 40);
    const justAfter = subdailyInstantUTC(new Date("2026-09-29T01:10:00Z"), 10, 40);
    expect(justBefore).toBe("2026-09-29T00:20:00Z");
    expect(justAfter).toBe("2026-09-29T00:30:00Z");
  });
});

describe("shouldUpgradeHiDay", () => {
  it("never upgrades off tier 1, whatever the connection says", () => {
    expect(shouldUpgradeHiDay(2, undefined)).toBe(false);
    expect(shouldUpgradeHiDay(3, undefined)).toBe(false);
    expect(shouldUpgradeHiDay(2, { effectiveType: "4g" })).toBe(false);
  });

  it("upgrades on tier 1 when navigator.connection doesn't exist (desktop Safari/Firefox) — behaviour unchanged", () => {
    expect(shouldUpgradeHiDay(1, undefined)).toBe(true);
  });

  it("skips under Data Saver, even on a fast connection", () => {
    expect(shouldUpgradeHiDay(1, { saveData: true, effectiveType: "4g" })).toBe(false);
  });

  it("skips on anything below 4G", () => {
    expect(shouldUpgradeHiDay(1, { effectiveType: "3g" })).toBe(false);
    expect(shouldUpgradeHiDay(1, { effectiveType: "2g" })).toBe(false);
    expect(shouldUpgradeHiDay(1, { effectiveType: "slow-2g" })).toBe(false);
  });

  it("upgrades on tier 1, 4G, no Data Saver", () => {
    expect(shouldUpgradeHiDay(1, { effectiveType: "4g" })).toBe(true);
    expect(shouldUpgradeHiDay(1, { saveData: false, effectiveType: "4g" })).toBe(true);
  });

  it("treats a present-but-empty connection object (effectiveType unset) as no opinion, not as slow", () => {
    expect(shouldUpgradeHiDay(1, {})).toBe(true);
  });
});
