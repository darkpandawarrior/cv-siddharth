// WAVE 2 LANE W1 (deep zoom): turns a camera sample into the actual set of
// (level, row, col) tiles worth requesting — one shared target level (see
// tileLOD.ts's own comment on why), horizon-culled and view-cone-culled, and
// bounded to a hard cap so a wide FOV over a fine level can never walk into
// thousands of fetches. Pure aside from importing GLOBE_RADIUS/latLonToXyz
// from geoMath.ts (read-only reuse, not an edit to a file this lane doesn't
// own) — no three, no React, so this is unit-testable directly.
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { DEG2RAD, isBeyondHorizon, isInViewCone, selectLevel, subCameraLatLon, visibleCapHalfAngleDeg, type Vec3 } from "./tileLOD.ts";
import { latStepDeg, levelDef, lonStepDeg, tileBounds, tileKey, wrapLon, type TileBounds, type TileMatrixSetId } from "./tileMatrix.ts";

export interface SelectedTile {
  key: string;
  level: number;
  row: number;
  col: number;
  bounds: TileBounds;
}

export interface CameraSample {
  position: Vec3;
  forward: Vec3;
  fovRadians: number;
  canvasHeightPx: number;
}

/** Hard cap on tiles returned per layer per selection — bounds worst-case
 *  fetch/mesh count regardless of FOV or how fine the chosen level is. */
export const MAX_SELECTED_TILES = 96;

/** The visible tiles for one layer (base or one overlay) at `matrixSet`,
 *  capped at `maxLevel`. Enumerates a lat/lon box around the sub-camera
 *  point sized from the sphere's own horizon angle (never walks the whole
 *  matrix — at 250m's own top level that would be 320x160 tiles), then
 *  drops anything beyond the horizon or outside the view cone. */
export function selectVisibleTiles(matrixSet: TileMatrixSetId, maxLevel: number, cam: CameraSample): SelectedTile[] {
  const distance = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
  const level = selectLevel(distance, cam.fovRadians, cam.canvasHeightPx, maxLevel);
  const { lat: subLat, lon: subLon } = subCameraLatLon(cam.position);
  // 1.15x margin: this box only decides which tiles get a horizon/cone test,
  // not which ones survive it, so a slightly generous box costs a few extra
  // cheap dot products, never a missing tile at the rim.
  const capDeg = Math.min(90, visibleCapHalfAngleDeg(cam.position, GLOBE_RADIUS) * 1.15);
  const latStep = latStepDeg(level);
  const lonStep = lonStepDeg(level);
  const { matrixHeight, matrixWidth } = levelDef(level);

  const latMin = Math.max(-90, subLat - capDeg);
  const latMax = Math.min(90, subLat + capDeg);
  const rowMin = Math.max(0, Math.floor((90 - latMax) / latStep));
  const rowMax = Math.min(matrixHeight - 1, Math.ceil((90 - latMin) / latStep));

  // Longitude padding widens toward the poles (1/cos(lat)) because a fixed
  // degree span covers ever-less real ground there, not more — capped at a
  // full trip around the matrix so a polar view doesn't request the same
  // column many times over.
  const lonPadDeg = Math.min(180, capDeg / Math.max(0.15, Math.cos((subLat * Math.PI) / 180)));
  const colSpan = Math.min(matrixWidth, Math.ceil((2 * lonPadDeg) / lonStep) + 1);
  const centerCol = Math.floor((wrapLon(subLon) + 180) / lonStep);
  const colLo = -Math.floor(colSpan / 2);
  const colHi = Math.ceil(colSpan / 2);

  // Half of the tile's own angular span (degrees->radians), used to widen
  // the cone test so a coarse tile isn't dropped just because its CENTRE
  // sits outside a tight wedge while its body still overlaps the view.
  const tileHalfAngleRad = (Math.max(latStep, lonStep) / 2) * DEG2RAD;

  const seen = new Set<string>();
  const out: SelectedTile[] = [];
  for (let row = rowMin; row <= rowMax && out.length < MAX_SELECTED_TILES; row++) {
    for (let i = colLo; i <= colHi && out.length < MAX_SELECTED_TILES; i++) {
      const col = ((((centerCol + i) % matrixWidth) + matrixWidth) % matrixWidth);
      const cellKey = `${row}:${col}`;
      if (seen.has(cellKey)) continue; // the wrap above can revisit a column when colSpan >= matrixWidth (level 0/1 at wide FOV)
      seen.add(cellKey);

      const bounds = tileBounds(level, row, col);
      const midLat = (bounds.lat0 + bounds.lat1) / 2;
      const midLon = (bounds.lon0 + bounds.lon1) / 2;
      const dir = latLonToXyz(midLat, midLon);
      if (isBeyondHorizon(dir, cam.position, GLOBE_RADIUS, tileHalfAngleRad)) continue;
      if (!isInViewCone(dir, cam.position, cam.forward, cam.fovRadians / 2, 1.5, tileHalfAngleRad)) continue;
      out.push({ key: tileKey(matrixSet, level, row, col), level, row, col, bounds });
    }
  }
  return out;
}
