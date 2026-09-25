import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { useLoader } from "@react-three/fiber";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { MODELS, useStudioModel, type ModelName } from "./models.ts";

// useLoader needs a live r3f Canvas; mock it so useStudioModel can be called
// as a plain function here, and so the extensions callback it passes (the
// MeshoptDecoder registration) can be captured and asserted directly.
vi.mock("@react-three/fiber", () => ({ useLoader: vi.fn() }));

// Mirrors the per-asset kb_budget rows in scripts/blender/*.py / the design
// spec (section 5). studio-orbit carries the pre-existing sculpture plus the
// wow-pass hex plinth; both it and signal-marker are exported raw rather
// than gltfpack-compressed (see models.ts's top comment for why).
const KB_BUDGET: Record<ModelName, number> = {
  "studio-orbit": 337,
  "signal-marker": 20,
  "skills-core": 30,
  "blueprint-instrument": 150,
  "chess-handoff-marker": 15,
  "world-monuments": 60,
  "kmp-foundation-keystone": 20,
};

describe("MODELS registry", () => {
  for (const [name, path] of Object.entries(MODELS) as [ModelName, string][]) {
    it(`${name} exists under public/models and is within its KB budget`, () => {
      const abs = fileURLToPath(new URL(`../../public${path}`, import.meta.url));
      expect(existsSync(abs)).toBe(true);
      const kb = statSync(abs).size / 1024;
      expect(kb).toBeLessThanOrEqual(KB_BUDGET[name]);
    });
  }

  it("new assets (excluding the pre-existing studio-orbit sculpture) total at most 295 KB", () => {
    const total = (Object.entries(MODELS) as [ModelName, string][])
      .filter(([name]) => name !== "studio-orbit")
      .reduce((sum, [, path]) => {
        const abs = fileURLToPath(new URL(`../../public${path}`, import.meta.url));
        return sum + statSync(abs).size / 1024;
      }, 0);
    expect(total).toBeLessThanOrEqual(295);
  });
});

/** Reads a .glb's JSON chunk (the binary-glTF header format: magic, version,
 * length, then a length-prefixed JSON chunk) without needing a full glTF
 * parser, since this test only needs the node list. */
function readGlbJson(path: string): { nodes?: { name?: string }[] } {
  const buffer = readFileSync(path);
  const jsonChunkLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonChunkLength).toString("utf8"));
}

describe("blueprint-instrument needle contract (P1-02 / M50)", () => {
  it("the exported GLB contains a node named exactly 'needle'", () => {
    const abs = fileURLToPath(new URL("../../public/models/blueprint-instrument.glb", import.meta.url));
    const gltf = readGlbJson(abs);
    expect(gltf.nodes?.some((node) => node.name === "needle")).toBe(true);
  });
});

describe("useStudioModel", () => {
  it("registers three's MeshoptDecoder on the GLTFLoader (5 of 7 GLBs are meshopt-compressed)", () => {
    const fakeLoader = { setMeshoptDecoder: vi.fn() };
    vi.mocked(useLoader).mockImplementation((_loader, _input, extensions) => {
      (extensions as unknown as ((loader: typeof fakeLoader) => void) | undefined)?.(fakeLoader);
      return undefined as never;
    });
    useStudioModel("skills-core");
    expect(fakeLoader.setMeshoptDecoder).toHaveBeenCalledWith(MeshoptDecoder);
  });
});
