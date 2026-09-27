// Break-it coverage for CRAFT-3's asset gate (idea-atlas.md#CRAFT-3,
// master-plan.md#M6, lane P3-05 acceptance): a zero-triangle fixture GLB
// makes the probe exit 1, and the real shipped models pass.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertModel, findWorldModelGlbs, measureModel, parseGlb } from "./probe-world-models.mjs";

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

/** Builds a minimal, well-formed GLB buffer from a JSON-chunk payload only
 * (no BIN chunk: every value this gate reads lives in accessor min/max
 * and count, never the binary buffer). */
function buildGlb(json) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(pad, 0x20)]); // space-pad
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4); // version
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(CHUNK_JSON, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8); // total length
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}

const ZERO_TRIANGLE_FIXTURE = buildGlb({
  asset: { version: "2.0" },
  meshes: [],
});

const REAL_TRIANGLE_FIXTURE = buildGlb({
  asset: { version: "2.0" },
  accessors: [
    { componentType: 5126, count: 3, type: "VEC3", min: [-1, 0, -1], max: [1, 2, 1] },
    { componentType: 5123, count: 3, type: "SCALAR" },
  ],
  meshes: [{ primitives: [{ mode: 4, attributes: { POSITION: 0 }, indices: 1 }] }],
});

describe("probe-world-models", () => {
  it("break-it: a zero-triangle fixture GLB fails the gate", () => {
    expect(() => assertModel(ZERO_TRIANGLE_FIXTURE, "fixture")).toThrow(/zero-triangle/);
  });

  it("a fixture with real geometry passes both assertions", () => {
    const { triangles, volume } = assertModel(REAL_TRIANGLE_FIXTURE, "fixture");
    expect(triangles).toBeGreaterThan(0);
    expect(volume).toBeGreaterThan(0);
  });

  it("parseGlb rejects a non-GLB buffer", () => {
    expect(() => parseGlb(Buffer.from("not a glb"))).toThrow(/bad magic/);
  });

  it("measureModel treats a points/lines-only primitive as zero triangles", () => {
    const pointsOnly = buildGlb({
      accessors: [{ componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 1] }],
      meshes: [{ primitives: [{ mode: 0, attributes: { POSITION: 0 } }] }],
    });
    expect(measureModel(pointsOnly).triangles).toBe(0);
  });

  it("every real heavy/world*/models/*.glb passes the gate", () => {
    const paths = findWorldModelGlbs();
    for (const path of paths) {
      expect(() => assertModel(readFileSync(path), path)).not.toThrow();
    }
  });
});
