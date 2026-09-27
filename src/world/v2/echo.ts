/**
 * THE GHOST HODI — this lane's own task list (master-plan.md#M26/#M55,
 * idea-atlas.md PATH-7): "press `E` to leave a translucent hodi that
 * replays your last 12 s of intent... the same `Motion` step the live boat
 * uses (positions are outputs, never inputs)."
 *
 * Same discipline as `driveSpline.ts` and `ReplayLab.tsx`: a pure ring
 * buffer of recorded `(stateBefore, input, dt)` triples plus a pure replay
 * function built on the SAME `step()` the live hull calls every frame — no
 * three/R3F import, so the determinism contract (`echo.test.ts`) is a
 * headless test rather than something only a canvas can show.
 *
 * Recording `stateBefore` per frame (not just `input`) means a trimmed
 * buffer can always replay from its own first entry with no separate
 * "starting state" bookkeeping: `replayEcho` just walks `frames` and steps
 * from `frames[0].stateBefore`.
 */
import { step, type HodiEnv, type HodiInput, type HodiState } from "./driveSpline.ts";

/** world-v2-spec.md #4 / PATH-7: "your last 12 s of intent." */
export const ECHO_WINDOW_MS = 12_000;

export interface EchoFrame {
  stateBefore: HodiState;
  input: HodiInput;
  dtMs: number;
  env: HodiEnv;
}

export interface EchoRecording {
  frames: readonly EchoFrame[];
}

export interface EchoBuffer {
  /** Appends one frame, then trims from the front until the buffer holds at
   *  most `windowMs` of recorded time (at least one frame is always kept,
   *  so a single very long frame — a backgrounded tab — isn't discarded
   *  outright). */
  push(frame: EchoFrame): void;
  /** A snapshot ready to hand to `replayEcho` — a copy, so a caller that
   *  keeps replaying an old snapshot is unaffected by frames pushed after
   *  it was taken. */
  snapshot(): EchoRecording;
  clear(): void;
}

export function createEchoBuffer(windowMs: number = ECHO_WINDOW_MS): EchoBuffer {
  let frames: EchoFrame[] = [];
  let totalMs = 0;
  return {
    push(frame) {
      frames.push(frame);
      totalMs += frame.dtMs;
      while (totalMs > windowMs && frames.length > 1) {
        totalMs -= frames[0].dtMs;
        frames.shift();
      }
    },
    snapshot() {
      return { frames: frames.slice() };
    },
    clear() {
      frames = [];
      totalMs = 0;
    },
  };
}

/**
 * Replays a recording through the SAME `step()` the live hull uses.
 * Deterministic: `step` is a pure function of its inputs (driveSpline.ts's
 * own doc comment), so replaying the identical recording twice always
 * produces deep-equal position arrays (this lane's own acceptance line).
 */
export function replayEcho(recording: EchoRecording): HodiState[] {
  if (recording.frames.length === 0) return [];
  const path: HodiState[] = [recording.frames[0].stateBefore];
  let state = recording.frames[0].stateBefore;
  for (const frame of recording.frames) {
    state = step(state, frame.input, frame.dtMs / 1000, frame.env);
    path.push(state);
  }
  return path;
}

/** PATH-7's own depth plan: "a two-boat mooring... needs your echo and you
 *  at once." A plain distance-to-point check against the confluence collar
 *  (`valley.ts`'s `sangamBasin()`), never a special-cased "am I the echo"
 *  flag — the live hull and the replayed ghost are just two `{x, z}`
 *  points, and the mooring doesn't care which is which. */
export const MOORING_RADIUS_M = 6;

export function atTwoBoatMooring(
  liveHodi: { x: number; z: number },
  echoHodi: { x: number; z: number },
  mooring: { x: number; z: number },
  radiusM: number = MOORING_RADIUS_M,
): boolean {
  return Math.hypot(liveHodi.x - mooring.x, liveHodi.z - mooring.z) <= radiusM && Math.hypot(echoHodi.x - mooring.x, echoHodi.z - mooring.z) <= radiusM;
}
