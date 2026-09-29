import { useMemo } from "react";
import { useSky } from "../../../lib/useSky.ts";
import { catalogDateLabel, GIBS_CATALOG } from "../layers/gibsCatalog.ts";
import { useGlobe, useSimNow } from "../globeStore.ts";
import { hazardsSummary, imagerySummary, liveLayersSummary, selectionAnnouncement, selectionSummary, skySummary } from "./sceneSummaryText.ts";

// A fixed instant, not a clock read: `useSimNow` needs a Date on every
// render (Rules of Hooks), and before `dateKnown` this placeholder is
// discarded rather than rendered, but it still has to be deterministic on
// both server and client so its own construction never becomes a second
// hydration hazard.
const EPOCH = new Date(0);

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
 *
 * That unconditional SSR floor is exactly why this file CANNOT reuse
 * `Globe.tsx`'s own `sky?.now ?? new Date()` fallback verbatim: there, `now`
 * only ever feeds `<GlobeScene>`, which sits behind a `<ClientOnly>`
 * boundary (Globe.tsx), so the mismatched value never reaches a render
 * React compares against the server output. Here there is no ClientOnly —
 * this section IS part of the compared output — so a `new Date()` read
 * during render reads the SERVER's build/prerender instant in the SSR pass
 * and a DIFFERENT, later instant on the client's own first render, and
 * React flags that divergence as a hydration mismatch (reproduced as
 * minified React error #418 with a fixed client clock; the baked
 * prerendered HTML holds a stale build-day date to prove it). The fix is
 * `useSky`'s OWN null-until-mount floor, already relied on below for
 * `skyText` — `sky` is `null` on the server and on the client's first
 * render alike (`useSky`'s doc comment), so gating the date on `sky` being
 * non-null needs no clock of this file's own. `lib/useSky.ts`'s own comment
 * is explicit that nothing mounting it may add a second clock or fetch
 * ("the world has no its own clock, its own fetch or its own weather") —
 * `useNow()` was tried here first and dropped for exactly that reason.
 */
export default function SceneSummary() {
  const layers = useGlobe((s) => s.layers);
  const status = useGlobe((s) => s.status);
  const imagery = useGlobe((s) => s.imagery);
  const selected = useGlobe((s) => s.selected);
  const sky = useSky();
  const dateKnown = sky != null;
  // useSimNow always needs a Date (Rules of Hooks — no calling it only once
  // `sky` resolves), so EPOCH stands in while it's still null; `now`'s value
  // is never rendered until `dateKnown` flips true, so EPOCH itself never
  // reaches the page.
  const now = useSimNow(sky?.now ?? EPOCH);

  const base = GIBS_CATALOG[imagery.base];
  const imageryText = useMemo(
    () => imagerySummary(base, base && dateKnown ? catalogDateLabel(base, now) : undefined, imagery.overlays.map((o) => o.id)),
    [base, dateKnown, now, imagery.overlays],
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
