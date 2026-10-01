// LANE L7 (live earth events). Pure Launch Library 2 parsing, the countdown
// formatter, and a tiny sessionStorage cache — LL2 is 15 req/hour
// unauthenticated (this lane's brief), so HazardLayer fetches it once per
// page load and this cache is what makes a second mount, or a fast-refresh,
// not count as a second request. No three, no React.
//
// Feed: https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10
export const LAUNCH_CACHE_TTL_MS = 30 * 60_000;
const CACHE_KEY = "cv-siddharth:hazard-launches";

interface RawLaunch {
  id: string;
  name: string;
  net: string;
  status?: { abbrev?: string };
  launch_service_provider?: { name?: string };
  pad?: { name?: string; latitude?: string; longitude?: string; location?: { name?: string } };
}
interface RawFeed {
  results: RawLaunch[];
}

export interface Launch {
  id: string;
  name: string;
  provider: string;
  netMs: number;
  padName: string;
  locationName: string;
  lat: number;
  lon: number;
  within24h: boolean;
}

const MAX_LAUNCHES = 8;
const WITHIN_24H_MS = 24 * 60 * 60_000;

/** `null` on a feed that doesn't look real. Only forward-looking launches
 *  with a real pad position survive — LL2's own "upcoming" list still
 *  includes the just-flown (this lane's committed fixture has one), and a
 *  pad this lane can't place on the globe can't draw a marker either. */
export function parseLaunches(json: unknown, nowMs: number): Launch[] | null {
  const feed = json as Partial<RawFeed> | null;
  if (!feed || typeof feed !== "object" || !Array.isArray(feed.results)) return null;

  const out: Launch[] = [];
  for (const r of feed.results) {
    const netMs = Date.parse(r.net);
    if (!Number.isFinite(netMs) || netMs <= nowMs) continue;
    const lat = Number(r.pad?.latitude);
    const lon = Number(r.pad?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      id: r.id,
      name: r.name,
      provider: r.launch_service_provider?.name ?? "unknown provider",
      netMs,
      padName: r.pad?.name ?? "unnamed pad",
      locationName: r.pad?.location?.name ?? "",
      lat,
      lon,
      within24h: netMs - nowMs <= WITHIN_24H_MS,
    });
  }
  out.sort((a, b) => a.netMs - b.netMs);
  return out.slice(0, MAX_LAUNCHES);
}

/** "T-14h 32m" style, for the inspector's countdown row. */
export function formatCountdown(nowMs: number, netMs: number): string {
  const deltaMin = Math.max(0, Math.round((netMs - nowMs) / 60_000));
  const days = Math.floor(deltaMin / 1440);
  const hours = Math.floor((deltaMin % 1440) / 60);
  const minutes = deltaMin % 60;
  if (days > 0) return `T-${days}d ${hours}h`;
  if (hours > 0) return `T-${hours}h ${minutes}m`;
  return `T-${minutes}m`;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `storage` is injectable so this is testable without a real
 *  `sessionStorage` (vitest here runs under `environment: "node"` — no
 *  `window`). The real caller passes `window.sessionStorage`. */
export function getCachedLaunches(storage: StorageLike, nowMs: number): Launch[] | null {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAtMs: number; launches: Launch[] };
    if (nowMs - parsed.fetchedAtMs > LAUNCH_CACHE_TTL_MS) return null;
    return parsed.launches;
  } catch {
    return null;
  }
}

export function setCachedLaunches(storage: StorageLike, launches: Launch[], nowMs: number): void {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify({ fetchedAtMs: nowMs, launches }));
  } catch {
    // sessionStorage full or unavailable (private mode) — the cache is an
    // optimization, not a correctness requirement, so this is silently fine.
  }
}
