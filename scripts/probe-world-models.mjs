// CRAFT-3 asset gate (idea-atlas.md#CRAFT-3, master-plan.md#M6, lane P3-05):
// load every heavy/world*/models/*.glb headlessly and assert triangle
// count > 0 and bounding-box volume > 0: the doctrine that caught Stutter's
// kit shipping empty models. No renderer, no GLTFLoader: this reads the GLB
// container directly (same minimal-parser approach as
// src/world/v2/kitSockets.audit.test.ts) and trusts the glTF accessor
// metadata (component type, count, min/max) rather than decoding the
// binary vertex buffer, because a well-formed GLB's JSON chunk already
// carries everything this gate needs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

/** Splits a GLB buffer into its JSON chunk (parsed) and BIN chunk (raw). */
export function parseGlb(buf) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("not a GLB (bad magic)");
  }
  let offset = 12;
  let json;
  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === CHUNK_JSON) json = JSON.parse(chunkData.toString("utf8"));
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error("no JSON chunk");
  return json;
}

/** Triangle count and bounding-box volume across every mesh primitive,
 * read from the accessors' own `count`/`min`/`max` (glTF requires POSITION
 * accessors to carry min/max), never from the binary buffer. A primitive
 * with an explicit non-TRIANGLES mode (0-6, default 4) is skipped for the
 * triangle count, since points/lines carry no triangles by definition. */
export function measureModel(buf) {
  const json = parseGlb(buf);
  const accessors = json.accessors ?? [];
  const meshes = json.meshes ?? [];

  let triangles = 0;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];

  for (const mesh of meshes) {
    for (const prim of mesh.primitives ?? []) {
      const mode = prim.mode ?? 4;
      const posAccessor = accessors[prim.attributes?.POSITION];
      if (posAccessor?.min && posAccessor?.max) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], posAccessor.min[i]);
          max[i] = Math.max(max[i], posAccessor.max[i]);
        }
      }
      if (mode !== 4) continue; // not TRIANGLES
      const count =
        prim.indices !== undefined ? accessors[prim.indices]?.count : posAccessor?.count;
      if (typeof count === "number") triangles += Math.floor(count / 3);
    }
  }

  const hasBounds = min.every((v) => Number.isFinite(v)) && max.every((v) => Number.isFinite(v));
  const volume = hasBounds
    ? (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2])
    : 0;

  return { triangles, volume };
}

/** Throws when the model fails the gate; returns the measurement otherwise. */
export function assertModel(buf, label) {
  const { triangles, volume } = measureModel(buf);
  if (!(triangles > 0)) throw new Error(`${label}: zero-triangle model (triangles=${triangles})`);
  if (!(volume > 0)) throw new Error(`${label}: zero-volume bounding box (volume=${volume})`);
  return { triangles, volume };
}

/** Every glb under a heavy/world-prefixed dir's models/ subdir, relative to the repo root. */
export function findWorldModelGlbs(repoRoot = REPO_ROOT) {
  const heavyDir = join(repoRoot, "heavy");
  let entries;
  try {
    entries = readdirSync(heavyDir);
  } catch {
    return [];
  }
  const paths = [];
  for (const entry of entries) {
    if (!entry.startsWith("world")) continue;
    const modelsDir = join(heavyDir, entry, "models");
    let stat;
    try {
      stat = statSync(modelsDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const file of readdirSync(modelsDir)) {
      if (file.endsWith(".glb")) paths.push(join(modelsDir, file));
    }
  }
  return paths;
}

function main() {
  const paths = findWorldModelGlbs();
  let failed = false;
  for (const path of paths) {
    try {
      const { triangles, volume } = assertModel(readFileSync(path), path);
      console.log(`ok   ${path} (triangles=${triangles}, volume=${volume.toFixed(2)})`);
    } catch (err) {
      failed = true;
      console.error(`FAIL ${err.message}`);
    }
  }
  if (paths.length === 0) console.log("no heavy/world*/models/*.glb found");
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
