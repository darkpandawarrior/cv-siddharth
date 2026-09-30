import { describe, expect, it } from "vitest";
import { TLE_STATIONS_URL, TLE_VISUAL_URL } from "../layers/tleSource.ts";

it("satellite provenance uses the same CelesTrak endpoints as the server", () => {
  expect(buildHowItsBuiltEntries().find((e) => e.id === "satellites")?.provenance.map((p) => p.endpoint)).toEqual([TLE_STATIONS_URL, TLE_VISUAL_URL]);
});
import { buildHowItsBuiltEntries } from "./howItsBuiltData.ts";
import { VERT, ATMO_FRAG, OCEAN_FRAG } from "../layers/sun.ts";
import { CLOUD_FRAG } from "../layers/cloudShader.ts";
import { EARTH_IMAGERY_FRAG, INNER_HAZE_FRAG } from "../layers/earthImageryShader.ts";
import { GIBS_CATALOG, GIBS_OVERLAYS, tileUrl } from "../layers/gibsCatalog.ts";
import { dayImageryAttempts, gapFillUrl, reliefUrl, nightLightsUrl, seaIceAttempts, type GibsSize } from "../layers/gibs.ts";
import { LIBERTY_STYLE_URL, PANORAMAX_SEARCH_ENDPOINT } from "../streetPhotos.ts";
import { mapsExport } from "../../../data/generated/mapsPlaces.ts";
import { ADSB_URL, FORECAST_URL, QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL, LAUNCHES_URL, NHC_CONE_LAYER_IDS, nhcConeUrl } from "../layers/feedUrls.ts";

const NOW = new Date("2026-09-29T12:00:00Z");
const SIZE: GibsSize = { width: 2048, height: 1024 };

function byId(entries: ReturnType<typeof buildHowItsBuiltEntries>, id: string) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`missing entry ${id}`);
  return entry;
}

describe("howItsBuiltData", () => {
  const entries = buildHowItsBuiltEntries(NOW);

  it("every displayed shader string is identical to the imported constant it names", () => {
    expect(byId(entries, "earth-imagery").shaders.map((s) => s.code)).toEqual([VERT, EARTH_IMAGERY_FRAG]);
    expect(byId(entries, "clouds").shaders.map((s) => s.code)).toEqual([CLOUD_FRAG]);
    expect(byId(entries, "ocean").shaders.map((s) => s.code)).toEqual([OCEAN_FRAG]);
    expect(byId(entries, "atmosphere").shaders.map((s) => s.code)).toEqual([ATMO_FRAG, INNER_HAZE_FRAG]);
  });

  it("the deep-zoom base's provenance endpoint and licence trace to gibsCatalog.ts's own tileUrl() and attribution", () => {
    const entry = GIBS_CATALOG["s2cloudless"];
    const provenance = byId(entries, "deep-zoom-base").provenance[0];
    expect(provenance.endpoint).toBe(tileUrl(entry, 0, 0, 0, NOW));
    expect(provenance.licence).toBe(entry.attribution);
  });

  it("earth imagery's provenance endpoints trace to gibs.ts's own URL builders, the same ones EarthImagery.tsx calls", () => {
    const provenance = byId(entries, "earth-imagery").provenance;
    expect(provenance[0].endpoint).toBe(dayImageryAttempts(NOW, SIZE)[0].url);
    expect(provenance[1].endpoint).toBe(gapFillUrl(SIZE));
    expect(provenance[2].endpoint).toBe(reliefUrl(SIZE));
    expect(provenance[3].endpoint).toBe(nightLightsUrl(SIZE));
    expect(provenance[4].endpoint).toBe(seaIceAttempts(NOW, SIZE)[0].url);
  });

  it("street-level provenance endpoints trace to streetPhotos.ts's own exported constants", () => {
    const provenance = byId(entries, "street-level").provenance;
    expect(provenance[0].endpoint).toBe(LIBERTY_STYLE_URL);
    expect(provenance[1].endpoint).toBe(PANORAMAX_SEARCH_ENDPOINT);
  });

  it("guide places provenance's fetched-at is the same generated Maps Takeout snapshot GuideLayer.tsx reads, and states scope honestly", () => {
    const provenance = byId(entries, "guide-places").provenance[0];
    expect(provenance.fetchedAt).toBe(mapsExport);
    expect(provenance.licence).toBe("Google Maps Takeout, owner export: exact place pins and names, star ratings, review text, month-level dates");
  });

  it("hazard provenance endpoints are the same feedUrls.ts constants HazardLayer.tsx fetches, in order", () => {
    expect(byId(entries, "hazards").provenance.map((p) => p.endpoint)).toEqual([
      QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL, LAUNCHES_URL, nhcConeUrl(NHC_CONE_LAYER_IDS[0]),
    ]);
  });

  it("re-running with a different `now` changes the dated GIBS entries but never the shader strings", () => {
    const later = buildHowItsBuiltEntries(new Date("2026-10-01T00:00:00Z"));
    expect(byId(later, "earth-imagery").shaders.map((s) => s.code)).toEqual([VERT, EARTH_IMAGERY_FRAG]);
    expect(byId(later, "earth-imagery").provenance[0].fetchedAt).not.toBe(byId(entries, "earth-imagery").provenance[0].fetchedAt);
  });
});

import { DAYLIGHT_FRAG, ECLIPSE_GSFC_NOTE, BLOOM_THRESHOLD, BLOOM_INTENSITY } from "../layers/layerKeys.ts";
import { XRAY_URL, PROTON_URL, SOLAR_WIND_MAG_URL, SOLAR_WIND_SPEED_URL } from "../layers/solarFlare.ts";
import { MARINE_HOST } from "../layers/marine.ts";
import { AIR_QUALITY_HOST } from "../layers/airQuality.ts";
import { FLOOD_HOST } from "../layers/flood.ts";
import astronomyPackage from "../../../../node_modules/astronomy-engine/package.json";
import r3PostPackage from "../../../../node_modules/@react-three/postprocessing/package.json";
import postPackage from "../../../../node_modules/postprocessing/package.json";

const NEW_ENTRIES = [
  ["daylight", { shaders: [{ name: "fragment", code: DAYLIGHT_FRAG }], description: "Computed from the subsolar point, not fetched" }],
  ["eclipse", { description: ECLIPSE_GSFC_NOTE, provenance: [{ licence: astronomyPackage.license }, { label: "NASA GSFC cross-check" }] }],
  ["bloom", { description: `Luminance threshold ${BLOOM_THRESHOLD}, intensity ${BLOOM_INTENSITY}. Imagery only, tiers 1 and 2.`, provenance: [{ licence: r3PostPackage.license }, { licence: postPackage.license }] }],
  ["space-weather", { provenance: [XRAY_URL, PROTON_URL, SOLAR_WIND_MAG_URL, SOLAR_WIND_SPEED_URL].map((endpoint) => ({ endpoint })) }],
  ...[["aircraft", ADSB_URL], ["wind", FORECAST_URL], ["marine", MARINE_HOST], ["air-quality", AIR_QUALITY_HOST], ["flood", FLOOD_HOST]].map(([id, endpoint]) => [id, { provenance: [{ endpoint }] }] as const),
  ["gibs-overlays", { provenance: GIBS_OVERLAYS.map((entry) => ({ label: entry.title, endpoint: tileUrl(entry, 0, 0, 0, NOW), licence: entry.attribution })) }],
] as const;
it.each(NEW_ENTRIES)("%s cites the same literal source, settings, endpoint or licence as the layer", (id, expected) => {
  expect(byId(buildHowItsBuiltEntries(NOW), id)).toMatchObject(expected);
});
