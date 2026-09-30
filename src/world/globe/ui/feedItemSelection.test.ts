import { expect, it } from "vitest";
import { feedItemSelection, satelliteBriefingSelection } from "./feedItemSelection.ts";
it("mirrors a feed click including optional focus and snapshot status", () => {
  const item = { id: "quake:1", kind: "quake" as const, title: "Quake", detail: "10 km", source: "USGS", live: false, whenMs: 1000, severity: "warn" as const, focus: { kind: "latlon" as const, lat: 20, lon: 70 } };
  expect(feedItemSelection(item, 61000)).toEqual({ id: item.id, kind: item.kind, title: item.title, rows: [{ label: "detail", value: "10 km" }, { label: "when", value: "1m ago" }], source: "USGS", live: false, focus: item.focus });
  expect(feedItemSelection({ ...item, focus: undefined }, 61000).focus).toBeUndefined();
});

it("keeps ISS scene identity and rows, labelling propagation as computed", () => {
  const selection = satelliteBriefingSelection({ norad: "25544", name: "ISS", l1: "", l2: "" }, { altKm: 420, speedKmS: 7.66, latDeg: 10, lonDeg: 20, sunlit: true, epochAgeDays: 1, ecef: { x: 1, y: 2, z: 3 } });
  expect(selection.kind).toBe("satellite");
  expect(selection.id).toBe("sat:25544");
  expect(selection.rows.map(row => row.label)).toEqual(["NORAD id", "Altitude", "Speed", "Lat/lon", "Sunlit", "TLE epoch age"]);
  expect(selection.live).toBe(false);
  expect(selection.source).toContain("computed");
});
