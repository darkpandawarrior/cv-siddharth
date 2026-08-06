/* Pure morph state machine and force model for the one craft that drives the
 * playground world. Deliberately has zero three.js/R3F/Rapier imports: Craft.tsx
 * (the impure half, owned separately) calls nextMode() every physics step with a
 * MediumProbe built from that frame's raycasts/sensors, and applies whatever
 * force the buoyancy/lift helpers return. Keeping the decision logic here means
 * "does the craft ever get stuck" is a headless unit-test question, not a
 * playtest-and-hope one — see the design doc's soft-lock invariant. */

export type CraftMode = "wheels" | "hull";

export type MediumProbe = {
  grounded: boolean; // any wheel in contact this frame
  submergedDepth: number; // metres of chassis below sea level; 0 when clear
  airborneMs: number; // ms since last ground or water contact
  speed: number; // forward speed, m/s
};

// World Y of the water plane. Chosen as the coordinate origin so terrain and
// pavilions read naturally as "above" (positive Y) or "below" (negative Y)
// sea level rather than offset from some arbitrary ground height.
export const SEA_LEVEL = 0;

/**
 * Craft mass, hull propulsion and the playable bounds box.
 *
 * These are here rather than in Craft.tsx for the same reason TERRAIN is
 * exported from Terrain.tsx: they only mean anything in relation to numbers in
 * other files. CHASSIS_MASS has to agree with buoyancyForce below (get it
 * wrong and the craft either sinks or is fired out of the sea), HULL_THRUST
 * against HULL_LINEAR_DAMPING decides whether the water leg is crossable in
 * this lifetime, and WORLD_BOUNDS has to sit inside the water plane or a
 * craft can come to rest somewhere with no sea drawn under it. Every one of
 * those went wrong at least once while they were private literals in a
 * component file; worldGeometry.test.ts now asserts each relationship.
 */
export const CHASSIS_MASS = 220; // kg

/**
 * Engine force per driven wheel, and the damping that caps top speed.
 *
 * Here rather than in Craft.tsx because TERMINAL_WHEEL_SPEED below is derived
 * from them and the geometry test asserts that derived speed clears
 * LAUNCH_SPEED. They were literals in the component with the terminal speed
 * hand-copied here as `900` — the exact duplication that has now produced three
 * separate bugs in this world.
 *
 * 1150, DOWN from 2100. The climb to 2100 was compensating for the wrong
 * problem: the craft was a rear-steer, front-drive forklift (see Craft.tsx's
 * AXLE_FRONT_Z), which wasted most of its drive fighting its own geometry, so
 * more power looked like the answer. With the drivetrain corrected, 2100 put
 * ~40 m/s^2 through a 220kg car on boost — it wheelied over backwards and the
 * run ended in a respawn. Power was never the problem.
 *
 * Every number here is measured in the browser, not calculated: the naive 2F/m
 * figure runs well ahead of real acceleration once the raycast vehicle's
 * traction limit and suspension losses are in play.
 */
export const ENGINE_FORCE = 1150; // N per rear wheel, full throttle
export const BASE_LINEAR_DAMPING = 0.35;
export const HULL_LINEAR_DAMPING = 1.6; // afloat, standing in for water drag
export const HULL_THRUST = 1400; // N forward; terminal speed = thrust/(mass*damping) = 4.0 m/s
export const WORLD_BOUNDS = { minX: -45, maxX: 45, minZ: -22, maxZ: 80, minY: -10, maxY: 60 };

/**
 * Where the craft starts, and where a stuck one recovers to.
 *
 * The Y matters more than it looks. The craft's suspension holds the chassis
 * ~0.77m above the ground's top face, so a spawn at 1.5 (the original) left
 * only 0.23m of clearance — inside its own suspension travel. It penetrated
 * the mainland on the first physics step and fell through, coming to rest
 * pinned against the slab's underside by buoyancy: upright, in bounds, wheels
 * raycasting into open water, and therefore invisible to every recovery check
 * the craft has. That is the state /playground booted into while passing a
 * typecheck, a lint, 520 unit tests, 48 e2e tests and a production build.
 */
export const SPAWN_POSITION: [number, number, number] = [0, 3, -4];

/** How far the suspension holds the chassis above the surface it rests on. */
export const CHASSIS_RESTING_HEIGHT = 0.77;

/**
 * Top speed on the wheels — where engine force and damping balance. Exported
 * so the geometry test can assert the craft can actually reach the launch
 * speed its own ramp requires; ENGINE_FORCE and BASE_LINEAR_DAMPING live in
 * Craft.tsx, so this states the result rather than recomputing it there.
 */
export const TERMINAL_WHEEL_SPEED = (2 * ENGINE_FORCE) / (CHASSIS_MASS * BASE_LINEAR_DAMPING);

/** Terminal speed afloat, m/s — thrust and drag reach equilibrium here. */
export function hullTerminalSpeed(): number {
  return HULL_THRUST / (CHASSIS_MASS * HULL_LINEAR_DAMPING);
}






/**
 * The transition table, all two rows of it.
 *
 *   any    | submergedDepth > 0                 -> hull
 *   hull   | submergedDepth <= 0 && grounded    -> wheels
 *   -      | otherwise                          -> unchanged
 *
 * It used to have four modes and six rows — wings above a launch speed, orbit
 * above an altitude, a long-fall rule, and re-entry. That was the largest single
 * piece of scope creep in this world: three quarters of the failure modes came
 * from states the craft could enter and not leave, and the hub's actual job is
 * getting a visitor into one of eight rooms. Driving and sailing do that.
 */
export function nextMode(current: CraftMode, probe: MediumProbe): CraftMode {
  if (probe.submergedDepth > 0) return "hull";
  if (current === "hull" && probe.grounded) return "wheels";
  return current;
}

// Archimedes, linearised for small draft: F = ρ_water * g * waterplaneArea *
// depth. Treating the hull's waterline cross-section as constant (a dinghy
// shape, not a ball) keeps this a straight line rather than a curve fit —
// correct enough for a toy hull that's never more than knee-deep submerged.
const GRAVITY_MS2 = 9.81;
const WATER_DENSITY = 1000; // kg/m^3
const GRAVITY = GRAVITY_MS2; // m/s^2
const HULL_WATERPLANE_AREA_M2 = 1.5; // footprint of the craft's hull at the waterline
const BUOYANCY_PER_METRE = WATER_DENSITY * GRAVITY * HULL_WATERPLANE_AREA_M2; // N per metre of depth

/** Upward force from displacement, N. Zero when submergedDepth <= 0. */
export function buoyancyForce(submergedDepth: number): number {
  return submergedDepth <= 0 ? 0 : BUOYANCY_PER_METRE * submergedDepth;
}

