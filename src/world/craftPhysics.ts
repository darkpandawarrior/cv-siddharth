/* Pure morph state machine and force model for the one craft that drives the
 * playground world. Deliberately has zero three.js/R3F/Rapier imports: Craft.tsx
 * (the impure half, owned separately) calls nextMode() every physics step with a
 * MediumProbe built from that frame's raycasts/sensors, and applies whatever
 * force the buoyancy/lift helpers return. Keeping the decision logic here means
 * "does the craft ever get stuck" is a headless unit-test question, not a
 * playtest-and-hope one — see the design doc's soft-lock invariant. */

export type CraftMode = "wheels" | "hull" | "wings";

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
export const HULL_LINEAR_DAMPING = 1.6; // afloat, standing in for water drag
export const HULL_THRUST = 1400; // N forward; terminal speed = thrust/(mass*damping) = 4.0 m/s
export const WORLD_BOUNDS = { minX: -45, maxX: 45, minZ: -22, maxZ: 80, minY: -10 };

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

/* --- transition table, in priority order --- the first four rows are
 * verbatim from the design doc; the fifth (wheels -> wings on a long fall,
 * regardless of speed) is Finding 15's addition, not in the original doc —
 * called out separately because "verbatim" no longer describes the whole
 * table.
 *   any    | submergedDepth > 0                          -> hull
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
  if (probe.submergedDepth > 0) return "hull";
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
const WATER_DENSITY = 1000; // kg/m^3
const GRAVITY = 9.81; // m/s^2
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
//   level-flight speed (L == W)     18.0 m/s = sqrt(W / LIFT_PER_SPEED_SQUARED)
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
const WING_AREA_M2 = 4;
const LIFT_COEFFICIENT = 2.72;
const LIFT_PER_SPEED_SQUARED = 0.5 * AIR_DENSITY * WING_AREA_M2 * LIFT_COEFFICIENT; // ≈ 6.664 N per (m/s)^2

/** Lift from airspeed, N. Zero below STALL_SPEED. */
export function liftForce(speed: number): number {
  return speed < STALL_SPEED ? 0 : LIFT_PER_SPEED_SQUARED * speed * speed;
}
