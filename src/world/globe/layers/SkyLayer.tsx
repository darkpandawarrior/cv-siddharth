/** LANE L2 (real sky: stars, moon, sun) owns this file; LANE W4 (wave 3)
 *  composes its own constellations/planets pieces in here too, per its own
 *  brief ("compose your new pieces in" SkyLayer.tsx). */
import { useCallback, useEffect, useRef, useState } from "react";
import { moonPhase } from "../../../lib/moon.ts";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import type { TleObject } from "../../../lib/satellites.ts";
import { useGlobe, type LayerHealth } from "../globeStore.ts";
import { StarField } from "./skyStars.tsx";
import { moonPhaseLabel } from "./skyMoonText.ts";
import { SkyMoon } from "./skyMoon.tsx";
import { SkySun } from "./skySun.tsx";
import SkyConstellations from "./skyConstellations.tsx";
import SkyPlanets from "./skyPlanets.tsx";

const ISS_NORAD = "25544";

export default function SkyLayer({ now, tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const setStatus = useGlobe((s) => s.setStatus);
  const status = useGlobe((s) => s.status.stars);
  const selected = useGlobe((s) => s.selected);
  const probeRef = useRef<HTMLSpanElement | null>(null);

  // LANE W4: "a small 'ISS visible tonight at 19:42 from Pune' style line in
  // the sky status detail when a visible pass is within 24h." Reads the same
  // public /api/tle feed SatelliteLayer.tsx already polls (a second
  // subscriber to a GET endpoint costs nothing extra — useLiveSignal caches
  // per URL) rather than threading data through a file this lane may only
  // touch for its own pass rows. `/api/tle` 404s under vite dev/preview the
  // same way it does for every other consumer — issLine just stays null,
  // "never fake data" holds without any special-casing here.
  const { data: tleFeed } = useLiveSignal<{ connected: boolean; objects: TleObject[] }>("/api/tle", 2 * 60 * 60_000);
  const [issLine, setIssLine] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const iss = tleFeed?.connected ? tleFeed.objects.find((o) => o.norad === ISS_NORAD) : undefined;
    // Dynamic import, not a static one: satPasses.ts pulls in
    // src/lib/satellites.ts (satellite.js's own SGP4), and a STATIC import
    // here would give that dependency a second lazy-chunk consumer (this
    // file, alongside SatelliteLayer.tsx) — Rollup then lists the extra
    // chunk in the eager "Globe" shell's own preload manifest for this
    // file's dynamic import, past budgets.json's ceiling (measured:
    // +469 B, `node scripts/check-budget.mjs`). A runtime import() keeps
    // that dependency behind ITS OWN chunk boundary, invisible to the
    // shell's static preload analysis — same "second consumer promotes a
    // shared util into the eager shell" story skyStars.tsx's own
    // useReducedMotion restatement and SatelliteLayer.tsx's own PROBE_COLOR
    // literal already describe, just solved here with import() instead of
    // restating the math (there is no small restatement of SGP4 to make).
    //
    // Every branch resolves through a promise (even the "no ISS" one, via
    // Promise.resolve(null)) so every setIssLine call lands inside a .then,
    // never synchronously in the effect body.
    const linePromise: Promise<string | null> = iss
      ? import("./satPasses.ts").then(({ nextVisiblePassDetail, tonightLine }) =>
          nextVisiblePassDetail(iss, now).then((pass) => tonightLine(pass, now, "ISS")),
        )
      : Promise.resolve(null);
    linePromise
      .then((line) => {
        if (alive) setIssLine(line);
      })
      .catch(() => {
        if (alive) setIssLine(null);
      });
    return () => {
      alive = false;
    };
  }, [tleFeed, now]);

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
      const tail = issLine ? `; ${issLine}` : "";
      setStatus("stars", { state: health.state, detail: `${health.detail}; Moon ${phase}${tail}` });
    },
    [now, setStatus, issLine],
  );

  return (
    <>
      <StarField now={now} tier={tier} onStatus={onStarStatus} />
      <SkySun now={now} />
      <SkyMoon now={now} />
      {/* LANE W4: constellation figures + planets, same tier ladder as the
          star field (T3 draws neither at all). */}
      <SkyConstellations now={now} tier={tier} />
      <SkyPlanets now={now} tier={tier} />
    </>
  );
}
