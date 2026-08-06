import { type JSX } from "react";
import { RigidBody } from "@react-three/rapier";
import { Grid } from "@react-three/drei";
import { TERRAIN } from "./worldData.ts";
import { dim, mix, worldPalette } from "./palette.ts";

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
        {/* Lifted NEUTRALLY, toward the text colour rather than toward the
            accent. --color-card alone is the site's dark panel colour: correct
            behind text on a web page, far too dark for a surface filling most
            of the frame, so the ground read as a void with objects floating in
            it. Lifting it toward --color-signal instead turned the desk into a
            golf course — a green field is not what "a work surface" looks like.
            12% toward the text colour is a grey desk mat that AO can bite into. */}
        <meshStandardMaterial color={mix(c.card, c.text, 0.12)} roughness={0.9} metalness={0.02} />
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
      {/* South, too. The gap used to be the way down to the sea; there is no
          sea, so an open edge is now just a hole to fall through. */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, y, z1 - KERB_THICKNESS / 2]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[halfWidth * 2, KERB_HEIGHT, KERB_THICKNESS]} />
          <meshStandardMaterial color={c.surface} roughness={0.8} />
        </mesh>
      </RigidBody>
      {/* East and west */}
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
 * A handful of right-angled trace paths across a sky island's top face —
 * fixed, hand-placed points rather than procedurally random ones, so the
 * pattern is identical frame to frame and between the mirrored east/west
 * islands (SkyIsland below just reflects x, same as PLACEMENTS already does
 * for the rooms themselves). Reads as circuit-board decoration without
 * needing an actual texture.
 */


/** One air-room sky island — a flat PCB-style slab. Bigger and squarer than
 *  the atolls on purpose: the design doc's desk-scale rule reads a slab with
 *  traced circuitry as a populated circuit board, which only sells the
 *  "PCB" read if the board itself looks board-shaped rather than rock-shaped. */

/**
 * The cutting-mat grid printed on the desk.
 *
 * The only thing in the scene close enough to the camera to give parallax, so
 * it is what makes speed legible — a car at 23 m/s over an untextured plane
 * looks identical to one at 6. Section lines derive from the theme token via
 * dim() rather than being a literal, so a theme that moves --color-signal moves
 * the floor with it.
 */
function DeskGrid(): JSX.Element {
  const c = worldPalette();
  const { halfWidth, z0, z1, groundY } = TERRAIN.mainland;
  return (
    <Grid
      position={[0, groundY + 0.01, (z0 + z1) / 2]}
      args={[halfWidth * 2, z1 - z0]}
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
  );
}

export function Terrain(): JSX.Element {
  return (
    <>
      <DeskGrid />
      <Mainland />
      <Kerb />
    </>
  );
}
