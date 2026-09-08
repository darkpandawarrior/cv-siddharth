/**
 * The one Content-Security-Policy allowlist — read by scripts/gen-csp.mjs
 * (the build-time header generator), the preview-server plugin in
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
 * once prerendering lands) and passes them in.
 *
 * KNOWN GAP until prerendering (a separate lane) ships: that inline script
 * embeds a per-render timestamp (TanStack Router's route-match `u` field),
 * so the SAME route hashes differently on every request. The preview-server
 * plugin below computes it live per response, so it is always correct; the
 * production path (api/ssr.mjs) still serves the one value scripts/gen-csp.mjs
 * bakes into vercel.json at build time, which will not match a live request's
 * actual hash. Not fixed here: api/ssr.mjs deliberately avoids importing any
 * .ts source (see its own docstring) because it runs on Vercel's serverless
 * Node runtime, whose exact version — and therefore whether it natively
 * strips this file's type annotations — is not something this lane could
 * verify without risking a broken production SSR path over an unverified
 * assumption. Once routes are prerendered to static HTML (this lane's stated
 * dependency), each document's bytes stop changing per-request and a
 * build-time hash becomes authoritative — see gen-csp.mjs's own docstring.
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
  "script-src": ["'self'"], // hashes spliced in by buildCspHeader
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
 * The caller must include hashes for __root.tsx's two `scripts:` head
 * entries (Person + ProfilePage JSON-LD) — see scripts/gen-csp.mjs and
 * vite.config.ts's cspPreviewPlugin, which both compute them the same way.
 * TanStack Start never renders a `scripts:` head entry into the server-sent
 * HTML at all; the browser inserts both client-side on EVERY route,
 * including the ssr:false rooms whose own SSR body has nothing else in it
 * either — so a hash set built only from THIS document's raw response body
 * misses them on those routes. Not computed here: hashing needs node:crypto,
 * and this module is also imported (for CSP_DIRECTIVES) by
 * vercelHeaders.test.ts, which lives under tsconfig.app.json's project —
 * pulling a node:crypto type in there broke that project's DOM lib for
 * every OTHER file in it (confirmed: `tsc -b` failed on src/data/labs.ts's
 * unrelated `window` reference). Keeping this module hash-agnostic avoids
 * the cross-project type leak entirely.
 */
export function buildCspHeader(scriptHashes: readonly string[]): string {
  const directives = { ...CSP_DIRECTIVES, "script-src": [...CSP_DIRECTIVES["script-src"], ...[...new Set(scriptHashes)].map((h) => `'sha256-${h}'`)] };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
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
