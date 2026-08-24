import { Fragment, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, type BufferGeometry, type PointLight } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PLACEMENTS, type Placement } from "./worldData.ts";
import { SENSOR_HALF_EXTENTS } from "./pavilionGeometry.ts";
import { ROOMS, type Room } from "../rooms.tsx";
import { usePulseCounts, type PulseEvent } from "../play/pulse.ts";
import { telemetry } from "./telemetry.ts";
import { worldPalette, worldTint} from "./palette.ts";

/**
 * One physical structure per room, built entirely from three.js primitives —
 * no GLTF assets, per the design doc's "desk scale" rule. Each pavilion is a
 * plain `<group>` sitting at its `PLACEMENTS` position, wearing the room's
 * tint (looked up from ROOMS, never hand-duplicated here). There is no solid
 * geometry to bump into — pavilions were never in obstacles.ts's derived
 * list either, drive.ts's own comment on that says so explicitly: "a room
 * you can drive into the middle of is the point."
 *
 * The approach volume that raises the HUD prompt used to be a Rapier sensor
 * `CuboidCollider` firing `onIntersectionEnter`/`onIntersectionExit`. It is
 * now a plain AABB test against the car's live position (`telemetry.x/y/z`,
 * written every frame by Vehicle.tsx), run once per frame across every
 * placement in `Pavilions()` below — cheap enough on eight boxes that it
 * doesn't need a physics engine's broadphase to make it fast. Rapier's
 * interaction groups existed only to keep Props.tsx's dynamic debris from
 * firing these sensors by rolling through one; there is no dynamic debris
 * any more (Props.tsx is static geometry now), so that whole mechanism —
 * collisionGroups.ts included — went with it.
 *
 * CRITICAL: this iterates PLACEMENTS, never a hand-written room list — see
 * worldData.test.ts's registry invariant. Adding a room to profile.ts without
 * a matching PLACEMENTS entry must fail that test, not silently drop a
 * pavilion from the world.
 */

// SENSOR_HALF_EXTENTS moved to pavilionGeometry.ts — the world's label
// layer needs the same numbers to float a room's name above it, and a plain
// data module is the one place both a scene component and a DOM overlay can
// import from.

/** Whether `pos` sits inside a placement's approach box, centred on the
 *  placement's own position with the given half-extents — the same test a
 *  `CuboidCollider` sensor used to run inside Rapier's broadphase. */
function insideApproach(
  pos: { x: number; y: number; z: number },
  placement: readonly [number, number, number],
  half: readonly [number, number, number],
): boolean {
  return (
    Math.abs(pos.x - placement[0]) <= half[0] &&
    Math.abs(pos.y - placement[1]) <= half[1] &&
    Math.abs(pos.z - placement[2]) <= half[2]
  );
}


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

/**
 * Merged static geometry for the parts of each pavilion skin that share one
 * material — built once at module scope (the shape is identical for every
 * room wearing it; only the material's `tint` colour varies per room, and
 * that's a prop on the `<mesh>`, not the geometry). This is what takes
 * Pavilions from ~40 draw calls to the design doc's "≤24" bar: eight rooms
 * at up to 3 meshes each (Crt/Board/Pcb) rather than 4-8. `mergeGeometries`
 * ([...]three/examples/jsm) concatenates several BufferGeometries that
 * already carry their own local translate/rotate into one — the standard
 * three.js way to fold several same-material primitives into a single draw
 * call without hand-rolling vertex arrays.
 */
function mergeBoxes(boxes: BoxGeometry[]): BufferGeometry {
  return mergeGeometries(boxes);
}

// Crt: base + neck are both plain `card`-coloured plastic — one geometry.
const CRT_BASE_GEOMETRY = mergeBoxes([
  new BoxGeometry(0.7, 0.5, 0.7).translate(0, 0.25, 0),
  new BoxGeometry(0.35, 0.4, 0.35).translate(0, 0.6, 0),
]);

// Board: both legs are the same card-coloured strut — one geometry.
const BOARD_LEGS_GEOMETRY = mergeBoxes([
  new BoxGeometry(0.14, 1.8, 0.14).translate(-1.1, 0.9, 0.7),
  new BoxGeometry(0.14, 1.8, 0.14).translate(1.1, 0.9, 0.7),
]);

// Pcb: the five chips share one tint/emissive material — one geometry.
const PCB_CHIP_POSITIONS: [number, number][] = [
  [-1.0, -0.9],
  [0.6, -0.6],
  [-0.4, 0.5],
  [1.1, 1.0],
  [-1.2, 1.1],
];
const PCB_CHIPS_GEOMETRY = mergeBoxes(
  PCB_CHIP_POSITIONS.map(([x, z]) => new BoxGeometry(0.35, 0.14, 0.35).translate(x, 0.27, z)),
);
// Pcb: both trace lines share the other tint/emissive material — one
// geometry. `rotateY` runs before `translate` so it turns around the box's
// own centre (matching the original mesh's `rotation` prop, which rotated
// in place at the same world position) rather than around the world origin.
const PCB_TRACES_GEOMETRY = mergeBoxes([
  new BoxGeometry(2.6, 0.01, 0.06).translate(0, 0.21, 0),
  new BoxGeometry(2.6, 0.01, 0.06).rotateY(Math.PI / 2).translate(0, 0.21, 0),
]);

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

/** Chunky monitor on a pedestal, tinted screen facing +Z (out of the mainland).
 *  Base+neck merged into one draw call (CRT_BASE_GEOMETRY); the monitor body
 *  and the screen keep their own materials (a different colour, an emissive
 *  tint) so they stay separate meshes — 3 total, the design doc's per-shape
 *  ceiling. */
function Crt({ tint }: { tint: string }) {
  const c = worldPalette();
  return (
    <group>
      <mesh geometry={CRT_BASE_GEOMETRY} castShadow>
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

/** A drafting board tilted on two legs, like a table angled up for drawing.
 *  Both legs merged into one draw call (BOARD_LEGS_GEOMETRY); the board
 *  surface and its emissive trim keep their own materials — 3 meshes total. */
function Board({ tint }: { tint: string }) {
  const c = worldPalette();
  return (
    <group>
      <mesh geometry={BOARD_LEGS_GEOMETRY} castShadow>
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

/** Circuit slab: a flat board with a handful of raised chips and trace lines.
 *  The five chips merge into one draw call (PCB_CHIPS_GEOMETRY, same tint/
 *  emissive), the two trace lines into another (PCB_TRACES_GEOMETRY) — base
 *  + chips + traces is 3 meshes total, down from 8. */
function Pcb({ tint }: { tint: string }) {
  const c = worldPalette();
  return (
    <group>
      <mesh position={[0, 0.1, 0]} receiveShadow castShadow>
        <boxGeometry args={[3.2, 0.2, 3.2]} />
        <meshStandardMaterial color={c.surface} roughness={0.6} />
      </mesh>
      <mesh geometry={PCB_CHIPS_GEOMETRY}>
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.6} roughness={0.4} />
      </mesh>
      <mesh geometry={PCB_TRACES_GEOMETRY}>
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

const SHAPES: Record<Placement["shape"], (props: { tint: string }) => JSX.Element> = {
  slab: Slab,
  crt: Crt,
  board: Board,
  pcb: Pcb,
};

function Pavilion({ placement, room }: { placement: Placement; room: Room }) {
  const Shape = SHAPES[placement.shape];
  // The same registry key the card grid uses for its visit counter, so the
  // world and the list are lit by one number rather than two.
  const counts = usePulseCounts();
  const visits = counts[`room:${placement.to.slice(1)}` as PulseEvent] ?? 0;
  const halfExtents = SENSOR_HALF_EXTENTS[placement.shape];
  return (
    <group position={placement.position}>
      <Shape tint={worldTint(room.tint, worldPalette())} />
      {/* The floating room name used to be right here, as its own drei <Html>
          portal. It now belongs to the world's one label layer (labels.ts /
          WorldLabels.tsx), which is the only place that can see every label at
          once and therefore the only place that can stop them stacking on top
          of each other at the horizon. LABEL_HEIGHT (pavilionGeometry.ts) is
          the shared number that keeps that label sitting over this structure. */}
      {/* Each room lights its own patch of the world in its tint. Landmarks
          you can see from distance are what make a dark map navigable — before
          this, a pavilion was a small dim shape that only resolved once you
          were nearly on top of it, so finding rooms meant reading the compass
          rather than looking at the world. No shadow casting: eight
          shadow-casting point lights would cost far more than they add, and
          these exist to mark a position, not to model illumination. */}
      <BreathingLight
        tint={worldTint(room.tint, worldPalette())}
        y={halfExtents[1] + 1.2}
        seed={placement.position[0] + placement.position[2]}
        visits={visits}
      />
    </group>
  );
}

export function Pavilions({ onPrompt }: { onPrompt: (to: string | null) => void }) {
  // The dwell-then-prompt behaviour lives entirely in World.tsx's
  // `handlePrompt` and is untouched by this rewrite — this only replaces HOW
  // "the car is now near room X" / "...and now it isn't" gets decided.
  // `insideRef` is the edge detector: `onPrompt` must fire on the transition
  // only (matching Rapier's onIntersectionEnter/Exit semantics), not every
  // frame the car happens to be inside a box, or World.tsx's dwell timer
  // would restart 60 times a second and never fire.
  const insideRef = useRef<string | null>(null);
  useFrame(() => {
    let hit: string | null = null;
    for (const placement of PLACEMENTS) {
      if (insideApproach(telemetry, placement.position, SENSOR_HALF_EXTENTS[placement.shape])) {
        hit = placement.to;
        break; // approach volumes never overlap — worldGeometry.test.ts asserts the spacing
      }
    }
    if (hit !== insideRef.current) {
      insideRef.current = hit;
      onPrompt(hit);
    }
  });

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
            <Pavilion placement={placement} room={room} />
          </Fragment>
        );
      })}
    </>
  );
}
