# Generators that sit outside the build

Moved from the README. The generators in the prebuild and refresh chains are declared in
[scripts/generators.mjs](../scripts/generators.mjs). The ones below are not in any chain, on
purpose, and `check-generated.mjs` carries the same reasoning in its header.

More generator files exist outside every build/refresh/check chain,
deliberately: each needs something a build machine doesn't have, or reads
live data whose mean barely moves. Most still have an `npm run gen:<name>`
alias for running them by hand; the rest are invoked directly with `node`.
`check-generated.mjs`'s header carries the same reasoning; this is that
reasoning where a README reader can find it.

- `gen-excelsior.mjs`. Manual and occasional: renders the source magazine
  PDFs, which live on MANIT's CDN and are not in this repo, and needs
  `poppler` installed locally. Output is committed; the build never touches
  a PDF.
- `gen-excelsior-text.mjs`. OCRs the rendered pages into a static per-edition
  text manifest (`public/excelsior/text/<year>.json`) so the in-reader search
  has something to search. Needs `tesseract` installed locally; best-effort
  on scanned magazine columns, not a transcript.
- `gen-store-archive.mjs`. Queries the Internet Archive for delisted Play
  listings. A floor, not a count, since the Archive only has what it happened
  to crawl. `npm run gen:store` merges its output.
- `gen-store-flavours.mjs`. Refuses to run without `SHELF_RIDER_REPO` and
  `SHELF_DRIVER_REPO` pointing at two private checkouts, so it cannot run on
  a CI box at all.
- `gen-maps-places.mjs`. Refuses to run without `MAPS_TAKEOUT_DIR` pointing
  at a private Google Maps Takeout export; `MAPS_PHOTOS_DIR` is optional and
  falls back to the committed thumbnails when absent. Writes city-level
  aggregates only, never a business name, address, review text, place URL
  or original photo filename.
- `gen-store-siblings.mjs`. Walks each shelf client's Play developer page
  live, looking for a merchant-side sibling app the rider/driver data misses.
  Writes a gitignored cache; `npm run gen:store` merges it.
- `gen-csp.mjs`. Reads the already-built `dist/server/server.js` to hash every
  route's inline hydration scripts, so it structurally cannot run before
  `npm run build` and stays out of prebuild: `npm run build && node
  scripts/gen-csp.mjs`.
- `gen-pune-normals.mjs` (`npm run gen:pune-normals`). Manual annual refresh
  of the 2015-2025 mean rainfall per calendar day from Open-Meteo's ERA5
  archive; the mean barely moves year to year, so it stays out of every
  build/refresh/check chain.
- `gen-starfield.mjs` (`npm run gen:starfield`). Manual and occasional:
  fetches the 34 MB HYG v41 star catalogue and filters it to
  `public/sky/stars-hyg41-m5.bin`. Run by hand when the catalogue needs a
  refresh.
- `gen-globe-earth.mjs` (`npm run gen:globe-earth`). Manual and occasional:
  bakes NASA's public-domain Black Marble night-radiance composite into a
  360x180 land mask, `public/sky/earth-720x360.bin`. The build must never
  block on NASA's server, so it stays out of every build/refresh/check chain.
- `gen-globe-geo.mjs` (`npm run gen:globe-geo`). Manual and occasional: bakes
  country centroids from Natural Earth's admin-0 GeoJSON mirror into
  `src/world/globe/centroids.ts`. Same posture as `gen-globe-earth.mjs`
  above.
- `gen-terrain.mjs` (`npm run gen:terrain`, `scripts/world-v2/`). Manual:
  bakes World v2's Sangam terrain heightmaps and flow map from committed
  layout data plus `real-relief.mjs`'s real micro-relief. Never touches the
  network; kept manual because it is heavy, not because it is live.
- `gen-world-models.mjs` (`npm run gen:world-models`). Manual, needs a local
  Blender 5.2 LTS binary: runs every World v2 Blender landmark kit in
  `scripts/blender/world-v2/` headless, one at a time through
  `render-watchdog.sh`. Each kit meshopt-packs its own GLB(s) through the
  pinned `npx -y gltfpack@1.2.0 -cc -kn` (never added to `package.json`, M68).
- `eval-ai-golden.mjs` (no `npm run` alias, runs only from
  `ai-golden-eval.yml`, dispatch + weekly). Calls a live model against 5 JD
  fixtures; inherently non-deterministic (model sampling, provider drift), so
  it is never a required PR gate. Writes `not-run` with no provider key
  configured; a band miss is recorded on `/ops`, never a failing exit code.

`gen-world-grammar.mjs` (`gen:world-grammar`) runs in the refresh stage now,
after `gen:stats`, `gen:chess`, `gen:store`, `gen:loopdown`, `gen:weeb`,
`gen:timeline` and `gen:history` (living-ledger-spec.md §3.4 D5): it derives
`growthCounts.json` and `placements.json` from GRAMMAR plus the committed
Ledger, which reads all seven through `src/data/*.ts`.

`gen-loopdown-art.mjs` (`gen:loopdown-art`) runs in the refresh stage now: it
pulls the Loopdown's 13 cast portraits and 8 series covers (3.39 MB) from
the-loopdown's own `lore/assets/manifest.json` over `raw.githubusercontent.com`,
never the local checkout. A failed fetch exits 0 and keeps whatever
`heavy/loopdown/` and `loopdownArt.ts` already committed.


