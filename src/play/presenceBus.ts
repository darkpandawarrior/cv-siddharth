import { useSyncExternalStore } from "react";

/**
 * Presence, readable from anywhere in the tree — not React Context.
 *
 * `useCursorPresences()` only exists inside the `PlayProvider` tree that
 * `routes/__root.tsx`'s `<DeferredGlobalPulse>{children}</DeferredGlobalPulse>`
 * establishes around the routed page. `AnomalyRail` mounts as a SIBLING after
 * that closes, not a descendant, so it can never call that hook directly —
 * same shape of problem `pulseUI.ts` already solves for the interaction
 * counter, and the same fix: a module-scope store (mirroring
 * `useLiveSignal.ts`'s Map + `useSyncExternalStore` shape, minus the network
 * fetch) that any component can read regardless of where it sits, written by
 * the one component that DOES sit inside the provider (`PulseBridge`, see
 * `LivePulse.tsx`).
 */
let count: number | null = null;
const listeners = new Set<() => void>();

/** `null` = the shared layer hasn't loaded or synced yet — never `0` dressed
 *  as a real reading, same honesty rule `classifyWeather` already applies to
 *  the weather chip. */
export function publishPresence(n: number): void {
  if (n === count) return;
  count = n;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): number | null {
  return count;
}

export function usePresenceCount(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
