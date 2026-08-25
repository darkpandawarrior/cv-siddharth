import { RedFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping, DataTexture } from "three";
import { CITY } from "./city.ts";

/**
 * §7 LAYER C — THE RECORD.
 *
 * One R8 `DataTexture` covering the whole 56x168m slab: `LIT_MAP_W` x
 * `LIT_MAP_H` = 128 x 384, which the art-direction doc calls out as
 * 0.4375 m/texel — and 56/128 and 168/384 both equal 0.4375, so the same
 * texel size holds across both axes without the map having to be
 * non-uniform. It accumulates (never resets), is read by Terrain's fragment
 * shader as both a dim emissive groove and a roughness drop (worn track
 * glinting under the key light), and is uploaded to the GPU at 10Hz rather
 * than on every stamp — one `texture.needsUpdate = true` per ~100ms, not per
 * frame.
 *
 * SHARED-STATE SEAM (not wired): this array is meant to be the playhtml
 * shared record, per §7 — "this array IS the playhtml shared state". It
 * is NOT wired to playhtml here. `usePageData` (src/play/pulse.ts's
 * pattern) syncs a small JSON draft per channel; this array is 49,152 bytes,
 * and stamping it locally at up to 10Hz means a naive "sync the whole array"
 * approach would mean broadcasting a ~49KB draft ten times a second per
 * active driver to every open tab — not what usePageData is for, and not
 * "straightforward" in the sense the task asked me to check for.
 *
 * The honest shared version broadcasts SPARSE stamp events instead
 * (`{x, z}`, a few bytes each, deduped/throttled the way `usePulse`'s
 * DEDUPE_MS is) over a small `usePageData` channel or a playhtml
 * awareness/cursor channel, and every client — including the one that made
 * the stamp — applies incoming events through this same `stampLitMap`, so
 * the accumulation rule lives in exactly one place whether the source is
 * local or remote. That needs its own dedupe/compaction design (an
 * ever-growing stamp log is not a texture) and is left for that follow-up
 * task. What ships here is a clean local-only record: it accumulates and
 * renders correctly for the driver making it, it just doesn't yet hear
 * about anyone else's.
 */

export const LIT_MAP_W = 128;
export const LIT_MAP_H = 384;

/** How much a single stamp adds, clamped at full (`v = min(1, v + 0.35)`). */
const STAMP_STRENGTH = 0.35;

/** World (x, z) -> integer texel coordinates, clamped to the map. */
export function litMapTexel(x: number, z: number): { tx: number; tz: number } {
  const u = (x + CITY.halfWidth) / (CITY.halfWidth * 2);
  const v = (z - CITY.z0) / (CITY.z1 - CITY.z0);
  const tx = Math.min(LIT_MAP_W - 1, Math.max(0, Math.round(u * (LIT_MAP_W - 1))));
  const tz = Math.min(LIT_MAP_H - 1, Math.max(0, Math.round(v * (LIT_MAP_H - 1))));
  return { tx, tz };
}

/**
 * Stamp a 3-texel-wide brush (the car's track width, across the lane) at a
 * world position, accumulating rather than overwriting. Mutates `data` in
 * place — the caller owns upload throttling (`texture.needsUpdate`).
 */
export function stampLitMap(data: Uint8Array, x: number, z: number): void {
  const { tx, tz } = litMapTexel(x, z);
  const add = Math.round(STAMP_STRENGTH * 255);
  for (let dx = -1; dx <= 1; dx++) {
    const t = tx + dx;
    if (t < 0 || t >= LIT_MAP_W) continue;
    const idx = tz * LIT_MAP_W + t;
    data[idx] = Math.min(255, data[idx] + add);
  }
}

/** A fresh, all-unlit R8 DataTexture sized to the map, ready to accumulate. */
export function createLitMapTexture(): DataTexture {
  const data = new Uint8Array(LIT_MAP_W * LIT_MAP_H);
  const tex = new DataTexture(data, LIT_MAP_W, LIT_MAP_H, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
