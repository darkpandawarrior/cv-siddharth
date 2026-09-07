/**
 * One-shot `prefers-reduced-motion` read, shared by every world module that
 * needs to freeze an ambient/automatic effect rather than a directly-driven
 * one. Memoised for the session exactly like deviceTier.ts's own device-tier
 * probe, and for the same reason (that file's own doc comment): a visitor
 * who starts reduced and later has the OS setting lifted (or vice versa)
 * mid-drive should see a *consistent* world, not one whose animation budget
 * flickers under them.
 *
 * Before this file, SpawnFlyIn.tsx was the only world module reading this
 * media query, with its own private `matchMedia` call — the same drift class
 * deviceTier.ts's own doc comment describes for the tier probe (two hand-kept
 * copies of one browser read). This is the one module every consumer now
 * reads from.
 */

let cached: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (cached !== null) return cached;
  cached = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return cached;
}

/** Test-only escape hatch — a fresh probe on the next call. */
export function resetReducedMotionForTest(): void {
  cached = null;
}
