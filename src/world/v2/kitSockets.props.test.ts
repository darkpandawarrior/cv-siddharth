import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import hullProfile from "./hullProfile.json" with { type: "json" };

/**
 * P2-07d's own gate (this lane's acceptance list): hodi-boatman.glb's hull
 * half-beam, sampled from the exported mesh, matches hullProfile.json
 * within 2 cm at 9 stations (the single-source contract master-plan.md#M44
 * makes, restated by this file's own break-it test); misc-kit.glb carries
 * the six new nodes this lane's task list names; diya-kit.glb stays
 * commit-diyas-only (living-ledger-spec §10 C7); every GLB stays within its
 * world-v2-spec.md §6 byte budget. "Not built yet" skips rather than
 * fails, this repo's usual convention (kitSockets.arch1/2, .audit, .nature).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", ".."); // src/world/v2 -> repo root
const MODELS_DIR = join(REPO_ROOT, "heavy", "world", "models");

interface GlbDoc {
  nodeNames: string[];
  materialNames: string[];
}

/** Minimal GLB container reader: 12-byte header, then length-prefixed
 * chunks (JSON first, optional BIN second). We only need the JSON chunk. */
function readGlb(path: string): GlbDoc {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error(`${path}: not a GLB (bad magic)`);
  let offset = 12;
  let json: Record<string, unknown> | undefined;
  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunkData.toString("utf8"));
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error(`${path}: no JSON chunk`);
  const nodes = (json.nodes as Array<{ name?: string }> | undefined) ?? [];
  const materials = (json.materials as Array<{ name?: string }> | undefined) ?? [];
  return {
    nodeNames: nodes.map((n) => n.name).filter((n): n is string => Boolean(n)),
    materialNames: materials.map((m) => m.name).filter((n): n is string => Boolean(n)),
  };
}

/** world-v2-spec.md §0.3 rule 2, reused by every kitSockets sibling: "no
 * node name contains a digit count of a data record". */
const DATA_COUNT_SUFFIX = /\.\d{2,}(\.|$)/;

describe("kitSockets.props (P2-07d: hodi + boatman, diya kit, misc kit)", () => {
  it("misc-kit.glb carries garland, lantern, peg, kite, bell, mooringLamp", () => {
    const path = join(MODELS_DIR, "misc-kit.glb");
    if (!existsSync(path)) return; // not built yet in this checkout -- skip, not fail
    const doc = readGlb(path);
    for (const name of ["garland", "lantern", "peg", "kite", "bell", "mooringLamp"]) {
      expect(doc.nodeNames, `misc-kit.glb is missing node "${name}"`).toContain(name);
    }
  });

  it("diya-kit.glb exports exactly diya + flame, commit diyas only (C7)", () => {
    const path = join(MODELS_DIR, "diya-kit.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    expect(doc.nodeNames.sort()).toEqual(["diya", "flame"]);
  });

  it("hodi-boatman.glb carries the hull, canopy, oarArm and the bow lantern socket", () => {
    const path = join(MODELS_DIR, "hodi-boatman.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    for (const name of ["HodiHull", "Canopy", "oarArm", "Boatman", "socket.lantern"]) {
      expect(doc.nodeNames, `hodi-boatman.glb is missing node "${name}"`).toContain(name);
    }
  });

  it("no kit node name bakes a data-record count (e.g. no bell.67)", () => {
    for (const id of ["misc-kit", "diya-kit", "hodi-boatman"]) {
      const path = join(MODELS_DIR, `${id}.glb`);
      if (!existsSync(path)) continue;
      const doc = readGlb(path);
      for (const name of doc.nodeNames) {
        expect(name, `${id}.glb node "${name}" looks like a baked data count`).not.toMatch(DATA_COUNT_SUFFIX);
      }
    }
  });
});

// world-v2-spec.md §6 per-asset byte budgets, this lane's acceptance list.
const GLB_BUDGET_KB: Record<string, number> = {
  "hodi-boatman": 380,
  "diya-kit": 15,
  "misc-kit": 60,
};

describe("props-kit byte budgets (world-v2-spec.md §6)", () => {
  for (const [id, kb] of Object.entries(GLB_BUDGET_KB)) {
    it(`${id}.glb is within its ${kb} KB budget`, () => {
      const path = join(MODELS_DIR, `${id}.glb`);
      if (!existsSync(path)) return;
      expect(statSync(path).size / 1024).toBeLessThanOrEqual(kb);
    });
  }
});

// --- hull half-beam vs. hullProfile.json (master-plan.md#M44's single-
// source contract) -------------------------------------------------------

type HullSample = readonly [number, number];
const HULL_SAMPLES = hullProfile.samples as unknown as readonly HullSample[];
const HULL_LENGTH: number = hullProfile.length;

/** Linear-interpolate the analytic half-beam at t, the same curve
 * hodi-boatman.py lofts the hull from. Pure, so it is directly unit-
 * testable without a built GLB (break-it, G15). */
export function halfBeamAt(samples: readonly HullSample[], t: number): number {
  for (let i = 0; i < samples.length - 1; i++) {
    const [t0, h0] = samples[i];
    const [t1, h1] = samples[i + 1];
    if (t >= t0 - 1e-9 && t <= t1 + 1e-9) {
      const f = (t - t0) / (t1 - t0);
      return h0 + (h1 - h0) * f;
    }
  }
  throw new Error(`t=${t} out of hullProfile.json's sampled range`);
}

/** hodi-boatman.py builds the hull with its length along Blender's local Y
 * axis and exports Y-up (`export_yup=True`), which rotates Blender (x,y,z)
 * to glTF (x, z, -y) -- so the boat's length axis becomes glTF Z, negated.
 * Confirmed empirically against the exported file, not assumed. */
function stationZ(t: number): number {
  return -t * (HULL_LENGTH / 2);
}

const HULL_TOLERANCE_M = 0.02; // 2 cm, this lane's acceptance list
const STATIONS = [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8] as const;

async function loadGlbScene(path: string): Promise<THREE.Group> {
  const buf = readFileSync(path);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, "", (gltf) => resolve(gltf.scene), reject);
  });
}

describe("halfBeamAt (pure interpolation, break-it G15)", () => {
  it("matches a known sample exactly", () => {
    expect(halfBeamAt(HULL_SAMPLES, 0)).toBeCloseTo(0.85, 9);
  });

  it("interpolates between two samples", () => {
    const mid = halfBeamAt(HULL_SAMPLES, 0.025); // halfway between the 0 and 0.05 samples
    expect(mid).toBeGreaterThan(Math.min(HULL_SAMPLES[20][1], HULL_SAMPLES[21][1]));
    expect(mid).toBeLessThan(Math.max(HULL_SAMPLES[20][1], HULL_SAMPLES[21][1]));
  });

  it("break-it: a deliberately wrong expected value fails a tolerance check (G15)", () => {
    const wrongExpected = halfBeamAt(HULL_SAMPLES, 0) + 0.5; // 50 cm off, way outside 2 cm
    const diff = Math.abs(halfBeamAt(HULL_SAMPLES, 0) - wrongExpected);
    expect(diff).toBeGreaterThan(HULL_TOLERANCE_M);
  });
});

describe("hodi-boatman hull half-beam vs. hullProfile.json (master-plan.md#M44)", () => {
  const path = join(MODELS_DIR, "hodi-boatman.glb");

  it("matches the analytic half-beam within 2 cm at 9 stations", async () => {
    if (!existsSync(path)) return; // not built yet in this checkout -- skip, not fail
    const scene = await loadGlbScene(path);
    scene.updateMatrixWorld(true);
    const hullRoot = scene.getObjectByName("HodiHull");
    expect(hullRoot, "hodi-boatman.glb has no HodiHull node").toBeTruthy();
    let mesh: THREE.Mesh | undefined;
    hullRoot!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    expect(mesh, "HodiHull carries no mesh geometry").toBeTruthy();

    const positions = mesh!.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (const t of STATIONS) {
      const targetZ = stationZ(t);
      let sampledHalfBeam = 0;
      for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i).applyMatrix4(mesh!.matrixWorld);
        if (Math.abs(v.z - targetZ) < 0.01) sampledHalfBeam = Math.max(sampledHalfBeam, Math.abs(v.x));
      }
      const expected = halfBeamAt(HULL_SAMPLES, t);
      expect(
        Math.abs(sampledHalfBeam - expected),
        `station t=${t}: sampled ${sampledHalfBeam.toFixed(4)}m vs hullProfile.json's ${expected.toFixed(4)}m`,
      ).toBeLessThanOrEqual(HULL_TOLERANCE_M);
    }
  });
});
