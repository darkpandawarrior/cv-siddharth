import { expect, it } from "vitest";
import { pinnedValues, utc } from "./pinnedReadout.ts";
import type { WindResponse } from "../../../../api/_lib/wind-handler.ts";
const wind: WindResponse = { connected: true, stale: true, modelTime: "2026-09-30T11:00:00Z", grid: { latStart: -90, latStep: 180, latCount: 2, lonStart: -180, lonStep: 180, lonCount: 2 }, u: [3,3,3,3], v: [4,4,4,4], attribution: [] };
const quake = { type: "FeatureCollection", features: [{ id: "q", properties: { mag: 4, time: Date.parse("2026-09-30T11:30:00Z"), place: "Test event", url: "https://earthquake.usgs.gov/" }, geometry: { type: "Point", coordinates: [0,0,10] } }] };
it("recomputes astronomy and filters future events while retaining source model time", () => {
  const at = new Date("2026-09-30T12:00:00Z"), earlier = new Date("2026-09-30T10:00:00Z");
  const rows = pinnedValues({ lat: 0, lon: 0 }, at, wind, quake);
  const past = pinnedValues({ lat: 0, lon: 0 }, earlier, wind, quake);
  expect(rows[0].value).not.toEqual(past[0].value);
  expect(rows[1].value).not.toEqual(past[1].value);
  expect(rows[2].value).toBe("5.0 m/s toward NE");
  expect(rows[2].source).toContain("stale"); expect(rows[2].time).toContain("11:00 UTC");
  expect(rows[3].value).toBe("M4.0 · 0 km away"); expect(rows[3].time).toContain("11:30 UTC");
  expect(past[3].value).toContain("Unavailable");
});
it("never fabricates a reading or timestamp from failed or malformed sources", () => {
  const point = { lat: 0, lon: 0 }, at = new Date("2026-09-30T12:00:00Z");
  for (const w of [null, { ...wind, u: [] }, { ...wind, modelTime: null }, { ...wind, v: [NaN,4,4,4] }, { ...wind, u: null } as unknown as WindResponse, { ...wind, grid: { ...wind.grid!, latCount: 1.5 } }]) expect(pinnedValues(point, at, w, null)[2].value).toBe("Unavailable");
  const failed = pinnedValues(point, at, wind, quake, true, true);
  expect(failed[2].value).toBe("Unavailable"); expect(failed[3].value).toContain("failed");
  expect(pinnedValues(point, at, wind, { features: [null] })[3].value).toContain("Unavailable");
  expect(utc(null)).toBe("Observation time unavailable");
});
it("preserves current model instants and daily periods without inventing timestamps", async () => {
  const { modelObservationTime } = await import("./pinnedReadout.ts");
  expect(modelObservationTime({ current: { time: "2026-09-30T11:15" } })).toBe("2026-09-30 11:15 UTC");
  expect(modelObservationTime({ daily: { time: ["2026-09-30"] } })).toContain("daily model period");
  expect(modelObservationTime({ current: { time: "garbage" } })).toBeNull();
  expect(modelObservationTime(null)).toBeNull();
  expect(modelObservationTime({ current: { time: "2026-02-30T11:15" } })).toBeNull();
  expect(modelObservationTime({ daily: { time: ["2026-02-30"] } })).toBeNull();
});
