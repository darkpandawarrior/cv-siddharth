// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as weather-handler.ts.
import { guarded } from "./guard.js";
import { governed, type GovernorOptions } from "./upstream.js";
import { lookAngles, SANGAM } from "../../src/lib/lookAngles.js";

// One unified route (master-plan.md#M11): open-data's governor and strict
// filters, plus living-ledger's server-side az/el from the Sangam. No global
// aircraft anywhere — this is the local Pune cluster only.
const ADSB_URL = "https://api.adsb.lol/v2/point/18.5316/73.8603/60";
const USER_AGENT = "siddharth-pandalai.vercel.app portfolio";
const FETCH_TIMEOUT_MS = 4_000;
const RADIUS_NM = 60;
const MAX_RESULTS = 64;
const SOURCE = "adsb.lol (ODbL 1.0)";
const SOURCE_URL = "https://adsb.lol";
const FT_TO_M = 0.3048;

// readsb's dbFlags bit convention: 1 military, 4 PIA, 8 LADD. Pune's civil
// terminal shares the runway with Lohegaon Air Force Station, so a portfolio
// must never render a military movement over it (open-data-spec.md §3 A1).
const RESTRICTED_DB_FLAGS = 1 | 4 | 8;

// ICAO operator code (3 letters) + flight number (1-4 digits/letters) — the
// pattern scheduled and cargo flights broadcast, and the only callsign shape
// this route shows.
const CALLSIGN_RE = /^[A-Z]{3}\d[0-9A-Z]{0,3}$/;

const GOVERNOR_OPT: GovernorOptions = {
  minIntervalMs: 20_000, // budget: adds a 20 s floor on top of the CDN's 30 s s-maxage
  maxStaleMs: 5 * 60_000, // last-good older than 5 min reads as unavailable, never as data
  maxBytes: 256 * 1024,
  cooldownMs: 30_000, // one CDN cycle before a first retry
  maxCooldownMs: 5 * 60_000, // never longer than the point we'd call it unavailable anyway
};

interface AdsbLolAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  dbFlags?: number;
  squawk?: string;
  emergency?: string;
  messages?: number;
  rssi?: number;
}

interface AdsbLolPointResponse {
  ac?: AdsbLolAircraft[];
}

export type AircraftEntry = {
  cs: string;
  type: string | null;
  altFt: number | null;
  gsKt: number | null;
  trkDeg: number | null;
  lat: number;
  lon: number;
  posAgeS: number;
  azDeg: number;
  elDeg: number;
  rangeKm: number;
};

export type AircraftResponse = {
  connected: boolean;
  stale: boolean;
  at: string | null;
  radiusNm: typeof RADIUS_NM;
  total: number;
  source: typeof SOURCE;
  sourceUrl: typeof SOURCE_URL;
  aircraft: AircraftEntry[];
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function isRestricted(dbFlags: number | undefined): boolean {
  return ((dbFlags ?? 0) & RESTRICTED_DB_FLAGS) !== 0;
}

/** Pure normaliser: every filter and stripped field from open-data-spec.md
 *  §3 A1, plus the az/el/range this route adds per M11. No network, so this
 *  is what both the fixture tests and the e2e fixture generator call directly. */
export function normalizeAircraft(raw: AdsbLolAircraft[]): AircraftEntry[] {
  const kept: AircraftEntry[] = [];
  for (const a of raw) {
    if (a.alt_baro === "ground") continue;
    if ((a.seen_pos ?? 0) > 60) continue;
    if (isRestricted(a.dbFlags)) continue;
    const cs = (a.flight ?? "").trim();
    if (!cs || !CALLSIGN_RE.test(cs)) continue;

    const altFt = typeof a.alt_baro === "number" ? a.alt_baro : null;
    const lat = a.lat ?? SANGAM.lat;
    const lon = a.lon ?? SANGAM.lon;
    const { azDeg, elDeg, rangeKm } = lookAngles({ lat, lon, altM: (altFt ?? 0) * FT_TO_M });

    kept.push({
      cs,
      type: a.t ?? null,
      altFt,
      gsKt: a.gs ?? null,
      trkDeg: a.track ?? null,
      lat: round3(lat),
      lon: round3(lon),
      posAgeS: a.seen_pos ?? 0,
      azDeg,
      elDeg,
      rangeKm,
    });
  }
  kept.sort((x, y) => x.rangeKm - y.rangeKm);
  return kept.slice(0, MAX_RESULTS);
}

/** Builds the full response envelope around an already-normalised list —
 *  the piece the e2e fixture (§9) and the handler both need, kept separate
 *  from normalizeAircraft so a test can assert the filter list on its own. */
export function buildAircraftResponse(raw: AdsbLolPointResponse, at: string, stale: boolean): AircraftResponse {
  const aircraft = normalizeAircraft(raw.ac ?? []);
  return {
    connected: true,
    stale,
    at,
    radiusNm: RADIUS_NM,
    total: aircraft.length,
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    aircraft,
  };
}

const UNAVAILABLE: AircraftResponse = {
  connected: false,
  stale: false,
  at: null,
  radiusNm: RADIUS_NM,
  total: 0,
  source: SOURCE,
  sourceUrl: SOURCE_URL,
  aircraft: [],
};

export async function getAircraft(fetchImpl: typeof fetch = fetch): Promise<AircraftResponse> {
  const { value, at, stale } = await governed<AdsbLolPointResponse>(
    "aircraft",
    () =>
      fetchImpl(ADSB_URL, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    (text) => JSON.parse(text) as AdsbLolPointResponse,
    GOVERNOR_OPT,
  );
  if (value === null || at === null) return UNAVAILABLE;
  return buildAircraftResponse(value, new Date(at).toISOString(), stale);
}

async function aircraftHandler(_request: Request): Promise<Response> {
  const body = await getAircraft();
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
    },
  });
}

export const handleAircraft = guarded("aircraft", aircraftHandler);
