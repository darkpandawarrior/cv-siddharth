import type { Checkpoint } from "./triathlon.ts";

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
 * Layout, north to south:
 *   mainland      z in [-18, 12]   the four land rooms, driveable in wheels
 *   shore + ramp  z in [12, 22]    the tapered south coast, and the launch ramp
 *   Ink sea       z in [22, 46]    open water — the strait the atolls sit past
 *   atolls        z ≈ 48           the two water rooms, one either side of x=0
 *   thermals      z ≈ 62           updraft columns, in OPEN WATER past the atolls
 *   sky islands   z ≈ 62, y ≈ 34   above the thermals, not above the atolls
 *
 * That last separation is load-bearing and was learned the hard way. The
 * atolls and the sky islands originally shared an (x, z) — island directly
 * above atoll — which reads well on paper and is unplayable: the updraft
 * column's footprint at sea level was then entirely inside the atoll's own
 * rock, so the only place you could enter the column was a place you were
 * standing on solid ground, and the column is (correctly) disabled while
 * grounded. The air leg was unreachable and the water rooms were unparkable
 * for the same reason. Pulling the islands 14m further south puts each
 * column over open water, where a craft afloat can sail into it — which is
 * what makes the hull→wings handoff the course is built around possible.
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

export type Medium = "land" | "water" | "air";

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

  // Sky islands — south of their atoll, not above it (see the layout note in
  // this file's header for why that gap has to exist). Each sits directly
  // above a THERMALS column standing in open water.
  { to: "/blueprint", position: [-14, 34, 62], medium: "air", shape: "board" },
  { to: "/map", position: [14, 34, 62], medium: "air", shape: "pcb" },
];

/**
 * The triathlon course. Routed so no single craft mode can finish it:
 * a mainland sprint (wheels) ends at a ramp that launches the craft into a
 * glide (wings), it splashes down into the Ink sea (hull), sails the
 * remaining strait to an atoll, then catches that atoll's thermal to climb
 * back into wings and land on the sky island above. Ids are sequential from
 * 0 — triathlon.ts's passCheckpoint() advances one id at a time and ignores
 * anything out of order, so a gap or a duplicate here would silently strand
 * a runner mid-course. triathlon.ts's CHECKPOINT_COUNT is derived from this
 * array's length (not a second hand-maintained number — see that file's
 * comment for why importing the value back is safe despite the type-only
 * import in the other direction), so the array's length IS the contract:
 * whatever the last id here is, the course finishes on it.
 *
 * The course runs the west (weeb/blueprint) corridor; the east corridor
 * exists to drive to and explore but isn't timed.
 */
export const CHECKPOINTS: Checkpoint[] = [
  { id: 0, position: [-10, 0.5, -14], radius: 3 }, // sprint start, near Compose
  { id: 1, position: [-10, 2.5, 16], radius: 3 }, // ramp launch, mainland's south edge
  { id: 2, position: [-10, 9, 28], radius: 4 }, // glide apex over open water
  { id: 3, position: [-12, 0.4, 34], radius: 4 }, // splashdown into the Ink sea
  { id: 4, position: [-14, 0.4, 46], radius: 4 }, // sail the strait to the atoll's shore
  { id: 5, position: [-14, 20, 62], radius: 5 }, // catch the thermal, climbing
  { id: 6, position: [-14, 34, 62], radius: 4 }, // land on the Blueprint sky island — finish
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
// RADIUS, corrected: 4 was too small and for the wrong reason. It was shrunk
// under the sky island's 4.5m half-width to keep the column's footprint inside
// the slab — but the column no longer needs to hide under anything, because
// `ceilingY` bounds it in Y and Craft.tsx skips it while grounded. What 4 DID
// do was make the column narrower than the atoll that used to sit beneath it,
// so there was no water inside it to enter from. With the islands moved to
// open water (see the header note), 7 gives a column a craft can plausibly
// sail into without being so wide it's impossible to avoid.
/**
 * Launch pads — the route to orbit, one on each sky island.
 *
 * The chain is deliberate and each link teaches the next: ramp to fly, thermal
 * to climb, island to land, pad to leave the atmosphere. Space is 70m up and
 * nothing else in the world gets close — a full boosted climb off the ramp tops
 * out around 10m — so without these it is a mode the craft can enter and no
 * visitor could ever reach.
 *
 * Unlike THERMALS these fire even while GROUNDED: you drive onto the pad and it
 * throws you. That is the point — a column you have to be already airborne to
 * use would be unreachable standing on the island it sits on, which is exactly
 * the mistake the thermals made in their first two versions.
 */
export const SPACE_LIFTS: {
  position: [number, number, number];
  radius: number;
  strength: number;
  ceilingY: number;
}[] = [
  { position: [-14, 34, 62], radius: 3, strength: 26, ceilingY: 74 },
  { position: [14, 34, 62], radius: 3, strength: 26, ceilingY: 74 },
];

export const THERMALS: { position: [number, number, number]; radius: number; strength: number; ceilingY: number }[] = [
  { position: [-14, 17, 62], radius: 7, strength: 14, ceilingY: 32 },
  { position: [14, 17, 62], radius: 7, strength: 14, ceilingY: 32 },
];
