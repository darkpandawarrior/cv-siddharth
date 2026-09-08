import { useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { condition, visible } from "@tanstack/react-start/hydration";
import SkillsOrbitScene from "./SkillsOrbitScene.tsx";

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

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    // ponytail: same inline saveData check as AmbientBackground — no DOM lib
    // type for navigator.connection, so no shared hook for one flag.
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!reduced && !isSmallScreen && !saveData && supportsWebGL()) setCapable(true);
  }, []);

  return (
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
            <SkillsOrbitScene active={active} onSelect={onSelect} />
            <span className="kicker pointer-events-none absolute bottom-1 right-2">
              drag to spin · click a skill to filter
            </span>
          </Hydrate>
        </Hydrate>
      </ClientOnly>
    </div>
  );
}
