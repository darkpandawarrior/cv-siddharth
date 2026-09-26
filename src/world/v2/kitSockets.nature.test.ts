import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * P2-07c's own gate (this lane's acceptance list): banyan-neem.glb and
 * palm.glb carry the node/material names this lane's task list names, no
 * node bakes a data-record count (world-v2-spec.md §0.3 rule 2), every
 * GLB stays within its world-v2-spec.md §6 byte budget, and every Poly
 * Haven texture/model row in heavy/world/assets.json matches the file it
 * describes on disk. Sibling of kitSockets.arch1/arch2/audit.test.ts; same
 * GLB reader and "not built yet -> skip" convention.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", ".."); // src/world/v2 -> repo root
const MODELS_DIR = join(REPO_ROOT, "heavy", "world", "models");
const TEXTURES_DIR = join(REPO_ROOT, "heavy", "world", "textures");
const ASSETS_JSON = join(REPO_ROOT, "heavy", "world", "assets.json");
const ASSETS_MD = join(REPO_ROOT, "heavy", "world", "ASSETS.md");

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

/** world-v2-spec.md §0.3 rule 2, restated by P2-07a/b's acceptance list and
 * reused by this lane: single-digit fixed-count suffixes (this lane's own
 * two neem trunks) stay allowed; two-or-more digits is the shape a live
 * data count takes. */
const DATA_COUNT_SUFFIX = /\.\d{2,}(\.|$)/;

describe("kitSockets.nature (P2-07c: banyan-neem, palm)", () => {
  it("banyan-neem.glb carries the merged banyan trunk and both neem trunks", () => {
    const path = join(MODELS_DIR, "banyan-neem.glb");
    if (!existsSync(path)) return; // not built yet in this checkout -- skip, not fail
    const doc = readGlb(path);
    expect(doc.nodeNames).toContain("BanyanTrunk");
    expect(doc.nodeNames).toContain("NeemTrunk.0");
    expect(doc.nodeNames).toContain("NeemTrunk.1");
    expect(doc.materialNames).toContain("mat.bark");
  });

  it("palm.glb carries the trunk and the runtime's frond-crown socket", () => {
    const path = join(MODELS_DIR, "palm.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    expect(doc.nodeNames).toContain("PalmTrunk");
    expect(doc.nodeNames).toContain("socket.frond");
    expect(doc.materialNames).toContain("mat.palmBark");
  });

  it("no nature-kit node name bakes a data-record count", () => {
    for (const id of ["banyan-neem", "palm"]) {
      const path = join(MODELS_DIR, `${id}.glb`);
      if (!existsSync(path)) continue;
      const doc = readGlb(path);
      for (const name of doc.nodeNames) {
        expect(name, `${id}.glb node "${name}" looks like a baked data count`).not.toMatch(DATA_COUNT_SUFFIX);
      }
    }
  });

  it("banyan-neem.glb has exactly two neem trunks, no more", () => {
    const path = join(MODELS_DIR, "banyan-neem.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    const neems = doc.nodeNames.filter((n) => n.startsWith("NeemTrunk."));
    expect(neems.sort()).toEqual(["NeemTrunk.0", "NeemTrunk.1"]);
  });
});

// world-v2-spec.md §6 per-asset byte budgets, this lane's acceptance list.
const GLB_BUDGET_KB: Record<string, number> = {
  "banyan-neem": 700,
  "brass_diya_lantern": 600,
  "fern_02": 500,
  "rock_moss_set_01": 800,
};

describe("nature-kit byte budgets (world-v2-spec.md §6)", () => {
  for (const [id, kb] of Object.entries(GLB_BUDGET_KB)) {
    it(`${id}.glb is within its ${kb} KB budget`, () => {
      const path = join(MODELS_DIR, `${id}.glb`);
      if (!existsSync(path)) return;
      expect(statSync(path).size / 1024).toBeLessThanOrEqual(kb);
    });
  }

  it("the foliage-atlas color+normal pair is within its 400 KB combined budget", () => {
    const color = join(TEXTURES_DIR, "atlas-color-1024.webp");
    const normal = join(TEXTURES_DIR, "atlas-normal-1024.webp");
    if (!existsSync(color) || !existsSync(normal)) return;
    const totalKb = (statSync(color).size + statSync(normal).size) / 1024;
    expect(totalKb).toBeLessThanOrEqual(400);
  });
});

// Two things assets.json never rows: the atlas pair (this lane's own
// original foliage-atlas.py render, not Poly Haven-sourced content, so it
// is deliberately outside the provenance ledger, master-plan.md#M43:
// "assets.json + ASSETS.md stay the [Poly Haven] provenance record"), and
// any .avif -- a build-time derivative gen-images.mjs bakes from every
// heavy/**/*.webp per prebuild, gitignored, never fetched by this script.
const skipsProvenanceRow = (name: string) => name.startsWith("atlas-") || name.endsWith(".avif");

describe("heavy/world/assets.json provenance ledger (this lane's acceptance list)", () => {
  it("every non-atlas file under heavy/world/textures has a CC0 row with its exact byte size", () => {
    if (!existsSync(ASSETS_JSON) || !existsSync(TEXTURES_DIR)) return;
    const ledger = JSON.parse(readFileSync(ASSETS_JSON, "utf8")) as {
      assets: Array<{ licence: string; files: Array<{ path: string; bytes: number }> }>;
    };
    const byPath = new Map<string, { licence: string; bytes: number }>();
    for (const asset of ledger.assets) {
      for (const file of asset.files) byPath.set(file.path, { licence: asset.licence, bytes: file.bytes });
    }
    for (const name of readdirSync(TEXTURES_DIR)) {
      if (skipsProvenanceRow(name)) continue;
      const relPath = `heavy/world/textures/${name}`;
      const row = byPath.get(relPath);
      expect(row, `${relPath} has no assets.json row`).toBeDefined();
      expect(row?.licence).toBe("CC0");
      expect(row?.bytes).toBe(statSync(join(TEXTURES_DIR, name)).size);
    }
  });

  it("every repacked Poly Haven GLB (fern, rocks, brass lantern) has a CC0 row with its exact byte size", () => {
    if (!existsSync(ASSETS_JSON)) return;
    const ledger = JSON.parse(readFileSync(ASSETS_JSON, "utf8")) as {
      assets: Array<{ id: string; licence: string; files: Array<{ path: string; bytes: number }> }>;
    };
    for (const id of ["fern_02", "rock_moss_set_01", "brass_diya_lantern"]) {
      const path = join(MODELS_DIR, `${id}.glb`);
      if (!existsSync(path)) continue;
      const asset = ledger.assets.find((a) => a.id === id);
      expect(asset, `assets.json has no row for ${id}`).toBeDefined();
      expect(asset?.licence).toBe("CC0");
      expect(asset?.files[0]?.bytes).toBe(statSync(path).size);
    }
  });

  it("ASSETS.md carries the elevation-texture attribution line verbatim (master-plan.md#M68)", () => {
    if (!existsSync(ASSETS_MD)) return;
    const md = readFileSync(ASSETS_MD, "utf8");
    expect(md).toContain("Elevation texture: SRTM/GMTED2010 via AWS Terrain Tiles (USGS, public domain)");
  });
});
