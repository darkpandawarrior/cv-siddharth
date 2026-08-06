import { useMemo, type JSX } from "react";
import { RigidBody } from "@react-three/rapier";
import { Grid, Line } from "@react-three/drei";
import { PLACEMENTS, TERRAIN, tiltedSlabCenterY } from "./worldData.ts";
import { dim, worldPalette } from "./palette.ts";

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

// Colours come from worldPalette() inside each component, never from
// module-scope constants: a const here would capture whichever theme was
// applied at import and never update. See palette.ts.

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
  const c = worldPalette();
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
        <meshStandardMaterial color={c.card} roughness={0.85} metalness={0.05} />
      </mesh>
    </RigidBody>
  );
}

/**
 * A raised lip along the mainland's north, east and west edges — the three
 * that end in a sheer 1m drop. The south edge is deliberately left open,
 * because that is where Shore and LaunchRamp taper into the sea: leaving the
 * land is meant to be a decision, not an accident.
 *
 * Found by driving it rather than by reading it. Spawn sits 14m from the north
 * edge and the craft accelerates at ~8.2 m/s², so holding W from a standing
 * start put a first-time visitor in the water in 1.9 seconds — before they had
 * any idea what the controls did, and with the only ramp back onto land 40m
 * away around the far side. Every automated gate passed while that was true;
 * it took a screenshot to see it.
 *
 * Reads as the raised lip of a desk mat, which is the right shape for a world
 * built at desk scale anyway.
 */
const KERB_HEIGHT = 0.9;
const KERB_THICKNESS = 0.5;

function Kerb() {
  const c = worldPalette();
  const { halfWidth, z0, z1, groundY } = TERRAIN.mainland;
  const depth = z1 - z0;
  const y = groundY + KERB_HEIGHT / 2;
  return (
    <>
      {/* North */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, y, z0 + KERB_THICKNESS / 2]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[halfWidth * 2, KERB_HEIGHT, KERB_THICKNESS]} />
          <meshStandardMaterial color={c.surface} roughness={0.8} />
        </mesh>
      </RigidBody>
      {/* East and west, stopping short of the south edge so the shore stays open */}
      {[-1, 1].map((side) => (
        <RigidBody
          key={side}
          type="fixed"
          colliders="cuboid"
          position={[side * (halfWidth - KERB_THICKNESS / 2), y, (z0 + z1) / 2]}
        >
          <mesh receiveShadow castShadow>
            <boxGeometry args={[KERB_THICKNESS, KERB_HEIGHT, depth]} />
            <meshStandardMaterial color={c.surface} roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}
    </>
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
/** Thickness of a shore/ramp slab. Named because the surface offset above
 *  depends on it. */
const BOX_THICKNESS = 1;

function TiltedShoreBox(props: {
  centerX: number;
  width: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  color?: string;
}) {
  const c = worldPalette();
  const { centerX, width, z0, z1, y0, y1, color = c.card } = props;
  const run = z1 - z0;
  const rise = y1 - y0;
  const length = Math.hypot(run, rise);
  // Derivation is in the module doc comment's spirit, kept short here: tilting
  // a box by angle `a` about X moves a point advancing along the box's local
  // +Z by dy = -sin(a), dz = cos(a) per unit length, so dy/dz = -tan(a). We
  // want dy/dz = rise/run, hence a = -atan2(rise, run).
  const angle = -Math.atan2(rise, run);
  // Drop the box by half its thickness along its own normal so its TOP FACE —
  // the surface you actually drive on — passes through (z0,y0)→(z1,y1).
  //
  // Positioning by centre line, as this did, put the driving surface half a
  // box above the intended slope: a 0.5m step across the full width of the map
  // exactly where the mainland ends and the shore begins. Every run south hit
  // it at speed and flipped. It survived the earlier "trench" fix because that
  // one reconciled the z ranges and never checked the heights, and it is
  // invisible to worldGeometry.test.ts for the same reason — the test compares
  // z extents, not surface heights. See the new step-height assertion there.
  const centerY = tiltedSlabCenterY(y0, y1, run, BOX_THICKNESS);
  return (
    <RigidBody type="fixed" colliders="cuboid" position={[centerX, centerY, (z0 + z1) / 2]} rotation={[angle, 0, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[width, BOX_THICKNESS, length]} />
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
  const c = worldPalette();
  return (
    <TiltedShoreBox
      centerX={TERRAIN.shore.rampCenterX}
      width={TERRAIN.shore.rampWidth}
      z0={TERRAIN.shore.z0}
      z1={TERRAIN.shore.z1}
      y0={GROUND_Y}
      y1={TERRAIN.shore.rampTopY}
      color={c.surface}
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
  const c = worldPalette();
  const {
    position: [x, y, z],
  } = placementOf(to);
  const ring = useMemo(() => ringPoints(4.3), []);
  return (
    <RigidBody type="fixed" colliders="hull" position={[x, y + TERRAIN.atoll.centerOffsetY, z]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[TERRAIN.atoll.topRadius, TERRAIN.atoll.baseRadius, TERRAIN.atoll.height, 24]} />
        <meshStandardMaterial color={c.card} roughness={0.8} metalness={0.05} />
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
  const c = worldPalette();
  const {
    position: [x, y, z],
  } = placementOf(to);
  return (
    <RigidBody type="fixed" colliders="cuboid" position={[x, y - TERRAIN.skyIsland.thickness / 2, z]}>
      <mesh receiveShadow>
        <boxGeometry args={[TERRAIN.skyIsland.half * 2, TERRAIN.skyIsland.thickness, TERRAIN.skyIsland.half * 2]} />
        <meshStandardMaterial color={c.card} roughness={0.55} metalness={0.25} />
      </mesh>
      <PcbTraces colors={traceColors} y={0.51} />
    </RigidBody>
  );
}

export function Terrain(): JSX.Element {
  const c = worldPalette();
  return (
    <group>
      {/* A cutting-mat grid on the desk surface. This is the only thing in the
          scene close enough to the camera to give parallax, and without it a
          car at 23 m/s over an untextured plane looks like a car at 6 m/s —
          there is simply nothing passing by to register speed against. It also
          sells the desk-scale read the whole world is built on: this is a
          work surface, and work surfaces have a grid printed on them.
          `infiniteGrid` is off deliberately — the grid stops at the coast, so
          its edge marks where the drivable ground ends. */}
      <Grid
        position={[0, TERRAIN.mainland.groundY + 0.01, (TERRAIN.mainland.z0 + TERRAIN.mainland.z1) / 2]}
        args={[TERRAIN.mainland.halfWidth * 2, TERRAIN.mainland.z1 - TERRAIN.mainland.z0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor={dim(c.signal, 0.88)}
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor={dim(c.signal, 0.62)}
        fadeDistance={70}
        fadeStrength={1.4}
        followCamera={false}
        infiniteGrid={false}
      />
      <Mainland />
      <Kerb />
      <Shore />
      <LaunchRamp />

      {/* West corridor (weeb/blueprint) — the timed course, cyan-trimmed. */}
      <Atoll to="/weeb" ringColor={c.probe} />
      <SkyIsland to="/blueprint" traceColors={[c.signal, c.probe, c.probe]} />

      {/* East corridor (chess/map) — drive-and-explore only, purple-trimmed,
          so the two corridors read as a matched pair rather than duplicates. */}
      <Atoll to="/chess" ringColor={c.alt} />
      <SkyIsland to="/map" traceColors={[c.signal, c.alt, c.alt]} />
    </group>
  );
}
