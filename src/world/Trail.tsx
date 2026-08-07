import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { CITY, type TallStructure } from "./city.ts";
import { westStructures } from "./districtWest.ts";
import { eastStructures } from "./corpusData.ts";
import { telemetry } from "./telemetry.ts";
import { worldPalette } from "./palette.ts";
import { TrackFilter, meanError, rawFix, stepDistance, type Fix } from "./gps.ts";

/**
 * The location lens, drawn.
 *
 * Two trails follow the craft. The scattered one is what a raw GPS fix reports
 * — noisy in the open, falling apart next to the monuments, occasionally
 * spiking somewhere impossible. The clean one is the same signal after the
 * staged filter in gps.ts: spikes rejected, gaps dead-reckoned, the rest
 * smoothed. Drive past a tower and you can watch the raw track scatter while
 * the filtered one holds its line.
 *
 * This is the site's headline claim — GPS accuracy 50% to 95% on Mileway —
 * turned into something a visitor operates rather than reads. The numbers in
 * the HUD are computed from these very samples, not quoted from the CV.
 *
 * Sampled at a fixed 10Hz rather than per frame: a real receiver reports at
 * roughly this rate, per-frame sampling would make the "fix" suspiciously
 * smooth, and it keeps the buffers small.
 */

const SAMPLE_INTERVAL_S = 0.1;
// 44, not 160. At 10Hz that is ~4 seconds of history instead of ~16, and the
// difference is not subtle: a 160-point trail after a few hundred metres of
// driving is a scribble covering the entire map, and because it also spanned
// every respawn it drew long straight streaks from wherever you died back to
// spawn. It read as a rendering bug, not as a GPS track. Short enough to say
// "here is where you just were" and then get out of the way.
const MAX_POINTS = 44;

/** A jump further than this between samples is a respawn or a teleport, not
 *  driving — the trail restarts rather than drawing a line across the world. */
const TELEPORT_M = 12;
/** Trails float just above the surface so they are not z-fighting the ground.
 *  Reads CITY.groundY (city.ts), not worldData.ts's TERRAIN — city.ts is the
 *  one shared coordinate source every district and the ground itself derive
 *  from now, and this module has no other reason to import worldData.ts. */
const TRAIL_Y = CITY.groundY + 0.06;

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

export function Trail(): JSX.Element {
  const c = worldPalette();
  const towers = useMemo(structures, []);
  const filter = useMemo(() => new TrackFilter(), []);

  // Ring buffers, pre-filled at the origin so the Line geometries never have to
  // be rebuilt — drei's <Line> rebuilds on a length change, and a trail that
  // reallocated every 100ms would stutter.
  const rawPoints = useRef<[number, number, number][]>(
    Array.from({ length: MAX_POINTS }, () => [0, TRAIL_Y, 0]),
  );
  const fusedPoints = useRef<[number, number, number][]>(
    Array.from({ length: MAX_POINTS }, () => [0, TRAIL_Y, 0]),
  );
  const rawRef = useRef<{ geometry: { setPositions: (p: number[]) => void } } | null>(null);
  const fusedRef = useRef<{ geometry: { setPositions: (p: number[]) => void } } | null>(null);

  const clock = useRef(0);
  const sample = useRef(0);
  const lastTruth = useRef<Fix>({ x: 0, z: 0 });
  const lastFused = useRef<Fix>({ x: 0, z: 0 });
  const rawErrors = useRef<number[]>([]);
  const fusedErrors = useRef<number[]>([]);
  const flat = useRef<number[]>(new Array(MAX_POINTS * 3).fill(0));

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
      for (let i = 0; i < MAX_POINTS; i++) {
        rawPoints.current[i] = [truth.x, TRAIL_Y, truth.z];
        fusedPoints.current[i] = [truth.x, TRAIL_Y + 0.02, truth.z];
      }
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

    rawPoints.current.shift();
    rawPoints.current.push([fix.x, TRAIL_Y, fix.z]);
    fusedPoints.current.shift();
    fusedPoints.current.push([fused.x, TRAIL_Y + 0.02, fused.z]);

    for (let i = 0; i < MAX_POINTS; i++) {
      const p = rawPoints.current[i];
      flat.current[i * 3] = p[0];
      flat.current[i * 3 + 1] = p[1];
      flat.current[i * 3 + 2] = p[2];
    }
    rawRef.current?.geometry.setPositions([...flat.current]);
    for (let i = 0; i < MAX_POINTS; i++) {
      const p = fusedPoints.current[i];
      flat.current[i * 3] = p[0];
      flat.current[i * 3 + 1] = p[1];
      flat.current[i * 3 + 2] = p[2];
    }
    fusedRef.current?.geometry.setPositions([...flat.current]);
  });

  return (
    <>
      {/* Raw: dim, warm, and visibly wrong. */}
      <Line
        ref={rawRef as never}
        points={rawPoints.current}
        color={c.warn}
        lineWidth={1}
        transparent
        opacity={0.25}
      />
      {/* Fused: the line the app actually draws for a driver. */}
      <Line
        ref={fusedRef as never}
        points={fusedPoints.current}
        color={c.signal}
        lineWidth={1.8}
        transparent
        opacity={0.55}
      />
    </>
  );
}
