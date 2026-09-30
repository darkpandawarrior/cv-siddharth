import { formatRelative, type FeedItem } from "../feed.ts";
import type { Selection } from "../globeStore.ts";
/** Same Selection as FeedRail's private row builder. */
export function feedItemSelection(item: FeedItem, nowMs: number): Selection {
  return { id: item.id, kind: item.kind, title: item.title,
    rows: [{ label: "detail", value: item.detail }, { label: "when", value: formatRelative(item.whenMs, nowMs) }],
    source: item.source, live: item.live, focus: item.focus };
}

/** Mirrors SatelliteLayer's base inspector rows, using its SGP4 result. */
export function satelliteBriefingSelection(object: import("../../../lib/satelliteEcef.ts").TleObject, state: import("../../../lib/satelliteEcef.ts").SatelliteState): Selection {
  return { id: `sat:${object.norad}`, kind: "satellite", title: object.name, source: "CelesTrak TLE via /api/tle, SGP4 (computed)", live: false, focus: { kind: "entity", id: `sat:${object.norad}` }, rows: [
    { label: "NORAD id", value: object.norad },
    { label: "Altitude", value: `${state.altKm.toLocaleString("en-IN", { maximumFractionDigits: 0 })} km` },
    { label: "Speed", value: `${state.speedKmS.toLocaleString("en-IN", { maximumFractionDigits: 2 })} km/s` },
    { label: "Lat/lon", value: `${state.latDeg.toFixed(1)}°, ${state.lonDeg.toFixed(1)}°` },
    { label: "Sunlit", value: state.sunlit ? "sunlit" : "eclipsed" },
    { label: "TLE epoch age", value: `${state.epochAgeDays.toFixed(1)} days` },
  ] };
}
