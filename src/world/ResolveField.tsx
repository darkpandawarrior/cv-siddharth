import { useMemo, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CITY } from "./city.ts";
import { westResolveSources } from "./districtWest.ts";
import { eastResolveSources } from "./corpusData.ts";
import { telemetry } from "./telemetry.ts";
import { worldPalette } from "./palette.ts";
import { fusedFix } from "./Trail.tsx";
import {
  applyResolveShader,
  resolveAttributes,
  resolvedFraction,
  stamp,
  updateTriggers,
} from "./resolve.ts";

/**
 * THE RESOLUTION FIELD, drawn — the two dust families the design doc's
 * "resolution rule" splits the city's point cloud into, and the one place
 * that drives resolve.ts's per-frame heartbeat.
 *
 * GROUND HAZE (60%, ~15,600 instances) is this component's own creation: a
 * scatter of points across the buildable footprint on both flanks (never the
 * boulevard itself — that strip is Terrain.tsx's job and is always resolved,
 * per the design doc's anti-broken rule), fading in as the era ground
 * texture beneath it.
 *
 * STRUCTURE DUST (40%, ~10,400 instances) is NOT this component's data —
 * it's whatever the west and east districts hand back from their own
 * `*ResolveSources()`, i.e. surface point clouds already sampled onto their
 * ~30 largest landmarks (see districtWest.ts's `sampleBoxSurface`). This
 * component only concatenates the two flanks into one InstancedMesh and
 * tints each instance by its owning structure's token — it has no opinion
 * about which structures qualify or how their surfaces are sampled.
 *
 * Both are a single tetrahedron (4 tris, not a cube's 12 — the "shard"
 * silhouette the design doc calls out) rendered as ONE InstancedMesh each,
 * so the whole 26,000-instance field is exactly 2 draw calls.
 */

/** 60% of the ~26,000-instance dust budget. */
const GROUND_HAZE_COUNT = 15600;

/** Kept off the ground plane by this much so the shards don't z-fight the
 *  slab (or, pre-resolve, whatever they're scattered near). */
const HAZE_Y = 0.4;

/** Small enough to read as a shard from the driver's seat, not a boulder. */
const DUST_RADIUS = 0.16;

/** Ground haze never targets the boulevard (|x| <= CITY.laneHalf) — that
 *  strip is always-resolved, static geometry Terrain.tsx owns outright, and
 *  a visitor's very first view (the design doc's "first five seconds")
 *  depends on it never being dust. Random, but only ever seeded once, in a
 *  useMemo — never re-rolled on a later render. */
function groundHazeTargets(): Float32Array {
  const targets = new Float32Array(GROUND_HAZE_COUNT * 3);
  const flankWidth = CITY.halfWidth - CITY.laneHalf - 1; // 1m clear of the kerb
  for (let i = 0; i < GROUND_HAZE_COUNT; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (CITY.laneHalf + 0.5 + Math.random() * flankWidth);
    const z = CITY.z0 + Math.random() * (CITY.z1 - CITY.z0);
    targets[i * 3] = x;
    targets[i * 3 + 1] = CITY.groundY + HAZE_Y;
    targets[i * 3 + 2] = z;
  }
  return targets;
}

/** Concatenates both flanks' structure-dust surfaces into one target array
 *  plus a matching per-instance base colour, so the whole family renders
 *  through a single material via `instanceColor` rather than needing one
 *  material per token. */
function structureDustData(): { targets: Float32Array; colors: Float32Array } {
  const sources = [...westResolveSources(), ...eastResolveSources()];
  const palette = worldPalette();
  const total = sources.reduce((n, s) => n + s.targets.length / 3, 0);
  const targets = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  let offset = 0;
  for (const source of sources) {
    const n = source.targets.length / 3;
    targets.set(source.targets, offset * 3);
    const tint = new THREE.Color(palette[source.token]);
    for (let i = 0; i < n; i++) {
      colors[(offset + i) * 3] = tint.r;
      colors[(offset + i) * 3 + 1] = tint.g;
      colors[(offset + i) * 3 + 2] = tint.b;
    }
    offset += n;
  }
  return { targets, colors };
}

/** Every instance's matrix stays IDENTITY for the life of the mesh — a dust
 *  shard's world position comes entirely from the vertex shader's
 *  aScatter/aTarget mix, never from the instance transform (see resolve.ts's
 *  own module comment). A fresh InstancedMesh's matrix buffer is all-zero,
 *  not identity, so this has to run once or every shard degenerates to a
 *  zero-scale point at the origin. */
const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function stampIdentity(mesh: THREE.InstancedMesh, count: number): void {
  const array = mesh.instanceMatrix.array as Float32Array;
  for (let i = 0; i < count; i++) array.set(IDENTITY_MATRIX, i * 16);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
}

type DustFamilyAttrs = ReturnType<typeof resolveAttributes>;

/** One instanced tetrahedron field, wired to resolve.ts's shader hook. Takes
 *  already-built attributes rather than building its own, so ResolveField
 *  can hold the single canonical `resolveAttributes()` call per family — the
 *  same object `useFrame` below stamps triggers into. */
function DustField({
  attrs,
  colors,
  opacity,
}: {
  attrs: DustFamilyAttrs;
  colors?: Float32Array;
  opacity: number;
}): JSX.Element {
  const count = attrs.aTarget.count;
  return (
    <instancedMesh
      args={[undefined, undefined, count]}
      frustumCulled={false}
      ref={(mesh) => {
        if (!mesh) return;
        stampIdentity(mesh, count);
        mesh.geometry.setAttribute("aScatter", attrs.aScatter);
        mesh.geometry.setAttribute("aTarget", attrs.aTarget);
        mesh.geometry.setAttribute("aTriggerTime", attrs.aTriggerTime);
        if (colors) mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      }}
    >
      <tetrahedronGeometry args={[DUST_RADIUS]} />
      <meshBasicMaterial
        ref={(mat) => {
          if (mat) applyResolveShader(mat, "dust");
        }}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function ResolveField(): JSX.Element {
  const groundAttrs = useMemo(() => resolveAttributes(groundHazeTargets()), []);
  const structData = useMemo(structureDustData, []);
  const structAttrs = useMemo(() => resolveAttributes(structData.targets), [structData]);

  useFrame((state) => {
    // Stamped from the FUSED estimate, never the raw fix and never
    // telemetry.x/z (ground truth) — see Trail.tsx's own comment on
    // `fusedFix` for why. `stamp()` is idempotent and cheap even when it
    // finds nothing new (the ratchet), so this can run every frame for free.
    const newCells = stamp(fusedFix.x, fusedFix.z, telemetry.heading, state.clock.elapsedTime);
    if (newCells.length > 0) {
      updateTriggers(groundAttrs.aTriggerTime, groundAttrs.cells, newCells, state.clock.elapsedTime);
      updateTriggers(structAttrs.aTriggerTime, structAttrs.cells, newCells, state.clock.elapsedTime);
    }
    telemetry.resolvedFraction = resolvedFraction();
  });

  return (
    <>
      <DustField attrs={groundAttrs} opacity={0.5} />
      <DustField attrs={structAttrs} colors={structData.colors} opacity={0.85} />
    </>
  );
}
