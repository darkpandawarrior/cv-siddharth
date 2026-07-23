import { Suspense, lazy, useEffect, useRef, useState } from "react";

// three/@react-three/fiber only load when WebGL actually exists — own
// chunk, same code-split pattern as AmbientScene/Phone3DScene/BlueprintRoom.
const ParticleHeroScene = lazy(() => import("./ParticleHeroScene.tsx"));

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Hero-scoped particle swarm background (see App.tsx `Hero()`) — distinct
 * from the whole-page `AmbientBackground`: this one lives inside the Hero
 * section's own `relative` box at -z-10, so it sits behind the hero copy
 * and the phone mockup only, and — unlike AmbientBackground — runs on
 * mobile too (point count just adapts). An IntersectionObserver stops the
 * render loop once the section scrolls out of view.
 */
export function ParticleHero() {
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(6000);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supportsWebGL() || location.search.includes("noambient")) return;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setCount(window.matchMedia("(max-width: 767px)").matches ? 2000 : 6000);
    setReady(true);
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !ready) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);

  if (!ready) return null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <Suspense fallback={null}>
        <ParticleHeroScene count={count} reducedMotion={reducedMotion} paused={!visible} />
      </Suspense>
    </div>
  );
}
