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

  it("every coverage-limited GOES/Himawari overlay states the caveat in its own description", () => {
    for (const id of [
      "GOES-East_ABI_Band13_Clean_Infrared",
      "GOES-West_ABI_Band13_Clean_Infrared",
      "Himawari_AHI_Band13_Clean_Infrared",
      "GOES-East_ABI_GeoColor",
      "GOES-West_ABI_GeoColor",
      "GOES-East_ABI_FireTemp",
      "GOES-West_ABI_FireTemp",
    ]) {
      expect(GIBS_CATALOG[id], `${id} missing from catalog`).toBeDefined();
      expect(GIBS_CATALOG[id].description, `${id} description missing the coverage caveat`).toMatch(/Europe, Africa and India are not covered/);
      expect(GIBS_CATALOG[id].dateRule).toEqual({ kind: "subdaily", stepMin: 10, lagMin: 40 });
    }
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
    expect(catalogDate(GIBS_CATALOG.IMERG_Precipitation_Rate, NOW)).toBe("2026-09-27"); // verified daily lag 1
    expect(catalogDate(GIBS_CATALOG.GHRSST_L4_MUR_Sea_Surface_Temperature, NOW)).toBe("2026-09-25"); // lag 3
  });

  // The acceptance example, verbatim: "the subdaily rule at 2026-09-29T01:07Z
  // gives 2026-09-29T00:20:00Z".
  it("subdaily layers round down to their own 10-minute step, 40-minute lag", () => {
    expect(catalogDate(GIBS_CATALOG["GOES-East_ABI_Band13_Clean_Infrared"], new Date("2026-09-29T01:07:00Z"))).toBe("2026-09-29T00:20:00Z");
  });

  it("EOX's s2cloudless base is static, like the GIBS static bases (a fixed year, not today's imagery)", () => {
    expect(catalogDate(GIBS_CATALOG.s2cloudless, NOW)).toBeUndefined();
  });
});

describe("catalogDateLabel", () => {
  it("names the source and date for a dated layer", () => {
    expect(catalogDateLabel(GIBS_CATALOG.VIIRS_SNPP_CorrectedReflectance_TrueColor, NOW)).toBe("NASA GIBS / VIIRS SNPP, 2026-09-27");
  });

  it("is just the attribution for a static layer (no date to show)", () => {
    expect(catalogDateLabel(GIBS_CATALOG.Coastlines_15m, NOW)).toBe("NASA GIBS reference layer");
  });

  it("prints the frame's own UTC time (HH:MM), not the full instant, for a subdaily layer", () => {
    expect(catalogDateLabel(GIBS_CATALOG["GOES-East_ABI_Band13_Clean_Infrared"], new Date("2026-09-29T01:07:00Z"))).toBe(
      "NASA GIBS / GOES-East ABI Band13 Clean Infrared, 00:20 UTC",
    );
  });

  it("shows the EOX attribution text verbatim for the static deep-zoom base", () => {
    expect(catalogDateLabel(GIBS_CATALOG.s2cloudless, NOW)).toBe(
      "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0",
    );
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

  // The acceptance example, verbatim: "tileUrl contains /default/2026-09-29T00:20:00Z/2km/".
  it("a subdaily layer's URL carries the full rounded ISO instant, not a bare date", () => {
    const url = tileUrl(GIBS_CATALOG["GOES-East_ABI_Band13_Clean_Infrared"], 2, 1, 2, new Date("2026-09-29T01:07:00Z"));
    expect(url).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/GOES-East_ABI_Band13_Clean_Infrared/default/2026-09-29T00:20:00Z/2km/2/1/2.png");
  });

  it("an EOX (`provider: \"eox\"`) layer's URL uses the different host, path shape and NO Time segment", () => {
    const url = tileUrl(GIBS_CATALOG.s2cloudless, 13, 3253, 11554, NOW);
    expect(url).toBe("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/13/3253/11554.jpg");
  });
});

// LANE S1 (wave 9): the six new overlays appended to GIBS_OVERLAYS — each
// live-curled today (2026-09-29 UTC) per this lane's report, not trusted
// from the earlier audit sweep alone.
describe("S1 overlay pack", () => {
  const S1_IDS = [
    "MODIS_Aqua_L2_Chlorophyll_A",
    "MODIS_Terra_L3_Land_Surface_Temp_Daily_Day",
    "MODIS_Terra_L3_NDVI_16Day",
    "GPW_Population_Density_2020",
    "SMAP_L4_Analyzed_Surface_Soil_Moisture",
    "GOES-East_ABI_Dust",
    "GOES-West_ABI_Dust",
  ];

  it("all seven new entries are present in the catalog with a legend each", () => {
    for (const id of S1_IDS) {
      expect(GIBS_CATALOG[id], `${id} missing from catalog`).toBeDefined();
      expect(GIBS_CATALOG[id].legend, `${id} has no legend`).toBeDefined();
    }
  });

  it("each new layer's own verified lag, not a uniform one", () => {
    expect(catalogDate(GIBS_CATALOG.MODIS_Aqua_L2_Chlorophyll_A, NOW)).toBe("2026-09-27"); // lag 1
    expect(catalogDate(GIBS_CATALOG.MODIS_Terra_L3_Land_Surface_Temp_Daily_Day, NOW)).toBe("2026-09-26"); // lag 2
    expect(catalogDate(GIBS_CATALOG.MODIS_Terra_L3_NDVI_16Day, NOW)).toBe("2026-08-28"); // lag 31, real 16-day compositing lag
    expect(catalogDate(GIBS_CATALOG.SMAP_L4_Analyzed_Surface_Soil_Moisture, NOW)).toBe("2026-09-25"); // lag 3
  });

  it("GPW population density is static — no Time segment, ever", () => {
    expect(catalogDate(GIBS_CATALOG.GPW_Population_Density_2020, NOW)).toBeUndefined();
    const url = tileUrl(GIBS_CATALOG.GPW_Population_Density_2020, 2, 1, 2, NOW);
    expect(url).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/GPW_Population_Density_2020/default/1km/2/1/2.png");
  });

  it("the GOES dust pair rides the same PT10M subdaily rule as their GeoColor/FireTemp siblings", () => {
    for (const id of ["GOES-East_ABI_Dust", "GOES-West_ABI_Dust"]) {
      expect(GIBS_CATALOG[id].dateRule).toEqual({ kind: "subdaily", stepMin: 10, lagMin: 40 });
      expect(GIBS_CATALOG[id].description, `${id} missing the coverage caveat`).toMatch(/Europe, Africa and India are not covered/);
    }
    const url = tileUrl(GIBS_CATALOG["GOES-East_ABI_Dust"], 2, 1, 2, NOW);
    expect(url).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/GOES-East_ABI_Dust/default/2026-09-28T08:20:00Z/1km/2/1/2.png");
  });

  it("NDVI's own description flags the real compositing lag honestly", () => {
    expect(GIBS_CATALOG.MODIS_Terra_L3_NDVI_16Day.description).toMatch(/lag/i);
  });
});


describe("Y4 verified precipitation and total-column ozone", () => {
  const verifiedNow = new Date("2026-09-30T17:30:00Z");
  it("IMERG follows the published P1D time dimension, not its half-hourly source observations", () => {
    const entry = GIBS_CATALOG.IMERG_Precipitation_Rate;
    expect(entry.dateRule).toEqual({ kind: "daily", lagDays: 1 });
    expect(entry.description).toContain("not live radar");
    expect(entry.legend?.unit).toBe("mm/hr");
    expect(entry.legend?.stops[1]).toEqual({ color: "#009424", label: "0.2" });
    expect(entry.snowLegend?.stops[1]).toEqual({ color: "#8febf1", label: "0.2" });
    expect(tileUrl(entry, 0, 0, 0, verifiedNow)).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/IMERG_Precipitation_Rate/default/2026-09-29/2km/0/0/0.png");
  });
  it("OMPS has today's P1D frame and the verified Dobson-unit colormap", () => {
    const entry = GIBS_OVERLAYS.find((layer) => layer.id === "OMPS_Ozone_Total_Column");
    expect(entry).toBeDefined();
    expect(entry!.dateRule).toEqual({ kind: "daily", lagDays: 0 });
    expect(entry!.legend?.unit).toBe("DU");
    expect(entry!.legend!.stops.length).toBeGreaterThanOrEqual(3);
    expect(entry!.legend!.stops[1]).toEqual({ color: "#5db8a9", label: "150.0" });
    expect(entry!.attribution).toBe("NASA GIBS / OMPS Suomi NPP");
    expect(tileUrl(entry!, 0, 0, 0, verifiedNow)).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/OMPS_Ozone_Total_Column/default/2026-09-30/2km/0/0/0.png");
  });
});


describe("Y4 colormap range boundaries", () => {
  it("includes the rain and snow scale endpoints and saturation colours", () => {
    const entry = GIBS_CATALOG.IMERG_Precipitation_Rate;
    expect(entry.legend!.stops[0]).toEqual({ color: "#00764e", label: "0.1" });
    expect(entry.legend!.stops.at(-1)).toEqual({ color: "#330000", label: "≥ 53.0" });
    expect(entry.snowLegend!.stops[0]).toEqual({ color: "#b1faee", label: "0.1" });
    expect(entry.snowLegend!.stops.at(-1)).toEqual({ color: "#3a0330", label: "≥ 53.0" });
  });
  it("includes the ozone underflow and overflow classes", () => {
    const legend = GIBS_CATALOG.OMPS_Ozone_Total_Column.legend!;
    expect(legend.stops[0]).toEqual({ color: "#5e4fa2", label: "< 100.0" });
    expect(legend.stops.at(-1)).toEqual({ color: "#9e0142", label: "≥ 500.0" });
  });
});
