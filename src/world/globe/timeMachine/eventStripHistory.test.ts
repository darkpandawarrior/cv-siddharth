import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("shares one request per feed and keeps valid emptiness separate from failure", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ metadata: { generated: 1_000_000_000 }, features: [] }) });
  vi.stubGlobal("fetch", fetch);
  const { loadReplaySnapshot } = await import("./eventStripHistory.ts");
  const first = loadReplaySnapshot();
  expect(loadReplaySnapshot()).toBe(first);
  const snapshot = await first;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(snapshot.history?.times.length).toBe(0);
  expect(snapshot.sources).toEqual([{ start: 1_000_000_000 - 7 * 86_400_000, end: 1_000_000_000, minMag: 2.5 }]);
});
it("does not claim coverage without a source timestamp or after malformed responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ features: null }) }));
  const { loadReplaySnapshot } = await import("./eventStripHistory.ts");
  expect(await loadReplaySnapshot()).toMatchObject({ history: { times: new Float64Array() }, sources: [] });
});
it("reports failure when both feeds fail", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const { loadReplaySnapshot } = await import("./eventStripHistory.ts");
  expect(await loadReplaySnapshot()).toMatchObject({ history: null, sources: [] });
});
