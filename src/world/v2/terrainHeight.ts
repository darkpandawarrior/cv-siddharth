export interface HeightmapMeta {
  grid: number;
  metresPerTexel: number;
  min: number;
  max: number;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number };
}

export interface Heightmap {
  heights: Float32Array;
  meta: HeightmapMeta;
}

export type HeightAt = (x: number, z: number) => number;

/** The mesh and every ground placement sample the same decoded heightmap. */
export function terrainHeight(x: number, z: number, { heights, meta }: Heightmap): number {
  const { grid, metresPerTexel, bounds } = meta;
  const fx = (x - bounds.xMin) / metresPerTexel;
  const fz = (z - bounds.zMin) / metresPerTexel;
  const x0 = Math.min(grid - 2, Math.max(0, Math.floor(fx)));
  const z0 = Math.min(grid - 2, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - x0));
  const tz = Math.min(1, Math.max(0, fz - z0));
  const a = heights[z0 * grid + x0] * (1 - tx) + heights[z0 * grid + x0 + 1] * tx;
  const b = heights[(z0 + 1) * grid + x0] * (1 - tx) + heights[(z0 + 1) * grid + x0 + 1] * tx;
  return a * (1 - tz) + b * tz;
}

/** Keep water at zero and preserve an object's local vertical offset. */
export function groundPosition([x, y, z]: readonly number[], heightAt: HeightAt): [number, number, number] {
  return [x, Math.max(0, heightAt(x, z)) + Math.max(0, y) + 0.5, z];
}
