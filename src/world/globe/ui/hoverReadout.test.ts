import { expect, test } from "vitest";
import { allowHoverFetch, HOVER_FETCH_GAP_MS, type HoverFetchHost, nearestQuakeWithin, windLabel } from "./hoverReadout.ts";
import type { Quake } from "../layers/quake.ts";

function quake(id: string, lat: number, lon: number, mag = 4): Quake {
  return { id, mag, place: "test", lat, lon, depthKm: 10, timeMs: 0, url: "" };
}

test("nearestQuakeWithin picks the closest quake inside the radius and ignores farther ones", () => {
  const point = { lat: 0, lon: 0 };
  const near = quake("near", 1, 1); // ~157 km
  const nearer = quake("nearer", 0.2, 0.2); // ~31 km
  const far = quake("far", 40, 40); // well past 300 km
  expect(nearestQuakeWithin([near, nearer, far], point)?.quake.id).toBe("nearer");
});

test("nearestQuakeWithin returns null past the radius, with no quakes, or with a null feed", () => {
  const point = { lat: 0, lon: 0 };
  expect(nearestQuakeWithin([quake("far", 40, 40)], point)).toBeNull();
  expect(nearestQuakeWithin([], point)).toBeNull();
  expect(nearestQuakeWithin(null, point)).toBeNull();
});

test("windLabel rounds speed to 0.1 and names the toward-compass point", () => {
  expect(windLabel(0, 10)).toEqual({ speed: 10, compass: "N" });
  expect(windLabel(10, 0)).toEqual({ speed: 10, compass: "E" });
  expect(windLabel(0, -10)).toEqual({ speed: 10, compass: "S" });
  expect(windLabel(-10, 0)).toEqual({ speed: 10, compass: "W" });
  expect(windLabel(3.04, 4.02).speed).toBeCloseTo(5, 1);
  expect(windLabel(0, 0)).toEqual({ speed: 0, compass: "calm" });
});

test("five fresh origins start together but each origin keeps its 1.5s gate", () => {
  const gates = new Map<HoverFetchHost, number>();
  for (const host of ["marine", "airQuality", "flood", "tide", "cape"] as const) {
    expect(allowHoverFetch(gates, host, 0)).toBe(true);
    expect(allowHoverFetch(gates, host, HOVER_FETCH_GAP_MS - 1)).toBe(false);
    expect(allowHoverFetch(gates, host, HOVER_FETCH_GAP_MS)).toBe(true);
  }
});
