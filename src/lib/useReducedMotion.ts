import { useSyncExternalStore } from "react";

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
