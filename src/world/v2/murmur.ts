/**
 * THE ATTENTION MURMUR — this lane's own task list (idea-atlas.md SYS-4):
 * "when two or more lanterns linger at the same landmark for 10 s, a faint
 * ripple travels along the water toward the nearest two landmarks... it
 * borrows DARBAR's rumour mechanic from Gaddi's design without any of its
 * theme or voice."
 *
 * `stepMurmurLandmark` is the pure core, the same "distance/positions live
 * in the canvas layer, the state machine is a plain function of a count and
 * a clock" split `sense.ts` uses. One landmark's own state: when did 2+
 * lanterns most recently start lingering here, and has this lingering
 * spell already rippled once (never twice for the same uninterrupted
 * spell — dropping below 2 resets it, the same "re-arm on exit" shape
 * `sense.ts`'s Sense uses for its own single-fire-per-visit contract).
 */

/** SYS-4: "linger... for 10 s." */
export const MURMUR_LINGER_MS = 10_000;
export const MURMUR_MIN_LANTERNS = 2;

export interface MurmurLandmarkState {
  /** `nowMs` the current lingering spell (>= MURMUR_MIN_LANTERNS,
   *  uninterrupted) began, or `null` while fewer than that many lanterns are
   *  present. */
  since: number | null;
  /** Whether THIS spell has already rippled once. */
  fired: boolean;
}

export function initialMurmurState(): MurmurLandmarkState {
  return { since: null, fired: false };
}

export function stepMurmurLandmark(
  state: MurmurLandmarkState,
  lingeringCount: number,
  nowMs: number,
  thresholdMs: number = MURMUR_LINGER_MS,
): { state: MurmurLandmarkState; rippled: boolean } {
  if (lingeringCount < MURMUR_MIN_LANTERNS) {
    return state.since === null && !state.fired ? { state, rippled: false } : { state: initialMurmurState(), rippled: false };
  }
  const since = state.since ?? nowMs;
  if (!state.fired && nowMs - since >= thresholdMs) {
    return { state: { since, fired: true }, rippled: true };
  }
  return { state: { since, fired: state.fired }, rippled: false };
}

/** Every landmark's own state, by id. `step` is the per-frame entry point a
 *  canvas layer calls with however many lanterns it currently measures at
 *  each landmark it is watching (see `layers/Echo.tsx`'s own doc comment on
 *  which landmark that is today). */
export interface MurmurTracker {
  step(lingeringCounts: ReadonlyMap<string, number>, nowMs: number, thresholdMs?: number): readonly string[];
}

export function createMurmurTracker(): MurmurTracker {
  let entries = new Map<string, MurmurLandmarkState>();
  return {
    step(lingeringCounts, nowMs, thresholdMs = MURMUR_LINGER_MS) {
      const rippled: string[] = [];
      const next = new Map<string, MurmurLandmarkState>();
      for (const [landmarkId, count] of lingeringCounts) {
        const result = stepMurmurLandmark(entries.get(landmarkId) ?? initialMurmurState(), count, nowMs, thresholdMs);
        next.set(landmarkId, result.state);
        if (result.rippled) rippled.push(landmarkId);
      }
      entries = next;
      return rippled;
    },
  };
}
