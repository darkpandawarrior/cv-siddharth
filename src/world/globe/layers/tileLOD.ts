// WAVE 2 LANE W1 (deep zoom): level-of-detail selection and horizon/frustum
// culling. Pure vector math (plain {x,y,z}, not three.Vector3) so this is
// unit-testable with no WebGL and no React — TileLayer.tsx is the only
// caller that touches three.
import { GLOBE_RADIUS } from "../geoMath.ts";
import { groundResolutionMetersPerPixel } from "./tileMatrix.ts";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

// GLOBE_RADIUS (6 world units) is 6,371 km real Earth radius (globeStore.ts's
// own frame doc), so this is the same real-world conversion EarthImagery's
// neighbours already assume, just inverted for tiles: a level's ground
// metres-per-pixel becomes a world-unit size directly comparable to a screen
// pixel's own world-unit footprint.
const METERS_PER_WORLD_UNIT = (6371 / GLOBE_RADIUS) * 1000;

/** The world-unit ground footprint of one screen pixel at `distance` from
 *  the camera, for a perspective camera — the frustum's own height at that
 *  distance (2 d tan(fov/2)) divided by the canvas height in pixels. Exact
 *  for a plane perpendicular to the view direction; a fair approximation for
 *  the sphere near the sub-camera point, which is the only place this
 *  matters (glancing tiles near the limb are handled by `foreshortenFactor`
 *  below, not by this formula trying to be exact there too). */
export function pixelWorldSize(distance: number, fovRadians: number, canvasHeightPx: number): number {
  return (2 * distance * Math.tan(fovRadians / 2)) / Math.max(1, canvasHeightPx);
}

/** The finest level (within [0, maxLevel]) whose ground texel is still no
 *  bigger than one screen pixel at `distance` — one level finer would
 *  oversample (more bytes fetched for no visible gain), one level coarser
 *  would visibly blur. Levels are ordered finest-ground-resolution-last-in
 *  (texel size strictly decreases as level increases in GIBS_LEVELS), so the
 *  first level whose texel already fits inside a pixel is the answer; if
 *  none does (the visitor is zoomed in past what NASA published), the
 *  coarsest^H^Hfinest available level is the honest answer instead of
 *  inventing detail that doesn't exist. */
export function selectLevel(distance: number, fovRadians: number, canvasHeightPx: number, maxLevel: number): number {
  const pxWorld = pixelWorldSize(distance, fovRadians, canvasHeightPx);
  for (let level = 0; level <= maxLevel; level++) {
    const texelWorld = groundResolutionMetersPerPixel(level) / METERS_PER_WORLD_UNIT;
    if (texelWorld <= pxWorld) return level;
  }
  return maxLevel;
}

/** True when a point on the globe (given as its own unit direction from the
 *  centre) is behind the sphere as seen from `cameraPos` — the same
 *  `cos(horizon) = GLOBE_RADIUS / camDist` test SatelliteLayer.tsx's own
 *  `isOccluded` already uses for label visibility, restated here per this
 *  lane's file-ownership rule rather than imported from a file this lane may
 *  not edit.
 *
 *  `extraAngleRadians` widens the horizon by that much (relaxing the
 *  threshold, never tightening it) — the same fix `isInViewCone` needed and
 *  for the same reason: testing only a tile's CENTRE point drops a coarse
 *  tile whose centre has just dipped past the true horizon while most of
 *  its own body is still visible (caught the same way — a real screenshot
 *  at the default view showing the whole southern half of the visible cap
 *  missing, not a unit test). tileSelect.ts passes the tile's own angular
 *  half-size here, same as it does for the view cone. */
export function isBeyondHorizon(pointDir: Vec3, cameraPos: Vec3, globeRadius: number = GLOBE_RADIUS, extraAngleRadians = 0): boolean {
  const camDist = length(cameraPos);
  if (camDist <= globeRadius) return false; // camera inside/at the surface: degenerate, never cull
  const camDir = normalize(cameraPos);
  const horizonAngle = Math.acos(Math.min(1, globeRadius / camDist));
  const threshold = Math.cos(Math.min(Math.PI, horizonAngle + extraAngleRadians));
  return dot(pointDir, camDir) < threshold;
}

/** True when a surface point (given as its own unit direction from the
 *  globe's centre) sits inside the camera's view cone, generously padded
 *  (tiles just outside the strict FOV still get requested so a small pan or
 *  the tile's own corners — this test only sees the centre — don't pop in a
 *  frame late).
 *
 *  Deliberately takes `cameraPos`, not just `cameraForward`: at this globe's
 *  own scale (min distance 9, radius 6 — the camera sits barely above the
 *  surface) a point's own radial direction from the globe's centre is NOT a
 *  usable stand-in for the direction from the CAMERA to that point. The
 *  first version of this function compared the wrong two vectors and culled
 *  the entire visible cap, including the tile directly under the camera —
 *  caught by tileSelect.test.ts's "tile under the camera" case, which is
 *  exactly why that test exists. */
export function isInViewCone(
  surfacePointDir: Vec3,
  cameraPos: Vec3,
  cameraForward: Vec3,
  halfFovRadians: number,
  marginFactor = 1.5,
  // A coarse tile close to the camera can span a real chunk of the sky —
  // testing only its CENTRE point against a tight cone wrongly drops a tile
  // whose body still overlaps the view (e.g. the tile actually under the
  // camera, when the camera's own lat/lon sits near that tile's edge rather
  // than its centre, which is the common case, not the exception). Callers
  // with a wide tile pass its own angular half-size here on top of the FOV
  // margin; tileSelect.ts does exactly that.
  extraRadiusRadians = 0,
  globeRadius: number = GLOBE_RADIUS,
): boolean {
  const toPoint = normalize({
    x: surfacePointDir.x * globeRadius - cameraPos.x,
    y: surfacePointDir.y * globeRadius - cameraPos.y,
    z: surfacePointDir.z * globeRadius - cameraPos.z,
  });
  const cosHalf = Math.cos(Math.min(Math.PI / 2, halfFovRadians * marginFactor + extraRadiusRadians));
  return dot(toPoint, normalize(cameraForward)) >= cosHalf;
}

/** How much a point near the limb is foreshortened toward the camera — 1 at
 *  the sub-camera point (looking straight down at it), falling to 0 at the
 *  grazing horizon. Exported for TileLayer.tsx to darken/fade tiles whose
 *  screen footprint the flat `pixelWorldSize` formula above under-counts,
 *  without folding that per-tile cost into `selectLevel` itself (ponytail:
 *  one shared level per frame, not a per-tile LOD walk — the visible cap at
 *  this globe's own min distance (9 units, radius 6) never spans enough
 *  angle for the difference to read as a seam; upgrade path if a future
 *  closer min-distance ever makes one visible). */
export function foreshortenFactor(pointDir: Vec3, cameraPos: Vec3): number {
  const toCam = normalize({ x: cameraPos.x - pointDir.x * GLOBE_RADIUS, y: cameraPos.y - pointDir.y * GLOBE_RADIUS, z: cameraPos.z - pointDir.z * GLOBE_RADIUS });
  return Math.max(0, dot(normalize(pointDir), toCam));
}

/** The camera-facing point's lat/lon (the sub-camera point), and the
 *  half-angle (degrees, central angle from the globe's centre) of the visible
 *  cap around it before the sphere's own horizon cuts it off. Used to bound
 *  which row/col range is even worth testing, so a deep-zoom frame never
 *  walks the whole matrix (320x160 tiles at 250m's own top level) to find
 *  the handful actually on screen. */
export function visibleCapHalfAngleDeg(cameraPos: Vec3, globeRadius: number = GLOBE_RADIUS): number {
  const camDist = length(cameraPos);
  if (camDist <= globeRadius) return 90;
  return Math.acos(Math.min(1, globeRadius / camDist)) * RAD2DEG;
}

export function subCameraLatLon(cameraPos: Vec3): { lat: number; lon: number } {
  const dir = normalize(cameraPos);
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, dir.y))) * RAD2DEG,
    lon: Math.atan2(-dir.z, dir.x) * RAD2DEG,
  };
}

export { DEG2RAD, RAD2DEG };
