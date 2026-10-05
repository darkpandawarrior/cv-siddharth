import { useSyncExternalStore } from "react";

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

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * Live reduced-motion read for anything outside a Canvas (SceneActivity
 * covers scenes already inside one via matchMedia + IntersectionObserver
 * directly on the frameloop).
 *
 * `useSyncExternalStore` over `matchMedia`'s own `change` event, not a
 * dependency-less memoized `matchMedia(...).matches` read. The banned
 * mount-once snapshot reads the OS setting once and never again, so a visitor who
 * toggles reduced motion mid-session (or a Playwright test that calls
 * `emulateMedia` after load) sees no effect. The server snapshot is `false`:
 * SSR always renders the full-motion markup, and the client reconciles to
 * the real value on the first paint, same as any other client-only read.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}
