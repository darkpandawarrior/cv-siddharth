// WAVE 7 LANE V6 (non-visual scene summary). Pure sentence builders behind
// SceneSummary.tsx — no React, no three, so every case below is a plain
// function call in sceneSummaryText.test.ts. Ports the "rebuild only on
// meaning change" technique from OskarasM/scene-narrator
// (https://github.com/OskarasM/scene-narrator, MIT): each function is a pure
// projection of already-loaded state to one sentence, so the calling
// component only ever needs to memoize on the same inputs the store already
// changes discretely on (a toggle, a select, a status report) — never a
// per-frame value. See SceneSummary.tsx's own comment for why that's enough
// even where a subscribed field (the time offset) DOES change continuously.
import type { GibsCatalogEntry } from "../layers/gibsCatalog.ts";
import { GIBS_CATALOG } from "../layers/gibsCatalog.ts";
import { LAYER_IDS, type LayerHealth, type LayerId, type Selection } from "../globeStore.ts";
import { WMO_LABEL, subsolarPoint, type SkyState } from "../../../lib/sky.ts";

// Restated from ui/LayerPanel.tsx's own `LABEL` map rather than imported:
// that file belongs to lane U1 and this lane may not edit or import
// component internals from it (the shared-lanes ownership rule). Kept a
// `Record<LayerId, ...>` for the same reason LayerPanel's own copy is — a
// future LayerId with no label here fails the build, not silently.
export const LAYER_LABEL: Record<LayerId, string> = {
  buoys: "Ocean buoys",
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
  daylight: "Golden hour and waking cities",
  eclipse: "Eclipse paths",
};

/** "Imagery: VIIRS true colour (NASA GIBS / VIIRS SNPP, 2026-09-28), plus 2
 *  overlays: Precipitation rate, Sea surface temperature." — the base's own
 *  title plus `catalogDateLabel` (already "attribution, date" for a dated
 *  layer, just the attribution for a static one), so the date only appears
 *  where the layer actually has one. */
export function imagerySummary(base: GibsCatalogEntry | undefined, dateLabel: string | undefined, overlayIds: string[]): string {
  if (!base) return "Imagery: base layer unknown.";
  const overlays = overlayIds.map((id) => GIBS_CATALOG[id]?.title ?? id);
  const overlayText = overlays.length > 0 ? `, plus ${overlays.length} overlay${overlays.length > 1 ? "s" : ""}: ${overlays.join(", ")}` : "";
  return `Imagery: ${base.title}${dateLabel ? ` (${dateLabel})` : ""}${overlayText}.`;
}

/** "Live layers: on — Pune markers, Satellites. Off — Countries. Unreachable:
 *  Wind." — a layer's own health (globeStore.ts `setStatus`) is what "no
 *  stale value shown as live" already gates on, so a failed feed that is
 *  still toggled "on" is named rather than left indistinguishable from one
 *  that's simply working. */
export function liveLayersSummary(layers: Record<LayerId, boolean>, status: Partial<Record<LayerId, LayerHealth>>): string {
  const on = LAYER_IDS.filter((id) => layers[id]);
  const off = LAYER_IDS.filter((id) => !layers[id]);
  const failed = on.filter((id) => status[id]?.state === "failed");
  const list = (ids: readonly LayerId[]) => (ids.length > 0 ? ids.map((id) => LAYER_LABEL[id]).join(", ") : "none");
  const failedText = failed.length > 0 ? ` Unreachable: ${list(failed)}.` : "";
  return `Live layers: on — ${list(on)}. Off — ${list(off)}.${failedText}`;
}

/** Reuses HazardLayer's own composite detail line (hazardStatus.ts's
 *  `buildHazardStatus`) rather than re-deriving counts — one source of
 *  truth for "47 quakes, 3 fires, Kp 3.67". */
export function hazardsSummary(status: LayerHealth | undefined): string {
  if (!status) return "Hazards: not reporting yet.";
  if (status.state === "failed") return `Hazards: ${status.detail || "every feed unreachable"}.`;
  return `Hazards: ${status.detail || "no active events"}.`;
}

/** "Sky: day over Pune, 27°C, clear, sun overhead near 2.1°, 145.3°." — the
 *  same daypart/weather `GlobeHud` already shows as a pill, plus the
 *  subsolar point (`lib/sky.ts`'s own computed, not fetched, geometry) so a
 *  screen-reader visitor gets the one fact the day/night terminator gives a
 *  sighted one. */
export function skySummary(sky: SkyState | null): string {
  if (!sky) return "Sky: not available yet.";
  const parts = [`${sky.daypart} over Pune`];
  if (sky.weather) {
    const label = WMO_LABEL[sky.weather.code] ?? "conditions unknown";
    parts.push(`${Math.round(sky.weather.tempC)}°C`, label);
  }
  const sub = subsolarPoint(sky.now);
  parts.push(`sun overhead near ${sub.lat.toFixed(1)}°, ${sub.lon.toFixed(1)}°`);
  return `Sky: ${parts.join(", ")}.`;
}

/** "Selection: Pune, employer ring (guide-place), live, source Google Maps
 *  Takeout." / "Selection: nothing selected." — the static, browsable
 *  restatement inside the sr-only region (the live region below announces
 *  only the CHANGE). */
export function selectionSummary(selected: Selection | null): string {
  if (!selected) return "Selection: nothing selected.";
  return `Selection: ${selected.title} (${selected.kind}), ${selected.live ? "live" : "snapshot"}, source ${selected.source}.`;
}

/** The one sentence the polite live region ever holds — "announces
 *  selection changes only" (the brief's own words): empty when there is
 *  nothing selected, so clearing a selection announces silence rather than
 *  a fresh "nothing selected" interruption. */
export function selectionAnnouncement(selected: Selection | null): string {
  return selected ? `Now showing ${selected.title}.` : "";
}
