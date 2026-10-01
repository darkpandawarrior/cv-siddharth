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
// EPSG:4326 GetCapabilities: TopLeftCorner is longitude, latitude.
export const TILE_TOP_LEFT = [-180, 90] as const;

// LANE V1 (wave 7, step B): EOX's own WMTS EPSG:4326 "WGS84" tile matrix
// (https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml, fetched
// 2026-09-29) — the deep-zoom s2cloudless base. A genuinely different
// matrix from GIBS_LEVELS above: 256px tiles (not 512), TopLeftCorner is
// still (90,-180) but matrixWidth/matrixHeight exactly DOUBLE every level
// (a real quadtree, unlike GIBS's own irregular levels 0-2) out to level 17
// (~0.6m/px at the equator). Still pinned as literal verified numbers rather
// than trusted to the doubling formula, same convention as GIBS_LEVELS —
// this is what the endpoint actually published today, not a derivation that
// could silently drift from it.
export const EOX_LEVELS: readonly TileLevel[] = [
  { level: 0, scaleDenominator: 279541132.0143589, matrixWidth: 2, matrixHeight: 1 },
  { level: 1, scaleDenominator: 139770566.0071794, matrixWidth: 4, matrixHeight: 2 },
  { level: 2, scaleDenominator: 69885283.00358972, matrixWidth: 8, matrixHeight: 4 },
  { level: 3, scaleDenominator: 34942641.50179486, matrixWidth: 16, matrixHeight: 8 },
  { level: 4, scaleDenominator: 17471320.75089743, matrixWidth: 32, matrixHeight: 16 },
  { level: 5, scaleDenominator: 8735660.375448715, matrixWidth: 64, matrixHeight: 32 },
  { level: 6, scaleDenominator: 4367830.187724357, matrixWidth: 128, matrixHeight: 64 },
  { level: 7, scaleDenominator: 2183915.093862179, matrixWidth: 256, matrixHeight: 128 },
  { level: 8, scaleDenominator: 1091957.546931089, matrixWidth: 512, matrixHeight: 256 },
  { level: 9, scaleDenominator: 545978.7734655, matrixWidth: 1024, matrixHeight: 512 },
  { level: 10, scaleDenominator: 272989.3867327723, matrixWidth: 2048, matrixHeight: 1024 },
  { level: 11, scaleDenominator: 136494.6933663862, matrixWidth: 4096, matrixHeight: 2048 },
  { level: 12, scaleDenominator: 68247.34668319309, matrixWidth: 8192, matrixHeight: 4096 },
  { level: 13, scaleDenominator: 34123.67334159654, matrixWidth: 16384, matrixHeight: 8192 },
  { level: 14, scaleDenominator: 17061.83667079825, matrixWidth: 32768, matrixHeight: 16384 },
  { level: 15, scaleDenominator: 8530.918335399127, matrixWidth: 65536, matrixHeight: 32768 },
  { level: 16, scaleDenominator: 4265.459167699563, matrixWidth: 131072, matrixHeight: 65536 },
  { level: 17, scaleDenominator: 2132.729583849786, matrixWidth: 262144, matrixHeight: 131072 },
];
export const EOX_TILE_SIZE_PX = 256;

/** Which GIBS TileMatrixSet each catalog entry rides, and how far into
 *  GIBS_LEVELS it goes — also verified from GetCapabilities per layer (see
 *  gibsCatalog.ts). Note the reference/label layers use "15.625m", not the
 *  "31.25m" a quick guess from the brief's own resolution list would reach
 *  for — GetCapabilities names it plainly, this is that name.
 *
 *  "WGS84" is the odd one out: it's EOX's matrix (EOX_LEVELS above), not
 *  GIBS's — kept in this same lookup so `TILE_MATRIX_SETS[matrixSet].maxLevel`
 *  stays one uniform call for every role in TileLayer.tsx regardless of
 *  provider, rather than a special case at every call site. */
export const TILE_MATRIX_SETS = {
  "2km": { id: "2km", maxLevel: 5 },
  "1km": { id: "1km", maxLevel: 6 },
  "500m": { id: "500m", maxLevel: 7 },
  "250m": { id: "250m", maxLevel: 8 },
  "31.25m": { id: "31.25m", maxLevel: 11 },
  "15.625m": { id: "15.625m", maxLevel: 12 },
  WGS84: { id: "WGS84", maxLevel: 17 },
} as const;
export type TileMatrixSetId = keyof typeof TILE_MATRIX_SETS;

/** `levels` defaults to GIBS_LEVELS so every existing GIBS caller (tileSelect.ts
 *  included, which this lane doesn't own and can't edit to thread a table
 *  through) is byte-for-byte unaffected — EOX_LEVELS is passed explicitly
 *  only by this lane's own EOX-scoped selection code (tileSelectEox.ts). */
export function levelDef(level: number, levels: readonly TileLevel[] = GIBS_LEVELS): TileLevel {
  const l = levels[level];
  if (!l) throw new RangeError(`tileMatrix: no such level ${level} (0..${levels.length - 1})`);
  return l;
}

export function lonStepDeg(level: number, levels: readonly TileLevel[] = GIBS_LEVELS): number {
  const pixels = levels === EOX_LEVELS ? EOX_TILE_SIZE_PX : TILE_SIZE_PX;
  // WMTS dimensions include padding at the east/south edges. Scale defines
  // texel extent, not 360 / MatrixWidth (wrong at GIBS levels 0-2).
  const span = groundResolutionMetersPerPixel(level, levels) * pixels / (6378137 * Math.PI / 180);
  return Math.round(span * 1e9) / 1e9; // remove scale-denominator rounding noise
}

export function latStepDeg(level: number, levels: readonly TileLevel[] = GIBS_LEVELS): number {
  return lonStepDeg(level, levels);
}

/** WMTS's standard pixel size is 0.28mm (OGC 07-057r7 §7); ground metres per
 *  pixel is the scale denominator times that. Every GIBS level table above
 *  shares this convention, so this one line gives a real physical ground
 *  resolution per level without needing a separate lookup. EOX's own WGS84
 *  matrix (verified GetCapabilities scale denominators) follows the same
 *  WMTS convention, so the one formula covers both tables. */
export function groundResolutionMetersPerPixel(level: number, levels: readonly TileLevel[] = GIBS_LEVELS): number {
  return levelDef(level, levels).scaleDenominator * 0.00028;
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
export function tileRowColForLatLon(latDeg: number, lonDeg: number, level: number, levels: readonly TileLevel[] = GIBS_LEVELS): TileRowCol {
  const { matrixWidth, matrixHeight } = levelDef(level, levels);
  const lat = Math.max(-90, Math.min(90, latDeg));
  const lon = wrapLon(lonDeg);
  const col = Math.min(matrixWidth - 1, Math.max(0, Math.floor((lon - TILE_TOP_LEFT[0]) / lonStepDeg(level, levels))));
  const row = Math.min(matrixHeight - 1, Math.max(0, Math.floor((TILE_TOP_LEFT[1] - lat) / latStepDeg(level, levels))));
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
export function tileBounds(level: number, row: number, col: number, levels: readonly TileLevel[] = GIBS_LEVELS): TileBounds {
  const lonStep = lonStepDeg(level, levels);
  const latStep = latStepDeg(level, levels);
  const lon0 = TILE_TOP_LEFT[0] + col * lonStep;
  const lat0 = TILE_TOP_LEFT[1] - row * latStep;
  return { lat0, lat1: Math.max(-90, lat0 - latStep), lon0, lon1: Math.min(180, lon0 + lonStep) };
}

export function tileKey(matrixSet: TileMatrixSetId, level: number, row: number, col: number): string {
  return `${matrixSet}/${level}/${row}/${col}`;
}
