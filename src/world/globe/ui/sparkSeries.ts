// WAVE 6 LANE X6 (craft: inspector sparklines). Pure parsing for the two
// real series Inspector.tsx is allowed to draw — never invented, always
// named by their real source (globeStore.ts's own `sparkLabel` contract:
// "a number always sits beside its source", the same G8 rule every other
// live value on this page follows). No three, no DOM; the two small hooks
// at the bottom are the only React in this file, same split as every other
// *.ts/*.tsx pair in this lane (hexbin.ts / HexbinLayer.tsx).
import { useEffect, useMemo, useState } from "react";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { latLonToXyz } from "../geoMath.ts";

// `Date.now()` is impure and may only be read from an effect (react-hooks's
// own purity rule), never from render/useMemo — the same discipline
// useSky.ts already follows for its own minute tick. `null` before the
// first effect commit; both hooks below already treat "loading" as
// "nothing to draw yet", so this only delays a spark by one tick on mount,
// never shows a wrong one.
function useApproxNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // The interval's own callback is the "subscribe to an external system"
    // case the lint rule wants (react-hooks/set-state-in-effect) — only a
    // synchronous `setState` in the effect's own body, not inside a timer
    // callback, trips it. A `0`-delay timeout gets the first real value in
    // on the very next tick without that synchronous call.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

// Same feed and poll cadence as layers/aurora.ts's own KP_POLL_MS — this
// shares HazardLayer's live-signal bus (one URL = one poll, per subscriber
// count), never a second request for the same data.
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const KP_POLL_MS = 15 * 60_000;
// USGS's weekly M4.5+ feed — a different URL from HazardLayer's own all-day
// feed (that one has no reliable 7-day history), polled far slower than the
// day feed since a week-scoped summary changes slowly.
const QUAKE_WEEK_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
const QUAKE_WEEK_POLL_MS = 15 * 60_000;

export interface SparkSeries {
  values: number[];
  label: string;
}

interface RawKpRow {
  time_tag?: string;
  Kp?: number;
}

/** The last `hours` of Kp readings, oldest first, or `null` on a feed that
 *  isn't the expected shape, or with nothing inside the window — the caller
 *  hides the chart rather than draw an empty or fake one. NOAA's own
 *  `time_tag` has no "Z" suffix (plain UTC), same read as aurora.ts's own
 *  `parseLatestKp` assumes for this feed. */
export function parseKpSeries(json: unknown, nowMs: number, hours = 24): number[] | null {
  if (!Array.isArray(json)) return null;
  const cutoff = nowMs - hours * 3_600_000;
  const values: number[] = [];
  for (const row of json as RawKpRow[]) {
    if (typeof row?.Kp !== "number" || typeof row?.time_tag !== "string") continue;
    const t = Date.parse(`${row.time_tag}Z`);
    if (Number.isNaN(t) || t < cutoff || t > nowMs) continue;
    values.push(row.Kp);
  }
  return values.length > 0 ? values : null;
}

interface UsgsWeekFeature {
  properties?: { mag: number | null; time: number };
  geometry?: { coordinates?: [number, number, number] } | null;
}

/** Daily M4.5+ counts within `radiusDeg` of (centerLat, centerLon) over the
 *  last `days` days, oldest first. Reuses geoMath's own unit-sphere dot
 *  product for the angular-distance test — the same "nearest by angle" math
 *  hexbin.ts's binning uses — so this never needs its own haversine.
 *  `null` only when the feed itself isn't the expected shape; an empty
 *  region genuinely has all-zero days, which is real data, not a reason to
 *  hide the chart. */
export function regionQuakeCounts(json: unknown, centerLat: number, centerLon: number, nowMs: number, radiusDeg = 5, days = 7): number[] | null {
  const feed = json as { features?: UsgsWeekFeature[] } | null;
  if (!feed || !Array.isArray(feed.features)) return null;
  const centre = latLonToXyz(centerLat, centerLon);
  const cosRadius = Math.cos((radiusDeg * Math.PI) / 180);
  const dayMs = 86_400_000;
  const windowStart = nowMs - days * dayMs;
  const counts = new Array(days).fill(0) as number[];
  for (const f of feed.features) {
    const coords = f.geometry?.coordinates;
    const mag = f.properties?.mag;
    const t = f.properties?.time;
    if (!Array.isArray(coords) || typeof mag !== "number" || mag < 4.5 || typeof t !== "number") continue;
    if (t < windowStart || t > nowMs) continue;
    const p = latLonToXyz(coords[1], coords[0]);
    const dot = p.x * centre.x + p.y * centre.y + p.z * centre.z;
    if (dot < cosRadius) continue;
    const dayIndex = Math.min(days - 1, Math.floor((t - windowStart) / dayMs));
    counts[dayIndex]++;
  }
  return counts;
}

/** Kp over the last 24h — ambient space-weather context Inspector.tsx shows
 *  alongside any open selection (it has no per-selection "kind" to key off,
 *  same as the hazards health line's own Kp reading isn't tied to a click).
 *  `null` while unreachable or still loading, same as every other live read
 *  on this page. */
export function useKpSpark(): SparkSeries | null {
  const { data, error } = useLiveSignal<unknown>(KP_URL, KP_POLL_MS);
  const nowMs = useApproxNow(60_000);
  return useMemo(() => {
    if (error || data == null || nowMs === null) return null;
    const values = parseKpSeries(data, nowMs);
    return values ? { values, label: "Kp, last 24h, NOAA SWPC" } : null;
  }, [data, error, nowMs]);
}

/** M4.5+ quakes within 5 degrees of (lat, lon) over the last 7 days —
 *  `null` while `lat`/`lon` are absent, the feed is unreachable, or it
 *  hasn't loaded yet. */
export function useQuakeRegionSpark(lat: number | null, lon: number | null): SparkSeries | null {
  const { data, error } = useLiveSignal<unknown>(QUAKE_WEEK_URL, QUAKE_WEEK_POLL_MS);
  const nowMs = useApproxNow(60_000);
  return useMemo(() => {
    if (lat === null || lon === null || error || data == null || nowMs === null) return null;
    const values = regionQuakeCounts(data, lat, lon, nowMs);
    return values ? { values, label: "M4.5+ within 5°, last 7d, USGS weekly feed" } : null;
  }, [data, error, lat, lon, nowMs]);
}
