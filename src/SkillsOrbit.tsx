import { useEffect, useMemo, useState } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { condition, visible } from "@tanstack/react-start/hydration";
import SkillsOrbitScene from "./SkillsOrbitScene.tsx";
import { provenIn } from "./data/profile/skills.ts";
import { projects } from "./data/profile/projects.ts";

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
  const [capable, setCapable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  // Filtering a skill (clicking a word in the orbit) surfaces 1-3 provenIn
  // project links here, in the flat layer below the canvas — real, SSR-able
  // DOM the 3D click can't itself carry (drei's Html labels are pointer
  // targets, not a place to grow a link list).
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const provenProjects = useMemo(() => {
    if (!selectedItem) return [];
    return provenIn(selectedItem)
      .slice(0, 3)
      .map((slug) => projects.find((p) => p.slug === slug))
      .filter((p): p is NonNullable<typeof p> => p != null);
  }, [selectedItem]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    // ponytail: same inline saveData check as AmbientBackground — no DOM lib
    // type for navigator.connection, so no shared hook for one flag.
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!reduced && !isSmallScreen && !saveData && supportsWebGL()) setCapable(true);
  }, []);

  return (
    <>
    <div className={`relative select-none ${enabled ? "h-[360px]" : "h-0"}`} aria-hidden>
      {/* `capable` is a runtime-only flag the bundler can't see through — it
          still resolved SkillsOrbitScene's @react-three/fiber import for SSR
          regardless. <ClientOnly> is what Start's compiler recognises to
          strip this subtree from the SERVER compile entirely.
          `<Hydrate when={condition(capable)}>` reuses that flag as the native
          "resolve once true" strategy, nested with `visible({rootMargin:
          "200px"})` — native visible() replaces the hand-rolled
          IntersectionObserver this file used to set up itself, same
          200px margin. Nesting composes the two as AND: the outer gate must
          resolve (capable) before the inner one starts observing at all.
          `onHydrated` on the inner boundary is what used to be
          `observer.disconnect(); setEnabled(true)` — it fires exactly once,
          the moment the scene actually mounts, so the wrapper's height only
          grows once there is something inside it to reserve room for. */}
      <ClientOnly>
        <Hydrate when={condition(capable)} split fallback={null}>
          <Hydrate when={visible({ rootMargin: "200px" })} split fallback={null} onHydrated={() => setEnabled(true)}>
            <SkillsOrbitScene active={active} onSelect={onSelect} onSelectItem={setSelectedItem} />
            <span className="kicker pointer-events-none absolute bottom-1 right-2">
              drag to spin · click a skill to filter
            </span>
          </Hydrate>
        </Hydrate>
      </ClientOnly>
    </div>
    {/* The flat layer — outside the 3D wrapper's aria-hidden entirely (a
        focusable link inside an aria-hidden subtree is unreachable by
        assistive tech no matter what it sets its own aria-hidden to), so
        these stay real, tabbable links the moment a skill is filtered. */}
    {provenProjects.length > 0 && (
      <div className="fade-in mt-2 flex flex-wrap items-center gap-1.5">
        <span className="kicker">proven in</span>
        {provenProjects.map((p) => (
          <Link
            key={p.slug}
            to="/project/$slug"
            params={{ slug: p.slug }}
            className="rounded-full border border-accent/30 bg-accent/5 px-2 py-0.5 font-mono text-[10px] text-accent/90 transition hover:border-accent hover:text-accent"
          >
            {p.name}
          </Link>
        ))}
      </div>
    )}
    </>
  );
}
