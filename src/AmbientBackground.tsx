import { Suspense, lazy, useEffect, useState } from "react";

// Dynamic import — three/@react-three/fiber/drei only load if a capable,
// motion-friendly desktop viewport asks for them. Own chunk, code-split
// exactly like the mermaid dynamic import in ProjectDetail.tsx.
const AmbientScene = lazy(() => import("./AmbientScene.tsx"));

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
      {enable3D && (
        <Suspense fallback={null}>
          <AmbientScene />
        </Suspense>
      )}
    </div>
  );
}
