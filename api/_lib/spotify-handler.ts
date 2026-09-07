import { guarded } from "./guard.js";

declare const process: { env: Record<string, string | undefined> };

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
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }).toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  // Refresh a little early (60s of slack) so a token that's about to expire
  // is never handed out only to die mid-request.
  const ttlMs = Math.max(0, ((json.expires_in ?? 3600) - 60) * 1000);
  cache.value = { token: json.access_token, expiresAt: now + ttlMs };
  return json.access_token;
}

/** Testable core: no Request/Response, just env + an injectable fetch/clock/cache. */
export async function getSpotifyNow(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
  cache: SpotifyTokenCacheBox = tokenCache,
): Promise<SpotifyNow> {
  const token = await getAccessToken(env, fetchImpl, now, cache);
  if (!token) return EMPTY;

  const auth = { authorization: `Bearer ${token}` };
  const nowRes = await fetchImpl("https://api.spotify.com/v1/me/player/currently-playing", { headers: auth });

  if (nowRes.status === 200) {
    const json = (await nowRes.json()) as { is_playing: boolean; item: SpotifyApiTrack | null };
    if (json.item) {
      return { connected: true, isPlaying: json.is_playing, ...fromApiTrack(json.item), recent: [] };
    }
  }

  const recentRes = await fetchImpl("https://api.spotify.com/v1/me/player/recently-played?limit=5", { headers: auth });
  if (!recentRes.ok) return { connected: true, isPlaying: false, recent: [] };
  const recentJson = (await recentRes.json()) as { items: { played_at: string; track: SpotifyApiTrack }[] };
  return {
    connected: true,
    isPlaying: false,
    recent: recentJson.items.map((it) => ({ ...fromApiTrack(it.track), playedAt: it.played_at })),
  };
}

async function spotifyHandler(_request: Request): Promise<Response> {
  const now = await getSpotifyNow(process.env);
  return new Response(JSON.stringify(now), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
    },
  });
}

/**
 * D3 in the architecture council: no origin allowlist and no rate limiter,
 * on top of the unmemoised token exchange getAccessToken now fixes. Guarded
 * the same way ops/pipeline/github-activity are, via guard.ts.
 */
export const handleSpotify = guarded("spotify", spotifyHandler);
