// Shared with the layer legend; the renderer consumes these exact speed stops.
export const WIND_LEGEND = {
  unit: "m/s",
  stops: [{ color: "#3f5e78", label: "2" }, { color: "#468f88", label: "12" }, { color: "#d8c98a", label: "22+" }],
};

// LANE W5 (global wind): the client half of /api/wind's grid contract —
// pure, no three, no React, no fetch, same shape as geoMath.ts. Mirrors
// api/_lib/wind-handler.ts's WindGridSpec exactly (duplicated, not imported:
// api/_lib is a separate edge bundle with its own tsconfig, and the shared
// shape is four numbers plus two counts, not worth a cross-bundle import).

export interface WindGridSpec {
  latStart: number;
  latStep: number;
  latCount: number;
  lonStart: number;
  lonStep: number;
  lonCount: number;
}

/** `u`/`v` are the eastward/northward m/s components the wind blows TOWARD,
 *  row-major (lat outer, lon inner) against `grid` — /api/wind's own
 *  contract (wind-handler.ts's `toUV`). */
export interface WindField {
  grid: WindGridSpec;
  u: Float32Array;
  v: Float32Array;
}

const DEG2RAD = Math.PI / 180;

/** Builds a `WindField` from /api/wind's plain-array response — the one
 *  allocation per fetch (Float32Array copies), never per frame. */
export function buildWindField(grid: WindGridSpec, u: readonly number[], v: readonly number[]): WindField {
  return { grid, u: Float32Array.from(u), v: Float32Array.from(v) };
}

/** Bilinear-sample `field` at (latDeg, lonDeg) into `out` (reused — zero
 *  per-frame allocation for a caller stepping thousands of particles).
 *
 *  Latitude is clamped to the grid's own extent: there is no "other side" of
 *  a pole to wrap into, and every row this grid has already sits inset from
 *  the true pole (WIND_GRID starts at -85/+85), so the clamp only ever
 *  reuses the nearest polar row rather than distorting it.
 *
 *  Longitude wraps modulo 360: the grid is a full circle of the globe
 *  (lonCount * lonStep === 360), so a sample just past the last column
 *  (e.g. 179.9 deg needing the -180 deg column beside it) blends across the
 *  antimeridian instead of clamping to a flat edge. */
export function sampleWind(field: WindField, latDeg: number, lonDeg: number, out: { u: number; v: number } = { u: 0, v: 0 }): { u: number; v: number } {
  const { grid, u, v } = field;
  const latMax = grid.latStart + (grid.latCount - 1) * grid.latStep;
  const latClamped = Math.min(Math.max(latDeg, grid.latStart), latMax);
  const latF = (latClamped - grid.latStart) / grid.latStep;
  const latI0 = Math.min(Math.floor(latF), grid.latCount - 1);
  const latI1 = Math.min(latI0 + 1, grid.latCount - 1);
  const latT = latI1 === latI0 ? 0 : latF - latI0;

  const lonSpan = grid.lonCount * grid.lonStep; // 360 for a full-globe grid
  const lonWrapped = (((lonDeg - grid.lonStart) % lonSpan) + lonSpan) % lonSpan;
  const lonF = lonWrapped / grid.lonStep;
  const lonI0 = Math.floor(lonF) % grid.lonCount;
  const lonI1 = (lonI0 + 1) % grid.lonCount;
  const lonT = lonF - Math.floor(lonF);

  const idx = (latI: number, lonI: number) => latI * grid.lonCount + lonI;
  const i00 = idx(latI0, lonI0);
  const i10 = idx(latI0, lonI1);
  const i01 = idx(latI1, lonI0);
  const i11 = idx(latI1, lonI1);

  out.u = bilerp(u[i00], u[i10], u[i01], u[i11], lonT, latT);
  out.v = bilerp(v[i00], v[i10], v[i01], v[i11], lonT, latT);
  return out;
}

function bilerp(v00: number, v10: number, v01: number, v11: number, tx: number, ty: number): number {
  const top = v00 + (v10 - v00) * tx;
  const bot = v01 + (v11 - v01) * tx;
  return top + (bot - top) * ty;
}

/** Wind speed in m/s at a grid cell — the colour ramp's input. */
export function windSpeed(u: number, v: number): number {
  return Math.hypot(u, v);
}

export { DEG2RAD };
