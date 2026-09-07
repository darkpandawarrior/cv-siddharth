/**
 * Where the heavy static assets live: the Godot/Wasm builds, the CMP Wasm
 * demos, the Excelsior page scans, the project screenshot/showcase galleries
 * and the OG cards. Moved off Vercel (whose free tier caps deployment storage
 * at 10 GB and this site redeploys on every merge) onto GitHub Pages, which
 * already hosts static builds under darkpandawarrior.github.io.
 *
 * `VITE_HEAVY_ASSET_BASE=/` in .env.local points local dev back at the
 * top-level `heavy/` directory (see vite.config.ts's heavyAssetsDevPlugin)
 * instead of the network, e.g. before `npm run publish:heavy-assets` has run.
 *
 * Read from both Vite-bundled browser code AND the plain-`node` generator
 * scripts (gen-galleries.mjs and friends) — so this reads `process.env` first
 * (what a script run via `node` sees) and only then `import.meta.env` (what
 * Vite injects at build time); under plain Node, `import.meta.env` is simply
 * undefined, which the optional chain below tolerates.
 */
export const HEAVY_ASSET_BASE: string =
  (typeof process !== "undefined" ? process.env?.VITE_HEAVY_ASSET_BASE : undefined) ||
  import.meta.env?.VITE_HEAVY_ASSET_BASE ||
  "https://darkpandawarrior.github.io/cv";

/**
 * Joins a root-relative path (e.g. "/kursi-app/index.html") onto the base.
 *
 * `HEAVY_ASSET_BASE` is "/" for local dev (see this file's own doc comment),
 * and every caller passes a leading-slash `path` — naively concatenating the
 * two gives "//kursi-app/…", which a BROWSER parses as protocol-relative
 * (host "kursi-app", not a path on this origin) and fails to fetch. Node/curl
 * would have resolved it fine, which is why this went unnoticed until an
 * actual browser exercised `VITE_HEAVY_ASSET_BASE=/`. Collapsing the base's
 * trailing slash before the join keeps the production case (a bare host,
 * e.g. "https://…/cv") untouched.
 */
export function heavy(path: string): string {
  return `${HEAVY_ASSET_BASE.replace(/\/$/, "")}${path}`;
}

/**
 * The bundled WASM apps' real `heavy/` directory names, keyed by each
 * project's CURRENT slug. The directories themselves keep their original
 * names (`mileway-app`, `kursi-app`, `paymentslab-app`, `deadlock-app`) —
 * renaming them cascades into `vercel.json`'s per-app cache-control rules,
 * `publish-heavy-assets.mjs`'s sibling-repo sync and `docs/perf-budgets.md`'s
 * measurements, none of which this file owns — so the old slug is an internal
 * technical identifier here, same rationale as the published `applicationId`s
 * that also outlive the 2026-09-05 rename. Every caller of `heavy()` reads the
 * real path through this map instead of typing the old name inline.
 */
export const WASM_APP_PATH = {
  doori: "/mileway-app/index.html",
  gaddi: "/kursi-app/index.html",
  paymentsLabKmp: "/paymentslab-app/index.html",
  portfolio: "/portfolio-app/index.html",
  stutter: "/deadlock-app/index.html",
} as const;
