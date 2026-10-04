import { createContext, useContext, useMemo } from "react";
import { heavy } from "../../lib/assetBase.ts";
import { terrainHeight, type HeightAt, type Heightmap, type HeightmapMeta } from "./terrainHeight.ts";

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  // Reject missing assets before decoding their HTML error pages.
  if (!res.ok) throw new Error(`Terrain.tsx: ${url} -> HTTP ${res.status} (heavy asset not published?)`);
  return res;
}

async function loadHeightmap(): Promise<Heightmap> {
  const pngUrl = heavy("/world/terrain/valley-h-513.png");
  const jsonUrl = heavy("/world/terrain/valley-h-513.json");
  const [meta, blob] = await Promise.all([
    fetchOk(jsonUrl).then((r) => r.json() as Promise<HeightmapMeta>),
    fetchOk(pngUrl).then((r) => r.blob()),
  ]);
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Terrain.tsx: 2d canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const heights = new Float32Array(meta.grid * meta.grid);
  const range = meta.max - meta.min;
  for (let i = 0; i < heights.length; i++) heights[i] = meta.min + (img.data[i * 4] / 255) * range; // greyscale: R=G=B
  return { heights, meta };
}


let pending: Promise<Heightmap> | undefined;
export function loadTerrainHeightmap(): Promise<Heightmap> {
  return pending ??= loadHeightmap().catch((error) => { pending = undefined; throw error; });
}

export const TerrainSurface = createContext<Heightmap | null>(null);

export function useTerrainHeight(): HeightAt {
  const hm = useContext(TerrainSurface);
  return useMemo(() => {
    if (!hm) throw new Error("Terrain heightmap is not ready");
    return (x: number, z: number) => terrainHeight(x, z, hm);
  }, [hm]);
}
