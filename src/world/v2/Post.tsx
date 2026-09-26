import { forwardRef, useMemo, type ReactNode } from "react";
import { Bloom, EffectComposer, SMAA } from "@react-three/postprocessing";
import type { DeviceTier } from "../deviceTier.ts";
import { GradeEffect, type GradeLook } from "./Grade.ts";

// world-v2-spec §7 "Post", step 3: BloomEffect({mipmapBlur:true,
// luminanceThreshold:.9, intensity:.55}) — the same on every tier that
// keeps bloom at all; only the mip count (§8's tier table) changes.
const BLOOM_THRESHOLD = 0.9;
const BLOOM_INTENSITY = 0.55;
const BLOOM_LEVELS_T1 = 6;
const BLOOM_LEVELS_T2 = 4;

const GradePass = forwardRef<GradeEffect, { look: GradeLook }>(function GradePass({ look }, ref) {
  // Recreated (not mutated in place) when `look` changes — the same
  // pattern Blueprint3D's AsciiPass/RipplePass use for a props-driven
  // custom Effect; the toggle is rare (the `L` key), so this is cheaper to
  // reason about than a reactive uniform-sync effect.
  const effect = useMemo(() => {
    const grade = new GradeEffect();
    grade.setLook(look);
    return grade;
  }, [look]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});

export interface PostProps {
  tier: DeviceTier;
  look: GradeLook;
  /** P3-01c's raymarched volumetric pass (world-v2-spec §7 point 2), T1
   *  only. This lane leaves the composer slot in the right position but
   *  does not build the pass — pass `<primitive object={volumetricPass} />`
   *  once P3-01c exists. Ignored on T2/T3 (analytic fog only, already in
   *  atmosphere.ts). */
  volumetric?: ReactNode;
}

/**
 * world-v2-spec §7 "Post" + §8's tier table, `<Canvas flat>`'s composer:
 * RenderPass (added automatically by `<EffectComposer>`), the volumetric
 * slot, Bloom, SMAA and `GradeEffect`, in the reference order. T1 gets every
 * pass; T2 drops SMAA and halves the bloom mip count; T3 drops bloom and
 * the volumetric slot, keeping Grade alone — the Survey-lens look swap
 * (open-data-spec §5) has to work on every tier, so it is the one pass no
 * tier ever removes.
 */
export function Post({ tier, look, volumetric }: PostProps) {
  if (tier === 3) {
    return (
      <EffectComposer multisampling={0}>
        <GradePass look={look} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      {/* EffectComposer's children typing wants a real element on every
          branch (Blueprint3D's own note) — an empty fragment is the no-op,
          not a conditionally-omitted child. */}
      {tier === 1 && volumetric ? <>{volumetric}</> : <></>}
      <Bloom
        mipmapBlur
        luminanceThreshold={BLOOM_THRESHOLD}
        intensity={BLOOM_INTENSITY}
        levels={tier === 1 ? BLOOM_LEVELS_T1 : BLOOM_LEVELS_T2}
      />
      {tier === 1 ? <SMAA /> : <></>}
      <GradePass look={look} />
    </EffectComposer>
  );
}
