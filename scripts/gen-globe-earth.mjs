#!/usr/bin/env node
// Manual generator, never run by the build (G13). `node scripts/gen-globe-earth.mjs`.
//
// Bakes heavy/globe/earth-720x360.bin: a 360x180 (1 deg/cell) land mask plus
// a 4-bit NASA Black Marble night-radiance value per cell, box-sampled from
// NASA's own public-domain "Earth at Night 2016" 0.1-degree composite --
// eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg,
// an exact 3600x1800 plate-carree image (10x10 source px per output cell,
// no resampling library needed). 8-byte header ("GLOB" + width + height LE)
// + 64,800 data bytes = 64,808 bytes total, matching living-ledger-spec.md#6.3's
// "about 65 KB".
//
// LAND_SUM_THRESHOLD: the composite's ocean cells are a flat (5, 5, 15) --
// NASA's own "no data" fill colour, RGB sum 25 -- verified against the fetched
// image by sampling a spread of open-ocean and on-land points (mid Pacific,
// mid Atlantic, Indian Ocean vs Sahara, Amazon, Australia interior, Greenland
// and Antarctic ice, 2026-09-25); every land pixel sampled, lit or unlit,
// summed 30 or more. The threshold sits one step above the ocean cluster so
// JPEG ringing near the exact ocean value never flips a cell.
//
// On fetch failure the committed file is left untouched and this exits 0
// (G13) -- the build must never block on NASA's server. `--check` runs the
// pure transform against an inline synthetic fixture (no committed fixture
// file, no network) and proves determinism (gen-globe-earth.test.mjs runs
// the same transform directly).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SRC_URL = "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg";
const OUT_PATH = fileURLToPath(new URL("../heavy/globe/earth-720x360.bin", import.meta.url));
const OUT_WIDTH = 360;
const OUT_HEIGHT = 180;
export const LAND_SUM_THRESHOLD = 30;

/**
 * Pure: a decoded raw RGB buffer (row-major, 3 bytes/px, `srcWidth` x
 * `srcHeight`) in, the packed mask+radiance Buffer out. Box-averages each
 * output cell from its source pixels, classifies land by channel-sum
 * threshold, and quantizes the brightest channel into a 4-bit radiance.
 * Deterministic: plain arithmetic over the input, no Date.now, no RNG --
 * the same buffer always produces the same bytes.
 */
export function buildEarthMask(rgb, srcWidth, srcHeight, outWidth = OUT_WIDTH, outHeight = OUT_HEIGHT) {
  const header = Buffer.alloc(8);
  header.write("GLOB", 0, "ascii");
  header.writeUInt16LE(outWidth, 4);
  header.writeUInt16LE(outHeight, 6);
  const data = Buffer.alloc(outWidth * outHeight);
  for (let oy = 0; oy < outHeight; oy++) {
    const sy0 = Math.floor((oy / outHeight) * srcHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((oy + 1) / outHeight) * srcHeight));
    for (let ox = 0; ox < outWidth; ox++) {
      const sx0 = Math.floor((ox / outWidth) * srcWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((ox + 1) / outWidth) * srcWidth));
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * srcWidth + sx) * 3;
          rSum += rgb[o];
          gSum += rgb[o + 1];
          bSum += rgb[o + 2];
          n++;
        }
      }
      const r = rSum / n;
      const g = gSum / n;
      const b = bSum / n;
      const isLand = r + g + b >= LAND_SUM_THRESHOLD;
      // Radiance means night lights over land; ocean never carries one, even
      // though the flat fill colour's own brightness would otherwise round
      // to a nonzero nibble.
      const radiance = isLand ? Math.max(0, Math.min(15, Math.round((Math.max(r, g, b) / 255) * 15))) : 0;
      data[oy * outWidth + ox] = (isLand ? 0x80 : 0) | radiance;
    }
  }
  return Buffer.concat([header, data]);
}

// Inline 40x20 synthetic fixture for `--check` -- no committed fixture file.
// A quarter each of flat ocean, dim unlit land, and a saturated "city" patch
// in the fourth quadrant, at the exact colour signatures measured from the
// real composite (see the threshold note above). 40x20 downsamples cleanly
// to a 4x2 mask at the same 10x factor the real 3600x1800 source uses.
export function buildCheckFixture() {
  const width = 40;
  const height = 20;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      const leftHalf = x < width / 2;
      const topHalf = y < height / 2;
      let r;
      let g;
      let b;
      if (leftHalf && topHalf) {
        [r, g, b] = [5, 5, 15]; // ocean
      } else if (!leftHalf && topHalf) {
        [r, g, b] = [40, 45, 80]; // unlit land (ice-sheet-like signature)
      } else if (leftHalf && !topHalf) {
        [r, g, b] = [5, 5, 15]; // ocean again, bottom-left
      } else {
        [r, g, b] = [220, 205, 185]; // a lit city, bottom-right
      }
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }
  return { rgb, width, height };
}

async function fetchSourceJpeg() {
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`Black Marble fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function decodeRaw(jpegBuf) {
  const { data, info } = await sharp(jpegBuf).raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const inputIdx = args.indexOf("--input");
  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : null;

  if (check) {
    const { rgb, width, height } = buildCheckFixture();
    const a = buildEarthMask(rgb, width, height, 4, 2);
    const b = buildEarthMask(rgb, width, height, 4, 2);
    if (!a.equals(b)) {
      console.error("gen-globe-earth --check: non-deterministic output for the same input");
      process.exit(1);
    }
    console.log(`gen-globe-earth --check: OK (${a.length} bytes from the inline fixture, byte-identical)`);
    return;
  }

  let jpegBuf;
  try {
    jpegBuf = inputPath ? readFileSync(inputPath) : await fetchSourceJpeg();
  } catch (err) {
    console.error(
      `gen-globe-earth: source unavailable (${err.message}), kept committed heavy/globe/earth-720x360.bin`,
    );
    return;
  }
  const { rgb, width, height } = await decodeRaw(jpegBuf);
  const buf = buildEarthMask(rgb, width, height);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, buf);
  console.log(`gen-globe-earth: wrote ${buf.length} bytes (${OUT_WIDTH}x${OUT_HEIGHT} cells)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
