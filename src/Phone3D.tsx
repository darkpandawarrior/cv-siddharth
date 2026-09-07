import { Suspense, lazy, useEffect, useState } from "react";
import { TiltPhone } from "./TiltPhone.tsx";
import type { PhoneShot } from "./Phone3DScene.tsx";

const Phone3DScene = lazy(() => import("./Phone3DScene.tsx"));

// Real shipped UI cycled on the 3D screen. Phone-aspect portraits only —
// PaymentsLab-KMP's frames are 320x470 card crops, so it sits this one out.
//
// .webp, not .png. These are three.js TEXTURES, so they cannot go through
// <picture>'s AVIF→WebP→original negotiation like every other image on the
// site — a texture is one URL, chosen here. As PNGs the three of them were
// 252 kB of the homepage; the same three as WebP are 35 kB. WebP rather than
// the smaller AVIF because this scene only renders where WebGL does, and
// Safari 15 has WebGL without AVIF — a texture that 404s is a black phone.
const SHOTS: PhoneShot[] = [
  { src: "/projects/doori/screenshots/track_data_preview_overview_tab.webp", label: "Doori" },
  { src: "/projects/gaddi/screenshots/home_phone.webp", label: "Gaddi" },
  { src: "/projects/doori/screenshots/tracking_success_screen.webp", label: "Doori" },
];

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
export function Phone3D() {
  const [enable3D, setEnable3D] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmallScreen = window.matchMedia("(max-width: 1023px)").matches;
    if (!reduced && !isSmallScreen && supportsWebGL()) setEnable3D(true);
  }, []);

  if (!enable3D) return <TiltPhone />;

  return (
    <div className="relative mt-2 h-[420px] select-none lg:mt-0" aria-hidden>
      <Suspense fallback={<TiltPhone />}>
        <Phone3DScene shots={SHOTS} onContextLost={() => setEnable3D(false)} />
      </Suspense>
    </div>
  );
}
