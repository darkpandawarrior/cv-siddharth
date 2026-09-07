import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { TallStructure } from "./city.ts";
import { westStructures } from "./districtWest.ts";
import { eastStructures } from "./corpusData.ts";
import { telemetry } from "./telemetry.ts";
import { TrackFilter, meanError, rawFix, stepDistance, type Fix } from "./gps.ts";

/**
 * The location lens — computed, no longer drawn as its own geometry
 * (art-direction doc §12 step 3).
 *
 * This used to render two `<Line>`s: the scattered raw GPS fix and the
 * filtered track holding its line against it. Night Survey's own read-line
 * (Wake.tsx's Layer A/B, Terrain.tsx's Layer C — a transverse cursor plus a
 * decaying wake plus a permanent worn-track groove) now draws "where the
 * car is and has been" far more legibly than a thin raw/fused line pair
 * ever did, and a flagged defect of the raw line specifically — "a busy
 * tangle near the car on mobile" — is gone with it. Its colour (`c.warn`,
 * `#f0883e`) was also outside §2's locked palette.
 *
 * The GPS SIMULATION ITSELF is not decoration — it is the site's headline
 * claim (GPS accuracy 50% to 95% on Doori) made operable, and
 * `fusedFix`/`telemetry.rawError`/`telemetry.fusedError`/
 * `telemetry.odometer` all still feed real consumers (ResolveField.tsx's
 * `stamp()` calls, the HUD's accuracy readout). So this file keeps computing
 * exactly what it always did — the fix, the filter, the running error means
 * — and only the two `<Line>`s and the point ring-buffers that fed them are
 * gone.
 *
 * Sampled at a fixed 10Hz rather than per frame: a real receiver reports at
 * roughly this rate, and per-frame sampling would make the "fix" suspiciously
 * smooth.
 */

const SAMPLE_INTERVAL_S = 0.1;
// At 10Hz, ~4s of history is enough for the running error means below
// without the buffer growing unbounded.
const MAX_POINTS = 44;

/** A jump further than this between samples is a respawn or a teleport, not
 *  driving — the estimate resets rather than treating it as real motion. */
const TELEPORT_M = 12;

/** Scale error on the inertial displacement — a real IMU under-reads slightly
 *  and that drift is precisely what the fix is there to correct. */
const IMU_BIAS = 0.97;

/** Samples needed before the accuracy readout means anything. ~3 seconds. */
const MIN_SAMPLES_FOR_STATS = 30;

/** The world's tall structures, both flanks — the real skyline now, not a
 *  fixed set this module used to invent from projectStats itself. Every
 *  employer block, project tower, chess-ridge cluster and corpus pillar
 *  tall enough to matter is in here, so the canyon effect degrades the raw
 *  trail near whatever a visitor can actually see casting the shadow. */
function structures(): TallStructure[] {
  return [...westStructures(), ...eastStructures()];
}

/**
 * The fused GPS estimate, in world space — the ONLY thing ResolveField.tsx
 * is allowed to stamp the city from.
 *
 * This is the tie back to gps.ts that makes "the world resolves as you
 * drive" honest rather than decorative: a raw fix spikes on purpose (see
 * gps.ts's SPIKE_M), and if resolution keyed off the raw trail, or off
 * telemetry.x/z (ground truth — the craft doesn't get to cheat), a single
 * bad sample two lanes over would resolve a district nobody actually
 * reached. Only the filtered estimate — the one drawn as the clean trail,
 * the one the HUD's accuracy readout is proud of — is trusted enough to
 * draw the map too.
 *
 * Mutated in place every accepted sample, never reassigned — same contract
 * as telemetry.ts's own fields: hold the one reference, no per-frame
 * allocation.
 */
export const fusedFix: Fix = { x: 0, z: 0 };

export function Trail(): null {
  const towers = useMemo(structures, []);
  const filter = useMemo(() => new TrackFilter(), []);

  const clock = useRef(0);
  const sample = useRef(0);
  const lastTruth = useRef<Fix>({ x: 0, z: 0 });
  const lastFused = useRef<Fix>({ x: 0, z: 0 });
  const rawErrors = useRef<number[]>([]);
  const fusedErrors = useRef<number[]>([]);

  useFrame((_, delta) => {
    clock.current += delta;
    if (clock.current < SAMPLE_INTERVAL_S) return;
    const dt = clock.current;
    clock.current = 0;

    // ...and only while actually moving. A parked craft still receives noisy
    // fixes, so sampling at a standstill drew a dense scribble of jitter around
    // the car — technically a correct depiction of GPS noise, and visually just
    // a mess that buried the thing the trails exist to show.
    if (Math.abs(telemetry.speed) < 0.6) return;

    const truth: Fix = { x: telemetry.x, z: telemetry.z };
    const moved = stepDistance(lastTruth.current, truth);

    // Respawn, or a mode change that moved the craft a long way: drop the
    // history instead of connecting the two positions with a streak, and do
    // not count the jump as distance travelled.
    if (moved > TELEPORT_M) {
      lastTruth.current = truth;
      lastFused.current = { ...truth };
      fusedFix.x = truth.x;
      fusedFix.z = truth.z;
      filter.reset();
      return;
    }
    telemetry.odometer += moved;

    const fix = rawFix(truth, sample.current++, towers);
    // Dead reckoning from MEASURED MOTION, not from the estimate's own history.
    //
    // This is what an IMU actually gives you: the vehicle's real displacement
    // since the last sample, with a small bias. Integrating a heading and a
    // speed off the previous ESTIMATE instead makes the prediction free-run —
    // its error compounds every sample with nothing observing it, and the track
    // wandered off to 1% accuracy in the browser while the unit tests stayed
    // green, because they fed it a clean prediction.
    //
    // IMU_BIAS is what keeps this honest: dead reckoning is not free, it drifts,
    // and the filter has to be the thing that keeps it anchored.
    const measuredDx = (truth.x - lastTruth.current.x) * IMU_BIAS;
    const measuredDz = (truth.z - lastTruth.current.z) * IMU_BIAS;
    const predicted: Fix = {
      x: lastFused.current.x + measuredDx,
      z: lastFused.current.z + measuredDz,
    };
    const maxJump = Math.max(1.5, Math.abs(telemetry.speed) * dt * 2.5);
    const fused = filter.update(fix, predicted, maxJump);
    lastFused.current = { ...fused };
    lastTruth.current = truth;
    fusedFix.x = fused.x;
    fusedFix.z = fused.z;

    rawErrors.current.push(Math.hypot(fix.x - truth.x, fix.z - truth.z));
    fusedErrors.current.push(Math.hypot(fused.x - truth.x, fused.z - truth.z));
    if (rawErrors.current.length > MAX_POINTS) {
      rawErrors.current.shift();
      fusedErrors.current.shift();
    }
    // Only report once there is enough of a track to average. On the first
    // few samples the mean is dominated by whichever way the noise happened to
    // fall, so the readout would swing wildly — and, worse, could show the
    // fused track losing to the raw one purely by chance, which is exactly the
    // claim the readout exists to support.
    if (rawErrors.current.length >= MIN_SAMPLES_FOR_STATS) {
      telemetry.rawError = meanError(rawErrors.current);
      telemetry.fusedError = meanError(fusedErrors.current);
    }
  });

  // Nothing left to draw — see the module comment. World.tsx still mounts
  // this component unconditionally, for the same reason ResolveField.tsx's
  // own now-invisible half does: the GPS simulation and its telemetry writes
  // have to run every frame regardless of what (if anything) renders.
  return null;
}
