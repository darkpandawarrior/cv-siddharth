import { useEffect, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";

/** Keep decorative scenes still when motion is reduced, and idle when invisible. */
export function SceneActivity() {
  const { gl, setFrameloop, invalidate } = useThree();
  useEffect(() => {
    let visible = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const active = visible && !document.hidden;
      setFrameloop(active ? motion.matches ? "demand" : "always" : "never");
      if (active) invalidate();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(gl.domElement);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, [gl, setFrameloop, invalidate]);
  return null;
}

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
 * `useMemo(() => matchMedia(...).matches, [])` snapshot — the banned pattern
 * reads the OS setting once at mount and never again, so a visitor who
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
