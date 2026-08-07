// Build-time AVIF + WebP siblings for public/ rasters (190 PNG / 4 WebP, ~20MB).
// Idempotent: regenerates only when the source is newer. Runs in prebuild,
// same pattern as gen-galleries.mjs / gen-og.mjs. No runtime image CDN.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const fresher = (src, out) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;

let made = 0;
for (const src of walk(publicDir)) {
  const ext = extname(src).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue; // gifs: animated, skip
  // Excelsior magazine pages are already the delivered format (see
  // gen-excelsior.mjs). Deriving an .avif per page would be ~400 extra files
  // regenerated on every build for no gain — they have no raster source here.
  if (src.includes(`${sep}excelsior${sep}pages${sep}`)) continue;
  // Play Store icons (scripts/gen-store.mjs) are already 128px webp straight
  // from Google's CDN — about a kilobyte each. An .avif derivative of a 1 kB
  // icon is not smaller, and there are 87 of them to redo on every build.
  if (src.includes(`${sep}store${sep}`)) continue;
  const base = src.slice(0, -ext.length);
  // A .webp sitting next to a same-name .png/.jpg/.jpeg is OUR OWN derivative
  // (generated below from that raster), not a real source — skip it, or the
  // next run treats it as a fresh "source" and re-derives the .avif from the
  // lossy .webp instead of the original raster.
  if (ext === ".webp" && [".png", ".jpg", ".jpeg"].some((e) => existsSync(base + e))) continue;
  const avif = `${base}.avif`;
  if (!fresher(src, avif)) {
    await sharp(src).avif({ quality: 50 }).toFile(avif);
    made++;
  }
  if (ext !== ".webp") {
    const webp = `${base}.webp`;
    if (!fresher(src, webp)) {
      await sharp(src).webp({ quality: 72 }).toFile(webp);
      made++;
    }
  }
}
console.log(`[gen-images] wrote/updated ${made} derivative(s)`);
