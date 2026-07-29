import { describe, it, expect, vi } from "vitest";
import { getSpotifyNow, handleSpotify } from "./spotify-handler";

function fakeFetch(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.keys(responses).find((k) => url.includes(k));
    if (!match) throw new Error(`unexpected fetch: ${url}`);
    const { status, body } = responses[match];
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
}

describe("getSpotifyNow", () => {
  it("returns connected:false when env vars are missing", async () => {
    const result = await getSpotifyNow({});
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
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch);
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
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.isPlaying).toBe(false);
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0].track).toBe("Song B");
  });

  it("returns connected:false when the token exchange fails", async () => {
    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "bad" };
    const fetchImpl = fakeFetch({ "accounts.spotify.com/api/token": { status: 400, body: { error: "invalid_grant" } } });
    const result = await getSpotifyNow(env, fetchImpl as unknown as typeof fetch);
    expect(result.connected).toBe(false);
  });
});

describe("handleSpotify", () => {
  it("sets a short edge-cache header", async () => {
    const response = await handleSpotify(new Request("http://localhost/api/spotify"));
    expect(response.headers.get("cache-control")).toBe("s-maxage=15, stale-while-revalidate=60");
  });
});
