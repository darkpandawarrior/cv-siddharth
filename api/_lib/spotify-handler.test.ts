import { describe, it, expect, vi } from "vitest";
import { getSpotifyNow, handleSpotify, type SpotifyTokenCacheBox } from "./spotify-handler";

function fakeFetch(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.keys(responses).find((k) => url.includes(k));
    if (!match) throw new Error(`unexpected fetch: ${url}`);
    const { status, body } = responses[match];
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
}

// A fresh box per test: getSpotifyNow's token memoisation is the whole point
// of D3's fix, but that means the module-scope default cache would leak a
// cached token between these otherwise-independent tests. Passing an
// explicit, empty box (same shape production's module-scope one is) keeps
// each test's env/fetch pairing honest — the caching behaviour itself gets
// its own describe block below, with a cache it deliberately reuses.
const freshCache = (): SpotifyTokenCacheBox => ({ value: null });

describe("getSpotifyNow", () => {
  it("returns connected:false when env vars are missing", async () => {
    const result = await getSpotifyNow({}, fetch, Date.now(), freshCache());
    expect(result).toEqual({ connected: false, isPlaying: false, recent: [] });
  });

  it("returns the currently-playing track when Spotify reports one", async () => {
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": {
        status: 200,
        body: {
          is_playing: true,
          item: {
            name: "Song A",
            artists: [{ name: "Artist A" }],
            album: { name: "Album A", images: [{ url: "https://img/a.jpg" }] },
            external_urls: { spotify: "https://open.spotify.com/track/a" },
          },
        },
      },
    });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, Date.now(), freshCache());
    expect(result.connected).toBe(true);
    expect(result.isPlaying).toBe(true);
    expect(result.track).toBe("Song A");
    expect(result.artist).toBe("Artist A");
    expect(result.albumArt).toBe("https://img/a.jpg");
  });

  it("falls back to recently-played when nothing is currently playing", async () => {
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": { status: 204 },
      "recently-played": {
        status: 200,
        body: {
          items: [
            {
              played_at: "2026-07-29T10:00:00Z",
              track: {
                name: "Song B",
                artists: [{ name: "Artist B" }],
                album: { name: "Album B", images: [{ url: "https://img/b.jpg" }] },
                external_urls: { spotify: "https://open.spotify.com/track/b" },
              },
            },
          ],
        },
      },
    });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, Date.now(), freshCache());
    expect(result.connected).toBe(true);
    expect(result.isPlaying).toBe(false);
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0].track).toBe("Song B");
  });

  it("returns connected:false when the token exchange fails", async () => {
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "bad" };
    const fetchImpl = fakeFetch({ "accounts.spotify.com/api/token": { status: 400, body: { error: "invalid_grant" } } });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, Date.now(), freshCache());
    expect(result.connected).toBe(false);
  });
});

describe("getSpotifyNow — D3: the access token is memoised for its lifetime", () => {
  const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
  const nowPlaying = {
    status: 200,
    body: {
      is_playing: true,
      item: {
        name: "Song A",
        artists: [{ name: "Artist A" }],
        album: { name: "Album A", images: [{ url: "https://img/a.jpg" }] },
        external_urls: { spotify: "https://open.spotify.com/track/a" },
      },
    },
  };

  it("exchanges once per isolate, not once per request, while the token is still valid", async () => {
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": nowPlaying,
    });
    const cache = freshCache();
    const t0 = 1_000_000;
    await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, t0, cache);
    await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, t0 + 1000, cache);
    await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, t0 + 60_000, cache);

    const tokenCalls = fetchImpl.mock.calls.filter(([u]) => String(u).includes("accounts.spotify.com/api/token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("exchanges again once the token's lifetime (minus the 60s refresh margin) has passed", async () => {
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": nowPlaying,
    });
    const cache = freshCache();
    const t0 = 1_000_000;
    await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, t0, cache);
    // 3600s ttl - 60s margin = 3540s. One second past that, the cached token
    // must be treated as expired rather than handed out anyway.
    await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, t0 + 3541 * 1000, cache);

    const tokenCalls = fetchImpl.mock.calls.filter(([u]) => String(u).includes("accounts.spotify.com/api/token"));
    expect(tokenCalls).toHaveLength(2);
  });
});

describe("handleSpotify", () => {
  it("sets a short edge-cache header", async () => {
    const response = await handleSpotify(new Request("http://localhost/api/spotify"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=15, stale-while-revalidate=60");
  });
});
