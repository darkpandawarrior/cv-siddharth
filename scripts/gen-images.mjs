// Build-time AVIF + WebP siblings for public/ rasters (190 PNG / 4 WebP, ~20MB).
// Idempotent: regenerates only when the source is newer. Runs in prebuild,
// same pattern as gen-galleries.mjs / gen-og.mjs. No runtime image CDN.
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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

// ffmpeg is optional here, not required. Unlike the .avif/.webp derivatives
// (gitignored, regenerated every build) the .mp4 clips are COMMITTED, so a
// build machine without ffmpeg just reuses what is already on disk. Same
// graceful-skip contract sync-project-media.mjs uses.
const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

let made = 0;
for (const src of walk(publicDir)) {
  const ext = extname(src).toLowerCase();
  /**
   * An animated GIF is the worst delivery format the web still accepts: no
   * inter-frame compression, no hardware decode, and it starts transferring
   * the moment it is in the DOM whatever loading="lazy" says. Measured here:
   * 31 gifs = 18.5 MB, and ten of them were 89% of /project/doori's 9.5 MB.
   * The same frames as h264 are 2.1 MB.
   *
   * So a gif gets two siblings and Picture.tsx renders those instead of it:
   *   <base>.mp4   the clip, same ffmpeg recipe as rebuild-showcase.mjs
   *   <base>.avif  frame 0 as the poster, so preload="none" still shows something
   *
   * The .gif stays on disk: profile.ts, galleries.ts and blueprintData.ts all
   * still name it, and it is the source these regenerate from.
   */
  if (ext === ".gif") {
    // Only what the site renders through Picture. public/assets/readme is
    // GitHub's copy, and GitHub will not play a <video> in a README.
    if (!src.includes(`${sep}projects${sep}`)) continue;
    const base = src.slice(0, -ext.length);
    const mp4 = `${base}.mp4`;
    if (!fresher(src, mp4) && hasFfmpeg) {
      // yuv420p + even dimensions is what makes it decodable everywhere; crf 30
      // is rebuild-showcase.mjs's setting, measured at ~11% of the gif's bytes.
      const res = spawnSync("ffmpeg", [
        "-nostdin", "-y", "-loglevel", "error",
        "-i", src,
        "-movflags", "+faststart",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264", "-crf", "30", "-an",
        mp4,
      ]);
      if (res.status !== 0) console.warn(`[gen-images] ffmpeg failed on ${src}`);
      else made++;
    }
    const poster = `${base}.avif`;
    if (!fresher(src, poster)) {
      // sharp reads frame 0 of a gif without the `animated` flag: that is the poster.
      await sharp(src).avif({ quality: 50 }).toFile(poster);
      made++;
    }
    continue;
  }
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
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
