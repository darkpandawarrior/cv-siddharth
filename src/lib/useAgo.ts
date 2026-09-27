import { useNow } from "./useSky.ts";
import { agoLabel } from "../CiStrip.tsx";

/**
 * Live-ticking "N ago" off the shared minute clock (`useNow`) — a hook
 * wrapper around CiStrip's already-tested `agoLabel` math, so a new call
 * site reuses the one implementation instead of hand-rolling its own
 * ms/hour/day calc (the duplicate `WritingView.tsx`/`LoopdownCast.tsx`'s
 * `lessonAgeLabel` and `CiStrip.tsx`'s `agoLabel` already are). `null`
 * before the client clock's first tick (SSR-safe, matching every other live
 * label's contract) or when `iso` is absent.
 */
export function useAgo(iso: string | null | undefined): string | null {
  const now = useNow();
  if (!iso) return null;
  return agoLabel(iso, now);
}
