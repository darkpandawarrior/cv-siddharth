// Earned density on case studies — idea-atlas.md#PATH-2. FOCUS is the
// default; visiting two OTHER project pages this session (sessionRipple's
// useTouched, the same signal PATH-1 already tracks) offers GUIDED; opening
// an evidence link unlocks ANALYST; a manual "show everything" toggle always
// wins. Session-only, like sessionRipple — never persisted, never sent.
import { useSyncExternalStore } from "react";
import { useTouched } from "./sessionRipple.ts";

export type Density = "FOCUS" | "GUIDED" | "ANALYST";

let evidenceOpened = false;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

/** Call from an evidence-link click handler (ProjectDetail wraps its own
 *  EvidenceChip/resource links). Idempotent — the second open is a no-op. */
export function markEvidenceOpened(): void {
  if (evidenceOpened) return;
  evidenceOpened = true;
  notify();
}

/** Plain read, no subscription — for tests and callers outside React. */
export function getEvidenceOpened(): boolean {
  return evidenceOpened;
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}

/** SSR and the client's first paint both report `false` (the server never
 *  saw a click), so this can never produce a hydration mismatch — same
 *  reasoning as EvidenceChip's own mount-effect state. */
export function useEvidenceOpened(): boolean {
  return useSyncExternalStore(subscribe, getEvidenceOpened, () => false);
}

/**
 * Pure density calc. `touched` is a useTouched() snapshot; `currentSlug`
 * excludes the page being read right now from its own "other pages" count,
 * so landing on a project fresh (or refreshing it) never earns GUIDED off
 * a single self-touch.
 */
export function density(
  touched: readonly string[],
  opts: { currentSlug?: string; evidenceOpened?: boolean; manualOverride?: Density } = {},
): Density {
  if (opts.manualOverride) return opts.manualOverride;
  if (opts.evidenceOpened) return "ANALYST";
  const others = opts.currentSlug ? touched.filter((slug) => slug !== opts.currentSlug) : touched;
  return others.length >= 2 ? "GUIDED" : "FOCUS";
}

/** React-bound convenience wrapper over `density`, for ProjectDetail. */
export function useDensity(currentSlug: string, manualOverride?: Density): Density {
  const touched = useTouched();
  const evidenceOpened = useEvidenceOpened();
  return density(touched, { currentSlug, evidenceOpened, manualOverride });
}

/** Test-only reset — module-scope state has no other way back to empty. */
export function _resetForTests(): void {
  evidenceOpened = false;
}
