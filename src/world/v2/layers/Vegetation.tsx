/**
 * Vegetation (this lane's own task list; world-v2-spec.md §7 "Vegetation" +
 * §8 tier table; visual-catalogue.md#V1 boat-interaction bend, #T3
 * density-mask instance gating; master-plan.md#M19, #M67).
 *
 * Three tiers of content, all sharing the SAME real heightmap
 * (`heightSurface`, loaded once) so nothing floats or clips into the
 * ground the terrain itself displaces from:
 *   1. Hero trunks: one banyan + two neem (world-v2-spec §6), each with
 *      its own instanced cross-card foliage crown, plus a scattered palm
 *      tree-line along both banks. Palms are drawn through ONE
 *      `InstancedMesh` per distinct mesh in `palm.glb` (trunk, frond cards)
 *      rather than a literal per-90m static merge: GPU instancing already
 *      gives one draw call per mesh-type across the whole valley, which is
 *      the same "stop paying per-tree" goal a manual merge chases, for a
 *      much smaller diff. `binIndex` is still carried on each placement
 *      (`Math.floor((z - BOUNDS.zMin) / TRUNK_BIN_SIZE_M)`) so a future
 *      pass can frustum-cull whole bins if this ever needs to go further.
 *      ponytail: upgrade to per-bin static merges (BufferGeometryUtils)
 *      only if a perf trace shows the palm draw calls costing real frame
 *      time, the same conditional posture world-v2-spec §7 V3 takes with
 *      chunked grass.
 *   2. Grass tufts (V1, boat-reactive) and fern clumps (T1 only, per §6's
 *      own "T1 near-field scatter"), from `vegetationScatter.ts`.
 *   3. Riverbank boulders (`rock_moss_set_01.glb`), also from
 *      `vegetationScatter.ts`.
 *
 * `heightSurface`'s `densityAt` is an honest standalone proxy (a smoothstep
 * band around the riverbank: bare mud at the waterline, fullest just past
 * it, thinning upslope), NOT the real baked `aAux.x` canopy mask
 * `splat.worker.ts` bakes for the terrain, which is private to
 * `Terrain.tsx`'s own load pipeline and not exported for reuse. ponytail:
 * wire this to the real mask (export it from Terrain.tsx, or have both
 * read a shared bake) the next time a lane owns that file; the gating
 * CONTRACT (reject below threshold / above 38 deg / inside the river) is
 * real and fully covered by vegetationScatter.test.ts regardless of which
 * density source feeds it.
 *
 * River clutter (task 7) needs real per-ghat anchor points, which are
 * P3-01a's own placement data (`landmarkBindings.ts`, not in this lane's
 * `deps`), so it is not available here. `riverClutterAnchors` below stands in with
 * evenly spaced river-spline samples along the settled corridor instead,
 * so the feature is real and functional the day `river-clutter.glb` ships,
 * without a cross-lane read this lane was never granted.
 *
 * V1's boat-reactive push (`applyBoatPush`) needs the hodi's live (x, z);
 * `Hodi.tsx` keeps that as private component state with no exported reader,
 * and this lane's `owns` list has nowhere to add one. `uBoatXZ` stays
 * parked (`BOAT_XZ_PARKED`, the same value world-v2-spec's own reduced-
 * motion posture uses) until a shared boat-position channel exists. The
 * shader math is real and correct; only the live feed is missing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { heavy } from "../../../lib/assetBase.ts";
import { deviceTier } from "../../deviceTier.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { applyAtmosphere } from "../atmosphere.ts";
import { applyWindSway, applyBoatPush, WIND_DESIGN_DEFAULT, BOAT_XZ_PARKED } from "../windSway.glsl.ts";
import { loadTerrainHeightmap } from "../terrainSurface.tsx";
import { terrainHeight } from "../terrainHeight.ts";
import { scatterVegetation, type ScatterKind, type ScatterSurface, type ScatterPoint } from "../vegetationScatter.ts";
import { BOUNDS, riverX, riverWidthAtZ, distanceToRiver, riverSpline } from "../valley.ts";
import { hashNoise, stringSeed } from "../hash.ts";

export const layer = { id: "vegetation", order: 20 };

// ── cull distances (world-v2-spec §7: "Manual userData.cullDist culling") ──
const CULL_BANYAN = 400;
const CULL_NEEM_PALM = 260;
const CULL_FERN = 60;
const CULL_ROCK = 90;
const CULL_GRASS = 45;

const TRUNK_BIN_SIZE_M = 90; // world-v2-spec §7: "trunks are merged per 90 m z-bin"
const ALPHA_TEST = 0.45;

function unit(seed: number): number {
  return (hashNoise(seed) + 1) / 2;
}

// ── the real heightmap (the same asset Terrain.tsx displaces from) ─────────

async function loadHeightSurface(): Promise<ScatterSurface> {
  const hm = await loadTerrainHeightmap();
  const heightAt = (x: number, z: number) => terrainHeight(x, z, hm);

  // A standalone density proxy (this file's own doc comment): bare at the
  // waterline, fullest a little past the bank, thinning upslope toward the
  // ridge. Real, deterministic, a function of the real river geometry, not
  // a hand-picked constant field.
  function densityAt(x: number, z: number): number {
    const d = distanceToRiver(x, z) - riverWidthAtZ(z) / 2;
    if (d < 0) return 0;
    const bank = THREE.MathUtils.smoothstep(d, 0, 6);
    const thinning = 1 - THREE.MathUtils.smoothstep(d, 20, 140);
    return bank * thinning;
  }

  return { heightAt, densityAt };
}

// ── a tiny GLTF loader/cache (no GLB is loaded anywhere else in v2 yet) ────

const gltfLoader = new GLTFLoader();
// online-tools-spec.md#A4: every kit GLB in heavy/world/models/ is packed
// through the pinned `npx gltfpack@1.2.0`, which meshopt-compresses by
// default. GLTFLoader refuses a compressed file with no decoder wired in.
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const gltfCache = new Map<string, Promise<THREE.Group>>();

function loadGltfScene(url: string): Promise<THREE.Group> {
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      );
    });
    gltfCache.set(url, pending);
  }
  return pending;
}

interface MeshPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** Every real (non-helper) mesh found in a loaded GLTF scene, in its own
 *  local space (world-v2-spec's kit scripts export trunks pre-oriented
 *  upright at the origin, the same convention `Terrain.tsx`'s heightmap
 *  decode leans on for "the asset already is what it says it is"). */
function meshPartsOf(scene: THREE.Group): MeshPart[] {
  const parts: MeshPart[] = [];
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mesh.geometry && material) parts.push({ geometry: mesh.geometry, material });
    }
  });
  return parts;
}

// -- a small procedural leaf-alpha mask (no atlas ships yet, see doc) -----

let leafAlphaTexture: THREE.Texture | null = null;
function getLeafAlphaTexture(): THREE.Texture {
  if (leafAlphaTexture) return leafAlphaTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 0.55, size * 0.46, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  leafAlphaTexture = texture;
  return texture;
}

/** A 2-plane "cross card" (two perpendicular quads), the standard billboard
 *  foliage/grass-blade technique. `aHeightFrac` is 0 at the base, 1 at the
 *  tip: windSway.glsl.ts's own "base pinned by height^2" contract. */
function makeCrossCardGeometry(width: number, height: number): THREE.BufferGeometry {
  const hw = width / 2;
  // prettier-ignore
  const positions = new Float32Array([
    // plane A (spans X)
    -hw, 0, 0,   hw, 0, 0,   hw, height, 0,
    -hw, 0, 0,   hw, height, 0,   -hw, height, 0,
    // plane B (spans Z, rotated 90 deg)
    0, 0, -hw,   0, 0, hw,   0, height, hw,
    0, 0, -hw,   0, height, hw,   0, height, -hw,
  ]);
  // prettier-ignore
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]);
  const heightFrac = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("aHeightFrac", new THREE.BufferAttribute(heightFrac, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function useInstanceCullShader(material: THREE.Material, cullDist: number): void {
  useEffect(() => {
    const previous = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previous(shader, renderer);
      shader.uniforms.uCullDist = { value: cullDist };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uCullDist;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n" +
            "#ifdef USE_INSTANCING\n" +
            "vec4 sangamInstOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);\n" +
            "if (distance(cameraPosition, sangamInstOrigin.xyz) > uCullDist) { transformed = vec3(0.0); }\n" +
            "#endif\n",
        );
    };
    material.needsUpdate = true;
  }, [material, cullDist]);
}

interface TrunkPlacement {
  id: string;
  kind: "banyan" | "neem" | "palm";
  x: number;
  y: number;
  z: number;
  rotationY: number;
  binIndex: number;
}

/** The three hero trunks (world-v2-spec §6, fixed roster) plus a scattered
 *  ambient palm tree-line along both banks. The population "merged per
 *  90 m z-bin" actually matters for (this file's own doc comment). Pure of
 *  React/three so it stays trivially readable; not exported/tested
 *  separately because it is presentation placement, not the T3 gating
 *  contract `vegetationScatter.ts` owns and IS unit-tested. */
function placeTrunks(surface: ScatterSurface): TrunkPlacement[] {
  const out: TrunkPlacement[] = [];
  const heroZ = BOUNDS.zMin + 90;
  const heroBank = riverX(heroZ) + riverWidthAtZ(heroZ) / 2 + 14;
  out.push({
    id: "banyan:hero",
    kind: "banyan",
    x: heroBank,
    y: surface.heightAt(heroBank, heroZ),
    z: heroZ,
    rotationY: 0,
    binIndex: Math.floor((heroZ - BOUNDS.zMin) / TRUNK_BIN_SIZE_M),
  });
  for (let i = 0; i < 2; i++) {
    const z = heroZ + 10 + i * 9;
    const x = riverX(z) + riverWidthAtZ(z) / 2 + 20 + i * 7;
    out.push({
      id: `neem:hero:${i}`,
      kind: "neem",
      x,
      y: surface.heightAt(x, z),
      z,
      rotationY: unit(stringSeed(`neem:${i}`)) * Math.PI * 2,
      binIndex: Math.floor((z - BOUNDS.zMin) / TRUNK_BIN_SIZE_M),
    });
  }

  const step = 42;
  for (let z = BOUNDS.zMin + 30; z < BOUNDS.zMax - 20; z += step) {
    for (const side of [-1, 1] as const) {
      const id = `palm:${side}:${Math.round(z)}`;
      if (unit(stringSeed(`${id}:skip`)) < 0.35) continue; // an irregular tree-line, not a fence
      const half = riverWidthAtZ(z) / 2;
      const x = riverX(z) + side * (half + 10 + unit(stringSeed(`${id}:off`)) * 22);
      const slopeOk = Math.abs(surface.heightAt(x + 0.5, z) - surface.heightAt(x - 0.5, z)) < 1.2; // a loose, cheap slope screen
      if (!slopeOk) continue;
      out.push({
        id,
        kind: "palm",
        x,
        y: surface.heightAt(x, z),
        z,
        rotationY: unit(stringSeed(`${id}:rot`)) * Math.PI * 2,
        binIndex: Math.floor((z - BOUNDS.zMin) / TRUNK_BIN_SIZE_M),
      });
    }
  }
  return out;
}

function riverClutterAnchors(): readonly { x: number; z: number }[] {
  const spline = riverSpline();
  const anchors: { x: number; z: number }[] = [];
  for (let i = 0; i < spline.length; i += 6) {
    anchors.push({ x: spline[i].x, z: spline[i].z });
  }
  return anchors;
}

// ── the scattered kinds (grass / fern / rock), via vegetationScatter.ts ────

const SCATTER_CONFIG: Record<ScatterKind, { cellSize: number; densityThreshold: number }> = {
  grass: { cellSize: 6, densityThreshold: 0.3 },
  fern: { cellSize: 12, densityThreshold: 0.5 },
  rock: { cellSize: 16, densityThreshold: 0.2 },
};

/** One InstancedMesh of `geometry`/`material`, positioned from `points`
 *  (either `ScatterPoint[]` or `TrunkPlacement[]`, both carry x/y/z and a
 *  rotationY). Shared by every drawn kind in this file. */
function Instances({
  points,
  geometry,
  material,
  depthMaterial,
  windPhase,
}: {
  points: readonly { x: number; y: number; z: number; rotationY: number; scale?: number; id: string }[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  depthMaterial?: THREE.MeshDepthMaterial;
  /** true when the geometry carries `aWindPhase` and needs it populated
   *  per-instance (swaying cards); omitted for static kit meshes. */
  windPhase?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const phaseAttribute = useMemo(() => {
    if (!windPhase) return null;
    const arr = new Float32Array(Math.max(1, points.length));
    points.forEach((p, i) => (arr[i] = unit(stringSeed(`${p.id}:phase`)) * Math.PI * 2));
    return new THREE.InstancedBufferAttribute(arr, 1);
  }, [points, windPhase]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (phaseAttribute) mesh.geometry.setAttribute("aWindPhase", phaseAttribute);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.scale.setScalar(p.scale ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [points, phaseAttribute, dummy]);

  if (points.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, points.length]}
      frustumCulled={false}
      castShadow
      receiveShadow
      customDepthMaterial={depthMaterial}
    />
  );
}

/** Builds a swaying-card material + its shadow-matching depth material,
 *  memoised on `color` (windSway/atmosphere are chained in once). */
function useCardMaterials(
  color: THREE.ColorRepresentation,
  windUniforms: Record<string, { value: unknown }>,
  boatUniforms: Record<string, { value: unknown }> | null,
  cullDist: number,
): { material: THREE.Material; depthMaterial: THREE.MeshDepthMaterial } {
  const pair = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, alphaMap: getLeafAlphaTexture(), alphaTest: ALPHA_TEST, roughness: 1 });
    applyWindSway(material, windUniforms);
    if (boatUniforms) applyBoatPush(material, boatUniforms);
    applyAtmosphere(material);

    const depthMaterial = new THREE.MeshDepthMaterial({ alphaMap: getLeafAlphaTexture(), alphaTest: ALPHA_TEST });
    applyWindSway(depthMaterial, windUniforms);
    if (boatUniforms) applyBoatPush(depthMaterial, boatUniforms);

    return { material, depthMaterial };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniforms objects are stable refs from the parent; only `color` should retrigger a rebuild
  }, [color]);
  useInstanceCullShader(pair.material, cullDist);
  return pair;
}

export default function Vegetation() {
  const reducedMotion = useReducedMotion();
  const tier = deviceTier();

  const [surface, setSurface] = useState<ScatterSurface | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadHeightSurface()
      .then((s) => !cancelled && setSurface(s))
      .catch((err: unknown) => console.error("Vegetation.tsx: heightmap load failed", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const [kitScenes, setKitScenes] = useState<{ banyanNeem: THREE.Group; palm: THREE.Group; fern: THREE.Group; rock: THREE.Group } | null>(null);
  const [clutterScene, setClutterScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadGltfScene(heavy("/world/models/banyan-neem.glb")),
      loadGltfScene(heavy("/world/models/palm.glb")),
      loadGltfScene(heavy("/world/models/fern_02.glb")),
      loadGltfScene(heavy("/world/models/rock_moss_set_01.glb")),
    ])
      .then(([banyanNeem, palm, fern, rock]) => !cancelled && setKitScenes({ banyanNeem, palm, fern, rock }))
      .catch((err: unknown) => console.error("Vegetation.tsx: kit GLB load failed", err));

    // world-v2-spec task 7: only wired if the file actually exists (P2-07c
    // ships without it in this build): a HEAD probe never throws past
    // this effect, so its absence is silent rather than a console error.
    fetch(heavy("/world/models/river-clutter.glb"), { method: "HEAD" })
      .then((res) => (res.ok && !cancelled ? loadGltfScene(heavy("/world/models/river-clutter.glb")) : null))
      .then((scene) => scene && !cancelled && setClutterScene(scene))
      .catch(() => {
        /* no river-clutter.glb yet: ambient, no claim, nothing to render */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy `useState` (not a ref): its value is stable across re-renders
  // (the setter is never called) but, unlike a ref, safe to read during
  // render. Pre-populated (not `{}`) so `applyWindSway`'s
  // `Object.assign(shader.uniforms, defaults, uniforms)` adopts THESE
  // object references as the compiled shader's own uniforms; mutating
  // `.value` in `useFrame` below then reaches the GPU without touching the
  // material again.
  const [windUniforms] = useState<Record<string, { value: unknown }>>(() => ({ uTime: { value: 0 }, uWind: { value: [...WIND_DESIGN_DEFAULT] } }));
  const [boatUniforms] = useState<Record<string, { value: unknown }>>(() => ({ uBoatXZ: { value: [...BOAT_XZ_PARKED] } }));

  useFrame((state) => {
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    windUniforms.uTime.value = t;
    // uBoatXZ stays parked (see this file's doc comment), written every
    // frame anyway so the day a real feed exists, only this one line
    // changes.
    boatUniforms.uBoatXZ.value = [...BOAT_XZ_PARKED];
  });

  const trunks = useMemo(() => (surface ? placeTrunks(surface) : []), [surface]);
  const grassPoints = useMemo(
    () => (surface ? scatterVegetation({ kind: "grass", bounds: BOUNDS, surface, tier, ...SCATTER_CONFIG.grass }) : []),
    [surface, tier],
  );
  const fernPoints = useMemo(
    () => (surface && tier === 1 ? scatterVegetation({ kind: "fern", bounds: BOUNDS, surface, tier, ...SCATTER_CONFIG.fern }) : []),
    [surface, tier],
  );
  const rockPoints = useMemo(
    () => (surface ? scatterVegetation({ kind: "rock", bounds: BOUNDS, surface, tier, ...SCATTER_CONFIG.rock }) : []),
    [surface, tier],
  );

  // Foliage crown cards: a handful of crossed cards in a rough sphere above
  // each hero trunk (banyan gets a bigger canopy than the two neems). Not
  // tier-gated by `vegetationScatter.ts` (trunks are a fixed, already
  // river/slope-safe roster, not the T3 density-mask contract): only the
  // grass/fern/rock scatter is.
  const foliagePoints = useMemo(() => {
    const out: ScatterPoint[] = [];
    for (const trunk of trunks) {
      if (trunk.kind === "palm") continue; // palm.glb ships its own frond cards
      const canopy = trunk.kind === "banyan" ? 26 : 12;
      const canopyR = trunk.kind === "banyan" ? 6.5 : 3.5;
      const canopyH = trunk.kind === "banyan" ? 9 : 6;
      for (let i = 0; i < canopy; i++) {
        const id = `${trunk.id}:foliage:${i}`;
        const a = unit(stringSeed(`${id}:a`)) * Math.PI * 2;
        const r = canopyR * (0.4 + unit(stringSeed(`${id}:r`)) * 0.6);
        out.push({
          id,
          kind: "grass",
          x: trunk.x + Math.cos(a) * r,
          y: trunk.y + canopyH * 0.6 + unit(stringSeed(`${id}:y`)) * canopyH * 0.5,
          z: trunk.z + Math.sin(a) * r,
          rotationY: unit(stringSeed(`${id}:rot`)) * Math.PI * 2,
          scale: 1 + unit(stringSeed(`${id}:s`)) * 0.6,
        });
      }
    }
    return out;
  }, [trunks]);

  const grassGeometry = useMemo(() => makeCrossCardGeometry(0.5, 0.8), []);
  useEffect(() => () => grassGeometry.dispose(), [grassGeometry]);
  const grass = useCardMaterials("#7a8c3f", windUniforms, boatUniforms, CULL_GRASS);

  const foliageGeometry = useMemo(() => makeCrossCardGeometry(2.2, 2.8), []);
  useEffect(() => () => foliageGeometry.dispose(), [foliageGeometry]);
  const foliage = useCardMaterials("#3c5a2e", windUniforms, null, CULL_BANYAN);

  const banyanNeemParts = useMemo(() => (kitScenes ? meshPartsOf(kitScenes.banyanNeem) : []), [kitScenes]);
  const palmParts = useMemo(() => (kitScenes ? meshPartsOf(kitScenes.palm) : []), [kitScenes]);
  const fernParts = useMemo(() => (kitScenes ? meshPartsOf(kitScenes.fern) : []), [kitScenes]);
  const rockParts = useMemo(() => (kitScenes ? meshPartsOf(kitScenes.rock) : []), [kitScenes]);
  const clutterParts = useMemo(() => (clutterScene ? meshPartsOf(clutterScene) : []), [clutterScene]);

  const clutterPoints = useMemo(() => {
    if (clutterParts.length === 0 || tier === 3) return [];
    const anchors = riverClutterAnchors();
    const out: { id: string; x: number; y: number; z: number; rotationY: number }[] = [];
    for (const a of anchors) {
      for (let i = 0; i < 6; i++) {
        const id = `clutter:${a.x.toFixed(1)}:${a.z.toFixed(1)}:${i}`;
        const angle = unit(stringSeed(`${id}:a`)) * Math.PI * 2;
        const r = 2 + unit(stringSeed(`${id}:r`)) * 3;
        out.push({ id, x: a.x + Math.cos(angle) * r, y: 0, z: a.z + Math.sin(angle) * r, rotationY: unit(stringSeed(`${id}:rot`)) * Math.PI * 2 });
      }
    }
    return out;
  }, [clutterParts.length, tier]);

  if (!surface) return null;

  return (
    <group name="vegetation">
      {(["banyan", "neem"] as const).map((kind) =>
        banyanNeemParts.map((part, partIdx) => {
          const positions = trunks.filter((t) => t.kind === kind);
          const material = applyAtmosphere(part.material.clone());
          return <TrunkKitInstances key={`${kind}:${partIdx}`} points={positions} geometry={part.geometry} material={material} cullDist={CULL_BANYAN} />;
        }),
      )}
      {palmParts.map((part, partIdx) => {
        const positions = trunks.filter((t) => t.kind === "palm");
        const material = applyAtmosphere(part.material.clone());
        return <TrunkKitInstances key={`palm:${partIdx}`} points={positions} geometry={part.geometry} material={material} cullDist={CULL_NEEM_PALM} />;
      })}

      {foliagePoints.length > 0 && <Instances points={foliagePoints} geometry={foliageGeometry} material={foliage.material} depthMaterial={foliage.depthMaterial} windPhase />}

      {grassPoints.length > 0 && <Instances points={grassPoints} geometry={grassGeometry} material={grass.material} depthMaterial={grass.depthMaterial} windPhase />}

      {fernParts.map((part, partIdx) => {
        const material = applyAtmosphere(part.material.clone());
        return <TrunkKitInstances key={`fern:${partIdx}`} points={fernPoints} geometry={part.geometry} material={material} cullDist={CULL_FERN} />;
      })}

      {rockParts.map((part, partIdx) => {
        const material = applyAtmosphere(part.material.clone());
        return <TrunkKitInstances key={`rock:${partIdx}`} points={rockPoints} geometry={part.geometry} material={material} cullDist={CULL_ROCK} />;
      })}

      {clutterParts.map((part, partIdx) => (
        <Instances key={`clutter:${partIdx}`} points={clutterPoints} geometry={part.geometry} material={part.material} />
      ))}

      <VegDataMirror grass={grassPoints.length + foliagePoints.length} fern={fernPoints.length} rock={rockPoints.length} />
    </group>
  );
}

/** `Instances` plus its own cull-distance shader patch, for the static
 *  (non-swaying) kit meshes: trunks, fern clumps, boulders. */
function TrunkKitInstances({
  points,
  geometry,
  material,
  cullDist,
}: {
  points: readonly { id: string; x: number; y: number; z: number; rotationY: number; scale?: number }[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  cullDist: number;
}) {
  useInstanceCullShader(material, cullDist);
  if (points.length === 0) return null;
  return <Instances points={points} geometry={geometry} material={material} />;
}

/** The hidden `data-veg-<kind>` DOM mirror `world-vegetation.spec.ts` reads
 *  the same `<Html style={{display:"none"}}>` convention `Fireflies.tsx`
 *  uses for its own count (a real DOM node the R3F canvas otherwise has
 *  none of). */
function VegDataMirror({ grass, fern, rock }: { grass: number; fern: number; rock: number }) {
  return (
    <Html style={{ display: "none" }}>
      <div aria-hidden="true" data-veg-grass={grass} data-veg-fern={fern} data-veg-rock={rock} />
    </Html>
  );
}
