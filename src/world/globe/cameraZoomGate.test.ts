import { describe, expect, it } from "vitest";
import {
  altitudeToStreetZoom,
  clampCameraFrameDelta,
  MAX_CAMERA_FRAME_SEC,
  armStreetHandoff,
  clearStreetHandoffForTest,
  consumeStreetHandoff,
  INTENT_STALE_MS,
  stepZoomHold,
  streetZoomToAltitude,
  ZOOM_HOLD_MS,
} from "./cameraZoomGate.ts";

describe("stepZoomHold", () => {
  it("a held pill advances without repeat events and release stops it", () => {
    let hold = stepZoomHold(0, 9, 9, clampCameraFrameDelta(0.2), 1000, true);
    expect(hold).toBe(200);
    hold = stepZoomHold(hold, 9, 9, clampCameraFrameDelta(0.2), 1200, true);
    expect(hold).toBe(ZOOM_HOLD_MS);
    expect(stepZoomHold(hold, 9, 9, clampCameraFrameDelta(0.2), 1400, false)).toBe(0);
  });

  it("accumulates while pinned at the minimum with fresh intent each step", () => {
    let hold = 0;
    hold = stepZoomHold(hold, 9, 9, 0.2, 0);
    expect(hold).toBe(200);
    hold = stepZoomHold(hold, 9.02, 9, 0.2, 0); // inside AT_MIN_EPSILON
    expect(hold).toBe(400);
  });

  it("resets the instant the camera leaves the minimum", () => {
    const hold = stepZoomHold(300, 12, 9, 0.2, 0);
    expect(hold).toBe(0);
  });

  it("crosses the trigger threshold after ~400ms of continuous dt and intent", () => {
    let hold = 0;
    let ms = 0;
    while (hold < ZOOM_HOLD_MS && ms < 2000) {
      hold = stepZoomHold(hold, 9, 9, 1 / 60, 0); // fresh intent every frame
      ms += 1000 / 60;
    }
    expect(hold).toBeGreaterThanOrEqual(ZOOM_HOLD_MS);
    expect(ms).toBeLessThan(500); // didn't take absurdly long to cross
  });

  it("ignores a non-positive dt instead of corrupting the hold", () => {
    expect(stepZoomHold(150, 9, 9, 0, 0)).toBe(150);
    expect(stepZoomHold(150, 9, 9, -1, 0)).toBe(150);
  });

  // LANE I2 (root cause): resting at the floor with NO further zoom-in input
  // must never accumulate toward the trigger -- this was the actual product
  // bug (V1's deep-zoom base threw a visitor into street view after 400ms of
  // just looking at the floor).
  it("never accumulates while resting at the floor with stale intent", () => {
    let hold = 0;
    for (let i = 0; i < 30; i++) {
      hold = stepZoomHold(hold, 9, 9, 1 / 60, 5000); // intent 5s stale
    }
    expect(hold).toBe(0);
  });

  it("resets mid-hold the moment intent goes stale, even while still at the floor", () => {
    let hold = stepZoomHold(0, 9, 9, 0.2, 0);
    expect(hold).toBe(200);
    hold = stepZoomHold(hold, 9, 9, 0.2, INTENT_STALE_MS + 1);
    expect(hold).toBe(0);
  });

  it("still accumulates right up to the intent-stale boundary", () => {
    const hold = stepZoomHold(200, 9, 9, 0.2, INTENT_STALE_MS);
    expect(hold).toBe(400);
  });
});

describe("altitudeToStreetZoom", () => {
  it("is 16.5 at the closest altitude and 12 at the farthest", () => {
    expect(altitudeToStreetZoom(3, 3, 36)).toBeCloseTo(16.5, 5);
    expect(altitudeToStreetZoom(36, 3, 36)).toBeCloseTo(12, 5);
  });

  it("clamps outside the band rather than extrapolating", () => {
    expect(altitudeToStreetZoom(-10, 3, 36)).toBeCloseTo(16.5, 5);
    expect(altitudeToStreetZoom(1000, 3, 36)).toBeCloseTo(12, 5);
  });

  it("is monotonically non-increasing with altitude", () => {
    const near = altitudeToStreetZoom(5, 3, 36);
    const far = altitudeToStreetZoom(20, 3, 36);
    expect(far).toBeLessThan(near);
  });
});

describe("streetZoomToAltitude", () => {
  it("is the inverse of altitudeToStreetZoom across the band", () => {
    for (const altitude of [3, 8, 15, 22, 36]) {
      const zoom = altitudeToStreetZoom(altitude, 3, 36);
      expect(streetZoomToAltitude(zoom, 3, 36)).toBeCloseTo(altitude, 5);
    }
  });

  it("clamps outside the band rather than extrapolating", () => {
    expect(streetZoomToAltitude(20, 3, 36)).toBeCloseTo(3, 5);
    expect(streetZoomToAltitude(0, 3, 36)).toBeCloseTo(36, 5);
  });
});

describe("street hand-off box", () => {
  it("reads once and clears", () => {
    clearStreetHandoffForTest();
    expect(consumeStreetHandoff()).toBeNull();
    armStreetHandoff({ zoom: 14.2 });
    expect(consumeStreetHandoff()).toEqual({ zoom: 14.2 });
    expect(consumeStreetHandoff()).toBeNull();
  });

  it("carries bearing/pitch alongside zoom", () => {
    clearStreetHandoffForTest();
    armStreetHandoff({ zoom: 15, bearing: 42.5, pitch: 30 });
    expect(consumeStreetHandoff()).toEqual({ zoom: 15, bearing: 42.5, pitch: 30 });
  });
});

it("a stalled frame cannot complete the zoom hold in one step", () => {
  expect(clampCameraFrameDelta(5)).toBe(MAX_CAMERA_FRAME_SEC);
  expect(stepZoomHold(0, 9, 9, clampCameraFrameDelta(5), 0)).toBeLessThan(ZOOM_HOLD_MS);
  expect(stepZoomHold(0, 9, 9, clampCameraFrameDelta(5), 1000, true)).toBeLessThan(ZOOM_HOLD_MS);
  expect(clampCameraFrameDelta(-1)).toBe(0);
  expect(clampCameraFrameDelta(NaN)).toBe(0);
  expect(clampCameraFrameDelta(1 / 60)).toBe(1 / 60);
});

it("three fresh 150ms frames complete the hold while every dt remains clamped", () => {
  let hold = 0;
  for (let frame = 0; frame < 3; frame++) hold = stepZoomHold(hold, 9, 9, clampCameraFrameDelta(0.15), 0);
  expect(hold).toBeCloseTo(450);
  expect(hold).toBeGreaterThanOrEqual(ZOOM_HOLD_MS);
  expect(MAX_CAMERA_FRAME_SEC * 1000).toBe(INTENT_STALE_MS);
});
