import { useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import ParticleHeroScene from "./ParticleHeroScene.tsx";

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Hero-scoped particle swarm background (see App.tsx `Hero()`) — distinct
 * from the whole-page `AmbientBackground`: this one lives inside the Hero
 * section's own `relative` box at -z-10, so it sits behind the hero copy
 * and the phone mockup only, and — unlike AmbientBackground — runs on
 * mobile too (point count just adapts). An IntersectionObserver stops the
 * render loop once the section scrolls out of view.
 *
 * Interactive on motion-safe devices: desktop (fine pointer) gets cursor-lean
 * + drag-to-spin, the same idiom SkillsOrbit/FoundationGraph already use.
 * Touch gets a tap-to-kick pulse instead of continuous drag, so it can never
 * hijack the page's first scroll gesture — see docs/superpowers/specs/
 * 2026-07-24-particle-hero-interactivity-design.md. Pointer events stay off
 * for reduced-motion visitors, matching the rest of the site.
 */
export function ParticleHero() {
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(6000);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ponytail: same inline saveData check as AmbientBackground/Phone3D/etc —
    // no DOM lib type for navigator.connection, so no shared hook for one flag.
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!supportsWebGL() || saveData || location.search.includes("noambient")) return;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setCount(window.matchMedia("(max-width: 767px)").matches ? 2000 : 6000);
    setDragEnabled(window.matchMedia("(pointer: fine)").matches && window.matchMedia("(min-width: 1024px)").matches);

    // Defer mounting the scene — and thus the ~850KB three.js chunk it pulls in
    // (events-*.esm) — past first paint. The LCP element is the SSR'd headline;
    // importing three eagerly here saturates the throttled mobile network during
    // the exact window the headline's render-blocking CSS + font need, pushing
    // LCP to ~6.5s. Wait for `load` (critical resources drained, LCP painted),
    // then an idle slot, so only the SPHERE arrives a beat later — not the copy.
    let idleId = 0;
    let timerId = 0;
    const mountScene = () => {
      if (window.requestIdleCallback) idleId = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      else timerId = window.setTimeout(() => setReady(true), 200); // Safari < 16.4 fallback
    };
    if (document.readyState === "complete") mountScene();
    else window.addEventListener("load", mountScene, { once: true });

    return () => {
      window.removeEventListener("load", mountScene);
      if (idleId) window.cancelIdleCallback?.(idleId);
      if (timerId) window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !ready) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);

  if (!ready) return null;

  // `ready` (and everything above it, the load+idle sequencing this file's
  // own docstring explains) is unchanged — that timing is deliberate for LCP
  // and is not something a native Hydrate strategy reproduces exactly (idle()
  // alone has no load-wait), so it stays a hand-rolled gate that decides IF
  // this branch is ever reached at all (the early return above). `ready` is
  // also a runtime-only gate the bundler can't see through — it still
  // resolved ParticleHeroScene's @react-three/fiber import for SSR
  // regardless. `<ClientOnly>` is what Start's compiler recognises to strip
  // this subtree from the SERVER compile entirely; `<Hydrate when={load()}
  // split>` inside it just keeps the scene in its own chunk now that the
  // import above is static.
  return (
    <ClientOnly>
      <div ref={hostRef} className={`particle-hero ${reducedMotion ? "pointer-events-none" : ""}`} aria-hidden>
        <Hydrate when={load()} split fallback={null}>
          <ParticleHeroScene count={count} reducedMotion={reducedMotion} paused={!visible} interactive={dragEnabled} />
        </Hydrate>
        {/* lg:right-[8.25rem] pulls the hint back inside the viewport. At
            ≥1024px .particle-hero deliberately bleeds `right: -7.75rem` past its
            section (masked, decorative), and `right-2` put this label in the
            bled-off part — so between 1024px and ~1148px the only thing telling
            you the swarm is draggable was itself clipped away, on exactly the
            widths where dragging is first enabled. */}
        {dragEnabled && (
          <span className="kicker pointer-events-none absolute bottom-2 right-2 lg:right-[8.25rem]">
            drag to spin
          </span>
        )}
      </div>
    </ClientOnly>
  );
}
