import { GRAMMAR } from "./grammar.ts";
import type { Ledger } from "./ledger.ts";
import { LANDMARK_OPENS } from "./landmarkBindings.ts";
import { landmarkPositions } from "./landmarkPositions.ts";
import { landOf } from "./worldModel.ts";

export type TourTarget = { kind: "landmark"; id: string } | { kind: "grammar"; id: string };
export type TourStop = TourTarget & {
  label: string;
  position: readonly [number, number, number];
  sourceFile: string;
  dwellS: number;
  transitionS: number;
};

export const DEFAULT_TOUR: readonly TourTarget[] = [
  { kind: "landmark", id: "bridge" },
  { kind: "landmark", id: "doori" },
  { kind: "landmark", id: "paymentslab-kmp" },
  { kind: "grammar", id: "deepmal-niche" },
  { kind: "grammar", id: "pr-stone" },
  { kind: "landmark", id: "portfolio" },
  { kind: "landmark", id: "stutter" },
];

/** Captions reuse the grammar's labels or the landmark's existing graph label. */
export function tourStops(ledger: Ledger, targets: readonly TourTarget[] = DEFAULT_TOUR): TourStop[] {
  const features = landOf(ledger);
  const positions = landmarkPositions();
  const facets = GRAMMAR.find((rule) => rule.id === "landmark-facet")!;
  const facetSource = facets.ledgerRow(facets.source(ledger), ledger).sourceFile;
  return targets.flatMap((target): TourStop[] => {
    const timing = { dwellS: 12, transitionS: 3 };
    if (target.kind === "grammar") {
      const rule = GRAMMAR.find((rule) => rule.id === target.id);
      const feature = features.find((feature) => feature.rule === target.id);
      if (!rule || !feature) return [];
      const row = rule.ledgerRow(rule.source(ledger), ledger);
      return [{ ...target, ...timing, label: row.label, position: feature.pos, sourceFile: row.sourceFile }];
    }
    const link = LANDMARK_OPENS[target.id];
    const position = positions[target.id];
    if (!link || !position) return [];
    const facet = features.find((feature) => feature.id.startsWith(`landmark-facet:${target.id}:`));
    const graphLabel = ledger.systemGraph.nodes.find((node) => node.id === link.target)?.label;
    return [{ ...target, ...timing, position, label: facet?.label ?? graphLabel ?? target.id, sourceFile: facet ? facetSource : "systemGraph.ts" }];
  });
}

export function estimatedDurationS(stops: readonly TourStop[]): number {
  return stops.reduce((total, stop) => total + stop.dwellS + stop.transitionS, 0);
}

export interface TourState { index: number | null; playing: boolean }
export type TourAction = "start" | "stop" | "next" | "previous" | "toggle" | "tick";

/** Guided and shared paths use the same pacing and bounded keyboard steps. */
export function tourTransition(state: TourState, action: TourAction, count: number, reducedMotion: boolean): TourState {
  if (action === "stop" || count === 0) return { index: null, playing: false };
  if (action === "start") return { index: 0, playing: !reducedMotion };
  if (state.index === null) return state;
  if (action === "toggle") return { ...state, playing: !reducedMotion && !state.playing && state.index < count - 1 };
  if (action === "tick" && (!state.playing || reducedMotion)) return state;
  const index = Math.max(0, Math.min(count - 1, state.index + (action === "previous" ? -1 : 1)));
  return { index, playing: !reducedMotion && state.playing && (action === "tick" ? state.index < count - 1 : index < count - 1) };
}

// The HUD publishes its stop for the boat's camera controller, across React roots.
let activeStop: TourStop | null = null;
const listeners = new Set<() => void>();
export function getTourStop(): TourStop | null { return activeStop; }
export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setTourStop(stop: TourStop | null): void {
  if (activeStop === stop) return;
  activeStop = stop;
  for (const listener of listeners) listener();
}
