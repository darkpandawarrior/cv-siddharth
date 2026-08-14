// Turns the route captures in docs/screenshots/ into served tile posters under
// public/surfaces/.
//
// scripts/capture-site.mjs has been screenshotting every route for a while —
// deriving the route list from src/routes/*.tsx, so it never misses one — and
// writing the PNGs into docs/, which Vite does not serve. Nineteen captures
// nobody could see. This is the missing half: downscale each one a surface asks
// for into a webp the homepage wall can actually render.
//
// Committed output, same posture as gen-og.mjs: the Vercel build needs no
// browser and no image toolchain. Re-run after `npm run capture:site`.
//
// EACH POSTER IS CROPPED TO ITS OWN DEVICE. Every capture used to be squeezed
// into one hardcoded 16:9, then rendered `object-cover` inside whatever frame
// the surface declared — so a phone tile showed a 16:9 desktop capture with the
// sides cut off ("th Pandalai — ndroid Enginee" on /hire). The aspect now comes
// from DEVICE in the registry, the same map SurfaceWall draws the frame from
// and capture-site.mjs sizes the browser window with, so the three cannot drift.

import { readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { surfaces, DEVICE } from "../src/data/surfaces.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "docs", "screenshots");
const outDir = join(root, "public", "surfaces");

// Tiles render at most ~420px wide on the wall; 840 covers 2x displays with
// room to spare and keeps each file well under 60 kB.
const WIDTH = 840;

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const available = new Set(readdirSync(srcDir).filter((f) => f.endsWith(".png")));
const wanted = surfaces.filter((s) => s.poster);

const missing = [];
let written = 0;

for (const surface of wanted) {
  // Prefer the device-viewport capture; fall back to the 1440x900 one the
  // sentinel keeps, so a surface added before the next capture run still gets a
  // poster rather than failing the build.
  const sized = `surface_${surface.poster}.png`;
  const file = available.has(sized) ? sized : `site_${surface.poster}.png`;
  if (!available.has(file)) {
    missing.push(`${surface.to} → docs/screenshots/${sized}`);
    continue;
  }
  const out = join(outDir, `${surface.poster}.webp`);
  await sharp(join(srcDir, file))
    // Take the top of the page — that is where each route's identity lives —
    // at the frame's own aspect ratio, rather than squashing the whole scroll
    // into a thumbnail.
    .resize({
      width: WIDTH,
      height: Math.round(WIDTH / DEVICE[surface.device].aspect),
      fit: "cover",
      position: "top",
    })
    .webp({ quality: 82 })
    .toFile(out);
  written++;
}

console.log(`[surfaces] wrote ${written} poster(s) to public/surfaces/`);

if (missing.length) {
  // Loud, and fatal: a surface promising a poster it has no capture for is the
  // exact half-finished state this whole registry exists to make impossible.
  console.error(`[surfaces] no capture for ${missing.length} surface(s):`);
  for (const m of missing) console.error(`  ${m}`);
  console.error(`[surfaces] run \`npm run capture:site\` against a running dev server first.`);
  process.exit(1);
}
