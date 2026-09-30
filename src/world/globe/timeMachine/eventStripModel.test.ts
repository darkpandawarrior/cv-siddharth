import { describe, expect, it } from "vitest";
import { parseUsgsHistory } from "./usgsHistory.ts";
import { eventBins } from "./eventStripModel.ts";
const history = parseUsgsHistory({ features: [
  ...[["a", 0, 4.5], ["b", 10, 5], ["c", 20, 6], ["d", 5, 3]].map(([id, time, mag]) => ({ id, properties: { time, mag }, geometry: { coordinates: [0, 0, 10] } })),
] })!;
const snapshot = { history, sources: [{ start: 0, end: 20, minMag: 4.5 }], fetchedAt: 20 };
describe("event-density bins", () => {
  it("bins actual records once with half-open edges and magnitude filtering", () => {
    const bins = eventBins(snapshot, 0, 20, 4.5, 2);
    expect(bins.map((b) => b.records.map((i) => history.id[i]))).toEqual([["a"], ["b"]]);
    expect(bins.every((b) => b.covered)).toBe(true);
    expect(eventBins(snapshot, 0, 20, 5.5, 2).map((b) => b.records.length)).toEqual([0, 0]);
  });
  it("distinguishes zero, failed, partial, future and insufficient magnitude coverage", () => {
    expect(eventBins({ ...snapshot, history: null, sources: [] }, 0, 20, 4.5, 2).every((b) => !b.covered)).toBe(true);
    expect(eventBins(snapshot, 0, 20, 2.5, 2).every((b) => !b.covered)).toBe(true);
    expect(eventBins(snapshot, 0, 30, 4.5, 3).map((b) => b.covered)).toEqual([true, true, false]);
    expect(eventBins({ ...snapshot, sources: [{ start: 5, end: 20, minMag: 4.5 }] }, 0, 20, 4.5, 2).map((b) => b.covered)).toEqual([false, true]);
    expect(eventBins({ ...snapshot, sources: [{ start: 0, end: 10, minMag: 4.5 }, { start: 10, end: 20, minMag: 4.5 }] }, 0, 20, 4.5, 1)[0].covered).toBe(true);
  });
  it("rejects invalid windows and does not extrapolate outside the requested range", () => {
    for (const [a, b, n] of [[0, 0, 8], [NaN, 20, 8], [0, 20, 0], [0, 20, 65]]) expect(() => eventBins(snapshot, a, b, 4.5, n)).toThrow(RangeError);
    expect(eventBins(snapshot, 11, 19, 4.5, 2).flatMap((b) => b.records)).toEqual([]);
  });
});
