import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { Caustics } from "@react-three/drei";
import hullProfile from "./hullProfile.json" with { type: "json" };
import { createWaterShader, type WaterUniforms, type WaterWaveUniformName } from "./waterShader.glsl.ts";
import { sangamBasin, BOUNDS } from "./valley.ts";
import { deviceTier, type DeviceTier } from "../deviceTier.ts";
import { prefersReducedMotion } from "../reducedMotion.ts";

/**
 * world-v2-spec.md §7 "Water": three's `Reflector` (examples/jsm) with
 * `waterShader.glsl.ts`'s custom shader, "to get the mirror camera and RT
 * without forking drei" — plus, T1 only, drei `<Caustics frames={1}>` baked
 * once over the two calm sunlit patches (visual-catalogue.md W2).
 */

/** visual-catalogue.md W2: "drei `<Caustics>` baked once... T1 only. T2/T3
 *  skip it." Exported so this file's own tier gate and any later tier-
 *  matrix test both read the ONE list — `waterline.test.ts` pins this to
 *  exactly `['T1']`. */
export const CAUSTICS_TIERS = ["T1"] as const;

const TIER_LABEL: Record<DeviceTier, (typeof CAUSTICS_TIERS)[number] | "T2" | "T3"> = { 1: "T1", 2: "T2", 3: "T3" };

// hullProfile.json is the single source (world-v2-spec §6, master-plan M44)
// — these two scalars are DERIVED from its own samples, never a second
// hand-typed hull dimension.
const HULL_LENGTH: number = hullProfile.length;
const HULL_MAX_HALF_BEAM: number = Math.max(...hullProfile.samples.map(([, halfBeam]) => halfBeam));

/** T1 desktop: full planar mirror pass. T2/T3: sky/PMREM reflect only
 *  (world-v2-spec §7's per-tier water row) — expressed as one continuous
 *  `uPlanarMix` rather than two shader variants. */
const PLANAR_MIX_BY_TIER: Record<DeviceTier, number> = { 1: 1, 2: 0, 3: 0 };
/** world-v2-spec §7: "Planar reflection at half-res on T1." */
const T1_PLANAR_RESOLUTION_SCALE = 0.5;

const WATER_Y = 0;
/** The full valley extent (world-v2-spec §3) — the water plane covers it
 *  all; only the carved river channel (P2-05's terrain, outside this
 *  lane's `owns`) ever sits below `WATER_Y`, so nothing else needs to mask
 *  this plane's shape. */
const WATER_EXTENT = BOUNDS.xMax - BOUNDS.xMin;

/** world-v2-spec §7: "the Sangam basin bed and the bed under the keystone
 *  bridge." The bridge sits upstream of the basin centre; a fixed offset
 *  here (rather than importing the keystone-bridge landmark's own
 *  placement, which is a different lane's `owns`) keeps the two caustics
 *  patches inside this file. */
const BRIDGE_PATCH_Z_OFFSET = -42;
const CAUSTICS_PATCH_RADIUS = 26;
const CAUSTICS_RESOLUTION_DEFAULT = 1024;
/** visual-catalogue.md W2's own risk note: "drop to `resolution={512}` if
 *  it is tight." */
const CAUSTICS_RESOLUTION_LOW_VRAM = 512;

export interface WaterProps {
  /** Overridden once P2-05's terrain lane publishes the real heightmap/flow
   *  textures; a flat-plane fallback otherwise (waterShader.glsl.ts's
   *  `createFallbackTexture`). */
  heightMap?: THREE.Texture;
  flowMap?: THREE.Texture;
  /** Shared with `Hodi.tsx` so the water's own swell and the hull's
   *  waterline stripe move in lockstep (visual-catalogue.md W1). Defaults
   *  to this component's own uniforms when no shared object is supplied
   *  yet — a later integration lane threads the real shared object through. */
  waveUniforms?: Partial<Record<WaterWaveUniformName, THREE.IUniform<number>>>;
  /** visual-catalogue.md W2's VRAM-tight fallback. */
  lowVram?: boolean;
}

function disposeReflector(reflector: Reflector): void {
  reflector.geometry.dispose();
  (reflector.material as THREE.Material).dispose();
}

export function Water({ heightMap, flowMap, waveUniforms, lowVram = false }: WaterProps) {
  const tier = deviceTier();

  const reflector = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(WATER_EXTENT, WATER_EXTENT);
    const shader = createWaterShader({ hullLength: HULL_LENGTH, hullMaxHalfBeam: HULL_MAX_HALF_BEAM });
    if (heightMap) shader.uniforms.uHeightMap.value = heightMap;
    if (flowMap) shader.uniforms.uFlowMap.value = flowMap;
    if (waveUniforms) Object.assign(shader.uniforms, waveUniforms);
    shader.uniforms.uWaterY.value = WATER_Y;
    shader.uniforms.uPlanarMix.value = PLANAR_MIX_BY_TIER[tier];

    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 2);
    const resScale = tier === 1 ? T1_PLANAR_RESOLUTION_SCALE : 1;
    const width = typeof window === "undefined" ? 1024 : window.innerWidth;
    const height = typeof window === "undefined" ? 768 : window.innerHeight;

    const r = new Reflector(geometry, {
      clipBias: 0.003,
      textureWidth: Math.max(1, Math.round(width * dpr * resScale)),
      textureHeight: Math.max(1, Math.round(height * dpr * resScale)),
      shader,
    });
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, WATER_Y, BOUNDS.zMin + WATER_EXTENT / 2);
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heightMap/flowMap/waveUniforms are three.js identities the caller controls; re-running on tier is what actually matters here.
  }, [tier]);

  useEffect(() => disposeReflector(reflector), [reflector]);

  useFrame(({ camera }, delta) => {
    const uniforms = (reflector.material as THREE.ShaderMaterial).uniforms as unknown as WaterUniforms;
    if (!prefersReducedMotion()) uniforms.uTime.value += delta;
    // world-v2-spec §7: "The mirror pass renders layers 0 + 4 only, with
    // the decimated terrain and no particles." Reflector creates its
    // reflection camera lazily inside its own render; `getReflectionCamera`
    // is the one public hook to constrain it without forking Reflector
    // (M67: "zero new runtime dependencies... the plan's owned files win").
    if (tier === 1) {
      const reflectionCamera = reflector.getReflectionCamera(camera);
      reflectionCamera.layers.disableAll();
      reflectionCamera.layers.enable(0);
      reflectionCamera.layers.enable(4);
    }
  });

  const basin = sangamBasin();
  const causticsResolution = lowVram ? CAUSTICS_RESOLUTION_LOW_VRAM : CAUSTICS_RESOLUTION_DEFAULT;
  const showCaustics = (CAUSTICS_TIERS as readonly string[]).includes(TIER_LABEL[tier]);

  return (
    <>
      <primitive object={reflector} />
      {showCaustics && (
        <>
          <Caustics
            frames={1}
            resolution={causticsResolution}
            causticsOnly={false}
            backside={false}
            position={[basin.x, WATER_Y - 0.15, basin.z]}
            lightSource={[7.2, 20, 38.8]}
            color="#fff2d6"
          >
            {/* The caster: a stand-in for the water's own rippled surface —
                drei's Caustics refracts light THROUGH its children onto its
                own internal catcher plane (the bed), so this must be a real,
                visible, refractive surface, not an invisible placeholder. */}
            <mesh rotation-x={-Math.PI / 2}>
              <circleGeometry args={[CAUSTICS_PATCH_RADIUS, 24]} />
              <meshPhysicalMaterial transmission={1} roughness={0.1} thickness={0.3} ior={1.1} />
            </mesh>
          </Caustics>
          <Caustics
            frames={1}
            resolution={causticsResolution}
            causticsOnly={false}
            backside={false}
            position={[0, WATER_Y - 0.15, basin.z + BRIDGE_PATCH_Z_OFFSET]}
            lightSource={[7.2, 20, 38.8]}
            color="#fff2d6"
          >
            <mesh rotation-x={-Math.PI / 2}>
              <circleGeometry args={[CAUSTICS_PATCH_RADIUS * 0.6, 24]} />
              <meshPhysicalMaterial transmission={1} roughness={0.1} thickness={0.3} ior={1.1} />
            </mesh>
          </Caustics>
        </>
      )}
    </>
  );
}
