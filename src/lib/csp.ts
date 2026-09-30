/**
 * The one Content-Security-Policy allowlist — read by scripts/gen-csp.mjs
 * (the build-time middleware manifest generator), the preview-server plugin in
 * vite.config.ts (so a local `npm run serve` genuinely exercises the same
 * policy as production instead of nothing), and vercelHeaders.test.ts (so
 * adding a new external origin without registering it here fails a test).
 *
 * Report-only, deliberately (see this lane's brief): the point right now is
 * a truthful, mechanically-checked record of every origin this site's own
 * pages actually reach — not enforcement. The four external hosts below are
 * every one this audit found reachable from a route this site serves (grep
 * for literal fetch/tile/image URLs plus the two runtime values a static
 * grep can't see — Spotify's album-art CDN and the GitHub Pages origin the
 * heavy Wasm/screenshot/video builds moved onto — see HEAVY_ASSET_BASE).
 *
 * script-src carries no 'unsafe-inline': TanStack Start's SSR emits an inline
 * hydration <script> with no nonce hook in this plugin version, so instead
 * of allowing all inline scripts, the caller hashes the ACTUAL inline script
 * bytes of the document being served (per-request in preview, per-document
 * at build time for prerendered routes) and passes them in.
 *
 * Static production hashes are bundled with middleware from the same build;
 * fallback SSR hashes each response. inlineScriptBodies applies the
 * HTML parser's text normalization before either caller computes a hash.
 */
import { HEAVY_ASSET_BASE } from "./assetBase.ts";

// "/" in local dev (VITE_HEAVY_ASSET_BASE=/) — same-origin already, so there
// is no separate origin to allowlist. Anything else is the real GitHub Pages
// host the Wasm/screenshot/video builds actually serve from in production.
const heavyOrigin = HEAVY_ASSET_BASE.startsWith("/") ? null : new URL(HEAVY_ASSET_BASE).origin;

/**
 * Directive -> source list, EXCLUDING script-src's per-document hashes
 * (buildCspHeader splices those in). Every entry here is load-bearing: a
 * test (vercelHeaders.test.ts) fails if code references an external origin
 * that isn't named on this list.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  "default-src": ["'self'"],
  // 'wasm-unsafe-eval': three/addons' MeshoptDecoder (src/three/models.ts,
  // every GLTFLoader) compiles a WebAssembly module for every glTF this site
  // loads — StudioRig (/blueprint) and the world scenes (/map, /playground)
  // tripped "script-src: wasm-eval" without it (e2e/csp.spec.ts).
  "script-src": ["'self'", "'wasm-unsafe-eval'"], // hashes spliced in by buildCspHeader
  "style-src": [
    "'self'",
    "'unsafe-inline'", // Tailwind + inline style attrs; out of this lane's scope
    // playhtml (the shared-interaction layer every room mounts) injects its
    // own <link rel=stylesheet> from its own CDN at runtime — not a choice
    // this app's source makes, so it can't be routed same-origin without
    // forking the package.
    "https://unpkg.com",
  ],
  "img-src": [
    "'self'",
    "data:",
    // Leaflet's OSM raster tiles (src/labs/SignalLab.tsx's TILE_URL) — all
    // three round-robin subdomains, not just the one any single page load happens to hit.
    "https://a.tile.openstreetmap.org",
    "https://b.tile.openstreetmap.org",
    "https://c.tile.openstreetmap.org",
    // Spotify's album-art CDN (api/_lib/spotify-handler.ts's albumArt URL,
    // rendered by SiteFooter) — the URL comes from Spotify's own API
    // response, so it never appears as a literal in this repo's source.
    "https://i.scdn.co",
    // NASA GIBS WMS (src/world/globe/layers/gibs.ts): /globe's real-imagery
    // earth loads yesterday's VIIRS mosaic plus the Blue and Black Marble
    // bases as textures, straight from NASA (CORS *), never proxied.
    "https://gibs.earthdata.nasa.gov",
    // Panoramax's photo storage host (src/world/globe/ui/streetPhotoViewer.tsx
    // and StreetView.tsx's click-to-open lightbox/360 viewer): the search
    // API (api.panoramax.xyz, below) answers with asset URLs on THIS
    // different host — plain <img> and THREE.TextureLoader loads, CORS "*",
    // keyless. Not tiles.openfreemap.org: MapLibre fetches every style/tile/
    // sprite/glyph resource with `fetch()` (confirmed in its own bundled
    // source), which CSP scopes under connect-src, never img-src.
    "https://panoramax.openstreetmap.fr",
    ...(heavyOrigin ? [heavyOrigin] : []),
  ],
  "media-src": ["'self'", ...(heavyOrigin ? [heavyOrigin] : [])], // ShowcaseFilm's project videos
  // 'self' data: — @fontsource is bundled (no Google Fonts network origin),
  // but one of its woff2 files is inlined as a data: URI at some weight/size
  // (confirmed by a live report-only violation, e2e/csp.spec.ts).
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'", // every fetch is same-origin /api/*; Speed Insights/Analytics post to a same-origin proxy path with no dsn/basePath set
    // playhtml's shared realtime layer (every room mounts it): a PartyKit
    // websocket for the room state plus its presence channel.
    "wss://api.playhtml.fun",
    "https://api.playhtml.fun",
    // /globe's live earth events (src/world/globe/layers/{quake,eonet,
    // hazardAlerts,aurora,launches}.ts): keyless public feeds that answer
    // with CORS *, fetched straight from the browser, never proxied.
    "https://photon.komoot.io", // W11 user-initiated place search (OpenStreetMap).
    "https://api.bigdatacloud.net", // W11 user-initiated reverse geocoding.
    "https://api.open-meteo.com", // W11 user-initiated current weather (CC BY 4.0).
    "https://earthquake.usgs.gov",
    "https://eonet.gsfc.nasa.gov",
    "https://www.gdacs.org",
    "https://services.swpc.noaa.gov",
    "https://api.tidesandcurrents.noaa.gov", // src/world/globe/layers/tides.ts fetches NOAA stations and tide readings.
    "https://gibs.earthdata.nasa.gov", // src/world/globe/layers/TileLayer.tsx fetches WMTS tiles.
    "https://ll.thespacedevs.com",
    // /globe's street level (src/world/globe/ui/StreetView.tsx, streetPhotos.ts):
    // OpenFreeMap's keyless "liberty" style (style JSON, vector .pbf tiles,
    // sprite JSON/PNG, glyph .pbf, and the fallback raster base) — MapLibre
    // GL fetches every one of these with `fetch()`, never `<img>`, so this
    // whole family sits under connect-src, not img-src. CORS "*", verified.
    "https://tiles.openfreemap.org",
    // Panoramax's search API (StreetView.tsx's bbox photo query) — CORS
    // echoes the request Origin rather than "*", still keyless.
    "https://api.panoramax.xyz",
    // LANE V1 (wave 7, step B): EOX's s2cloudless deep-zoom base
    // (src/world/globe/layers/gibsCatalog.ts's "s2cloudless" entry) —
    // TileLayer.tsx loads every tile, GIBS and EOX alike, with
    // `fetch()` + `createImageBitmap()`, which CSP governs under
    // connect-src, not img-src (same fetch()-vs-img-src distinction this
    // file already draws for OpenFreeMap above). CORS *, keyless, verified
    // 2026-09-29.
    "https://tiles.maps.eox.at",
    // LANE V5 (wave 7, lane 5 step A): NOAA NHC's forecast-cone MapServer
    // (src/world/globe/layers/feedUrls.ts's NHC_MAPSERVER_BASE) — queried
    // straight from the browser, CORS echoes the request Origin with
    // credentials, keyless, verified 2026-09-29.
    "https://mapservices.weather.noaa.gov",
    // LANE S3 (wave 9): Open-Meteo's marine/air-quality/flood sibling
    // subdomains (src/world/globe/layers/{marine,airQuality,flood}.ts) --
    // same free, keyless, CC BY 4.0, CORS "*" family as api.open-meteo.com
    // above, fetched straight from the browser on hover, never proxied.
    // Verified live 2026-09-30.
    "https://marine-api.open-meteo.com",
    "https://air-quality-api.open-meteo.com",
    "https://flood-api.open-meteo.com",
    // useLivePaint.ts pings a DeviceWall/DeviceMorph target's own URL to
    // detect when its Wasm runtime has actually painted — a fetch this
    // repo's source makes, on top of frame-src's embedding grant below.
    ...(heavyOrigin ? [heavyOrigin] : []),
  ],
  "frame-src": ["'self'", ...(heavyOrigin ? [heavyOrigin] : [])], // DeviceWall/DeviceMorph iframes onto the GitHub Pages Wasm builds
  "worker-src": ["'self'"], // src/chess/engineClient.ts's module Worker — same-origin, no blob: needed since the Godot/Compose Wasm builds moved off this origin (see heavyOrigin above)
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "manifest-src": ["'self'"],
};

/**
 * Builds the header value, splicing script hashes (each a bare base64 sha256
 * digest, e.g. "abc123...=") into script-src as 'sha256-...'.
 *
 * Callers also include the root's JSON-LD for client-side head updates.
 * Hashing stays in Node callers; this shared module only normalizes text and
 * builds the policy, so browser consumers never import node:crypto.
 */
export function buildCspHeader(scriptHashes: readonly string[]): string {
  const directives = { ...CSP_DIRECTIVES, "script-src": [...CSP_DIRECTIVES["script-src"], ...[...new Set(scriptHashes)].map((h) => `'sha256-${h}'`)] };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/** Script text as the HTML parser presents it to CSP, not raw response bytes. */
export function inlineScriptBodies(html: string): string[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((match) => !/(?:^|\s)src\s*=/i.test(match[1]))
    .map((match) => match[2].replace(/\r\n?/g, "\n").replace(/\0/g, "\uFFFD"))
    .filter((body) => body.trim().length > 0);
}

/** Every external (non-'self', non-scheme-keyword) origin this policy allows,
 * flattened — what the drift test in vercelHeaders.test.ts diffs a live grep
 * of the codebase against. */
export function allowedExternalOrigins(): string[] {
  const originLike = /^https?:\/\//;
  return Object.values(CSP_DIRECTIVES)
    .flat()
    .filter((v) => originLike.test(v));
}
