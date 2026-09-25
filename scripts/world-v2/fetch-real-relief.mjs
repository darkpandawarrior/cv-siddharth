// scripts/world-v2/fetch-real-relief.mjs
//
// A sibling of fetch-polyhaven.mjs's own idiom: idempotent, sharp only, run
// BY HAND, never at build time (online-tools-spec.md §A1, master-plan#M68).
//
//   node scripts/world-v2/fetch-real-relief.mjs
//
// Computes the z13 AWS Terrarium tile holding the committed Vetal Tekdi OSM
// node (18.52556 N, 73.81534 E, ele 703m — the terrain probe's real Overpass
// result), fetches it, decodes it (R*256 + G + B/256 - 32768), detrends it
// with a 3-pass box blur (radius 9px, ~170m — the large-scale valley shape,
// which the height function already carves from real data elsewhere) and
// normalises the residual (the micro-relief the height function has no
// other real source for) to zero mean, unit std. Writes:
//   scripts/world-v2/data/sangam-relief-256.png  — the normalised residual
//   scripts/world-v2/data/sangam-relief.json     — provenance + decode range
//
// The Sangam tile (13/5776/3666) is deliberately NOT used: its residual
// holds the real Mutha channel, and using it would trench real-data-owned
// banks with a texture the height function is not allowed to author
// (online-tools-spec §A1). The hill tile (13/5775/3666, Vetal Tekdi) holds
// 2.6x the relief energy and no river incision — the right source.
//
// HONESTY NOTE: see real-relief.mjs's own — this writes an 8-bit PNG (not
// 16-bit; sharp 0.35.4's raw ushort path does not round-trip in this
// environment) plus the JSON {encodeMin, encodeMax} the 8-bit levels are
// scaled across.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { DATA_DIR, RESIDUAL_PNG, RESIDUAL_JSON } from "./real-relief.mjs";

const ZOOM = 13;
const ANCHOR = { lat: 18.52556, lon: 73.81534, label: "Vetal Tekdi, OSM node, ele 703" };
const BLUR_RADIUS_PX = 9;
const BLUR_PASSES = 3;
// Headroom over the measured real residual (std 8.53m, range -48.3..+43.5m
// -> normalised range roughly -5.7..+5.1) so no real sample clips.
const ENCODE_HALF_RANGE = 6;

function lonLatToTile(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Separable box blur, clamped at the edge (not mirror-tiled — that's
 *  real-relief.mjs's sampling-time concern, not this detrending step's). */
function boxBlur(data, size, radius) {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const win = radius * 2 + 1;
  // horizontal
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(size - 1, Math.max(0, x + k));
        sum += data[y * size + xx];
      }
      tmp[y * size + x] = sum / win;
    }
  }
  // vertical
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(size - 1, Math.max(0, y + k));
        sum += tmp[yy * size + x];
      }
      out[y * size + x] = sum / win;
    }
  }
  return out;
}

async function main() {
  const tile = lonLatToTile(ANCHOR.lon, ANCHOR.lat, ZOOM);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tile.x}/${tile.y}.png`;
  console.log(`[fetch-real-relief] ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch-real-relief: ${url} -> HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 3) throw new Error(`fetch-real-relief: expected an RGB Terrarium tile, got ${info.channels} channels`);
  const size = info.width;
  if (info.height !== size) throw new Error(`fetch-real-relief: expected a square tile, got ${info.width}x${info.height}`);

  const elevation = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = data[i * info.channels + 0];
    const g = data[i * info.channels + 1];
    const b = data[i * info.channels + 2];
    elevation[i] = r * 256 + g + b / 256 - 32768;
  }

  let blurred = elevation;
  for (let p = 0; p < BLUR_PASSES; p++) blurred = boxBlur(blurred, size, BLUR_RADIUS_PX);

  const rawResidual = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) rawResidual[i] = elevation[i] - blurred[i];

  let mean = 0;
  for (const v of rawResidual) mean += v;
  mean /= rawResidual.length;
  let variance = 0;
  for (const v of rawResidual) variance += (v - mean) * (v - mean);
  const std = Math.sqrt(variance / rawResidual.length) || 1;

  const normalised = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) normalised[i] = (rawResidual[i] - mean) / std;

  const encodeMin = -ENCODE_HALF_RANGE;
  const encodeMax = ENCODE_HALF_RANGE;
  const pixels = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const t = (normalised[i] - encodeMin) / (encodeMax - encodeMin);
    pixels[i] = Math.round(Math.min(1, Math.max(0, t)) * 255);
  }

  let rawMin = Infinity;
  let rawMax = -Infinity;
  for (const v of rawResidual) {
    if (v < rawMin) rawMin = v;
    if (v > rawMax) rawMax = v;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const png = await sharp(Buffer.from(pixels), { raw: { width: size, height: size, channels: 1 } })
    .greyscale()
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(RESIDUAL_PNG, png);
  writeFileSync(
    RESIDUAL_JSON,
    JSON.stringify(
      {
        tile: `${ZOOM}/${tile.x}/${tile.y}`,
        url,
        fetchedAt: new Date().toISOString(),
        anchor: ANCHOR.label,
        blurRadiusPx: BLUR_RADIUS_PX,
        stdM: Number(std.toFixed(2)),
        rangeM: [Number(rawMin.toFixed(1)), Number(rawMax.toFixed(1))],
        encodeMin,
        encodeMax,
        licence: "SRTM/GMTED2010, USGS, public domain",
      },
      null,
      2,
    ),
  );

  console.log(
    `[fetch-real-relief] tile ${ZOOM}/${tile.x}/${tile.y}, std ${std.toFixed(2)}m, range ${rawMin.toFixed(1)}..${rawMax.toFixed(1)}m -> ${RESIDUAL_PNG}`,
  );
}

main().catch((err) => {
  console.error("[fetch-real-relief] failed:", err);
  process.exitCode = 1;
});
