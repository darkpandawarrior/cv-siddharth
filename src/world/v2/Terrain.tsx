import { useEffect, useRef, useState, type JSX } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight, type Heightmap } from "./terrainHeight.ts";
import { deviceTier } from "../deviceTier.ts";
import { buildTerrainMaterial, type TerrainMaterialHandle } from "./terrainMaterial.ts";
import { BOUNDS, EXTENT } from "./valley.ts";
import type { SplatBakeRequest, SplatBakeResponse } from "./splat.worker.ts";

/**
 * World v2 ("Sangam") terrain, world-v2-spec.md §3: a 512^2 grid on
 * desktop, 256^2 on the phone/throttled tier, in 4x4 chunks for culling.
 * Vertices displace ONCE at load from the real, generated heightmap
 * (`gen-terrain.mjs`, this lane); splat (soil/grass/laterite/pebble +
 * canopy/curvature/REC-6 grain) bakes ONCE at load in `splat.worker.ts`,
 * off the main thread. Nothing here recomputes per frame except the
 * material's own `uCamPos`/`uGrassWet` uniform writes (terrainMaterial.ts),
 * the same "displaced/baked once, one small uniform a frame" contract v1
 * Terrain.tsx documents for its own ground.
 */

const CHUNKS_PER_AXIS = 4;
// world-v2-spec §3: desktop 512^2, phone/throttled 256^2. Both divide
// evenly by CHUNKS_PER_AXIS.
const SEGMENTS_DESKTOP = 512;
const SEGMENTS_PHONE = 256;

/** One splat.worker.ts instance, request/response id-correlated, the same
 *  idiom src/chess/engineClient.ts already ships for its own worker. */
function createSplatClient() {
  const worker = new Worker(new URL("./splat.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve: (r: { aSplat: Float32Array; aAux: Float32Array }) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  worker.onmessage = (event: MessageEvent<SplatBakeResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.type === "error") entry.reject(new Error(msg.message));
    else entry.resolve({ aSplat: msg.aSplat, aAux: msg.aAux });
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "splat worker failed");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  return {
    bake(req: Omit<SplatBakeRequest, "id">): Promise<{ aSplat: Float32Array; aAux: Float32Array }> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...req, id } satisfies SplatBakeRequest, [req.heights.buffer]);
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}

interface ChunkGeometry {
  cx: number;
  cz: number;
  geometry: THREE.PlaneGeometry;
}

/** Builds one chunk's geometry, height-displaced from the shared heightmap
 *  by real world position (never by internal vertex-traversal order, the
 *  same "read the vertex's own position back, don't assume an order"
 *  discipline v1 Terrain.tsx's `buildGeometry` already uses). */
function buildChunkGeometry(cx: number, cz: number, chunkSegments: number, chunkSize: number, hm: Heightmap): ChunkGeometry {
  const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, chunkSegments, chunkSegments);
  geometry.rotateX(-Math.PI / 2);
  const originX = BOUNDS.xMin + cx * chunkSize + chunkSize / 2;
  const originZ = BOUNDS.zMin + cz * chunkSize + chunkSize / 2;
  geometry.translate(originX, 0, originZ);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z, hm));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return { cx, cz, geometry };
}

/** Bakes this chunk's own local aSplat/aAux by resampling the shared
 *  heightmap onto a small local grid sized/stepped to match the chunk's own
 *  geometry, then scattering the worker's grid-ordered result back onto
 *  each vertex by its own (x,z), same order-independence as the geometry
 *  build above. Chunk edges clamp their own neighbour lookups (splat.worker
 *  .ts's `at()`), so a splat weight can read very slightly differently
 *  right at a chunk seam, ponytail: a per-chunk apron would remove that,
 *  add one if a seam ever reads as a visible line in a crawl. */
async function bakeChunkSplat(
  client: ReturnType<typeof createSplatClient>,
  cx: number,
  cz: number,
  chunkSegments: number,
  chunkSize: number,
  hm: Heightmap,
  geometry: THREE.PlaneGeometry,
): Promise<void> {
  const localGrid = chunkSegments + 1;
  const step = chunkSize / chunkSegments;
  const originX = BOUNDS.xMin + cx * chunkSize;
  const originZ = BOUNDS.zMin + cz * chunkSize;
  const localHeights = new Float32Array(localGrid * localGrid);
  for (let gz = 0; gz < localGrid; gz++) {
    for (let gx = 0; gx < localGrid; gx++) {
      localHeights[gz * localGrid + gx] = terrainHeight(originX + gx * step, originZ + gz * step, hm);
    }
  }
  const { aSplat, aAux } = await client.bake({ grid: localGrid, step, originX, originZ, heights: localHeights });

  const pos = geometry.attributes.position;
  const splatArr = new Float32Array(pos.count * 4);
  const auxArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const gx = Math.min(localGrid - 1, Math.max(0, Math.round((pos.getX(i) - originX) / step)));
    const gz = Math.min(localGrid - 1, Math.max(0, Math.round((pos.getZ(i) - originZ) / step)));
    const gi = gz * localGrid + gx;
    splatArr[i * 4 + 0] = aSplat[gi * 4 + 0];
    splatArr[i * 4 + 1] = aSplat[gi * 4 + 1];
    splatArr[i * 4 + 2] = aSplat[gi * 4 + 2];
    splatArr[i * 4 + 3] = aSplat[gi * 4 + 3];
    auxArr[i * 3 + 0] = aAux[gi * 3 + 0];
    auxArr[i * 3 + 1] = aAux[gi * 3 + 1];
    auxArr[i * 3 + 2] = aAux[gi * 3 + 2];
  }
  geometry.setAttribute("aSplat", new THREE.BufferAttribute(splatArr, 4));
  geometry.setAttribute("aAux", new THREE.BufferAttribute(auxArr, 3));
}

interface TerrainAssets {
  chunks: ChunkGeometry[];
  materialHandle: TerrainMaterialHandle;
}

async function buildTerrainAssets(hm: Heightmap): Promise<TerrainAssets> {
  const tier = deviceTier();
  const segments = tier === 1 ? SEGMENTS_DESKTOP : SEGMENTS_PHONE;
  const chunkSegments = segments / CHUNKS_PER_AXIS;
  const chunkSize = EXTENT / CHUNKS_PER_AXIS;

  const client = createSplatClient();
  try {
    const chunks: ChunkGeometry[] = [];
    for (let cz = 0; cz < CHUNKS_PER_AXIS; cz++) {
      for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
        const chunk = buildChunkGeometry(cx, cz, chunkSegments, chunkSize, hm);
        await bakeChunkSplat(client, cx, cz, chunkSegments, chunkSize, hm, chunk.geometry);
        chunks.push(chunk);
      }
    }
    const materialHandle = buildTerrainMaterial({ tier });
    return { chunks, materialHandle };
  } finally {
    client.dispose();
  }
}

export function Terrain({ heightmap }: { heightmap: Heightmap }): JSX.Element | null {
  const [assets, setAssets] = useState<TerrainAssets | null>(null);
  const mounted = useRef(true);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    mounted.current = true;
    buildTerrainAssets(heightmap)
      .then((a) => {
        if (mounted.current) setAssets(a);
      })
      .catch((err) => {
        console.error("Terrain.tsx: failed to build terrain assets", err);
      });
    return () => {
      mounted.current = false;
    };
  }, [heightmap]);

  useEffect(
    () => () => {
      // Dispose GPU resources on unmount, a leak here is a leak per /playground?world=v2 visit.
      if (!assets) return;
      for (const chunk of assets.chunks) chunk.geometry.dispose();
      assets.materialHandle.material.dispose();
    },
    [assets],
  );

  useFrame(() => {
    if (!assets) return;
    assets.materialHandle.uCamPos.value.copy(camera.position);
  });

  if (!assets) return null;

  return (
    <>
      {assets.chunks.map((chunk) => (
        <mesh key={`${chunk.cx}-${chunk.cz}`} geometry={chunk.geometry} material={assets.materialHandle.material} />
      ))}
    </>
  );
}
