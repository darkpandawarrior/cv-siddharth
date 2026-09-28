import { describe, expect, it } from "vitest";
import { validateAction, validateActions } from "./validate.ts";

describe("validateAction — unknown / malformed input", () => {
  it.each([null, undefined, 42, "narrate", [], {}, { type: "compare" }, { type: 5 }])("rejects %j", (raw) => {
    expect(validateAction(raw)).toBeNull();
  });
});

describe("validateAction — flyTo", () => {
  it("accepts a valid flyTo", () => {
    expect(validateAction({ type: "flyTo", lat: 35.6, lon: 139.7 })).toEqual({ type: "flyTo", lat: 35.6, lon: 139.7 });
  });
  it("clamps out-of-range lat/lon rather than rejecting", () => {
    expect(validateAction({ type: "flyTo", lat: 999, lon: -999 })).toEqual({ type: "flyTo", lat: 90, lon: -180 });
  });
  it("drops a flyTo with a non-numeric lat", () => {
    expect(validateAction({ type: "flyTo", lat: "north", lon: 10 })).toBeNull();
  });
  it("clamps an out-of-range distance", () => {
    expect(validateAction({ type: "flyTo", lat: 0, lon: 0, distance: 9999 })).toEqual({ type: "flyTo", lat: 0, lon: 0, distance: 50 });
  });
});

describe("validateAction — flyToPlace / follow / select", () => {
  it("accepts and trims a flyToPlace query", () => {
    expect(validateAction({ type: "flyToPlace", query: "  Tokyo  " })).toEqual({ type: "flyToPlace", query: "Tokyo" });
  });
  it("rejects an empty flyToPlace query", () => {
    expect(validateAction({ type: "flyToPlace", query: "   " })).toBeNull();
  });
  it("accepts follow with a string entityId", () => {
    expect(validateAction({ type: "follow", entityId: "sat:25544" })).toEqual({ type: "follow", entityId: "sat:25544" });
  });
  it("rejects select missing an id", () => {
    expect(validateAction({ type: "select", kind: "quake" })).toBeNull();
  });
});

describe("validateAction — setLayer", () => {
  it("accepts a known layer id", () => {
    expect(validateAction({ type: "setLayer", id: "hazards", on: true })).toEqual({ type: "setLayer", id: "hazards", on: true });
  });
  it("rejects an unknown layer id", () => {
    expect(validateAction({ type: "setLayer", id: "not-a-layer", on: true })).toBeNull();
  });
  it("rejects a non-boolean `on`", () => {
    expect(validateAction({ type: "setLayer", id: "hazards", on: "true" })).toBeNull();
  });
});

describe("validateAction — setStyle / setView", () => {
  it("accepts a known style, rejects an unknown one", () => {
    expect(validateAction({ type: "setStyle", style: "dots" })).toEqual({ type: "setStyle", style: "dots" });
    expect(validateAction({ type: "setStyle", style: "cartoon" })).toBeNull();
  });
  it("accepts a known view, rejects an unknown one", () => {
    expect(validateAction({ type: "setView", view: "follow" })).toEqual({ type: "setView", view: "follow" });
    expect(validateAction({ type: "setView", view: "cinematic" })).toBeNull();
  });
});

describe("validateAction — setTime", () => {
  it("accepts and clamps offsetMin", () => {
    expect(validateAction({ type: "setTime", offsetMin: 10_000_000 })).toEqual({ type: "setTime", offsetMin: 525_600 });
  });
  it("accepts a valid isoDate", () => {
    expect(validateAction({ type: "setTime", isoDate: "2026-09-28T12:00:00Z" })).toEqual({
      type: "setTime",
      isoDate: "2026-09-28T12:00:00Z",
    });
  });
  it("rejects an unparsable isoDate", () => {
    expect(validateAction({ type: "setTime", isoDate: "not a date" })).toBeNull();
  });
  it("rejects when neither offsetMin nor isoDate is present", () => {
    expect(validateAction({ type: "setTime" })).toBeNull();
  });
});

describe("validateAction — filter", () => {
  it("clamps quakeMinMag and quakeSinceHours into range", () => {
    expect(validateAction({ type: "filter", quakeMinMag: 99, quakeSinceHours: -5 })).toEqual({
      type: "filter",
      quakeMinMag: 10,
      quakeSinceHours: 1,
    });
  });
  it("allows an empty filter (both fields omitted)", () => {
    expect(validateAction({ type: "filter" })).toEqual({ type: "filter" });
  });
});

describe("validateAction — narrate", () => {
  it("truncates to NARRATE_MAX_CHARS", () => {
    const text = "x".repeat(400);
    const action = validateAction({ type: "narrate", text });
    expect(action).not.toBeNull();
    expect((action as { text: string }).text).toHaveLength(280);
  });
  it("rejects an empty narrate", () => {
    expect(validateAction({ type: "narrate", text: "  " })).toBeNull();
  });
});

describe("validateActions — the whole-array cap", () => {
  it("drops anything past maxActions (default 5)", () => {
    const raw = Array.from({ length: 8 }, () => ({ type: "narrate", text: "hi" }));
    expect(validateActions(raw)).toHaveLength(5);
  });
  it("respects a custom maxActions", () => {
    const raw = Array.from({ length: 8 }, () => ({ type: "narrate", text: "hi" }));
    expect(validateActions(raw, { maxActions: 2 })).toHaveLength(2);
  });
  it("skips invalid entries rather than aborting the whole array", () => {
    const raw = [{ type: "narrate", text: "ok" }, { type: "bogus" }, { type: "setStyle", style: "dots" }];
    expect(validateActions(raw)).toEqual([
      { type: "narrate", text: "ok" },
      { type: "setStyle", style: "dots" },
    ]);
  });
  it("returns [] for anything that isn't an array", () => {
    expect(validateActions(null)).toEqual([]);
    expect(validateActions({ type: "narrate", text: "hi" })).toEqual([]);
  });
});
