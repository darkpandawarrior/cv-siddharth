import { afterEach, describe, expect, it, vi } from "vitest";
import { LAYER_IDS, entityPositions, useGlobe } from "../globeStore.ts";
import { buildGlobeContext, CONTEXT_MAX_BYTES } from "./context.ts";

const NOW = new Date("2026-09-28T12:00:00.000Z").getTime();

function resetStore() {
  useGlobe.setState({
    style: "imagery",
    layers: { buoys: false, markers: true, stars: true, satellites: true, aircraft: true, presence: true, pulses: true, hazards: true, wind: true, reach: true, countries: false, together: true, density: false, guide: true, daylight: true, eclipse: false },
    view: "orbit",
    focus: null,
    selected: null,
    timeOffsetMin: 0,
    tourStep: null,
    status: {},
    sheet: null,
    filters: {},
  });
  entityPositions.clear();
}

afterEach(() => {
  resetStore();
  vi.unstubAllGlobals();
});

describe("buildGlobeContext", () => {
  it("carries the simulated time and the currently-on layers", () => {
    resetStore();
    useGlobe.getState().setTimeOffset(-120);
    const ctx = buildGlobeContext(NOW);
    expect(ctx.simTime).toBe(new Date(NOW - 120 * 60_000).toISOString());
    expect(ctx.layersOn).toEqual(expect.arrayContaining(["hazards", "satellites"]));
    expect(ctx.layersOn).not.toContain("countries"); // off by default
  });

  it("reads camera lat/lon off a latlon focus", () => {
    resetStore();
    useGlobe.getState().flyTo({ kind: "latlon", lat: 35.6789, lon: 139.6123 });
    expect(buildGlobeContext(NOW).camera).toEqual({ lat: 35.7, lon: 139.6 });
  });

  it("reads camera lat/lon off an entity focus via entityPositions", () => {
    resetStore();
    entityPositions.set("sat:25544", () => ({ x: 6, y: 0, z: 0 }) as never);
    useGlobe.getState().flyTo({ kind: "entity", id: "sat:25544" });
    const ctx = buildGlobeContext(NOW);
    expect(ctx.camera).not.toBeNull();
  });

  it("carries the selection summary", () => {
    resetStore();
    useGlobe.getState().select({ id: "q1", kind: "quake", title: "M6.1 — 30km SE of Tokyo", rows: [], source: "USGS", live: true });
    expect(buildGlobeContext(NOW).selected).toEqual({ kind: "quake", title: "M6.1 — 30km SE of Tokyo" });
  });

  it("pulls quake/fire/storm counts and the top-5 list from window.__HAZARD_DEBUG__", () => {
    resetStore();
    vi.stubGlobal("window", {
      __HAZARD_DEBUG__: {
        quakes: 12,
        fires: 3,
        storms: 1,
        topQuakes: [
          { place: "30km SE of Tokyo", mag: 6.1 },
          { place: "off the coast of Chile", mag: 5.4 },
        ],
      },
      location: { search: "" },
    });
    const ctx = buildGlobeContext(NOW);
    expect(ctx.quakes).toEqual({ count: 12, top: [{ place: "30km SE of Tokyo", mag: 6.1 }, { place: "off the coast of Chile", mag: 5.4 }] });
    expect(ctx.fires).toBe(3);
    expect(ctx.storms).toBe(1);
  });

  it("never exceeds CONTEXT_MAX_BYTES, even in a worst-case state", () => {
    resetStore();
    const bigStatus: Record<string, { state: "live"; detail: string }> = {};
    for (const id of LAYER_IDS) bigStatus[id] = { state: "live", detail: "x".repeat(500) };
    useGlobe.setState({
      status: bigStatus as never,
      layers: Object.fromEntries(LAYER_IDS.map((id) => [id, true])) as never,
      selected: { id: "s", kind: "k", title: "y".repeat(500), rows: [], source: "s", live: true },
    });
    vi.stubGlobal("window", {
      __HAZARD_DEBUG__: {
        quakes: 999,
        fires: 40,
        storms: 12,
        topQuakes: Array.from({ length: 20 }, (_, i) => ({ place: `somewhere very far away number ${i}`, mag: 9 - i * 0.1 })),
      },
      location: { search: "" },
    });
    const ctx = buildGlobeContext(NOW);
    expect(new TextEncoder().encode(JSON.stringify(ctx)).length).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
  });
});
