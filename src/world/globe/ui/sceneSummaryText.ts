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
import { LAYER_IDS, type LayerHealth, type LayerId, type Selection, type EarthStyle, type ImageryStack } from "../globeStore.ts";
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

/** "Live layers: on: Pune markers, Satellites. Off: Countries. Unreachable:
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
  return `Live layers: on: ${list(on)}. Off: ${list(off)}.${failedText}`;
}

/** Reuses HazardLayer's own composite detail line (hazardStatus.ts's
 *  `buildHazardStatus`) rather than re-deriving counts — one source of
 *  truth for "47 quakes, 3 fires, Kp 3.67". */
export function hazardsSummary(status: LayerHealth | undefined): string {
  if (!status) return "Hazards: not reporting yet.";
  if (status.state === "loading") return "Hazards: loading, no events confirmed.";
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


/** Loaded producer reports only. Never derive a drawn date from simTime or
 * catalogDate: requested tiles can fail or remain on an older generation. */
export function loadedImagerySummary(style: EarthStyle, earth: LayerHealth | undefined): string {
  if (style === "dots") return "Imagery: dots, computed geometry. Real imagery is off.";
  if (!earth) return "Imagery: no loaded texture report. No imagery date confirmed.";
  if (earth.state === "loading") return "Imagery: dots while the whole-globe texture loads. No imagery date confirmed.";
  if (earth.state === "failed") return `Imagery: dots fallback. ${cleanCopy(earth.detail || "imagery unavailable")}. No imagery date confirmed.`;
  return `Imagery: whole-globe texture, ${cleanCopy(earth.detail || "product and date not reported")}. Snapshot imagery, not live.`;
}

/** The phone's one-line receipt puts the loaded product/date before source
 * prose. Unknown products keep the producer text rather than a catalog guess. */
export function loadedImageryHeadline(style: EarthStyle, earth: LayerHealth | undefined): string {
  if (style === "dots") return "Dots · computed";
  if (!earth) return "Awaiting imagery report";
  if (earth.state === "loading") return "Imagery loading";
  if (earth.state === "failed") return "Dots · imagery unavailable";
  const product = earth.detail?.match(/VIIRS|MODIS Terra/)?.[0];
  const date = earth.detail?.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  return product && date ? `${product} · ${date}` : cleanCopy(earth.detail || "Loaded texture, date not reported");
}

function cleanCopy(text: string): string {
  return text.replaceAll("\u2014", ",");
}

export interface ReceiptRow {
  id: string;
  label: string;
  available: boolean;
  text: string;
}

// Sources are the same producers named by these layers' status/selection
// builders. A missing observation time stays missing, even for healthy feeds.
const LAYER_SOURCE: Record<LayerId, string> = {
  markers: "portfolio evidence snapshot",
  stars: "astronomy-engine and star catalog",
  satellites: "CelesTrak TLE",
  aircraft: "adsb.lol",
  presence: "shared presence and edge country header",
  pulses: "GitHub, ops and /api/signals",
  hazards: "USGS, EONET, GDACS, NOAA SWPC and Launch Library",
  wind: "Open-Meteo",
  reach: "store snapshot, GitHub CI and /api/signals",
  countries: "Natural Earth, public domain",
  together: "shared session presence",
  density: "USGS quakes and EONET fires",
  guide: "Google Maps Takeout snapshot",
  daylight: "subsolar geometry",
  eclipse: "NASA eclipse catalog and astronomy-engine",
  buoys: "NOAA NDBC",
};
const NOWCAST: readonly LayerId[] = ["aircraft", "presence", "pulses", "wind", "together"];

function valueKind(id: LayerId, health: LayerHealth): string {
  const kind = ["stars", "daylight", "density", "eclipse"].includes(id) ? "Computed"
    : ["satellites", "wind", "aircraft"].includes(id) ? "Modelled"
    : ["markers", "guide", "countries", "reach", "buoys"].includes(id) || health.state === "snapshot" ? "Snapshot" : "Feed report";
  return health.state === "snapshot" && kind !== "Snapshot" ? `${kind}, snapshot` : kind;
}

/** UTC daily imagery has day precision, so its age must not imply an exact
 * observation instant. This is the loaded report's date, never a request. */
export function imageryObservationAge(detail: string | undefined, now: Date | null): string {
  const date = detail?.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (!date || !now) return "Observation age not reported.";
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return "Observation age not reported.";
  const days = Math.floor(now.getTime() / 86_400_000) - Math.floor(ms / 86_400_000);
  return days < 0 ? "Reported imagery date is ahead of the real clock."
    : `Observation age: ${days} UTC calendar day${days === 1 ? "" : "s"}, daily mosaic.`;
}

export function sceneReceiptRows(
  layers: Record<LayerId, boolean>,
  status: Partial<Record<string, LayerHealth>>,
  imagery: ImageryStack,
  style: EarthStyle,
  offset: number,
): ReceiptRow[] {
  const rows = imagery.overlays.map(({ id, opacity }): ReceiptRow => {
    const entry = GIBS_CATALOG[id];
    const health = status[id];
    const reason = style === "dots" ? "hidden because real imagery is off"
      : opacity === 0 ? "hidden at zero opacity"
      : health?.state === "failed" ? `unavailable: ${cleanCopy(health.detail || "feed failed")}`
      : health?.state === "loading" ? "loading, drawing unconfirmed"
      : "drawing and loaded date unconfirmed by tile producer";
    const kind = /model|analysis/i.test(entry?.description ?? "") ? "Modelled" : "Snapshot imagery";
    return { id, label: entry?.title ?? id, available: false,
      text: `${reason}. ${entry?.attribution ?? "Source not reported"}. ${kind}. Observation age not reported.` };
  });
  for (const id of LAYER_IDS) {
    if (!layers[id]) continue;
    const health = status[id];
    const hidden = offset !== 0 && NOWCAST.includes(id);
    const available = !hidden && !!health && health.state !== "loading" && health.state !== "failed";
    const reason = hidden ? "Hidden during simulated time"
      : !health ? "Drawing unconfirmed, no status reported"
      : health.state === "failed" ? "Unavailable"
      : health.state === "loading" ? "Loading, drawing unconfirmed"
      : valueKind(id, health);
    const detail = health?.detail ? ` ${cleanCopy(health.detail)}.` : "";
    const age = ["stars", "daylight", "eclipse", "density"].includes(id)
      ? "Computed values are not observations."
      : "Observation age not reported in layer status.";
    rows.push({ id, label: LAYER_LABEL[id], available,
      text: `${reason}.${detail} Source: ${LAYER_SOURCE[id]}. ${age}` });
  }
  return rows;
}
