import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { MapPin, MapPinOff, Pause, Play, ZoomIn, ZoomOut } from "lucide-react";
import { WMO_LABEL, type SkyState } from "../../../lib/sky.ts";
import { useGlobe } from "../globeStore.ts";
import { isXrayEnabled, setXrayEnabled, subscribeXray } from "../layers/xrayState.ts";

// LANE V4 (hover readout): lazy so this chunk never joins the Globe shell.
// `<ClientOnly>`, not just `lazy()`, is load-bearing here -- `lazy()` alone
// does not keep a module off the SSR bundle (vite.config.ts's own
// importProtection comment), and exploreCanvas.ts imports "three" for its
// raycast. `<ClientOnly>` is the same wrapper Globe.tsx already gives this
// row's sibling, TimeScrubber, for the identical reason.
const HoverReadout = lazy(() => import("./HoverReadout.tsx"));
// LANE C4 ("Living daylight"): same reasoning as HoverReadout above -- it
// shares layers/daylight.ts with the R3F DaylightLayer (three-typed
// uniform helpers live there too), so it is lazy for the same reason.
const DaylightReadout = lazy(() => import("./DaylightReadout.tsx"));

// LANE S2 (space weather): same lazy + ClientOnly reasoning as HoverReadout
// above — this chunk must never join the eager "Globe" shell, and its own
// live-signal fetches have no business running on the server.
const SpaceWeather = lazy(() => import("./SpaceWeather.tsx"));

// Restated from SceneActivity.tsx's own useReducedMotion rather than
// imported: that file also exports SceneActivity, which statically imports
// @react-three/fiber, and this component is SSR-rendered (GlobePanel's own
// "SSR renders the same facts" contract) - a plain import of any name from
// that module drags the r3f import into the server bundle too, which the
// import-protection plugin denies outright (verified: `npx vite build`
// fails with "Import denied in server environment... @react-three/fiber").
const COMPACT_QUERY = "(max-width: 639px), (max-height: 500px)";
function subscribeCompact(callback: () => void) {
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export interface GlobeHudProps {
  sky: SkyState | null;
  tier: 1 | 2 | 3;
  hasWebGL: boolean;
  /** Zoom-pill + pause-toggle wiring (§2) — omitted (no-WebGL branch) means
   *  there's no scene to drive, so the controls simply don't render. */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  autoRotatePaused?: boolean;
  onToggleAutoRotate?: () => void;
  /** Hides the reach columns and employer ring for a clean view of the
   *  earth; the same button brings them back. */
  markersHidden?: boolean;
  onToggleMarkers?: () => void;
}

/**
 * GLOBE's origin chip (living-ledger-spec.md#6.3 task 2): "Pune origin lit
 * by useSky().daypart... with today's weather glyph." The "glyph" is a
 * plain WMO_LABEL word (sky.ts, the same table SiteFooter's own weather chip
 * reads) rather than an emoji - "no emoji as data" (G8) rules that out even
 * for decorative chrome.
 *
 * Also carries `data-autorotate` - whether OrbitControls is actually
 * spinning right now (off under reduced motion or at T3, "ambient off at
 * T3, auto-rotate frozen at T3") - the one flag e2e/globe.spec.ts reads for
 * that acceptance line. Rendered in both the WebGL and the no-WebGL branch
 * (Globe.tsx): there is always a Pune reading, even when there is nothing
 * to orbit.
 *
 * LANE U1 (composition): used to wrap itself in its own absolutely
 * positioned top-left corner. Six lanes each doing that independently is the
 * bug this lane exists to fix — this now returns a flat run of pills, and
 * Globe.tsx's single shared top-row bar lays them out alongside the time bar
 * and the tour/back-to-orbit pills, so the whole row wraps together instead
 * of five components silently overlapping. Every pill keeps the same ~30px
 * height (px-3 py-1.5 on text-xs) the rest of that row matches.
 */
export default function GlobeHud({ sky, tier, hasWebGL, onZoomIn, onZoomOut, autoRotatePaused = false, onToggleAutoRotate, markersHidden = false, onToggleMarkers }: GlobeHudProps) {
  const reducedMotion = useReducedMotion();
  const compact = useSyncExternalStore(subscribeCompact, () => window.matchMedia(COMPACT_QUERY).matches, () => false);
  const overflow = useRef<HTMLDetailsElement>(null);
  const sheet = useGlobe(s => s.sheet);
  useEffect(() => { if (sheet && compact && overflow.current) overflow.current.open = false; }, [sheet, compact]);
  const autoRotate = hasWebGL && !reducedMotion && tier !== 3 && !autoRotatePaused;
  const daypart = sky?.daypart ?? null;
  const tempC = sky?.weather?.tempC;
  const weatherLabel = sky?.weather ? WMO_LABEL[sky.weather.code] : undefined;
  const xrayOn = useSyncExternalStore(subscribeXray, isXrayEnabled, () => false);
  // LANE C2: "x" toggles X-ray mode from anywhere on the page, not just
  // while a control has focus -- inlined rather than a shared helper: the
  // only other typing-target guard in this tree (GlobeScene.tsx's own, for
  // +/- zoom) lives in a file this lane doesn't own.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "x" && e.key !== "X") return;
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      setXrayEnabled(!isXrayEnabled());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const weather = (
      <div
        data-globe-weather
        data-autorotate={autoRotate ? "on" : "off"}
        className="flex items-center gap-2 rounded-full glass-panel px-3 py-1.5 font-mono text-xs text-zinc-300"
      >
        <span>
          Pune{daypart ? ` · ${daypart}` : ""}
          {weatherLabel ? ` · ${weatherLabel}` : ""}
          {tempC != null ? ` · ${Math.round(tempC)}°C` : ""}
        </span>
        {hasWebGL && <span className="hidden text-muted sm:inline">{"· drag to orbit"}</span>}
      </div>
  );
  const controls = <>
      {hasWebGL && <ClientOnly fallback={null}><Suspense fallback={null}><HoverReadout /></Suspense></ClientOnly>}
      {hasWebGL && <ClientOnly fallback={null}><Suspense fallback={null}><DaylightReadout /></Suspense></ClientOnly>}
      {hasWebGL && <ClientOnly fallback={null}><Suspense fallback={null}><SpaceWeather /></Suspense></ClientOnly>}
      {/* The toggle stays here; LayerPanel owns the readout at every width. */}
      {hasWebGL && (
          <button
            type="button"
            onClick={() => setXrayEnabled(!xrayOn)}
            aria-pressed={xrayOn}
            aria-label={xrayOn ? "Turn off X-ray mode" : "Turn on X-ray mode"}
            data-xray-toggle
            className="ctrl-icon pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full glass-panel text-xs font-bold text-zinc-300 hover:text-accent aria-pressed:text-accent aria-pressed:bg-white/10"
          >
            X
          </button>
      )}
      {/* §2, Auto-rotate row: a real toggle, not just a passive fact — and
          shown at every breakpoint (the drag hint above stays sm:-only, but
          this is the one accessible affordance a touch/keyboard visitor has
          for stopping the spin without reaching for OS-level reduced motion). */}
      {hasWebGL && onToggleAutoRotate && (
        <button
          type="button"
          onClick={onToggleAutoRotate}
          aria-pressed={autoRotatePaused}
          aria-label={autoRotatePaused ? "Resume the globe's ambient rotation" : "Pause the globe's ambient rotation"}
          className="ctrl-icon pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full glass-panel text-zinc-300 hover:text-accent aria-pressed:text-accent aria-pressed:bg-white/10"
        >
          {autoRotatePaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      )}
      {hasWebGL && onToggleMarkers && (
        <button
          type="button"
          onClick={onToggleMarkers}
          aria-pressed={markersHidden}
          aria-label={markersHidden ? "Show the Pune ring and reach columns" : "Hide the Pune ring and reach columns"}
          title={markersHidden ? "Show markers" : "Hide markers"}
          className="ctrl-icon pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full glass-panel text-zinc-300 hover:text-accent aria-pressed:text-accent aria-pressed:bg-white/10"
        >
          {markersHidden ? <MapPinOff size={16} /> : <MapPin size={16} />}
        </button>
      )}
      {hasWebGL && onZoomIn && onZoomOut && (
        <div className="pointer-events-auto flex items-center rounded-full glass-panel">
          <button type="button" onClick={onZoomOut} aria-label="Zoom out" className="ctrl-icon rounded-full p-1.5 text-zinc-300 hover:text-accent">
            <ZoomOut size={16} />
          </button>
          <button type="button" onClick={onZoomIn} aria-label="Zoom in" className="ctrl-icon rounded-full p-1.5 text-zinc-300 hover:text-accent">
            <ZoomIn size={16} />
          </button>
        </div>
      )}
  </>;
  return <>
    {!compact && weather}
    {compact ? <details ref={overflow} data-hud-overflow onToggle={event => {
      if (event.currentTarget.open) {
        useGlobe.getState().setSheet(null);
        window.dispatchEvent(new Event("globe-explore-close"));
      }
    }}>
      <summary className="pointer-events-auto flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full glass-panel px-3 font-mono text-xs text-zinc-300">Controls</summary>
      <div data-globe-overflow className="pointer-events-none">{weather}{controls}</div>
    </details> : controls}
  </>;
}
