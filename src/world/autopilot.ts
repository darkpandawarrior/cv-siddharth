/**
 * Auto-drive: the world driving itself.
 *
 * The world shipped as a driving game with no stated objective — eight rooms
 * on a 168m slab, a compass full of chips, and a HUD panel of instrument
 * readings. A visitor who didn't want to learn WASD had nothing to do, and a
 * visitor who did had nowhere to go. This module is the answer to both: pick
 * the next stop, and produce the axes that get there.
 *
 * Pure on purpose — no three.js, no Rapier, no React. It takes a pose and a
 * target and returns what the keyboard would have been holding, which means
 * the whole steering law is testable headlessly (autopilot.test.ts) and the
 * craft needs no autopilot-specific code path: Craft.tsx keeps reading exactly
 * one `input` singleton whether a human or this file is filling it in.
 *
 * SIGN CONVENTIONS, because two of them are counter-intuitive and both are
 * load-bearing:
 *   - `heading` is atan2(forward.x, forward.z) — bearing from world +Z,
 *     increasing toward +X (telemetry.ts).
 *   - the driver's RIGHT is world -X (right = forward × up = (-1,0,0)), so
 *     steering right DECREASES heading. A target that needs a heading
 *     increase is therefore to the LEFT and wants NEGATIVE steer — hence the
 *     minus in `steerFor` below. Craft.tsx's STEER_SIGN comment is the other
 *     half of this story.
 */

export type Pose = {
  x: number;
  z: number;
  /** Bearing from +Z, radians, increasing toward +X. */
  heading: number;
  /** Forward speed, m/s. */
  speed: number;
};

export type Stop = { to: string; x: number; z: number };

export type AutoAxes = { steer: number; throttle: number; brake: boolean; boost: boolean };

/** Close enough to count as arrived. Inscribed inside Pavilions.tsx's 4.8m
 *  sensor half-extent so that stopping here always means the room prompt is
 *  already up whatever angle the approach came from, and comfortably outside
 *  every pavilion's own structure so the car pulls up at the door rather than
 *  driving through the building it was aiming at. */
export const ARRIVE_RADIUS = 4.4;

/**
 * The stall rule, and why arrival needs one at all.
 *
 * Measured in the browser: the craft would coast to within ~4.2m of a room,
 * run out of throttle authority against the last of the approach taper, and
 * sit there — never inside the arrival radius, so the tour never advanced,
 * while Craft.tsx's beached-recovery (throttle down, going nowhere, 3s)
 * quietly teleported it back to spawn to start the whole approach again. A
 * tour that loops forever between two rooms is worse than no tour.
 *
 * So "arrived" is two rules, not one: inside the radius, OR near it and
 * demonstrably not moving. The second is what an actual driver means by
 * arriving — the car has stopped, at the place, whatever the odometer says.
 */
export const STALL_RADIUS = ARRIVE_RADIUS * 1.8;
export const STALL_SPEED = 0.6;
export const STALL_MS = 900;

/**
 * The approach is a SPEED controller, not a throttle taper. This is the
 * second rewrite of it, and the two failures it sits between are worth
 * stating because they are opposites and a taper cannot avoid both.
 *
 * Taper by distance alone (v1): throttle falls off as you close, so the car
 * creeps the last few metres, runs out of force against damping and stops
 * just outside the arrival radius — forever.
 *
 * Taper with a throttle floor (v2): the floor gets the car moving, and then
 * carries it straight past the target at speed, so it orbits the room it was
 * trying to park at, over and over.
 *
 * Asking for a SPEED instead has neither failure. Far away it asks for a lot
 * and gets full throttle; close in it asks for walking pace and BRAKES if the
 * car is going faster than that; and the floor is on the requested speed, not
 * on the throttle, so a stopped car always gets enough force to start rolling
 * without a moving one being told to accelerate into its own destination.
 */
/** Requested speed as a multiple of remaining distance, m/s per metre. */
const APPROACH_GAIN = 0.8;
/** Never ask for less than this — below it the car cannot get itself rolling. */
const MIN_APPROACH_SPEED = 2.4;
/** Or more than this: the tour is a tour, not a time trial. */
const MAX_APPROACH_SPEED = 16;
/** How far over the requested speed before the brake comes on. */
const BRAKE_OVERSPEED = 2;

/** Heading error at which the wheels go to full lock. ~36°: tighter and the
 *  car saws left-right down a straight, wider and it arcs past its target. */
const FULL_LOCK_ERROR = Math.PI / 5;

/** Only spend boost on a long, straight run — burning it mid-corner just
 *  understeers wide of the room it was aiming at. */
const BOOST_MIN_DISTANCE = 45;
const BOOST_MAX_ERROR = 0.12;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Signed shortest angle from `from` to `to`, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Bearing from a pose to a point, in the same frame as `Pose.heading`. */
export function bearingTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function distanceTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/**
 * One frame of driving. Proportional steering with a throttle that respects
 * two things a naive "hold W and turn" autopilot doesn't:
 *
 *   - it lifts off when badly misaligned, because a toy car at full throttle
 *     and full lock understeers in a circle far wider than the road;
 *   - it bleeds off inside SLOW_RADIUS, so arriving reads as pulling up
 *     outside a room rather than as slamming into it and bouncing.
 *
 * ponytail: no path planning and no obstacle avoidance. The boulevard is
 * 56m of open slab with the rooms flanking it, so a straight line to the next
 * stop is a legal route from anywhere on the map; if the world ever grows
 * something you can't drive through, this is where an A* would go.
 */
export function driveToward(pose: Pose, target: { x: number; z: number }): AutoAxes {
  const distance = distanceTo(pose, target);
  const error = angleDelta(pose.heading, bearingTo(pose, target));
  // See the module comment: heading increases toward +X, steering right
  // decreases it, so the correction is the negated error.
  const steer = clamp(-error / FULL_LOCK_ERROR, -1, 1);

  if (distance <= ARRIVE_RADIUS) {
    // Parked. Brake only while there is still speed to shed — holding the
    // brake against a stationary car does nothing but pin the HUD's meter.
    return { steer: 0, throttle: 0, brake: pose.speed > 0.5, boost: false };
  }

  // 1 when pointed straight at the target, 0 at 90° off or worse. Scales the
  // requested speed rather than the throttle: a car that is badly misaligned
  // should want to be going SLOWER (so it can turn inside its own radius),
  // not pushing the same speed with less pedal.
  const alignment = 1 - Math.min(1, Math.abs(error) / (Math.PI / 2));
  const wanted =
    clamp(distance * APPROACH_GAIN, MIN_APPROACH_SPEED, MAX_APPROACH_SPEED) * (0.45 + 0.55 * alignment);
  const shortfall = wanted - pose.speed;

  return {
    steer,
    // A third of a metre per second of shortfall is already worth some pedal;
    // 3 m/s down is worth all of it.
    throttle: shortfall > 0 ? clamp(shortfall / 3, 0.25, 1) : 0,
    brake: pose.speed > wanted + BRAKE_OVERSPEED,
    boost: distance > BOOST_MIN_DISTANCE && Math.abs(error) < BOOST_MAX_ERROR,
  };
}

/**
 * Has the tour got where it was going?
 *
 * `stalledMs` is how long the craft has been both near the target and barely
 * moving — the caller accumulates it, because it is the only part of this
 * that needs a clock. See STALL_MS above for why the second rule exists.
 */
export function hasArrived(pose: Pose, target: { x: number; z: number }, stalledMs: number): boolean {
  const distance = distanceTo(pose, target);
  return distance <= ARRIVE_RADIUS || (distance <= STALL_RADIUS && stalledMs >= STALL_MS);
}

/** Whether this frame counts toward the stall timer above. */
export function isStalling(pose: Pose, target: { x: number; z: number }): boolean {
  return distanceTo(pose, target) <= STALL_RADIUS && Math.abs(pose.speed) < STALL_SPEED;
}

/**
 * Wedged against something, nowhere near where it was going.
 *
 * Distinct from stalling, which is "stopped AT the target" and means arrived.
 * This is "stopped, still 20m out" and means the straight line ran into a
 * building — the price of having no path planner. Measured: the tour drove
 * into a project tower on the way to the Blueprint Room, sat there with the
 * throttle down, and after three seconds Craft.tsx's beached-recovery
 * teleported it back to spawn. Self-healing, but a car that vanishes and
 * reappears 26m away reads as the world breaking, which is the exact
 * impression this whole rework exists to remove.
 */
export const BLOCKED_MS = 700;
export const BLOCKED_SPEED = 0.7;
/** How long to back out for once blocked. Long enough to actually clear a
 *  wall, short enough that a false positive costs a second. */
export const REVERSE_MS = 900;

export function isBlocked(pose: Pose, target: { x: number; z: number }): boolean {
  return distanceTo(pose, target) > STALL_RADIUS && Math.abs(pose.speed) < BLOCKED_SPEED;
}

/**
 * Back out and line up again.
 *
 * The steer sign is the FORWARD one un-negated, which is not a typo: reversing
 * swings the nose the opposite way for the same wheel angle, so this is what
 * points the car back at its target as it retreats, rather than jack-knifing
 * further into whatever it hit.
 */
export function reverseOut(pose: Pose, target: { x: number; z: number }): AutoAxes {
  const error = angleDelta(pose.heading, bearingTo(pose, target));
  return { steer: clamp(error / FULL_LOCK_ERROR, -1, 1), throttle: -0.7, brake: false, boost: false };
}

/**
 * Where to go next.
 *
 * Nearest unvisited stop while any remain, so the tour naturally works its way
 * down the boulevard rather than criss-crossing it. Once every stop has been
 * seen it switches to the FURTHEST one — the nearest is the one the craft is
 * currently parked on, and a tour that re-selects its own parking space is a
 * tour that has stopped.
 */
export function nextStop(stops: readonly Stop[], visited: ReadonlySet<string>, pose: Pose): Stop | null {
  const pending = stops.filter((s) => !visited.has(s.to));
  const pool = pending.length > 0 ? pending : stops;
  if (pool.length === 0) return null;
  const wantNearest = pending.length > 0;
  let best = pool[0];
  let bestDistance = distanceTo(pose, best);
  for (const stop of pool.slice(1)) {
    const d = distanceTo(pose, stop);
    if (wantNearest ? d < bestDistance : d > bestDistance) {
      best = stop;
      bestDistance = d;
    }
  }
  return best;
}
