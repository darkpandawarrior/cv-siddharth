// scripts/world-v2/real-relief.mjs
//
// Real micro-relief sampler for World v2 terrain — online-tools-spec.md §A1,
// world-v2-spec.md §3 step 7 (amended), master-plan.md#M68. Reads the
// committed residual (`scripts/world-v2/data/sangam-relief-256.png` +
// `sangam-relief.json`, written by hand by `fetch-real-relief.mjs`) and
// exposes a bilinear, mirror-tiled sampler over it: `realRelief(x, z)`.
//
// Lives here, not in `valley-math.mjs` (deleted by this lane) and not in
// `valley.ts` (runtime code that must not decode PNGs — M68). Only
// `gen-terrain.mjs` (a build-time Node script) ever calls this.
//
// NO SILENT FALLBACK: a missing or unreadable residual throws, both at
// `loadRelief()` (the PNG/JSON read) and at `realRelief()` if called before
// `loadRelief()` has run. A fallback to fbm would let the build go green
// while the relief quietly stops being real (online-tools-spec §A1).
//
// HONESTY NOTE (same discipline as gen-terrain.mjs's own note and
// fetch-real-relief.mjs's): the spec asks for a 16-bit residual PNG.
// sharp 0.35.4's raw `depth: 'ushort'` path does not round-trip correctly in
// this environment (verified: encoding a Uint16Array through
// `raw:{depth:'ushort'}` and reading it back reports 3 channels / 8-bit
// instead of 1 channel / 16-bit). So this residual, like the existing
// heightmap, takes the sanctioned fallback: an 8-bit PNG plus a JSON
// {encodeMin, encodeMax} from which the real (zero-mean, unit-std) value is
// `encodeMin + (pixel/255)*(encodeMax-encodeMin)`. 256 levels over the
// residual's realistic +-6 std range is ~0.047 std/level — more than enough
// precision for an 8m-amplitude relief term.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = join(root, "scripts", "world-v2", "data");
export const RESIDUAL_PNG = join(DATA_DIR, "sangam-relief-256.png");
export const RESIDUAL_JSON = join(DATA_DIR, "sangam-relief.json");

/** World metres per residual texel. The residual is 256x256 and this lane's
 *  extent is 768x768 (world-v2-spec §3), so 3 m/texel maps the whole
 *  residual across the whole world exactly once (256*3=768) — a deliberate
 *  choice, not a coincidence. The real texel is ~18m (online-tools-spec
 *  §A1); there is no single true scale once 28.5km of real river compresses
 *  into ~420 world metres, so this is a named, fixed constant, tuned once by
 *  eye on the spawn frame then frozen. A later change is a `v` bump. */
export const RELIEF_M_PER_TEXEL = 3;

/** @type {{ data: Float32Array, size: number, min: number, max: number } | null} */
let residual = null;

/** Loads and decodes the committed residual once (memoised). Must run
 *  before `realRelief()`. Throws if the PNG or JSON is missing or
 *  unreadable — the whole point of this module (online-tools-spec §A1: "no
 *  silent fallback"). */
export async function loadRelief() {
  if (residual) return residual;
  if (!existsSync(RESIDUAL_PNG) || !existsSync(RESIDUAL_JSON)) {
    throw new Error(
      `real-relief.mjs: missing committed residual (${RESIDUAL_PNG} / ${RESIDUAL_JSON}) — run ` +
        `\`node scripts/world-v2/fetch-real-relief.mjs\` by hand. No silent fallback to fbm.`,
    );
  }
  const meta = JSON.parse(readFileSync(RESIDUAL_JSON, "utf8"));
  const { data, info } = await sharp(RESIDUAL_PNG).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || info.width !== info.height) {
    throw new Error(`real-relief.mjs: expected a square single-channel PNG, got ${info.width}x${info.height}x${info.channels}`);
  }
  const size = info.width;
  const out = new Float32Array(size * size);
  const { encodeMin, encodeMax } = meta;
  for (let i = 0; i < out.length; i++) {
    out[i] = encodeMin + (data[i] / 255) * (encodeMax - encodeMin);
  }
  residual = { data: out, size, min: encodeMin, max: encodeMax };
  return residual;
}

function mirrorIndex(i, size) {
  // Mirror-tile: reflect at each boundary instead of wrapping, so the
  // residual repeats with no seam (a plain wrap would show a hard edge
  // every 768m; a mirror shows none, at the cost of no rotational variety —
  // acceptable for a texture-scale detail term).
  const period = 2 * (size - 1);
  let m = ((i % period) + period) % period;
  if (m >= size) m = period - m;
  return m;
}

/** Bilinear, mirror-tiled sample of the normalised (zero-mean, unit-std)
 *  residual at world (x, z), in `RELIEF_M_PER_TEXEL` world metres per
 *  texel. Throws if `loadRelief()` has not run. */
export function realRelief(x, z) {
  if (!residual) {
    throw new Error("real-relief.mjs: realRelief() called before loadRelief() — no silent fallback to fbm");
  }
  const { data, size } = residual;
  const tx = x / RELIEF_M_PER_TEXEL + size / 2;
  const tz = z / RELIEF_M_PER_TEXEL + size / 2;
  const x0 = Math.floor(tx);
  const z0 = Math.floor(tz);
  const fx = tx - x0;
  const fz = tz - z0;
  const ix0 = mirrorIndex(x0, size);
  const ix1 = mirrorIndex(x0 + 1, size);
  const iz0 = mirrorIndex(z0, size);
  const iz1 = mirrorIndex(z0 + 1, size);
  const v00 = data[iz0 * size + ix0];
  const v10 = data[iz0 * size + ix1];
  const v01 = data[iz1 * size + ix0];
  const v11 = data[iz1 * size + ix1];
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fz;
}
