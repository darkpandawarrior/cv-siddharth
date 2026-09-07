import { useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { TiltPhone } from "./TiltPhone.tsx";
import Phone3DScene from "./Phone3DScene.tsx";
import type { PhoneShot } from "./Phone3DScene.tsx";
import { heavy } from "./lib/assetBase.ts";

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
  { src: heavy("/projects/doori/screenshots/track_data_preview_overview_tab.webp"), label: "Doori" },
  { src: heavy("/projects/gaddi/screenshots/home_phone.webp"), label: "Gaddi" },
  { src: heavy("/projects/doori/screenshots/tracking_success_screen.webp"), label: "Doori" },
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

  // enable3D is a runtime-only flag the bundler can't see through — it still
  // resolved Phone3DScene's @react-three/fiber import for SSR regardless.
  // <ClientOnly> is what Start's compiler recognises to strip this subtree
  // from the SERVER compile entirely. The 1023px/reduced-motion/WebGL gate
  // above already decides IF this branch is reached at all (the early return),
  // so `<Hydrate when={load()} split>` just keeps Phone3DScene in its own
  // chunk — there is no further defer to express here.
  return (
    <ClientOnly fallback={<TiltPhone />}>
      <div className="relative mt-2 h-[420px] select-none lg:mt-0" aria-hidden>
        <Hydrate when={load()} split fallback={<TiltPhone />}>
          <Phone3DScene shots={SHOTS} onContextLost={() => setEnable3D(false)} />
        </Hydrate>
      </div>
    </ClientOnly>
  );
}
