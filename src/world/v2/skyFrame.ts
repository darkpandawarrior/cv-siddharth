/**
 * The world's one observer, one compass (open-data-spec.md §2; master-plan
 * M4). Pure, like `valley.ts` — no three/R3F imports.
 *
 * M4 (RESOLVED): world +Z is a TRUE compass bearing — the real Mutha chord
 * (`mutha.json` `chordBearingDeg`, ≈53°) — not `outflowBearingDeg`
 * (open-data-spec's own draft used that; superseded, kept informational
 * only) and not an invented rotation. The drawn river (`valley.ts`
 * `riverX`) IS the Mutha projected onto that same chord, so a real sun,
 * plane or satellite's true azimuth converts into the same frame the river
 * itself is drawn in.
 *
 * `SANGAM`/`lookAngles` are re-exported from `src/lib/lookAngles.ts`
 * verbatim (not redefined) — that file is the one both the aircraft
 * handler and this module read, and its confluence lat/lon already equal
 * `mutha.json`'s (skyFrame.test.ts pins the equality).
 */

import { lookAngles, SANGAM, type GeoPoint, type LookAngles } from "../../lib/lookAngles.ts";
import mutha from "../../data/osm/mutha.json" with { type: "json" };

export { lookAngles, SANGAM };
export type { GeoPoint, LookAngles };

/** The world's +Z bearing — the real Mutha chord (M4), not the outflow. */
export const DOWNSTREAM_BEARING_DEG: number = mutha.chordBearingDeg;

/** Hydrological bank naming, distinct from `Flank` (`city.ts`)'s
 *  paid-work/open-source metaphor: which side of the RIVER a point sits
 *  on, facing downstream (+Z). Facing +Z with +Y up, right = forward×up =
 *  -X, so the right bank is negative world x (pinned by `valley.test.ts`
 *  against a real bend). */
export type Bank = "right" | "left";

export function bankOf(worldX: number): Bank {
  return worldX < 0 ? "right" : "left";
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * True az/el (degrees, the same convention `lookAngles` returns) to a
 * world-space unit direction. `az = DOWNSTREAM_BEARING_DEG` points along
 * +Z (downstream); turning the compass reading clockwise from there swings
 * toward -X. Pinned by skyFrame.test.ts at the four cardinal offsets.
 */
export function worldDir(azDeg: number, elDeg: number): [number, number, number] {
  const rel = toRad(azDeg - DOWNSTREAM_BEARING_DEG);
  const el = toRad(elDeg);
  return [-Math.sin(rel) * Math.cos(el), Math.sin(el), Math.cos(rel) * Math.cos(el)];
}

const EARTH_RADIUS_M = 6_371_000;
const KT_TO_MPS = 0.5144444444444445;

export interface DeadReckonInput {
  lat: number;
  lon: number;
  gsKt: number;
  trkDeg: number;
}

/**
 * Dead reckoning: `a`'s position advanced `dtS` seconds along its own
 * ground track — the complement to `lookAngles`' geo→az/el (open-data-spec
 * §2). Standard spherical direct geodesic; good to the same order of
 * accuracy `lookAngles`' haversine already assumes.
 */
export function deadReckon(a: DeadReckonInput, dtS: number): { lat: number; lon: number } {
  const distM = a.gsKt * KT_TO_MPS * dtS;
  const delta = distM / EARTH_RADIUS_M;
  const theta = toRad(a.trkDeg);
  const phi1 = toRad(a.lat);
  const lambda1 = toRad(a.lon);

  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );

  return { lat: (phi2 * 180) / Math.PI, lon: (((lambda2 * 180) / Math.PI + 540) % 360) - 180 };
}
