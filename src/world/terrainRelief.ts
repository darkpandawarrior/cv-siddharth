import { CITY } from "./city.ts";
import { timeline } from "../data/timeline.ts";
import { heightAt, laneAtX, laneCenterX, MONTH_DEPTH } from "./heightfield.ts";

/**
 * THE FOUR LANE TREATMENTS — art-direction doc §3, "Lane surface treatment".
 *
 * `heightAt` (heightfield.ts) is the single number the CAR drives on: it
 * blends the three nearest lanes so there's no wall between them and the
 * relief is smoothstep-continuous month to month. This file never touches
 * that function or its output — it only reshapes it for the MESH, layering
 * one visual treatment per lane on top of the same physics-consistent base,
 * so the ground you see and the ground you drive stay the same shape at every
 * point that isn't deliberately being distorted here.
 *
 * Every transform below is pure and takes only (x, z), so the terrain mesh
 * can call it once per vertex at load and never again.
 */

const LANE_KEYS = timeline.lanes.map((l) => l.key);
const WORK = LANE_KEYS.indexOf("work");
const CHESS = LANE_KEYS.indexOf("chess");
const WRITING = LANE_KEYS.indexOf("writing");
const OPENSOURCE = LANE_KEYS.indexOf("opensource");

/** work — stepped terrace: displacement snapped to 0.25m risers. */
const WORK_RISER = 0.25;

/** writing — relief confined to a 6m band inside the 14m lane; the outer 8m
 *  (4m each side) is flat apron. Eased over 0.6m so the cut isn't a crease. */
const WRITING_BAND = 6;
const WRITING_EASE = 0.6;

/** chess — gaussian-smoothed over +/-2 months: one mountain, not a comb. */
const CHESS_SMOOTH_MONTHS = 2;
const CHESS_SMOOTH_SIGMA = 1.2;

/** opensource — steel plate, flat until 2025-10, eased over ~2 months so the
 *  edge of the plate isn't a physical cliff to look at (the car never reads
 *  this mesh for physics, only heightAt, so this is purely a look call). */
const OPENSOURCE_FLAT_UNTIL_Z = (() => {
  const idx = timeline.months.indexOf("2025-10");
  const z = idx === -1 ? CITY.z1 : CITY.z0 + MONTH_DEPTH * (idx + 0.5);
  return z;
})();

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function gaussian(offset: number, sigma: number): number {
  return Math.exp(-(offset * offset) / (2 * sigma * sigma));
}

/** The mesh's own displacement at a point — heightAt's value, reshaped by
 *  whichever lane's treatment `x` falls nearest. */
export function visualHeightAt(x: number, z: number): number {
  const lane = laneAtX(x);
  const base = heightAt(x, z);

  if (lane === WORK) {
    return Math.round(base / WORK_RISER) * WORK_RISER;
  }

  if (lane === CHESS) {
    let sum = 0;
    let wsum = 0;
    for (let i = -CHESS_SMOOTH_MONTHS; i <= CHESS_SMOOTH_MONTHS; i++) {
      const w = gaussian(i, CHESS_SMOOTH_SIGMA);
      sum += heightAt(x, z + i * MONTH_DEPTH) * w;
      wsum += w;
    }
    return wsum > 0 ? sum / wsum : base;
  }

  if (lane === WRITING) {
    const d = Math.abs(x - laneCenterX(WRITING));
    const halfBand = WRITING_BAND / 2;
    const mask = 1 - smooth01((d - (halfBand - WRITING_EASE)) / WRITING_EASE);
    return CITY.groundY + (base - CITY.groundY) * mask;
  }

  if (lane === OPENSOURCE) {
    const t = smooth01((z - (OPENSOURCE_FLAT_UNTIL_Z - MONTH_DEPTH)) / (MONTH_DEPTH * 2));
    return CITY.groundY + (base - CITY.groundY) * t;
  }

  return base;
}
