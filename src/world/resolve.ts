import * as THREE from "three";
import { CITY } from "./city.ts";
import { worldPalette } from "./palette.ts";

/**
 * THE RESOLUTION FIELD'S STATE MACHINE — one 8m cell grid over the whole
 * slab, a ratchet of when each cell was first driven through, and the single
 * `onBeforeCompile` hook every dust/rise material in the city goes through to
 * turn that ratchet into motion.
 *
 * The core idea, stated once so it doesn't have to be re-derived from the
 * code: nothing in this world is "loaded". It starts as a scattered cloud —
 * every small structure and every dust shard sitting at a randomised
 * `aScatter` position with `aTriggerTime = -1` (never resolved) — and a cell
 * only stops being scattered once the FUSED GPS estimate (never the raw fix,
 * never ground truth — see Trail.tsx's `fusedFix`) passes near it. Driving is
 * what draws the map. This module owns the bookkeeping for that ("which
 * cells are resolved, and since when") and the shader plumbing that reads it
 * ("how does a resolved instance look different from an unresolved one") —
 * nothing else. It has no idea what a district IS; `resolveAttributes` takes
 * whatever target positions a district hands it and treats them identically
 * whether they came from an employer block or a chess pillar.
 *
 * Two callers depend on this file:
 *   - ResolveField.tsx (WS2, same author) — the two dust families.
 *   - Every district's own instanced geometry (WS3 Monuments.tsx, WS4
 *     Corpus.tsx) — the "rise" mode, so a project tower or a repertoire
 *     pillar scales in on the exact same trigger a dust mote resolves on.
 * Both go through `applyResolveShader` and nothing else — that is the
 * contract the design doc calls out explicitly, and it's why this file
 * doesn't export raw GLSL strings for someone else to splice in by hand.
 */

/** Metres per resolution cell. 8m keeps the grid at 7 columns x 21 rows = 147
 *  cells over the 56m x 168m slab — small enough that "the road ahead lights
 *  up" reads instantly, large enough that 147 bits fits a bookmarkable
 *  localStorage value. */
export const RESOLVE_CELL = 8;

/** Seconds for a freshly-stamped cell's instances to finish resolving. */
export const RESOLVE_DURATION = 1.1;

const COLS = Math.round((CITY.halfWidth * 2) / RESOLVE_CELL);
const ROWS = Math.round((CITY.z1 - CITY.z0) / RESOLVE_CELL);
const TOTAL_CELLS = COLS * ROWS;

/** -1 = never resolved. Any other value = the `state.clock.elapsedTime` at
 *  which the cell first resolved — the ratchet. Written once per cell, for
 *  the life of the tab; never cleared, which is the whole point (a district
 *  you've already seen must never re-scatter because you drove away from
 *  it). */
const triggerTimes = new Float32Array(TOTAL_CELLS).fill(-1);

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function colOf(x: number): number {
  return clampInt(Math.floor((x + CITY.halfWidth) / RESOLVE_CELL), 0, COLS - 1);
}

function rowOf(z: number): number {
  return clampInt(Math.floor((z - CITY.z0) / RESOLVE_CELL), 0, ROWS - 1);
}

/** Which of the 147 cells a world-space point falls in. Clamped rather than
 *  thrown on out-of-bounds input — a facet thread's apex or a structure dust
 *  target a metre past the kerb should land in the nearest real cell, not
 *  crash the generator. */
export function cellKey(x: number, z: number): number {
  return rowOf(z) * COLS + colOf(x);
}

/**
 * The one time-source every resolve shader reads, mutated in place by
 * `stamp()` — never reassigned, so every material's compiled shader keeps
 * the SAME uniform object across the whole session and a single JS write
 * here is a single write everywhere. This is what "per-frame CPU = one
 * uniform write" means in the design doc's budget table.
 */
const sharedTime = { value: 0 };

/**
 * Called once per rendered frame (by ResolveField.tsx, the only place that
 * owns "now") with the FUSED estimate's position and heading.
 *
 * Stamps the 3x3 cell block centred on the fix, plus the one and two-cells-
 * ahead cells along `heading` — resolution has to lead the craft into a
 * district, not trail behind it, or a visitor never sees anything actually
 * assemble. That block is at most 11 cells (9 + 2); almost every call finds
 * all of them already resolved and returns an empty array, which is the
 * whole reason this can run every frame for free.
 *
 * Returns only the cells that were NEWLY resolved this call — the ratchet
 * again: a cell already in `triggerTimes` is never touched twice, so calling
 * this from a stationary craft, or from a raw fix that overlaps a resolved
 * cell, costs a handful of comparisons and writes nothing.
 */
export function stamp(x: number, z: number, heading: number, t: number): number[] {
  sharedTime.value = t;

  const centerCol = colOf(x);
  const centerRow = rowOf(z);
  const candidates = new Set<number>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const col = clampInt(centerCol + dc, 0, COLS - 1);
      const row = clampInt(centerRow + dr, 0, ROWS - 1);
      candidates.add(row * COLS + col);
    }
  }
  // Craft.tsx's own convention: heading 0 faces +Z, CCW positive, so the
  // forward unit vector is (sin, cos) in (x, z) — see its comment on
  // `telemetry.heading` for the derivation.
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  for (const ahead of [1, 2]) {
    candidates.add(cellKey(x + fx * ahead * RESOLVE_CELL, z + fz * ahead * RESOLVE_CELL));
  }

  const newlyResolved: number[] = [];
  for (const cell of candidates) {
    if (triggerTimes[cell] < 0) {
      triggerTimes[cell] = t;
      newlyResolved.push(cell);
    }
  }
  return newlyResolved;
}

/** -1 when the cell has never been driven through. */
export function triggerTimeOf(cell: number): number {
  if (cell < 0 || cell >= TOTAL_CELLS) return -1;
  return triggerTimes[cell];
}

/** Share of the 147-cell grid resolved so far — the HUD's `FIX %` readout. */
export function resolvedFraction(): number {
  let n = 0;
  for (let i = 0; i < TOTAL_CELLS; i++) if (triggerTimes[i] >= 0) n++;
  return n / TOTAL_CELLS;
}

const STORAGE_KEY = "playground:resolved:v1";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Restores which cells were resolved on a previous visit, as a resolved bit
 * per cell (not the original timestamp — a cell loaded from storage renders
 * already-settled at `t = 0` rather than replaying its reveal animation,
 * since "the city remembers you" and "watch it resolve again" are different
 * experiences and only the first one is honest about a repeat visit).
 *
 * Call this BEFORE any district builds its `resolveAttributes` — those read
 * `triggerTimeOf` at construction time to seed each instance's starting
 * state, so a load that happens after districts have already mounted is a
 * load that visually does nothing.
 */
export function loadResolved(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const bytes = base64ToBytes(raw);
    for (let i = 0; i < TOTAL_CELLS; i++) {
      const byte = bytes[i >> 3] ?? 0;
      if ((byte >> (i & 7)) & 1) triggerTimes[i] = 0;
    }
  } catch {
    /* private browsing, or corrupt data — the city just resolves fresh */
  }
}

/** 147 bits -> 19 bytes -> base64, under `playground:resolved:v1`. */
export function saveResolved(): void {
  try {
    const bytes = new Uint8Array(Math.ceil(TOTAL_CELLS / 8));
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (triggerTimes[i] >= 0) bytes[i >> 3] |= 1 << (i & 7);
    }
    localStorage.setItem(STORAGE_KEY, bytesToBase64(bytes));
  } catch {
    /* private browsing — resolution just doesn't persist, which is survivable */
  }
}

/** Deterministic value noise — same generator gps.ts uses for the raw fix,
 *  reimplemented rather than imported so this stays a self-contained module
 *  with one job. Seeds a scatter position from an instance's OWN index, so
 *  regenerating a family (a data refresh, a hot reload) reproduces the same
 *  cloud rather than reshuffling it every mount. */
function hashNoise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * How far a scattered instance sits from its eventual target before it has
 * ever resolved.
 *
 * Was 26m/9m, and that is the single number that made this world look like
 * noise. At ±26m every unresolved shard in the city was somewhere else in
 * the city: a building's worth of dust didn't hover over its own footprint,
 * it smeared across two districts and the boulevard between them, and 26,000
 * of them at up to 9m of altitude filled the entire upper half of the frame
 * with white confetti. You could not see the road, the rooms, or the
 * buildings that were already resolved — and worse, nothing ever visibly
 * BECAME anything, because a shard travelling 26m to its target just reads as
 * one more speck moving in a blizzard of specks.
 *
 * 5m/2.4m keeps each structure's dust over its own footprint. The city now
 * reads as a set of blurred shapes that sharpen into buildings as you drive
 * past them, which is what the resolution rule was always supposed to look
 * like, and the sky stays empty — so fog, horizon and the lit rooms are
 * visible for the first time.
 */
const SCATTER_SPREAD_XZ = 5;
const SCATTER_SPREAD_Y = 2.4;

/**
 * Builds the four per-instance buffers a resolving family needs, from
 * nothing but its final (`targets`) positions.
 *
 * `scatter` is optional: most callers want the generated cloud (every dust
 * family), but a district drawing its own "rise" geometry may prefer a
 * specific pre-resolve arrangement (e.g. every floor of an employer block
 * scattered from the SAME point, so the tower visibly gathers itself rather
 * than each floor arriving from a different direction) — pass one in when
 * that distinction matters, and it must be the same length as `targets`.
 *
 * `aTriggerTime` is seeded from the CURRENT resolve state (`triggerTimeOf`),
 * not a flat -1 — a family generated after `loadResolved()` has restored a
 * previous session's progress starts already-resolved wherever the visitor
 * had already been, rather than re-scattering geometry they'd already
 * uncovered last time.
 */
export function resolveAttributes(
  targets: Float32Array,
  scatter?: Float32Array,
): {
  aTriggerTime: THREE.InstancedBufferAttribute;
  aScatter: THREE.InstancedBufferAttribute;
  aTarget: THREE.InstancedBufferAttribute;
  cells: Int32Array;
} {
  const count = Math.floor(targets.length / 3);
  const scatterArray = scatter ?? new Float32Array(targets.length);
  if (!scatter) {
    for (let i = 0; i < count; i++) {
      const tx = targets[i * 3];
      const ty = targets[i * 3 + 1];
      const tz = targets[i * 3 + 2];
      scatterArray[i * 3] = tx + hashNoise(i * 12.9898 + 1) * SCATTER_SPREAD_XZ;
      scatterArray[i * 3 + 1] = Math.max(0.25, ty + hashNoise(i * 78.233 + 1) * SCATTER_SPREAD_Y);
      scatterArray[i * 3 + 2] = tz + hashNoise(i * 45.164 + 1) * SCATTER_SPREAD_XZ;
    }
  }

  const cells = new Int32Array(count);
  const triggerArray = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const cell = cellKey(targets[i * 3], targets[i * 3 + 2]);
    cells[i] = cell;
    triggerArray[i] = triggerTimeOf(cell);
  }

  return {
    aTriggerTime: new THREE.InstancedBufferAttribute(triggerArray, 1),
    aScatter: new THREE.InstancedBufferAttribute(scatterArray, 3),
    aTarget: new THREE.InstancedBufferAttribute(targets, 3),
    cells,
  };
}

/**
 * Bucket cache: instance index lists per cell, built once per attribute (the
 * first time `updateTriggers` sees it) and reused for the rest of the
 * session. That one-time pass is O(instances); every call after it is
 * O(cells entered) — the per-frame cost the design doc's budget depends on.
 * Keyed on the attribute's own identity via a WeakMap so a family that's
 * unmounted (its geometry disposed) doesn't hold this cache open forever.
 */
const bucketCache = new WeakMap<THREE.InstancedBufferAttribute, Map<number, number[]>>();

function bucketsFor(attr: THREE.InstancedBufferAttribute, cells: Int32Array): Map<number, number[]> {
  const cached = bucketCache.get(attr);
  if (cached) return cached;
  const map = new Map<number, number[]>();
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const bucket = map.get(cell);
    if (bucket) bucket.push(i);
    else map.set(cell, [i]);
  }
  bucketCache.set(attr, map);
  return map;
}

/**
 * Writes `t` into every instance of `attr` whose cell is in `newCells` — the
 * small list `stamp()` just returned, never the full instance count. Uses
 * `addUpdateRange` per touched instance so the renderer re-uploads only what
 * changed, not the whole buffer, and sets `needsUpdate` once at the end
 * rather than once per instance.
 */
export function updateTriggers(
  attr: THREE.InstancedBufferAttribute,
  cells: Int32Array,
  newCells: number[],
  t: number,
): void {
  if (newCells.length === 0) return;
  const buckets = bucketsFor(attr, cells);
  let touched = false;
  for (const cell of newCells) {
    const indices = buckets.get(cell);
    if (!indices) continue;
    for (const idx of indices) {
      attr.setX(idx, t);
      attr.addUpdateRange(idx, 1);
      touched = true;
    }
  }
  if (touched) attr.needsUpdate = true;
}

type ResolveMode = "dust" | "rise";

/**
 * THE hook every district material goes through, and nothing else.
 *
 * Wires three attributes (`aScatter`, `aTarget`, `aTriggerTime` — the caller
 * must have already attached these to the geometry via `resolveAttributes`)
 * and one uniform (`uTime`, shared and mutated by `stamp()`) into the
 * material's compiled vertex shader, injected at `#include <begin_vertex>`
 * — the one chunk guaranteed to exist, in the same place, across every
 * standard three.js material (Basic, Standard, Lambert, ...), so this works
 * whether a district's material is an unlit dust shard or a lit, shadowed
 * tower shaft without a second code path for each.
 *
 * Two modes, one shader:
 *   "dust" — the instance's local geometry (a shard, a haze speck) is offset
 *     from a scattered position toward its resolved target as `aTriggerTime`
 *     ages past `RESOLVE_DURATION`. Every unresolved shard also shares one
 *     slow sine drift (the same phase for everyone) — coherent motion reads
 *     as "a system", per-point jitter reads as "broken rendering", and this
 *     is the cheapest way to buy that distinction.
 *   "rise" — the instance scales in from nothing and settles the last bit of
 *     height on the way up, for small solid geometry (a pillar, a floor
 *     slab) that should simply not exist yet rather than fly in from
 *     somewhere.
 *
 * If the geometry also carries an `instanceColor` (structure dust's per-
 * district tint does), "dust" mode additionally dims that colour toward the
 * theme's `void` while unresolved and lets it through at full strength once
 * resolved — the "sparse cloud with no shape" the design doc describes,
 * rather than full-colour geometry that merely hasn't moved yet.
 */
export function applyResolveShader(mat: THREE.Material, mode: ResolveMode): void {
  const voidColor = new THREE.Color(worldPalette().void);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedTime;
    shader.uniforms.uVoid = { value: voidColor };
    shader.vertexShader = `
attribute vec3 aScatter;
attribute vec3 aTarget;
attribute float aTriggerTime;
uniform float uTime;
uniform vec3 uVoid;
${shader.vertexShader}`;

    const inject =
      mode === "dust"
        ? `
float resolveProg = aTriggerTime < 0.0 ? 0.0 : clamp((uTime - aTriggerTime) / ${RESOLVE_DURATION.toFixed(4)}, 0.0, 1.0);
float resolveDrift = (1.0 - resolveProg) * sin(uTime * 0.35 + aTarget.x * 0.15 + aTarget.z * 0.09);
transformed += mix(aScatter, aTarget, resolveProg);
transformed.x += resolveDrift * 0.5;
transformed.z += resolveDrift * 0.3;
#ifdef USE_COLOR
vColor.rgb = mix(vColor.rgb, uVoid, 0.75 * (1.0 - resolveProg));
#endif
`
        : `
float resolveProg = aTriggerTime < 0.0 ? 0.0 : clamp((uTime - aTriggerTime) / ${RESOLVE_DURATION.toFixed(4)}, 0.0, 1.0);
transformed *= resolveProg;
transformed.y += (resolveProg - 1.0) * 0.6;
`;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${inject}`,
    );
  };
  // "dust" and "rise" inject different code at the same include point, so
  // they must never share a compiled program — three's program cache keys on
  // this string, and without it the SECOND mode to compile on a given
  // geometry/material shape would silently reuse the first mode's shader.
  mat.customProgramCacheKey = () => `resolve-${mode}`;
}
