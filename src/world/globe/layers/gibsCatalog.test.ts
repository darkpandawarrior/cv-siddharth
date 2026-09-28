import { describe, expect, it } from "vitest";
import { GIBS_BASES, GIBS_CATALOG, GIBS_OVERLAYS, catalogDate, catalogDateLabel, tileUrl } from "./gibsCatalog.ts";

const NOW = new Date("2026-09-28T09:00:00Z");

describe("catalog shape", () => {
  it("every base and overlay id is unique and present in GIBS_CATALOG", () => {
    const ids = [...GIBS_BASES, ...GIBS_OVERLAYS].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(GIBS_CATALOG[id]).toBeDefined();
  });

  it("ships at least the four required bases and eight required overlays", () => {
    expect(GIBS_BASES.length).toBeGreaterThanOrEqual(4);
    expect(GIBS_OVERLAYS.length).toBeGreaterThanOrEqual(8);
  });

  it("every dated overlay/base carries a legend or is a reference/base layer (labels need none)", () => {
    for (const e of GIBS_OVERLAYS) {
      if (e.dateRule.kind === "daily") expect(e.legend, `${e.id} is dated but has no legend`).toBeDefined();
    }
  });
});

describe("catalogDate", () => {
  it("static layers have no date", () => {
    expect(catalogDate(GIBS_CATALOG.BlueMarble_ShadedRelief_Bathymetry, NOW)).toBeUndefined();
    expect(catalogDate(GIBS_CATALOG.Reference_Labels_15m, NOW)).toBeUndefined();
  });

  it("daily layers subtract their own verified lag, not a uniform one", () => {
    expect(catalogDate(GIBS_CATALOG.VIIRS_SNPP_CorrectedReflectance_TrueColor, NOW)).toBe("2026-09-27"); // lag 1
    expect(catalogDate(GIBS_CATALOG.MODIS_Combined_Value_Added_AOD, NOW)).toBe("2026-09-26"); // lag 2
    expect(catalogDate(GIBS_CATALOG.IMERG_Precipitation_Rate, NOW)).toBe("2026-09-25"); // lag 3
    expect(catalogDate(GIBS_CATALOG.GHRSST_L4_MUR_Sea_Surface_Temperature, NOW)).toBe("2026-09-25"); // lag 3
  });
});

describe("catalogDateLabel", () => {
  it("names the source and date for a dated layer", () => {
    expect(catalogDateLabel(GIBS_CATALOG.VIIRS_SNPP_CorrectedReflectance_TrueColor, NOW)).toBe("NASA GIBS / VIIRS SNPP, 2026-09-27");
  });

  it("is just the attribution for a static layer (no date to show)", () => {
    expect(catalogDateLabel(GIBS_CATALOG.Coastlines_15m, NOW)).toBe("NASA GIBS reference layer");
  });
});

describe("tileUrl", () => {
  it("builds the exact WMTS REST shape a dated layer needs", () => {
    const url = tileUrl(GIBS_CATALOG.VIIRS_SNPP_CorrectedReflectance_TrueColor, 6, 30, 10, NOW);
    expect(url).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-09-27/250m/6/30/10.jpg");
  });

  it("omits the Time segment entirely for a static layer", () => {
    const url = tileUrl(GIBS_CATALOG.Coastlines_15m, 4, 2, 5, NOW);
    expect(url).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/Coastlines_15m/default/15.625m/4/2/5.png");
  });

  // Break-it: a static layer's URL must never grow a stray date segment even
  // when catalogDate's own logic changes underneath this function.
  it("break-it: a static layer never sends a Time path segment, whatever catalogDate returns", () => {
    const url = tileUrl(GIBS_CATALOG.BlueMarble_ShadedRelief_Bathymetry, 2, 1, 2, NOW);
    expect(url.split("/")).not.toContain(NOW.toISOString().slice(0, 10));
    expect(url).not.toMatch(/\/\d{4}-\d{2}-\d{2}\//);
  });
});
