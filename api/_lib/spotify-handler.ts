import { guarded } from "./guard.js";
import { governed, type GovernorOptions } from "./upstream.js";

declare const process: { env: Record<string, string | undefined> };

// audit fix (2026-09-28): streams.ts's own "radio" stream polls /api/spotify
// every 60_000ms, but the edge cache was s-maxage=15 — almost every client
// poll missed the CDN and hit Spotify directly. Raise to 60s + a 5 min swr
// (ratio kept close to github-activity-handler's 120/900), and coalesce the
// actual Spotify round-trip through governed() (aircraft/tle's pattern) so
// concurrent edge isolates during a cold-cache moment share one fetch and a
// real network failure backs off instead of retrying every poll. The OAuth
// token exchange above (D3) is a separate, already-memoised concern and is
// untouched by this.
const GOVERNOR_OPT: GovernorOptions = {
  minIntervalMs: 30_000, // floor under the 60 s edge cache, for coalescing across isolates
  maxStaleMs: 5 * 60_000, // matches the cache-control swr below
  maxBytes: 128 * 1024, // "now playing" + 5 recently-played tracks is a few KB
  cooldownMs: 30_000,
  maxCooldownMs: 5 * 60_000,
};
const OK_CACHE_CONTROL = "s-maxage=60, stale-while-revalidate=300";
const UPSTREAM_TIMEOUT_MS = 8000;

// Reuse the router's private readCapped via governed. These body reads have
// no cache/backoff; the outer poll governor owns both policies.
async function cappedJson<T>(key: string, res: Response): Promise<T> {
  const { value } = await governed<T>(`spotify-body:${key}`,
    async () => new Response(res.body, { status: 200 }),
    (text) => JSON.parse(text) as T,
    { ...GOVERNOR_OPT, minIntervalMs: 0, maxStaleMs: -1, cooldownMs: 0, maxCooldownMs: 0 });
  if (value === null) throw new Error("Spotify upstream body unavailable");
  return value;
}

export type SpotifyTrack = { track: string; artist: string; albumArt?: string; url?: string; playedAt?: string };
export type SpotifyNow = {
  connected: boolean;
  isPlaying: boolean;
  track?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  url?: string;
  recent: SpotifyTrack[];
  /** Set when Spotify refused the account (401/403), so /api/spotify says why it is dark. */
  refusedStatus?: number;
};

const EMPTY: SpotifyNow = { connected: false, isPlaying: false, recent: [] };

interface SpotifyApiTrack {
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
}

function fromApiTrack(t: SpotifyApiTrack) {
  return {
    track: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    albumArt: t.album.images[0]?.url,
    url: t.external_urls.spotify,
  };
}

/**
 * D3 in the architecture council: this used to run a full OAuth refresh
 * exchange (client_id + client_secret + refresh_token) before EVERY request's
 * two data calls, on an endpoint with no cache. A Spotify access token is
 * good for `expires_in` seconds (documented ~3600) — memoised here in module
 * scope, keyed on nothing but time, so a warm isolate spends one exchange per
 * token lifetime rather than one per request.
 *
 * ponytail: module-scope only, resets on a cold start — same tradeoff
 * ops-handler.ts's cache makes, and for the same reason (no KV/Upstash
 * dependency for a portfolio site). A cold start costs one extra exchange,
 * not a correctness bug.
 */
export type SpotifyTokenCache = { token: string; expiresAt: number } | null;
export type SpotifyTokenCacheBox = { value: SpotifyTokenCache };
const tokenCache: SpotifyTokenCacheBox = { value: null };

async function getAccessToken(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  now: number,
  cache: SpotifyTokenCacheBox,
): Promise<string | null> {
  if (cache.value && cache.value.expiresAt > now) return cache.value.token;

  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } = env;
  if (!id || !secret || !refresh) return null;
  const res = await fetchImpl("https://accounts.spotify.com/api/token", {
    method: "POST",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }).toString(),
  });
  if (!res.ok) return null;
  const json = await cappedJson<{ access_token: string; expires_in?: number }>("token", res);
  // Refresh a little early (60s of slack) so a token that's about to expire
  // is never handed out only to die mid-request.
  const ttlMs = Math.max(0, ((json.expires_in ?? 3600) - 60) * 1000);
  cache.value = { token: json.access_token, expiresAt: now + ttlMs };
  return json.access_token;
}

// The discriminated shape governed() caches/coalesces — one poll of "what is
// Spotify doing right now", covering the currently-playing call and (only
// when nothing is playing) the recently-played fallback in a single unit,
// since both share the same edge-cache TTL anyway. Packaged as a normal ok
// Response so governed() never treats a Spotify-side refusal (401/403) as an
// upstream outage worth a cooldown — getSpotifyNow below decides what a
// refusal means; only a real fetch() rejection (network/timeout) reaches
// governed()'s own backoff.
type SpotifyPoll =
  | { kind: "refused"; status: 401 | 403 }
  | { kind: "playing"; isPlaying: boolean; item: SpotifyApiTrack }
  | { kind: "idle"; recent: { played_at: string; track: SpotifyApiTrack }[] };

async function fetchSpotifyPoll(fetchImpl: typeof fetch, auth: Record<string, string>): Promise<Response> {
  const nowRes = await fetchImpl("https://api.spotify.com/v1/me/player/currently-playing", { headers: auth, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });

  // A refusal is not "nothing playing". Dev-mode apps get 403 "Active premium
  // subscription required for the owner of the app"; a revoked token gets 401.
  if (nowRes.status === 401 || nowRes.status === 403) {
    const poll: SpotifyPoll = { kind: "refused", status: nowRes.status };
    return new Response(JSON.stringify(poll), { status: 200 });
  }

  if (nowRes.status === 200) {
    const json = await cappedJson<{ is_playing: boolean; item: SpotifyApiTrack | null }>("playing", nowRes);
    if (json.item) {
      const poll: SpotifyPoll = { kind: "playing", isPlaying: json.is_playing, item: json.item };
      return new Response(JSON.stringify(poll), { status: 200 });
    }
  }

  const recentRes = await fetchImpl("https://api.spotify.com/v1/me/player/recently-played?limit=5", { headers: auth, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  const recent = recentRes.ok
    ? (await cappedJson<{ items: { played_at: string; track: SpotifyApiTrack }[] }>("recent", recentRes)).items
    : [];
  const poll: SpotifyPoll = { kind: "idle", recent };
  return new Response(JSON.stringify(poll), { status: 200 });
}

/** Testable core: no Request/Response, just env + an injectable fetch/clock/cache. */
export async function getSpotifyNow(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
  cache: SpotifyTokenCacheBox = tokenCache,
): Promise<SpotifyNow> {
  const token = await getAccessToken(env, fetchImpl, now, cache).catch(() => null);
  if (!token) return EMPTY;

  const auth = { authorization: `Bearer ${token}` };
  const { value } = await governed<SpotifyPoll>(
    "spotify-now",
    () => fetchSpotifyPoll(fetchImpl, auth),
    (text) => JSON.parse(text) as SpotifyPoll,
    GOVERNOR_OPT,
  );
  if (value === null) return EMPTY;

  if (value.kind === "refused") {
    // Report disconnected so no empty chip renders; the first request after
    // the refusal lifts goes live on its own. A 401 also drops the cached
    // token so the next request re-exchanges instead of reusing a dead one
    // for an hour — runs every time this refusal is observed, including a
    // cached/stale replay, which is harmless (clearing an already-null cache).
    if (value.status === 401) cache.value = null;
    return { ...EMPTY, refusedStatus: value.status };
  }

  if (value.kind === "playing") {
    return { connected: true, isPlaying: value.isPlaying, ...fromApiTrack(value.item), recent: [] };
  }

  return {
    connected: true,
    isPlaying: false,
    recent: value.recent.map((it) => ({ ...fromApiTrack(it.track), playedAt: it.played_at })),
  };
}

async function spotifyHandler(_request: Request): Promise<Response> {
  const now = await getSpotifyNow(process.env);
  return new Response(JSON.stringify(now), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": OK_CACHE_CONTROL,
    },
  });
}

/**
 * D3 in the architecture council: no origin allowlist and no rate limiter,
 * on top of the unmemoised token exchange getAccessToken now fixes. Guarded
 * the same way ops/pipeline/github-activity are, via guard.ts.
 */
export const handleSpotify = guarded("spotify", spotifyHandler);
