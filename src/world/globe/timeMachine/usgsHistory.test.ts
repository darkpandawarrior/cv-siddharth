import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuakes } from "../layers/quake.ts";
import { filterMagnitude, parseUsgsHistory, pulseState } from "./index.ts";

const month = JSON.parse(readFileSync(new URL("../../../../e2e/fixtures/history/usgs-4.5-month.geojson", import.meta.url), "utf8"));
const week = JSON.parse(readFileSync(new URL("../../../../e2e/fixtures/history/usgs-2.5-week.geojson", import.meta.url), "utf8"));
const history = parseUsgsHistory(month, week)!;
const expected = [...new Map([...parseQuakes(month)!, ...parseQuakes(week)!].map((q) => [q.id, q])).values()].sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id));
const feature = (id: string, time: number, mag = 4.5) => ({ id, properties: { time, mag, place: null }, geometry: { type: "Point", coordinates: [73, 18, -1] } });
const small = parseUsgsHistory({ features: [feature("c", 20), feature("b", 10), feature("a", 10)] })!;

describe("USGS replay columns", () => {
  it("parses fixture counts and de-duplicates the overlapping feeds", () => {
    expect(parseUsgsHistory(month)!.times.length).toBe(509);
    expect(parseUsgsHistory(week)!.times.length).toBe(327);
    expect(history.id).toEqual(expected.map((q) => q.id));
    expect(history.times.length).toBe(716);
    expect(509 + 327 - history.times.length).toBe(120);
    expect(new Set(history.id).size).toBe(history.id.length);
    expect(parseUsgsHistory(month, month)!.times.length).toBe(509);
  });
  it("preserves sorted timestamps and aligned float32 columns", () => {
    expect(history.times).toBeInstanceOf(Float64Array);
    for (const column of [history.lat, history.lon, history.mag, history.depth]) expect(column).toBeInstanceOf(Float32Array);
    expected.forEach((q, i) => {
      expect(history.times[i]).toBe(q.timeMs);
      expect(history.lat[i]).toBe(Math.fround(q.lat));
      expect(history.lon[i]).toBe(Math.fround(q.lon));
      expect(history.mag[i]).toBe(Math.fround(q.mag));
      expect(history.depth[i]).toBe(Math.fround(q.depthKm));
      expect(history.place[i]).toBe(q.place);
      if (i) expect(history.times[i]).toBeGreaterThanOrEqual(history.times[i - 1]);
    });
  });
  it("uses the later feed's complete revision and retains missing-place convention", () => {
    const merged = parseUsgsHistory({ features: [feature("a", 1)] }, { features: [feature("a", 2, 5)] })!;
    expect([...merged.times]).toEqual([2]);
    expect([...merged.mag]).toEqual([5]);
    expect(merged.place).toEqual(["unknown location"]);
    expect([...merged.depth]).toEqual([-1]);
  });
  it("distinguishes a failed feed from valid emptiness", () => {
    for (const input of [null, false, {}, { features: null }, { features: "bad" }]) expect(parseUsgsHistory(input)).toBeNull();
    expect(parseUsgsHistory(month, null)).toBeNull();
    expect(parseUsgsHistory({ features: [] })!.times.length).toBe(0);
    expect(parseUsgsHistory()!.times.length).toBe(0);
  });
  it("drops malformed records before packing, including float overflow", () => {
    const good = feature("ok", 1);
    const invalid = [null, 3, {}, { ...good, id: "" }, { ...good, id: 5 },
      { ...good, properties: { ...good.properties, time: NaN } },
      { ...good, properties: { ...good.properties, mag: Infinity } },
      { ...good, properties: { ...good.properties, mag: 1e100 } },
      { ...good, properties: { ...good.properties, place: 5 } },
      ...[[181, 0, 1], [0, 91, 1], [NaN, 0, 1], [0, NaN, 1], [0, 0, 1e100], [0, 0, NaN], [0, 0, "1"]].map((coordinates) => ({ ...good, geometry: { coordinates } }))];
    expect(parseUsgsHistory({ features: [...invalid, good] })!.id).toEqual(["ok"]);
  });
});

describe("allocation-free windows and magnitude selection", () => {
  it("returns the caller buffer with half-open bounds, including tied times", () => {
    const out = new Uint32Array(3).fill(99);
    expect(small.eventsBetween(10, 20, out)).toBe(out);
    expect([...out]).toEqual([0, 2, 99]);
    expect([...small.eventsBetween(20, 21, out)]).toEqual([2, 3, 99]);
    expect([...small.eventsBetween(10, 10, out)]).toEqual([0, 0, 99]);
    expect([...small.eventsBetween(11, 20, out)]).toEqual([2, 2, 99]);
    expect([...small.eventsBetween(0, 9, out)]).toEqual([0, 0, 99]);
    expect([...small.eventsBetween(21, 100, out)]).toEqual([3, 3, 99]);
    expect([...parseUsgsHistory()!.eventsBetween(0, 100, out)]).toEqual([0, 0, 99]);
  });
  it("matches a linear oracle at every fixture timestamp and outer edges", () => {
    const out = new Uint32Array(2);
    for (const t of [history.times[0] - 1, ...history.times, history.times[history.times.length - 1] + 1]) {
      history.eventsBetween(t, t + 1, out);
      expect(history.id.slice(out[0], out[1])).toEqual(expected.filter((q) => q.timeMs >= t && q.timeMs < t + 1).map((q) => q.id));
    }
    history.eventsBetween(history.times[0], history.times[history.times.length - 1] + 1, out);
    expect([...out]).toEqual([0, history.times.length]);
  });
  it("rejects invalid windows and buffers before writing", () => {
    expect(() => small.eventsBetween(0, 1, new Uint32Array(1))).toThrow(RangeError);
    const out = new Uint32Array([99, 99]);
    for (const [start, end] of [[2, 1], [NaN, 2], [0, Infinity]]) expect(() => small.eventsBetween(start, end, out)).toThrow(RangeError);
    expect([...out]).toEqual([99, 99]);
  });
  it("filters inclusive magnitude thresholds using the supplied index storage", () => {
    const out = new Uint32Array(history.times.length);
    const count = filterMagnitude(history, 0, history.times.length, 4.5, out);
    expect([...out.slice(0, count)]).toEqual([...history.mag.keys()].filter((i) => history.mag[i] >= 4.5));
    expect(filterMagnitude(small, 1, 3, 4.5, out)).toBe(2);
    expect([...out.slice(0, 2)]).toEqual([1, 2]);
    expect(filterMagnitude(small, 0, 3, Infinity, out)).toBe(0);
    expect(filterMagnitude(small, 0, 3, -Infinity, out)).toBe(3);
    expect(filterMagnitude(small, 0, 0, 0, new Uint32Array())).toBe(0);
  });
  it("rejects invalid filter ranges and insufficient capacity", () => {
    for (const [start, end, min] of [[-1, 1, 0], [0.5, 2, 0], [0, 1.5, 0], [2, 1, 0], [0, 4, 0], [0, 3, NaN]]) {
      expect(() => filterMagnitude(small, start, end, min, new Uint32Array(3))).toThrow(RangeError);
    }
    expect(() => filterMagnitude(small, 0, 3, 0, new Uint32Array(2))).toThrow(RangeError);
  });
});

describe("replay pulse", () => {
  it("attacks quickly then decays smoothly to zero", () => {
    expect([-1, 0, 60, 120, 1060, 2000, 3000].map((t) => pulseState(0, t, 1))).toEqual([0, 0, 0.5, 1, 0.5, 0, 0]);
    for (let t = -10; t < 2100; t++) {
      expect(pulseState(0, t, 1)).toBeGreaterThanOrEqual(0);
      expect(pulseState(0, t, 1)).toBeLessThanOrEqual(1);
    }
  });
  it("scales wall-time envelopes for forward, reverse and paused playback", () => {
    for (const speed of [0.5, 1, 60, 600, 3600, -60]) expect(pulseState(1000, 1000 + 120 * speed, speed)).toBe(1);
    expect(pulseState(0, 120, 0)).toBe(1);
    expect(pulseState(0, 120, -1)).toBe(0);
    for (const args of [[NaN, 0, 1], [0, Infinity, 1], [0, 120, NaN]]) expect(pulseState(...args as [number, number, number])).toBe(0);
  });
});
