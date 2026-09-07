import { RedFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping, DataTexture } from "three";
import { CITY } from "./city.ts";
import type { LitMapStamp, LitMapSyncState } from "./litMapSyncChannel.ts";

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
 * SHARED-STATE SEAM: this array IS meant to be the playhtml shared record,
 * per §7. `litMapSync.ts`'s `useLitMapRemoteSync` is the wiring — split into
 * its own file, not this one, because it imports `@playhtml/react`, which
 * reads `document` at module load; vitest runs this project under
 * `environment: "node"` (pulse.ts/pulseEvents.ts draw the identical line,
 * for the identical reason — see pulse.test.ts's own comment), and this
 * file's own tests need to keep importing it directly. It does NOT sync the
 * whole 49,152-byte array (a naive "sync the whole array" approach would
 * mean broadcasting a ~49KB draft ten times a second per active driver to
 * every open tab — not what `usePageData` is for). Instead every driving tab
 * publishes SPARSE stamp events — one `{x, z, t}`, a few bytes, keyed by
 * React's own `useId()` and throttled to `litMapSync.ts`'s own publish
 * interval — and every OTHER tab applies each peer's stamp into its own
 * `litData` through this same `stampLitMap` (via `pickNewRemoteStamps`
 * below), so the accumulation rule lives in exactly one place whether the
 * source is local or remote. One key per distinct tab (visitors.ts's own
 * "every writer touches only its own key" discipline, for the identical
 * lost-update reason) rather than an ever-growing event log — a late joiner
 * sees everyone's last stamped position once on arrival, which is a real
 * (if partial) view of "everywhere everyone has been", not the full history.
 */

/** The default (desktop-tier) resolution — every function below takes `w`/
 *  `h` so a caller on a lighter tier (deviceTier.ts's own `tierBudget(...)
 *  .litMapSize` — §10 drop 2's halved 64x192) can size the whole map down,
 *  but they default to these so an unwindowed call site (and every existing
 *  test) keeps behaving exactly as it did before tiers touched this file. */
export const LIT_MAP_W = 128;
export const LIT_MAP_H = 384;

/** How much a single stamp adds, clamped at full (`v = min(1, v + 0.35)`). */
const STAMP_STRENGTH = 0.35;

/** World (x, z) -> integer texel coordinates, clamped to the map. */
export function litMapTexel(x: number, z: number, w: number = LIT_MAP_W, h: number = LIT_MAP_H): { tx: number; tz: number } {
  const u = (x + CITY.halfWidth) / (CITY.halfWidth * 2);
  const v = (z - CITY.z0) / (CITY.z1 - CITY.z0);
  const tx = Math.min(w - 1, Math.max(0, Math.round(u * (w - 1))));
  const tz = Math.min(h - 1, Math.max(0, Math.round(v * (h - 1))));
  return { tx, tz };
}

/**
 * Stamp a 3-texel-wide brush (the car's track width, across the lane) at a
 * world position, accumulating rather than overwriting. Mutates `data` in
 * place — the caller owns upload throttling (`texture.needsUpdate`).
 */
export function stampLitMap(data: Uint8Array, x: number, z: number, w: number = LIT_MAP_W, h: number = LIT_MAP_H): void {
  const { tx, tz } = litMapTexel(x, z, w, h);
  const add = Math.round(STAMP_STRENGTH * 255);
  for (let dx = -1; dx <= 1; dx++) {
    const t = tx + dx;
    if (t < 0 || t >= w) continue;
    const idx = tz * w + t;
    data[idx] = Math.min(255, data[idx] + add);
  }
}

/** A fresh, all-unlit R8 DataTexture sized to the map, ready to accumulate. */
export function createLitMapTexture(w: number = LIT_MAP_W, h: number = LIT_MAP_H): DataTexture {
  const data = new Uint8Array(w * h);
  const tex = new DataTexture(data, w, h, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Picks the stamps in `remote` this call hasn't already applied — a plain
 *  function of the shared doc plus what was applied last time, split out so
 *  the "which peers are new since last look" rule is unit-testable without
 *  mounting `usePageData`. `applied` is mutated in place (the caller's own
 *  ref) to record what this call just consumed. */
export function pickNewRemoteStamps(remote: LitMapSyncState, myKey: string, applied: Map<string, number>): LitMapStamp[] {
  const fresh: LitMapStamp[] = [];
  for (const [key, stamp] of Object.entries(remote)) {
    if (key === myKey) continue; // this tab's own stamp is already applied locally, in real time
    if (applied.get(key) === stamp.t) continue;
    applied.set(key, stamp.t);
    fresh.push(stamp);
  }
  return fresh;
}
