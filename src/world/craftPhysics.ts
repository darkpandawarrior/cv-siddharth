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
 * 820, DOWN from 1150 (which was itself down from 2100 — see git history for
 * that earlier retune). This one isn't a handling fix, it's a scale fix: the
 * slab grew from a 42m desk to a 168m, ten-year boulevard, and a car that
 * crosses ten years in under five seconds turns the one idea the whole world
 * is built on — that driving is what resolves the city, and the city is a
 * timeline — into a blur. 820 paired with the damping bump below lands
 * TERMINAL_WHEEL_SPEED at ~19.6 m/s, an 8.6s flat-out traverse of the full
 * slab (worldGeometry.test.ts asserts the traversal time directly). Damping
 * absorbed part of the cut rather than force alone, so acceleration feel and
 * cornering traction survive the change instead of just top speed dropping.
 *
 * Every number here is measured in the browser, not calculated: the naive 2F/m
 * figure runs well ahead of real acceleration once the raycast vehicle's
 * traction limit and suspension losses are in play.
 */
export const ENGINE_FORCE = 820; // N per rear wheel, full throttle
export const BASE_LINEAR_DAMPING = 0.38;
/**
 * The playable box. Tight to the slab now that there is nowhere else to be:
 * leave the surface in any direction and you are recovered immediately rather
 * than falling through a void looking for a floor.
 *
 * Sized for the 56x168m boulevard (CITY.halfWidth=28, CITY.z0=-80,
 * CITY.z1=88 in city.ts — kept as an independent literal here rather than an
 * import, matching this file's existing pattern of numbers cross-checked by
 * worldGeometry.test.ts rather than wired together at runtime) with margin
 * past every legitimate edge: the west/east districts build out to
 * CITY.buildOuter (27), and the two facet threads (city.ts's ResolveSource
 * apex, up to ~30m) need vertical clearance the old maxY of 40 didn't budget
 * for a car that might glance the underside of one at speed.
 */
export const WORLD_BOUNDS = { minX: -34, maxX: 34, minZ: -88, maxZ: 96, minY: -6, maxY: 60 };

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
 * typecheck, a lint, 520 unit tests, 48 e2e tests and a production build. Y
 * is unchanged here — 3 still clears 1.5x the resting height with room to
 * spare — only X/Z moved.
 *
 * Z is now -74: inside 2017's band (city.ts's yearZ(2017) = -72), a few
 * metres from /map's bay at z=-70 — the first door a visitor should reach is
 * the storyboard overview, and it should be the first thing they see resolve
 * out of the dust. This was the slab's own z-midpoint (-4) when the world was
 * 30m long; on a ten-year boulevard the midpoint is 2021, and starting a
 * visitor's story in the middle of it defeats the entire point of the axis.
 */
export const SPAWN_POSITION: [number, number, number] = [0, 3, -74];

/** How far the suspension holds the chassis above the surface it rests on. */
export const CHASSIS_RESTING_HEIGHT = 0.77;

/**
 * Top speed on the wheels — where engine force and damping balance. Exported
 * so the geometry test can assert the craft can actually reach the launch
 * speed its own ramp requires; ENGINE_FORCE and BASE_LINEAR_DAMPING live in
 * Craft.tsx, so this states the result rather than recomputing it there.
 */
export const TERMINAL_WHEEL_SPEED = (2 * ENGINE_FORCE) / (CHASSIS_MASS * BASE_LINEAR_DAMPING);









