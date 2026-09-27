/**
 * The v1 to v2 carry-over: the GPS location lens (master-plan.md#M6, #M6's
 * CRAFT-5 resolution; idea-atlas.md defect 5, WORLD-2 "gps raw wake";
 * living-ledger-spec.md's own v1-parity table).
 *
 * v1's `gps.ts` is Doori's headline claim made operable: a raw fix that
 * scatters against a fused (dead-reckoned + Kalman-smoothed) estimate that
 * holds its line, `accuracyPct` scored on both. World-v2-spec never
 * mentioned it, so a swap PR deleting `src/world/*` would have quietly
 * dropped the site's most direct proof of the 50% to 95% number — M6's
 * resolution is this file: the hodi's second, raw wake beside its fused
 * one, toggled by a lens so it is shown, never inflicted on the driver.
 * Steering itself (`input.ts` -> `driveSpline.ts`'s `step`) is completely
 * untouched by this file — it only ever READS the shared `input` singleton,
 * the same one `Hodi.tsx` reads, never writes to it.
 *
 * ponytail: `Hodi.tsx` (owned by an earlier lane, not this one) keeps the
 * hodi's live (x, z) in a private `useRef`, with no shared position
 * singleton any sibling layer can read (unlike v1, where `telemetry.ts`
 * publishes `x`/`z` for exactly this reason — see `Trail.tsx`'s own doc
 * comment). Rather than plumb a new singleton through `WorldV2.tsx`/
 * `Hodi.tsx` (neither is in this lane's `owns`, so editing them fails G2),
 * this lens runs its OWN copy of `driveSpline.ts`'s pure `step()`, fed by
 * the exact same shared `input` singleton and the exact same spawn
 * (`spawnPose("day", 90).pos[2]` — `WorldV2.tsx`'s own `spawn` `useMemo`
 * recomputes once `useNowModel` resolves, but `Hodi.tsx`'s `spawnZ` prop is
 * only ever read inside a `useRef` LAZY initializer, which never re-runs on
 * a later prop change — so the hodi's real spawn is permanently locked to
 * this exact default on every load, and this lens's mirror matches it
 * exactly). Two independent calls to the same pure function, fed the same
 * inputs every frame (`useFrame` hands every subscriber the same `delta`
 * for a given tick), track each other exactly rather than merely
 * approximately. If a future lane ever publishes a real shared hodi-position
 * singleton, this mirror should read that instead of re-simulating.
 *
 * `structures` (gps.ts's canyon degradation near tall buildings) is `[]`
 * here: the Sangam's own landmark towers (P3-01a/P3-01f, keystone, ghats,
 * deepmal) are a different lane's data and not in this lane's `deps`, so
 * there is nothing yet to degrade the fix near. Accuracy still varies with
 * spike noise and dead-reckoning drift alone — upgrade to real landmark
 * coordinates once a lane exposes them.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import { TrackFilter, meanError, accuracyPct, rawFix, stepDistance, type Fix } from "../../gps.ts";
import type { TallStructure } from "../../city.ts";
import { input } from "../../input.ts";
import { spawnState, step, type HodiState } from "../driveSpline.ts";
import { spawnPose } from "../spawn.ts";
import { worldPalette } from "../../palette.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";

export const layer = { id: "gps-lens", order: 62 };

/** No v2 landmark data is wired into this lens yet — see this file's own
 *  doc comment. */
const STRUCTURES: TallStructure[] = [];

/** v1 Trail.tsx's own cadence: a real receiver reports at roughly this
 *  rate, and per-frame sampling would make the "fix" suspiciously smooth. */
const SAMPLE_INTERVAL_S = 0.1;
/** A jump further than this between samples is a respawn, not driving. */
const TELEPORT_M = 12;
/** ~6s of history at 10Hz — enough to read as a wake, never unbounded. */
const MAX_TRAIL_POINTS = 60;
const WATER_Y = 0.05; // clears z-fighting with Water.tsx's own surface at y=0
const TOGGLE_KEY = "g";

type Point = [number, number, number];

function pushPoint(trail: Point[], p: Fix): void {
  trail.push([p.x, WATER_Y, p.z]);
  if (trail.length > MAX_TRAIL_POINTS) trail.shift();
}

const INITIAL_SPAWN_Z = spawnPose("day", 90).pos[2];

export default function GpsLens(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const palette = worldPalette();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== TOGGLE_KEY) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select|button)$/i.test(target.tagName)) return;
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const hodiState = useRef<HodiState>(spawnState(INITIAL_SPAWN_Z));
  const filter = useMemo(() => new TrackFilter(), []);
  const sampleClock = useRef(0);
  const sampleIndex = useRef(0);
  const lastTruth = useRef<Fix>({ x: hodiState.current.x, z: hodiState.current.z });
  const lastFused = useRef<Fix>({ x: hodiState.current.x, z: hodiState.current.z });
  const rawErrors = useRef<number[]>([]);
  const rawTrail = useRef<Point[]>([]);
  const fusedTrail = useRef<Point[]>([]);
  const [tick, setTick] = useState(0);

  useFrame((_, rawDelta) => {
    // Steering itself keeps running even while the lens is closed (the
    // hodi's real motion never depends on this file), but sampling only
    // costs anything while the lens is open — the same "shown, not
    // inflicted" posture M6's resolution asks for.
    const dt = Math.min(rawDelta, 1 / 20);
    hodiState.current = step(hodiState.current, { steer: input.steer, throttle: input.throttle }, dt, { reducedMotion });
    if (!open) return;

    sampleClock.current += dt;
    if (sampleClock.current < SAMPLE_INTERVAL_S) return;
    const sampleDt = sampleClock.current;
    sampleClock.current = 0;

    // v1 Trail.tsx's own guard: a stationary hodi still receives noisy fixes,
    // and sampling those draws a dense, meaningless scribble around a boat
    // that hasn't moved rather than a legible wake.
    if (Math.abs(hodiState.current.speed) < 0.6) return;

    const truth: Fix = { x: hodiState.current.x, z: hodiState.current.z };
    const moved = stepDistance(lastTruth.current, truth);
    if (moved > TELEPORT_M) {
      lastTruth.current = truth;
      lastFused.current = { ...truth };
      filter.reset();
      rawTrail.current = [];
      fusedTrail.current = [];
      setTick((n) => n + 1);
      return;
    }

    const fix = rawFix(truth, sampleIndex.current++, STRUCTURES);
    const measuredDx = truth.x - lastTruth.current.x;
    const measuredDz = truth.z - lastTruth.current.z;
    const predicted: Fix = { x: lastFused.current.x + measuredDx, z: lastFused.current.z + measuredDz };
    const maxJump = Math.max(1.5, Math.abs(hodiState.current.speed) * sampleDt * 2.5);
    const fused = filter.update(fix, predicted, maxJump);
    lastFused.current = { ...fused };
    lastTruth.current = truth;

    rawErrors.current.push(Math.hypot(fix.x - truth.x, fix.z - truth.z));
    if (rawErrors.current.length > MAX_TRAIL_POINTS) rawErrors.current.shift();

    pushPoint(rawTrail.current, fix);
    pushPoint(fusedTrail.current, fused);
    setTick((n) => n + 1);
  });

  useEffect(() => {
    if (open) return;
    // Reopening starts a fresh read — a stale accuracy number from a
    // session driven minutes ago would be a lie, not a lens.
    rawErrors.current = [];
    rawTrail.current = [];
    fusedTrail.current = [];
    filter.reset();
  }, [open, filter]);

  // `tick` has no other reader — its only job is to force this component to
  // re-render on every accepted sample, since `rawErrors`/the trails are
  // refs the render body reads directly.
  void tick;
  const pct = accuracyPct(rawErrors.current);
  const mean = meanError(rawErrors.current);

  if (!open) {
    return (
      <Html style={{ display: "none" }}>
        <div aria-hidden="true" data-gps-lens="closed" />
      </Html>
    );
  }

  return (
    <group name="gps-lens">
      {rawTrail.current.length > 1 && (
        <Line points={rawTrail.current} color={palette.warn} lineWidth={1} transparent opacity={0.8} depthWrite={false} />
      )}
      {fusedTrail.current.length > 1 && <Line points={fusedTrail.current} color={palette.signal} lineWidth={2.2} />}
      <Html style={{ display: "none" }}>
        <div aria-hidden="true" data-gps-lens="open" data-accuracy-pct={pct} data-gps-mean-error-m={mean.toFixed(2)} />
      </Html>
    </group>
  );
}
