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

/** Joins a root-relative path (e.g. "/kursi-app/index.html") onto the base. */
export function heavy(path: string): string {
  return `${HEAVY_ASSET_BASE}${path}`;
}
