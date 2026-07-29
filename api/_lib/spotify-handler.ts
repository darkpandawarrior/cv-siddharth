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

async function getAccessToken(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
): Promise<string | null> {
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
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Testable core: no Request/Response, just env + an injectable fetch. */
export async function getSpotifyNow(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<SpotifyNow> {
  const token = await getAccessToken(env, fetchImpl);
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

export async function handleSpotify(request: Request): Promise<Response> {
  void request;
  const now = await getSpotifyNow(process.env);
  return new Response(JSON.stringify(now), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
    },
  });
}
