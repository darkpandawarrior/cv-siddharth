// Pure az/el/range math for anything the world needs to point a camera or a
// label at, relative to the Sangam (Mula-Mutha confluence) rather than the
// city-level PUNE constant in sky.ts — the aircraft handler and the reality
// client both need the same observer point, so this is the one file either
// side imports (open-data-spec.md §3 A1, living-ledger-spec.md §4, M11).

export type GeoPoint = { lat: number; lon: number; altM: number };

/** The Mula-Mutha confluence, 560 m being the Sangam's own ground elevation
 *  (not sea level), so an aircraft's elevation angle is relative to where a
 *  visitor is actually standing. */
export const SANGAM: GeoPoint = { lat: 18.5315656, lon: 73.8603474, altM: 560 };

export type LookAngles = { azDeg: number; elDeg: number; rangeKm: number };

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * True azimuth (0-360, north 0, clockwise), elevation (degrees above the
 * local horizon) and great-circle ground range (km) from `observer` to
 * `target`. Standard spherical bearing/haversine, so it costs a handful of
 * trig calls per aircraft — the whole 64-aircraft cap is well under 1 ms.
 *
 * Elevation subtracts the Earth-curvature drop at this range (`d²/2R`) so a
 * level jet at real range doesn't read as climbing toward the horizon — the
 * same correction aviation dip tables use.
 */
export function lookAngles(target: GeoPoint, observer: GeoPoint = SANGAM): LookAngles {
  const phi1 = toRad(observer.lat);
  const phi2 = toRad(target.lat);
  const dPhi = toRad(target.lat - observer.lat);
  const dLambda = toRad(target.lon - observer.lon);

  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const groundRangeM = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const azDeg = (toDeg(Math.atan2(y, x)) + 360) % 360;

  const curvatureDropM = (groundRangeM * groundRangeM) / (2 * EARTH_RADIUS_M);
  const elDeg = toDeg(Math.atan2(target.altM - observer.altM - curvatureDropM, groundRangeM));

  return { azDeg, elDeg, rangeKm: groundRangeM / 1000 };
}
