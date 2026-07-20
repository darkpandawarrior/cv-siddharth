import { Suspense, lazy, useEffect, useState } from "react";
import { TiltPhone } from "./TiltPhone.tsx";
import type { PhoneShot } from "./Phone3DScene.tsx";

const Phone3DScene = lazy(() => import("./Phone3DScene.tsx"));

// Real shipped UI cycled on the 3D screen. Phone-aspect portraits only —
// PaymentsLab's frames are 320x470 card crops, so it sits this one out.
const SHOTS: PhoneShot[] = [
  { src: "/projects/mileway/screenshots/track_data_preview_overview_tab.png", label: "Mileway" },
  { src: "/projects/kursi/screenshots/home_phone.png", label: "Kursi" },
  { src: "/projects/mileway/screenshots/tracking_success_screen.png", label: "Mileway" },
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
