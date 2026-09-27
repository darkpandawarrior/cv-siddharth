import type { Facet } from "../data/facets";
import { byChronology } from "./facets";

export interface Deviation {
  id: string;
  y: number;
}

/**
 * Reality ripples (live-rail-spec §3, Layer 2) — a transient mark pushed only
 * on a real state CHANGE (never on a poll merely succeeding). Kept as plain
 * data here, same as `Deviation`, so the edge-detectors and decay math below
 * are unit-testable without React or canvas.
 */
export interface Ripple {
  id: string;
  bornAtMs: number;
  /** A `--color-*` custom property name (never a literal hex) — the canvas
   *  reads it via getComputedStyle, same as the existing accent/accent2 read. */
  colorToken: string;
  label: string;
  /** Fixed y, or the START y for a travelling ripple (see `yTo`). */
  y: number;
  /** Presence of `yTo` makes this a TRAVELLING ripple (aircraft only,
   *  §3.1): its position interpolates y -> yTo across its whole decay
   *  window rather than holding still. */
  yTo?: number;
  /** Small, constant horizontal nudge in px (aircraft's azimuth lean) — most
   *  ripples omit this and stay centred like the facet dots. */
  x?: number;
  /** Dimmer variant (family-CI ripples render at 0.7 alpha, per spec §3.1) —
   *  a multiplier on top of the decay alpha, default 1. */
  dimAlpha?: number;
}

export const MAX_RIPPLES = 6;
export const RIPPLE_DECAY_MS = 1800;

/** 1 at birth, 0 once `ageMs` reaches `decayMs` — linear, never negative.
 *  A ripple is drawn only while this is > 0 (§3: "nothing draws at all when
 *  nothing has happened recently"). */
export function decayAlpha(ageMs: number, decayMs: number): number {
  if (decayMs <= 0) return 0;
  return Math.max(0, 1 - ageMs / decayMs);
}

/** A ripple's current y: held fixed unless it's travelling (`yTo` set), in
 *  which case it interpolates linearly across its whole decay window. */
export function rippleY(r: Ripple, ageMs: number, decayMs: number): number {
  if (r.yTo === undefined) return r.y;
  const t = decayMs <= 0 ? 1 : Math.min(1, Math.max(0, ageMs / decayMs));
  return r.y + (r.yTo - r.y) * t;
}

/** Appends to a capped ring buffer, evicting the oldest first — returns a
 *  NEW array (safe to hand to React state) rather than mutating `buffer`. */
export function withRipple(buffer: Ripple[], ripple: Ripple, max = MAX_RIPPLES): Ripple[] {
  const next = [...buffer, ripple];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Drops every fully-decayed ripple — mutates `buffer` in place (called once
 *  per canvas frame from a ref, not React state; see AnomalyRail's ringRef). */
export function pruneRipples(buffer: Ripple[], nowMs: number, decayMs: number): void {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (nowMs - buffer[i].bornAtMs >= decayMs) buffer.splice(i, 1);
  }
}

// --- Layer 0: the ambient wash (§3, ties the baseline's own alpha to Pune's
// current air quality) ---

const AMBIENT_MEAN_ALPHA = 0.28;
const AMBIENT_AMPLITUDE = 0.06;
const AMBIENT_PERIOD_MS = 40_000;

/** usAqi -> a [0, 0.06] dimming term, worse air subtracting more from the
 *  baseline's alpha — same "haze" semantic streams.ts already assigns air
 *  quality. `null`/`undefined` (upstream down or not yet loaded) contributes
 *  no haze, matching streams.ts's own "falls back to a fixed clear-day
 *  density" convention rather than guessing. */
export function hazeFromAqi(usAqi: number | null | undefined): number {
  if (usAqi === null || usAqi === undefined) return 0;
  return Math.min(1, Math.max(0, usAqi / 150)) * AMBIENT_AMPLITUDE;
}

/** The baseline ticks' alpha for this frame: a slow sine around 0.28,
 *  dimmed by `haze`, clamped to the spec's [0.22, 0.34] band. Reduced motion
 *  freezes at the mean (still haze-dimmed) rather than sitting mid-sine. */
export function ambientAlpha(elapsedMs: number, haze: number, reduced: boolean): number {
  const base = reduced ? AMBIENT_MEAN_ALPHA : AMBIENT_MEAN_ALPHA + AMBIENT_AMPLITUDE * Math.sin((elapsedMs / AMBIENT_PERIOD_MS) * Math.PI * 2);
  return Math.min(0.34, Math.max(0.22, base - haze));
}

// --- Edge detectors (§3.1): a ripple fires on the EDGE (value changed),
// never the LEVEL (poll succeeded) — a `null`/`undefined`/missing previous
// reading never counts as a change, so the first snapshot after mount is
// always silent. ---

/** Generic "did this scalar change" — strings, numbers, booleans alike. */
export function didChange<T>(prev: T | null | undefined, next: T | null | undefined): boolean {
  return prev !== null && prev !== undefined && next !== null && next !== undefined && prev !== next;
}

/** A false -> true transition only (e.g. "just started playing"); a
 *  true -> false, or no prior reading, is silent. */
export function didRise(prev: boolean | null | undefined, next: boolean | null | undefined): boolean {
  return prev === false && next === true;
}

/** A strict increase only — used for "someone else arrived" (a departure is
 *  not a ripple; §3.1 only lists arrivals). */
export function didIncrease(prev: number | null | undefined, next: number | null | undefined): boolean {
  return prev !== null && prev !== undefined && next !== null && next !== undefined && next > prev;
}

/** Every key whose `.state` differs between two same-shaped snapshots — the
 *  one detector for both this-repo CI (built into this shape by the caller
 *  from `Ops.runs`) and the family CI map from `/api/signals` (already this
 *  shape). A key present only in `next` is a first sighting, not a flip. */
export function stateFlips<K extends string>(
  prev: Partial<Record<K, { state: string }>> | null | undefined,
  next: Partial<Record<K, { state: string }>> | null | undefined,
): K[] {
  if (!prev || !next) return [];
  const flipped: K[] = [];
  for (const key of Object.keys(next) as K[]) {
    const prevEntry = prev[key];
    const nextEntry = next[key];
    if (prevEntry && nextEntry && prevEntry.state !== nextEntry.state) flipped.push(key);
  }
  return flipped;
}

/** A push whose `at` timestamp wasn't in the previous snapshot — `prev` must
 *  be a real prior snapshot (not the first-ever read) for this to fire. */
export function didNewPush(prev: { at: string }[] | null | undefined, next: { at: string }[] | null | undefined): boolean {
  if (!prev || !next || next.length === 0) return false;
  const prevAt = new Set(prev.map((i) => i.at));
  return next.some((i) => !prevAt.has(i.at));
}

/** Aircraft entering the cluster (§3.1): the count changed, or a callsign is
 *  present that wasn't a moment ago. Departures alone (count drops, no new
 *  callsign) are not a ripple — only arrivals are "something happened". */
export function didAircraftArrive(prev: { cs: string }[] | null | undefined, next: { cs: string }[] | null | undefined): boolean {
  if (!prev || !next) return false;
  if (next.length > prev.length) return true;
  const prevCs = new Set(prev.map((a) => a.cs));
  return next.some((a) => !prevCs.has(a.cs));
}

/**
 * Baseline ticks: start at 0, step by spacing while y ≤ height. The final tick is the last exact
 * multiple of spacing that fits — when spacing does not divide height evenly, the rail's bottom
 * edge sits short of the final tick. This is intended for drawing onto canvas without jamming ticks
 * against the exact pixel boundary.
 */
export function baselineTicks(height: number, spacing: number): number[] {
  if (spacing <= 0) throw new Error("baselineTicks: spacing must be > 0");
  const out: number[] = [];
  for (let y = 0; y <= height; y += spacing) out.push(y);
  return out.length ? out : [0];
}

/**
 * Deviations are laid out by CHRONOLOGY, not by nav order — the rail is a
 * trace of when things were made, so the reading order is time.
 */
export function deviationsFor(facets: Facet[], height: number, pad: number): Deviation[] {
  const ordered = byChronology(facets);
  if (ordered.length === 0) return [];
  if (ordered.length === 1) return [{ id: ordered[0].id, y: height / 2 }];
  const span = height - pad * 2;
  return ordered.map((f, i) => ({ id: f.id, y: pad + (span * i) / (ordered.length - 1) }));
}

/**
 * Pointer-to-facet hit detection: returns the facet id within tolerance of pointer y-coordinate,
 * or null if no match. When multiple deviations are equidistant, the earlier array entry wins
 * (strict inequality on distance comparison ensures this).
 */
export function hitTest(deviations: Deviation[], y: number, tolerance: number): string | null {
  let best: Deviation | null = null;
  let bestDist = Infinity;
  for (const d of deviations) {
    const dist = Math.abs(d.y - y);
    if (dist <= tolerance && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best ? best.id : null;
}
