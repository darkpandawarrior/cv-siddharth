
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
 * Layout, north to south (two media only — see craftPhysics):
 *   mainland      z in [-18, 12]   the four land rooms, driveable in wheels
 *   shore + ramp  z in [12, 22]    the tapered south coast, and the launch ramp
 *   Ink sea       z in [22, 46]    open water — the strait the atolls sit past
 *   atolls        z ≈ 48           the two water rooms, one either side of x=0
 *   far atolls    z ≈ 62           two more water rooms, a longer sail out
 *
 * Mirrored east/west: everything on the `weeb`/`blueprint` side lives at
 * negative X, everything on the `chess`/`map` side at positive X. That
 * symmetry is deliberate — it means Terrain and Pavilions can build one
 * atoll/island pair and mirror it, instead of two bespoke shapes.
 */

/**
 * The sea's mesh footprint. Layout data, so it lives here rather than inside
 * Water.tsx — the number that matters about the water plane is not how it
 * looks but whether it is bigger than the box the craft is allowed to move in
 * (craftPhysics.ts's WORLD_BOUNDS). When it wasn't, a craft could come to rest
 * on open sea that was never drawn.
 */
export const WATER_PLANE = { width: 100, depth: 110, centerZ: 30 } as const;

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
  /** Atoll cone: wider at the base than the top, so its radius AT THE
   *  WATERLINE is between the two — that interpolated value is what any
   *  reachability question is actually about. */
  atoll: { topRadius: 4.2, baseRadius: 5, height: 0.7, centerOffsetY: -0.35 },
  /** Sky island slab: `half` is half its width, `thickness` its depth in Y. */
  skyIsland: { half: 4.5, thickness: 1 },
} as const;

/** The atoll's radius where it meets the sea (y=0) — linear interpolation up
 *  the cone's flank. This is the number that decides whether a thermal column
 *  has any open water in it and whether a room sensor is reachable afloat. */
export function atollWaterlineRadius(placementY: number): number {
  const { topRadius, baseRadius, height, centerOffsetY } = TERRAIN.atoll;
  const bottomY = placementY + centerOffsetY - height / 2;
  const t = Math.min(1, Math.max(0, (0 - bottomY) / height));
  return baseRadius + (topRadius - baseRadius) * t;
}

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

export type Medium = "land" | "water";

export type Placement = {
  to: string; // MUST match a ROOMS[].to
  position: [number, number, number];
  medium: Medium;
  shape: "slab" | "crt" | "board" | "atoll" | "pcb";
};

// Room-to-medium assignment is fixed by the design doc, not a free choice
// made here: land = compose/lab/forge/terminal, water = weeb/chess (atolls
// in the Ink sea), air = blueprint/map (sky islands, thermal-gated).
export const PLACEMENTS: Placement[] = [
  // Mainland — the four corners of the land mass, y=0.5 sits each pavilion's
  // base half a unit above sea level (the mainland's ground plane).
  { to: "/compose", position: [-10, 0.5, -10], medium: "land", shape: "slab" },
  { to: "/lab", position: [10, 0.5, -10], medium: "land", shape: "crt" },
  // Forge sits on the mainland's south edge, next to the ramp the triathlon
  // launches off — thematically the room about building things is also
  // where the course leaves the ground.
  { to: "/forge", position: [-10, 0.5, 10], medium: "land", shape: "pcb" },
  { to: "/terminal", position: [10, 0.5, 10], medium: "land", shape: "crt" },

  // Atolls — small islands south of the strait, one either side of centre.
  { to: "/weeb", position: [-14, 0.3, 48], medium: "water", shape: "atoll" },
  { to: "/chess", position: [14, 0.3, 48], medium: "water", shape: "board" },

  // Were sky islands, reachable only by flight. Flight is gone (see
  // craftPhysics's transition table for why), so they are atolls like the other
  // two — every room in this world is now reachable by driving or sailing,
  // which is the entire job of a hub.
  { to: "/blueprint", position: [-16, 0.3, 62], medium: "water", shape: "board" },
  { to: "/map", position: [16, 0.3, 62], medium: "water", shape: "pcb" },
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
