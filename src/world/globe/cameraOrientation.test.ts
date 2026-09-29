import { describe, expect, it } from "vitest";
import { cameraForwardToBearingPitch } from "./cameraOrientation.ts";

// Focus point (0, 0): local up is +X, north is +Y, east is -Z (cameraMath.ts's
// own enuBasis at that point) -- picked because it makes the hand-derived
// expected vectors below easy to check by eye.
describe("cameraForwardToBearingPitch", () => {
  it("north-up top-down: looking straight down (nadir) gives bearing 0, pitch 0", () => {
    const { bearingDeg, pitchDeg } = cameraForwardToBearingPitch({ x: -1, y: 0, z: 0 }, 0, 0);
    expect(pitchDeg).toBeCloseTo(0, 5);
    expect(bearingDeg).toBeCloseTo(0, 5);
  });

  it("looking east with a 45 degree tilt gives bearing 90 and pitch 45, within 1 degree", () => {
    const s = Math.SQRT1_2; // cos(45deg) == sin(45deg)
    const { bearingDeg, pitchDeg } = cameraForwardToBearingPitch({ x: -s, y: 0, z: -s }, 0, 0);
    expect(pitchDeg).toBeCloseTo(45, 0);
    expect(bearingDeg).toBeCloseTo(90, 0);
  });

  it("clamps pitch to MapLibre's own 85 degree ceiling instead of extrapolating", () => {
    // Tilted past the horizon (forward's own component AWAY from nadir
    // exceeds it) -- the raw angle here is >85 deg; a caller must never see
    // that, only ever MapLibre's own supported band.
    const { pitchDeg } = cameraForwardToBearingPitch({ x: 0.2, y: 0, z: -1 }, 0, 0);
    expect(pitchDeg).toBeCloseTo(85, 5);
  });

  it("never returns a negative pitch", () => {
    const { pitchDeg } = cameraForwardToBearingPitch({ x: -1, y: 0.001, z: 0 }, 0, 0);
    expect(pitchDeg).toBeGreaterThanOrEqual(0);
  });
});
