/**
 * THE SENSE — this lane's own task list (idea-atlas.md SYS-4): "when
 * another visitor's lantern comes within 40 m of your boat, one soft audio
 * blip (after a gesture) and a HUD line, 'someone else is here', fire
 * before you can see them... re-arms on exit."
 *
 * `stepSense`/`stepSenseTracker` are the pure core (an id's own armed/fired
 * state as a function of the current distance) — zero DOM/audio import, so
 * `sense.test.ts` covers the "fires once per entry, re-arms on exit"
 * contract headlessly. `emitSenseEvent`/`subscribeSense` below is the thin,
 * impure wire from wherever the distance check runs (a canvas layer, which
 * has the live positions) to wherever the HUD line renders (a DOM sibling,
 * `hud/PathControls.tsx`) — the same "one shared singleton, several
 * independent React trees" shape `input.ts`'s `subscribeCaptured` already
 * uses in this codebase, chosen over prop-drilling through `layers.ts`'s
 * no-props layer contract (this lane's `layers.ts` doc comment: a layer
 * component takes no props).
 */

export const SENSE_RADIUS_M = 40;

export interface SenseEntry {
  /** True = ready to fire on the next entry. False = already fired for the
   *  visitor currently in range; waiting to exit before it re-arms. */
  armed: boolean;
}

export function initialSenseEntry(): SenseEntry {
  return { armed: true };
}

/** One id's own state transition for one distance reading. */
export function stepSense(entry: SenseEntry, distanceM: number, radiusM: number = SENSE_RADIUS_M): { entry: SenseEntry; fired: boolean } {
  const inRange = distanceM < radiusM;
  if (inRange && entry.armed) return { entry: { armed: false }, fired: true };
  if (!inRange && !entry.armed) return { entry: { armed: true }, fired: false };
  return { entry, fired: false };
}

/**
 * Every lantern the Sense currently knows about, by id (a presence
 * channel's own key — playhtml assigns one per tab). `step` prunes ids no
 * longer present: a visitor who closes their tab (or drives out of the
 * channel entirely) is gone, and if the same id reappears later it starts
 * fresh-armed, the same observable behaviour as "exit then re-enter" would
 * produce — no separate bookkeeping needed for that case.
 */
export interface SenseTracker {
  step(distancesM: ReadonlyMap<string, number>, radiusM?: number): readonly string[];
}

export function createSenseTracker(): SenseTracker {
  let entries = new Map<string, SenseEntry>();
  return {
    step(distancesM, radiusM = SENSE_RADIUS_M) {
      const fired: string[] = [];
      const next = new Map<string, SenseEntry>();
      for (const [id, distanceM] of distancesM) {
        const result = stepSense(entries.get(id) ?? initialSenseEntry(), distanceM, radiusM);
        next.set(id, result.entry);
        if (result.fired) fired.push(id);
      }
      entries = next;
      return fired;
    },
  };
}

export const SENSE_MESSAGE = "someone else is here";

export interface SenseEvent {
  message: string;
  at: number;
}

type SenseListener = (event: SenseEvent) => void;
const listeners = new Set<SenseListener>();

export function subscribeSense(fn: SenseListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitSenseEvent(event: SenseEvent): void {
  for (const fn of listeners) fn(event);
}

// ── the blip: a single soft tone, gated on a real gesture ───────────────────
//
// audio.ts already owns the world's shared audio graph and its own "nothing
// starts until a gesture" rule, but it isn't in this lane's `owns` (G2), so
// the Sense keeps a small graph-free blip of its own rather than reaching
// into that file. `hasGestured` mirrors audio.ts's rule 1 exactly (a real
// pointerdown/keydown, listened for lazily and only once) without depending
// on its module state.
let hasGestured = typeof window === "undefined";
let gestureListenersAttached = false;

function armGestureListener(): void {
  if (gestureListenersAttached || typeof window === "undefined") return;
  gestureListenersAttached = true;
  const onGesture = () => {
    hasGestured = true;
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
  };
  window.addEventListener("pointerdown", onGesture, { once: true });
  window.addEventListener("keydown", onGesture, { once: true });
}

let blipCtx: AudioContext | null = null;
let blipFailed = false;

/** One soft sine blip. Silently a no-op before the first gesture, on a
 *  browser with no Web Audio, or if anything here throws — same "nothing
 *  blocks" posture as audio.ts's own burst()/playPickup(). */
export function playSenseBlip(): void {
  armGestureListener();
  if (!hasGestured || blipFailed) return;
  try {
    if (!blipCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        blipFailed = true;
        return;
      }
      blipCtx = new Ctor();
    }
    const ctx = blipCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch {
    blipFailed = true;
  }
}

/** Test-only reset — the gesture/audio flags are module-scope singletons,
 *  same as audio.ts's own `engine`/`muted`. */
export function _resetSenseForTests(): void {
  hasGestured = typeof window === "undefined";
  gestureListenersAttached = false;
  blipCtx = null;
  blipFailed = false;
  listeners.clear();
}
