import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpotifyTokenCacheBox } from "./spotify-handler";

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

// spotify-handler.ts's governed() state (key "spotify-now") is module-scope
// too, on top of the token cache — resetModules + a fresh dynamic import per
// test gives each one its own governor instance instead of leaking
// last-good/cooldown across otherwise-independent cases (same pattern as
// aircraft-handler.test.ts and github-activity-handler.test.ts).
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getSpotifyNow", () => {
  it("returns connected:false when env vars are missing", async () => {
    const { getSpotifyNow } = await import("./spotify-handler");
    const result = await getSpotifyNow({}, fetch, Date.now(), freshCache());
    expect(result).toEqual({ connected: false, isPlaying: false, recent: [] });
  });

  it("returns the currently-playing track when Spotify reports one", async () => {
    const { getSpotifyNow } = await import("./spotify-handler");
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
    const { getSpotifyNow } = await import("./spotify-handler");
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
    const { getSpotifyNow } = await import("./spotify-handler");
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "bad" };
    const fetchImpl = fakeFetch({ "accounts.spotify.com/api/token": { status: 400, body: { error: "invalid_grant" } } });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, Date.now(), freshCache());
    expect(result.connected).toBe(false);
  });

  it("reports disconnected, not an empty connected chip, when Spotify refuses the account", async () => {
    const { getSpotifyNow } = await import("./spotify-handler");
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
    // No recently-played entry: fakeFetch throws if the refusal path still asks for it.
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": { status: 403, body: { error: { status: 403, message: "Active premium subscription required for the owner of the app." } } },
    });
    const cache = freshCache();
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, Date.now(), cache);
    expect(result).toEqual({ connected: false, isPlaying: false, recent: [], refusedStatus: 403 });
    expect(cache.value).not.toBeNull(); // a 403 is about the account, the token is still good
  });

  it("drops the cached token on a 401 so the next request re-exchanges", async () => {
    const { getSpotifyNow } = await import("./spotify-handler");
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
    const fetchImpl = fakeFetch({
      "accounts.spotify.com/api/token": { status: 200, body: { access_token: "tok", expires_in: 3600 } },
      "currently-playing": { status: 401 },
    });
    const cache = freshCache();
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, Date.now(), cache);
    expect(result.refusedStatus).toBe(401);
    expect(cache.value).toBeNull();
  });

  it("coalesces two calls inside the same poll window into one currently-playing fetch", async () => {
    // governed()'s minIntervalMs (30s) means a second call moments later,
    // while the first's last-good is still servable, is served from cache
    // instead of hitting Spotify again — the whole point of the fix.
    const { getSpotifyNow } = await import("./spotify-handler");
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
    const cache = freshCache();
    const t0 = Date.now();
    await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, t0, cache);
    const result2 = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch, t0 + 1000, cache);
    expect(result2.track).toBe("Song A");
    const playingCalls = fetchImpl.mock.calls.filter(([u]) => String(u).includes("currently-playing"));
    expect(playingCalls).toHaveLength(1);
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
    const { getSpotifyNow } = await import("./spotify-handler");
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
    const { getSpotifyNow } = await import("./spotify-handler");
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
  it("sets a 60s edge-cache header with a 5 min swr, matching streams.ts's 60s poll", async () => {
    const { handleSpotify } = await import("./spotify-handler");
    const response = await handleSpotify(new Request("http://localhost/api/spotify"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate=300");
  });
});


describe("Spotify upstream bounds", () => {
  const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "refresh" };
  for (const endpoint of ["token", "currently-playing", "recently-played"]) {
    it(`aborts a stalled ${endpoint} request and returns disconnected`, async () => {
      const { getSpotifyNow } = await import("./spotify-handler");
      vi.useFakeTimers();
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
        return controller.signal;
      });
      const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        if (url.includes(endpoint)) return new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
        });
        return Promise.resolve(url.includes("api/token")
          ? Response.json({ access_token: "tok", expires_in: 3600 })
          : new Response(null, { status: 204 }));
      });
      const result = getSpotifyNow(env, fetchImpl, Date.now(), freshCache());
      await vi.advanceTimersByTimeAsync(8000);
      expect(await result).toEqual({ connected: false, isPlaying: false, recent: [] });
      vi.restoreAllMocks();
    });
  }
  it("rejects an oversized token body before parsing it", async () => {
    const { getSpotifyNow } = await import("./spotify-handler");
    const cache = freshCache();
    const fetchImpl = vi.fn(async () => Response.json({ access_token: "x".repeat(128 * 1024) }));
    expect(await getSpotifyNow(env, fetchImpl, Date.now(), cache)).toEqual({ connected: false, isPlaying: false, recent: [] });
    expect(cache.value).toBeNull();
  });
});
