// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as aircraft-handler.ts.
import { guarded } from "./guard.js";
import { governed, type GovernorOptions } from "./upstream.js";

// open-data-spec.md §3 A2: two upstream groups, filtered to the stations we
// actually show (ISS 25544, CSS 48274) plus every "visual" object (bright
// enough to see by eye — 156 at the snapshot this route was measured on).
const STATIONS_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle";
const VISUAL_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle";
const USER_AGENT = "siddharth-pandalai.vercel.app portfolio";
const FETCH_TIMEOUT_MS = 6_000; // open-data-spec.md §3 A2
const KEPT_STATION_NORADS = new Set(["25544", "48274"]);
const MAX_EPOCH_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCE = "CelesTrak";
const SOURCE_URL = "https://celestrak.org";
const CACHE_CONTROL = "public, max-age=0, s-maxage=7200, stale-while-revalidate=86400";

// CelesTrak refreshes GP data about every 2 h and blocks IPs that re-pull
// unchanged data faster than that (open-data-spec.md §3 A2) — the governor's
// floor keeps this isolate inside "at most 2 requests per 2 h".
const GOVERNOR_OPT: GovernorOptions = {
  minIntervalMs: 60 * 60_000, // 1 h floor -> at most 2 calls per 2 h
  maxStaleMs: 24 * 60 * 60_000, // matches the CDN's stale-while-revalidate
  maxBytes: 128 * 1024, // measured payload is 29.6 KB raw
  cooldownMs: 5 * 60_000,
  maxCooldownMs: 2 * 60 * 60_000,
};

export type TleObject = { name: string; norad: string; l1: string; l2: string };

export type TleResponse = {
  connected: boolean;
  stale: boolean;
  at: string | null;
  epochNewest: string | null;
  source: typeof SOURCE;
  sourceUrl: typeof SOURCE_URL;
  objects: TleObject[];
};

function checksum(line68: string): number {
  let sum = 0;
  for (const ch of line68) {
    if (ch >= "0" && ch <= "9") sum += Number(ch);
    else if (ch === "-") sum += 1;
  }
  return sum % 10;
}

/** True for a structurally valid TLE line: exactly 69 chars, mod-10
 *  checksum in the last column (open-data-spec.md §3 A2 "Validation"). */
function isValidTleLine(line: string): boolean {
  if (line.length !== 69) return false;
  const last = line[68];
  if (last < "0" || last > "9") return false;
  return checksum(line.slice(0, 68)) === Number(last);
}

/** Epoch from TLE line 1 columns 19-32 (2-digit year + day-of-year
 *  fraction), the 1957/2000 pivot per the TLE spec. */
export function tleEpoch(l1: string): Date {
  const yy = Number(l1.slice(18, 20));
  const fullYear = yy < 57 ? 2000 + yy : 1900 + yy;
  const dayOfYear = Number(l1.slice(20, 32));
  return new Date(Date.UTC(fullYear, 0, 1) + (dayOfYear - 1) * 86_400_000);
}

/** Pure parser: name/line1/line2 triplets, dropping any triplet whose
 *  either line fails length or checksum — never a network, so the fixture
 *  tests and the e2e fixture generator can both call it directly. */
export function parseTleGroup(text: string): (TleObject & { epoch: Date })[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const objects: (TleObject & { epoch: Date })[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!isValidTleLine(l1) || !isValidTleLine(l2)) continue;
    objects.push({ name, norad: l1.slice(2, 7), l1, l2, epoch: tleEpoch(l1) });
  }
  return objects;
}

/** Merges the two governed groups per §3 A2: stations filtered to the two
 *  NORAD ids this portfolio shows, plus every visual object; anything whose
 *  epoch is older than 7 days from `now` is dropped either way. */
export function buildTleResponse(
  stationsText: string,
  visualText: string,
  at: string,
  stale: boolean,
  now: Date = new Date(),
): TleResponse {
  const stations = parseTleGroup(stationsText).filter((o) => KEPT_STATION_NORADS.has(o.norad));
  const visual = parseTleGroup(visualText);
  const fresh = [...stations, ...visual].filter((o) => now.getTime() - o.epoch.getTime() <= MAX_EPOCH_AGE_MS);
  let epochNewest: Date | null = null;
  for (const o of fresh) {
    if (epochNewest === null || o.epoch > epochNewest) epochNewest = o.epoch;
  }
  return {
    connected: true,
    stale,
    at,
    epochNewest: epochNewest ? epochNewest.toISOString() : null,
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    objects: fresh.map(({ name, norad, l1, l2 }) => ({ name, norad, l1, l2 })),
  };
}

const UNAVAILABLE: TleResponse = {
  connected: false,
  stale: false,
  at: null,
  epochNewest: null,
  source: SOURCE,
  sourceUrl: SOURCE_URL,
  objects: [],
};

function fetchGroup(url: string, fetchImpl: typeof fetch) {
  return fetchImpl(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export async function getTle(fetchImpl: typeof fetch = fetch): Promise<TleResponse> {
  const [stationsResult, visualResult] = await Promise.all([
    governed<string>("tle-stations", () => fetchGroup(STATIONS_URL, fetchImpl), (text) => text, GOVERNOR_OPT),
    governed<string>("tle-visual", () => fetchGroup(VISUAL_URL, fetchImpl), (text) => text, GOVERNOR_OPT),
  ]);
  if (stationsResult.value === null || visualResult.value === null) return UNAVAILABLE;
  const at = Math.max(stationsResult.at ?? 0, visualResult.at ?? 0);
  const stale = stationsResult.stale || visualResult.stale;
  return buildTleResponse(stationsResult.value, visualResult.value, new Date(at).toISOString(), stale);
}

async function tleHandler(_request: Request): Promise<Response> {
  const body = await getTle();
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": CACHE_CONTROL },
  });
}

export const handleTle = guarded("tle", tleHandler);
