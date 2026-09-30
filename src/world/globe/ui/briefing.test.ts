import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildBriefing, briefingLaunchSnapshot, briefingNumber, type BriefingInput } from "./briefing.ts";
import { LAUNCH_CACHE_TTL_MS, parseLaunches, setCachedLaunches } from "../layers/launches.ts";
const now = Date.parse("2026-09-30T12:00:00Z");
const snap = (data: unknown = null, error = false) => ({ data, error, nextPollAt: null });
const quake = (id: string, mag: number, at = now - 1000) => ({ id, properties: { mag, place: id, time: at }, geometry: { coordinates: [70, 20, 10] } });
const input = (): BriefingInput => ({ nowMs: now, quakes: snap(), eonet: snap(), gvp: snap(), kp: snap(), iss: null, satelliteReason: "Satellites layer is off", launches: snap() });
it("opening and reopening reuse HazardLayer's fresh launch cache without requests", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const launches = parseLaunches({ results: [{ id: "next", name: "Next launch", net: new Date(now + 3600000).toISOString(), pad: { latitude: "10", longitude: "20" } }] }, now)!;
  setCachedLaunches(storage, launches, now);
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  try {
    for (const at of [now, now + 1000]) {
      const cards = buildBriefing({ ...input(), nowMs: at, launches: briefingLaunchSnapshot(at, storage) }).cards;
      expect(cards.map(card => card.item.id)).toEqual(["launch:next"]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(briefingLaunchSnapshot(now + LAUNCH_CACHE_TTL_MS + 1, storage).data).toBeNull();
    expect(briefingLaunchSnapshot(now, storage, true)).toMatchObject({ data: null, error: true });
    expect(briefingLaunchSnapshot(now, undefined).data).toBeNull();
    // An accidental subscriber would open another provider request on mount.
    const surface = readFileSync(new URL("./Briefing.tsx", import.meta.url), "utf8");
    expect(surface).not.toMatch(/subscribeLiveSignal|useLiveSignal\s*\(|\bfetch\s*\(/);
  } finally { fetchSpy.mockRestore(); }
});
it("discloses five slots in a fixed order with source, instant, kind and en-IN numbers", () => {
  const i = input();
  i.quakes = snap({ features: [quake("smaller", 3), quake("strongest", 6), quake("stale", 9, now - 86400001), quake("future", 10, now + 1)] });
  i.eonet = snap({ events: [{ id: "e1", title: "Fire—report", categories: [{ id: "wildfires" }], geometry: [{ type: "Point", date: new Date(now - 2000).toISOString(), coordinates: [30, 10] }] }] });
  i.gvp = snap({ volcanoes: [{ id: "v1", name: "Volcano", country: "ID", at: now - 1000, week: "weekly", summary: "Reported", lat: 10, lon: 20 }] });
  i.kp = snap([{ Kp: 3.33, time_tag: "2026-09-30 09:00:00" }]);
  i.iss = { id: "sat:25544", kind: "satellite", title: "ISS", source: "CelesTrak TLE, SGP4", rows: [], live: false, focus: { kind: "entity", id: "sat:25544" } };
  i.launches = snap({ results: [2, 1].map(n => ({ id: String(n), name: `Launch ${n}`, net: new Date(now + n * 3600000).toISOString(), pad: { latitude: "10", longitude: "20" } })) });
  const result = buildBriefing(i);
  expect(result.cards.map(c => c.item.id)).toEqual(["quake:strongest", "gvp:v1:weekly", "kp:2026-09-30 09:00:00", "sat:25544", "launch:1"]);
  expect(result.cards.map(c => c.kind)).toEqual(["measured", "reported", "measured", "computed", "scheduled"]);
  for (const c of result.cards) { expect(c.item.source).not.toBe(""); expect(Number.isFinite(c.item.whenMs)).toBe(true); expect(c.selection.live).toBe(false); }
  expect(result.cards[3].selection.kind).toBe("satellite");
  expect(JSON.stringify(result)).not.toContain("—");
  expect(briefingNumber(1234567.89)).toBe("12,34,567.89");
});
it("names absent and failed sources, rejecting last-good snapshots", () => {
  const i = input();
  i.quakes = snap({ features: [quake("good", 6)] }, true);
  const r = buildBriefing(i);
  expect(r.cards).toEqual([]);
  expect(r.unavailable.map(s => s.source)).toEqual(["USGS", "NASA EONET", "Smithsonian GVP / USGS", "NOAA SWPC", "CelesTrak ISS", "Launch Library 2"]);
  expect(r.unavailable[0].reason).toBe("Latest request failed");
  expect(r.unavailable[1].reason).toContain("Waiting");
  expect(r.unavailable[4].satellites).toBe(true);
});
it("rejects stale, future, invalid coordinates and invalid Kp readings", () => {
  const i = input();
  i.quakes = snap({ features: [quake("old", 7, now - 86400001), quake("future", 9, now + 1), { ...quake("bad", 8), geometry: { coordinates: [Infinity, 100, 10] } }] });
  i.eonet = snap({ events: [{ id: "old", title: "old", categories: [{ id: "wildfires" }], geometry: [{ type: "Point", date: new Date(now - 31 * 86400000).toISOString(), coordinates: [20, 10] }] }] });
  i.gvp = snap({ volcanoes: [{ id: "old", name: "old", at: now - 15 * 86400000 }] });
  i.kp = snap([{ Kp: 3, time_tag: new Date(now - 7 * 3600000).toISOString() }]);
  expect(buildBriefing(i).cards).toEqual([]);
  expect(buildBriefing(i).unavailable[0].reason).toContain("24 h");
  i.kp = snap([{ Kp: 10, time_tag: new Date(now).toISOString() }]);
  expect(buildBriefing(i).cards).toEqual([]);
});

it("keeps exact window boundaries and rejects every failed last-good source", () => {
  const i = input();
  i.quakes = snap({ features: [quake("boundary", 6, now - 86400000)] });
  i.eonet = snap({ events: [{ id: "boundary", title: "Report", categories: [{ id: "wildfires" }], geometry: [{ type: "Point", date: new Date(now - 30 * 86400000).toISOString(), coordinates: [20, 10] }] }] });
  i.kp = snap([{ Kp: 0, time_tag: new Date(now - 6 * 3600000).toISOString() }]);
  i.launches = snap({ results: [{ id: "next", name: "Next launch", net: new Date(now + 2 * 86400000).toISOString(), pad: { latitude: "10", longitude: "20" } }] });
  expect(buildBriefing(i).cards.map(c => c.kind)).toEqual(["measured", "reported", "measured", "scheduled"]);
  for (const key of ["quakes", "eonet", "gvp", "kp", "launches"] as const) i[key] = { ...i[key], error: true };
  const result = buildBriefing(i);
  expect(result.cards).toEqual([]);
  expect(result.unavailable.filter(row => row.reason === "Latest request failed")).toHaveLength(5);
});
