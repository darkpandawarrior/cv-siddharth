// WAVE 6 LANE X5 (seamless zoom + cinematic intro): pure logic for the
// "keep zooming in at the minimum orbit distance opens street level" gesture
// -- the hold-timer state machine and the altitude->MapLibre-zoom mapping
// used to match street view's opening camera to the globe camera it hands
// off from. No three, no R3F, no DOM -- same discipline as cameraMath.ts,
// which this module deliberately does NOT import from beyond its exported
// GLOBE_RADIUS-independent pure math (no chunk-isolation concern here: both
// this file's consumers, CameraDirector.tsx and StreetView.tsx, are already
// separate lazy chunks, not the eager "Globe" shell).

export const ZOOM_HOLD_MS = 400;
// Loose enough to catch OrbitControls' damping settling a few thousandths
// short of the exact clamp (enableDamping never lands EXACTLY on
// minDistance, it decays toward it), tight enough that "orbiting near the
// min" (not pinned AT it) never counts.
export const AT_MIN_EPSILON = 0.05;

/**
 * One frame's worth of the zoom-hold state machine: `holdMs` grows while
 * the camera sits within AT_MIN_EPSILON of `minDistance`, resets the instant
 * it doesn't. Whether that pinning came from a wheel notch, a pinch, or the
 * HUD's zoom-in pill doesn't matter -- all three drive the same OrbitControls
 * dolly, and once clamped at the floor the camera stays there until the
 * visitor does something else, which is exactly the "keeps trying to get
 * closer" signal the brief asks for. Pure so the 400ms threshold and the
 * reset-on-leave edge are unit-testable without a mock three.js camera.
 */
export function stepZoomHold(holdMs: number, distance: number, minDistance: number, dtSec: number): number {
  if (dtSec <= 0) return holdMs;
  return distance <= minDistance + AT_MIN_EPSILON ? holdMs + dtSec * 1000 : 0;
}

/**
 * MapLibre's zoom is roughly log2(map scale); this globe's altitude is
 * linear world units. Maps the orbit's own altitude band (minDistance to
 * maxDistance above the surface) onto a MapLibre zoom band that reads as
 * "street" at the close end (16.5, matching this app's pre-existing
 * default) down to a neighbourhood view at the far end -- never so far out
 * MapLibre shows a blank ocean tile. Clamped, so a caller handing it an
 * altitude outside the orbit's own min/max still gets a sane zoom back
 * instead of extrapolating off the scale.
 */
const STREET_ZOOM_MAX_Z = 16.5;
const STREET_ZOOM_MIN_Z = 12;

export function altitudeToStreetZoom(altitude: number, minAltitude: number, maxAltitude: number): number {
  const span = Math.max(1e-6, maxAltitude - minAltitude);
  const t = Math.max(0, Math.min(1, (altitude - minAltitude) / span));
  return STREET_ZOOM_MAX_Z - t * (STREET_ZOOM_MAX_Z - STREET_ZOOM_MIN_Z);
}

/**
 * The exact inverse of altitudeToStreetZoom, for the OTHER direction of the
 * hand-off: "zooming out of the street map past its min zoom returns to the
 * globe at the matching orbit distance" (the brief's own words). StreetView.tsx
 * calls this with MapLibre's own live zoom once the visitor has crossed its
 * floor, to arm the SAME orbit distance the zoom-in side would have produced
 * at that altitude -- so the round trip lands back where it started rather
 * than snapping to some other point on the band. Clamped the same way its
 * forward direction is, for the same reason (a caller handing an out-of-band
 * zoom back still gets a sane altitude, never an extrapolation off the
 * scale).
 */
export function streetZoomToAltitude(zoom: number, minAltitude: number, maxAltitude: number): number {
  const span = Math.max(1e-6, maxAltitude - minAltitude);
  const t = Math.max(0, Math.min(1, (STREET_ZOOM_MAX_Z - zoom) / (STREET_ZOOM_MAX_Z - STREET_ZOOM_MIN_Z)));
  return minAltitude + t * span;
}

/**
 * The one thing StreetView.tsx (a different lane's file -- this lane only
 * has hand-off hooks in it) needs from a seamless-zoom hand-off that `focus`
 * (globeStore's own field, already carries the lat/lon) can't: the MapLibre
 * zoom to open at, matching the globe camera's altitude. A plain
 * module-level box, not a globeStore.ts field -- that file is out of this
 * lane's ownership, and this is a one-shot read-once-and-clear hand-off,
 * not reactive state anything re-renders on (same shape as globeStore.ts's
 * own `entityPositions` map: state two independent mounts share without a
 * whole store slice).
 */
export interface StreetHandoff {
  /** MapLibre zoom to open the map at (see altitudeToStreetZoom). */
  zoom: number;
  /** MapLibre bearing (degrees) matching the orbit camera's own heading at
   *  the moment of hand-off -- cameraOrientation.ts's
   *  cameraForwardToBearingPitch, called from CameraDirector.tsx's own
   *  zoom-hold trigger, the only real producer. Optional: this module's own
   *  pre-existing unit test arms a hand-off with only `zoom` set, and
   *  StreetView.tsx falls back to its own STREET_BEARING constant when
   *  absent (a direct __GLOBE_TEST_STREET__ trigger, or a re-open, never
   *  arms one at all). */
  bearing?: number;
  /** MapLibre pitch (degrees, 0-85) matching the orbit camera's own tilt at
   *  hand-off. Same optionality/fallback as `bearing` above. */
  pitch?: number;
}
let pendingHandoff: StreetHandoff | null = null;
export function armStreetHandoff(h: StreetHandoff): void {
  pendingHandoff = h;
}
/** Read-once: a second read (e.g. a StrictMode double-effect) gets null,
 *  never a stale hand-off replayed into an unrelated later open. */
export function consumeStreetHandoff(): StreetHandoff | null {
  const h = pendingHandoff;
  pendingHandoff = null;
  return h;
}
/** Tests only: the module is a singleton. */
export function clearStreetHandoffForTest(): void {
  pendingHandoff = null;
}
