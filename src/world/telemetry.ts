import type { CraftMode } from "./craftPhysics.ts";

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
  mode: CraftMode;
  /** 0..1 — how much boost is left in the tank. */
  boost: number;
  /** True while boost is actually being spent, for the meter's lit state. */
  boosting: boolean;
  /** True on any frame a thermal column is lifting the craft. */
  inThermal: boolean;
};

export const telemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  speed: 0,
  mode: "wheels",
  boost: 1,
  boosting: false,
  inThermal: false,
};