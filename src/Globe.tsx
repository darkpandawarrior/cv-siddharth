import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Hydrate } from "@tanstack/react-start";
import { load } from "@tanstack/react-start/hydration";
import { ArrowLeft, Clock, Compass, Layers as LayersIcon } from "lucide-react";
import { hasWebGL } from "./blueprintShared.tsx";
import { useSky } from "./lib/useSky.ts";
import { deviceTier } from "./world/deviceTier.ts";
import { GlobeScene } from "./world/globe/GlobeScene.tsx";
import { GlobeHud } from "./world/globe/GlobeHud.tsx";
import { GlobePanel } from "./world/globe/GlobePanel.tsx";
import { buildPuneSelection, PUNE_SELECTION_ID } from "./world/globe/puneSelection.ts";
import { useGlobe, type GlobeSheet } from "./world/globe/globeStore.ts";

// The living-earth UI (layer panel, inspector, time scrubber, tour): client
// only, one lazy chunk each, mounted beside the canvas they drive.
const LayerPanel = lazy(() => import("./world/globe/ui/LayerPanel.tsx"));
const Inspector = lazy(() => import("./world/globe/ui/Inspector.tsx"));
const TimeScrubber = lazy(() => import("./world/globe/ui/TimeScrubber.tsx"));
const GlobeTour = lazy(() => import("./world/globe/ui/GlobeTour.tsx"));
const StreetView = lazy(() => import("./world/globe/ui/StreetView.tsx"));
// The explore bar (place search, "what's here", measure) takes the reserved
// centre band in the top row; see the slot comment below.
const ExploreBar = lazy(() => import("./world/globe/ui/ExploreBar.tsx"));
const StoryPlayer = lazy(() => import("./world/globe/ui/StoryPlayer.tsx"));
const Intro = lazy(() => import("./world/globe/ui/Intro.tsx"));
const SoundToggle = lazy(() => import("./world/globe/ui/SoundToggle.tsx"));
// LANE C1 ("Share a view"): URL state, the Share button and the postcard
// export. One mount, beside the tour pill and SoundToggle in the topbar's
// right cluster (see the mount site below) — see that file's own header for
// why one instance also owns the restore-on-load and debounced address-bar
// write, regardless of which of its two render sites is on screen.
const Briefing = lazy(() => import("./world/globe/ui/Briefing.tsx"));
const ShareView = lazy(() => import("./world/globe/ui/ShareView.tsx"));

const sceneLoadingFallback = (
  <div className="flex h-full items-center justify-center font-mono text-sm text-muted">loading the globe…</div>
);

// Right-edge LayerPanel reservation the top row and the fact list both stay
// clear of, so neither runs under the panel column (233px wide + margins,
// collapsed to a 34px icon + margin) — see LANE U1's composition report for
// the full region map. Pixel values are guidance, not a pixel-exact contract.
// Two forms of the same number: `pr-*` shrinks the top row's own content
// box (it is a normal flow element, not absolutely positioned - see its own
// comment below for why), `right-*` repositions the absolutely positioned
// fact list. Mixing `inset-x-0` and an explicit `right-*` on one element
// risks a Tailwind cascade conflict (utility order in its generated
// stylesheet is not the same as className string order), so anything using
// PANEL_RESERVE_RIGHT sets `left-0` explicitly instead of `inset-x-0`.
const PANEL_RESERVE_PAD = { open: "sm:pr-[249px]", collapsed: "sm:pr-[50px]" };
const PANEL_RESERVE_RIGHT = { open: "sm:right-[249px]", collapsed: "sm:right-[50px]" };

/** The room owns its height and chrome slots, including while lazy UI is pending. */
function useGlobeChromeLayout(capable: boolean, sheet: GlobeSheet, tourStep: number | null) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const [topOffsetPx, setTopOffsetPx] = useState<number | null>(null);
  const selectionId = useGlobe(s => s.selected?.id);
  useEffect(() => {
    const root = rootRef.current, stage = root?.querySelector<HTMLElement>("[data-globe-stage]");
    const facts = root?.querySelector<HTMLElement>("[data-globe-panel]")?.parentElement;
    if (!root || !stage || !facts) return;
    const parent = root.parentElement!, topbar = stage.querySelector<HTMLElement>("[data-globe-topbar]");
    delete stage.dataset.chromeMeasured;
    let frame = 0;
    const measure = () => {
      root.style.height = innerWidth >= 640 ? `${Math.max(0, innerHeight - parent.getBoundingClientRect().top)}px` : "";
      root.style.setProperty("--globe-room-top", `${root.getBoundingClientRect().top}px`);
      const room = stage.getBoundingClientRect(), band = facts.getBoundingClientRect(), gap = 8;
      stage.style.setProperty("--globe-explore-room-w", `${band.width}px`);
      if (topbar) {
        const slot = stage.querySelector<HTMLElement>("[data-globe-inspector], [data-globe-tour], [data-story-chapter-card], [data-film-chapter-card]");
        for (const el of [slot, slot?.querySelector("h2"), slot?.lastElementChild]) if (el) resize.observe(el);
        const scrubber = topbar.querySelector<HTMLElement>("[data-globe-time-scrubber]");
        if (scrubber) resize.observe(scrubber);
        let top = topbar.getBoundingClientRect();
        const [left, right] = [...topbar.children].map(el => el.getBoundingClientRect());
        const width = bar?.offsetWidth ?? 0, height = bar?.offsetHeight ?? 0;
        const centred = room.width >= 640 && right.left - left.right - gap * 2 >= width;
        if (getComputedStyle(document.documentElement).getPropertyValue("--globe-compact").trim() !== "1") {
          const title = slot?.querySelector("h2")?.getBoundingClientRect().height ?? 0;
          const actions = slot?.lastElementChild?.getBoundingClientRect().height ?? 0;
          const reserve = slot?.checkVisibility() ? title + actions + gap * 4 : 0;
          const limit = Math.max(0, band.top - room.top - reserve - (centred ? 0 : height) - gap * 3);
          topbar.style.maxHeight = `${limit}px`;
          const padding = getComputedStyle(topbar);
          topbar.style.setProperty("--globe-rail-max-h", `${Math.max(0, limit - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom))}px`);
          if (scrubber) topbar.style.setProperty("--globe-time-max-h", `${Math.max(0, limit - (scrubber.getBoundingClientRect().top - top.top) - parseFloat(padding.paddingBottom))}px`);
          top = topbar.getBoundingClientRect();
        } else { topbar.style.removeProperty("max-height"); topbar.style.removeProperty("--globe-rail-max-h"); }
        const y = (centred ? top.top + 16 : top.bottom + gap) - room.top;
        const short = getComputedStyle(document.documentElement).getPropertyValue("--globe-short").trim() === "1";
        stage.style.setProperty("--globe-explore-left", `${centred ? (left.right + right.left) / 2 - room.left : short ? room.width - width / 2 - gap * 2 : width / 2 + gap * 2}px`);
        stage.style.setProperty("--globe-explore-top", `${y}px`);
        stage.style.setProperty("--globe-explore-max-h", `${Math.max(0, Math.min(room.bottom, innerHeight) - room.top - y - gap)}px`);
        const bottom = bar?.checkVisibility() ? y + height : 0;
        stage.style.setProperty("--globe-left-slot-top", `${Math.max(top.bottom - room.top, centred ? 0 : bottom) + gap}px`);
        stage.style.setProperty("--globe-top-offset", `${top.height + 16}px`);
        root.style.setProperty("--globe-sheet-max-h", `${Math.max(0, innerHeight - Math.max(top.bottom, room.top + bottom) - gap)}px`);
        setTopOffsetPx(top.height);
      }
      stage.style.setProperty("--globe-facts-reserve", `${Math.max(0, room.bottom - band.top) + gap}px`);
      root.style.setProperty("--globe-facts-max-h", `${Math.max(0, innerHeight - band.top)}px`);
      stage.dataset.chromeMeasured = "true";
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    for (const el of [parent, parent.previousElementSibling, stage, facts, topbar, ...(topbar?.children ?? []), bar]) if (el) resize.observe(el);
    // Direct control mounts can change the clusters; nested readouts use ResizeObserver.
    const mutation = new MutationObserver(schedule);
    if (topbar) for (const el of [topbar, ...topbar.children]) mutation.observe(el, { childList: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [bar, capable, sheet, tourStep, selectionId]);
  return { rootRef, setBar, topOffsetPx };
}

/**
 * /globe - the third altitude (living-ledger-spec.md#6.3): real Earth as a
 * dot matrix, day and night from the real subsolar point, the two reach
 * columns and the employer ring over Pune, live per-country presence,
 * CelesTrak orbits and the local aircraft cluster.
 *
 * `GlobePanel` (the fact list) renders unconditionally - "SSR/no-WebGL
 * renders the same facts as a list" (task 5) - so a visitor without WebGL
 * and the server's own first paint both read the same reach sentences a
 * capable visitor sees beside the 3D scene. Only the canvas is gated behind
 * capability, the same ClientOnly/Hydrate split every other WebGL room here
 * uses (StoryMap.tsx, FoundationGraph.tsx, Playground.tsx's own World):
 * `capable` is a runtime-only flag the bundler can't see through, so
 * `<ClientOnly>` is what strips GlobeScene's three.js import from the SSR
 * compile. Checked once at mount, like Playground.tsx's own `worldCapable`
 * - not re-probed if the OS setting changes mid-session.
 *
 * `capable` is WebGL support ALONE, not reduced-motion too - same fix as
 * Playground.tsx's `worldCapable` (see its own comment): reduced motion is
 * GlobeScene's problem to handle (autoRotate = !reducedMotion &&
 * tier !== 3, live-read by GlobeHud's own useReducedMotion) and GlobeScene
 * already handles it, so a reduced-motion visitor with a working GPU gets
 * the STATIC dot-sphere earth, not the no-WebGL text fallback. Nothing
 * suppresses the scene while the weather poll is still in flight either -
 * `now` falls back to the real wall clock so the earth renders immediately
 * off `useSky`'s clock tick, with day/night and the reach arcs correct from
 * the first frame; `sky.now` only replaces it once useSky's own effect has
 * run (same tick in practice, but the scene never blocks on it).
 *
 * LANE U1 (composition, wave 2): the six wave-1 lanes each built their own
 * piece (HUD, layer panel, inspector, scrubber, tour, Pune card, fact list)
 * with an independently-guessed absolute position, and merged that way -
 * at 1440x900 the scrubber covered the northern hemisphere, "Take the tour"
 * floated over Europe, the layer panel's Keys section was clipped, and the
 * globe room was a fixed 70vh with dead space below it. This file is now
 * the one place that owns the actual region map:
 *
 *   - `data-globe-stage`: the WebGL canvas plus every overlay that has to
 *     resolve its position against the ROOM (not the viewport) - the top
 *     row, the layer panel column, the inspector/tour left slot. Position:
 *     relative, so `position:absolute` descendants land where the numbers
 *     below say, regardless of the top row's own wrapped height.
 *   - `data-globe-topbar`: the ONE shared flex-wrap row for the HUD pills,
 *     the compact time bar, the tour's idle pill and the back-to-orbit
 *     pill. It has to be a CSS *positioned* element to paint above the
 *     WebGL canvas at all (an unpositioned sibling of an absolutely
 *     positioned canvas paints BEHIND it, per the CSS painting order,
 *     regardless of z-index) - which is exactly why GlobeTour's running
 *     card is a SEPARATE mount ("overlay" slot) rather than nested inside
 *     this row: nested here, its own `position:absolute` coordinates would
 *     resolve against the row instead of the stage. ExploreBar uses the
 *     measured centre band when it fits, or stacks below both clusters.
 *   - The hook publishes the left-slot top and fact-list reservation from
 *     their actual bounds. The right LayerPanel column keeps its own band.
 *
 * Phones (< 640): the canvas stage is a fixed ~62svh block ABOVE the fact
 * list in normal flow (not an overlay on top of it) - the previous 70vh
 * canvas with the fact list floating over its lower half is exactly the
 * defect being fixed here.
 */
export function Globe() {
  const sky = useSky();
  const [capable, setCapable] = useState(false);
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  // §2 (Group A): the zoom pill and the pause toggle live in GlobeHud (plain
  // DOM, SSR-safe) but drive GlobeScene's OrbitControls (WebGL-only) — this
  // is the one component that mounts both, so the shared state lives here
  // rather than either one reaching into the other.
  const [zoomInTick, setZoomInTick] = useState(0);
  const [zoomOutTick, setZoomOutTick] = useState(0);
  const [autoRotatePaused, setAutoRotatePaused] = useState(false);
  const markersShown = useGlobe((s) => s.layers.markers);
  const toggleLayer = useGlobe((s) => s.toggleLayer);
  const view = useGlobe((s) => s.view);
  const setView = useGlobe((s) => s.setView);
  const select = useGlobe((s) => s.select);
  const panelOpen = useGlobe((s) => s.panelOpen);
  const sheet = useGlobe((s) => s.sheet);
  const setSheet = useGlobe((s) => s.setSheet);
  const tourStep = useGlobe((s) => s.tourStep);
  const setTourStep = useGlobe((s) => s.setTourStep);
  const { rootRef, setBar, topOffsetPx } = useGlobeChromeLayout(capable, sheet, tourStep);

  useEffect(() => {
    queueMicrotask(() => { setCapable(hasWebGL()); setTier(deviceTier()); });
  }, []);

  // Desktop first load only (task 4): preselect Pune so the Inspector isn't
  // empty on arrival. A later __GLOBE_TEST_SELECT__ or a real click both
  // overwrite `selected` same as ever - this only fires once, and only if
  // nothing has claimed the slot by the time it runs.
  useEffect(() => {
    if (!capable || typeof window === "undefined" || getComputedStyle(document.documentElement).getPropertyValue("--globe-compact").trim() === "1") return;
    if (useGlobe.getState().selected) return;
    const selection = buildPuneSelection();
    if (selection) select(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once when the scene becomes capable, not on every selection change
  }, [capable]);

  const now = sky?.now ?? new Date();
  const showScene = capable;
  const panelReservePad = panelOpen ? PANEL_RESERVE_PAD.open : PANEL_RESERVE_PAD.collapsed;
  const panelReserveRight = panelOpen ? PANEL_RESERVE_RIGHT.open : PANEL_RESERVE_RIGHT.collapsed;

  return (
    <div
      data-globe-root
      ref={rootRef}
      tabIndex={-1}
      className="relative flex h-full w-full flex-col overflow-hidden bg-void sm:block"
    >
      {/* STAGE: the canvas and every overlay whose position resolves against
          the room, not the viewport. ~62svh block on phones (flow, above
          the fact list); fills the root on sm+ (the fact list overlays its
          bottom edge there instead). */}
      <div
        data-globe-stage
        className="relative h-[62svh] w-full shrink-0 sm:absolute sm:inset-0 sm:h-auto"
      >
        {showScene && (
          <ClientOnly fallback={sceneLoadingFallback}>
            <Hydrate when={load()} split fallback={sceneLoadingFallback}>
              <GlobeScene
                now={now}
                tier={tier}
                zoomInTick={zoomInTick}
                zoomOutTick={zoomOutTick}
                autoRotatePaused={autoRotatePaused}
                topOffsetPx={topOffsetPx}
              />
            </Hydrate>
          </ClientOnly>
        )}

        {/* Selection actions precede the controls in keyboard order. */}
        {showScene && <ClientOnly fallback={null}><Suspense fallback={null}><Inspector tier={tier} /></Suspense></ClientOnly>}

        {/* TOP ROW (z-20): HUD pills, the compact time bar, the tour's idle
            pill, the back-to-orbit pill, and (phones only) icon buttons for
            Layers/Time/Tour. Split into a left and a right cluster with a
            reserved centre band for LANE W1's ExploreBar (~377px desktop,
            full width minus 32px on phones - it mounts on its own line
            there, since 360-390px has no room to share with these icons). */}
        {showScene && (
          <div
            data-globe-topbar
            className={`pointer-events-none relative z-20 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-4 ${panelReservePad}`}
          >
            <div className="pointer-events-none flex flex-wrap items-center gap-2 sm:max-w-[38%]">
              <GlobeHud
                sky={sky}
                tier={tier}
                hasWebGL={capable}
                onZoomIn={() => setZoomInTick((t) => t + 1)}
                onZoomOut={() => setZoomOutTick((t) => t + 1)}
                autoRotatePaused={autoRotatePaused}
                onToggleAutoRotate={() => setAutoRotatePaused((p) => !p)}
                markersHidden={!markersShown}
                onToggleMarkers={() => {
                  const hiding = markersShown;
                  toggleLayer("markers");
                  // The ring and the reach columns are what the toggle hides;
                  // a Pune selection with nothing left on screen to point at
                  // has no reason to stay open (task 4).
                  if (hiding && useGlobe.getState().selected?.id === PUNE_SELECTION_ID) select(null);
                }}
              />
              <ClientOnly fallback={null}>
                <Suspense fallback={null}>
                  <TimeScrubber tier={tier} />
                </Suspense>
              </ClientOnly>
            </div>

            <div className="pointer-events-none flex flex-wrap items-center justify-end gap-2 sm:max-w-[38%]">
              <ClientOnly fallback={null}>
                <Suspense fallback={null}>
                  <GlobeTour tier={tier} slot="row" />
                  <ShareView tier={tier} />
                  <Briefing />
                  <SoundToggle tier={tier} />
                </Suspense>
              </ClientOnly>
              {view !== "orbit" && (
                <button
                  type="button"
                  onClick={() => setView("orbit")}
                  className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-accent backdrop-blur hover:text-accent-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ArrowLeft size={12} aria-hidden /> Back to orbit
                </button>
              )}
              {/* Phones only: Layers/Time/Tour open as bottom sheets, one at
                  a time (store.sheet). Inspector has no icon here - a
                  selection itself opens it (Inspector.tsx). */}
              <div className="pointer-events-auto flex items-center gap-2 sm:hidden">
                <button
                  type="button"
                  onClick={() => setSheet(sheet === "layers" ? null : "layers")}
                  aria-pressed={sheet === "layers"}
                  aria-label="Open the layers sheet"
                  className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line bg-ink/70 text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <LayersIcon size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setSheet(sheet === "time" ? null : "time")}
                  aria-pressed={sheet === "time"}
                  aria-label="Open the time sheet"
                  className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line bg-ink/70 text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Clock size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tourStep === null) setTourStep(0);
                    setSheet("tour");
                  }}
                  aria-pressed={sheet === "tour"}
                  aria-label="Open the guided tour"
                  className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line bg-ink/70 text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Compass size={16} aria-hidden />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Panels and cards (z-30): the right-edge layer panel column, the
            shared left slot (inspector or the tour's running card - never
            both), and the street-level hand-off surface. Each resolves its
            own position against this stage. */}
        {showScene && (
          <ClientOnly fallback={null}>
            <Suspense fallback={null}>
              <LayerPanel tier={tier} />
              <GlobeTour tier={tier} slot="overlay" />
              <StreetView tier={tier} />
              <ExploreBar tier={tier} layoutRef={setBar} />
              <StoryPlayer tier={tier} />
              <Intro tier={tier} />
            </Suspense>
          </ClientOnly>
        )}
      </div>

      {/* FACT LIST (z-10): below the stage in flow on phones, overlaying its
          bottom edge on sm+ (stopping short of the layer panel column). */}
      <div
        className={
          capable
            ? `relative z-10 order-2 max-h-[min(38svh,var(--globe-facts-max-h,38svh))] overflow-y-auto bg-gradient-to-t from-ink/95 via-ink/70 to-transparent p-4 sm:absolute sm:bottom-0 sm:left-0 sm:order-none sm:max-h-[45%] sm:p-6 ${panelReserveRight}`
            : "relative z-10 mx-auto max-w-2xl px-6 py-16"
        }
      >
        {!capable && (
          <>
            <p className="section-eyebrow mb-2">// globe</p>
            <h1 className="font-display text-h2 font-bold tracking-tight">The reach, from orbit</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              This browser can't run the 3D globe (no WebGL) - the same facts it would draw, as a list.
            </p>
          </>
        )}
        <GlobePanel />
      </div>
    </div>
  );
}

export default Globe;
