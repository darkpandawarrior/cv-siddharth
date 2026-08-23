import { useMemo, type JSX } from "react";
import * as THREE from "three";
import { Grid } from "@react-three/drei";
import { CITY } from "./city.ts";
import { YEAR_BANDS, eraColorT } from "./cityData.ts";
import { TERRAIN } from "./worldData.ts";
import { dim, mix, worldPalette } from "./palette.ts";

/**
 * The ground. One 56x168m slab (CITY.halfWidth*2 wide, CITY.z0..z1 long) as
 * a single fixed collider, painted with the city's own calendar: ten
 * non-collider colour plates, one per year, ramping grey to signal-green
 * only across Dice's own tenure (cityData.ts's eraColorT — there is no
 * per-year Kotlin/Compose series anywhere in src/data/, so the ramp only
 * covers the one span the data can actually support), plus a kerb and a
 * small lit tick at each year boundary so the calendar is legible from the
 * driver's seat, not just from directly overhead.
 *
 * Nothing here moves or updates per frame — every instanced mesh below is
 * written once in a ref callback at mount, matching the codebase's existing
 * InstancedMesh pattern (Monuments.tsx's towers, Props.tsx's debris): one
 * draw call per family rather than one mesh per instance. Terrain's own
 * budget is <=6 draw calls total; this file uses 5 (grid, slab, era plates,
 * kerb, year ticks).
 *
 * Every room's position still comes from worldData.ts's PLACEMENTS — this
 * file never invents a second set of room coordinates, only what the ground
 * beneath the whole slab looks like.
 */

// Colours come from worldPalette() inside each component, never from
// module-scope constants: a const here would capture whichever theme was
// applied at import and never update. See palette.ts.

/** Shared scratch for writing instance matrices — never rendered itself. */
const dummy = new THREE.Object3D();

/**
 * The slab — the whole playable surface, as one flat box. Kept as a single
 * mesh rather than the old mainland+shore split: there is nowhere else to
 * taper down to now that the world has one surface, and a flat 168m box is
 * also what lets EraPlates below sit as thin decals on top of it rather than
 * needing their own geometry per band.
 *
 * No collider: obstacles.ts's derived list is what the car's kinematic model
 * (drive.ts) actually drives against, and the ground itself is handled by
 * heightAt() rather than a physics body — see the design doc's "kinematic,
 * deterministic" physics section for why there's no physics engine here at all.
 */
function Mainland() {
  const c = worldPalette();
  const { halfWidth, z0, z1, groundY } = TERRAIN.mainland;
  return (
    <mesh position={[0, groundY - 0.5, (z0 + z1) / 2]} receiveShadow>
      <boxGeometry args={[halfWidth * 2, 1, z1 - z0]} />
      {/* Lifted NEUTRALLY, toward the text colour rather than toward the
          accent — see the git history on this line for why a lift toward
          --color-signal instead reads as a golf course, not a work
          surface. */}
      <meshStandardMaterial color={mix(c.card, c.text, 0.12)} roughness={0.9} metalness={0.02} />
    </mesh>
  );
}

/**
 * Ten thin, non-collider plates 0.01m above the slab, one per year band,
 * coloured by cityData.ts's eraColorT. This is the "ground changes era with
 * the city" idea made as honest as the data allows: north of Dice's own
 * start (June 2023 — the one dated Kotlin baseline anywhere in src/data/)
 * every plate is flat grey, because nothing says the earlier years were
 * anything else. South of it the ramp runs toward the signal green that
 * marks live/lit geometry everywhere else in this world.
 *
 * A small gap (0.4m) is left between adjacent plates so a year boundary
 * reads as a seam rather than disappearing into a single continuous colour.
 */
function EraPlates() {
  const c = worldPalette();
  const { halfWidth, groundY } = TERRAIN.mainland;
  return (
    <instancedMesh
      ref={(mesh) => {
        if (!mesh) return;
        const color = new THREE.Color();
        for (let i = 0; i < YEAR_BANDS.length; i++) {
          const band = YEAR_BANDS[i];
          dummy.position.set(0, groundY + 0.01, band.z);
          dummy.scale.set(halfWidth * 2, 0.02, CITY.yearSpan - 0.4);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          color.set(mix(c.card, c.signal, eraColorT(band.z)));
          mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }}
      args={[undefined, undefined, YEAR_BANDS.length]}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.85} metalness={0.02} />
    </instancedMesh>
  );
}

/**
 * A raised lip around all four edges of the slab, as ONE InstancedMesh for
 * its visuals — one draw call for all four sides, same as when this was a
 * fixed RigidBody carrying four CuboidColliders. There is no collider any
 * more: the kerb isn't in obstacles.ts's derived list either, so driving
 * onto it is (as it always visually implied) harmless — the WORLD_BOUNDS box
 * in craftPhysics.ts is what actually stops the car at the edge of the slab.
 */
const KERB_HEIGHT = 0.9;
const KERB_THICKNESS = 0.5;

function Kerb() {
  const c = worldPalette();
  const { halfWidth, z0, z1, groundY } = TERRAIN.mainland;
  const depth = z1 - z0;
  const y = groundY + KERB_HEIGHT / 2;
  const sides = useMemo(
    () => [
      { pos: [0, y, z0 + KERB_THICKNESS / 2] as [number, number, number], scale: [halfWidth * 2, KERB_HEIGHT, KERB_THICKNESS] as [number, number, number] },
      { pos: [0, y, z1 - KERB_THICKNESS / 2] as [number, number, number], scale: [halfWidth * 2, KERB_HEIGHT, KERB_THICKNESS] as [number, number, number] },
      { pos: [halfWidth - KERB_THICKNESS / 2, y, (z0 + z1) / 2] as [number, number, number], scale: [KERB_THICKNESS, KERB_HEIGHT, depth] as [number, number, number] },
      { pos: [-(halfWidth - KERB_THICKNESS / 2), y, (z0 + z1) / 2] as [number, number, number], scale: [KERB_THICKNESS, KERB_HEIGHT, depth] as [number, number, number] },
    ],
    [halfWidth, z0, z1, y, depth],
  );

  return (
    <instancedMesh
      ref={(mesh) => {
        if (!mesh) return;
        for (let i = 0; i < sides.length; i++) {
          dummy.position.set(...sides[i].pos);
          dummy.scale.set(...sides[i].scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }}
      args={[undefined, undefined, sides.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={c.surface} roughness={0.8} />
    </instancedMesh>
  );
}

/**
 * A small lit marker and a year label at each band's west-kerb edge — the
 * ground's own calendar made readable from the driver's seat rather than
 * only legible as a colour gradient seen from above. Non-collider: driving
 * through one is harmless, the same as this world's other decorative trim.
 */
const TICK_INSET = 1.4; // metres in from the west kerb's inner face
const TICK_SIZE: [number, number, number] = [0.7, 0.3, 0.7];

function YearTicks() {
  const c = worldPalette();
  const { halfWidth, groundY } = TERRAIN.mainland;
  const x = -(halfWidth - TICK_INSET);
  return (
    <>
      <instancedMesh
        ref={(mesh) => {
          if (!mesh) return;
          for (let i = 0; i < YEAR_BANDS.length; i++) {
            dummy.position.set(x, groundY + TICK_SIZE[1] / 2, YEAR_BANDS[i].z);
            dummy.scale.set(...TICK_SIZE);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        }}
        args={[undefined, undefined, YEAR_BANDS.length]}
        castShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={c.surface} emissive={c.accent} emissiveIntensity={0.8} roughness={0.5} />
      </instancedMesh>
      {/* The year pills that used to float here are now part of the world's
          one label layer (labels.ts). They were the least useful text on
          screen and the most numerous — ten of them, visible from the whole
          length of the boulevard, for a marker that only means anything while
          you are driving through that band. There they carry 24m and lose
          every collision to a room name. */}
    </>
  );
}

/**
 * The cutting-mat grid printed on the slab.
 *
 * The only thing in the scene close enough to the camera to give parallax,
 * so it is what makes speed legible. Cell size 4 (up from 1) and section
 * size 16 (up from 5) on a slab that is now 168m long rather than 30m: a 1m
 * cell on a boulevard this size reads as static noise underfoot, and a 4m
 * cell (≈2 car-lengths) reads as pavement joints instead. 16m section lines
 * are the same span as a year band, so the grid is trying to double as the
 * calendar — it lands close, not exact, because the grid's own local origin
 * is the slab's z-midpoint (so the visible plane covers the full 168m
 * without a gap at either end) rather than a year boundary, which sits 4m
 * off that midpoint. EraPlates and YearTicks above are what actually carry
 * the year information; this is texture, not a second source of truth.
 */
function DeskGrid(): JSX.Element {
  const c = worldPalette();
  const { halfWidth, z0, z1, groundY } = TERRAIN.mainland;
  return (
    <Grid
      position={[0, groundY + 0.01, (z0 + z1) / 2]}
      args={[halfWidth * 2, z1 - z0]}
      cellSize={4}
      cellThickness={0.5}
      cellColor={dim(c.signal, 0.88)}
      sectionSize={16}
      sectionThickness={0.8}
      sectionColor={dim(c.signal, 0.62)}
      fadeDistance={100}
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
      <EraPlates />
      <Kerb />
      <YearTicks />
    </>
  );
}
