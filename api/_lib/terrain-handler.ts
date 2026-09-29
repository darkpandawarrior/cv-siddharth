// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as aircraft-handler.ts.
import { guarded } from "./guard.js";
import { governed, type GovernorOptions } from "./upstream.js";

// AWS Open Data "elevation-tiles-prod" bucket, Terrarium-encoded PNG DEM
// tiles (public S3, no key, no CORS needed since this route fetches
// server-side). curl-verified 2026-09-30: z0 and z14/z15 over Pune (18.52N
// 73.86E) all 200 (Content-Type image/png, x-amz-meta-x-imagery-sources
// "srtm/N18E073.tif" for the Pune cell); z16 and an out-of-range x/y both
// 404 the same way — max zoom for this dataset is 15.
const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const MIN_Z = 0;
const MAX_Z = 15; // curl-verified ceiling, see above
const USER_AGENT = "siddharth-pandalai.vercel.app portfolio";
const FETCH_TIMEOUT_MS = 6_000;
// These tiles never change (SRTM baked once — Last-Modified on the bucket is
// 2017) so the CDN, not this function, should absorb every repeat visitor:
// a long, immutable s-maxage matching the brief.
const CACHE_CONTROL = "public, max-age=0, s-maxage=2592000, immutable";

const GOVERNOR_OPT: GovernorOptions = {
  // Each (z,x,y) is its own governor key (distinct content), so this floor
  // only guards a client re-requesting the SAME tile before the CDN has
  // cached it — not a cross-tile rate limit, which the CDN's own s-maxage
  // already provides once a tile has been served once.
  minIntervalMs: 250,
  maxStaleMs: 30 * 24 * 60 * 60_000, // content is immutable — "stale" never really applies
  maxBytes: 400 * 1024, // raw PNG measured ~95 KB (z14 Pune tile); base64 inflates ~1.34x
  cooldownMs: 30_000,
  maxCooldownMs: 5 * 60_000,
};

// A street session pans across many distinct tiles quickly; the guard's
// default 30/min (sized for a human refreshing a JSON panel) would 429 a
// normal pan. Tiles are cheap, cacheable, and per-key coalesced by governed()
// — generous headroom here, still bounded against a scripted hammer.
const RATE_RULES = [{ ms: 60_000, max: 600 }];

/**
 * z/x/y from the query string: must be plain non-negative integers, z within
 * the dataset's real zoom range, and x/y within that zoom's tile grid — the
 * brief's "reject anything out of range". Pure, no network, so this is unit
 * testable on its own.
 */
export function parseTileParams(url: URL): { z: number; x: number; y: number } | null {
  const zRaw = url.searchParams.get("z");
  const xRaw = url.searchParams.get("x");
  const yRaw = url.searchParams.get("y");
  if (zRaw === null || xRaw === null || yRaw === null) return null;
  // \d+ also rejects "-1", "1.5", "1e3", leading "+" etc. — anything that
  // isn't a bare non-negative integer literal.
  if (!/^\d+$/.test(zRaw) || !/^\d+$/.test(xRaw) || !/^\d+$/.test(yRaw)) return null;
  const z = Number(zRaw);
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (z < MIN_Z || z > MAX_Z) return null;
  const maxIndex = 2 ** z - 1;
  if (x < 0 || x > maxIndex || y < 0 || y > maxIndex) return null;
  return { z, x, y };
}

// governed()'s readCapped decodes the upstream body as UTF-8 text (built for
// JSON payloads) — feeding it raw PNG bytes directly would corrupt any byte
// sequence that isn't valid UTF-8, unrecoverably. Base64 is pure ASCII, so
// round-tripping the tile through it survives that decode losslessly; the
// handler below decodes it back to bytes before answering the browser.
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000; // avoid a giant argument list to String.fromCharCode
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fetchTileAsBase64(z: number, x: number, y: number, fetchImpl: typeof fetch): Promise<Response> {
  const res = await fetchImpl(TILE_URL(z, x, y), {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // Not-ok is returned as-is: governed() only reads res.ok/res.headers on
  // this branch, never the body, so no base64 wrapping is needed here.
  if (!res.ok) return res;
  let size = 0;
  const capped = res.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > 300 * 1024) throw new Error("terrain tile exceeded 300 KiB");
      controller.enqueue(chunk);
    },
  }));
  const buf = await new Response(capped).arrayBuffer();
  return new Response(bufferToBase64(buf), { status: res.status });
}

/** Real PNG bytes on success, `null` on any upstream failure (never a stale
 *  body dressed as fresh — for an immutable tile "stale" only ever means
 *  "already fetched", so a hit here is exactly as good as a fresh one). */
export async function getTerrainTile(
  z: number,
  x: number,
  y: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const { value } = await governed<string>(
    `terrain:${z}:${x}:${y}`,
    () => fetchTileAsBase64(z, x, y, fetchImpl),
    (text) => text,
    GOVERNOR_OPT,
  );
  return value === null ? null : base64ToBytes(value);
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function terrainHandler(request: Request): Promise<Response> {
  const params = parseTileParams(new URL(request.url));
  if (!params) return jsonError(400, "z, x, y must be non-negative integers, z 0-15, x/y inside that zoom's tile grid.");
  const bytes = await getTerrainTile(params.z, params.x, params.y);
  if (bytes === null) return jsonError(502, "terrain tile upstream unavailable");
  return new Response(new Blob([bytes]), {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": CACHE_CONTROL },
  });
}

export const handleTerrain = guarded("terrain", terrainHandler, RATE_RULES);
