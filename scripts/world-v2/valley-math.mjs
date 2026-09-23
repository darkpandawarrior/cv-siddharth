// scripts/world-v2/valley-math.mjs
//
// Pure terrain math for World v2 ("Sangam"), per world-v2-spec.md §3 (Terrain)
// and §2.1 (the layout module). Zero I/O, zero three.js — every function
// here takes plain data in and returns plain numbers/objects, so
// gen-terrain.mjs (Node) and, later, a runtime module can both call it
// without drift. Deterministic: same inputs -> same outputs, always (the
// fbm noise below uses a fixed hash, never Math.random).
//
// Coordinate scheme (spec §2, reusing city.ts's yearZ/dateZ): +X east, -Z
// north/2017, +Z south/now, scaled by VALLEY_SCALE (2.5x city.ts's
// 16 m/year -> 40 m/year here).

export const VALLEY_SCALE = 2.5;

// 768x768 m extent centred at (0, +40) — spec §3.
export const EXTENT = 768;
export const CENTER = { x: 0, z: 40 };
export const BOUNDS = {
  xMin: CENTER.x - EXTENT / 2,
  xMax: CENTER.x + EXTENT / 2,
  zMin: CENTER.z - EXTENT / 2,
  zMax: CENTER.z + EXTENT / 2,
};

/** The river's meandering centreline — spec §2.1. Already in v2 world
 *  metres, no further scaling. */
export function riverX(z) {
  return 14 * Math.sin(z / 70) + 6 * Math.sin(z / 23 + 1.3);
}

// ponytail: distance-to-centreline uses the vertical offset |x - riverX(z)|
// rather than a true perpendicular projection. The curve's slope is bounded
// (|d/dz| <= 14/70 + 6/23 ~= 0.46), so the worst-case error is ~9% of the
// true distance — acceptable for a valley wall's quadratic falloff. Upgrade
// to a numerical nearest-point search if the banks ever need to be exact.
export function distanceToRiver(x, z) {
  return Math.abs(x - riverX(z));
}

function smooth01(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** ISO year+fraction for a v2 world z (inverse of yearZ*VALLEY_SCALE). */
function v2zToYear(z, city) {
  return z / VALLEY_SCALE / city.yearSpan + (city.firstYear + city.lastYear) / 2;
}

function ymFromYear(yearFrac) {
  const year = Math.floor(yearFrac);
  const month = Math.min(12, Math.max(1, Math.round((yearFrac - year) * 12) + 1));
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

/** Sum of every lane's value at `ym` (0 for a month/lane with no entry). */
function laneMonthSum(timeline, ym) {
  let sum = 0;
  for (const lane of timeline.lanes) sum += lane.months[ym] ?? 0;
  return sum;
}

/** 3-month box filter centred on `ym`, over the summed lanes — spec §2.1
 *  `smooth3`. */
function smooth3(timeline, ym) {
  const a = laneMonthSum(timeline, shiftYm(ym, -1));
  const b = laneMonthSum(timeline, ym);
  const c = laneMonthSum(timeline, shiftYm(ym, 1));
  return (a + b + c) / 3;
}

/** River width in metres at world-z `z` — spec §2.1/§3: widens when he
 *  shipped more that month. */
export function riverWidthAtZ(z, timeline, city) {
  const ym = ymFromYear(v2zToYear(z, city));
  const w = 8 + 0.9 * smooth3(timeline, ym);
  return Math.min(34, Math.max(8, w));
}

/** One lane's raw month value at world-z `z`, 0 for an out-of-range month —
 *  the shared lookup the west-terrace, east-meadow and chess-ridge
 *  treatments all use (spec §3 steps 3/4/8). */
export function laneValueAtZ(z, timeline, city, laneKey) {
  const lane = timeline.lanes.find((l) => l.key === laneKey);
  if (!lane) return 0;
  const ym = ymFromYear(v2zToYear(z, city));
  return lane.months[ym] ?? 0;
}

/** Gaussian-smoothed lane value, sigma in months — reused by the chess
 *  ridge (spec §3 step 8: sigma = 2 months). */
export function laneValueSmoothed(z, timeline, city, laneKey, sigmaMonths) {
  const lane = timeline.lanes.find((l) => l.key === laneKey);
  if (!lane) return 0;
  const ymCentre = ymFromYear(v2zToYear(z, city));
  let sum = 0;
  let wsum = 0;
  for (let k = -4; k <= 4; k++) {
    const ym = shiftYm(ymCentre, k);
    const w = Math.exp(-(k * k) / (2 * sigmaMonths * sigmaMonths));
    sum += (lane.months[ym] ?? 0) * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : 0;
}

export function riverDepth(width) {
  return 1.2 + width * 0.06;
}

/** One row per month, the shape `valley.ts`'s `riverSpline()` returns
 *  (spec §2.1). */
export function riverSpline(timeline, city) {
  return timeline.months.map((ym) => {
    const yearFrac = (() => {
      const [y, m] = ym.split("-").map(Number);
      return y + (m - 1) / 12;
    })();
    const z = (yearFrac - (city.firstYear + city.lastYear) / 2) * city.yearSpan * VALLEY_SCALE;
    const width = Math.min(34, Math.max(8, 8 + 0.9 * smooth3(timeline, ym)));
    return { ym, z, x: riverX(z), width, depth: riverDepth(width) };
  });
}

/** Sangam basin centre/radius — spec §2.1: `z = valleyZ("2026-09") + 55`. */
export function sangamBasin(timeline, city) {
  const last = timeline.months[timeline.months.length - 1];
  const [y, m] = last.split("-").map(Number);
  const yearFrac = y + (m - 1) / 12;
  const zLast = (yearFrac - (city.firstYear + city.lastYear) / 2) * city.yearSpan * VALLEY_SCALE;
  return { x: 0, z: zLast + 55, r: 48 };
}

/** Amphitheatre district anchors on the hillside arc (200deg..340deg,
 *  r=95m, y=14..22m) — spec §2.1/§3. `districtIds` is the ordered list this
 *  lane's caller supplies (kept out of this module so it stays pure of any
 *  particular repo roster). */
export function districtAnchors(districtIds, timeline, city) {
  const basin = sangamBasin(timeline, city);
  const n = districtIds.length;
  const arcStart = (200 * Math.PI) / 180;
  const arcEnd = (340 * Math.PI) / 180;
  return districtIds.map((id, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const theta = arcStart + (arcEnd - arcStart) * t;
    const r = 95;
    return {
      id,
      x: basin.x + r * Math.cos(theta),
      z: basin.z + r * Math.sin(theta),
      y: 14 + 8 * t, // 14..22 m across the arc
      angleDeg: (theta * 180) / Math.PI,
    };
  });
}

/** One water/dry stream per measured/declared includeBuild source — spec
 *  §2.1. `edges` is `systemGraph.edges`, `stats` is `projectStats`. */
export function tributaries(edges, stats, anchorsById, basin) {
  const bySource = new Map();
  for (const e of edges) {
    if (e.kind !== "includeBuild") continue;
    if (!bySource.has(e.from)) bySource.set(e.from, []);
    bySource.get(e.from).push(e);
  }
  return [...bySource.entries()].map(([from, es]) => {
    const modules = stats[from]?.modules;
    const width = modules != null ? Math.max(1.2, modules * 0.1) : 1.2;
    const unmeasuredWidth = modules == null;
    const anchor = anchorsById.get(from) ?? { x: 0, z: basin.z, y: basin.y ?? 14 };
    const evidence = es.every((e) => e.evidence === "measured") ? "measured" : "declared";
    return {
      id: from,
      from: { x: anchor.x, z: anchor.z },
      to: { x: basin.x, z: basin.z },
      width,
      unmeasuredWidth,
      evidence,
      hasWater: evidence === "measured",
    };
  });
}

/** Distance from (x,z) to the straight segment a->b, in the xz plane. */
export function distToSegment(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(x - a.x, z - a.z);
  let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
  t = Math.min(1, Math.max(0, t));
  const px = a.x + t * dx;
  const pz = a.z + t * dz;
  return Math.hypot(x - px, z - pz);
}

// --- deterministic value-noise fbm (no Math.random; a fixed integer hash) ---

function hash2(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h ^= h >> 16;
  return ((h >>> 0) % 100000) / 100000;
}

function valueNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const v00 = hash2(x0, z0);
  const v10 = hash2(x0 + 1, z0);
  const v01 = hash2(x0, z0 + 1);
  const v11 = hash2(x0 + 1, z0 + 1);
  const sx = smooth01(fx);
  const sz = smooth01(fz);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return (a + (b - a) * sz) * 2 - 1; // [-1, 1]
}

/** 3-octave fbm, unit amplitude — spec §3 step 7 (`fbm(xz*0.012)*8`). */
export function fbm(x, z) {
  let sum = 0;
  let amp = 0.55;
  let freq = 1;
  for (let o = 0; o < 3; o++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum;
}
