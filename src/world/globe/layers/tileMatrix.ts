// WAVE 2 LANE W1 (deep zoom): the exact NASA GIBS WMTS EPSG:4326 "best" tile
// matrix definitions this lane draws against. Pure data + math, no three, no
// React — verified against the endpoint's own GetCapabilities document
// (https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?SERVICE=WMTS&
// REQUEST=GetCapabilities, fetched 2026-09-27, 5.2 MB) rather than guessed:
// every EPSG:4326 TileMatrixSet GIBS publishes (2km, 1km, 500m, 250m,
// 31.25m, 15.625m) shares this exact same level table — TopLeftCorner is
// always -180,90 and TileWidth/TileHeight are always 512 — they only differ
// in how many levels of it they expose (`maxLevel` below). Levels 0-2 are
// genuinely irregular (matrixWidth 2,3,5, not the 2,4,8 a naive "quadtree"
// formula would guess), which is exactly why this is a verified table and
// not a derived one.
export interface TileLevel {
  level: number;
  /** WMTS ScaleDenominator at this level, straight from GetCapabilities. */
  scaleDenominator: number;
  matrixWidth: number;
  matrixHeight: number;
}

export const GIBS_LEVELS: readonly TileLevel[] = [
  { level: 0, scaleDenominator: 223632905.6114871, matrixWidth: 2, matrixHeight: 1 },
  { level: 1, scaleDenominator: 111816452.8057436, matrixWidth: 3, matrixHeight: 2 },
  { level: 2, scaleDenominator: 55908226.40287178, matrixWidth: 5, matrixHeight: 3 },
  { level: 3, scaleDenominator: 27954113.20143589, matrixWidth: 10, matrixHeight: 5 },
  { level: 4, scaleDenominator: 13977056.60071795, matrixWidth: 20, matrixHeight: 10 },
  { level: 5, scaleDenominator: 6988528.300358973, matrixWidth: 40, matrixHeight: 20 },
  { level: 6, scaleDenominator: 3494264.150179486, matrixWidth: 80, matrixHeight: 40 },
  { level: 7, scaleDenominator: 1747132.075089743, matrixWidth: 160, matrixHeight: 80 },
  { level: 8, scaleDenominator: 873566.0375448716, matrixWidth: 320, matrixHeight: 160 },
  { level: 9, scaleDenominator: 436783.0187724358, matrixWidth: 640, matrixHeight: 320 },
  { level: 10, scaleDenominator: 218391.5093862179, matrixWidth: 1280, matrixHeight: 640 },
  { level: 11, scaleDenominator: 109195.75469310895, matrixWidth: 2560, matrixHeight: 1280 },
  { level: 12, scaleDenominator: 54597.87734655447, matrixWidth: 5120, matrixHeight: 2560 },
];

export const TILE_SIZE_PX = 512;

/** Which GIBS TileMatrixSet each catalog entry rides, and how far into
 *  GIBS_LEVELS it goes — also verified from GetCapabilities per layer (see
 *  gibsCatalog.ts). Note the reference/label layers use "15.625m", not the
 *  "31.25m" a quick guess from the brief's own resolution list would reach
 *  for — GetCapabilities names it plainly, this is that name. */
export const TILE_MATRIX_SETS = {
  "2km": { id: "2km", maxLevel: 5 },
  "1km": { id: "1km", maxLevel: 6 },
  "500m": { id: "500m", maxLevel: 7 },
  "250m": { id: "250m", maxLevel: 8 },
  "31.25m": { id: "31.25m", maxLevel: 11 },
  "15.625m": { id: "15.625m", maxLevel: 12 },
} as const;
export type TileMatrixSetId = keyof typeof TILE_MATRIX_SETS;

export function levelDef(level: number): TileLevel {
  const l = GIBS_LEVELS[level];
  if (!l) throw new RangeError(`tileMatrix: no such level ${level} (0..${GIBS_LEVELS.length - 1})`);
  return l;
}

export function lonStepDeg(level: number): number {
  return 360 / levelDef(level).matrixWidth;
}

export function latStepDeg(level: number): number {
  return 180 / levelDef(level).matrixHeight;
}

/** WMTS's standard pixel size is 0.28mm (OGC 07-057r7 §7); ground metres per
 *  pixel is the scale denominator times that. Every GIBS level table above
 *  shares this convention, so this one line gives a real physical ground
 *  resolution per level without needing a separate lookup. */
export function groundResolutionMetersPerPixel(level: number): number {
  return levelDef(level).scaleDenominator * 0.00028;
}

/** Normalises a longitude into [-180, 180) — the antimeridian wrap every
 *  row/col lookup below needs (a visitor panning past +180 or -180 must
 *  still land on a real tile, not fall off the matrix). */
export function wrapLon(lonDeg: number): number {
  return (((lonDeg + 180) % 360) + 360) % 360 - 180;
}

export interface TileRowCol {
  level: number;
  row: number;
  col: number;
}

/** The tile a (lat, lon) falls in at `level`. Latitude clamps to the poles
 *  (there is no wrap there); longitude wraps. Both indices are additionally
 *  clamped into the matrix's own bounds, so float error at an exact edge
 *  (lon = 180, lat = -90) never returns an out-of-range tile. */
export function tileRowColForLatLon(latDeg: number, lonDeg: number, level: number): TileRowCol {
  const { matrixWidth, matrixHeight } = levelDef(level);
  const lat = Math.max(-90, Math.min(90, latDeg));
  const lon = wrapLon(lonDeg);
  const col = Math.min(matrixWidth - 1, Math.max(0, Math.floor(((lon + 180) / 360) * matrixWidth)));
  const row = Math.min(matrixHeight - 1, Math.max(0, Math.floor(((90 - lat) / 180) * matrixHeight)));
  return { level, row, col };
}

export interface TileBounds {
  /** North edge (top row), degrees. */
  lat0: number;
  /** South edge (bottom row), degrees. lat1 < lat0. */
  lat1: number;
  /** West edge (left column), degrees. */
  lon0: number;
  /** East edge (right column), degrees. lon1 > lon0 (never wrapped — a tile
   *  never straddles the antimeridian itself, only the grid does). */
  lon1: number;
}

/** The lat/lon rectangle a given (level, row, col) covers. Inverse of
 *  `tileRowColForLatLon` up to the row/col rounding. */
export function tileBounds(level: number, row: number, col: number): TileBounds {
  const lonStep = lonStepDeg(level);
  const latStep = latStepDeg(level);
  const lon0 = -180 + col * lonStep;
  const lat0 = 90 - row * latStep;
  return { lat0, lat1: lat0 - latStep, lon0, lon1: lon0 + lonStep };
}

export function tileKey(matrixSet: TileMatrixSetId, level: number, row: number, col: number): string {
  return `${matrixSet}/${level}/${row}/${col}`;
}
