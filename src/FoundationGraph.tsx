import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";

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
      {/* enable3D is a runtime-only flag the bundler can't see through — it
          still resolved FoundationGraphScene's @react-three/fiber import for
          SSR regardless (reached from the homepage, which server-renders).
          <ClientOnly> is what Start's compiler recognises to strip this
          subtree (and the lazy import behind it) from the SERVER compile
          entirely. */}
      <ClientOnly>
        {enable3D && (
          <Suspense fallback={null}>
            <FoundationGraphScene />
          </Suspense>
        )}
      </ClientOnly>
    </div>
  );
}
