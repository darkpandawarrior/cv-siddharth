// The visitor's own path through the site, kept in module scope so it
// survives TanStack Start's client-side navigation without a reload. Never
// persisted (no localStorage, no cookie) and never sent anywhere — it is
// the one "real input" in the Reality ledger that is entirely local (design
// spec §4.3's "You" row, §5's real-system adoption).
import { useSyncExternalStore } from "react";

const MAX_TOUCHED = 12;

let touched: string[] = [];
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

/** Records a visit to `node` (a registry slug or StoryMap node id). Moves an
 *  already-touched node to the end instead of duplicating it, so the most
 *  recent visit is always last and the list never grows past MAX_TOUCHED. */
export function touch(node: string): void {
  const next = touched.filter((n) => n !== node);
  next.push(node);
  touched = next.length > MAX_TOUCHED ? next.slice(next.length - MAX_TOUCHED) : next;
  notify();
}

/** The current touched list, most recent last — a plain read with no
 *  subscription, for callers outside React (tests, the ledger's snapshot). */
export function getTouched(): readonly string[] {
  return touched;
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}

/** useSyncExternalStore over the module-scope list above. Same snapshot
 *  reference across renders when nothing changed (React requires this to
 *  avoid an infinite re-render loop), which `touch`'s reassignment of
 *  `touched` (rather than a mutating push) already guarantees. */
export function useTouched(): readonly string[] {
  return useSyncExternalStore(subscribe, getTouched, getTouched);
}

/** Test-only reset — module-scope state has no other way back to empty. */
export function _resetForTests(): void {
  touched = [];
}
