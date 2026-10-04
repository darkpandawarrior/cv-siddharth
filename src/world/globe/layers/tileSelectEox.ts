// LANE V1 (wave 7, step B): visible-tile selection for EOX's s2cloudless
// deep-zoom base, parameterized on tileMatrix.ts's EOX_LEVELS (WGS84 /
// GoogleCRS84Quad, 256px tiles) instead of the GIBS_LEVELS table
// tileSelect.ts bakes in.
//
// This is a SECOND, EOX-scoped instance of tileSelect.ts's own algorithm,
// not a generalisation of it: tileSelect.ts calls tileMatrix.ts's
// levelDef/latStepDeg/lonStepDeg/tileBounds with no `levels` argument, so it
// always reads GIBS_LEVELS (tileMatrix.ts's own default) — and tileSelect.ts
// is a file this lane doesn't own and can't edit to thread a table through
// without breaking that "never touch another lane's file" rule. Duplicating
// the walk is the honest cost of that wall; `needsFromIntegration` in this
// lane's report flags the real fix (generalise tileSelect.ts to take a level
// table, once a lane owns it, and delete this file).
//
// Pure — no three, no React — reusing tileLOD.ts's generic vector/culling
// primitives (read-only reuse, not an edit to a file this lane doesn't own,
// same convention tileSelect.ts's own header comment states) and this lane's
// own EOX_LEVELS-aware tileMatrix.ts overloads. Also reads tileSelect.ts's
// own `SelectedTile`/`CameraSample` types and `MAX_SELECTED_TILES` constant
// (read-only reuse of its exports, not an edit to its body).
import { GLOBE_RADIUS } from "../geoMath.ts";
import { latLonToXyz } from "../geoMath.ts";
import { DEG2RAD, isBeyondHorizon, isInViewCone, pixelWorldSize, subCameraLatLon, visibleCapHalfAngleDeg } from "./tileLOD.ts";
import { EOX_LEVELS, groundResolutionMetersPerPixel, latStepDeg, levelDef, lonStepDeg, tileBounds, tileKey, wrapLon } from "./tileMatrix.ts";
import { MAX_SELECTED_TILES, type CameraSample, type SelectedTile } from "./tileSelect.ts";

// Same real-world conversion tileLOD.ts's own (unexported) constant uses,
// restated here for the same file-ownership reason isBeyondHorizon's own
// doc comment in tileLOD.ts gives for its restated horizon test.
const METERS_PER_WORLD_UNIT = (6371 / GLOBE_RADIUS) * 1000;

/** Same finest-level-that-fits-a-pixel search as tileLOD.ts's own
 *  `selectLevel`, but reading EOX_LEVELS' own ground resolutions instead of
 *  GIBS_LEVELS' — the two tables' scale denominators don't correspond level
 *  for level (256px tiles doubling regularly vs 512px tiles on GIBS's own
 *  irregular table), so picking an EOX level via GIBS's resolutions would
 *  request the wrong zoom entirely, not just a mislabeled one. */
export function selectEoxLevel(distance: number, fovRadians: number, canvasHeightPx: number, maxLevel: number): number {
  const pxWorld = pixelWorldSize(distance, fovRadians, canvasHeightPx);
  for (let level = 0; level <= maxLevel; level++) {
    const texelWorld = groundResolutionMetersPerPixel(level, EOX_LEVELS) / METERS_PER_WORLD_UNIT;
    if (texelWorld <= pxWorld) return level;
  }
  return maxLevel;
}

/** The visible EOX tiles at `maxLevel`, capped at MAX_SELECTED_TILES — same
 *  horizon/view-cone-culled row/col walk as tileSelect.ts's own
 *  `selectVisibleTiles`, see this file's header for why it's a second copy
 *  rather than a shared call. */
export function selectVisibleEoxTiles(maxLevel: number, cam: CameraSample): SelectedTile[] {
  const distance = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
  const level = selectEoxLevel(distance, cam.fovRadians, cam.canvasHeightPx, maxLevel);
  const { lat: subLat, lon: subLon } = subCameraLatLon(cam.position);
  const capDeg = Math.min(90, visibleCapHalfAngleDeg(cam.position, GLOBE_RADIUS) * 1.15);
  const latStep = latStepDeg(level, EOX_LEVELS);
  const lonStep = lonStepDeg(level, EOX_LEVELS);
  const { matrixHeight, matrixWidth } = levelDef(level, EOX_LEVELS);

  const latMin = Math.max(-90, subLat - capDeg);
  const latMax = Math.min(90, subLat + capDeg);
  const rowMin = Math.max(0, Math.floor(((90 - latMax) / 180) * matrixHeight));
  const rowMax = Math.min(matrixHeight - 1, Math.ceil(((90 - latMin) / 180) * matrixHeight));

  const lonPadDeg = Math.min(180, capDeg / Math.max(0.15, Math.cos((subLat * Math.PI) / 180)));
  const colSpan = Math.min(matrixWidth, Math.ceil((2 * lonPadDeg) / lonStep) + 1);
  const centerCol = Math.floor(((wrapLon(subLon) + 180) / 360) * matrixWidth);
  const colLo = -Math.floor(colSpan / 2);
  const colHi = Math.ceil(colSpan / 2);

  const tileHalfAngleRad = (Math.max(latStep, lonStep) / 2) * DEG2RAD;

  const seen = new Set<string>();
  const out: SelectedTile[] = [];
  for (let row = rowMin; row <= rowMax && out.length < MAX_SELECTED_TILES; row++) {
    for (let i = colLo; i <= colHi && out.length < MAX_SELECTED_TILES; i++) {
      const col = ((((centerCol + i) % matrixWidth) + matrixWidth) % matrixWidth);
      const cellKey = `${row}:${col}`;
      if (seen.has(cellKey)) continue;
      seen.add(cellKey);

      const bounds = tileBounds(level, row, col, EOX_LEVELS);
      const midLat = (bounds.lat0 + bounds.lat1) / 2;
      const midLon = (bounds.lon0 + bounds.lon1) / 2;
      const dir = latLonToXyz(midLat, midLon);
      if (isBeyondHorizon(dir, cam.position, GLOBE_RADIUS, tileHalfAngleRad)) continue;
      if (!isInViewCone(dir, cam.position, cam.forward, cam.fovRadians / 2, 1.5, tileHalfAngleRad)) continue;
      out.push({ key: tileKey("WGS84", level, row, col), level, row, col, bounds });
    }
  }
  return out;
}
