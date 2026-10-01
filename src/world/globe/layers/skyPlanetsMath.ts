// Heliocentric-Keplerian planet positions (LANE W4) — Standish's "Keplerian
// Elements for Approximate Positions of the Major Planets" (JPL/Caltech,
// https://ssd.jpl.nasa.gov/planets/approx_pos.html, public domain: a NASA/
// JPL technical publication, not a redistributed third-party dataset), the
// same public low-precision fit suncalc-style libraries use for the Sun/Moon
// and this repo's own sky.ts/moon.ts already adopt as code rather than a
// dependency. Table 1's elements are valid 1800 AD - 2050 AD, accurate to a
// few arcminutes for the inner planets and under an arcminute in longitude
// for Jupiter/Saturn over that span — comfortably inside the 0.5 degree bar
// this lane's own tests hold it to (skyPlanetsMath.test.ts, against two+
// JPL Horizons astrometric RA/Dec readings). No three, no React, no DOM.
const RAD = Math.PI / 180;

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export type PlanetId = "mercury" | "venus" | "mars" | "jupiter" | "saturn";
export const PLANET_IDS: readonly PlanetId[] = ["mercury", "venus", "mars", "jupiter", "saturn"];

interface Elements {
  a0: number;
  aDot: number;
  e0: number;
  eDot: number;
  i0: number;
  iDot: number;
  L0: number;
  LDot: number;
  peri0: number;
  periDot: number;
  node0: number;
  nodeDot: number;
}

// Table 1 (ssd.jpl.nasa.gov/planets/approx_pos.html), units: a [au, au/Cy],
// e [rad, rad/Cy in the source's own header but e is dimensionless — the
// table's "rad" label there means "no unit conversion", not radians], I/L/
// peri/node [deg, deg/Cy]. "earth" is the Earth-Moon barycentre, used only
// internally (subtracted from a planet's own heliocentric vector to get a
// geocentric one) — never exposed as a selectable body, this world already
// has a real Earth.
const ELEMENTS: Record<PlanetId | "earth", Elements> = {
  mercury: {
    a0: 0.38709927, aDot: 0.00000037, e0: 0.20563593, eDot: 0.00001906,
    i0: 7.00497902, iDot: -0.00594749, L0: 252.2503235, LDot: 149472.67411175,
    peri0: 77.45779628, periDot: 0.16047689, node0: 48.33076593, nodeDot: -0.12534081,
  },
  venus: {
    a0: 0.72333566, aDot: 0.0000039, e0: 0.00677672, eDot: -0.00004107,
    i0: 3.39467605, iDot: -0.0007889, L0: 181.9790995, LDot: 58517.81538729,
    peri0: 131.60246718, periDot: 0.00268329, node0: 76.67984255, nodeDot: -0.27769418,
  },
  earth: {
    a0: 1.00000261, aDot: 0.00000562, e0: 0.01671123, eDot: -0.00004392,
    i0: -0.00001531, iDot: -0.01294668, L0: 100.46457166, LDot: 35999.37244981,
    peri0: 102.93768193, periDot: 0.32327364, node0: 0, nodeDot: 0,
  },
  mars: {
    a0: 1.52371034, aDot: 0.00001847, e0: 0.0933941, eDot: 0.00007882,
    i0: 1.84969142, iDot: -0.00813131, L0: -4.55343205, LDot: 19140.30268499,
    peri0: -23.94362959, periDot: 0.44441088, node0: 49.55953891, nodeDot: -0.29257343,
  },
  jupiter: {
    a0: 5.202887, aDot: -0.00011607, e0: 0.04838624, eDot: -0.00013253,
    i0: 1.30439695, iDot: -0.00183714, L0: 34.39644051, LDot: 3034.74612775,
    peri0: 14.72847983, periDot: 0.21252668, node0: 100.47390909, nodeDot: 0.20469106,
  },
  saturn: {
    a0: 9.53667594, aDot: -0.0012506, e0: 0.05386179, eDot: -0.00050991,
    i0: 2.48599187, iDot: 0.00193609, L0: 49.95424423, LDot: 1222.49362201,
    peri0: 92.59887831, periDot: -0.41897216, node0: 113.66242448, nodeDot: -0.28867794,
  },
};

/** J2000 mean obliquity, deg — the same constant moon.ts's own
 *  eclipticToEquatorial uses, restated here so this module has no import
 *  dependency on that lane's file for six characters of shared precision. */
const OBLIQUITY_DEG = 23.4392911;

export function julianCenturiesJ2000(d: Date): number {
  const jd = d.getTime() / 86_400_000 + 2440587.5;
  return (jd - 2451545) / 36525;
}

interface HeliocentricVector {
  x: number;
  y: number;
  z: number;
  /** Heliocentric distance, au — a(1-e cosE), equivalently hypot(x,y,z)
   *  since the ecliptic rotation below preserves vector length. */
  r: number;
}

/** Solves Kepler's equation M = E - e sin(E) for E (radians) by Newton's
 *  method from the standard e sin(M) first guess — converges in 2-4
 *  iterations for every planet's eccentricity here (all under 0.21), capped
 *  at 20 as a hard stop rather than trusted to always converge. */
function solveKepler(mRad: number, e: number): number {
  let E = mRad + e * Math.sin(mRad);
  for (let i = 0; i < 20; i++) {
    const dE = (E - e * Math.sin(E) - mRad) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Table 1's own worked recipe (ssd.jpl.nasa.gov/planets/approx_pos.html
 *  "Formulae for using the Keplerian elements"): elements at T, argument of
 *  perihelion omega = peri - node, mean anomaly M = L - peri, Kepler's
 *  equation for the eccentric anomaly, the orbital-plane position, then the
 *  three-angle (omega, I, node) rotation into the J2000 mean ecliptic. */
function heliocentricEcliptic(el: Elements, T: number): HeliocentricVector {
  const a = el.a0 + el.aDot * T;
  const e = el.e0 + el.eDot * T;
  const iDeg = el.i0 + el.iDot * T;
  const LDeg = el.L0 + el.LDot * T;
  const periDeg = el.peri0 + el.periDot * T;
  const nodeDeg = el.node0 + el.nodeDot * T;
  const omegaDeg = periDeg - nodeDeg;
  const mDeg = ((LDeg - periDeg + 180) % 360 + 360) % 360 - 180; // wrapped to -180..180, as the recipe specifies
  const E = solveKepler(mDeg * RAD, e);

  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const omega = omegaDeg * RAD;
  const node = nodeDeg * RAD;
  const I = iDeg * RAD;
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const cO = Math.cos(node);
  const sO = Math.sin(node);
  const cI = Math.cos(I);
  const sI = Math.sin(I);

  const x = (cw * cO - sw * sO * cI) * xOrb + (-sw * cO - cw * sO * cI) * yOrb;
  const y = (cw * sO + sw * cO * cI) * xOrb + (-sw * sO + cw * cO * cI) * yOrb;
  const z = sw * sI * xOrb + cw * sI * yOrb;
  return { x, y, z, r: a * (1 - e * Math.cos(E)) };
}

export interface PlanetGeometry {
  raHours: number;
  decDeg: number;
  /** Geocentric distance, au. */
  distanceAu: number;
  /** Heliocentric distance, au — the magnitude formula's own "r". */
  helioDistanceAu: number;
  /** Sun-planet-Earth phase angle, deg — the magnitude formula's own "alpha". */
  phaseAngleDeg: number;
}

/** Geocentric equatorial J2000 RA/Dec for `planet` at `d`: the planet's own
 *  heliocentric vector minus Earth's (from the EM Bary elements — the same
 *  barycentre/geocentre conflation every low-precision formula at this tier
 *  makes; its own few-hundred-km Earth-Moon offset is far under this
 *  table's own arcminute-level error budget), rotated from ecliptic to
 *  equatorial by the J2000 mean obliquity. No light-time/aberration
 *  correction — "astrometric", the same Horizons quantity this module's own
 *  test oracle reads, and well inside the 0.5 degree bar regardless. */
export function planetGeometry(planet: PlanetId, d: Date): PlanetGeometry {
  const T = julianCenturiesJ2000(d);
  const earth = heliocentricEcliptic(ELEMENTS.earth, T);
  const body = heliocentricEcliptic(ELEMENTS[planet], T);
  const gx = body.x - earth.x;
  const gy = body.y - earth.y;
  const gz = body.z - earth.z;

  const eps = OBLIQUITY_DEG * RAD;
  const xeq = gx;
  const yeq = gy * Math.cos(eps) - gz * Math.sin(eps);
  const zeq = gy * Math.sin(eps) + gz * Math.cos(eps);
  const distanceAu = Math.hypot(xeq, yeq, zeq);

  const raHours = norm360(Math.atan2(yeq, xeq) / RAD) / 15;
  const decDeg = Math.asin(Math.max(-1, Math.min(1, zeq / distanceAu))) / RAD;

  const cosAlpha = (body.r * body.r + distanceAu * distanceAu - earth.r * earth.r) / (2 * body.r * distanceAu);
  const phaseAngleDeg = Math.acos(Math.max(-1, Math.min(1, cosAlpha))) / RAD;

  return { raHours, decDeg, distanceAu, helioDistanceAu: body.r, phaseAngleDeg };
}

/** Approximate apparent visual magnitude — the widely-reproduced
 *  Astronomical Almanac phase-angle formulae (r = heliocentric distance,
 *  delta = geocentric distance, both au; alpha = phase angle, deg). Saturn's
 *  own formula properly includes a ring-opening term this module has no
 *  ring geometry to feed, so it is dropped (ponytail: a fixed +0 ring term,
 *  actual Saturn brightness swings roughly +-0.5 mag with ring tilt over its
 *  29-year orbit — upgrade path: add the ring inclination term from Meeus
 *  ch. 41 if a precise Saturn magnitude is ever worth the extra code). Never
 *  checked against Horizons: only position carries this lane's 0.5 degree
 *  test bar, magnitude is "true relative brightness" flavour, not a claim. */
export function apparentMagnitude(planet: PlanetId, r: number, delta: number, alphaDeg: number): number {
  const base = 5 * Math.log10(r * delta);
  switch (planet) {
    case "mercury":
      return -0.42 + base + 0.038 * alphaDeg - 0.000273 * alphaDeg ** 2 + 0.000002 * alphaDeg ** 3;
    case "venus":
      return -4.4 + base + 0.0009 * alphaDeg + 0.000239 * alphaDeg ** 2 - 0.00000065 * alphaDeg ** 3;
    case "mars":
      return -1.52 + base + 0.016 * alphaDeg;
    case "jupiter":
      return -9.4 + base + 0.005 * alphaDeg;
    case "saturn":
      return -8.88 + base;
  }
}

/** Pale, true-ish colour per planet — never a brand token (ambient sky
 *  furniture, same rule skyMath.ts's own bvToRgb star colours follow). */
export const PLANET_COLOR: Record<PlanetId, string> = {
  mercury: "#a39a8f",
  venus: "#e9ddc0",
  mars: "#c1694a",
  jupiter: "#d9c9a8",
  saturn: "#e0cf9e",
};

export const PLANET_LABEL: Record<PlanetId, string> = {
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
};

/** "08h 07m" — the inspector row's own RA format, hours/minutes only (a
 *  mag-point-in-the-sky claim never needs seconds of RA precision). */
export function formatRaHours(raHours: number): string {
  const h = Math.floor(raHours);
  const m = Math.round((raHours - h) * 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

/** "+21.2 deg" / "-11.4 deg". */
export function formatDecDeg(decDeg: number): string {
  const sign = decDeg >= 0 ? "+" : "-";
  return `${sign}${Math.abs(decDeg).toFixed(1)}°`;
}

/** World-unit sphere radius for a small point-sprite planet mesh, brighter
 *  (lower mag) drawing bigger — the same "clamp so the brightest thing
 *  never blobs" shape skyMath.ts's own magToPointSize uses for stars, with
 *  its own range since every planet here is always brighter than that
 *  mag<=5 star cutoff (real range roughly Venus -4.5 to a faint Mercury
 *  +1.5) and this is a real sphereGeometry radius (perspective-scaled), not
 *  a fixed-px point sprite. */
export function magToSphereRadius(mag: number): number {
  return Math.max(0.4, Math.min(2.2, 1.6 - mag * 0.28));
}
