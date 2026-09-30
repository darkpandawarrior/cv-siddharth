import { parseQuakes, type Quake } from "../layers/quake.ts";

/** Columns keep the replay scan compact; timestamps retain millisecond precision
 *  while GPU-bound values use floats. Treat columns as immutable after parsing. */
export interface UsgsHistory {
  times: Float64Array;
  lat: Float32Array;
  lon: Float32Array;
  mag: Float32Array;
  depth: Float32Array;
  place: string[];
  id: string[];
  /** Writes [inclusive start, exclusive end] into out[0..1], returning out.
   *  Half-open time windows prevent double flashes at consecutive tick edges. */
  eventsBetween(tStartMs: number, tEndMs: number, out: Uint32Array): Uint32Array;
}

function lowerBound(times: Float64Array, time: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Later feeds win duplicate ids, so call with (month, week) to prefer the
 *  short feed's revisions. A malformed feed returns null, not false emptiness;
 *  malformed individual features are skipped as in the live quake parser. */
export function parseUsgsHistory(...feeds: unknown[]): UsgsHistory | null {
  const byId = new Map<string, Quake>();
  for (const feed of feeds) {
    if (!feed || typeof feed !== "object" || !("features" in feed) || !Array.isArray(feed.features)) return null;
    // The shared parser assumes non-null features. Sanitize only that boundary,
    // then reuse its field mapping, missing-place convention and Quake type.
    const features = feed.features.filter((f: unknown) => f !== null && typeof f === "object");
    const quakes = parseQuakes({ features })!;
    for (const q of quakes) {
      if (typeof q.id !== "string" || q.id.length === 0 || typeof q.place !== "string" ||
          !Number.isFinite(q.timeMs) || !Number.isFinite(q.lat) || !Number.isFinite(q.lon) ||
          !Number.isFinite(Math.fround(q.mag)) || !Number.isFinite(q.depthKm) || !Number.isFinite(Math.fround(q.depthKm)) ||
          Math.abs(q.lat) > 90 || Math.abs(q.lon) > 180) continue;
      byId.set(q.id, q);
    }
  }
  const rows = [...byId.values()].sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id));
  const times = Float64Array.from(rows, (q) => q.timeMs);
  return {
    times,
    lat: Float32Array.from(rows, (q) => q.lat),
    lon: Float32Array.from(rows, (q) => q.lon),
    mag: Float32Array.from(rows, (q) => q.mag),
    depth: Float32Array.from(rows, (q) => q.depthKm),
    place: rows.map((q) => q.place),
    id: rows.map((q) => q.id),
    eventsBetween(tStartMs, tEndMs, out) {
      if (out.length < 2) throw new RangeError("Range buffer needs two slots");
      if (!Number.isFinite(tStartMs) || !Number.isFinite(tEndMs) || tEndMs < tStartMs) throw new RangeError("Invalid time window");
      out[0] = lowerBound(times, tStartMs);
      out[1] = lowerBound(times, tEndMs);
      return out;
    },
  };
}

/** Writes matching indices, returns their count. Reserve end-start slots so
 *  capacity errors happen before writes, never silently truncate real events.
 *  Keep out separate from the range buffer; no arrays are created per tick. */
export function filterMagnitude(history: UsgsHistory, start: number, end: number, minMag: number, out: Uint32Array): number {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > history.times.length || Number.isNaN(minMag)) throw new RangeError("Invalid magnitude window");
  if (out.length < end - start) throw new RangeError("Index buffer too small");
  let count = 0;
  for (let i = start; i < end; i++) if (history.mag[i] >= minMag) out[count++] = i;
  return count;
}

/** Speed is simulated seconds per wall second, matching TimeScrubber. Scale
 *  the envelope to retain a 120ms attack and 1.88s decay at accelerated speed.
 *  Negative speeds replay backward; zero uses the 1x envelope at a frozen now.
 *  Smoothstep joins at zero slope so the peak never looks like a hard cut. */
export function pulseState(eventTime: number, simNow: number, speed: number): number {
  if (!Number.isFinite(eventTime) || !Number.isFinite(simNow) || !Number.isFinite(speed)) return 0;
  const age = (simNow - eventTime) * (speed < 0 ? -1 : 1) / (Math.abs(speed) || 1);
  if (age <= 0 || age >= 2000) return 0;
  const t = age < 120 ? age / 120 : (2000 - age) / 1880;
  return t * t * (3 - 2 * t);
}
