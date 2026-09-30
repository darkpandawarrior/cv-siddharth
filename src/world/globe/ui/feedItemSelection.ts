import { formatRelative, type FeedItem } from "../feed.ts";
import { useGlobe, type Selection } from "../globeStore.ts";
import { tleEpoch } from "../../../lib/satellites.ts";
/** Same Selection as FeedRail's private row builder. */
export function feedItemSelection(item: FeedItem, nowMs: number): Selection {
  return { id: item.id, kind: item.kind, title: item.title,
    rows: [{ label: "detail", value: item.detail }, { label: "when", value: formatRelative(item.whenMs, nowMs) }],
    source: item.source, live: item.live, focus: item.focus };
}

/** Mirrors SatelliteLayer's inspector rows, using its SGP4 result. */
export function satelliteBriefingSelection(object: import("../../../lib/satelliteEcef.ts").TleObject, state: import("../../../lib/satelliteEcef.ts").SatelliteState): Selection {
  return { id: `sat:${object.norad}`, kind: "satellite", title: object.name, source: `CelesTrak TLE via /api/tle, SGP4 (computed) · TLE epoch ${tleEpoch(object.l1).toISOString()}`, live: false, focus: { kind: "entity", id: `sat:${object.norad}` }, rows: [
    { label: "NORAD id", value: object.norad },
    { label: "Altitude", value: `${state.altKm.toFixed(0)} km` },
    { label: "Speed", value: `${state.speedKmS.toFixed(2)} km/s` },
    { label: "Lat/lon", value: `${state.latDeg.toFixed(1)}°, ${state.lonDeg.toFixed(1)}°` },
    { label: "Sunlit", value: state.sunlit ? "sunlit" : "eclipsed" },
    { label: "TLE epoch age", value: `${state.epochAgeDays.toFixed(1)} days` },
    ...(object.norad === "25544" ? [{ label: "Next visible pass (Pune)", value: "computing…" }] : []),
  ] };
}

/** Same pass scan as a scene click; never overwrite a later selection. */
export async function inspectBriefingSatellite(selection: Selection, object: import("../../../lib/satelliteEcef.ts").TleObject, now: Date): Promise<void> {
  useGlobe.getState().select(selection);
  if (object.norad !== "25544") return;
  let rows: Selection["rows"];
  try {
    const { nextVisiblePassDetail, formatPuneClock, azimuthToCompass, formatDurationMin } = await import("../layers/satPasses.ts");
    // The shared seven-day scan yields only to requestIdleCallback, which
    // can starve beside WebGL. Half-day batches never reach its 2,000-step
    // idle boundary; timers let frames run between batches.
    const { nextVisiblePass } = await import("../../../lib/satellites.ts");
    let start: Date | null = null;
    for (let halfDay = 0; halfDay < 14 && !start; halfDay++) {
      start = (await nextVisiblePass(object, new Date(+now + halfDay * 43_200_000), undefined, 0.5))?.start ?? null;
      if (!start) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    const pass = start ? await nextVisiblePassDetail(object, start) : null;
    rows = pass ? [
      { label: "Next visible pass (Pune)", value: formatPuneClock(pass.start) },
      { label: "Max elevation", value: `${pass.maxElDeg.toFixed(0)}°` },
      { label: "Direction", value: `${azimuthToCompass(pass.startAzDeg)} → ${azimuthToCompass(pass.endAzDeg)}` },
      { label: "Duration", value: formatDurationMin(pass.durationMin) },
    ] : [{ label: "Next visible pass (Pune)", value: "none in the next 7 days" }];
  } catch {
    rows = [{ label: "Next visible pass (Pune)", value: "unavailable" }];
  }
  if (useGlobe.getState().selected !== selection) return;
  useGlobe.getState().select({ ...selection, rows: [...selection.rows.filter(row => row.label !== "Next visible pass (Pune)"), ...rows] });
}
