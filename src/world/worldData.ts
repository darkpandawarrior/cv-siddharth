
/**
 * The world's layout — where every room, checkpoint and thermal sits in
 * three.js space. Every other scene module (Terrain, Water, Pavilions,
 * Craft, Hud) reads these numbers, so the coordinate scheme is fixed here
 * and nowhere else.
 *
 * COORDINATE SCHEME (toy-desk scale — the whole course is a few seconds'
 * drive/glide/sail end to end, matching the "desk scale" primitives rule in
 * the design doc rather than anything realistically sized):
 *
 *   +X = east, -X = west
 *   +Y = up, Y = 0 is SEA LEVEL (matches craftPhysics.ts's SEA_LEVEL — this
 *        file doesn't re-export that constant, it just agrees with it)
 *   +Z = south, -Z = north
 *   origin (0,0,0) = the centre of the mainland, at sea level
 *
 * LAYOUT: one desk, eight rooms, two rows. There is no sea and no sky — the
 * world had three media and most of its defects were states the craft could
 * enter and not leave, so it has one surface now and every room sits on it.
 */


/**
 * The landmass dimensions, exported so worldGeometry.test.ts can assert the
 * relationships BETWEEN them.
 *
 * These lived as bare literals inside the JSX below, and that is precisely how
 * this world shipped twice with a 2m trench across its only southbound route,
 * shore strips 1m narrower than the coast they surfaced, and updraft columns
 * buried inside the very islands they were meant to lift you off. Every one of
 * those is a relationship between two numbers in different files — invisible to
 * a typechecker, invisible to a unit test of either file alone, and invisible
 * to a rendering test that only asks whether a canvas appeared. Naming them
 * here makes them assertable; the test file states each invariant in prose
 * alongside the check.
 */
export const TERRAIN = {
  /** Mainland slab. z1 MUST equal SHORE.z0 or there is a cliff between them. */
  mainland: { halfWidth: 21, z0: -18, z1: 12, groundY: 0.5 },
  /** The tapered south coast (and the launch ramp sharing its z run). */
  shore: { z0: 12, z1: 22, xMin: -21, xMax: 21, rampCenterX: -10, rampWidth: 10, rampTopY: 3.4 },
} as const;


// Half-extents of the sensor volume a `medium: "water"` room uses, overriding
// the per-shape sizes in Pavilions.tsx. Here rather than there because the
// number is meaningless on its own: it only has to clear atollWaterlineRadius
// above, and worldGeometry.test.ts asserts exactly that. 6.0 covers the
// ~4.5m waterline radius plus the craft's own half-length with margin, so a
// craft floating alongside genuinely intersects it — it cannot climb the
// atoll, so entering from the water is the only way in.
export const WATER_SENSOR_HALF_EXTENTS: [number, number, number] = [6, 2.6, 6];

/**
 * Where to place the CENTRE of a tilted slab so its TOP FACE runs along the
 * line (z0,y0)→(z1,y1) — i.e. so the surface you drive on is the surface the
 * layout describes.
 *
 * Pure, and here rather than inside Terrain.tsx, because getting it wrong is
 * invisible to the eye and fatal to play: positioning these slabs by their
 * centre line put the shore's driving surface half a slab ABOVE the mainland,
 * a 0.5m step across the full width of the map right where every run south
 * passes. The craft hit it at speed and flipped, every time.
 */
export function tiltedSlabCenterY(y0: number, y1: number, run: number, thickness: number): number {
  const angle = -Math.atan2(y1 - y0, run);
  return (y0 + y1) / 2 - (thickness / 2) * Math.cos(angle);
}


export type Placement = {
  to: string; // MUST match a ROOMS[].to
  position: [number, number, number];
  shape: "slab" | "crt" | "board" | "pcb";
};

// Room-to-medium assignment is fixed by the design doc, not a free choice
// made here: land = compose/lab/forge/terminal, water = weeb/chess (atolls
// in the Ink sea), air = blueprint/map (sky islands, thermal-gated).
export const PLACEMENTS: Placement[] = [
  // Eight rooms, two rows, all on the desk.
  //
  // They were spread across land, sea and sky when the world had three media.
  // With one surface the layout's only job is to be legible and easy to reach:
  // a grid you can see across, spaced so you can place the car on one without
  // clipping its neighbour, and nothing more than a few seconds' drive apart.
  { to: "/compose", position: [-15, 0.5, -11], shape: "slab" },
  { to: "/lab", position: [-5, 0.5, -11], shape: "crt" },
  { to: "/blueprint", position: [5, 0.5, -11], shape: "board" },
  { to: "/map", position: [15, 0.5, -11], shape: "pcb" },
  { to: "/forge", position: [-15, 0.5, 5], shape: "pcb" },
  { to: "/terminal", position: [-5, 0.5, 5], shape: "crt" },
  { to: "/weeb", position: [5, 0.5, 5], shape: "crt" },
  { to: "/chess", position: [15, 0.5, 5], shape: "board" },
];


// Updraft cylinders, one under each sky island, matching the mirrored x/z of
// PLACEMENTS above so "rising off the sky islands" is literally true: the
// column and the island it feeds share x and z, differing only in y. `position[1]`
// (17) is still just a cosmetic "roughly the column's vertical midpoint"
// value — Craft.tsx tests horizontal distance against `radius` to decide
// whether the craft is inside the column, so that number itself bounds
// nothing.
//
// FINDING 2 fix — `radius` and `ceilingY` DO bound the column now, which they
// didn't before:
//   - radius shrunk from 7 to 4, under the sky islands' 4.5m half-width (a 9x9
//     slab per Terrain.tsx's SkyIsland) so the column's footprint at the top
//     stays inside the slab it's supposed to feed rather than overhanging its
//     edge, and under the atoll's own ~4.2-5m radius (Terrain.tsx's Atoll) so
//     there's a dry ring near each atoll's rim outside the column to park on.
//   - ceilingY caps the column well below the slab: both sky islands sit with
//     their top surface at y=34 and are 1m thick (Terrain.tsx's SkyIsland
//     boxGeometry), so the underside is at y=33. ceilingY=32 stops the force
//     a further metre short of that, so the craft coasts the last bit under
//     its own momentum instead of the thermal shoving it straight into (or
//     through) the slab's underside with nothing to arrest it.
//
// Confirming a craft can actually ride this to the slab: net upward accel
// while inside the column is `strength - g` = 14 - 9.81 ≈ 4.19 m/s^2 (see
// Craft.tsx's own comment on `strength`'s units). Rising from ~sea level to
// ceilingY (32) while ungrounded uses wheels-mode damping (0.35, applied by
// Craft.tsx whenever the craft isn't in hull or wings), giving a terminal
// vertical speed of accel/damping ≈ 12 m/s — reached well before the ~32m
// climb is over — and a coast height past the cutoff of v^2/(2g) ≈ 7.3m,
// several times the 1m gap from ceilingY to the slab's underside. Force is
// also skipped entirely while grounded (Craft.tsx), so idling on an atoll's
// dry ring, or anywhere with wheels planted, no longer gets shoved skyward —
// the original bug (3080N against a 220kg craft's 2158N weight, applied
// unconditionally at any altitude) is what made atolls unparkable and pinned
// or launched a craft that reached a sky island from underneath.
