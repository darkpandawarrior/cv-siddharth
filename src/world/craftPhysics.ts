/* Pure morph state machine and force model for the one craft that drives the
 * playground world. Deliberately has zero three.js/R3F/Rapier imports: Craft.tsx
 * (the impure half, owned separately) calls nextMode() every physics step with a
 * MediumProbe built from that frame's raycasts/sensors, and applies whatever
 * force the buoyancy/lift helpers return. Keeping the decision logic here means
 * "does the craft ever get stuck" is a headless unit-test question, not a
 * playtest-and-hope one — see the design doc's soft-lock invariant. */

export type CraftMode = "wheels" | "hull" | "wings" | "orbit";

export type MediumProbe = {
  grounded: boolean; // any wheel in contact this frame
  submergedDepth: number; // metres of chassis below sea level; 0 when clear
  airborneMs: number; // ms since last ground or water contact
  speed: number; // forward speed, m/s
  altitude: number; // metres above SEA_LEVEL
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
export const WORLD_BOUNDS = { minX: -45, maxX: 45, minZ: -22, maxZ: 80, minY: -10, maxY: 300 };

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

// Minimum forward speed for wheels -> wings, i.e. the ramp-launch threshold.
// ~50 km/h is a plausible speed to come off a keycap-ramp launch (see
// worldData.ts's THERMALS/checkpoint routing) for a toy-car-scale craft.
export const LAUNCH_SPEED = 14; // m/s

// Below this, wings generate no lift at all (liftForce returns 0). Set lower
// than LAUNCH_SPEED on purpose: the craft always launches with margin, so the
// speed it bleeds climbing away from the ramp doesn't stall it out
// immediately — the deliberate gap IS the flying-is-forgiving design goal.
export const STALL_SPEED = 9; // m/s

// FINDING 15 fix: `speed` in MediumProbe is the vehicle controller's
// forward-axis-projected speed (see Craft.tsx), which stays ~flat during a
// nose-level vertical fall — a craft that drives off a sky island's edge
// (only 4.5m of run-up available, well short of what it takes to reach
// LAUNCH_SPEED under its own power — see the envelope note below liftForce)
// never satisfies the ordinary wheels->wings speed condition and free-falls
// as a "car" with no pitch/roll authority the entire way down. This second,
// unconditional wheels->wings rule exists only to hand back flight controls
// once a fall has clearly gone on too long to be a bump — 1.5s of continuous
// airborne-ness covers 0.5*9.81*1.5^2 ≈ 11m of drop, well inside a sky
// island's ~34m clearance to the sea, leaving real room to nose down (which
// *does* register as forward speed once the chassis pitches, since the probe
// reads velocity along whatever the chassis's local forward axis currently
// points), build airspeed past STALL_SPEED, and pull into an actual glide
// rather than augering in. Deliberately much longer than the 300ms half of
// the ordinary rule so a normal bump/landing hop never trips it.
export const LONG_FALL_MS = 1500;

/**
 * Where the air runs out and orbit begins.
 *
 * 70m is chosen off the world's own geometry, not picked for feel: the sky
 * islands sit at y=34 and a craft leaving one on a full thermal climb tops out
 * around y=40, so nothing reaches this by accident. Getting here takes a
 * deliberate climb — ride a thermal to its ceiling, then hold the boost through
 * the gap. That makes space something you discover by trying, which is the only
 * kind of secret worth putting in a portfolio.
 */
export const SPACE_ALTITUDE = 70;

/**
 * Gravity's share up there. Not zero, and not nearly zero either.
 *
 * At 0.12 the craft left the launch pad and simply kept going: 455m and still
 * climbing when the test gave up, decelerating at 1.2 m/s² from ~90 m/s, with
 * no upper bound anywhere in the world to catch it. "A soft-lock with a nice
 * view" was written as a joke in this comment and then shipped as the actual
 * behaviour. 0.55 keeps orbit feeling weightless while guaranteeing every climb
 * turns around on its own.
 */
export const ORBIT_GRAVITY_SCALE = 0.55;

/** Free thrust in orbit, N. No wings work in vacuum, so this is the only way
 *  to move — and the only way back down is to stop using it. */
export const ORBIT_THRUST = 2600;

/**
 * The top of the sky. Above this, a restoring force pushes back down hard
 * enough that no amount of thrust escapes — a ceiling you can feel rather than
 * a wall you hit, and the reason WORLD_BOUNDS.maxY below is a backstop that
 * should never fire rather than the primary mechanism.
 */
export const ORBIT_CEILING = 160;

/* --- transition table, in priority order --- the first four rows are
 * verbatim from the design doc; the fifth (wheels -> wings on a long fall,
 * regardless of speed) is Finding 15's addition, not in the original doc —
 * called out separately because "verbatim" no longer describes the whole
 * table.
 *   any    | altitude >= SPACE_ALTITUDE                   -> orbit
 *   any    | submergedDepth > 0                          -> hull
 *   orbit  | altitude < SPACE_ALTITUDE                    -> wings (re-entry)
 *   wheels | airborneMs > 300 && speed >= LAUNCH_SPEED    -> wings
 *   wheels | airborneMs > LONG_FALL_MS                    -> wings
 *   hull   | submergedDepth <= 0 && grounded              -> wheels
 *   wings  | grounded                                     -> wheels
 *   —      | otherwise                                    -> unchanged
 *
 * The ordering matters, not just the individual rules: rule 1 is checked
 * before the wheels->wings rules so a craft that's mid-air over water and
 * *also* clipping the surface becomes a hull, not wings, on the way down.
 * And the wings->wheels rule (wings -> grounded -> wheels) is unconditional
 * on speed — that's what makes "wings at speed 0 must return to wheels on
 * ground contact" hold: there's no dead branch where wings sits at zero
 * airspeed on the ground waiting for a launch condition it can never
 * re-trigger from where it's parked. */
export function nextMode(current: CraftMode, probe: MediumProbe): CraftMode {
  // Orbit outranks everything except water, and water can't happen up there.
  // Checked before the wheels->wings rules for the same reason rule 1 is:
  // whichever medium the craft is physically IN wins over what it was doing.
  if (probe.altitude >= SPACE_ALTITUDE) return "orbit";
  if (probe.submergedDepth > 0) return "hull";
  // Re-entry. Falling back below the line hands the wings back rather than
  // dropping straight to wheels — otherwise a craft returning from orbit would
  // have no control authority for the entire descent.
  if (current === "orbit") return "wings";
  if (current === "wheels" && probe.airborneMs > 300 && probe.speed >= LAUNCH_SPEED) return "wings";
  if (current === "wheels" && probe.airborneMs > LONG_FALL_MS) return "wings";
  if (current === "hull" && probe.submergedDepth <= 0 && probe.grounded) return "wheels";
  if (current === "wings" && probe.grounded) return "wheels";
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

// Standard lift equation, L = 0.5 * ρ_air * v^2 * wingArea * C_L. The wing
// area and lift coefficient are picked for a small craft's feel (climbs
// promptly once past STALL_SPEED) rather than fitted to any real airframe.
//
// FINDING 3 fix — THE FLIGHT ENVELOPE, worked from Craft.tsx's numbers so the
// next person can check it in one place instead of two files disagreeing
// again (run the numbers yourself before touching CHASSIS_MASS, ENGINE_FORCE,
// WING_AREA_M2, LIFT_COEFFICIENT or LAUNCH_SPEED — changing any one moves all
// of the below):
//
//   CHASSIS_MASS (Craft.tsx)       220 kg  -> weight W = 2158 N
//   top speed on wheels                    -> 2*ENGINE_FORCE/(mass*damping)
//                                              = 1800/(220*0.35) ≈ 23.4 m/s
//   LAUNCH_SPEED                    14 m/s  (wheels -> wings threshold)
//   level-flight speed (L == W)     11.9 m/s = sqrt(W / LIFT_PER_SPEED_SQUARED)
//                                   — MUST stay below LAUNCH_SPEED (14); see levelFlightSpeed()
//   STALL_SPEED                      9 m/s  (lift == 0 below this)
//
// Net vertical acceleration at the speeds that actually matter (lift minus
// weight, divided by mass — positive climbs, negative sinks):
//   at STALL_SPEED  (9 m/s):  lift ≈  540 N (25% of weight) -> -7.4 m/s^2 (freefall-ish)
//   at LAUNCH_SPEED (14 m/s): lift ≈ 1306 N (61% of weight) -> -3.9 m/s^2 (a shallow glide,
//                              not a nosedive — combined with the ramp's own launch angle
//                              this reads as "climbs off the ramp, then settles into a glide")
//   at level-flight (18 m/s): lift ==  weight               ->  0.0 m/s^2 (momentary level flight)
//   at top speed (23.4 m/s):  lift ≈ 3643 N (169% of weight)-> +6.8 m/s^2 (a strong climb)
//
// So a launch built up to anywhere near top speed climbs hard, bleeds speed
// as it climbs (there's no thrust in wings mode — see Craft.tsx's WING_PITCH/
// ROLL comment), passes through level flight around 18 m/s, and settles into
// a gentle glide below that — steepening toward stall as it keeps slowing,
// exactly the "genuinely climbs and glides" shape Finding 3 asked for. This
// is a non-constant, speed-dependent glide by design (a real trimmed L/D
// figure doesn't apply — this model has no separate induced-drag term), but
// for a concrete sanity number: at LAUNCH_SPEED's -3.9 m/s^2, one second of
// unchecked sink costs about 2m of altitude against roughly 14m of forward
// travel — a shallow ~7:1 glide right off the ramp, not a stone drop.
//
// CHASSIS_MASS is unchanged (220 kg) specifically so buoyancyForce below
// doesn't need re-deriving — see its own comment and Craft.tsx's mass
// comment for why 220 is tied to that formula. This reconciliation only
// retunes WING_AREA_M2/LIFT_COEFFICIENT (bigger, arcade wings — still not a
// real airframe fit) to move the level-flight speed down into the range the
// wheels can actually reach before launch, which is the number that was
// missing before: LIFT_PER_SPEED_SQUARED was 1.378, needing 39.6 m/s for
// level flight against a 23.4 m/s top speed — physically unreachable, hence
// "wings produce ~12% of the lift needed" at LAUNCH_SPEED (270N / 2158N).
const AIR_DENSITY = 1.225; // kg/m^3, sea-level
const WING_AREA_M2 = 6.4;
const LIFT_COEFFICIENT = 3.9;
const LIFT_PER_SPEED_SQUARED = 0.5 * AIR_DENSITY * WING_AREA_M2 * LIFT_COEFFICIENT; // ≈ 15.29 N per (m/s)^2

/**
 * The speed at which lift exactly balances weight — i.e. the slowest the craft
 * can fly without descending.
 *
 * THIS MUST BE BELOW LAUNCH_SPEED, and it wasn't. The previous tuning put level
 * flight at 18.0 m/s while the craft transitions to wings at 14, which means
 * every single launch began already below flying speed: the craft left the
 * ramp, sank, and splashed down a second later, every time, no matter how the
 * driver flew it. The air leg looked implemented and was arithmetically
 * impossible — the same shape of defect as the trench and the buried thermals,
 * two numbers in a valid-looking relationship that nobody multiplied out.
 * worldGeometry.test.ts now asserts the inequality.
 */
export function levelFlightSpeed(): number {
  return Math.sqrt((CHASSIS_MASS * GRAVITY_MS2) / LIFT_PER_SPEED_SQUARED);
}

/** Lift from airspeed, N. Zero below STALL_SPEED. */
export function liftForce(speed: number): number {
  return speed < STALL_SPEED ? 0 : LIFT_PER_SPEED_SQUARED * speed * speed;
}
