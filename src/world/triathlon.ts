/**
 * Checkpoint sequencing and timing for the triathlon course — pure, no
 * three.js/R3F imports so it can be unit-tested without a WebGL context and
 * reused by both `Craft.tsx` (sensor overlap → passCheckpoint) and `Hud.tsx`
 * (elapsed/best display).
 *
 * Vitest here runs under `environment: "node"` (see vitest.config.ts), so
 * `localStorage` is not a given global — and even where it exists (a real
 * browser), private-browsing Safari throws on `setItem`/`getItem` rather than
 * just returning null. Every storage touch is guarded so this module is safe
 * to import from an ssr:false route without a storage backend at all.
 */

import { CHECKPOINTS } from "./worldData.ts";

export type Checkpoint = { id: number; position: [number, number, number]; radius: number };

export type RunState = {
  startedAtMs: number | null;
  nextCheckpoint: number;
  finishedMs: number | null;
};

const BEST_MS_KEY = "playground:triathlon:best";

/* FINDING 4 fix: this used to be a hand-maintained `= 6` that quietly drifted
 * from worldData.ts's real CHECKPOINTS array (7 entries, ids 0..6) — the run
 * was "finishing" a full checkpoint early, on a ring in mid-air, with the
 * actual sky-island landing (id 6) never reachable as dead code past it.
 *
 * Deriving it from CHECKPOINTS.length instead makes that drift structurally
 * impossible rather than something a comment has to keep warning about. The
 * worry that blocked this before — "worldData.ts imports the Checkpoint type
 * from this module, so importing CHECKPOINTS back would make the two files a
 * cycle" — doesn't actually hold: worldData.ts's import is `import type`, and
 * this project builds with `verbatimModuleSyntax` (tsconfig.app.json), which
 * guarantees `import type` is fully erased at emit. There is no runtime
 * `require`/`import` of triathlon.ts inside worldData.ts's compiled output,
 * so the module graph is a one-way edge (this file -> worldData.ts), not a
 * cycle — safe to import the value.
 *
 * worldData.ts's own comment on CHECKPOINTS carries the other half of this:
 * the array's length IS the contract now, not a number to keep in sync by
 * hand. The six *legs* between those seven checkpoints are still the spec's
 * route (keycap ramp, atoll glide, splashdown, strait, thermal, sky island)
 * — "six legs" and "seven checkpoints" are the same course, not a
 * contradiction. */
export const CHECKPOINT_COUNT = CHECKPOINTS.length;

export function beginRun(nowMs: number): RunState {
  return { startedAtMs: nowMs, nextCheckpoint: 0, finishedMs: null };
}

/** Advances only on the correct next checkpoint; out-of-order and repeat
 *  passes are no-ops, and a pass after the run already finished is too. */
export function passCheckpoint(state: RunState, id: number, nowMs: number): RunState {
  if (state.startedAtMs === null || state.finishedMs !== null || id !== state.nextCheckpoint) {
    return state;
  }
  const nextCheckpoint = state.nextCheckpoint + 1;
  const finishedMs = nextCheckpoint >= CHECKPOINT_COUNT ? nowMs : null;
  return { ...state, nextCheckpoint, finishedMs };
}

export function loadBestMs(): number | null {
  try {
    const raw = localStorage.getItem(BEST_MS_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps the lower of the new time and any existing best. */
export function saveBestMs(ms: number): void {
  try {
    const current = loadBestMs();
    if (current === null || ms < current) {
      localStorage.setItem(BEST_MS_KEY, String(ms));
    }
  } catch {
    // private browsing / storage disabled — the run still happened, it just
    // won't be remembered. Not worth surfacing to the visitor.
  }
}
