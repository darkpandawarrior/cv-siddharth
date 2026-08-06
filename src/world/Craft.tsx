import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, useRapier, useBeforePhysicsStep, CuboidCollider } from "@react-three/rapier";
import type { RapierRigidBody, RapierContext } from "@react-three/rapier";
import * as THREE from "three";
import {
  nextMode,
  buoyancyForce,
  liftForce,
  SEA_LEVEL,
  CHASSIS_MASS,
  HULL_THRUST,
  HULL_LINEAR_DAMPING,
  WORLD_BOUNDS,
  SPAWN_POSITION,
  type CraftMode,
  type MediumProbe,
} from "./craftPhysics.ts";
import { input, isCaptured, isInteractiveTarget } from "./input.ts";
import { TERRAIN, THERMALS } from "./worldData.ts";
import { telemetry } from "./telemetry.ts";

/**
 * The one craft. A single dynamic rigid body driven three different ways —
 * `DynamicRayCastVehicleController` on land, direct forces (buoyancy/thrust)
 * afloat, direct forces (lift/torque) aloft — chosen every frame by
 * craftPhysics.ts's pure `nextMode`. This file owns none of that decision
 * logic, only "how do I turn a MediumProbe/mode into a force this frame" and
 * "how does this thing look and feel to drive."
 *
 * Ordering is the one subtle thing here. `useBeforePhysicsStep` is R3R's
 * hook for exactly this shape of problem: the vehicle controller's
 * `updateVehicle()` has to run *before* `world.step()` (it's what supplies
 * this tick's wheel raycasts and sets the chassis velocity that the step
 * then integrates), and any buoyancy/lift/thermal force has to be queued
 * before that same step to be felt this tick. Reading the result back out
 * (for the chase camera, the wheel visuals, `props.onState`) happens in a
 * plain `useFrame` below — which runs after Physics's own step because
 * Physics mounts its frame-stepper ahead of `children` in its own tree, so
 * by React's bottom-up effect order that stepper subscribes to R3F's frame
 * loop before this component's plain `useFrame` does. No manual priority
 * needed; it falls out of where <Physics> puts its own step relative to us.
 */

// Chassis half-extents (metres) — a toy car, not a real one: ~1.1m wide,
// 0.6m tall, 1.9m long. Matches the desk-scale primitives rule the rest of
// the world's geometry follows (worldData.ts's PLACEMENTS/CHECKPOINTS).
const HALF = { x: 0.55, y: 0.3, z: 0.95 };

// CHASSIS_MASS, HULL_THRUST, HULL_LINEAR_DAMPING and WORLD_BOUNDS live in
// craftPhysics.ts, imported above — see the block comment there for why these
// four in particular could not stay private to a component file.

// Wheel layout, in the chassis's local frame. Front pair steers, rear pair
// drives — a conventional RWD toy car. TRACK_X sits slightly outside the
// chassis half-width for a stanced, wheels-poking-out toy-car silhouette.
const TRACK_X = 0.62;
const AXLE_FRONT_Z = 0.82;
const AXLE_REAR_Z = -0.82;
const WHEEL_RADIUS = 0.3;
const WHEEL_Y = -HALF.y; // suspension hardpoint at the chassis's belly
const SUSPENSION_REST = 0.32;

type WheelDef = { x: number; z: number; steer: boolean; drive: boolean };
const WHEELS: WheelDef[] = [
  { x: -TRACK_X, z: AXLE_FRONT_Z, steer: true, drive: false }, // 0 front-left
  { x: TRACK_X, z: AXLE_FRONT_Z, steer: true, drive: false }, // 1 front-right
  { x: -TRACK_X, z: AXLE_REAR_Z, steer: false, drive: true }, // 2 rear-left
  { x: TRACK_X, z: AXLE_REAR_Z, steer: false, drive: true }, // 3 rear-right
];

// @react-three/rapier vendors its own nested copy of @dimforge/rapier3d-compat
// (a different version than whatever else in the tree pulls the un-nested
// one), so a top-level `import type { DynamicRayCastVehicleController } from
// "@dimforge/rapier3d-compat"` resolves to a structurally different — and
// TS-incompatible — class than the one `world.createVehicleController()`
// actually returns. Deriving the type from useRapier()'s own return type
// sidesteps the version split entirely.
type VehicleController = ReturnType<RapierContext["world"]["createVehicleController"]>;

// Driving feel. These are arcade constants tuned by feel against
// CHASSIS_MASS, not a simulation fit — ponytail: if the car feels sluggish
// or twitchy once it's actually drivable in the browser, these five numbers
// are the knob, not the vehicle-controller wiring below them.
//
// FINDING 3: ENGINE_FORCE and BASE_LINEAR_DAMPING together set the wheels'
// top speed — 2*ENGINE_FORCE/(CHASSIS_MASS*BASE_LINEAR_DAMPING) ≈ 23.4 m/s —
// which is the other half of craftPhysics.ts's reconciled flight envelope
// (that file's liftForce comment has the full numbers): comfortably above
// both LAUNCH_SPEED (14) and the level-flight speed (18) that envelope is
// built around, so a driver who builds real speed before the ramp launches
// into a genuine climb, not a token one. Change either number here and
// re-check that comment.
const MAX_STEER_RAD = 0.6; // ~34°, generous for a snappy toy-car turn radius
const ENGINE_FORCE = 900; // N per rear wheel, full throttle
const BRAKE_FORCE = 40;
const BASE_LINEAR_DAMPING = 0.35; // caps top speed so ENGINE_FORCE reaches an equilibrium instead of climbing forever
// N·m of yaw. Steering afloat has to be its own force: `input.steer` otherwise
// only feeds vehicle.setWheelSteering, and the wheels are touching nothing
// while the craft floats, so heading was frozen at whatever it happened to be
// on splashdown. You could sail, but only in a straight line.
const HULL_YAW_TORQUE = 900;

/**
 * Boost — hold Shift for a burst of extra drive, on a tank that refills when
 * you're off it.
 *
 * It exists for a specific reason rather than as a generic "make it faster"
 * knob: the ramp launch needs LAUNCH_SPEED (14 m/s) and the mainland gives
 * about 26m of run-up, which reaches it but leaves no margin for a bad line.
 * Boost turns "did I clear the ramp" from a coin flip into something a driver
 * can influence, which is the difference between a course that feels fair and
 * one that feels arbitrary.
 */
const BOOST_MULTIPLIER = 2.1;
const BOOST_DRAIN_PER_S = 0.5; // full tank = 2s of boost
const BOOST_RECHARGE_PER_S = 0.22; // ~4.5s from empty to full

// Sign conventions for steering, pitch and roll below (which input axis
// turns which way) are a first pass, not a measured fact — flip the minus
// signs here if a playtest says the car turns the wrong way.
/**
 * The craft's forward direction in its OWN frame, and it is -Z, not +Z.
 *
 * Rapier derives each wheel's forward from cross(axle, suspensionDirection) —
 * here cross((1,0,0), (0,-1,0)) = (0,0,-1). Everything the vehicle controller
 * does is built on that: engine force, wheel friction, and the sign of
 * currentVehicleSpeed(). The rest of this world assumes +Z is forward
 * (worldData.ts's coordinate scheme; the whole course lies south of spawn), so
 * the two have to be reconciled somewhere.
 *
 * They are reconciled HERE, by naming the craft's local forward and turning the
 * craft around at spawn (SPAWN_ROTATION below) — not by flipping the axle and
 * not by negating the engine force. Both of those were tried and both make the
 * craft drive against its own wheel frame: it rolled onto its roof within a
 * couple of seconds and sat in a respawn loop. The wheel geometry is fine; only
 * the craft's heading and the sign of "how fast is it going forward" needed to
 * agree with the world.
 */
const LOCAL_FORWARD_Z = -1;

// Yawed 180° so the craft's local -Z (its true forward, above) points along
// world +Z — down the mainland toward the shore, the ramp and the whole course.
// Without this a visitor holding the throttle drives away from every part of
// the world and parks against the north kerb.
const SPAWN_ROTATION: [number, number, number] = [0, Math.PI, 0];

const STEER_SIGN = -1;
const WING_PITCH_TORQUE = 220;
const WING_ROLL_TORQUE = 260;

// Chase camera. Distance grows with speed (a cheap sense of speed with zero
// extra state), and the follow uses a per-frame lerp rather than a spring —
// boring, stable, good enough for a chase cam that's never the star.
const CAMERA_BASE_DISTANCE = 5.5;
const CAMERA_SPEED_PULLBACK = 0.16;
const CAMERA_HEIGHT = 2.6;
const CAMERA_LOOK_HEIGHT = 0.6;
const CAMERA_FOLLOW_SPEED = 4;
const CAMERA_BASE_FOV = 55; // matches World.tsx's <Canvas camera={{ fov }}>
const CAMERA_FOV_SPREAD = 14; // extra degrees at full speed

// FINDING 5b fix: the old spawn, [0, 1.5, -16], sat 2m from the mainland's
// sheer north cliff (the slab spans z in [-18, 12] — see Terrain.tsx's
// exported TERRAIN.mainland) with nothing but a driver's reflexes between a held S and a fall.
// Centring it on the mainland's own footprint (x=0, z=-4 — the slab's z
// midpoint) instead gives 14m of clearance to that cliff and 21m to the east/
// west ones, while staying an easy drive from every land room and the ramp.
// Also doubles as the pose `respawnCraft` below resets to, so "where the
// craft starts" and "where a stuck craft recovers to" can never drift apart.
/**
 * Under the mainland slab, inside its footprint — a state the ordinary
 * recovery checks are all blind to. The craft isn't flipped (it's upright),
 * isn't out of bounds (it's over the middle of the map), and its wheels
 * raycast downward into open water so they never touch anything. Buoyancy
 * then pins it against the slab's underside, stationary and unrecoverable
 * except by pressing R — which a first-time visitor has no reason to know.
 *
 * This was the actual state the world booted into: the spawn at y=1.5 sat
 * only 0.23m above the craft's own suspension resting height, so it
 * penetrated the ground on the first physics step and dropped through. Every
 * automated gate passed with the craft parked under the map. The spawn is
 * fixed below, and this guard means any *other* route under the terrain
 * recovers too rather than needing the same lesson learned again.
 */
function isUnderTheMap(x: number, y: number, z: number): boolean {
  const { halfWidth, z0, z1, groundY } = TERRAIN.mainland;
  const slabBottom = groundY - 1; // the slab is 1 unit thick, top face at groundY
  return y < slabBottom && Math.abs(x) <= halfWidth && z >= z0 && z <= z1;
}

// SPAWN_POSITION lives in craftPhysics.ts so worldGeometry.test.ts can assert
// it clears the craft's own resting height — see that file.

// FINDING 5b fix, the other half: nothing previously stopped a craft from
// drifting arbitrarily far in x/z (buoyancyForce only reads Y-depth, so a
// craft that fell off the mainland's north cliff, once outside Water.tsx's
// mesh, would settle at y≈0 and "float" over nothing visible; the mesh and the
// bounds box now enclose each other, and worldGeometry.test.ts asserts it) or falling forever past every legitimate floor. Bounds are
// sized generously past the actual playable geometry (mainland x∈[-21,21]
// z∈[-18,12]; atolls at x=±14 z≈48; sky islands at x=±14 z≈62) so nothing
// legitimate — a wide glide arc, a hull sailing near open water's edge — ever
// trips it, while still staying inside the drawn sea, while anything that actually left the map does within a few
// metres/seconds.

// FINDING 5a: `wheelIsInContact` never fires while the chassis is upside
// down (the wheel rays point straight up through the car), so a flipped
// craft can't be diagnosed the way "grounded" normally would — it's read
// from orientation and speed instead. FLIP_UP_Y is how far the chassis's own
// up-axis has to tip past horizontal (a value of -1 is fully inverted, 0 is
// on its side) before this counts as "flipped" rather than "cornering hard";
// FLIP_SPEED_THRESHOLD keeps a fast barrel-roll mid-flight from tripping the
// timer — only a flipped craft that's also stopped making progress is
// "stuck," not just upside down for an instant. FLIP_RESPAWN_MS is the
// "short interval" Finding 5a asks for before auto-recovery kicks in.
const FLIP_UP_Y = -0.3;
const FLIP_SPEED_THRESHOLD = 2; // m/s
const FLIP_RESPAWN_MS = 1500;

/**
 * Teleports the chassis back to a known-safe pose and zeroes everything that
 * could carry a bad state across the reset — velocity (so a fast, out-of-
 * control tumble doesn't resume the instant it reappears) and the force/
 * torque accumulators (so whatever this frame had already queued before the
 * respawn was decided doesn't get applied to the fresh pose). Doesn't touch
 * triathlon run state on purpose — a crash mid-course should cost the driver
 * time, not their progress through checkpoints already passed; that's
 * World.tsx's concern, not this module's.
 */
function respawnCraft(chassis: RapierRigidBody): void {
  chassis.setTranslation({ x: SPAWN_POSITION[0], y: SPAWN_POSITION[1], z: SPAWN_POSITION[2] }, true);
  // Yaw 180° as a quaternion — the same heading as SPAWN_ROTATION. Resetting to
  // identity would leave a recovered craft facing away from the entire course.
  chassis.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
  chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
  chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  chassis.resetForces(true);
  chassis.resetTorques(true);
}

export function Craft(props: { onState: (s: { mode: CraftMode; position: [number, number, number] }) => void }) {
  const { world } = useRapier();
  const { camera } = useThree();
  const chassisRef = useRef<RapierRigidBody>(null);
  const vehicleRef = useRef<VehicleController | null>(null);
  const modeRef = useRef<CraftMode>("wheels");
  const airborneMsRef = useRef(0);
  // Boost charge, 0..1, and whether it is being spent this step. Refs, not
  // state: they change every frame and only the HUD (via telemetry) reads them.
  const boostRef = useRef(1);
  const boostingRef = useRef(false);
  // FINDING 5a: how long (ms) the chassis has been continuously flipped AND
  // roughly stationary — see FLIP_UP_Y/FLIP_SPEED_THRESHOLD above for what
  // "flipped" means here. Reset to 0 the instant either condition lapses, so
  // only a *sustained* stuck-upside-down state ever reaches FLIP_RESPAWN_MS.
  const flippedMsRef = useRef(0);
  // Set by the "R" keydown handler below, consumed (and cleared) on the next
  // physics step — a ref rather than state because useBeforePhysicsStep reads
  // it synchronously inside the physics loop, not through React's render
  // cycle.
  const respawnRequestedRef = useRef(false);

  const wheelYawRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const wheelSpinRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);

  // Scratch objects reused every frame — useFrame runs at 60Hz+, allocating
  // a Vector3/Quaternion per field per frame is the kind of GC pressure that
  // shows up as jank on exactly the low-end laptops this route has to keep
  // working on. `state` is Finding 13's fix: the payload handed to
  // `props.onState` every frame, mutated in place instead of a fresh
  // `{ mode, position }` object (and a fresh position array inside it)
  // allocated per frame.
  const scratch = useMemo(
    () => ({
      quat: new THREE.Quaternion(),
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      torque: new THREE.Vector3(),
      camTarget: new THREE.Vector3(),
      lookTarget: new THREE.Vector3(),
      state: { mode: "wheels" as CraftMode, position: [0, 0, 0] as [number, number, number] },
    }),
    [],
  );

  // FINDING 5a's explicit manual recovery: press R to respawn regardless of
  // orientation or how long it's been stuck — the auto-recovery timer below
  // covers the common case, but a driver shouldn't have to wait out a timer
  // (or be flipped at all — wedged against scenery, say) to ask for a reset.
  // Gated on isCaptured() AND input.ts's interactive-target filter. The
  // comment here used to claim capture alone was sufficient, "since the same
  // rule that keeps WASD out of text fields governs whether the canvas owns
  // the keyboard". It doesn't: typing in a field never clears `captured`, it
  // only makes input.ts drop that individual event. So typing the letter r
  // into the floating chat respawned the craft mid-drive.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r" || !isCaptured() || isInteractiveTarget(e.target)) return;
      respawnRequestedRef.current = true;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Build the vehicle controller once the chassis body exists, tear it down
  // on unmount. The design doc is explicit that this world must not leak
  // physics resources between room visits — a raycast vehicle controller
  // holds onto the chassis body handle, so an un-removed one would keep it
  // (and everything it references) alive after Craft unmounts.
  useEffect(() => {
    const chassis = chassisRef.current;
    if (!chassis) return;
    const controller = world.createVehicleController(chassis);
    controller.indexUpAxis = 1;
    // Not a typo: rapier3d-compat's codegen names this setter
    // `setIndexForwardAxis` (as a property, not a method) rather than
    // pairing it with the `indexForwardAxis` getter — the getter is
    // read-only. Assigning through the oddly-named setter is the only way
    // in.
    controller.setIndexForwardAxis = 2;
    for (const w of WHEELS) {
      controller.addWheel({ x: w.x, y: WHEEL_Y, z: w.z }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, SUSPENSION_REST, WHEEL_RADIUS);
    }
    for (let i = 0; i < WHEELS.length; i++) {
      controller.setWheelSuspensionStiffness(i, 26);
      controller.setWheelSuspensionCompression(i, 0.3);
      controller.setWheelSuspensionRelaxation(i, 0.55);
      controller.setWheelMaxSuspensionTravel(i, 0.35); // generous travel — landing off the ramp shouldn't bottom out the suspension
      controller.setWheelMaxSuspensionForce(i, 100_000);
      controller.setWheelFrictionSlip(i, 3.2); // grippy on purpose: forgiving, not drifty — a toy car, not a rally sim
      controller.setWheelSideFrictionStiffness(i, 1);
    }
    vehicleRef.current = controller;
    return () => {
      world.removeVehicleController(controller);
      vehicleRef.current = null;
    };
  }, [world]);

  // The impure half of the mode machine: gather this frame's MediumProbe,
  // hand it to craftPhysics's nextMode, and apply whatever force model the
  // result calls for. Runs before world.step() via useBeforePhysicsStep so
  // both the vehicle controller's own velocity write and our addForce calls
  // land in the same physics tick.
  useBeforePhysicsStep((w) => {
    const chassis = chassisRef.current;
    const vehicle = vehicleRef.current;
    if (!chassis || !vehicle) return;
    const dt = w.timestep;

    // FINDING 1 (P0): addForce/addTorque write into a *persistent*
    // accumulator — Rapier only clears it when told to, not automatically
    // after each world.step(). Every force queued below (buoyancy, hull
    // thrust, wing lift, wing torque, thermal lift) would otherwise still be
    // sitting in that accumulator on the *next* call of this callback and
    // get re-applied on top of whatever gets queued then, compounding every
    // step forever — and since <Physics> runs a fixed-timestep accumulator,
    // this callback can fire several times per rendered frame under load,
    // so the blow-up is faster than "grows every frame" alone would suggest
    // (drive into the sea and the chassis carries ~60x the intended buoyancy
    // within a second). Clearing both accumulators here, before anything
    // this step adds to them, is what makes "this frame's force" actually
    // mean this frame's force instead of every-force-ever-queued.
    chassis.resetForces(false);
    chassis.resetTorques(false);

    // FINDINGS 5a/5b: recovery. Read the pose fresh, before the vehicle
    // controller or anything below touches it this step, and decide whether
    // this frame is "teleport back to a safe pose and bail" rather than
    // "drive normally" — flipped-and-stuck, out of bounds, or an explicit R
    // press all resolve the same way, so there's one respawn path instead of
    // three.
    const t0 = chassis.translation();
    const r0 = chassis.rotation();
    scratch.quat.set(r0.x, r0.y, r0.z, r0.w);
    scratch.up.set(0, 1, 0).applyQuaternion(scratch.quat);

    const outOfBounds =
      t0.x < WORLD_BOUNDS.minX ||
      t0.x > WORLD_BOUNDS.maxX ||
      t0.z < WORLD_BOUNDS.minZ ||
      t0.z > WORLD_BOUNDS.maxZ ||
      t0.y < WORLD_BOUNDS.minY ||
      isUnderTheMap(t0.x, t0.y, t0.z);

    // wheelIsInContact() (below) never reports true while flipped — the
    // wheel rays point up through the chassis — so "is this thing stuck
    // upside down" is read from orientation and last frame's vehicle speed
    // instead of grounded-ness. One frame of staleness on a 1.5s timer is
    // nothing.
    const flippedNow = scratch.up.y < FLIP_UP_Y && Math.abs(vehicle.currentVehicleSpeed()) < FLIP_SPEED_THRESHOLD;
    flippedMsRef.current = flippedNow ? flippedMsRef.current + dt * 1000 : 0;

    const manualRespawn = respawnRequestedRef.current;
    respawnRequestedRef.current = false;

    if (outOfBounds || flippedMsRef.current > FLIP_RESPAWN_MS || manualRespawn) {
      respawnCraft(chassis);
      modeRef.current = "wheels";
      airborneMsRef.current = 0;
      flippedMsRef.current = 0;
      return; // next step runs the vehicle controller fresh against the new pose
    }

    const mode = modeRef.current;

    // Wheel controls reflect *last* frame's mode decision — updateVehicle()
    // below needs them set before it runs, but this frame's mode isn't known
    // until after it runs (grounded-ness comes from its raycasts). One
    // frame of lag on a mode transition is imperceptible at 60fps; using
    // last frame's mode here rather than rederiving it is what keeps this a
    // single pass instead of stepping the vehicle twice.
    const steerAngle = STEER_SIGN * input.steer * MAX_STEER_RAD;
    vehicle.setWheelSteering(0, steerAngle);
    vehicle.setWheelSteering(1, steerAngle);
    // Boost only spends while it is actually doing something: held, with
    // charge left, throttle down, and on the wheels. Draining it mid-air or
    // mid-ocean would burn the tank on a press that changed nothing.
    const wantsBoost = input.boost && boostRef.current > 0 && input.throttle > 0 && mode === "wheels";
    boostRef.current = Math.max(
      0,
      Math.min(1, boostRef.current + (wantsBoost ? -BOOST_DRAIN_PER_S : BOOST_RECHARGE_PER_S) * dt),
    );
    boostingRef.current = wantsBoost;
    const engineForce =
      mode === "wheels" ? input.throttle * ENGINE_FORCE * (wantsBoost ? BOOST_MULTIPLIER : 1) : 0;
    vehicle.setWheelEngineForce(2, engineForce);
    vehicle.setWheelEngineForce(3, engineForce);
    const brake = input.brake ? BRAKE_FORCE : 0;
    for (let i = 0; i < 4; i++) vehicle.setWheelBrake(i, brake);

    vehicle.updateVehicle(dt);

    let grounded = false;
    for (let i = 0; i < 4; i++) if (vehicle.wheelIsInContact(i)) grounded = true;
    const t = chassis.translation();
    const submergedDepth = Math.max(0, SEA_LEVEL - t.y);
    airborneMsRef.current = grounded || submergedDepth > 0 ? 0 : airborneMsRef.current + dt * 1000;
    const probe: MediumProbe = {
      grounded,
      submergedDepth,
      airborneMs: airborneMsRef.current,
      speed: -vehicle.currentVehicleSpeed(),
    };

    const newMode = nextMode(mode, probe);
    modeRef.current = newMode;

    const r = chassis.rotation();
    scratch.quat.set(r.x, r.y, r.z, r.w);
    scratch.forward.set(0, 0, LOCAL_FORWARD_Z).applyQuaternion(scratch.quat);
    scratch.right.set(1, 0, 0).applyQuaternion(scratch.quat);
    scratch.up.set(0, 1, 0).applyQuaternion(scratch.quat);

    if (newMode === "hull") {
      chassis.setLinearDamping(HULL_LINEAR_DAMPING);
      const buoy = buoyancyForce(probe.submergedDepth);
      chassis.addForce({ x: 0, y: buoy, z: 0 }, true);
      const thrust = input.throttle * HULL_THRUST;
      chassis.addForce({ x: scratch.forward.x * thrust, y: 0, z: scratch.forward.z * thrust }, true);
      // Yaw about world +Y rather than the craft's local up: a boat wallowing
      // in swell shouldn't have its steering authority fall off as it rolls.
      chassis.addTorque({ x: 0, y: -input.steer * HULL_YAW_TORQUE, z: 0 }, true);
    } else if (newMode === "wings") {
      chassis.setLinearDamping(BASE_LINEAR_DAMPING);
      const lift = liftForce(probe.speed);
      chassis.addForce({ x: scratch.up.x * lift, y: scratch.up.y * lift, z: scratch.up.z * lift }, true);
      // Pitch/roll only — no yaw, no throttle thrust. The design doc is
      // explicit that sustained flight comes from thermals, not a throttle:
      // a wing with thrust would let a visitor just power to every sky
      // island, skipping the "catch a thermal" beat the triathlon is built
      // around.
      scratch.torque
        .copy(scratch.right)
        .multiplyScalar(input.pitch * WING_PITCH_TORQUE)
        .addScaledVector(scratch.forward, -input.steer * WING_ROLL_TORQUE);
      chassis.addTorque({ x: scratch.torque.x, y: scratch.torque.y, z: scratch.torque.z }, true);
    } else {
      chassis.setLinearDamping(BASE_LINEAR_DAMPING);
    }

    // Thermals: an upward force scaled by the craft's own mass, so
    // THERMALS's `strength` (worldData.ts) reads directly as an upward
    // acceleration in m/s^2 rather than an opaque force number — a
    // strength of 14 nets a steady ~4.2 m/s^2 climb once gravity (9.81) is
    // subtracted out, independent of whatever CHASSIS_MASS ends up tuned to.
    //
    // FINDING 2 fix: this used to be horizontal-only with no Y bound and no
    // grounded check, so a column meant to cover a ~9m atoll or sky island
    // (worldData.ts's old radius of 7) applied at ANY altitude, including to
    // a craft just parked on dry land — permanently shoving it skyward the
    // instant it drove near one. `grounded` (already computed above) skips
    // the force entirely for a craft with its wheels planted, and
    // `thermal.ceilingY` (worldData.ts — see its comment for the derivation
    // and the calculation confirming a craft can still ride this to the
    // slab) stops it short of the sky island the column feeds, so the craft
    // coasts the last bit under its own momentum instead of being pushed
    // through — or pinned against — the slab's underside.
    for (const thermal of THERMALS) {
      if (grounded || t.y >= thermal.ceilingY) continue;
      const dx = t.x - thermal.position[0];
      const dz = t.z - thermal.position[2];
      if (Math.hypot(dx, dz) <= thermal.radius) {
        chassis.addForce({ x: 0, y: thermal.strength * chassis.mass(), z: 0 }, true);
      }
    }
  });

  // Read the (now post-step) transform: drive the chase camera, the wheel
  // visuals, and tell World.tsx what happened this frame.
  useFrame((_, delta) => {
    const chassis = chassisRef.current;
    const vehicle = vehicleRef.current;
    if (!chassis) return;
    const t = chassis.translation();
    const r = chassis.rotation();
    scratch.quat.set(r.x, r.y, r.z, r.w);
    scratch.forward.set(0, 0, LOCAL_FORWARD_Z).applyQuaternion(scratch.quat);

    const linvel = chassis.linvel();
    const speed = Math.hypot(linvel.x, linvel.y, linvel.z);
    const distance = CAMERA_BASE_DISTANCE + speed * CAMERA_SPEED_PULLBACK;
    scratch.camTarget.set(t.x, t.y, t.z).addScaledVector(scratch.forward, -distance);
    scratch.camTarget.y += CAMERA_HEIGHT;
    camera.position.lerp(scratch.camTarget, Math.min(1, delta * CAMERA_FOLLOW_SPEED));
    scratch.lookTarget.set(t.x, t.y + CAMERA_LOOK_HEIGHT, t.z);
    camera.lookAt(scratch.lookTarget);

    // Field of view widens with speed, and further again on boost. This is the
    // cheapest possible sense of speed — no particles, no motion blur, no extra
    // draw calls — and without something like it a toy car at 23 m/s on an open
    // plane feels identical to the same car at 6 m/s, because there is nothing
    // close enough to the camera for parallax to register against.
    if ("fov" in camera) {
      const perspective = camera as THREE.PerspectiveCamera;
      const target = CAMERA_BASE_FOV + Math.min(1, speed / 24) * CAMERA_FOV_SPREAD + (boostingRef.current ? 6 : 0);
      const next = perspective.fov + (target - perspective.fov) * Math.min(1, delta * 4);
      if (Math.abs(next - perspective.fov) > 0.01) {
        perspective.fov = next;
        perspective.updateProjectionMatrix();
      }
    }

    if (vehicle) {
      for (let i = 0; i < WHEELS.length; i++) {
        const yaw = wheelYawRefs.current[i];
        const spin = wheelSpinRefs.current[i];
        if (!yaw || !spin) continue;
        const suspension = vehicle.wheelSuspensionLength(i) ?? SUSPENSION_REST;
        yaw.position.set(WHEELS[i].x, WHEEL_Y - suspension, WHEELS[i].z);
        yaw.rotation.y = vehicle.wheelSteering(i) ?? 0;
        spin.rotation.x = vehicle.wheelRotation(i) ?? 0;
      }
    }

    // FINDING 13 fix: this used to allocate a fresh `{ mode, position }`
    // object — and a fresh position array inside it — every frame, against
    // this same file's own scratch-object rationale a few lines up.
    // `scratch.state` is mutated in place and handed out by reference
    // instead.
    scratch.state.mode = modeRef.current;
    scratch.state.position[0] = t.x;
    scratch.state.position[1] = t.y;
    scratch.state.position[2] = t.z;
    // Publish to the telemetry singleton for the HUD's compass, speed readout
    // and boost meter. Written in place every frame; the HUD reads it from its
    // own rAF loop rather than taking it through React state — see telemetry.ts.
    telemetry.x = t.x;
    telemetry.y = t.y;
    telemetry.z = t.z;
    // Yaw of the craft's own forward axis (local -Z, see LOCAL_FORWARD_Z),
    // measured so 0 points along world +Z. atan2(x, z) rather than the usual
    // (z, x) because the compass wants bearing-from-+Z, not maths-convention
    // angle-from-+X.
    scratch.forward.set(0, 0, LOCAL_FORWARD_Z).applyQuaternion(scratch.quat);
    telemetry.heading = Math.atan2(scratch.forward.x, scratch.forward.z);
    telemetry.speed = vehicle ? -vehicle.currentVehicleSpeed() : 0;
    telemetry.mode = modeRef.current;
    telemetry.boost = boostRef.current;
    telemetry.boosting = boostingRef.current;

    props.onState(scratch.state);
  });

  return (
    <RigidBody
      ref={chassisRef}
      type="dynamic"
      colliders={false}
      canSleep={false}
      ccd
      angularDamping={0.7}
      linearDamping={BASE_LINEAR_DAMPING}
      position={SPAWN_POSITION}
      rotation={SPAWN_ROTATION}
    >
      <CuboidCollider args={[HALF.x, HALF.y, HALF.z]} mass={CHASSIS_MASS} friction={0.4} />

      {/* Body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[HALF.x * 2, HALF.y * 2, HALF.z * 2]} />
        <meshStandardMaterial color="#3ddc84" metalness={0.2} roughness={0.5} />
      </mesh>

      {/* Cabin */}
      <mesh castShadow position={[0, HALF.y + 0.16, -0.1]}>
        <boxGeometry args={[0.68, 0.32, 0.9]} />
        <meshStandardMaterial color="#0b0f0d" metalness={0.4} roughness={0.3} />
      </mesh>

      {/* Wheels — a steering group (position + yaw) nesting a spin group
          (roll about local X), so the two rotations never fight over the
          same Euler triple. The mesh itself carries only the constant tilt
          that points a Y-axis cylinder along the wheel's real spin axis. */}
      {WHEELS.map((w, i) => (
        <group
          key={i}
          ref={(g) => {
            wheelYawRefs.current[i] = g;
          }}
          position={[w.x, WHEEL_Y, w.z]}
        >
          <group
            ref={(g) => {
              wheelSpinRefs.current[i] = g;
            }}
          >
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.26, 14]} />
              <meshStandardMaterial color="#161616" roughness={0.7} />
            </mesh>
          </group>
        </group>
      ))}
    </RigidBody>
  );
}
