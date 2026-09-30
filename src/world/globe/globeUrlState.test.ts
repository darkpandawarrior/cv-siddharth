import { describe, expect, it } from "vitest";
import { cameraToLatLonAlt, hasShareFields, parseShareState, serializeShareState, type ShareState } from "./globeUrlState.ts";
import { LAYER_IDS } from "./globeStore.ts";

const FULL: ShareState = {
  lat: 18.5204,
  lon: 73.8567,
  alt: 26.4,
  view: "orbit",
  timeOffsetMin: -120,
  layers: ["markers", "satellites", "hazards"],
  base: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
  overlays: [{ id: "Reference_Labels", opacity: 0.75 }],
  selectionId: "pune-hq",
};

describe("serializeShareState / parseShareState round trip", () => {
  it("round-trips every field of a well-formed state", () => {
    const parsed = parseShareState(serializeShareState(FULL));
    expect(parsed).toEqual(FULL);
  });

  it("round-trips through a real URLSearchParams instance, not just a string", () => {
    const params = new URLSearchParams(serializeShareState(FULL));
    expect(parseShareState(params)).toEqual(FULL);
  });

  it("accepts a leading '?' the same as location.search provides", () => {
    const parsed = parseShareState(`?${serializeShareState(FULL)}`);
    expect(parsed.lat).toBeCloseTo(FULL.lat, 3);
  });

  it("wraps longitude past 180 to the equivalent meridian", () => {
    const qs = serializeShareState({ ...FULL, lon: 190 });
    expect(parseShareState(qs).lon).toBeCloseTo(-170, 3);
  });

  it("clamps camera bounds and rejects a time beyond the share window", () => {
    const qs = serializeShareState({ ...FULL, lat: 999, alt: -50, timeOffsetMin: 999_999 });
    const parsed = parseShareState(qs);
    expect(parsed.lat).toBe(90);
    expect(parsed.alt).toBeGreaterThan(6);
    expect(parsed.timeOffsetMin).toBeUndefined();
  });

  it("drops an empty state to an empty (but not absent-vs-empty-layers-ambiguous) query", () => {
    expect(hasShareFields(parseShareState(""))).toBe(false);
  });
});

describe("parseShareState: malformed / hostile input never throws and is ignored field-by-field", () => {
  const garbage = [
    "lat=abc&lon=xyz&alt=nope&view=orbit",
    "view=<script>alert(1)</script>",
    "view=orbit; DROP TABLE users;--",
    "ly=hack,markers,'; DROP TABLE",
    "base=" + "a".repeat(500),
    "sel=" + "%00".repeat(50),
    "lat=NaN&lon=Infinity&alt=-Infinity&t=NaN",
    "lat=1e999&lon=-1e999",
    "ov=markers:abc,hack:99,:0.5,foo:",
    "lat=&lon=&alt=&view=&t=&ly=&base=&ov=&sel=",
    "",
    "%F0%9F%92%A5%F0%9F%92%A5", // raw emoji bytes, no keys at all
    "lat[]=1&lon[]=2",
    "__proto__=polluted&constructor=polluted",
  ];

  it("every hand-picked hostile query parses without throwing", () => {
    for (const qs of garbage) {
      expect(() => parseShareState(qs)).not.toThrow();
    }
  });

  it("every accepted field, across a deterministic fuzz sweep, is in-range and well-typed", () => {
    // A small seeded LCG, not Math.random(): deterministic across runs so a
    // failure here is reproducible, not a flake. Same "no new dependency"
    // discipline the rest of this lane follows (no fast-check import).
    let seed = 42;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const tokens = ["", "abc", "NaN", "Infinity", "-Infinity", "1e999", "<script>x</script>", "'; DROP TABLE", "💥", "a".repeat(300), "0", "-0", "90.00001", "-999999", String(rand() * 1e10)];
    const keys = ["lat", "lon", "alt", "view", "t", "ly", "base", "ov", "sel"];

    for (let i = 0; i < 500; i++) {
      const params = new URLSearchParams();
      for (const key of keys) {
        if (rand() < 0.6) params.set(key, tokens[Math.floor(rand() * tokens.length)]);
      }
      const parsed = parseShareState(params);

      if (parsed.lat !== undefined) expect(parsed.lat).toBeGreaterThanOrEqual(-90);
      if (parsed.lat !== undefined) expect(parsed.lat).toBeLessThanOrEqual(90);
      if (parsed.lon !== undefined) expect(parsed.lon).toBeGreaterThanOrEqual(-180);
      if (parsed.lon !== undefined) expect(parsed.lon).toBeLessThan(180);
      if (parsed.alt !== undefined) expect(Number.isFinite(parsed.alt)).toBe(true);
      if (parsed.view !== undefined) expect(["orbit", "ground", "follow", "street"]).toContain(parsed.view);
      if (parsed.timeOffsetMin !== undefined) expect(Number.isFinite(parsed.timeOffsetMin)).toBe(true);
      if (parsed.layers !== undefined) for (const id of parsed.layers) expect(LAYER_IDS as readonly string[]).toContain(id);
      if (parsed.base !== undefined) expect(parsed.base.length).toBeLessThanOrEqual(80);
      if (parsed.overlays !== undefined) for (const o of parsed.overlays) expect(o.opacity).toBeGreaterThanOrEqual(0);
      if (parsed.overlays !== undefined) for (const o of parsed.overlays) expect(o.opacity).toBeLessThanOrEqual(1);
      if (parsed.selectionId != null) expect(parsed.selectionId.length).toBeLessThanOrEqual(120);
    }
  });

  it("an unknown view value is ignored rather than coerced", () => {
    expect(parseShareState("view=hyperspace").view).toBeUndefined();
  });

  it("an unknown layer id is filtered out of the layer list, valid ones kept", () => {
    expect(parseShareState("ly=markers,not-a-real-layer,hazards").layers).toEqual(["markers", "hazards"]);
  });

  it("a base id outside the allowed charset is dropped", () => {
    expect(parseShareState("base=<img src=x onerror=alert(1)>").base).toBeUndefined();
  });

  it("this module's own LAYER_IDS copy has not drifted from globeStore.ts", () => {
    expect(parseShareState(`ly=${LAYER_IDS.join(",")}`).layers).toEqual(Array.from(LAYER_IDS));
  });
});

describe("cameraToLatLonAlt", () => {
  it("recovers lat/lon for a point on the +X axis (0N, 0E)", () => {
    const { lat, lon, alt } = cameraToLatLonAlt(20, 0, 0);
    expect(lat).toBeCloseTo(0, 6);
    expect(lon).toBeCloseTo(0, 6);
    expect(alt).toBeCloseTo(20, 6);
  });

  it("recovers the north pole", () => {
    const { lat } = cameraToLatLonAlt(0, 15, 0);
    expect(lat).toBeCloseTo(90, 6);
  });

  it("never returns NaN for the degenerate zero vector", () => {
    const { lat, lon, alt } = cameraToLatLonAlt(0, 0, 0);
    expect(Number.isFinite(lat)).toBe(true);
    expect(Number.isFinite(lon)).toBe(true);
    expect(Number.isFinite(alt)).toBe(true);
  });
});

const NOW = Date.UTC(2026, 8, 30, 12);
describe("honest shared layers and time", () => {
  it("preserves an explicitly all-off layer set", () => {
    const qs = serializeShareState({ ...FULL, layers: [] }, NOW);
    expect(qs).toContain("ly=");
    expect(parseShareState(qs, NOW).layers).toEqual([]);
  });
  it("shares an out-of-range time as the same absolute UTC minute", () => {
    const qs = serializeShareState({ ...FULL, timeOffsetMin: 144000 }, NOW);
    const params = new URLSearchParams(qs);
    expect(params.has("t")).toBe(false);
    expect(params.get("at")).toBe("2027-01-08T12:00Z");
    expect(parseShareState(qs, NOW).timeOffsetMin).toBe(144000);
    expect(parseShareState(qs, NOW + 1440 * 60000).timeOffsetMin).toBe(142560);
    expect(new URLSearchParams(serializeShareState({ ...FULL, timeOffsetMin: 144000.9 }, NOW)).get("at")).toBe(params.get("at"));
    params.set("t", "5");
    expect(parseShareState(params, NOW).timeOffsetMin).toBe(144000);
  });
  it("rejects malformed, non-UTC, invalid calendar and outside-window instants", () => {
    for (const at of ["2027-11-05T12:01Z", "2026-08-31T11:59Z", "garbage", "2027-01-08T12:00+00:00", "2027-01-08T12:00:00Z", "2027-02-30T12:00Z", "2027-01-08T24:00Z"]) {
      expect(parseShareState(new URLSearchParams({ at }), NOW).timeOffsetMin).toBeUndefined();
      expect(parseShareState(new URLSearchParams({ at, t: "15" }), NOW).timeOffsetMin).toBe(15);
    }
    for (const minutes of [-30 * 1440, 400 * 1440]) {
      const at = new Date(NOW + minutes * 60000).toISOString().slice(0, 16) + "Z";
      expect(parseShareState(new URLSearchParams({ at }), NOW).timeOffsetMin).toBe(minutes);
    }
  });
  it("keeps relative minutes and the parser's original clamps", () => {
    for (const minutes of [-43200, -120, 0, 2880]) {
      const params = new URLSearchParams(serializeShareState({ ...FULL, timeOffsetMin: minutes }, NOW));
      expect(params.has("at")).toBe(false);
      expect(params.get("t")).toBe(String(minutes));
      expect(parseShareState(params, NOW).timeOffsetMin).toBe(minutes);
    }
    expect(parseShareState("t=999999", NOW).timeOffsetMin).toBe(2880);
    expect(parseShareState("t=-999999", NOW).timeOffsetMin).toBe(-43200);
  });
});
