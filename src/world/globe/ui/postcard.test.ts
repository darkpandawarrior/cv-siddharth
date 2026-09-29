import { describe, expect, it } from "vitest";
import { buildStampInput, buildStampLines } from "./postcard.ts";
import { LAYER_IDS, type LayerId } from "../globeStore.ts";

function allLayersOff(): Record<LayerId, boolean> {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<LayerId, boolean>;
}

describe("buildStampInput: honesty (never claims a source not confirmed for this frame)", () => {
  it("names the real GIBS detail string when the earth layer confirms live", () => {
    const input = buildStampInput({
      style: "imagery",
      imageryBase: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      layers: allLayersOff(),
      status: { earth: { state: "live", detail: "NASA GIBS VIIRS true colour (time machine), 2026-09-20" } },
      siteUrl: "https://example.test/globe",
    });
    expect(input.earthLabel).toBe("NASA GIBS VIIRS true colour (time machine), 2026-09-20");
  });

  it("falls back to the prettified layer id, never claims 'live', when earth status isn't confirmed live", () => {
    const input = buildStampInput({
      style: "imagery",
      imageryBase: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      layers: allLayersOff(),
      status: { earth: { state: "failed" } },
      siteUrl: "https://example.test/globe",
    });
    expect(input.earthLabel).toBe("VIIRS SNPP CorrectedReflectance TrueColor (NASA GIBS)");
    expect(input.earthLabel).not.toMatch(/live/i);
  });

  it("labels the dot-matrix style honestly as not satellite imagery", () => {
    const input = buildStampInput({
      style: "dots",
      imageryBase: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      layers: allLayersOff(),
      status: {},
      siteUrl: "https://example.test/globe",
    });
    expect(input.earthLabel).toContain("not satellite imagery");
  });

  it("only lists a layer as live when it is both ON and status-confirmed live/snapshot", () => {
    const layers = allLayersOff();
    layers.satellites = true;
    layers.aircraft = true; // on, but no confirmed status below -- must be excluded
    layers.hazards = true; // on, status failed -- must be excluded
    const input = buildStampInput({
      style: "imagery",
      imageryBase: "x",
      layers,
      status: { satellites: { state: "live" }, hazards: { state: "failed" } },
      siteUrl: "https://example.test/globe",
    });
    expect(input.liveLayers).toEqual(["satellites"]);
  });

  it("includes a snapshot-state layer, not only live", () => {
    const layers = allLayersOff();
    layers.wind = true;
    const input = buildStampInput({
      style: "imagery",
      imageryBase: "x",
      layers,
      status: { wind: { state: "snapshot" } },
      siteUrl: "https://example.test/globe",
    });
    expect(input.liveLayers).toEqual(["wind"]);
  });
});

describe("buildStampLines", () => {
  it("omits the '+ live' line entirely when nothing is confirmed live", () => {
    const lines = buildStampLines({ earthLabel: "dot-matrix earth (not satellite imagery)", liveLayers: [], siteUrl: "https://example.test/globe" });
    expect(lines).toEqual(["dot-matrix earth (not satellite imagery)", "https://example.test/globe"]);
  });

  it("joins multiple live layers on one line", () => {
    const lines = buildStampLines({ earthLabel: "earth", liveLayers: ["satellites", "aircraft"], siteUrl: "https://example.test/globe" });
    expect(lines).toEqual(["earth", "+ live: satellites, aircraft", "https://example.test/globe"]);
  });
});
