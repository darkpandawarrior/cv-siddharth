// WAVE 6 LANE X5 (seamless zoom hand-off, verifier-flagged blocking gap):
// pure math turning the orbit camera's actual forward (view) direction into
// the MapLibre bearing/pitch that "matches" it at the focus point street
// level opens over. The original hand-off (cameraZoomGate.ts) only ever
// derived zoom from altitude; bearing/pitch at map-init were StreetView.tsx's
// own hardcoded STREET_BEARING/STREET_PITCH constants, unrelated to where
// the orbit camera was actually looking. No three, no R3F, no DOM -- same
// discipline as cameraMath.ts/cameraZoomGate.ts, which this module builds on
// (enuBasis) and feeds (its result rides across the chunk boundary in
// cameraZoomGate.ts's own StreetHandoff box).
import { enuBasis, vDot, vNorm, vScale, vSub, type Vec3 } from "./cameraMath.ts";

const RAD_TO_DEG = 180 / Math.PI;
// MapLibre's own hard ceiling (the brief's own number) -- StreetView.tsx's
// Map constructor must also raise `maxPitch` to this same value, or MapLibre
// silently re-clamps anything past its default 60 regardless of what this
// function hands it.
const MAPLIBRE_MAX_PITCH = 85;

/**
 * The orbit camera always looks straight at the globe's own centre
 * (OrbitControls' fixed target, GlobeScene.tsx never overrides it), so its
 * `forward` is always the radial line from the camera to the origin --
 * exactly the negated unit direction CameraDirector.tsx already computes for
 * `xyzToLatLon` at the same call site. This function stays general rather
 * than hardcoding that fact, so it is meaningfully testable on its own:
 * MapLibre's own convention is pitch 0 = looking straight down (nadir),
 * pitch 90 = the horizon, bearing 0 = north pointing up the screen.
 *
 * At pitch 0 `forward` has no horizontal (tangent-plane) component to derive
 * a heading from -- `Math.atan2(0, 0)` returning exactly 0 for that
 * degenerate case (a language guarantee, not a special-cased branch here) is
 * what makes "north-up top-down" fall out of the same formula as a tilted
 * shot, rather than needing its own branch and its own (harder to verify)
 * choice of fallback bearing.
 */
export function cameraForwardToBearingPitch(
  forward: Vec3,
  focusLatDeg: number,
  focusLonDeg: number,
): { bearingDeg: number; pitchDeg: number } {
  const { east, north, up } = enuBasis(focusLatDeg, focusLonDeg);
  const f = vNorm(forward);

  const nadirDot = Math.max(-1, Math.min(1, vDot(f, vScale(up, -1))));
  const pitchDeg = Math.max(0, Math.min(MAPLIBRE_MAX_PITCH, Math.acos(nadirDot) * RAD_TO_DEG));

  const tangent = vSub(f, vScale(up, vDot(f, up)));
  const bearingDeg = Math.atan2(vDot(tangent, east), vDot(tangent, north)) * RAD_TO_DEG;

  return { bearingDeg, pitchDeg };
}
