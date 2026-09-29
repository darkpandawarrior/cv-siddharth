// Pure sky-rotation math for LANE L2 (real stars/Moon/Sun): Greenwich Mean
// Sidereal Time, and the RA/Dec -> earth-fixed lat/lon it drives. No three,
// no React, no DOM.
//
// stars.ts's `lst(d, lonDeg)` already carries the IAU 1982 GMST formula (it
// adds a site longitude for local sidereal time, which moon.ts and its own
// horizon projection use) - reused here at lonDeg=0 rather than re-typing
// the same ~5-term polynomial a second time with a chance to drift from it.
import { lst } from "../../../lib/stars.ts";

/** Greenwich Mean Sidereal Time in degrees at `d`. Verified in skyMath.test.ts
 *  against two independently published values: the J2000.0 epoch constant
 *  and Meeus's own worked example (Astronomical Algorithms, Example 12.a). */
export function gmstDeg(d: Date): number {
  return lst(d, 0);
}

/** The earth-fixed point directly under an object of the given RA
 *  (hours)/Dec (deg) at instant `d` - a star (or the Moon, or the Sun)
 *  transits the Greenwich meridian (lon 0) exactly when GMST equals its RA
 *  in degrees, so lon = RA*15 - GMST is 0 at that instant and drops
 *  (sweeps west) as GMST grows - the same westward sweep `subsolarPoint()`
 *  already draws for the Sun over the course of a day. This is GLOBE's one
 *  formula for "where does the sky sit on the fixed earth-frame lattice
 *  right now," shared by the star field's whole-object rotation and the
 *  Moon's per-frame-cheap placement. */
export function substellarLatLon(raHours: number, decDeg: number, d: Date): { lat: number; lon: number } {
  const raw = raHours * 15 - gmstDeg(d);
  const lon = (((raw % 360) + 540) % 360) - 180; // normalize to (-180, 180]
  return { lat: decDeg, lon };
}

// Star colour ramp anchors (B-V colour index -> linear-ish sRGB), the same
// blue-white/white/amber/red order every "true colour" star chart uses -
// close to the widely published table at celestialprogramming.com/scripts
// /starcolor, kept to five anchor stops rather than that table's full curve
// since a mag<=5 point sprite can't show finer gradation anyway.
const BV_STOPS: readonly [number, readonly [number, number, number]][] = [
  [-0.4, [0.61, 0.7, 1.0]],
  [0.0, [0.85, 0.89, 1.0]],
  [0.4, [1.0, 0.97, 0.9]],
  [1.0, [1.0, 0.85, 0.6]],
  [2.0, [1.0, 0.6, 0.4]],
];

/** Approximate star colour from HYG's `ci` (B-V colour index). Stars whose
 *  catalogue `ci` happens to be exactly 0 land on the ramp's own
 *  near-white-blue stop - visually indistinguishable, at a mag<=5 point's
 *  size, from a dedicated "no data" grey, so this never special-cases it. */
export function bvToRgb(ci: number): [number, number, number] {
  const t = Math.max(BV_STOPS[0][0], Math.min(BV_STOPS[BV_STOPS.length - 1][0], ci));
  for (let i = 0; i < BV_STOPS.length - 1; i++) {
    const [t0, c0] = BV_STOPS[i];
    const [t1, c1] = BV_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  /* c8 ignore next -- unreachable: BV_STOPS is sorted and t is clamped inside its range */
  const [r, g, b] = BV_STOPS[BV_STOPS.length - 1][1];
  return [r, g, b];
}

/** Point size in raw shader units (sizeAttenuation is off, so this IS the
 *  final on-screen pixel diameter) for a star of the given magnitude.
 *  Brighter (lower/negative mag) draws bigger; clamped so Sirius (-1.44)
 *  reads as a crisp bright point rather than a blob. */
export function magToPointSize(mag: number): number {
  return Math.max(1.1, Math.min(4.2, 3.6 - mag * 0.55));
}

/** render.md finding 4: `gl_PointSize` is specified in PHYSICAL framebuffer
 *  pixels, not CSS pixels — three's own PointsMaterial compensates for this
 *  via `renderer.getPixelRatio()` internally, but skyStars.tsx's hand-rolled
 *  shader does not, so a star sized for `magToPointSize(mag)` covers fewer
 *  and fewer CSS pixels as devicePixelRatio rises (undercutting this file's
 *  own "stars stay pin-sharp at any zoom" intent), and can fall under the
 *  fragment shader's `a<=0.003 discard` cutoff at DPR 2 where it would have
 *  survived at DPR 1. Pure so this scaling is testable without a WebGL
 *  context — the shader itself just multiplies `aSize` by a `uPixelRatio`
 *  uniform carrying the same value. */
export function physicalPointSize(mag: number, pixelRatio: number): number {
  return magToPointSize(mag) * pixelRatio;
}
