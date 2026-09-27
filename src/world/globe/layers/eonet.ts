// LANE L7 (live earth events). Pure NASA EONET v3 parsing: this lane draws
// exactly three of EONET's dozen categories (wildfires, volcanoes, severe
// storms — the brief's own list), everything else in the feed is ignored.
// No three, no React.
//
// Feed: https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30
export const EONET_POLL_MS = 15 * 60_000; // ponytail: EONET's own events update
// a few times a day, not by the minute — 15 min is comfortably inside that,
// no published SLA to tune against.

export type EonetCategory = "wildfires" | "volcanoes" | "severeStorms";
const CATEGORY_IDS: readonly EonetCategory[] = ["wildfires", "volcanoes", "severeStorms"];

interface RawGeometry {
  type: string;
  date: string;
  coordinates: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}
interface RawEvent {
  id: string;
  title: string;
  closed?: string | null;
  categories?: { id: string; title: string }[];
  sources?: { id: string; url: string }[];
  link?: string;
  geometry?: RawGeometry[];
}
interface RawFeed {
  events: RawEvent[];
}

export interface TrackPoint {
  lat: number;
  lon: number;
  dateMs: number;
}

export interface EonetEvent {
  id: string;
  title: string;
  category: EonetCategory;
  /** The latest known point — what a marker sits at. */
  lat: number;
  lon: number;
  dateMs: number;
  /** Only set for severeStorms with more than one dated point (task 2: "the
   *  storm's track as a fading line"). Sorted oldest to newest. */
  track: TrackPoint[] | null;
  sourceId: string;
  sourceUrl: string;
}

/** A Polygon's rough centroid (mean of its outer ring) — this lane draws a
 *  point marker for every category, never a filled area, so an exact
 *  area-weighted centroid buys nothing here. */
function polygonCentroid(coords: unknown): { lat: number; lon: number } | null {
  const ring = Array.isArray(coords) ? (coords[0] as unknown) : null;
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sumLon = 0;
  let sumLat = 0;
  let n = 0;
  for (const pt of ring as unknown[]) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    sumLon += pt[0] as number;
    sumLat += pt[1] as number;
    n++;
  }
  return n > 0 ? { lat: sumLat / n, lon: sumLon / n } : null;
}

function pointFromGeometry(g: RawGeometry): { lat: number; lon: number } | null {
  if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    return { lon: g.coordinates[0] as number, lat: g.coordinates[1] as number };
  }
  if (g.type === "Polygon") return polygonCentroid(g.coordinates);
  return null;
}

/** `null` on a feed that doesn't look real; a malformed individual event is
 *  skipped rather than dropping the whole batch. */
export function parseEonetEvents(json: unknown): EonetEvent[] | null {
  const feed = json as Partial<RawFeed> | null;
  if (!feed || typeof feed !== "object" || !Array.isArray(feed.events)) return null;

  const out: EonetEvent[] = [];
  for (const e of feed.events) {
    const category = e.categories?.[0]?.id as EonetCategory | undefined;
    if (!category || !CATEGORY_IDS.includes(category)) continue;
    if (!Array.isArray(e.geometry) || e.geometry.length === 0) continue;

    const points = e.geometry
      .map((g) => {
        const p = pointFromGeometry(g);
        return p ? { ...p, dateMs: Date.parse(g.date) } : null;
      })
      .filter((p): p is TrackPoint => p !== null && Number.isFinite(p.dateMs))
      .sort((a, b) => a.dateMs - b.dateMs);
    if (points.length === 0) continue;

    const latest = points[points.length - 1];
    out.push({
      id: e.id,
      title: e.title,
      category,
      lat: latest.lat,
      lon: latest.lon,
      dateMs: latest.dateMs,
      track: category === "severeStorms" && points.length > 1 ? points : null,
      sourceId: e.sources?.[0]?.id ?? "EONET",
      sourceUrl: e.sources?.[0]?.url ?? e.link ?? "https://eonet.gsfc.nasa.gov/",
    });
  }
  return out;
}

export function eventsAtTime(events: EonetEvent[], simNowMs: number): EonetEvent[] {
  return events.filter((e) => e.dateMs <= simNowMs);
}

const FADE_HORIZON_MS = 7 * 24 * 60 * 60_000; // EONET events run days to weeks, not hours
const FADE_FLOOR = 0.15;

export function eonetFadeAlpha(simNowMs: number, eventMs: number): number {
  const age = Math.max(0, simNowMs - eventMs);
  return Math.max(FADE_FLOOR, 1 - age / FADE_HORIZON_MS);
}

/** A storm's track clipped to the simulated instant, each point's alpha
 *  fading toward the tail (task 2 + task 7 combined: "fading line" reads
 *  literally once the scrubber is in play). */
export function trackAtTime(track: TrackPoint[], simNowMs: number): TrackPoint[] {
  return track.filter((p) => p.dateMs <= simNowMs);
}
