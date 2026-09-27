// LocalTraffic's pure motion math (living-ledger-spec.md#6.3, GLOBE lens
// L4): dead-reckoning an aircraft forward between polls, and the short
// per-callsign trail history. No three, no R3F -- geoMath.ts's discipline.

const EARTH_RADIUS_KM = 6371;
const NM_TO_KM = 1.852;

/** adsb.lol's own 20s poll (aircraft-handler.ts's AIRCRAFT_POLL_MS) --
 *  dead-reckoning past this is a guess wearing a straight face, so it clamps
 *  here regardless of how stale the last poll actually is. */
export const MAX_DEAD_RECKON_SEC = 60;

export function clampDeadReckonSec(dtSec: number): number {
  return Math.max(0, Math.min(MAX_DEAD_RECKON_SEC, dtSec));
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle destination point given a start, a true track (deg,
 *  clockwise from north) and a distance travelled at `speedKt` for
 *  `dtSec` -- the standard direct/forward geodesic formula, spherical
 *  Earth. `dtSec` is the caller's job to clamp (see MAX_DEAD_RECKON_SEC). */
export function deadReckon(from: LatLon, trackDeg: number, speedKt: number, dtSec: number): LatLon {
  if (dtSec <= 0 || speedKt <= 0) return { ...from };
  const distKm = speedKt * NM_TO_KM * (dtSec / 3600);
  const delta = distKm / EARTH_RADIUS_KM;
  const theta = (trackDeg * Math.PI) / 180;
  const phi1 = (from.lat * Math.PI) / 180;
  const lambda1 = (from.lon * Math.PI) / 180;

  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lambda2 =
    lambda1 +
    Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));

  return { lat: (phi2 * 180) / Math.PI, lon: (((lambda2 * 180) / Math.PI + 540) % 360) - 180 };
}

/** Appends `pos` to callsign `cs`'s trail, capped to the last `maxLen`
 *  positions (oldest dropped first) -- pure so the cap and the FIFO order
 *  are each one assertion, no React/refs involved. Returns a new map
 *  (immutable), same convention as countByCountry in presenceGeo.ts. */
export function pushTrail(trails: ReadonlyMap<string, LatLon[]>, cs: string, pos: LatLon, maxLen = 4): Map<string, LatLon[]> {
  const next = new Map(trails);
  const existing = next.get(cs) ?? [];
  next.set(cs, [...existing, pos].slice(-maxLen));
  return next;
}

/** Drops trails for callsigns no longer in the current poll -- an aircraft
 *  that left the 60nm radius should not leave a frozen trail behind. */
export function pruneTrails(trails: ReadonlyMap<string, LatLon[]>, presentCs: ReadonlySet<string>): Map<string, LatLon[]> {
  const next = new Map<string, LatLon[]>();
  for (const [cs, path] of trails) if (presentCs.has(cs)) next.set(cs, path);
  return next;
}
