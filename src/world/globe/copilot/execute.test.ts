import { afterEach, describe, expect, it, vi } from "vitest";
import { entityPositions, useGlobe } from "../globeStore.ts";
import { executeActions, runGlobeAsk } from "./execute.ts";

function freshStore() {
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
  freshStore();
  vi.unstubAllGlobals();
});

describe("executeActions — one handler per action type, on a fresh store", () => {
  it("flyTo sets store.focus", () => {
    freshStore();
    executeActions([{ type: "flyTo", lat: 10, lon: 20 }]);
    expect(useGlobe.getState().focus).toEqual({ kind: "latlon", lat: 10, lon: 20, distance: undefined });
  });

  it("flyToPlace resolves through the gazetteer", () => {
    freshStore();
    const summary = executeActions([{ type: "flyToPlace", query: "Tokyo" }]);
    expect(useGlobe.getState().focus).toEqual({ kind: "latlon", lat: 35.6762, lon: 139.6503 });
    expect(summary).toContain("Tokyo");
  });

  it("flyToPlace reports an unresolved query without touching focus", () => {
    freshStore();
    const summary = executeActions([{ type: "flyToPlace", query: "Nowhereville Prime" }]);
    expect(useGlobe.getState().focus).toBeNull();
    expect(summary).toContain("couldn't find");
  });

  it("follow sets an entity focus and switches to follow view", () => {
    freshStore();
    executeActions([{ type: "follow", entityId: "sat:25544" }]);
    expect(useGlobe.getState().focus).toEqual({ kind: "entity", id: "sat:25544" });
    expect(useGlobe.getState().view).toBe("follow");
  });

  it("setLayer toggles exactly the named layer", () => {
    freshStore();
    executeActions([{ type: "setLayer", id: "hazards", on: false }]);
    expect(useGlobe.getState().layers.hazards).toBe(false);
    expect(useGlobe.getState().layers.satellites).toBe(true); // untouched
  });

  it("setLayer is a no-op when the layer is already in that state", () => {
    freshStore();
    const before = useGlobe.getState().layers;
    executeActions([{ type: "setLayer", id: "hazards", on: true }]); // already true
    expect(useGlobe.getState().layers).toBe(before); // same object — toggleLayer never called
  });

  it("setStyle sets store.style", () => {
    freshStore();
    executeActions([{ type: "setStyle", style: "dots" }]);
    expect(useGlobe.getState().style).toBe("dots");
  });

  it("setTime with offsetMin sets the scrubber directly", () => {
    freshStore();
    executeActions([{ type: "setTime", offsetMin: -360 }]);
    expect(useGlobe.getState().timeOffsetMin).toBe(-360);
  });

  it("setTime with isoDate converts to a minute offset from now", () => {
    freshStore();
    const iso = new Date(Date.now() + 60 * 60_000).toISOString();
    executeActions([{ type: "setTime", isoDate: iso }]);
    expect(useGlobe.getState().timeOffsetMin).toBeGreaterThan(55);
    expect(useGlobe.getState().timeOffsetMin).toBeLessThan(65);
  });

  it("select fills the inspector with a minimal selection", () => {
    freshStore();
    executeActions([{ type: "select", kind: "quake", id: "q1" }]);
    expect(useGlobe.getState().selected).toMatchObject({ id: "q1", kind: "quake", source: "Ask the globe", live: false });
  });

  it("filter merges into store.filters without clobbering an unmentioned field", () => {
    freshStore();
    executeActions([{ type: "filter", quakeMinMag: 5 }]);
    executeActions([{ type: "filter", quakeSinceHours: 24 }]);
    expect(useGlobe.getState().filters).toEqual({ quakeMinMag: 5, quakeSinceHours: 24 });
  });

  it("setView sets store.view", () => {
    freshStore();
    executeActions([{ type: "setView", view: "ground" }]);
    expect(useGlobe.getState().view).toBe("ground");
  });

  it("narrate touches no store field, only the returned summary", () => {
    freshStore();
    const before = useGlobe.getState();
    const summary = executeActions([{ type: "narrate", text: "12 quakes above M5 this week." }]);
    expect(useGlobe.getState()).toBe(before);
    expect(summary).toBe("12 quakes above M5 this week.");
  });

  it("applies several actions in order", () => {
    freshStore();
    executeActions([
      { type: "setLayer", id: "hazards", on: true },
      { type: "filter", quakeMinMag: 5 },
    ]);
    expect(useGlobe.getState().layers.hazards).toBe(true);
    expect(useGlobe.getState().filters.quakeMinMag).toBe(5);
  });
});

describe("runGlobeAsk — deterministic-first, LLM fallback", () => {
  it("a recognised phrase never calls fetch", async () => {
    freshStore();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await runGlobeAsk("fly to Tokyo");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useGlobe.getState().focus).toEqual({ kind: "latlon", lat: 35.6762, lon: 139.6503 });
  });

  it("an unrecognised phrase calls the LLM path and applies its actions", async () => {
    freshStore();
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ actions: [{ type: "setStyle", style: "dots" }], narrate: "Switched to dots." }), { status: 200 }),
      ),
    );
    const summary = await runGlobeAsk("what's happening in Japan");
    expect(useGlobe.getState().style).toBe("dots");
    expect(summary).toContain("Switched to dots.");
  });

  it("invalid LLM JSON produces a narrate and no store change", async () => {
    freshStore();
    const before = useGlobe.getState().style;
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json at all", { status: 200 })));
    const summary = await runGlobeAsk("what's happening in Japan");
    expect(useGlobe.getState().style).toBe(before);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});
