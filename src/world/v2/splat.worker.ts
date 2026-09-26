/**
 * World v2 ("Sangam") splat baker — world-v2-spec.md §3: "a web worker
 * computes aSplat (vec4: soil, grass, laterite rock, pebble) and aAux (x =
 * canopy mask, y = curvature AO) from 4+4 neighbour heights", run once at
 * load (never per frame — the same "displaced/baked ONCE" contract v1
 * Terrain.tsx's own doc comment states for its geometry).
 *
 * Amended by this lane (idea-atlas REC-6): `aAux.z` carries the west
 * terraces' second splat weight — texture grain density from
 * `history.ts`'s real `filesChanged`, so "width is commits [G2 river width]
 * and grain is breadth [this]". Reads `ledger.ts`/`valley.ts` directly —
 * this is baking real data into a per-vertex attribute, the same class of
 * work `gen-terrain.mjs` does at build time, just running client-side at
 * load because the heightmap (its own real input) only exists as a texture
 * once the browser has fetched it.
 *
 * Off the main thread on purpose: baking splat for a 513x513 (T1) or
 * 257x257 (T2/mobile) vertex grid is a few hundred thousand neighbour
 * lookups — cheap per-vertex, not cheap enough to block first paint.
 */
import { ledger } from "./ledger.ts";
import { VALLEY_SCALE } from "./valley.ts";
import { zToYear } from "../city.ts";

export interface SplatBakeRequest {
  id: number;
  grid: number; // vertices per axis
  step: number; // world metres between adjacent vertices
  originX: number; // world x of vertex (0,0)
  originZ: number; // world z of vertex (0,0)
  heights: Float32Array; // grid*grid, real metres — Terrain.tsx's own decoded heightmap
}

export type SplatBakeResponse =
  | { type: "baked"; id: number; aSplat: Float32Array; aAux: Float32Array }
  | { type: "error"; id: number; message: string };

// slope band — the same soft edge T2 (terrainMaterial.ts) uses in the
// shader, applied here at bake time so the laterite WEIGHT (not just its
// colour) already reads as a soft rock/grass transition rather than a hard
// per-vertex flip.
const SLOPE_LATERITE_LO_DEG = 28;
const SLOPE_LATERITE_HI_DEG = 36;
const PEBBLE_BAND_M = 0.4; // "pebbles below water + 0.4m" — world-v2-spec §3

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function yearFracToYm(yearFrac: number): string {
  const y = Math.floor(yearFrac);
  const m = Math.min(12, Math.max(1, Math.round((yearFrac - y) * 12) + 1));
  return `${y}-${String(m).padStart(2, "0")}`;
}

// REC-6: real filesChanged per ym, normalised by the max this repo's own
// (short, real) git history has recorded so far — never a guessed ceiling.
const FILES_CHANGED_BY_YM = new Map(ledger.history.map((h) => [h.ym, h.filesChanged]));
const FILES_CHANGED_MAX = Math.max(1, ...ledger.history.map((h) => h.filesChanged));

function terraceGrain(x: number, z: number): number {
  if (x >= 0) return 0; // REC-6/world-v2-spec §3 step 3: west terraces only
  const ym = yearFracToYm(zToYear(z / VALLEY_SCALE));
  const filesChanged = FILES_CHANGED_BY_YM.get(ym);
  // history.ts only covers this repo's own (recent) git log — most of the
  // 2019-2026 terrace span has no row, and that is the honest answer (0
  // grain), never a guessed backfill.
  if (filesChanged == null) return 0;
  return filesChanged / FILES_CHANGED_MAX;
}

function bake(req: SplatBakeRequest): SplatBakeResponse {
  const { grid, step, originX, originZ, heights } = req;
  if (heights.length !== grid * grid) {
    return { type: "error", id: req.id, message: `splat.worker: heights.length ${heights.length} !== grid*grid ${grid * grid}` };
  }
  const aSplat = new Float32Array(grid * grid * 4);
  const aAux = new Float32Array(grid * grid * 3);

  const at = (gx: number, gz: number): number => {
    const cx = Math.min(grid - 1, Math.max(0, gx));
    const cz = Math.min(grid - 1, Math.max(0, gz));
    return heights[cz * grid + cx];
  };

  for (let gz = 0; gz < grid; gz++) {
    for (let gx = 0; gx < grid; gx++) {
      const idx = gz * grid + gx;
      const h = heights[idx];

      // 4 cardinal + 4 diagonal neighbours (world-v2-spec §3: "4+4 neighbour heights").
      const hW = at(gx - 1, gz);
      const hE = at(gx + 1, gz);
      const hN = at(gx, gz - 1);
      const hS = at(gx, gz + 1);
      const hNW = at(gx - 1, gz - 1);
      const hNE = at(gx + 1, gz - 1);
      const hSW = at(gx - 1, gz + 1);
      const hSE = at(gx + 1, gz + 1);

      const dHdx = (hE - hW) / (2 * step);
      const dHdz = (hS - hN) / (2 * step);
      const normalLen = Math.hypot(dHdx, 1, dHdz);
      const normalY = 1 / normalLen;
      const slopeDeg = (Math.acos(Math.min(1, Math.max(-1, normalY))) * 180) / Math.PI;

      const laterite = smooth01((slopeDeg - SLOPE_LATERITE_LO_DEG) / (SLOPE_LATERITE_HI_DEG - SLOPE_LATERITE_LO_DEG));
      const pebble = 1 - smooth01(h / PEBBLE_BAND_M);
      const soil = Math.max(0, 1 - Math.abs(h - 10) / 25);
      const grass = 1;
      const sum = soil + grass + laterite + pebble || 1;
      aSplat[idx * 4 + 0] = soil / sum;
      aSplat[idx * 4 + 1] = grass / sum;
      aSplat[idx * 4 + 2] = laterite / sum;
      aSplat[idx * 4 + 3] = pebble / sum;

      // Curvature AO: the discrete Laplacian over all 8 neighbours — a pit
      // (neighbours higher than here) darkens, a ridge (neighbours lower)
      // does not brighten past 1.
      const neighbourMean = (hW + hE + hN + hS + hNW + hNE + hSW + hSE) / 8;
      const concavity = Math.max(0, neighbourMean - h);
      const curvatureAo = 1 - smooth01(concavity / 2);

      // Canopy mask: no banyan placement data reaches this lane (a later
      // props lane's job — P2-07c/e), so this stays honestly 0 everywhere
      // rather than a guessed pattern.
      const canopyMask = 0;

      aAux[idx * 3 + 0] = canopyMask;
      aAux[idx * 3 + 1] = curvatureAo;
      aAux[idx * 3 + 2] = terraceGrain(originX + gx * step, originZ + gz * step);
    }
  }

  return { type: "baked", id: req.id, aSplat, aAux };
}

self.onmessage = (event: MessageEvent<SplatBakeRequest>) => {
  try {
    const response = bake(event.data);
    if (response.type === "baked") {
      (self as unknown as Worker).postMessage(response, [response.aSplat.buffer, response.aAux.buffer]);
    } else {
      self.postMessage(response);
    }
  } catch (err) {
    self.postMessage({ type: "error", id: event.data.id, message: err instanceof Error ? err.message : String(err) } satisfies SplatBakeResponse);
  }
};
