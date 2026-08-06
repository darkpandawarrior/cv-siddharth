import { Fragment, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import type { PointLight } from "three";
import { DoubleSide } from "three";
import { Html } from "@react-three/drei";
import { RigidBody, CuboidCollider, interactionGroups } from "@react-three/rapier";
import { PLACEMENTS, WATER_SENSOR_HALF_EXTENTS, type Placement } from "./worldData.ts";
import { ROOMS, type Room } from "../rooms.tsx";
import { usePulseCounts, type PulseEvent } from "../play/pulse.ts";
import { PAVILION_SENSOR_GROUP } from "./collisionGroups.ts";
import { worldPalette } from "./palette.ts";

/**
 * One physical structure per room, built entirely from three.js primitives —
 * no GLTF assets, per the design doc's "desk scale" rule. Each pavilion is a
 * `RigidBody type="fixed"` sitting at its `PLACEMENTS` position, wearing the
 * room's tint (looked up from ROOMS, never hand-duplicated here), with a
 * single sensor `CuboidCollider` as its only collider — there is no solid
 * geometry to bump into, only the approach volume that raises the HUD
 * prompt. That's a deliberate scope cut: the design only asks for a sensor
 * per pavilion, and a second, non-sensor collider (to make these obstacles
 * you can crash into) is easy to add later without touching this shape.
 *
 * CRITICAL: this iterates PLACEMENTS, never a hand-written room list — see
 * worldData.test.ts's registry invariant. Adding a room to profile.ts without
 * a matching PLACEMENTS entry must fail that test, not silently drop a
 * pavilion from the world.
 */

// A sensor volume this size sits low enough (see SENSOR_HALF_EXTENTS below)
// to geometrically overlap the mainland's own ground collider AND any prop
// debris that gets knocked underneath a pavilion — Props.tsx's keycaps,
// pencils etc. are dynamic bodies too, and without this they'd fire the same
// onIntersectionEnter a driven-up craft does, popping a room prompt for a
// stray keycap. Rapier's interaction groups solve this at the physics layer
// instead of teaching this file (or Props.tsx) about each other's object
// identity: this sensor only ever matches colliders that are members of
// group 15 in *their own* membership/filter. An unset `collisionGroups`
// (the default on any collider, including whatever Craft.tsx ends up being —
// that module isn't built by this task) defaults to "member of every group,
// filters every group", so the driven craft satisfies this automatically
// with zero coordination. Props.tsx is the one file that has to opt out,
// by excluding group 15 from its own membership — see PROP_COLLISION_GROUPS
// there. (Static-vs-static pairs, e.g. this sensor vs. Terrain's fixed
// ground, are pruned by Rapier's broadphase before groups are even
// considered, so the ground never needs this treatment.)

const SENSOR_COLLISION_GROUPS = interactionGroups([PAVILION_SENSOR_GROUP], [PAVILION_SENSOR_GROUP]);

// Half-extents (metres) of each shape's sensor volume, keyed off `shape`
// rather than per-room — every pavilion of a given shape reads as roughly
// the same "come this close" distance, which matters more for a consistent
// feel while driving than exactly hugging each shape's silhouette. Sized a
// little larger than the visuals below so the HUD prompt appears on
// approach, not on collision.
const SENSOR_HALF_EXTENTS: Record<Placement["shape"], [number, number, number]> = {
  slab: [2.4, 1.6, 2.4],
  crt: [2.2, 2.4, 2.2],
  board: [2.6, 2.2, 2.6],
  atoll: [3.2, 2.6, 3.2],
  pcb: [2.4, 1.6, 2.4],
};


/**
 * A room's light, breathing.
 *
 * The pulse is slow (a full cycle every ~4s) and shallow (±18%) on purpose: it
 * should register as "this thing is running" the way a sleeping laptop's LED
 * does, not as a flashing beacon. `seed` offsets each room's phase from its own
 * position so the eight of them never sync up into one throb, which is what
 * would make it read as an effect rather than as eight separate live things.
 */
function BreathingLight({
  tint,
  y,
  seed,
  visits,
}: {
  tint: string;
  y: number;
  seed: number;
  /** Real, shared open-count for this room, from the playhtml pulse layer. */
  visits: number;
}) {
  const ref = useRef<PointLight>(null);
  // Well-trodden rooms burn brighter. `visits` is the same live number the
  // card grid prints and /pulse charts — everyone's opens, not this visitor's —
  // so the world literally lights up where people have been going. Logarithmic
  // because these counts are unbounded and a linear map would let one popular
  // room white out the map: 0 visits ~ 18, 10 ~ 30, 100 ~ 42, 1000 ~ 54.
  const base = 18 + Math.log10(1 + Math.max(0, visits)) * 12;
  useFrame((state) => {
    if (ref.current) ref.current.intensity = base + Math.sin(state.clock.elapsedTime * 1.6 + seed) * 4;
  });
  return (
    <pointLight ref={ref} position={[0, y, 0]} color={tint} intensity={base} distance={16 + base / 6} decay={2} />
  );
}

/** Phone lying face-up: a flat body with a raised, tinted "screen" inset. */
function Slab({ tint }: { tint: string }) {
  const c = worldPalette();
  return (
    <group>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.18, 3.4]} />
        <meshStandardMaterial color={c.card} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <boxGeometry args={[1.4, 0.02, 2.9]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Chunky monitor on a pedestal, tinted screen facing +Z (out of the mainland). */
function Crt({ tint }: { tint: string }) {
  const c = worldPalette();
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.7, 0.5, 0.7]} />
        <meshStandardMaterial color={c.card} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.35, 0.4, 0.35]} />
        <meshStandardMaterial color={c.card} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 1.7, 1.7]} />
        <meshStandardMaterial color={c.surface} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.65, 0.87]}>
        <boxGeometry args={[1.7, 1.3, 0.05]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.8} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** A drafting board tilted on two legs, like a table angled up for drawing. */
function Board({ tint }: { tint: string }) {
  const c = worldPalette();
  return (
    <group>
      <mesh position={[-1.1, 0.9, 0.7]} castShadow>
        <boxGeometry args={[0.14, 1.8, 0.14]} />
        <meshStandardMaterial color={c.card} roughness={0.7} />
      </mesh>
      <mesh position={[1.1, 0.9, 0.7]} castShadow>
        <boxGeometry args={[0.14, 1.8, 0.14]} />
        <meshStandardMaterial color={c.card} roughness={0.7} />
      </mesh>
      <group position={[0, 1.55, 0]} rotation={[-0.45, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.12, 2.1]} />
          <meshStandardMaterial color={c.surface} roughness={0.5} />
        </mesh>
        {/* Edge trim in the room's tint reads as a lit border along the top
            edge of the board without needing a second light in the scene. */}
        <mesh position={[0, 0.065, -0.95]}>
          <boxGeometry args={[3.0, 0.02, 0.12]} />
          <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/** Small island platform: a low dock with a lit rim and a flag marker. */
function Atoll({ tint }: { tint: string }) {
  const c = worldPalette();
  return (
    <group>
      <mesh position={[0, 0.2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.6, 2.8, 0.4, 28]} />
        <meshStandardMaterial color={c.card} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.41, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.55, 0.06, 8, 40]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.08, 2.0, 0.08]} />
        <meshStandardMaterial color={c.card} roughness={0.6} />
      </mesh>
      <mesh position={[0.35, 2.15, 0]}>
        <boxGeometry args={[0.7, 0.4, 0.02]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.5} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Circuit slab: a flat board with a handful of raised chips and trace lines. */
function Pcb({ tint }: { tint: string }) {
  const c = worldPalette();
  const chips: [number, number][] = [
    [-1.0, -0.9],
    [0.6, -0.6],
    [-0.4, 0.5],
    [1.1, 1.0],
    [-1.2, 1.1],
  ];
  return (
    <group>
      <mesh position={[0, 0.1, 0]} receiveShadow castShadow>
        <boxGeometry args={[3.2, 0.2, 3.2]} />
        <meshStandardMaterial color={c.surface} roughness={0.6} />
      </mesh>
      {chips.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.27, z]}>
          <boxGeometry args={[0.35, 0.14, 0.35]} />
          <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.21, 0]}>
        <boxGeometry args={[2.6, 0.01, 0.06]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.21, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[2.6, 0.01, 0.06]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

const SHAPES: Record<Placement["shape"], (props: { tint: string }) => JSX.Element> = {
  slab: Slab,
  crt: Crt,
  board: Board,
  atoll: Atoll,
  pcb: Pcb,
};

function Pavilion({ placement, room, onPrompt }: { placement: Placement; room: Room; onPrompt: (to: string | null) => void }) {
  const Shape = SHAPES[placement.shape];
  // The same registry key the card grid uses for its visit counter, so the
  // world and the list are lit by one number rather than two.
  const counts = usePulseCounts();
  const visits = counts[`room:${placement.to.slice(1)}` as PulseEvent] ?? 0;
  // Water rooms get a deliberately oversized sensor, and it is not cosmetic.
  // An atoll (Terrain.tsx) is a cone ~4.5m in radius at the waterline whose
  // flank above the water is ~41 degrees — far too steep for hull mode's
  // thrust to climb, and the craft only switches back to wheels once its
  // chassis centre clears y=0, which buoyancy alone never achieves. So a
  // visitor CANNOT get on top of an atoll, and a shape-sized sensor (3.2)
  // sat entirely inside rock they could never reach: /weeb and /chess were
  // unenterable. Extending the volume past the waterline lets you pull
  // alongside and enter from the water, which is what the craft can do.
  const halfExtents =
    placement.medium === "water" ? WATER_SENSOR_HALF_EXTENTS : SENSOR_HALF_EXTENTS[placement.shape];
  return (
    <RigidBody type="fixed" position={placement.position} colliders={false}>
      <Shape tint={room.tint} />
      {/* Floating label. drei's <Html>, not <Text> — Text (troika-three-text)
          fetches its glyph atlas from a font file/CDN by default, and every
          other three.js label on this site (Blueprint3D, StoryMapScene)
          already uses <Html> for exactly that reason: it's a real DOM node
          styled with this site's own fonts, no extra network fetch. */}
      {/* No distanceFactor: these are labels, not geometry. Scaling them in
          world space meant the nearest one filled a third of the screen while
          the far ones vanished — one read "THE TERMINAL" at 40px tall across
          the viewport. Fixed screen size makes them behave like the compass
          chips they visually match. */}
      <Html center position={[0, halfExtents[1] + 0.7, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
        <span
          className="whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.25em] backdrop-blur"
          style={{ borderColor: `${room.tint}55`, color: room.tint, background: "rgba(10,13,12,0.6)" }}
        >
          {room.label}
        </span>
      </Html>
      {/* Each room lights its own patch of the world in its tint. Landmarks
          you can see from distance are what make a dark map navigable — before
          this, a pavilion was a small dim shape that only resolved once you
          were nearly on top of it, so finding rooms meant reading the compass
          rather than looking at the world. No shadow casting: eight
          shadow-casting point lights would cost far more than they add, and
          these exist to mark a position, not to model illumination. */}
      <BreathingLight
        tint={room.tint}
        y={halfExtents[1] + 1.2}
        seed={placement.position[0] + placement.position[2]}
        visits={visits}
      />
      <CuboidCollider
        args={halfExtents}
        sensor
        collisionGroups={SENSOR_COLLISION_GROUPS}
        onIntersectionEnter={() => onPrompt(placement.to)}
        onIntersectionExit={() => onPrompt(null)}
      />
    </RigidBody>
  );
}

export function Pavilions({ onPrompt }: { onPrompt: (to: string | null) => void }) {
  return (
    <>
      {PLACEMENTS.map((placement) => {
        const room = ROOMS.find((r) => r.to === placement.to);
        // Never happens once worldData.test.ts's registry invariant is green
        // (every PLACEMENTS.to matches a ROOMS.to) — guarded rather than `!`
        // asserted so a future drift fails soft (a missing pavilion) instead
        // of crashing the whole world.
        if (!room) return null;
        return (
          <Fragment key={placement.to}>
            <Pavilion placement={placement} room={room} onPrompt={onPrompt} />
          </Fragment>
        );
      })}
    </>
  );
}
