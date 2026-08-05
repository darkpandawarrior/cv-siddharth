import { useMemo, type JSX } from "react";
import { RigidBody } from "@react-three/rapier";
import { Line } from "@react-three/drei";
import { PLACEMENTS, TERRAIN } from "./worldData.ts";

/**
 * The static landmass: mainland, two atolls, two sky islands, all as plain
 * three.js primitives wrapped in `RigidBody type="fixed"` colliders. Nothing
 * here moves or updates per frame — the whole module runs once on mount,
 * which is what lets Water.tsx (which DOES run every frame) stay the only
 * expensive piece of the scene.
 *
 * Every landmass reuses PLACEMENTS as its source of truth for *where* a
 * room's island sits — this file never invents a second set of coordinates,
 * it only decides how big the ground under each placement is and what it
 * looks like. If worldData.ts ever moves a room, the terrain follows without
 * a second edit.
 */

const CARD = "#171c1a"; // --color-card — the site's own dark panel colour, reused as bare rock/board colour
const ACCENT = "#3ddc84";
const CYAN = "#5ee6ff";
const PURPLE = "#db61ff";

// The mainland's ground plane. Chosen half a unit above SEA_LEVEL (0) so the
// four land pavilions (worldData.ts positions them at y=0.5) sit flush on
// solid ground rather than floating or clipping into it.
const GROUND_Y = 0.5;


function placementOf(to: string) {
  const p = PLACEMENTS.find((placement) => placement.to === to);
  if (!p) throw new Error(`Terrain: worldData.ts has no placement for ${to}`);
  return p;
}

/** Evenly spaced points around a circle of `radius` at local y=0 — used both
 *  for the atolls' glowing waterline ring and could be reused for any future
 *  circular trim; kept generic rather than atoll-specific for that reason. */
function ringPoints(radius: number, segments = 32): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
  });
}

/**
 * The mainland plateau — one flat slab under the four land rooms. Deliberately
 * stops short of the Ink sea (z=22 per worldData.ts) at z=12: the remaining
 * strip south of it is built by Shore/LaunchRamp below, which taper the
 * ground down to SEA_LEVEL instead of ending in a cliff.
 */
function Mainland() {
  return (
    <RigidBody type="fixed" colliders="cuboid">
      {/* Depth 30 centred at z=-3 gives z in [-18, 12] — the slab MUST reach
          z=12, because that is where Shore and LaunchRamp below begin. It was
          28 at z=-4 (ending at z=10), which left a 2m trench with a 0.5m lip
          running the full width of the map, directly across the only route
          south. A craft hit the ramp's leading face instead of its surface and
          settled in the channel: not out of bounds and not flipped, so nothing
          respawned it. The launch leg of the triathlon was unrunnable. */}
      <mesh position={[0, GROUND_Y - 0.5, (TERRAIN.mainland.z0 + TERRAIN.mainland.z1) / 2]} receiveShadow>
        <boxGeometry args={[TERRAIN.mainland.halfWidth * 2, 1, TERRAIN.mainland.z1 - TERRAIN.mainland.z0]} />
        <meshStandardMaterial color={CARD} roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
  );
}

/**
 * A gently sloped strip of the south shore — the plain, non-launching half of
 * the shoreline. Built as a single rotated box rather than custom geometry: a
 * box's top face IS a ramp once the whole RigidBody is tilted, and Rapier's
 * auto "cuboid" collider follows that same rotation, so the visual slope and
 * the driving surface are guaranteed to match without hand-authoring both.
 *
 * `rise`/`run` describe how far the strip's y drops (rise, negative here)
 * over its z extent (run) — kept as named inputs rather than a hardcoded
 * angle so LaunchRamp below can reuse the exact same box-tilting technique
 * with a steeper rise instead of duplicating the trig.
 */
function TiltedShoreBox(props: {
  centerX: number;
  width: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  color?: string;
}) {
  const { centerX, width, z0, z1, y0, y1, color = CARD } = props;
  const run = z1 - z0;
  const rise = y1 - y0;
  const length = Math.hypot(run, rise);
  // Derivation is in the module doc comment's spirit, kept short here: tilting
  // a box by angle `a` about X moves a point advancing along the box's local
  // +Z by dy = -sin(a), dz = cos(a) per unit length, so dy/dz = -tan(a). We
  // want dy/dz = rise/run, hence a = -atan2(rise, run).
  const angle = -Math.atan2(rise, run);
  return (
    <RigidBody type="fixed" colliders="cuboid" position={[centerX, (y0 + y1) / 2, (z0 + z1) / 2]} rotation={[angle, 0, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[width, 1, length]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
  );
}

/** The two plain shoreline strips flanking the launch ramp, each tapering
 *  from the mainland's ground height down to SEA_LEVEL over the same z run
 *  the ramp climbs — so the water's edge reads as one continuous coastline,
 *  not a ramp bolted onto a cliff. */
// The ramp's x span — the two plain strips fill the coast either side of it,
// derived rather than hand-written so they can never leave a gap again.
const rampX0 = TERRAIN.shore.rampCenterX - TERRAIN.shore.rampWidth / 2;
const rampX1 = TERRAIN.shore.rampCenterX + TERRAIN.shore.rampWidth / 2;

function Shore() {
  return (
    <>
      {/* Widths span the mainland's full x in [-21, 21]. They used to cover
          only [-20, 20], leaving a 1m notch at each end where a craft hugging
          the edge drove into open air instead of down the slope. */}
      <TiltedShoreBox
        centerX={(TERRAIN.shore.xMin + rampX0) / 2}
        width={rampX0 - TERRAIN.shore.xMin}
        z0={TERRAIN.shore.z0}
        z1={TERRAIN.shore.z1}
        y0={GROUND_Y}
        y1={0}
      />
      <TiltedShoreBox
        centerX={(rampX1 + TERRAIN.shore.xMax) / 2}
        width={TERRAIN.shore.xMax - rampX1}
        z0={TERRAIN.shore.z0}
        z1={TERRAIN.shore.z1}
        y0={GROUND_Y}
        y1={0}
      />
    </>
  );
}

/**
 * The triathlon's launch ramp — mainland's south edge, sharing its x with
 * /forge (worldData.ts puts both at x=-10; the design doc calls this out
 * explicitly: the room about building things is also where the course leaves
 * the ground). Climbs from ground height to just past CHECKPOINTS[1]'s y=2.5
 * over the same z run the plain shore strips taper through, so a craft that
 * drifts a few metres off-line still finds sloped ground, not a wall.
 */
function LaunchRamp() {
  return (
    <TiltedShoreBox
      centerX={TERRAIN.shore.rampCenterX}
      width={TERRAIN.shore.rampWidth}
      z0={TERRAIN.shore.z0}
      z1={TERRAIN.shore.z1}
      y0={GROUND_Y}
      y1={TERRAIN.shore.rampTopY}
      color="#1c231f"
    />
  );
}

/**
 * One water-room atoll — a low puck of ground with a glowing waterline ring
 * standing in for surf/reef rather than a literal beach texture (desk-scale
 * primitives, per the design doc's explicitly-out-of-scope on hand-modelled
 * assets). `colliders="hull"` rather than "cuboid": a cylinder's bounding box
 * is a poor fit for its actual footprint, and a convex hull collider tracks
 * the puck shape closely for negligible extra cost on a static body.
 */
function Atoll({ to, ringColor }: { to: string; ringColor: string }) {
  const {
    position: [x, y, z],
  } = placementOf(to);
  const ring = useMemo(() => ringPoints(4.3), []);
  return (
    <RigidBody type="fixed" colliders="hull" position={[x, y + TERRAIN.atoll.centerOffsetY, z]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[TERRAIN.atoll.topRadius, TERRAIN.atoll.baseRadius, TERRAIN.atoll.height, 24]} />
        <meshStandardMaterial color={CARD} roughness={0.8} metalness={0.05} />
      </mesh>
      <Line points={ring} color={ringColor} lineWidth={1.5} transparent opacity={0.8} position={[0, 0.36, 0]} />
    </RigidBody>
  );
}

/**
 * A handful of right-angled trace paths across a sky island's top face —
 * fixed, hand-placed points rather than procedurally random ones, so the
 * pattern is identical frame to frame and between the mirrored east/west
 * islands (SkyIsland below just reflects x, same as PLACEMENTS already does
 * for the rooms themselves). Reads as circuit-board decoration without
 * needing an actual texture.
 */
const TRACE_PATHS: [number, number][][] = [
  [[-3.6, -3.2], [-3.6, 0.4], [-0.8, 0.4], [-0.8, 3.4]],
  [[3.6, -3.6], [1.2, -3.6], [1.2, -0.6], [3.6, -0.6]],
  [[-3.2, 2.6], [0.6, 2.6], [0.6, -1.4], [3.0, -1.4]],
];

function PcbTraces({ colors, y }: { colors: [string, string, string]; y: number }) {
  return (
    <>
      {TRACE_PATHS.map((path, i) => (
        <Line
          key={i}
          points={path.map(([px, pz]): [number, number, number] => [px, y, pz])}
          color={colors[i % colors.length]}
          lineWidth={1.5}
          transparent
          opacity={0.85}
        />
      ))}
    </>
  );
}

/** One air-room sky island — a flat PCB-style slab. Bigger and squarer than
 *  the atolls on purpose: the design doc's desk-scale rule reads a slab with
 *  traced circuitry as a populated circuit board, which only sells the
 *  "PCB" read if the board itself looks board-shaped rather than rock-shaped. */
function SkyIsland({ to, traceColors }: { to: string; traceColors: [string, string, string] }) {
  const {
    position: [x, y, z],
  } = placementOf(to);
  return (
    <RigidBody type="fixed" colliders="cuboid" position={[x, y - TERRAIN.skyIsland.thickness / 2, z]}>
      <mesh receiveShadow>
        <boxGeometry args={[TERRAIN.skyIsland.half * 2, TERRAIN.skyIsland.thickness, TERRAIN.skyIsland.half * 2]} />
        <meshStandardMaterial color={CARD} roughness={0.55} metalness={0.25} />
      </mesh>
      <PcbTraces colors={traceColors} y={0.51} />
    </RigidBody>
  );
}

export function Terrain(): JSX.Element {
  return (
    <group>
      <Mainland />
      <Shore />
      <LaunchRamp />

      {/* West corridor (weeb/blueprint) — the timed course, cyan-trimmed. */}
      <Atoll to="/weeb" ringColor={CYAN} />
      <SkyIsland to="/blueprint" traceColors={[ACCENT, CYAN, CYAN]} />

      {/* East corridor (chess/map) — drive-and-explore only, purple-trimmed,
          so the two corridors read as a matched pair rather than duplicates. */}
      <Atoll to="/chess" ringColor={PURPLE} />
      <SkyIsland to="/map" traceColors={[ACCENT, PURPLE, PURPLE]} />
    </group>
  );
}
