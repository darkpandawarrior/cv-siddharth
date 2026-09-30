import { HazardLegend, Legend } from "./Legend.tsx";
import { GIBS_BASES } from "../layers/gibsCatalog.ts";
import { WIND_LEGEND } from "../layers/windField.ts";
import { DENSITY_LEGEND } from "../layers/hexbin.ts";
import { DAYLIGHT_LEGEND, ECLIPSE_LEGEND } from "../layers/layerKeys.ts";
import { isXrayEnabled, setXrayEnabled, subscribeXray } from "../layers/xrayState.ts";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Layers, X } from "lucide-react";
import { flushSync } from "react-dom";
import type { Vector3 } from "three";
import { PUNE } from "../../../lib/sky.ts";
import { entityPositions, LAYER_IDS, useGlobe, type EarthStyle, type ImageryStack, type LayerId, type LayerHealth } from "../globeStore.ts";
// WAVE 6 LANE X1 (live world feed): the "Layers | Live" tab this file adds
// below renders FeedRail for the "Live" tab; every other line in this file
// is unchanged.
import FeedRail from "./FeedRail.tsx";
// WAVE 6 LANE X6 needed a true in-sheet row instead of floating a second
// button over this sheet's own content (see that file's own "Needs from
// integration" comment) — LANE H1 (integration) adds the slot here.
import { SoundToggleSlot } from "./SoundToggle.tsx";
// LANE C1 ("Share a view"): same in-sheet-row shape as SoundToggleSlot
// above, for the same reason — phones get the Share/Postcard popover as a
// header row here rather than a second floating button.
import { ShareSlot } from "./ShareView.tsx";
// LANE P1 (wave 7): the preset chip row — pure preset data/diff logic lives
// in its own file so it is unit-testable without mounting this component.
import { LAYER_PRESETS, layerIdsToToggle, presetCaveat, presetImagery, presetLayerRecord, type LayerPreset } from "./layerPresets.ts";

const XRay = lazy(() => import("./XRay.tsx"));
const PHONE_QUERY = "(max-width: 639px)";
function subscribePhone(listener: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function isPhone() { return window.matchMedia(PHONE_QUERY).matches; }

function ImagerySection() {
  const imagery = useGlobe((s) => s.imagery);
  const [opened, setOpened] = useState(false);
  const [Catalog, setCatalog] = useState<typeof import("./LayerCatalog.tsx").default | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!opened || Catalog || failed) return;
    let active = true;
    // The continuous scene loop can starve a Suspense retry. Commit this
    // user-requested DOM update once the lazy module settles instead.
    import("./LayerCatalog.tsx").then(
      ({ default: catalog }) => { if (active) flushSync(() => setCatalog(() => catalog)); },
      () => { if (active) flushSync(() => setFailed(true)); },
    );
    return () => { active = false; };
  }, [opened, Catalog, failed]);
  const base = GIBS_BASES.find((entry) => entry.id === imagery.base);
  return <details className="mt-3" onToggle={(event) => setOpened(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer rounded py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      Imagery
      <span className="block break-words text-xs font-mono text-muted">{base?.title ?? imagery.base} · {imagery.overlays.length} active overlays</span>
    </summary>
    {opened && (Catalog ? <Catalog /> : <p role="status" className="text-sm text-muted">{failed ? "Imagery choices unavailable. Reload to try again." : "Loading imagery choices…"}</p>)}
  </details>;
}

export function EarthStatus({ health, style, tier }: { health: LayerHealth | null | undefined; style: EarthStyle; tier: 1 | 2 | 3 }) {
  return <p data-earth-status-line role="status" className={`mt-2 break-words text-muted ${health?.state === "live" || health?.state === "snapshot" ? "text-xs font-mono" : "text-sm"}`}>
    {style === "dots" ? "Showing dots. Real imagery is off." : tier === 3 ? "Showing dots. Real imagery is unavailable at this graphics tier." : health?.state === "failed" ? `Imagery unavailable, showing dots. ${health.detail ?? ""}` : !health ? "Showing dots while imagery starts." : health.state === "loading" ? "Loading imagery…" : health.detail ?? "Imagery loaded"}
  </p>;
}

// The ISS as SatelliteLayer registers it: `sat:<NORAD id>`.
const ISS_ENTITY = "sat:25544";

/** LANE L5 (navigation and UI) wrote the layer/view logic; LANE U1
 *  (composition) owns this file's shell: the right-edge column (sm+,
 *  collapsible to a 34px icon via `store.panelOpen`, top16/bottom16 so its
 *  own content scrolls instead of clipping) and the phone bottom sheet
 *  (`store.sheet === "layers"`, opened by Globe.tsx's icon row). */

declare global {
  interface Window {
    __GLOBE_TEST_SET_ENTITY__?: (id: string, pos: { x: number; y: number; z: number }, health?: LayerHealth) => void;
  }
}

// e2e-only seam, the same shape as Inspector.tsx's __GLOBE_TEST_SELECT__: the
// ISS is registered by lane L3's SatelliteLayer, which this worktree does not
// have, so a "Follow the ISS" e2e test otherwise has no real entity to grab
// onto. A test can register a stand-in position directly; nothing outside a
// test ever calls this, so it is a no-op in production. The cast is honest
// about its scope: every real consumer (CameraDirector.tsx) only ever reads
// .x/.y/.z off what an entityPositions getter returns.
if (typeof window !== "undefined") {
  window.__GLOBE_TEST_SET_ENTITY__ = (id, pos, health) => {
    if (health) useGlobe.getState().setStatus("satellites", health);
    entityPositions.set(id, () => ({ x: pos.x, y: pos.y, z: pos.z }) as unknown as Vector3);
  };
}

// A label for every LayerId - the Record type below fails to compile if a
// future layer (e.g. "wind", "reach") lands without one, so this list can
// never silently drift behind globeStore's own LAYER_IDS.
const LABEL: Record<LayerId, string> = {
  markers: "Pune markers",
  stars: "Stars and Moon",
  satellites: "Satellites",
  aircraft: "Aircraft",
  presence: "Visitors",
  pulses: "Live pulses",
  buoys: "Ocean buoys",
  hazards: "Earth events",
  wind: "Wind",
  reach: "My apps and repos",
  countries: "Countries",
  together: "Explorers here now",
  density: "Quake and fire density",
  guide: "My Maps places",
  daylight: "Golden hour and waking cities",
  eclipse: "Eclipse paths",
};

// Same guard as GlobeScene.tsx's own isTypingTarget, restated per this
// lane's own instructions rather than imported from a file it may not edit.
function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** The health dot's colour + whether it should read as "still settling"
 *  (a soft pulse) rather than a fixed state. `undefined` (a layer that
 *  hasn't reported at all, e.g. its lane not yet merged) reads the same as
 *  "loading": never green, never silently absent. */
function dotStyle(health: LayerHealth | undefined): { color: string; pulse: boolean } {
  switch (health?.state) {
    case "live":
      return { color: "var(--color-signal)", pulse: false };
    case "snapshot":
      return { color: "var(--color-probe)", pulse: false };
    case "failed":
      return { color: /unreachable|unavailable|off at this tier/i.test(health.detail ?? "") ? "var(--color-degraded)" : "var(--color-danger)", pulse: false };
    default:
      return { color: "#71717a", pulse: true };
  }
}

export function LayerRows({ layers, status, toggleLayer }: { layers: Record<LayerId, boolean>; status: Partial<Record<LayerId, LayerHealth>>; toggleLayer: (id: LayerId) => void }) {
  return (
    <ul className="space-y-1">
      {LAYER_IDS.map((id) => {
        const health = status[id];
        const dot = dotStyle(health);
        const on = layers[id];
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => toggleLayer(id)}
              aria-pressed={on}
              className="flex min-h-11 w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot.pulse ? "animate-pulse" : ""}`} style={{ backgroundColor: dot.color }} />
              <span className={`min-w-0 flex-1 break-words ${on ? "text-zinc-200" : "text-zinc-400"}`}>{LABEL[id]}</span>
            </button>
            {on && id === "wind" && <Legend legend={WIND_LEGEND} />}
            {on && id === "density" && <Legend legend={DENSITY_LEGEND} />}
            {on && id === "hazards" && <HazardLegend />}
            {on && id === "eclipse" && <Legend legend={ECLIPSE_LEGEND} />}
            {on && id === "daylight" && <Legend legend={DAYLIGHT_LEGEND} />}
            {health?.detail && (
              <p className="ml-4 break-words font-mono text-xs text-muted">
                {health.detail}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Matches LayerCatalog.tsx's own (unexported) DEFAULT_OVERLAY_OPACITY — a
// preset-added overlay should look the same as one a visitor turns on by
// hand, not fainter or louder for no reason.
const PRESET_OVERLAY_OPACITY = 0.75;

interface PresetSnapshot {
  storyArcsOn: boolean;
  cloudsOn: boolean;
  layers: Record<LayerId, boolean>;
  style: EarthStyle;
  imagery: ImageryStack;
}

/** A row of chips that set a curated layer/imagery combination in one tap
 *  (brief: "layer presets"). Each apply snapshots the PRE-preset state so
 *  the single "Restore" chip can undo it exactly, one level deep — a second
 *  preset tap overwrites the snapshot rather than stacking undo levels,
 *  since the brief only asks for "the previous set", not a full history. */
function PresetChips({ touchTarget }: { touchTarget: string }) {
  const layers = useGlobe((s) => s.layers);
  const toggleLayer = useGlobe((s) => s.toggleLayer);
  const style = useGlobe((s) => s.style);
  const setStyle = useGlobe((s) => s.setStyle);
  const imagery = useGlobe((s) => s.imagery);
  const setImagery = useGlobe((s) => s.setImagery);
  const status = useGlobe((s) => s.status);
  const storyArcsOn = useGlobe((s) => s.storyArcsOn);
  const setStoryArcsOn = useGlobe((s) => s.setStoryArcsOn);
  const cloudsOn = useGlobe((s) => s.cloudsOn);
  const setCloudsOn = useGlobe((s) => s.setCloudsOn);
  const [activePreset, setActivePreset] = useState<LayerPreset | null>(null);
  const previous = useRef<PresetSnapshot | null>(null);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const apply = (preset: LayerPreset) => {
    previous.current = { layers, style, imagery, cloudsOn, storyArcsOn };
    if (preset.storyArcsOn !== undefined) setStoryArcsOn(preset.storyArcsOn);
    setActivePreset(preset);
    if (preset.cloudsOn !== undefined) setCloudsOn(preset.cloudsOn);
    setHasPrevious(true);
    for (const id of layerIdsToToggle(layers, presetLayerRecord(LAYER_IDS, preset), LAYER_IDS)) toggleLayer(id);
    if (preset.style !== undefined && preset.style !== style) setStyle(preset.style);
    const nextImagery = presetImagery(imagery, preset, PRESET_OVERLAY_OPACITY);
    if (nextImagery !== imagery) setImagery(nextImagery);
    setAnnouncement(preset.summary);
  };

  const restore = () => {
    const snapshot = previous.current;
    if (!snapshot) return;
    for (const id of layerIdsToToggle(layers, snapshot.layers, LAYER_IDS)) toggleLayer(id);
    if (snapshot.style !== style) setStyle(snapshot.style);
    if (JSON.stringify(snapshot.imagery) !== JSON.stringify(imagery)) setImagery(snapshot.imagery);
    setCloudsOn(snapshot.cloudsOn);
    setStoryArcsOn(snapshot.storyArcsOn);
    setActivePreset(null);
    previous.current = null;
    setHasPrevious(false);
    setAnnouncement("Restored the layers and imagery from before that preset.");
  };

  const caveat = activePreset ? presetCaveat(activePreset, status) : null;
  return (
    <section className="mb-4" data-globe-presets data-clouds-on={cloudsOn} data-story-arcs-on={storyArcsOn}>
      <h3 className="mb-2 text-sm font-semibold text-muted">Presets</h3>
      <div className="flex flex-wrap gap-1">
        {LAYER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.summary}
            onClick={() => apply(preset)}
            className={`rounded-full border border-line px-2 ${touchTarget} text-sm text-zinc-300 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
          >
            {preset.label}
          </button>
        ))}
        {hasPrevious && (
          <button
            type="button"
            onClick={restore}
            className={`rounded-full border border-accent/60 px-2 ${touchTarget} text-sm text-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
          >
            Restore
          </button>
        )}
      </div>
      {/* Says what the chip turned on for every visitor, not just a mouse
          hover reading the `title` above (G8 + accessibility: a claim needs
          a channel every visitor gets, not just a sighted mouse user). */}
      <p data-preset-announcement role="status" aria-live="polite" className="mt-1 min-h-[1em] text-sm text-muted" style={caveat ? { color: "var(--color-warn)" } : undefined}>
        {announcement} {caveat}
      </p>
    </section>
  );
}

// WAVE 6 LANE X1: which of the panel's two tabs is showing — component
// state, not globeStore, since nothing outside this file's own two render
// sites (desktop column, phone sheet) needs to read or drive it.
type PanelTab = "layers" | "live";

function TabSwitcher({ tab, setTab }: { tab: PanelTab; setTab: (t: PanelTab) => void }) {
  return (
    <div className="mb-4 flex overflow-hidden rounded-full border border-line" role="tablist" aria-label="Layer panel tabs">
      {(["layers", "live"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          data-feed-tab={t}
          onClick={() => setTab(t)}
          className={`flex-1 min-h-11 min-w-11 px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            tab === t ? "bg-accent/20 text-accent" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {t === "layers" ? "Layers" : "Live"}
        </button>
      ))}
    </div>
  );
}

export default function LayerPanel({ tier }: { tier: 1 | 2 | 3 }) {
  const [tab, setTab] = useState<PanelTab>("layers");
  const xrayOn = useSyncExternalStore(subscribeXray, isXrayEnabled, () => false);
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const panelOpen = useGlobe((s) => s.panelOpen);
  const setPanelOpen = useGlobe((s) => s.setPanelOpen);
  const sheet = useGlobe((s) => s.sheet);
  const setSheet = useGlobe((s) => s.setSheet);
  const [issAvailable, setIssAvailable] = useState(false);
  const style = useGlobe((s) => s.style);
  const setStyle = useGlobe((s) => s.setStyle);
  const layers = useGlobe((s) => s.layers);
  const toggleLayer = useGlobe((s) => s.toggleLayer);
  const view = useGlobe((s) => s.view);
  const setView = useGlobe((s) => s.setView);
  const flyTo = useGlobe((s) => s.flyTo);
  const status = useGlobe((s) => s.status);
  const setTourStep = useGlobe((s) => s.setTourStep);

  useEffect(() => {
    if (!xrayOn) return;
    if (phone) setSheet("layers");
    else setPanelOpen(true);
  }, [xrayOn, phone, setPanelOpen, setSheet]);

  const xrayReadout = xrayOn && <ClientOnly fallback={null}><Suspense fallback={<p role="status">Loading X-ray readings…</p>}><XRay tier={tier} /></Suspense></ClientOnly>;

  // entityPositions is a plain module-level Map (living-earth's "one globe"
  // seam, not a store slice), so whether the ISS is registered can only be
  // polled, not subscribed to. Once a second is cheap DOM-side UI, nowhere
  // near the per-frame budget the R3F rules guard.
  useEffect(() => {
    const check = () => setIssAvailable(entityPositions.has(ISS_ENTITY));
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "l") {
        setPanelOpen(!panelOpen);
        return;
      }
      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= LAYER_IDS.length) {
        toggleLayer(LAYER_IDS[digit - 1]);
        return;
      }
      if (key === "r") setStyle("imagery");
      else if (key === "d") setStyle("dots");
      else if (key === "o") setView("orbit");
      else if (key === "g") {
        flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon });
        setView("ground");
      } else if (key === "f" && issAvailable) {
        flyTo({ kind: "entity", id: ISS_ENTITY });
        setView("follow");
      } else if (key === "t") {
        setTourStep(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, setPanelOpen, toggleLayer, setStyle, setView, flyTo, setTourStep, issAvailable]);

  const viewButtons = (touchTarget: string) => (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setView("orbit")}
        aria-pressed={view === "orbit"}
        className={`block w-full rounded px-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
          view === "orbit" ? "bg-accent/20 text-accent" : "text-zinc-300 hover:bg-white/5"
        }`}
      >
        Orbit
      </button>
      <button
        type="button"
        onClick={() => {
          flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon });
          setView("ground");
        }}
        aria-pressed={view === "ground"}
        className={`block w-full rounded px-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
          view === "ground" ? "bg-accent/20 text-accent" : "text-zinc-300 hover:bg-white/5"
        }`}
      >
        Look up from Pune
      </button>
      {/* Street-level entry point for lane W3's surface - this lane only
          ever sets store state (flyTo + setView("street")); the surface
          itself is StreetView.tsx, not ours. */}
      <button
        type="button"
        onClick={() => {
          flyTo({ kind: "latlon", lat: PUNE.lat, lon: PUNE.lon });
          setView("street");
        }}
        aria-pressed={view === "street"}
        className={`block w-full rounded px-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
          view === "street" ? "bg-accent/20 text-accent" : "text-zinc-300 hover:bg-white/5"
        }`}
      >
        Street level at Pune
      </button>
      <button
        type="button"
        onClick={() => {
          if (!issAvailable) return;
          flyTo({ kind: "entity", id: ISS_ENTITY });
          setView("follow");
        }}
        aria-pressed={view === "follow"}
        disabled={!issAvailable}
        title={issAvailable ? undefined : "No ISS position yet"}
        className={`block w-full rounded px-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
          !issAvailable ? "cursor-not-allowed text-zinc-400" : view === "follow" ? "bg-accent/20 text-accent" : "text-zinc-300 hover:bg-white/5"
        }`}
      >
        Follow the ISS{!issAvailable ? " (no ISS registered yet)" : ""}
      </button>
    </div>
  );

  const earthStyleToggle = (
    <div className="flex overflow-hidden rounded-full border border-line" role="group" aria-label="Earth style">
      {(["imagery", "dots"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setStyle(s)}
          aria-pressed={style === s}
          className={`flex-1 min-h-11 min-w-11 px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
            style === s ? "bg-accent/20 text-accent" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {s === "imagery" ? "Real imagery" : "Dots"}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop/tablet (sm+): a right-edge column, top16/bottom16, its own
          content scrolling rather than clipping (the Keys section used to
          be cut off at the bottom - measured via screenshot QA). Collapses
          to a 34px icon; open by default at >= 1280 (globeStore's own
          matchMedia default), collapsed below it. */}
      {panelOpen ? (
        <div
          data-globe-layer-panel
          className="pointer-events-auto absolute right-4 top-[min(var(--globe-top-offset,5rem),20rem)] z-30 hidden w-[233px] flex-col overflow-hidden rounded-2xl glass-panel font-body text-sm text-zinc-300 sm:bottom-4 sm:flex"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line p-3">
            <h2 className="text-base font-semibold text-zinc-200">Layers</h2>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-pressed
              aria-label="Collapse the layers panel"
              title="Collapse (L)"
              className="ctrl-icon flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={13} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!phone && xrayReadout}
            <TabSwitcher tab={tab} setTab={setTab} />
            {tab === "live" ? (
              <FeedRail tier={tier} />
            ) : (
              <>
                <PresetChips touchTarget="min-h-11" />
                <section className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-muted">Earth</h3>
                  {earthStyleToggle}
                  <EarthStatus health={status.earth} style={style} tier={tier} />
                  <div className="mt-4">
                    <h3 className="mb-2 text-sm font-semibold text-muted">Layers</h3>
                    <LayerRows layers={layers} status={status} toggleLayer={toggleLayer} />
                  </div>
                  <ImagerySection />
                </section>
                <section className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-muted">Views</h3>
                  {viewButtons("min-h-11")}
                </section>
                <section>
                  <h3 className="mb-1 text-sm font-semibold text-muted">Keys</h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    X X-ray · / or Cmd-K search · L panel · 1-{LAYER_IDS.length} layers · R/D earth · O/G/F views · T tour · Esc back · [ ] scrub 1h · Space play
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-pressed={false}
          aria-label="Open the layers panel"
          title="Layers (L)"
          className="ctrl-icon pointer-events-auto absolute right-4 top-4 z-30 hidden min-h-11 min-w-11 items-center justify-center rounded-full glass-panel text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:flex"
        >
          <Layers size={15} />
        </button>
      )}

      {/* Phone (< 640): a bottom sheet, one of store.sheet's four. Height
          capped from the measured topbar bottom (Globe.tsx's own
          --globe-sheet-max-h, task H1 #3), not a bare 70vh — on a short
          viewport a fixed 70vh reaches up over the topbar's own icon row
          (measured: 390x844 puts the sheet's top edge above it), which then
          intercepts clicks meant for the Time/Tour buttons underneath. */}
      {sheet === "layers" && (
        <div
          data-globe-layer-sheet
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[min(70vh,var(--globe-sheet-max-h,70vh))] w-full overflow-y-auto rounded-t-2xl glass-panel p-4 font-body text-sm text-zinc-300 sm:hidden"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-200">Layers</h2>
            <div className="flex items-center gap-2">
              <ShareSlot />
              <SoundToggleSlot />
              <button
                type="button"
                onClick={() => setSheet(null)}
                aria-label="Close the layers sheet"
                className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <button
            type="button"
            data-xray-sheet-toggle
            aria-pressed={xrayOn}
            onClick={() => setXrayEnabled(!xrayOn)}
            className="mb-2 flex min-h-11 min-w-11 w-full items-center justify-between rounded border border-line px-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span>X-ray mode</span><span>{xrayOn ? "On" : "Off"}</span>
          </button>
          {phone && xrayReadout}
          <TabSwitcher tab={tab} setTab={setTab} />
          {tab === "live" ? (
            <FeedRail tier={tier} />
          ) : (
            <>
              <PresetChips touchTarget="min-h-11" />
              <section className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-muted">Earth</h3>
                  {earthStyleToggle}
                  <EarthStatus health={status.earth} style={style} tier={tier} />
                  <div className="mt-4">
                    <h3 className="mb-2 text-sm font-semibold text-muted">Layers</h3>
                    <LayerRows layers={layers} status={status} toggleLayer={toggleLayer} />
                  </div>
                  <ImagerySection />
                </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-muted">Views</h3>
                {viewButtons("min-h-11")}
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
