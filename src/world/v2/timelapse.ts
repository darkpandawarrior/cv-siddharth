import type { Ledger } from "./ledger.ts";
import { landOf, type Feature } from "./worldModel.ts";

export const REPLAY_START = "2017-01";
export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export type ReplayFeature = Feature & { cadence: "manual" | "undated" };

let asOf: string | null = null;
const listeners = new Set<() => void>();
export const getReplay = (): string | null => asOf;
export const getServerReplay = (): null => null;
export function subscribeReplay(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setReplay(month: string | null): void {
  if (month !== null) monthIndex(month);
  if (month === asOf) return;
  asOf = month;
  for (const listener of listeners) listener();
}

/** Replay decorates the existing model; it never invents historical records. */
export function timelapse(ledger: Ledger, asOf: string): ReplayFeature[] {
  return landOf(ledger, asOf).map((feature) => ({
    ...feature,
    cadence: feature.date === null ? "undated" : "manual",
  }));
}

function monthIndex(ym: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new RangeError(`Invalid replay month: ${ym}`);
  const [year, month] = ym.split("-").map(Number);
  return year * 12 + month - 1;
}

function monthAt(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

export function replayMonths(now: Date): string[] {
  const end = monthIndex(now.toISOString().slice(0, 7));
  const start = monthIndex(REPLAY_START);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => monthAt(start + i));
}

export function stepReplay(asOf: string, direction: -1 | 1, end: string): string {
  return monthAt(Math.max(monthIndex(REPLAY_START), Math.min(monthIndex(end), monthIndex(asOf) + direction)));
}

export function replayInterval(speed: ReplaySpeed): number {
  return 200 / speed;
}

export type ReplayState = { month: string | null; playing: boolean; speed: ReplaySpeed };
export type ReplayAction =
  | { type: "start" | "toggle" | "pause" | "tick" | "now" }
  | { type: "seek"; month: string }
  | { type: "speed"; speed: ReplaySpeed }
  | { type: "key"; key: string };

export function replayRunning(state: ReplayState, reducedMotion: boolean): boolean {
  return state.playing && !reducedMotion && state.month !== null;
}

/** The same decisions drive the HUD and its headless verification. */
export function replayTransition(state: ReplayState, action: ReplayAction, end: string, reducedMotion: boolean): ReplayState {
  switch (action.type) {
    case "start": return { ...state, month: REPLAY_START, playing: !reducedMotion };
    case "now": return { ...state, month: null, playing: false };
    case "pause": return { ...state, playing: false };
    case "seek": return { ...state, month: action.month, playing: false };
    case "speed": return { ...state, speed: action.speed };
    case "toggle": return state.month === null || reducedMotion
      ? { ...state, playing: false }
      : { ...state, month: state.month === end ? REPLAY_START : state.month, playing: !state.playing };
    case "key": return state.month !== null && ["ArrowLeft", "ArrowRight"].includes(action.key)
      ? { ...state, month: stepReplay(state.month, action.key === "ArrowLeft" ? -1 : 1, end), playing: false }
      : state;
    case "tick": {
      if (!replayRunning(state, reducedMotion) || state.month === end) return { ...state, playing: false };
      const month = stepReplay(state.month!, 1, end);
      return { ...state, month, playing: month !== end };
    }
  }
}
