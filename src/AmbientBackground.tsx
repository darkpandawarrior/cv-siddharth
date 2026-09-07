import { useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { condition } from "@tanstack/react-start/hydration";
import AmbientScene from "./AmbientScene.tsx";

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Fixed, full-viewport ambient layer sat behind all page content (-z-10).
 * The CSS starfield (`.starfield-static`, already in index.css) is the
 * baseline — always rendered, zero cost. The WebGL particle field is a
 * progressive enhancement layered on top of it, and only mounts when the
 * viewport is wide enough to be a real desktop composition, motion is
 * welcome, and WebGL actually exists. Mobile and reduced-motion visitors
 * simply keep the static gradient — never a janky canvas.
 */
export function AmbientBackground() {
  const [enable3D, setEnable3D] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 767px)").matches;
    if (!reduced && !isSmallScreen && supportsWebGL() && !location.search.includes("noambient")) setEnable3D(true);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-70" aria-hidden>
      <div className="starfield-static absolute inset-0" />
      {/* enable3D is a runtime-only flag the bundler can't see through — it
          still resolved AmbientScene's @react-three/fiber import for SSR
          regardless. <ClientOnly> is what Start's compiler recognises to
          strip this subtree from the SERVER compile entirely.
          `<Hydrate when={condition(enable3D)} split>` reuses that same
          runtime flag as the native "resolve once this is true" strategy —
          the exact reduced-motion/767px/WebGL gate above is unchanged, only
          the code-splitting mechanism moved off React's dynamic import. */}
      <ClientOnly>
        <Hydrate when={condition(enable3D)} split fallback={null}>
          <AmbientScene />
        </Hydrate>
      </ClientOnly>
    </div>
  );
}
