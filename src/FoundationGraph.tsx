import { Suspense, lazy, useEffect, useRef, useState } from "react";

const FoundationGraphScene = lazy(() => import("./FoundationGraphScene.tsx"));

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Interactive dependency constellation for the Shared Foundation section.
 * Mounts its canvas only when scrolled near (IntersectionObserver) on a
 * capable, motion-friendly desktop — otherwise renders nothing and the
 * section's text/cards carry the story alone.
 */
export function FoundationGraph() {
  const holder = useRef<HTMLDivElement>(null);
  const [enable3D, setEnable3D] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    if (reduced || isSmallScreen || !supportsWebGL()) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEnable3D(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // h-0 (not `hidden`) while disabled — a display:none element never
    // intersects, so the observer that enables the scene would never fire.
    <div ref={holder} className={`relative select-none ${enable3D ? "h-[340px]" : "h-0"}`} aria-hidden>
      {enable3D && (
        <Suspense fallback={null}>
          <FoundationGraphScene />
        </Suspense>
      )}
    </div>
  );
}
