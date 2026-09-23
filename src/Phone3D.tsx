import { ShapeBoundary } from "./blueprintShared.tsx";
import { useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { TiltPhone } from "./TiltPhone.tsx";
import Phone3DScene from "./Phone3DScene.tsx";
import type { PhoneShot } from "./Phone3DScene.tsx";

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Hero device: real-3D phone showing actual app screenshots when the visitor
 * has WebGL + motion + a desktop viewport; the CSS TiltPhone (zero WebGL
 * payload) everywhere else. Same progressive-enhancement gate as
 * AmbientBackground so the two never disagree about capability.
 */
export function Phone3D({ shot }: { shot: PhoneShot }) {
  const [enable3D, setEnable3D] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    // ponytail: same inline saveData check as AmbientBackground — no DOM lib
    // type for navigator.connection, so no shared hook for one flag.
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!reduced && !isSmallScreen && !saveData && supportsWebGL()) setEnable3D(true);
  }, []);

  if (!enable3D) return <TiltPhone shot={shot} />;

  // enable3D is a runtime-only flag the bundler can't see through — it still
  // resolved Phone3DScene's @react-three/fiber import for SSR regardless.
  // <ClientOnly> is what Start's compiler recognises to strip this subtree
  // from the SERVER compile entirely. The 1023px/reduced-motion/WebGL gate
  // above already decides IF this branch is reached at all (the early return),
  // so `<Hydrate when={load()} split>` just keeps Phone3DScene in its own
  // chunk — there is no further defer to express here.
  return (
    <ClientOnly fallback={<TiltPhone shot={shot} />}>
      <ShapeBoundary fallback={<TiltPhone shot={shot} />}><div className="hero-device h-[430px] select-none sm:h-[520px]" aria-hidden>
        <Hydrate when={load()} split fallback={<TiltPhone shot={shot} />}>
          <Phone3DScene shot={shot} onContextLost={() => setEnable3D(false)} />
        </Hydrate>
      </div></ShapeBoundary>
    </ClientOnly>
  );
}
