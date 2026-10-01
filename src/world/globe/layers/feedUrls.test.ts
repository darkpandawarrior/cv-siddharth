import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as feedUrls from "./feedUrls.ts";

// "feedUrls constants are what HazardLayer fetches" -- proven by source
// text, not a mock: HazardLayer.tsx must reference every constant by name
// and must no longer declare its own private `const X_URL = "https://..."`
// copies (the thing this file exists to remove).
const hazardLayerSrc = readFileSync(fileURLToPath(new URL("./HazardLayer.tsx", import.meta.url)), "utf8");

describe("feedUrls constants are what HazardLayer.tsx fetches", () => {
  it("imports every URL/URL-builder by name instead of re-declaring it", () => {
    for (const name of ["QUAKES_URL", "EONET_URL", "GDACS_URL", "OVATION_URL", "KP_URL", "LAUNCHES_URL", "nhcConeUrl", "NHC_CONE_LAYER_IDS"]) {
      expect(hazardLayerSrc, `HazardLayer.tsx does not reference feedUrls' ${name}`).toContain(name);
    }
  });

  it("no longer declares a private URL literal HazardLayer.tsx used to own", () => {
    expect(hazardLayerSrc).not.toMatch(/const \w*_URL\s*=\s*"https:/);
  });
});

describe("nhcConeUrl", () => {
  it("builds a query against the verified MapServer host", () => {
    expect(feedUrls.nhcConeUrl(8)).toBe(
      "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer/8/query?where=1%3D1&outFields=*&f=geojson",
    );
  });
});

describe("NHC_CONE_LAYER_IDS", () => {
  it("lists all 15 forecast-cone sub-layers, no duplicates", () => {
    expect(feedUrls.NHC_CONE_LAYER_IDS).toHaveLength(15);
    expect(new Set(feedUrls.NHC_CONE_LAYER_IDS).size).toBe(15);
  });
});
