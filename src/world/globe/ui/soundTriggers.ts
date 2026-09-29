// WAVE 6 LANE X6 (opt-in sound and haptics). Pure "does this real event
// deserve a cue" logic — no WebAudio, no DOM, no React — same split as every
// other *.ts/*.tsx pair in this lane (hexbin.ts / HexbinLayer.tsx,
// sparkSeries.ts / Inspector.tsx). soundSynth.ts is the only file that
// actually touches an AudioContext; this file decides WHEN to call it, and
// is what SoundToggle.tsx's own effects and this file's own test cover.
import type { Focus } from "../globeStore.ts";
import type { PulseEvent } from "../layers/pulseEvents.ts";

/** M>=5 quakes present in `quakes` that `seenIds` doesn't already know about
 *  — the caller's own per-poll diff, same "diff two snapshots" shape as
 *  pulseEvents.ts's own diffPulseEvents, but against a running id set
 *  instead of a full previous snapshot (hazardSnapshot.ts's own quake list
 *  has no stable "previous poll" object to diff against, only a live one). */
export function newBigQuakes<T extends { id: string; mag: number }>(seenIds: ReadonlySet<string>, quakes: readonly T[]): T[] {
  return quakes.filter((q) => q.mag >= 5 && !seenIds.has(q.id));
}

/** Which cue (if any) a pulse event maps to. Only the two CI outcomes make a
 *  sound (the brief's own list) — a push/devto/lichess/downloads pulse is
 *  silent, same as PulseLayer.tsx drawing a differently-coloured ring for
 *  each kind but this file only caring about two of them. */
export function cueForPulse(kind: PulseEvent["kind"]): "chime" | "thud" | null {
  if (kind === "ci-pass") return "chime";
  if (kind === "ci-fail") return "thud";
  return null;
}

/** True only when `next` is a real, DIFFERENT target from `prev` — never on
 *  the initial mount (`prev === undefined` marks "no baseline established
 *  yet", the same sentinel PulseLayer.tsx's own `prevRef.current === null`
 *  plays for its first poll, but `null` here is instead a legitimate "no
 *  focus" resting state so it can't double as the sentinel), never on a
 *  re-set to the SAME place (re-clicking an already-focused row), and never
 *  when a flight ends (`next` is `null`) — a whoosh is for arriving
 *  somewhere, not for leaving. */
export function isNewFly(prev: Focus | null | undefined, next: Focus | null): boolean {
  if (!next) return false;
  if (prev === undefined) return false;
  if (!prev) return true;
  if (prev.kind !== next.kind) return true;
  if (prev.kind === "latlon" && next.kind === "latlon") return prev.lat !== next.lat || prev.lon !== next.lon;
  if (prev.kind === "entity" && next.kind === "entity") return prev.id !== next.id;
  return true;
}
