import { CITY } from "./city.ts";
import { timeline } from "../data/timeline.ts";

/**
 * THE GROUND IS THE CHART.
 *
 * Z is time (2019-01 at the south end, the current month at the north), X is
 * which strand of the record you are driving along, and the relief under the
 * wheels is that strand's real monthly value. Nothing here is invented
 * geometry — every number comes from src/data/timeline.ts, which is generated,
 * and every lane there carries its own provenance string.
 *
 * TWO ENCODINGS, ON PURPOSE. Magnitude is shown twice because one channel
 * cannot do both jobs:
 *
 *   - `heightAt` — the DRIVABLE relief, hard-capped at RELIEF_MAX. You feel
 *     the shape through the car. It is deliberately compressed: chess runs
 *     2 games one month and 619 another, and a faithful 1:1 height over a
 *     1.83m month spacing is a cliff no vehicle can climb. Compressed relief
 *     is honest about ORDER (bigger month = higher ground) while refusing to
 *     be read as a precise magnitude — which is what the columns are for.
 *   - `valueAt` — the RAW monthly number, uncompressed and uninterpolated.
 *     This is what the HUD prints and what the light columns are scaled to.
 *     The chart you READ is the columns; the chart you DRIVE is the relief.
 *
 * Keeping them separate is the whole reason this file exists as pure
 * functions rather than as geometry baked in a component: drive.ts needs
 * heights every frame for a vehicle that must stay deterministic, and the
 * HUD needs exact values that must never be smoothed.
 */

const LANES = timeline.lanes;
const MONTHS = timeline.months;

/** Metres of drivable relief between a lane's quietest and busiest month. */
export const RELIEF_MAX = 2.5;

/** Lane width across X — the slab split evenly between the strands. */
export const LANE_WIDTH = (CITY.halfWidth * 2) / LANES.length;

/** Metres of corridor per month along Z. */
export const MONTH_DEPTH = (CITY.z1 - CITY.z0) / MONTHS.length;

export const laneKeys = LANES.map((l) => l.key);

/** World-space X of a lane's centre line — its road. */
export function laneCenterX(index: number): number {
  return -CITY.halfWidth + LANE_WIDTH * (index + 0.5);
}

/** World-space Z of a month's centre. */
export function monthCenterZ(index: number): number {
  return CITY.z0 + MONTH_DEPTH * (index + 0.5);
}

/** Which month index a Z falls in, as a float so relief can interpolate. */
export function monthAtZ(z: number): number {
  return (z - CITY.z0) / MONTH_DEPTH - 0.5;
}

/** Nearest whole month index, clamped — used for readouts, never for relief. */
export function monthIndexAtZ(z: number): number {
  return Math.min(MONTHS.length - 1, Math.max(0, Math.round(monthAtZ(z))));
}

export function monthLabelAtZ(z: number): string {
  return MONTHS[monthIndexAtZ(z)];
}

/** Which lane an X falls in, clamped to the slab. */
export function laneAtX(x: number): number {
  const i = Math.floor((x + CITY.halfWidth) / LANE_WIDTH);
  return Math.min(LANES.length - 1, Math.max(0, i));
}

/**
 * The RAW value for a lane in the month containing `z`. Never interpolated
 * and never compressed — this is the number the HUD prints, so it has to be a
 * number that actually appears in the generated data.
 */
export function valueAt(laneIndex: number, z: number): number {
  const lane = LANES[laneIndex];
  if (!lane) return 0;
  return lane.months[MONTHS[monthIndexAtZ(z)]] ?? 0;
}

export function laneAt(laneIndex: number) {
  return LANES[laneIndex];
}

/** 0..1 within a lane, compressed. sqrt pulls long tails up so a lane whose
 *  peak dwarfs its median (chess: 619 against a median in the tens) still
 *  shows texture in its quiet years instead of reading as flat floor. */
function normalised(laneIndex: number, monthIndex: number): number {
  const lane = LANES[laneIndex];
  if (!lane || lane.peak.v <= 0) return 0;
  const v = lane.months[MONTHS[monthIndex]] ?? 0;
  return Math.sqrt(Math.max(0, v) / lane.peak.v);
}

/** Smoothstep — C1 continuous, so the car never hits a derivative cliff at a
 *  month boundary the way linear interpolation would. */
function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** A lane's relief at a point along Z, interpolated between month centres. */
function laneReliefAtZ(laneIndex: number, z: number): number {
  const f = monthAtZ(z);
  const i0 = Math.min(MONTHS.length - 1, Math.max(0, Math.floor(f)));
  const i1 = Math.min(MONTHS.length - 1, i0 + 1);
  const t = smooth(f - i0);
  return (normalised(laneIndex, i0) * (1 - t) + normalised(laneIndex, i1) * t) * RELIEF_MAX;
}

/**
 * Cross-lane profile: full relief along the lane's centre, easing to zero at
 * its edges. That gives every lane a drivable crest (the road) and leaves a
 * gutter between lanes you can also drive, which is how you change strand
 * without climbing a wall.
 */
function laneProfile(x: number, laneIndex: number): number {
  const d = Math.abs(x - laneCenterX(laneIndex)) / (LANE_WIDTH / 2);
  return d >= 1 ? 0 : smooth(1 - d);
}

/**
 * Ground height at a world point. Sums the two nearest lanes so the seam
 * between them is continuous — a max() would leave a crease the car catches
 * on, and only summing the neighbours keeps this O(1) rather than O(lanes).
 */
export function heightAt(x: number, z: number): number {
  const centre = laneAtX(x);
  let h = 0;
  for (const i of [centre - 1, centre, centre + 1]) {
    if (i < 0 || i >= LANES.length) continue;
    const p = laneProfile(x, i);
    if (p > 0) h += laneReliefAtZ(i, z) * p;
  }
  return CITY.groundY + h;
}

/** Uphill direction and steepness at a point, by central difference. Used for
 *  the drive model's gravity assist and for orienting the car to the slope. */
export function slopeAt(x: number, z: number, eps = 0.4): { dx: number; dz: number } {
  return {
    dx: (heightAt(x + eps, z) - heightAt(x - eps, z)) / (2 * eps),
    dz: (heightAt(x, z + eps) - heightAt(x, z - eps)) / (2 * eps),
  };
}
