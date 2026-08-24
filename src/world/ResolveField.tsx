import { useFrame } from "@react-three/fiber";
import { telemetry } from "./telemetry.ts";
import { fusedFix } from "./Trail.tsx";
import { resolvedFraction, stamp } from "./resolve.ts";

/**
 * THE RESOLUTION FIELD — computed, no longer drawn as dust (art-direction
 * doc §12 step 3).
 *
 * This used to render two instanced tetrahedron fields ("shards") — ground
 * haze across both flanks and structure dust sampled off Monuments/Corpus
 * geometry, ~26,000 instances between them. On a screenshot they are exactly
 * the "clouds of floating cyan and white triangles" the owner flagged: a
 * scatter with no data mapping of its own (a shard's colour names its OWNING
 * STRUCTURE's token, never a value), sitting on top of a corridor that now
 * has real data-driven furniture (Fixtures.tsx) doing that signalling job
 * with an actual meaning per fixture. Judged against the doc's own test —
 * "does it carry information in the new design, or is it leftover
 * decoration" — this was decoration, so it is gone, along with the
 * ground-haze/structure-dust target builders, the identity-matrix stamp and
 * the `DustField` component that rendered them.
 *
 * What is NOT decoration, and stays: `stamp()`'s per-frame ratchet and
 * `telemetry.resolvedFraction`. `stamp()` (resolve.ts) mutates its OWN
 * module-scope cell grid — it never read the dust attributes this component
 * used to also update, so removing the render changes nothing about what it
 * tracks. Monuments.tsx and Corpus.tsx each poll `triggerTimeOf()`
 * independently to run their own "rise" reveal, which only ever advances
 * because this component keeps calling `stamp()` every frame; and
 * `telemetry.resolvedFraction` is the HUD's real `FIX %` readout and the
 * resolve-chime cue in World.tsx.
 */
export function ResolveField(): null {
  useFrame((state) => {
    // Stamped from the FUSED estimate, never the raw fix and never
    // telemetry.x/z (ground truth) — see Trail.tsx's own comment on
    // `fusedFix` for why. `stamp()` is idempotent and cheap even when it
    // finds nothing new (the ratchet), so this can run every frame for free.
    stamp(fusedFix.x, fusedFix.z, telemetry.heading, state.clock.elapsedTime);
    telemetry.resolvedFraction = resolvedFraction();
  });
  return null;
}
