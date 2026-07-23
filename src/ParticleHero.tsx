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
 *
 * Interactive on motion-safe devices: desktop (fine pointer) gets cursor-lean
 * + drag-to-spin, the same idiom SkillsOrbit/FoundationGraph already use.
 * Touch gets a tap-to-kick pulse instead of continuous drag, so it can never
 * hijack the page's first scroll gesture — see docs/superpowers/specs/
 * 2026-07-24-particle-hero-interactivity-design.md. Pointer events stay off
 * for reduced-motion visitors, matching the rest of the site.
 */
export function ParticleHero() {
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(6000);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supportsWebGL() || location.search.includes("noambient")) return;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setCount(window.matchMedia("(max-width: 767px)").matches ? 2000 : 6000);
    setDragEnabled(window.matchMedia("(pointer: fine)").matches && window.matchMedia("(min-width: 1024px)").matches);
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
    <div ref={hostRef} className={`particle-hero ${reducedMotion ? "pointer-events-none" : ""}`} aria-hidden>
      <Suspense fallback={null}>
        <ParticleHeroScene count={count} reducedMotion={reducedMotion} paused={!visible} interactive={dragEnabled} />
      </Suspense>
      {dragEnabled && (
        <span className="pointer-events-none absolute bottom-2 right-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          drag to spin
        </span>
      )}
    </div>
  );
}
