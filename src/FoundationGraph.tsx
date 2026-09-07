import { useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { condition, visible } from "@tanstack/react-start/hydration";
import FoundationGraphScene from "./FoundationGraphScene.tsx";

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
  const [capable, setCapable] = useState(false);
  const [enable3D, setEnable3D] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    if (!reduced && !isSmallScreen && supportsWebGL()) setCapable(true);
  }, []);

  return (
    // h-0 (not `hidden`) while disabled — a display:none element is never
    // observed as visible, so the scene behind it would never mount.
    <div className={`relative select-none ${enable3D ? "h-[340px]" : "h-0"}`} aria-hidden>
      {/* `capable` is a runtime-only flag the bundler can't see through — it
          still resolved FoundationGraphScene's @react-three/fiber import for
          SSR regardless (reached from the homepage, which server-renders).
          <ClientOnly> is what Start's compiler recognises to strip this
          subtree from the SERVER compile entirely. `<Hydrate
          when={condition(capable)}>` reuses that flag as the native
          "resolve once true" strategy, nested with `visible({rootMargin:
          "200px"})` — native visible() replaces the hand-rolled
          IntersectionObserver this file used to set up itself, same 200px
          margin. `onHydrated` fires once, the moment the scene actually
          mounts — what used to be `observer.disconnect(); setEnable3D(true)`
          — so the wrapper's height only grows once there is something inside
          it to reserve room for. */}
      <ClientOnly>
        <Hydrate when={condition(capable)} split fallback={null}>
          <Hydrate when={visible({ rootMargin: "200px" })} split fallback={null} onHydrated={() => setEnable3D(true)}>
            <FoundationGraphScene />
          </Hydrate>
        </Hydrate>
      </ClientOnly>
    </div>
  );
}
