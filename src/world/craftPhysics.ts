/**
 * The car's numbers, and nothing else.
 *
 * This file was once a morph state machine across four media — wheels, hull,
 * wings, orbit — with a transition table, a lift model and a buoyancy model.
 * All of it is gone. The world is a desk you drive a car on, so there is no
 * mode to be in and no state machine to get stuck in: the entire class of
 * "the craft entered something it could not leave" defect went with it.
 *
 * What remains is the handful of constants that only mean anything in relation
 * to numbers in other files, kept here so worldGeometry.test.ts can assert
 * those relationships. Zero three.js/R3F/Rapier imports, so it stays testable
 * headlessly.
 */



// The ground plane's Y. Everything vertical in this world is measured from
// here; it is 0 so "above ground" and "positive Y" are the same statement.
export const GROUND_LEVEL = 0;

/**
 * Craft mass, drive force and the playable bounds box.
 *
 * Here rather than in Craft.tsx because each only means something against a
 * number in another file — ENGINE_FORCE against BASE_LINEAR_DAMPING sets top
 * speed, WORLD_BOUNDS has to contain the desk, SPAWN_POSITION has to clear the
 * craft's own suspension. Every one of those went wrong at least once while
 * they were private literals in a component.
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
/**
 * The playable box. Tight to the desk now that there is nowhere else to be:
 * leave the surface in any direction and you are recovered immediately rather
 * than falling through a void looking for a floor.
 */
export const WORLD_BOUNDS = { minX: -30, maxX: 30, minZ: -26, maxZ: 24, minY: -6, maxY: 40 };

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









