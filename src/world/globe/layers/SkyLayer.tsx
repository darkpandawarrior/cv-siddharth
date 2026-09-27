/** LANE L2 (real sky: stars, moon, sun) owns this file. */
import { useCallback, useEffect, useRef } from "react";
import { moonPhase } from "../../../lib/moon.ts";
import { useGlobe, type LayerHealth } from "../globeStore.ts";
import { StarField } from "./skyStars.tsx";
import { moonPhaseLabel } from "./skyMoonText.ts";
import { SkyMoon } from "./skyMoon.tsx";
import { SkySun } from "./skySun.tsx";

export default function SkyLayer({ now, tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const setStatus = useGlobe((s) => s.setStatus);
  const status = useGlobe((s) => s.status.stars);
  const selected = useGlobe((s) => s.selected);
  const probeRef = useRef<HTMLSpanElement | null>(null);

  // Test seam only (this lane's brief): a plain DOM node, created and
  // appended imperatively rather than mounted through JSX - a component
  // rendered inside <Canvas> is reconciled by @react-three/fiber's own
  // renderer, which cannot hand a "span" off to react-dom the way
  // React's `createPortal` normally does (reproduced: R3F tried to
  // instantiate it as a THREE class and threw). drei's own <Html> avoids
  // this the same way, with `ReactDOM.createRoot` on a manually-made
  // element (node_modules/@react-three/drei/web/Html.js) - this probe
  // needs no React tree of its own, just somewhere to write two dataset
  // strings, so it skips even that and uses the raw DOM API. Reads the
  // store's health/selection this way because a layer-panel UI (another
  // lane, L5) hasn't been built yet for e2e/globe-L2.spec.ts to read
  // instead.
  useEffect(() => {
    const el = document.createElement("span");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", width: "0", height: "0", overflow: "hidden", pointerEvents: "none" });
    document.body.appendChild(el);
    probeRef.current = el;
    return () => {
      el.remove();
      probeRef.current = null;
    };
  }, []);
  useEffect(() => {
    const el = probeRef.current;
    if (!el) return;
    el.setAttribute("data-sky-status", JSON.stringify(status ?? null));
    el.setAttribute("data-sky-selected", JSON.stringify(selected ?? null));
  }, [status, selected]);

  // The one "stars" status key covers this whole layer (stars + Moon + Sun
  // - all computed, none fetched except the star bin itself): a failed
  // fetch reports failed and draws nothing for the star field (living-earth
  // plan #5/#6.3), everything else still folds the Moon's current phase
  // into the same detail line so a visitor reading the layer panel gets
  // one honest sentence, not three.
  const onStarStatus = useCallback(
    (health: LayerHealth) => {
      if (health.state === "failed") {
        setStatus("stars", health);
        return;
      }
      const phase = moonPhaseLabel(moonPhase(now));
      setStatus("stars", { state: health.state, detail: `${health.detail}; Moon ${phase}` });
    },
    [now, setStatus],
  );

  return (
    <>
      <StarField now={now} tier={tier} onStatus={onStarStatus} />
      <SkySun now={now} />
      <SkyMoon now={now} />
    </>
  );
}
