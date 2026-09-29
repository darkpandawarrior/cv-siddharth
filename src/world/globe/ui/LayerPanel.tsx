import { useEffect, useState } from "react";
import { Layers, X } from "lucide-react";
import type { Vector3 } from "three";
import { PUNE } from "../../../lib/sky.ts";
import { entityPositions, LAYER_IDS, useGlobe, type LayerId, type LayerHealth } from "../globeStore.ts";
// WAVE 6 LANE X1 (live world feed): the "Layers | Live" tab this file adds
// below renders FeedRail for the "Live" tab; every other line in this file
// is unchanged.
import FeedRail from "./FeedRail.tsx";

// The ISS as SatelliteLayer registers it: `sat:<NORAD id>`.
const ISS_ENTITY = "sat:25544";

/** LANE L5 (navigation and UI) wrote the layer/view logic; LANE U1
 *  (composition) owns this file's shell: the right-edge column (sm+,
 *  collapsible to a 34px icon via `store.panelOpen`, top16/bottom16 so its
 *  own content scrolls instead of clipping) and the phone bottom sheet
 *  (`store.sheet === "layers"`, opened by Globe.tsx's icon row). */

declare global {
  interface Window {
    __GLOBE_TEST_SET_ENTITY__?: (id: string, pos: { x: number; y: number; z: number }) => void;
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
  window.__GLOBE_TEST_SET_ENTITY__ = (id, pos) => {
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
  hazards: "Earth events",
  wind: "Wind",
  reach: "My apps and repos",
  countries: "Countries",
  together: "Explorers here now",
  density: "Quake and fire density",
  guide: "My Maps places",
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
      return { color: "var(--color-danger)", pulse: false };
    default:
      return { color: "#71717a", pulse: true };
  }
}

function LayerRows({ layers, status, toggleLayer }: { layers: Record<LayerId, boolean>; status: Partial<Record<LayerId, LayerHealth>>; toggleLayer: (id: LayerId) => void }) {
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
              className="flex min-h-8 w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot.pulse ? "animate-pulse" : ""}`} style={{ backgroundColor: dot.color }} />
              <span className={`min-w-0 flex-1 truncate ${on ? "text-zinc-200" : "text-zinc-500 line-through"}`}>{LABEL[id]}</span>
            </button>
            {health?.detail && (
              <p className="ml-4 truncate text-xs text-muted" title={health.detail}>
                {health.detail}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// WAVE 6 LANE X1: which of the panel's two tabs is showing — component
// state, not globeStore, since nothing outside this file's own two render
// sites (desktop column, phone sheet) needs to read or drive it.
type PanelTab = "layers" | "live";

function TabSwitcher({ tab, setTab }: { tab: PanelTab; setTab: (t: PanelTab) => void }) {
  return (
    <div className="mb-3 flex overflow-hidden rounded-full border border-line" role="tablist" aria-label="Layer panel tabs">
      {(["layers", "live"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          data-feed-tab={t}
          onClick={() => setTab(t)}
          className={`flex-1 px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
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
        className={`block w-full rounded px-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
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
        className={`block w-full rounded px-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
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
        className={`block w-full rounded px-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
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
        className={`block w-full rounded px-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${touchTarget} ${
          !issAvailable ? "cursor-not-allowed text-zinc-600" : view === "follow" ? "bg-accent/20 text-accent" : "text-zinc-300 hover:bg-white/5"
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
          className={`flex-1 px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
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
          className="pointer-events-auto absolute right-4 top-4 z-30 hidden w-[233px] flex-col overflow-hidden rounded-2xl border border-line bg-ink/90 font-mono text-xs text-zinc-300 backdrop-blur sm:bottom-4 sm:flex"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Layers</h2>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-pressed
              aria-label="Collapse the layers panel"
              title="Collapse (L)"
              className="ctrl-icon flex h-7 w-7 items-center justify-center rounded-full border border-line text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={13} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <TabSwitcher tab={tab} setTab={setTab} />
            {tab === "live" ? (
              <FeedRail tier={tier} />
            ) : (
              <>
                <section className="mb-3">
                  <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Earth</h3>
                  {earthStyleToggle}
                </section>
                <section className="mb-3">
                  <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Layers</h3>
                  <LayerRows layers={layers} status={status} toggleLayer={toggleLayer} />
                </section>
                <section className="mb-3">
                  <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Views</h3>
                  {viewButtons("py-1.5")}
                </section>
                <section>
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-muted">Keys</h3>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    L panel · 1-{LAYER_IDS.length} layers · R/D earth · O/G/F views · T tour · Esc back · [ ] scrub 1h · Space play
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
          className="ctrl-icon pointer-events-auto absolute right-4 top-4 z-30 hidden h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-ink/70 text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:flex"
        >
          <Layers size={15} />
        </button>
      )}

      {/* Phone (< 640): a bottom sheet, one of store.sheet's four. */}
      {sheet === "layers" && (
        <div
          data-globe-layer-sheet
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] w-full overflow-y-auto rounded-t-2xl border-t border-line bg-ink/90 p-4 font-mono text-xs text-zinc-300 backdrop-blur sm:hidden"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Layers</h2>
            <button
              type="button"
              onClick={() => setSheet(null)}
              aria-label="Close the layers sheet"
              className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={16} />
            </button>
          </div>
          <TabSwitcher tab={tab} setTab={setTab} />
          {tab === "live" ? (
            <FeedRail tier={tier} />
          ) : (
            <>
              <section className="mb-3">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Earth</h3>
                {earthStyleToggle}
              </section>
              <section className="mb-3">
                <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Layers</h3>
                <LayerRows layers={layers} status={status} toggleLayer={toggleLayer} />
              </section>
              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-muted">Views</h3>
                {viewButtons("min-h-11")}
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
