// WAVE 7 LANE 8 (eclipse paths): pure astronomy, no three, no React, no DOM
// -- EclipseLayer.tsx (a lazy chunk) and ui/TimeScrubber.tsx's jump (a
// dynamic import at click time) are the only callers, so this file and its
// "astronomy-engine" import never reach the eager Globe chunk.
//
// astronomy-engine 2.1.19 (MIT, https://www.npmjs.com/package/astronomy-engine)
// gives the Moon and Sun's real geocentric positions -- skyMoonMath.ts's low-
// order Meeus series is accurate enough to draw the Moon in the sky, but not
// to draw a shadow: 0.1 deg of lunar position error moves the umbra about
// 670 km, wider than the umbra itself (this lane's own plan, Lane 8).
import { EquatorFromVector, GeoMoon, GeoVector, MakeTime, NextGlobalSolarEclipse, RotateVector, Rotation_EQJ_EQD, SearchGlobalSolarEclipse, SiderealTime, Body, Vector, type AstroTime } from "astronomy-engine";

/** Solar EclipseKind values astronomy-engine's global search actually
 *  returns (its own doc: "one of Partial, Annular, or Total" -- Penumbral is
 *  lunar-only). Only Total and Annular have a ground point at all: nobody on
 *  Earth stands in totality/annularity during a Partial-only eclipse. */
export type SolarEclipseKind = "partial" | "annular" | "total";

export interface GlobalEclipse {
  kind: SolarEclipseKind;
  /** The instant of greatest eclipse (closest approach of the shadow axis to
   *  Earth's centre), UTC. */
  peak: Date;
  /** Greatest-eclipse ground point, astronomy-engine's own value -- more
   *  accurate than this file's own `shadowAxisPoint` (which exists to draw
   *  the surrounding path, not to replace this). Undefined for "partial". */
  latitude?: number;
  longitude?: number;
}

/** One point on the umbra/antumbra's ground track. */
export interface UmbraTrackPoint {
  time: Date;
  lat: number;
  lon: number;
}

// One astronomical unit in kilometres (IAU 2012 exact definition).
const AU_KM = 149_597_870.7;
// Spherical Earth radius, matching this codebase's own globe (GLOBE_RADIUS =
// 6 world units = 6,371 km, geoMath.ts) -- not the WGS84 ellipsoid, same cut
// the wave-7 plan already made for picking (exploreCanvas.ts).
const EARTH_RADIUS_KM = 6371;

/** Finds the next `count` solar eclipses visible from ANY point on Earth,
 *  starting at `from`, with their kind and (for Total/Annular) the
 *  greatest-eclipse ground point. Acceptance (wave-7 plan): from
 *  2026-09-29 this returns the 2027-02-06 annular and the 2027-08-02 total,
 *  in that order. */
export function nextGlobalEclipses(from: Date, count: number): GlobalEclipse[] {
  const out: GlobalEclipse[] = [];
  let info = SearchGlobalSolarEclipse(from);
  for (let i = 0; i < count; i++) {
    out.push({
      kind: info.kind as SolarEclipseKind,
      peak: info.peak.date,
      latitude: info.latitude,
      longitude: info.longitude,
    });
    if (i < count - 1) info = NextGlobalSolarEclipse(info.peak);
  }
  return out;
}

/** Geocentric Sun and Moon vectors at `t`, in kilometres, EQJ frame (J2000
 *  mean equator) -- the one ephemeris read shared by every geometry call
 *  below, so a caller stepping many timestamps only pays for it once. */
function sunMoonKm(t: AstroTime): { sun: { x: number; y: number; z: number }; moon: { x: number; y: number; z: number } } {
  const sun = GeoVector(Body.Sun, t, true);
  const moon = GeoMoon(t);
  return {
    sun: { x: sun.x * AU_KM, y: sun.y * AU_KM, z: sun.z * AU_KM },
    moon: { x: moon.x * AU_KM, y: moon.y * AU_KM, z: moon.z * AU_KM },
  };
}

/** Where the Moon's shadow axis (the line through the Sun's and Moon's
 *  centres, extended past the Moon) first pierces Earth's sphere at instant
 *  `t`, as geographic lat/lon -- or `null` when the axis misses Earth
 *  entirely (no eclipse in progress). This is the umbra/antumbra's ground
 *  point: for an annular eclipse the shadow cone's apex falls short of
 *  Earth, so the axis still marks the antumbra's centre the same way.
 *
 *  Geometry: parametrise the axis as `moon + s * dir` (dir = unit vector
 *  from Sun to Moon) and solve `|moon + s*dir| = R` for s; the SMALLER root
 *  is the near intersection, facing the Moon and therefore the Sun -- so it
 *  is always on the day side by construction, never the astronomically
 *  meaningless far-side root.
 *
 *  Frame: EQJ (inertial) is converted to true-of-date equatorial (EQD) via
 *  astronomy-engine's own rotation, then to Earth-fixed geographic
 *  coordinates by subtracting Greenwich Apparent Sidereal Time from right
 *  ascension -- the standard inertial-to-geographic step, since EQD is still
 *  fixed to the equinox of date, not to Earth's own rotation.
 *
 *  Verified (this lane's report) against NASA GSFC's published greatest-
 *  eclipse point for 2027-08-02 to within 0.5 deg -- see eclipse.test.ts's
 *  fixture for the exact published value and source URL. */
export function shadowAxisPoint(t: Date): { lat: number; lon: number } | null {
  const at = MakeTime(t);
  const { sun, moon } = sunMoonKm(at);
  let dx = moon.x - sun.x;
  let dy = moon.y - sun.y;
  let dz = moon.z - sun.z;
  const len = Math.hypot(dx, dy, dz);
  dx /= len;
  dy /= len;
  dz /= len;
  // Quadratic |moon + s*dir|^2 = R^2, i.e. s^2 + 2*b*s + c = 0.
  const b = moon.x * dx + moon.y * dy + moon.z * dz;
  const c = moon.x * moon.x + moon.y * moon.y + moon.z * moon.z - EARTH_RADIUS_KM * EARTH_RADIUS_KM;
  const discriminant = b * b - c;
  if (discriminant < 0) return null; // the axis misses Earth at this instant
  const s = -b - Math.sqrt(discriminant); // near (Moon-facing) root
  const pointKm = { x: moon.x + s * dx, y: moon.y + s * dy, z: moon.z + s * dz };
  const eqj = new Vector(pointKm.x / AU_KM, pointKm.y / AU_KM, pointKm.z / AU_KM, at);
  const eqd = RotateVector(Rotation_EQJ_EQD(at), eqj);
  const equatorial = EquatorFromVector(eqd);
  const gastDeg = SiderealTime(at) * 15;
  let lon = equatorial.ra * 15 - gastDeg;
  lon = ((lon + 540) % 360) - 180; // wrap to (-180, 180]
  return { lat: equatorial.dec, lon };
}

const TRACK_WINDOW_MIN = 180; // +-3h around greatest eclipse: wider than any real path (Lane 8 research: 2027-08-02 spans roughly 08:00-11:00 UT)
const TRACK_STEP_MIN = 3;

/** Steps time around `peak` and keeps every instant where the shadow axis
 *  actually intersects Earth, i.e. the umbra/antumbra's ground track --
 *  EclipseLayer.tsx draws this as the soft path band. Every returned point
 *  is on the day side at its own timestamp by construction
 *  (`shadowAxisPoint`'s near-root choice); eclipse.test.ts re-checks that
 *  with the app's own subsolar math (`geoMath.ts`'s `isDayAt`, a different
 *  implementation than astronomy-engine's) as an independent guard. */
export function umbraTrack(peak: Date): UmbraTrackPoint[] {
  const points: UmbraTrackPoint[] = [];
  for (let m = -TRACK_WINDOW_MIN; m <= TRACK_WINDOW_MIN; m += TRACK_STEP_MIN) {
    const time = new Date(peak.getTime() + m * 60_000);
    const p = shadowAxisPoint(time);
    if (!p) continue;
    points.push({ time, lat: p.lat, lon: p.lon });
  }
  return points;
}
