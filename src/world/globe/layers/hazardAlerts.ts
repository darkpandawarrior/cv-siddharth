// LANE L7 (live earth events). Pure GDACS alert parsing plus the fuzzy match
// against this lane's own quake/EONET lists (task 3: "orange/red alerts get
// an alert halo around the corresponding event ... or their own marker if no
// EONET match"). No three, no React.
//
// Feed: https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH
export const GDACS_POLL_MS = 15 * 60_000; // same reasoning as EONET_POLL_MS

export type GdacsAlertLevel = "orange" | "red";

interface RawFeature {
  geometry?: { type: string; coordinates: unknown };
  properties?: {
    eventtype?: string;
    eventid?: number | string;
    eventname?: string | null;
    name?: string | null;
    alertlevel?: string;
    url?: { report?: string };
  };
}
interface RawFeed {
  features: RawFeature[];
}

export interface GdacsAlert {
  id: string;
  eventType: string; // GDACS's own code: EQ, TC, FL, VO, WF, DR
  alertLevel: GdacsAlertLevel;
  name: string;
  lat: number;
  lon: number;
  url: string;
}

/** Only orange/red ever draws (task 3) — green is not this lane's concern,
 *  it never earns a halo or a standalone marker. */
export function parseGdacsAlerts(json: unknown): GdacsAlert[] | null {
  const feed = json as Partial<RawFeed> | null;
  if (!feed || typeof feed !== "object" || !Array.isArray(feed.features)) return null;

  const out: GdacsAlert[] = [];
  for (const f of feed.features) {
    const level = f.properties?.alertlevel?.toLowerCase();
    if (level !== "orange" && level !== "red") continue;
    const coords = f.geometry?.type === "Point" ? f.geometry.coordinates : null;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const eventType = f.properties?.eventtype;
    if (!eventType) continue;
    out.push({
      id: `${eventType}-${f.properties?.eventid ?? out.length}`,
      eventType,
      alertLevel: level,
      name: f.properties?.eventname || f.properties?.name || eventType,
      lon: coords[0] as number,
      lat: coords[1] as number,
      url: f.properties?.url?.report ?? "https://www.gdacs.org/",
    });
  }
  return out;
}

export interface MatchedAlert extends GdacsAlert {
  /** The quake or EONET event id this alert lines up with, or null when it
   *  stands alone (task 3's "or their own marker"). */
  matchId: string | null;
  matchKind: "quake" | "eonet" | null;
}

// ponytail: flat lat/lon degree distance, not a great-circle haversine — the
// threshold (2 deg, ~220km) is small enough that the difference never
// changes which candidate is nearest, and this is a "same disaster, two
// feeds" heuristic, not a navigation calculation.
const MATCH_THRESHOLD_DEG = 2;

// GDACS's event-type code -> the EONET category this lane draws for it.
// FL (flood) and DR (drought) have no corresponding glyph here, so they
// always stand alone.
const EVENTTYPE_TO_EONET: Partial<Record<string, "wildfires" | "severeStorms" | "volcanoes">> = {
  WF: "wildfires",
  TC: "severeStorms",
  VO: "volcanoes",
};

function nearest<T extends { lat: number; lon: number; id: string }>(pool: T[], lat: number, lon: number): T | null {
  let best: T | null = null;
  let bestDist = MATCH_THRESHOLD_DEG;
  for (const p of pool) {
    const d = Math.hypot(p.lat - lat, p.lon - lon);
    if (d <= bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

/** EQ alerts match against this lane's own quake list (USGS and GDACS both
 *  report earthquakes — matching against the quake layer, not EONET, which
 *  doesn't carry earthquakes at all). WF/TC/VO match the matching EONET
 *  category. Everything else, and anything with no candidate inside the
 *  threshold, stands alone. */
export function matchGdacsAlerts(
  alerts: GdacsAlert[],
  quakes: { id: string; lat: number; lon: number }[],
  eonetEvents: { id: string; lat: number; lon: number; category: string }[],
): MatchedAlert[] {
  return alerts.map((a): MatchedAlert => {
    if (a.eventType === "EQ") {
      const m = nearest(quakes, a.lat, a.lon);
      return { ...a, matchId: m?.id ?? null, matchKind: m ? "quake" : null };
    }
    const category = EVENTTYPE_TO_EONET[a.eventType];
    if (category) {
      const pool = eonetEvents.filter((e) => e.category === category);
      const m = nearest(pool, a.lat, a.lon);
      return { ...a, matchId: m?.id ?? null, matchKind: m ? "eonet" : null };
    }
    return { ...a, matchId: null, matchKind: null };
  });
}
