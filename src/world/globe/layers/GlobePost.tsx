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
import { BLOOM_THRESHOLD, BLOOM_INTENSITY } from "./layerKeys.ts";
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
        {/* render.md finding 1: SMAA now mounts for both tier 1 and tier 2 —
            `data-globe-composer-smaa` lets an e2e test confirm the pass is
            actually in the tree at the tier being tested, without a new
            globeStore.ts state just to expose it (same reasoning as the
            "bloom" marker beside it). */}
        <div data-globe-composer="bloom" data-globe-composer-smaa="1" aria-hidden />
      </Html>
      {/* render.md finding 1 (2026-09-30): tier 2 used to get NO antialiasing
          at all once this composer mounted — worse than tier 3, which never
          mounts a composer and keeps the canvas's own native MSAA
          (GlobeScene.tsx's `gl={{ antialias: true }}`, which a post-processed
          render bypasses). SMAA is the fix: same per-pass cost class as
          tier 1's own SMAA (postprocessing's SMAA is a fixed-cost screen-space
          pass, unlike `multisampling`, which scales with sample count on the
          composer's own offscreen target) — cheaper than raising
          `multisampling` above 0 for a second tier, so tier 2 gets the same
          pass tier 1 already had rather than a costlier composer-level MSAA. */}
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={BLOOM_THRESHOLD} intensity={BLOOM_INTENSITY} levels={tier === 1 ? BLOOM_LEVELS_T1 : BLOOM_LEVELS_T2} />
        <SMAA />
      </EffectComposer>
    </>
  );
}
