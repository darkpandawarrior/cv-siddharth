import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { feedItemSelection, inspectBriefingSatellite, satelliteBriefingSelection } from "./feedItemSelection.ts";
import { propagateState } from "../../../lib/satelliteEcef.ts";
import { tleEpoch } from "../../../lib/satellites.ts";
import { useGlobe } from "../globeStore.ts";
import * as passes from "../layers/satPasses.ts";
import * as satellites from "../../../lib/satellites.ts";
import tle from "../../../../e2e/fixtures/tle.json";
const object = tle.objects.find(object => object.norad === "25544")!;
const now = new Date(tleEpoch(object.l1).getTime() + 86400000);
const state = propagateState(object, now)!;
beforeEach(() => { vi.spyOn(satellites, "nextVisiblePass").mockResolvedValue({ start: now, maxElDeg: 42 }); });
afterEach(() => { vi.restoreAllMocks(); useGlobe.getState().select(null); });
it("mirrors a feed click including optional focus and snapshot status", () => {
  const item = { id: "quake:1", kind: "quake" as const, title: "Quake", detail: "10 km", source: "USGS", live: false, whenMs: 1000, severity: "warn" as const, focus: { kind: "latlon" as const, lat: 20, lon: 70 } };
  expect(feedItemSelection(item, 61000)).toEqual({ id: item.id, kind: item.kind, title: item.title, rows: [{ label: "detail", value: "10 km" }, { label: "when", value: "1m ago" }], source: "USGS", live: false, focus: item.focus });
  expect(feedItemSelection({ ...item, focus: undefined }, 61000).focus).toBeUndefined();
});

it("keeps ISS scene identity and rows, labelling propagation as computed", () => {
  const selection = satelliteBriefingSelection(object, state);
  expect(selection.kind).toBe("satellite");
  expect(selection.id).toBe("sat:25544");
  expect(selection.rows.map(row => row.label)).toEqual(["NORAD id", "Altitude", "Speed", "Lat/lon", "Sunlit", "TLE epoch age", "Next visible pass (Pune)"]);
  expect(selection.live).toBe(false);
  expect(selection.source).toContain("computed");
  expect(selection.source).toContain(`TLE epoch ${tleEpoch(object.l1).toISOString()}`);
  expect(selection.source).not.toContain(tle.epochNewest);
  expect(selection.rows.find(row => row.label === "TLE epoch age")?.value).toBe("1.0 days");
});

it("computes the scene click's next pass rows only on Inspect", async () => {
  const pass = { start: now, end: new Date(+now + 255000), maxElDeg: 42.2, startAzDeg: 45, endAzDeg: 225, durationMin: 4.25 };
  const scan = vi.spyOn(passes, "nextVisiblePassDetail").mockResolvedValue(pass);
  const selection = satelliteBriefingSelection(object, state);
  expect(scan).not.toHaveBeenCalled();
  await inspectBriefingSatellite(selection, object, now);
  expect(scan).toHaveBeenCalledWith(object, now);
  expect(useGlobe.getState().selected).toMatchObject({ kind: "satellite", focus: { kind: "entity", id: "sat:25544" } });
  expect(useGlobe.getState().selected?.rows.slice(6)).toEqual([
    { label: "Next visible pass (Pune)", value: passes.formatPuneClock(now) },
    { label: "Max elevation", value: "42°" }, { label: "Direction", value: "NE → SW" }, { label: "Duration", value: "4:15" },
  ]);
});

it("reports no pass and a failed scan honestly, preserving later selections", async () => {
  const scan = vi.spyOn(passes, "nextVisiblePassDetail").mockResolvedValue(null);
  const selection = satelliteBriefingSelection(object, state);
  await inspectBriefingSatellite(selection, object, now);
  expect(useGlobe.getState().selected?.rows.at(-1)?.value).toBe("none in the next 7 days");
  scan.mockRejectedValueOnce(new Error("scan failed"));
  await inspectBriefingSatellite(selection, object, now);
  expect(useGlobe.getState().selected?.rows.at(-1)?.value).toBe("unavailable");
  let resolve!: (pass: null) => void;
  scan.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = inspectBriefingSatellite(selection, object, now);
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  const later = { ...selection, id: "quake:later", kind: "quake" };
  useGlobe.getState().select(later);
  resolve(null);
  await pending;
  expect(useGlobe.getState().selected).toBe(later);
});

it("bounds the scan in half-day batches without the shared idle boundary", async () => {
  const scan = vi.mocked(satellites.nextVisiblePass).mockResolvedValue(null);
  const detail = vi.spyOn(passes, "nextVisiblePassDetail");
  await inspectBriefingSatellite(satelliteBriefingSelection(object, state), object, now);
  expect(scan).toHaveBeenCalledTimes(14);
  expect(scan.mock.calls.every(call => call[3] === 0.5)).toBe(true);
  expect(scan.mock.calls.at(-1)?.[1].getTime()).toBe(+now + 13 * 43_200_000);
  expect(detail).not.toHaveBeenCalled();
  expect(useGlobe.getState().selected?.rows.at(-1)?.value).toBe("none in the next 7 days");
});
