/**
 * THE HODI'S MOTION, AS A PURE FUNCTION — world-v2-spec.md §4 "Route and
 * camera": "Vehicle: a hodi (country boat), one mode, on the river... The
 * boat is constrained to `riverSpline` plus the basin polygon, and runs on
 * lateral offset and along-river distance, so it cannot beach."
 *
 * Same discipline as v1's `drive.ts`: `step(state, input, dt, env) -> state`,
 * framerate-independent, zero three/R3F imports, so the containment property
 * is a headless test rather than something only a browser can show.
 *
 * Where `drive.ts` resolves a wall by ejecting the car and stripping the
 * velocity that pointed into it, this module's containment problem is
 * easier: the legal area is the union of two known shapes — a band of
 * `riverWidthAtZ(z)` around `riverX(z)`, and the Sangam basin circle
 * (`sangamBasin()`) — so every step clamps position directly onto whichever
 * shape it belongs to, rather than iterating collision passes. That is what
 * makes "never leaves the polygon" true by construction instead of by
 * tuning: nothing here can produce a state that skips the clamp.
 *
 * `autopilot` is this lane's own idle-drift state machine (world-v2-spec §4
 * "Drift: after 6 s idle... drifts downstream at 1.2 m/s... off under
 * reduced motion"), independent of v1's `autopilot.ts` (a destination-tour
 * driver for the desk world) and v1's `input.ts` auto-drive flag (its own
 * separate tour toggle) — neither applies to a boat that only ever has one
 * destination, downstream.
 */

import { riverX, riverWidthAtZ, sangamBasin, BOUNDS } from "./valley.ts";

export interface HodiState {
  x: number;
  z: number;
  /** Bearing from +Z, radians, increasing toward +X — same convention as
   *  drive.ts / autopilot.ts (`telemetry.ts`). */
  heading: number;
  /** m/s along `heading`. Negative is reverse (astern). */
  speed: number;
  /** ms since steer and throttle were both last non-zero. */
  idleMs: number;
  /** Whether the idle-drift state machine currently owns the axes. */
  autopilot: boolean;
}

export interface HodiInput {
  /** -1 (left/port) .. 1 (right/starboard) — W/S/A/D or input.ts's stick. */
  steer: number;
  /** -1 (astern) .. 1 (ahead). */
  throttle: number;
}

export interface HodiEnv {
  /** Never drift under reduced motion (world-v2-spec §4) — the same rule
   *  input.ts's setAutoDriving enforces for v1's tour autopilot. Passed in
   *  rather than read from `matchMedia` here so this module stays pure and
   *  testable headlessly; the caller (Hodi.tsx) reads it once per frame the
   *  same way reducedMotion.ts's own doc comment describes for every other
   *  world module. */
  reducedMotion: boolean;
}

/** world-v2-spec §4: "after 6 s idle". */
export const IDLE_TIMEOUT_MS = 6000;
/** world-v2-spec §4: "drifts downstream at 1.2 m/s". */
export const DRIFT_SPEED = 1.2;

/* Arcade constants, tuned by feel — drive.ts's own doctrine: none of these
 * are fitted to a simulation, and none has a spec literal to match. */
const MAX_SPEED = 5.5; // m/s under full throttle
const MAX_REVERSE = 2.2;
const ACCEL = 3.2; // m/s^2 at full throttle
const DRAG = 0.7; // per second, proportional to speed
const ROLLING = 0.35; // m/s^2 constant, so the hodi actually stops
const STEER_RATE = 1.4; // rad/s at full rudder lock
/** Same sign convention as drive.ts's STEER_SIGN and autopilot.ts's
 *  steerFor: heading increases toward +X, the driver's right is world -X,
 *  so steering right must DECREASE heading. */
const STEER_SIGN = -1;
/** Never integrate a frame longer than this — a backgrounded tab hands back
 *  a multi-second dt, which would jump the hodi across the channel. */
const MAX_DT = 1 / 20;
/** Clamp strictly inside the bank/basin edge, never exactly on it, so
 *  "distance to the spline < half-width" holds with room for floating
 *  error rather than landing exactly on the boundary it's supposed to be
 *  under. */
const EDGE_MARGIN = 0.15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The spline's own tangent direction at `z`, as a heading (drive.ts's
 *  convention). Central difference over a small `dz` — `riverX` is a smooth
 *  analytic function (valley.ts), so this is exact to floating precision,
 *  not a discretisation of the monthly `riverSpline()` samples. */
function tangentHeadingAt(z: number): number {
  const dz = 0.5;
  const dx = riverX(z + dz) - riverX(z - dz);
  return Math.atan2(dx, 2 * dz);
}

/**
 * Clamp a candidate position onto the legal area: inside the Sangam basin
 * circle, or inside the river band at that z. A position already inside
 * either shape is returned unchanged; the basin is checked first because
 * near the confluence the band's own width function is stepped at the last
 * recorded month and would otherwise clip a boat that has legitimately
 * entered the open basin.
 *
 * ponytail: clamps the lateral axis only (never adjusts `z` to find a
 * nearer point on the true 2D boundary) — adequate because the river band
 * is never so tightly curved that a straight lateral clamp misses the
 * actual nearest legal point by more than the margin already reserves.
 * Upgrade to a proper nearest-point projection if a future bend proves
 * tighter than that.
 */
function clampToChannel(x: number, z: number): { x: number; z: number } {
  const basin = sangamBasin();
  const toBasin = Math.hypot(x - basin.x, z - basin.z);
  if (toBasin <= basin.r - EDGE_MARGIN) return { x, z };

  const centreX = riverX(z);
  const halfWidth = Math.max(0, riverWidthAtZ(z) / 2 - EDGE_MARGIN);
  return { x: clamp(x, centreX - halfWidth, centreX + halfWidth), z };
}

function isIdleInput(input: HodiInput): boolean {
  return input.steer === 0 && input.throttle === 0;
}

/** One frame of driving. */
export function step(state: HodiState, input: HodiInput, dtSeconds: number, env: HodiEnv): HodiState {
  const dt = clamp(dtSeconds, 0, MAX_DT);
  if (dt <= 0) return state;

  const idle = isIdleInput(input);
  const idleMs = idle ? state.idleMs + dt * 1000 : 0;
  const autopilot = !env.reducedMotion && idleMs >= IDLE_TIMEOUT_MS;

  let heading: number;
  let speed = state.speed;

  if (autopilot) {
    // Follow the LOCAL tangent, not a straight line downstream — a straight
    // line drifts off the outside of every bend it meets. Recomputed every
    // frame from the current z, so the boat tracks the curve as it moves
    // rather than committing to the tangent at the moment autopilot engaged.
    heading = tangentHeadingAt(state.z);
    speed = DRIFT_SPEED;
  } else {
    const steer = clamp(input.steer, -1, 1);
    const throttle = clamp(input.throttle, -1, 1);

    if (throttle !== 0) speed += throttle * ACCEL * dt;
    const resist = (DRAG * Math.abs(speed) + ROLLING) * dt;
    if (Math.abs(speed) <= resist) speed = 0;
    else speed -= Math.sign(speed) * resist;
    speed = clamp(speed, -MAX_REVERSE, MAX_SPEED);

    // Rudder authority scales with speed — a becalmed hodi cannot pivot.
    const authority = clamp(Math.abs(speed) / 2, 0, 1);
    heading = state.heading + STEER_SIGN * steer * STEER_RATE * authority * dt * (speed < 0 ? -1 : 1);
  }

  let x = state.x + Math.sin(heading) * speed * dt;
  let z = state.z + Math.cos(heading) * speed * dt;
  z = clamp(z, BOUNDS.zMin, BOUNDS.zMax);

  const resolved = clampToChannel(x, z);
  x = resolved.x;
  z = resolved.z;

  return { x, z, heading, speed, idleMs, autopilot };
}

/** Spawns on the centreline at `z`, facing downstream — the fly-in's
 *  landing pose before Hodi.tsx's chase camera takes over. */
export function spawnState(z: number, lateral = 0): HodiState {
  const x = clamp(riverX(z) + lateral, riverX(z) - riverWidthAtZ(z) / 2, riverX(z) + riverWidthAtZ(z) / 2);
  return { x, z, heading: tangentHeadingAt(z), speed: 0, idleMs: 0, autopilot: false };
}
