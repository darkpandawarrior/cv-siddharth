import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { projectStats } from "../data/projectStats.ts";
import { TERRAIN } from "./worldData.ts";
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
const MAX_POINTS = 160;
/** Trails float just above the surface so they are not z-fighting the ground. */
const TRAIL_Y = TERRAIN.mainland.groundY + 0.06;

/** Scale error on the inertial displacement — a real IMU under-reads slightly
 *  and that drift is precisely what the fix is there to correct. */
const IMU_BIAS = 0.97;

/** Samples needed before the accuracy readout means anything. ~3 seconds. */
const MIN_SAMPLES_FOR_STATS = 30;

/** The world's tall structures — the same monuments, so the canyon effect lands
 *  where a visitor can see the cause. */
function structures(): Fix[] {
  const entries = Object.entries(projectStats);
  return entries.map(([, ], i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const depth = TERRAIN.mainland.z1 - TERRAIN.mainland.z0;
    return {
      x: side * (TERRAIN.mainland.halfWidth - 4.5),
      z: TERRAIN.mainland.z0 + depth * (0.3 + Math.floor(i / 2) * 0.28),
    };
  });
}

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

    // Only trail on the ground: a GPS track through the air or underwater is
    // not the story, and it would clutter the sky.
    if (telemetry.mode !== "wheels") return;
    // ...and only while actually moving. A parked craft still receives noisy
    // fixes, so sampling at a standstill drew a dense scribble of jitter around
    // the car — technically a correct depiction of GPS noise, and visually just
    // a mess that buried the thing the trails exist to show.
    if (Math.abs(telemetry.speed) < 0.6) return;

    const truth: Fix = { x: telemetry.x, z: telemetry.z };
    const moved = stepDistance(lastTruth.current, truth);
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
        lineWidth={1.4}
        transparent
        opacity={0.45}
      />
      {/* Fused: the line the app actually draws for a driver. */}
      <Line
        ref={fusedRef as never}
        points={fusedPoints.current}
        color={c.signal}
        lineWidth={2.6}
        transparent
        opacity={0.9}
      />
    </>
  );
}
