import { Suspense, lazy, useEffect, useRef, useState } from "react";

const SkillsOrbitScene = lazy(() => import("./SkillsOrbitScene.tsx"));

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Gate for the 3D skill orbit: capable, motion-friendly desktops only,
 * mounted when scrolled near. Everyone else sees nothing here — the flat
 * chip cloud below is always present and always the accessible version.
 */
export function SkillsOrbit({ active, onSelect }: { active: string | null; onSelect: (group: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    if (reduced || isSmallScreen || !supportsWebGL()) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEnabled(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={holder} className={`relative select-none ${enabled ? "h-[360px]" : "h-0"}`} aria-hidden>
      {enabled && (
        <Suspense fallback={null}>
          <SkillsOrbitScene active={active} onSelect={onSelect} />
        </Suspense>
      )}
      {enabled && (
        <span className="pointer-events-none absolute bottom-1 right-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          drag to spin · click a skill to filter
        </span>
      )}
    </div>
  );
}
