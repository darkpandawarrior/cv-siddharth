import { Html } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA } from "@react-three/postprocessing";

// WAVE 7 LANE V2: the globe's first composer. Plain Bloom, not
// SelectiveBloom — a mesh-level Selection can't isolate city lights because
// they're mixed into the SAME earth shader as the day side
// (earthImageryShader.ts), so the isolation has to happen in the shader's
// own luminance instead: uNightGain pushes only the night-lights term past
// 1.0, and luminanceThreshold here is set at that same floor, so only pixels
// the shader deliberately over-brightened ever bloom. Left at
// EffectComposer's own default `frameBufferType` (three's HalfFloatType) —
// a plain 8-bit LDR target would clip the night term at 1.0 before Bloom
// ever saw it exceed it.
//
// Lazy, and mounted from GlobeScene.tsx only for style "imagery" at tier
// 1/2 (living-earth's `check-budget`: this file and its postprocessing
// imports must stay OUT of the Globe shell chunk). Tier 3 never mounts this
// component at all — that IS its "no composer" case, so nothing here has to
// branch on tier 3.
const BLOOM_THRESHOLD = 1.0; // matches uNightGain's floor exactly (earthImageryShader.ts)
const BLOOM_INTENSITY = 0.6;
const BLOOM_LEVELS_T1 = 6;
const BLOOM_LEVELS_T2 = 4;

export interface GlobePostProps {
  tier: 1 | 2;
}

export default function GlobePost({ tier }: GlobePostProps) {
  return (
    <>
      {/* e2e probe (globe-lanes.md ownership rule: no new globeStore.ts/
          GlobeScene.tsx state just to expose this) — a zero-footprint marker
          a test can query for tier 3's "no composer" case, which is simply
          this component never mounting. */}
      <Html center style={{ pointerEvents: "none" }} wrapperClass="sr-only">
        <div data-globe-composer="bloom" aria-hidden />
      </Html>
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={BLOOM_THRESHOLD} intensity={BLOOM_INTENSITY} levels={tier === 1 ? BLOOM_LEVELS_T1 : BLOOM_LEVELS_T2} />
        {tier === 1 ? <SMAA /> : <></>}
      </EffectComposer>
    </>
  );
}
