/**
 * THE VEHICLE, AS A PURE FUNCTION.
 *
 * `step(state, input, dt, env) -> state`. No Rapier, no rigid bodies, no
 * solver. This replaced `DynamicRayCastVehicleController` for one reason that
 * no amount of tuning could fix: a 220kg dynamic chassis meeting a tall static
 * collider at 19 m/s resolves its penetration explosively, and the car gets
 * thrown across the map. That is a property of impulse-based depenetration,
 * not a badly-chosen constant.
 *
 * Here a wall cannot launch anything, by construction: collisions resolve by
 * projecting the position out and REMOVING the velocity component that pointed
 * into the surface. Speed after a contact is always <= speed before it. There
 * is no code path that adds energy on contact, so there is no tuning to get
 * wrong.
 *
 * Everything is deterministic and framerate-independent, which is what makes
 * the tests meaningful. This world has a documented history of passing its
 * gates three times while being unplayable, because the gates asserted values
 * that a sibling copy of the same values agreed with. So drive.test.ts asserts
 * RELATIONSHIPS — "a head-on hit never increases speed", "no frame moves the
 * car further than maxSpeed*dt", "the car never finishes inside a wall" —
 * properties that are false the moment the model misbehaves, whatever the
 * numbers happen to be.
 */

/** An axis-aligned footprint in the XZ plane. Every solid thing in the world
 *  is one of these; the renderer and this list are fed from one registry so
 *  they cannot drift apart. */
export interface Obstacle {
  x: number;
  z: number;
  /** Half-extents. */
  rx: number;
  rz: number;
  id?: string;
}

export interface DriveState {
  x: number;
  z: number;
  /** Ground height under the car, resolved from the heightfield. */
  y: number;
  /** Radians. 0 faces +Z, matching the world's forward convention. */
  heading: number;
  /** Metres per second along `heading`. Negative is reverse. */
  speed: number;
}

export interface DriveInput {
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** -1 (brake/reverse) .. 1 (throttle) */
  throttle: number;
  boost: boolean;
}

export interface DriveEnv {
  obstacles: readonly Obstacle[];
  heightAt: (x: number, z: number) => number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/* Arcade constants. Tuned by feel, not fitted to a simulation. */
export const MAX_SPEED = 20;          // m/s — an 8.4s run down the 168m corridor
export const MAX_REVERSE = 7;
const ACCEL = 13;                     // m/s^2 at full throttle
const BRAKE = 26;                     // m/s^2 when throttle opposes travel
const DRAG = 0.9;                     // per second, proportional to speed
const ROLLING = 1.6;                  // m/s^2 constant, so the car actually stops
const STEER_RATE = 2.0;               // rad/s at full lock
/** +1 steer means "right", and right is -X, so heading must go down. See the
 *  block comment at the use site — this is the sign the whole world agrees on. */
const STEER_SIGN = -1;
const BOOST_MULTIPLIER = 1.7;
/** Uphill bleeds speed, downhill returns it. This is what makes the terrain
 *  legible through the wheels rather than only through the eyes. */
const SLOPE_PULL = 9;
/** Car footprint radius in XZ. */
export const CAR_RADIUS = 1.0;
/** Never integrate a frame longer than this. A backgrounded tab hands back a
 *  multi-second dt, which at 20 m/s would teleport the car through a wall. */
export const MAX_DT = 1 / 30;
/** Cap on substep travel, so a fast car cannot tunnel a thin obstacle. */
const MAX_STEP_DISTANCE = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Push the car out of any obstacle it overlaps and strip the velocity that
 * pointed into the surface.
 *
 * Returns the corrected position plus a `hit` normal so the caller can convert
 * the removed velocity into a slide rather than a stop. Resolved over a few
 * passes because pushing out of one obstacle can push into its neighbour —
 * two towers standing shoulder to shoulder is a real arrangement here.
 */
function resolveCollisions(
  x: number,
  z: number,
  obstacles: readonly Obstacle[],
): { x: number; z: number; nx: number; nz: number; hit: boolean } {
  let px = x;
  let pz = z;
  let nx = 0;
  let nz = 0;
  let hit = false;

  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const o of obstacles) {
      const dx = px - o.x;
      const dz = pz - o.z;
      const ox = o.rx + CAR_RADIUS - Math.abs(dx);
      const oz = o.rz + CAR_RADIUS - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      // Eject along the shallower axis — the one the car most recently crossed.
      if (ox < oz) {
        const s = dx === 0 ? 1 : Math.sign(dx);
        px = o.x + s * (o.rx + CAR_RADIUS);
        nx += s;
      } else {
        const s = dz === 0 ? 1 : Math.sign(dz);
        pz = o.z + s * (o.rz + CAR_RADIUS);
        nz += s;
      }
      hit = true;
      moved = true;
    }
    if (!moved) break;
  }

  const len = Math.hypot(nx, nz);
  return { x: px, z: pz, nx: len > 0 ? nx / len : 0, nz: len > 0 ? nz / len : 0, hit };
}

/** One integration substep. `dt` here is already small and already clamped. */
function substep(s: DriveState, input: DriveInput, dt: number, env: DriveEnv): DriveState {
  const steer = clamp(input.steer, -1, 1);
  const throttle = clamp(input.throttle, -1, 1);

  let speed = s.speed;

  // Longitudinal. Throttle that opposes travel is a brake, not reverse thrust,
  // until the car has actually stopped — otherwise tapping back at speed flips
  // the sign and the car lurches.
  const opposing = throttle !== 0 && Math.sign(throttle) !== Math.sign(speed) && Math.abs(speed) > 0.2;
  if (opposing) {
    speed += Math.sign(throttle) * BRAKE * dt;
  } else if (throttle !== 0) {
    const power = ACCEL * (input.boost && throttle > 0 ? BOOST_MULTIPLIER : 1);
    speed += throttle * power * dt;
  }

  // Resistance always opposes motion and can never push the car past zero.
  const resist = (DRAG * Math.abs(speed) + ROLLING) * dt;
  if (Math.abs(speed) <= resist) speed = 0;
  else speed -= Math.sign(speed) * resist;

  // The ground pulls. Driving up a busy month costs speed; coming off it pays
  // the speed back.
  const eps = 0.35;
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const ahead = env.heightAt(s.x + fx * eps, s.z + fz * eps);
  const behind = env.heightAt(s.x - fx * eps, s.z - fz * eps);
  speed -= ((ahead - behind) / (2 * eps)) * SLOPE_PULL * dt;

  speed = clamp(speed, -MAX_REVERSE, MAX_SPEED);

  // Steering authority scales with speed — a parked car cannot pivot, and the
  // sign flips in reverse so backing out of a wall steers the way a driver
  // expects.
  //
  // STEER_SIGN is NOT cosmetic and NOT a taste call. `heading` is
  // atan2(forward.x, forward.z), a bearing from world +Z, and with +Y up the
  // driver's right is world -X (right = forward x up = (-1,0,0)). So steering
  // RIGHT must DECREASE heading. autopilot.ts documents the same convention
  // and carries the matching minus in steerFor(); the old Craft.tsx carried it
  // as a STEER_SIGN constant. This model shipped without it for one commit and
  // the car turned the wrong way — the invariant tests all passed, because
  // none of them asserted a DIRECTION. driveDirection in drive.test.ts does.
  const authority = clamp(Math.abs(speed) / 6, 0, 1);
  const heading = s.heading + STEER_SIGN * steer * STEER_RATE * authority * dt * (speed < 0 ? -1 : 1);

  let x = s.x + Math.sin(heading) * speed * dt;
  let z = s.z + Math.cos(heading) * speed * dt;

  x = clamp(x, env.bounds.minX, env.bounds.maxX);
  z = clamp(z, env.bounds.minZ, env.bounds.maxZ);

  const c = resolveCollisions(x, z, env.obstacles);
  x = c.x;
  z = c.z;

  if (c.hit) {
    // Slide: keep only the component of travel along the surface. `into` is
    // never negated and never scaled up, so |speed| cannot grow on contact —
    // this single line is what makes launch-on-impact unrepresentable.
    const into = Math.sin(heading) * c.nx + Math.cos(heading) * c.nz;
    if (into < 0) speed *= Math.max(0, 1 - Math.abs(into));
  }

  return { x, z, y: env.heightAt(x, z), heading, speed };
}

/**
 * Advance the vehicle. Splits `dt` into substeps short enough that the car
 * cannot cross an obstacle within one, which is what makes the no-tunnelling
 * invariant hold at speed rather than only at the speeds a play session
 * happened to reach.
 */
export function step(s: DriveState, input: DriveInput, dt: number, env: DriveEnv): DriveState {
  const total = clamp(dt, 0, MAX_DT);
  if (total <= 0) return s;
  const travel = Math.abs(s.speed) * total;
  const n = Math.max(1, Math.ceil(travel / MAX_STEP_DISTANCE));
  let out = s;
  for (let i = 0; i < n; i++) out = substep(out, input, total / n, env);
  return out;
}

export function spawnState(x: number, z: number, env: DriveEnv, heading = 0): DriveState {
  return { x, z, y: env.heightAt(x, z), heading, speed: 0 };
}
