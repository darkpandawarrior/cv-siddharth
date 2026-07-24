// Vendors maplibre-gl's worker bundle + its sibling chunk into public/, so
// Vite serves them as plain static files with their relative import intact
// ("./maplibre-gl-shared.mjs"). Vite's asset pipeline (both the dev
// pre-bundler and `?url`/`?worker` imports) hashes/renames files individually
// and breaks that relative import — the worker silently fails to load and
// the Signal Lab map never renders a tile. Runs as a predev/prebuild step so
// it stays in sync with whatever maplibre-gl version is installed.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "maplibre-gl", "dist");
const dest = join(root, "public", "vendor", "maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(dest, { recursive: true });
for (const f of files) {
  const from = join(src, f);
  if (!existsSync(from)) {
    console.warn(`[copy-maplibre-worker] missing ${from} — is maplibre-gl installed?`);
    continue;
  }
  copyFileSync(from, join(dest, f));
}
