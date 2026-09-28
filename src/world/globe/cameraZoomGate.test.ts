import { describe, expect, it } from "vitest";
import {
  altitudeToStreetZoom,
  armStreetHandoff,
  clearStreetHandoffForTest,
  consumeStreetHandoff,
  stepZoomHold,
  streetZoomToAltitude,
  ZOOM_HOLD_MS,
} from "./cameraZoomGate.ts";

describe("stepZoomHold", () => {
  it("accumulates while pinned at the minimum", () => {
    let hold = 0;
    hold = stepZoomHold(hold, 9, 9, 0.2);
    expect(hold).toBe(200);
    hold = stepZoomHold(hold, 9.02, 9, 0.2); // inside AT_MIN_EPSILON
    expect(hold).toBe(400);
  });

  it("resets the instant the camera leaves the minimum", () => {
    const hold = stepZoomHold(300, 12, 9, 0.2);
    expect(hold).toBe(0);
  });

  it("crosses the trigger threshold after ~400ms of continuous dt", () => {
    let hold = 0;
    let ms = 0;
    while (hold < ZOOM_HOLD_MS && ms < 2000) {
      hold = stepZoomHold(hold, 9, 9, 1 / 60);
      ms += 1000 / 60;
    }
    expect(hold).toBeGreaterThanOrEqual(ZOOM_HOLD_MS);
    expect(ms).toBeLessThan(500); // didn't take absurdly long to cross
  });

  it("ignores a non-positive dt instead of corrupting the hold", () => {
    expect(stepZoomHold(150, 9, 9, 0)).toBe(150);
    expect(stepZoomHold(150, 9, 9, -1)).toBe(150);
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
});
