
/**
 * Live craft state, published every physics step and read every animation
 * frame by the HUD.
 *
 * Deliberately a mutable singleton rather than React state or a prop, and for
 * the same reason `input.ts` is one: the compass, speed readout and boost meter
 * all want a fresh value 60 times a second, and routing that through
 * `useState` would re-render World (and therefore Hud, and therefore every
 * memo boundary under it) at the same rate. Craft writes these fields in place
 * — no allocation per frame — and the HUD components read them inside their own
 * requestAnimationFrame loop, writing straight to DOM style properties. React
 * never sees the churn.
 *
 * Hold the one `telemetry` reference; never destructure it and cache the copy.
 */
export type Telemetry = {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians: 0 faces world +Z (south, toward the course), CCW positive. */
  heading: number;
  /** Forward speed, m/s. Negative when reversing. */
  speed: number;
  /** 0..1 — how much boost is left in the tank. */
  boost: number;
  /** True while boost is actually being spent, for the meter's lit state. */
  boosting: boolean;
  /** Upside down and going nowhere — the HUD says so before auto-recovery. */
  stuck: boolean;
  /** Metres driven this session — the Mileway lens (see Trail.tsx / gps.ts). */
  odometer: number;
  /** Mean positional error of the raw fix and of the fused track, metres. */
  rawError: number;
  fusedError: number;
  /** 0..1 — share of the world's 147 resolve cells driven through so far.
   *  Written every frame by ResolveField.tsx from resolve.ts's own ratchet;
   *  the HUD's `FIX %` readout reads this instead of reaching into
   *  resolve.ts directly, for the same reason every other field here exists
   *  — one place the HUD polls at its own rate, decoupled from whichever
   *  module actually owns the number. */
  resolvedFraction: number;
};

export const telemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  speed: 0,
  boost: 1,
  boosting: false,
  stuck: false,
  odometer: 0,
  rawError: 0,
  fusedError: 0,
  resolvedFraction: 0,
};