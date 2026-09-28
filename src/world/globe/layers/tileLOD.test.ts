import { describe, expect, it } from "vitest";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { foreshortenFactor, isBeyondHorizon, isInViewCone, pixelWorldSize, selectLevel, subCameraLatLon, visibleCapHalfAngleDeg } from "./tileLOD.ts";

describe("selectLevel", () => {
  it("picks a coarser level at max camera distance than at min distance", () => {
    const fov = (42 * Math.PI) / 180;
    const far = selectLevel(42, fov, 900, 8);
    const near = selectLevel(9, fov, 900, 8);
    expect(near).toBeGreaterThan(far);
  });

  it("never exceeds the layer's own maxLevel even zoomed in far past it", () => {
    const fov = (42 * Math.PI) / 180;
    expect(selectLevel(0.01, fov, 900, 5)).toBe(5);
  });

  it("stays at level 0 far enough out that even the coarsest texel is smaller than a pixel", () => {
    const fov = (42 * Math.PI) / 180;
    expect(selectLevel(100_000, fov, 900, 8)).toBe(0);
  });
});

describe("pixelWorldSize", () => {
  it("grows with distance and shrinks with more canvas pixels", () => {
    expect(pixelWorldSize(20, 0.7, 900)).toBeGreaterThan(pixelWorldSize(10, 0.7, 900));
    expect(pixelWorldSize(20, 0.7, 1800)).toBeLessThan(pixelWorldSize(20, 0.7, 900));
  });
});

describe("isBeyondHorizon", () => {
  const camera = { x: 20, y: 0, z: 0 }; // straight out along +X, distance 20 > GLOBE_RADIUS(6)

  it("the point directly under the camera is not beyond the horizon", () => {
    expect(isBeyondHorizon({ x: 1, y: 0, z: 0 }, camera)).toBe(false);
  });

  it("the point on the exact opposite side of the globe is beyond the horizon", () => {
    expect(isBeyondHorizon({ x: -1, y: 0, z: 0 }, camera)).toBe(true);
  });

  it("a camera inside the globe radius culls nothing (degenerate, never blank the view)", () => {
    expect(isBeyondHorizon({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(false);
  });

  // Regression: the first version of this function tested only a tile's
  // CENTRE point with no allowance for the tile's own angular size, so a
  // coarse tile whose centre had just dipped past the true horizon was
  // dropped even though most of its body was still visible — a real
  // screenshot at the default camera view showed the whole southern half
  // of the visible cap missing because of exactly this. `extraAngleRadians`
  // relaxes the threshold by that much.
  it("extraAngleRadians keeps a point just past the strict horizon when it's within that margin", () => {
    // The strict horizon for this camera/globe pair (d=20, R=6) is acos(0.3)
    // ~= 72.5deg; 80deg is ~7.5deg past it, comfortably inside a 20deg margin.
    const justPast = { x: Math.cos((80 * Math.PI) / 180), y: Math.sin((80 * Math.PI) / 180), z: 0 };
    expect(isBeyondHorizon(justPast, camera, GLOBE_RADIUS)).toBe(true); // strict: beyond
    expect(isBeyondHorizon(justPast, camera, GLOBE_RADIUS, (20 * Math.PI) / 180)).toBe(false); // widened by 20deg: back in
  });

  it("break-it: extraAngleRadians never pulls in a point that's still far beyond even the widened horizon", () => {
    expect(isBeyondHorizon({ x: -1, y: 0, z: 0 }, camera, GLOBE_RADIUS, (20 * Math.PI) / 180)).toBe(true);
  });

  // Break-it: prove the cos(horizon)=R/d threshold is really being compared,
  // not a fixed constant — a point exactly AT that threshold angle for one
  // camera distance is on the visible side of a much closer camera.
  it("break-it: the same point direction flips across the horizon as distance changes", () => {
    const grazing = { x: GLOBE_RADIUS / 20, y: Math.sqrt(1 - (GLOBE_RADIUS / 20) ** 2), z: 0 }; // exactly at the horizon for d=20
    expect(isBeyondHorizon(grazing, { x: 20, y: 0, z: 0 })).toBe(false); // <=, so grazing itself counts visible
    expect(isBeyondHorizon(grazing, { x: 6.01, y: 0, z: 0 })).toBe(true); // much closer camera: same direction is now past ITS OWN, tighter horizon
  });
});

describe("isInViewCone", () => {
  // Camera far out along +X looking back at the origin (forward = -X): the
  // sub-camera point (+X on the sphere) sits almost exactly along that
  // forward vector from the camera's own position, the way it would for any
  // real orbit camera looking at the globe.
  const cameraPos = { x: 100, y: 0, z: 0 };
  const forward = { x: -1, y: 0, z: 0 };

  it("the sub-camera point is in view", () => {
    expect(isInViewCone({ x: 1, y: 0, z: 0 }, cameraPos, forward, 0.3)).toBe(true);
  });

  it("a point 90 degrees off to the side is out of view even with generous margin", () => {
    const closeCam = { x: 9, y: 0, z: 0 };
    expect(isInViewCone({ x: 0, y: 1, z: 0 }, closeCam, { x: -1, y: 0, z: 0 }, 0.3, 1.5)).toBe(false);
  });

  // Break-it: this is the exact bug tileSelect.test.ts caught — comparing a
  // point's own radial direction to `forward` instead of the camera-to-point
  // direction reads the sub-camera point itself as "behind" whenever the
  // camera sits close to the surface. Prove close range still works.
  it("break-it: at close range (camera barely above the surface) the sub-camera point is still in view", () => {
    const closeCam = { x: 9, y: 0, z: 0 }; // GLOBE_RADIUS=6, so only 3 units of altitude
    const closeForward = { x: -1, y: 0, z: 0 };
    expect(isInViewCone({ x: 1, y: 0, z: 0 }, closeCam, closeForward, 0.4)).toBe(true);
  });
});

describe("foreshortenFactor", () => {
  it("is ~1 at the sub-camera point and falls toward 0 near the limb", () => {
    const camera = { x: 20, y: 0, z: 0 };
    const subPoint = { x: 1, y: 0, z: 0 };
    const limbPoint = { x: GLOBE_RADIUS / 20, y: Math.sqrt(1 - (GLOBE_RADIUS / 20) ** 2), z: 0 };
    expect(foreshortenFactor(subPoint, camera)).toBeGreaterThan(0.99);
    expect(foreshortenFactor(limbPoint, camera)).toBeLessThan(0.2);
  });
});

describe("visibleCapHalfAngleDeg / subCameraLatLon", () => {
  it("grows with distance (farther camera sees more of the globe)", () => {
    expect(visibleCapHalfAngleDeg({ x: 42, y: 0, z: 0 })).toBeGreaterThan(visibleCapHalfAngleDeg({ x: 9, y: 0, z: 0 }));
  });

  it("reports the sub-camera lat/lon matching latLonToXyz's own frame", () => {
    const overPuneish = { x: Math.cos(0.34), y: Math.sin(0.34), z: 0 };
    const { lat } = subCameraLatLon({ x: overPuneish.x * 20, y: overPuneish.y * 20, z: overPuneish.z * 20 });
    expect(lat).toBeGreaterThan(15);
    expect(lat).toBeLessThan(25);
  });
});
