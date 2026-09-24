/**
 * Live `prefers-reduced-motion` read, shared by every world module that
 * needs to freeze an ambient/automatic effect rather than a directly-driven
 * one.
 *
 * Deliberately NOT memoised for the session, unlike deviceTier.ts's own
 * device-tier probe: the design system's live-reduced-motion contract
 * (SceneActivity.tsx's own doc comment, and the design spec's "reduced
 * motion is LIVE" rule) rules out a mount-once snapshot for this specific
 * media query — a visitor who toggles the OS setting mid-drive, or a
 * Playwright test that calls `emulateMedia` after load, must see the effect.
 * Every caller here already re-reads this once per frame (a `useFrame`
 * body), so dropping the cache is the whole fix; nothing downstream needed
 * to change to become live.
 *
 * Before this file, SpawnFlyIn.tsx was the only world module reading this
 * media query, with its own private `matchMedia` call — the same drift class
 * deviceTier.ts's own doc comment describes for the tier probe (two hand-kept
 * copies of one browser read). This is the one module every consumer now
 * reads from.
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** No-op — kept so every existing call site (afterEach hooks included)
 *  doesn't need editing now that there is no cache to reset. */
export function resetReducedMotionForTest(): void {}
