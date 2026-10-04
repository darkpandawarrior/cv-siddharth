import { describe, expect, test } from "vitest";
import { LAYER_IDS, type LayerId } from "../globeStore.ts";
import { LAYER_PRESETS, layerIdsToToggle, presetCaveat, presetImagery, presetLayerRecord } from "./layerPresets.ts";

const allOff = Object.fromEntries(LAYER_IDS.map((id) => [id, false])) as Record<LayerId, boolean>;

describe("LAYER_PRESETS", () => {
  test("every preset id is unique and every layersOn id is a real LayerId", () => {
    const ids = LAYER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of LAYER_PRESETS) for (const id of preset.layersOn) expect(LAYER_IDS).toContain(id);
  });
});

describe("presetLayerRecord", () => {
  test("Storms turns on exactly hazards and wind, every other layer off", () => {
    const storms = LAYER_PRESETS.find((p) => p.id === "storms")!;
    const record = presetLayerRecord(LAYER_IDS, storms);
    for (const id of LAYER_IDS) expect(record[id]).toBe(id === "hazards" || id === "wind");
  });

  test("Clean turns every layer off", () => {
    const clean = LAYER_PRESETS.find((p) => p.id === "clean")!;
    const record = presetLayerRecord(LAYER_IDS, clean);
    for (const id of LAYER_IDS) expect(record[id]).toBe(false);
  });

  test("My world turns on markers, reach, guide and presence (story arcs)", () => {
    const myWorld = LAYER_PRESETS.find((p) => p.id === "myWorld")!;
    const record = presetLayerRecord(LAYER_IDS, myWorld);
    expect(record.markers).toBe(true);
    expect(record.reach).toBe(true);
    expect(record.guide).toBe(true);
    expect(record.presence).toBe(true);
    expect(record.hazards).toBe(false);
  });
});

describe("layerIdsToToggle", () => {
  test("only names ids that actually differ, never a no-op re-toggle", () => {
    const current = { ...allOff, markers: true, hazards: true };
    const desired = { ...allOff, markers: true, wind: true }; // markers stays on, hazards drops, wind rises
    const toggled = layerIdsToToggle(current, desired, LAYER_IDS);
    expect(toggled.sort()).toEqual(["hazards", "wind"].sort());
  });

  test("restoring a snapshot is the exact inverse of applying a preset", () => {
    const storms = LAYER_PRESETS.find((p) => p.id === "storms")!;
    const before = { ...allOff, markers: true };
    const desired = presetLayerRecord(LAYER_IDS, storms);
    const applied = { ...before };
    for (const id of layerIdsToToggle(before, desired, LAYER_IDS)) applied[id] = !applied[id];
    expect(applied).toEqual(desired);
    const restored = { ...applied };
    for (const id of layerIdsToToggle(applied, before, LAYER_IDS)) restored[id] = !restored[id];
    expect(restored).toEqual(before);
  });
});

describe("presetImagery", () => {
  const current = { base: "VIIRS_SNPP_CorrectedReflectance_TrueColor", overlays: [{ id: "IMERG_Precipitation_Rate", opacity: 0.5 }] };

  test("undefined overlayIds leaves the current imagery stack untouched", () => {
    const space = LAYER_PRESETS.find((p) => p.id === "space")!;
    expect(presetImagery(current, space, 0.75)).toBe(current); // reference-equal: no write needed
  });

  test("Storms replaces overlays with the GOES infrared pair at the default opacity", () => {
    const storms = LAYER_PRESETS.find((p) => p.id === "storms")!;
    const result = presetImagery(current, storms, 0.75);
    expect(result.base).toBe(current.base);
    expect(result.overlays).toEqual([
      { id: "GOES-East_ABI_Band13_Clean_Infrared", opacity: 0.75 },
      { id: "GOES-West_ABI_Band13_Clean_Infrared", opacity: 0.75 },
    ]);
  });

  test("Night lights clears weather overlays and Clean hides clouds", () => {
    const night = LAYER_PRESETS.find((preset) => preset.id === "nightLights")!;
    expect(presetImagery(current, night, 0.75).overlays).toEqual([]);
    expect(night.cloudsOn).toBe(false);
    expect(LAYER_PRESETS.find((preset) => preset.id === "clean")!.storyArcsOn).toBe(false);
    expect(LAYER_PRESETS.find((preset) => preset.id === "myWorld")!.storyArcsOn).toBe(true);
    expect(LAYER_PRESETS.find((preset) => preset.id === "clean")!.cloudsOn).toBe(false);
    expect(LAYER_PRESETS.find((preset) => preset.id === "storms")!.cloudsOn).toBe(true);
  });

  test("Clean clears every overlay", () => {
    const clean = LAYER_PRESETS.find((p) => p.id === "clean")!;
    expect(presetImagery(current, clean, 0.75).overlays).toEqual([]);
  });
});

describe("presetCaveat", () => {
  const storms = LAYER_PRESETS.find((p) => p.id === "storms")!;

  test("no caveat when every turned-on feed is healthy", () => {
    expect(presetCaveat(storms, { hazards: { state: "live" }, wind: { state: "live" } })).toBeNull();
  });

  // Break the guard once (a failed feed must not be swallowed silently),
  // then restore it: this test IS the restore — it asserts the caveat
  // actually fires, which is what a silently-dropped `status[id]?.state`
  // read (the break) would fail.
  test("names a turned-on layer or overlay that is currently reporting failed", () => {
    const caveat = presetCaveat(storms, { hazards: { state: "failed", detail: "USGS unreachable" }, wind: { state: "live" } });
    expect(caveat).toContain("hazards");
    expect(caveat).toContain("unavailable");
  });

  test("never mentions a layer this preset never turns on", () => {
    const caveat = presetCaveat(storms, { markers: { state: "failed" } });
    expect(caveat).toBeNull();
  });
});
