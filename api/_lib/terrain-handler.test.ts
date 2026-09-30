import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseTileParams } from "./terrain-handler";

function url(qs: string): URL {
  return new URL(`http://localhost/api/terrain${qs}`);
}

// A 4-byte body is enough to prove the base64 round trip through governed()
// is lossless — every byte value, including 0x00 and 0xff, which a naive
// text decode would corrupt.
const FAKE_PNG_BYTES = new Uint8Array([0x00, 0x89, 0x50, 0xff]);

describe("parseTileParams", () => {
  it("accepts a valid z/x/y inside the tile grid for that zoom", () => {
    expect(parseTileParams(url("?z=14&x=11553&y=7334"))).toEqual({ z: 14, x: 11553, y: 7334 });
  });

  it("accepts the single z0 tile (0,0)", () => {
    expect(parseTileParams(url("?z=0&x=0&y=0"))).toEqual({ z: 0, x: 0, y: 0 });
  });

  it("rejects a missing param", () => {
    expect(parseTileParams(url("?z=14&x=11553"))).toBeNull();
  });

  it("rejects a non-integer value", () => {
    expect(parseTileParams(url("?z=14.5&x=11553&y=7334"))).toBeNull();
    expect(parseTileParams(url("?z=14&x=abc&y=7334"))).toBeNull();
  });

  it("rejects a negative value", () => {
    expect(parseTileParams(url("?z=14&x=-1&y=7334"))).toBeNull();
  });

  it("rejects z past the dataset's real ceiling (curl-verified z16 404s)", () => {
    expect(parseTileParams(url("?z=16&x=0&y=0"))).toBeNull();
  });

  it("rejects x/y outside the tile grid for the given zoom", () => {
    // z=1 has a 2x2 grid: only 0/1 are valid indices.
    expect(parseTileParams(url("?z=1&x=2&y=0"))).toBeNull();
    expect(parseTileParams(url("?z=1&x=0&y=2"))).toBeNull();
    expect(parseTileParams(url("?z=1&x=1&y=1"))).toEqual({ z: 1, x: 1, y: 1 });
  });
});

describe("getTerrainTile / handleTerrain", () => {
  // The governor's state is module-scope, keyed per z/x/y — resetModules +
  // a fresh dynamic import gives each test its own instance instead of
  // leaking cooldown/last-good across cases (same discipline as
  // aircraft-handler.test.ts).
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips arbitrary bytes (including 0x00/0xff) through the base64 governor wrapper unmodified", async () => {
    const { getTerrainTile } = await import("./terrain-handler");
    const fetchImpl = vi.fn(async () => new Response(FAKE_PNG_BYTES.buffer as ArrayBuffer, { status: 200 }));
    const bytes = await getTerrainTile(14, 11553, 7334, fetchImpl as unknown as typeof fetch);
    expect(bytes).toEqual(FAKE_PNG_BYTES);
  });

  it("rejects oversized PNG bodies before base64 buffering", async () => {
    const { getTerrainTile } = await import("./terrain-handler");
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(300 * 1024 + 1)));
    expect(await getTerrainTile(14, 11553, 7334, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it("a failed upstream fetch gives null", async () => {
    const { getTerrainTile } = await import("./terrain-handler");
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const bytes = await getTerrainTile(14, 11553, 7334, fetchImpl as unknown as typeof fetch);
    expect(bytes).toBeNull();
  });

  it("a non-2xx upstream status gives null, not a stale/empty body dressed as a tile", async () => {
    const { getTerrainTile } = await import("./terrain-handler");
    const fetchImpl = vi.fn(async () => new Response("not found", { status: 404 }));
    const bytes = await getTerrainTile(14, 11553, 7334, fetchImpl as unknown as typeof fetch);
    expect(bytes).toBeNull();
  });

  it("handleTerrain answers 400 JSON for an out-of-range param, never touching the network", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const { handleTerrain } = await import("./terrain-handler");
    const res = await handleTerrain(new Request("http://localhost/api/terrain?z=99&x=0&y=0"));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("handleTerrain answers 200 image/png with the immutable cache header on a clean upstream tile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(FAKE_PNG_BYTES.buffer as ArrayBuffer, { status: 200 })),
    );
    const { handleTerrain } = await import("./terrain-handler");
    const res = await handleTerrain(new Request("http://localhost/api/terrain?z=14&x=11553&y=7334"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=2592000, immutable");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(FAKE_PNG_BYTES);
  });

  it("handleTerrain answers 502 JSON, never a stale body dressed as fresh, when the upstream is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const { handleTerrain } = await import("./terrain-handler");
    const res = await handleTerrain(new Request("http://localhost/api/terrain?z=14&x=11553&y=7334"));
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toBe("application/json");
  });
});
