import { useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { hasWebGL } from "./blueprintShared.tsx";
import { useSky } from "./lib/useSky.ts";
import { deviceTier } from "./world/deviceTier.ts";
import { GlobeScene } from "./world/globe/GlobeScene.tsx";
import { GlobeHud } from "./world/globe/GlobeHud.tsx";
import { GlobePanel } from "./world/globe/GlobePanel.tsx";

const sceneLoadingFallback = (
  <div className="flex h-full items-center justify-center font-mono text-sm text-muted">loading the globe…</div>
);

/**
 * /globe - the third altitude (living-ledger-spec.md#6.3): real Earth as a
 * dot matrix, day and night from the real subsolar point, the two reach
 * columns and the employer ring over Pune, live per-country presence,
 * CelesTrak orbits and the local aircraft cluster.
 *
 * `GlobePanel` (the fact list) renders unconditionally - "SSR/no-WebGL
 * renders the same facts as a list" (task 5) - so a visitor without WebGL,
 * one who has asked for reduced motion, and the server's own first paint all
 * read the same reach sentences a capable visitor sees beside the 3D scene.
 * Only the canvas is gated behind capability, the same ClientOnly/Hydrate
 * split every other WebGL room here uses (StoryMap.tsx, FoundationGraph.tsx,
 * Playground.tsx's own World): `capable` is a runtime-only flag the bundler
 * can't see through, so `<ClientOnly>` is what strips GlobeScene's three.js
 * import from the SSR compile. Checked once at mount, like Playground.tsx's
 * own `worldCapable` - not re-probed if the OS setting changes mid-session.
 */
export function Globe() {
  const sky = useSky();
  const [capable, setCapable] = useState(false);
  const [tier, setTier] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    setCapable(hasWebGL() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setTier(deviceTier());
  }, []);

  const now = sky?.now ?? null;
  const showScene = capable && now !== null;

  return (
    <div data-globe-root className="relative h-full min-h-[70vh] w-full overflow-hidden bg-void">
      <GlobeHud sky={sky} tier={tier} hasWebGL={capable} />
      {showScene && (
        <ClientOnly fallback={sceneLoadingFallback}>
          <Hydrate when={load()} split fallback={sceneLoadingFallback}>
            <GlobeScene now={now} tier={tier} />
          </Hydrate>
        </ClientOnly>
      )}
      <div
        className={
          capable
            ? "pointer-events-none absolute inset-x-0 bottom-0 z-10 max-h-[45%] overflow-y-auto bg-gradient-to-t from-ink/95 via-ink/70 to-transparent p-4 sm:p-6"
            : "relative z-10 mx-auto max-w-2xl px-6 py-16"
        }
      >
        {!capable && (
          <>
            <p className="section-eyebrow mb-2">// globe</p>
            <h1 className="font-display text-h2 font-bold tracking-tight">The reach, from orbit</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              This browser can't run the 3D globe (no WebGL, or reduced motion is on) - the same facts it would
              draw, as a list.
            </p>
          </>
        )}
        <GlobePanel />
      </div>
    </div>
  );
}

export default Globe;
