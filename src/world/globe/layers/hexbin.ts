// WAVE 6 LANE X6 (density layer). Pure spherical hex-binning: no three, no
// React — same "render layer wraps pure math" split as geoMath.ts.
//
// Real equal-area hex grids over a sphere (Uber's H3, the ISEA/Snyder
// discrete global grids used for land-surface stats) tile an icosahedron.
// This is the lightweight version of the same idea: seed bin CENTRES with
// geoMath.ts's own Fibonacci lattice — already built to spread points evenly
// by AREA over the sphere, not by angle — then assign each input point to
// its nearest centre by angular distance (max dot product of unit vectors,
// the spherical form of nearest-neighbour). The resulting cells approximate
// a Voronoi tessellation of a near-uniform point set, which is what a real
// hexbin scheme approximates too: "equal-area-ish", as the brief asks for,
// not a true ISEA grid.
import { fibonacciLattice, latLonToXyz, type LatLon } from "../geoMath.ts";

export interface HexPoint {
  lat: number;
  lon: number;
  kind: "quake" | "fire";
}

export interface HexBin {
  lat: number;
  lon: number;
  quakeCount: number;
  fireCount: number;
  /** quakeCount + fireCount — what drives column height and colour. Stated
   *  explicitly per the brief: this is a COUNT, never a summed magnitude —
   *  a M2 and a M7 both count as one quake here, same as any one wildfire.
   *  A magnitude-weighted density is a different, equally valid metric;
   *  this file draws the honest simple one and Inspector.tsx says so. */
  total: number;
}

interface Centre extends LatLon {
  x: number;
  y: number;
  z: number;
}

/** Nearest lattice centre's index for a point, by max dot product (smallest
 *  angular separation) of unit-sphere vectors — O(centres) per point, no
 *  spatial index. ponytail: fine at hazard-feed scale (a few hundred points
 *  x a few hundred centres); add a grid/kd-tree if a future feed makes this
 *  measurably slow. */
function nearestCentre(p: LatLon, centres: Centre[]): number {
  const v = latLonToXyz(p.lat, p.lon);
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < centres.length; i++) {
    const c = centres[i];
    const dot = v.x * c.x + v.y * c.y + v.z * c.z;
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

/** Bins `points` into up to `cellCount` roughly-equal-area cells. Empty
 *  cells are dropped — a caller drawing one instanced column per bin never
 *  pays for the (majority) empty ocean. Deterministic for the same inputs,
 *  same as `fibonacciLattice` itself. */
export function hexbinPoints(points: HexPoint[], cellCount: number): HexBin[] {
  if (points.length === 0 || cellCount <= 0) return [];
  const centres: Centre[] = fibonacciLattice(cellCount).map((ll) => {
    const v = latLonToXyz(ll.lat, ll.lon);
    return { lat: ll.lat, lon: ll.lon, x: v.x, y: v.y, z: v.z };
  });
  const counts = new Map<number, { quakeCount: number; fireCount: number }>();
  for (const p of points) {
    const i = nearestCentre(p, centres);
    const c = counts.get(i) ?? { quakeCount: 0, fireCount: 0 };
    if (p.kind === "quake") c.quakeCount++;
    else c.fireCount++;
    counts.set(i, c);
  }
  const bins: HexBin[] = [];
  for (const [i, c] of counts) {
    const centre = centres[i];
    bins.push({ lat: centre.lat, lon: centre.lon, quakeCount: c.quakeCount, fireCount: c.fireCount, total: c.quakeCount + c.fireCount });
  }
  return bins;
}

/** sqrt compresses a single very active bin so it doesn't dwarf every other
 *  column on screen. Pure 0..1 fraction of the tallest bin currently drawn;
 *  the render layer scales this by its own max column height. */
export function densityHeight(total: number, maxTotal: number): number {
  if (maxTotal <= 0 || total <= 0) return 0;
  return Math.sqrt(total / maxTotal);
}

// A small perceptual ramp (dark indigo -> teal -> warm yellow) — deliberately
// NOT the site's brand tokens: those key a binary state (live/failed/probe),
// not a continuous magnitude scale (brief: "perceptual ramp, not brand").
// Three sRGB stops, linearly interpolated — plenty at the handful of columns
// this layer ever draws at once; no Lab/Oklab library needed for that.
const RAMP: readonly [number, number, number][] = [
  [0x0b, 0x13, 0x3a],
  [0x1f, 0x9e, 0x9e],
  [0xf6, 0xd1, 0x4b],
];

export const DENSITY_LEGEND = {
  unit: "of current maximum count",
  stops: RAMP.map((rgb, i) => ({ color: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join(""), label: ["0%", "50%", "100%"][i] })),
};

/** `t` in 0..1 (a bin's own fraction of the tallest bin) -> an sRGB 0..1
 *  triple. Clamped, so a caller never has to pre-clamp its own input. */
export function densityColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  return [(a[0] + (b[0] - a[0]) * f) / 255, (a[1] + (b[1] - a[1]) * f) / 255, (a[2] + (b[2] - a[2]) * f) / 255];
}
