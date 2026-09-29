import { useMemo } from "react";
import { useSky } from "../../../lib/useSky.ts";
import { catalogDateLabel, GIBS_CATALOG } from "../layers/gibsCatalog.ts";
import { useGlobe, useSimNow } from "../globeStore.ts";
import { hazardsSummary, imagerySummary, liveLayersSummary, selectionAnnouncement, selectionSummary, skySummary } from "./sceneSummaryText.ts";

/**
 * WAVE 7 LANE V6 ("non-visual scene summary", 2026-09-29-globe-wave7-
 * synthesis.md §Lane 6). Ports the technique from OskarasM/scene-narrator
 * (https://github.com/OskarasM/scene-narrator, MIT) rather than taking a
 * dependency on a 2-star repo: one screen-reader-only region, five headed
 * sections built from short sentences, plus a SEPARATE `aria-live="polite"`
 * region that speaks only when the selection changes — a screen-reader
 * visitor otherwise has no way to know what the 3D canvas is even showing
 * (`@react-three/a11y` was considered for this and dropped; X1's DOM feed
 * rail already lists the same entities one at a time, this is the "what does
 * the SCENE as a whole show right now" summary that rail doesn't give).
 *
 * "Rebuilds only when meaning changes, never per frame": every sentence
 * below is a pure function (sceneSummaryText.ts) of state that only changes
 * on a discrete action — a layer toggle, a status report, a selection, an
 * imagery swap. `timeOffsetMin` is the one exception (the time scrubber
 * ticks it every animation frame while playing), but `useSimNow` only
 * changes what `imagerySummary` computes at CALENDAR-DAY granularity
 * (`catalogDateLabel`'s own `lagDays` rounding) — so even during playback
 * the derived STRING is stable from one frame to the next, and React's own
 * reconciliation never rewrites a text node whose string didn't change.
 * That is what keeps the live region's own 60s-idle acceptance line true
 * without a custom equality function here: nothing in this file needs one
 * so long as every derived value stays a plain string built with `useMemo`.
 *
 * Mounted from GlobePanel.tsx (this lane's one allowed line there), not
 * Globe.tsx or GlobeHud.tsx — GlobePanel already renders unconditionally,
 * SSR and no-WebGL included ("the same facts as a list"), so this summary
 * exists even for a visitor whose browser never draws the canvas at all.
 */
export default function SceneSummary() {
  const layers = useGlobe((s) => s.layers);
  const status = useGlobe((s) => s.status);
  const imagery = useGlobe((s) => s.imagery);
  const selected = useGlobe((s) => s.selected);
  const sky = useSky();
  // Same SSR-safe fallback `Globe.tsx` uses for `GlobeScene`'s own `now` prop
  // (`sky?.now ?? new Date()`): harmless here too, since a server/client
  // clock skew of a few ms never crosses a calendar-day boundary that
  // `catalogDateLabel` would render differently.
  const now = useSimNow(sky?.now ?? new Date());

  const base = GIBS_CATALOG[imagery.base];
  const imageryText = useMemo(
    () => imagerySummary(base, base ? catalogDateLabel(base, now) : undefined, imagery.overlays.map((o) => o.id)),
    [base, now, imagery.overlays],
  );
  const layersText = useMemo(() => liveLayersSummary(layers, status), [layers, status]);
  const hazardsText = useMemo(() => hazardsSummary(status.hazards), [status.hazards]);
  const skyText = useMemo(() => skySummary(sky), [sky]);
  const selectionText = useMemo(() => selectionSummary(selected), [selected]);
  const announcement = useMemo(() => selectionAnnouncement(selected), [selected]);

  return (
    <>
      <section data-scene-summary aria-label="Scene summary" className="sr-only">
        <h3>Imagery</h3>
        <p>{imageryText}</p>
        <h3>Live layers</h3>
        <p>{layersText}</p>
        <h3>Hazards</h3>
        <p>{hazardsText}</p>
        <h3>Sky</h3>
        <p>{skyText}</p>
        <h3>Selection</h3>
        <p>{selectionText}</p>
      </section>
      <div data-scene-summary-live aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
