import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * P2-07b's own gate (this lane's acceptance list): each of the six
 * kits-architecture-2 GLBs parses as valid GLB, and its JSON chunk's node
 * (and material) names carry the sockets/variants this lane's task list
 * names -- never a baked data count (world-v2-spec.md §0.3 rule 2: "no GLB
 * bakes a data count"). A GLB not yet produced by its Blender script is
 * skipped, not failed, matching this repo's "not written yet -> skip"
 * convention (purity.test.ts, fictionFence.test.ts). Sibling of
 * kitSockets.arch1.test.ts (P2-07a); same GLB reader.
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

/** world-v2-spec.md §0.3 rule 2, restated by P2-07a's acceptance list and
 * reused by this lane: "no node name contains a digit count of a data
 * record (e.g. no 'bell.67')". Two-or-more-digit numeric suffixes are the
 * shape a live count takes; this lane's own fixed-cardinality indices (4
 * kite masts) stay single-digit on purpose, so the boundary this regex
 * draws is exact for both sides. */
const DATA_COUNT_SUFFIX = /\.\d{2,}(\.|$)/;

const KITS: Array<{ id: string; expectedNodes: string[] }> = [
  {
    id: "fleet-deepmal",
    expectedNodes: [
      "TowerRing",
      "TierCollar",
      "NicheUnit",
      "FlameCard",
      "BasePlinth",
      "Finial",
      "socket.ring_pitch",
      "socket.niche_pitch",
      "socket.flame",
    ],
  },
  {
    id: "pr-stepping-stones",
    expectedNodes: ["StoneBasalt", "StoneLaterite", "CairnStone", "SubmergedStone"],
  },
  {
    id: "room-chhatri-kit",
    expectedNodes: ["ChhatriUnit", "socket.garland"],
  },
  {
    id: "hero-stone-kit",
    expectedNodes: ["HeroStone", "RegisterBand", "socket.register_pitch"],
  },
  {
    id: "loopdown-kite-masts",
    expectedNodes: [
      "MastPost",
      "KiteLesson",
      "KiteArchive",
      "socket.tether",
      "socket.mast.0",
      "socket.mast.1",
      "socket.mast.2",
      "socket.mast.3",
    ],
  },
  {
    id: "festival-kit",
    expectedNodes: ["RangoliDecal", "ToranGarland", "PaperKite", "Gudi"],
  },
];

describe("kitSockets.arch2 (P2-07b: deepmal, stepping stones, room chhatri, hero stones, kite masts, festival kit)", () => {
  for (const kit of KITS) {
    const path = join(MODELS_DIR, `${kit.id}.glb`);

    it(`${kit.id}.glb carries its named sockets`, () => {
      if (!existsSync(path)) return; // not built yet in this checkout — skip, not fail
      const doc = readGlb(path);
      for (const name of kit.expectedNodes) {
        expect(doc.nodeNames, `${kit.id}.glb is missing node "${name}"`).toContain(name);
      }
    });
  }

  it("no kit node name bakes a data-record count (e.g. no bell.67)", () => {
    for (const kit of KITS) {
      const path = join(MODELS_DIR, `${kit.id}.glb`);
      if (!existsSync(path)) continue;
      const doc = readGlb(path);
      for (const name of doc.nodeNames) {
        expect(name, `${kit.id}.glb node "${name}" looks like a baked data count`).not.toMatch(
          DATA_COUNT_SUFFIX,
        );
      }
    }
  });

  it("loopdown-kite-masts has exactly 4 fixed platform sockets and one shared tether anchor", () => {
    const path = join(MODELS_DIR, "loopdown-kite-masts.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    const masts = doc.nodeNames.filter((n) => n.startsWith("socket.mast."));
    expect(masts).toHaveLength(4);
    expect(doc.nodeNames).toContain("socket.tether");
    expect(doc.nodeNames.filter((n) => n === "socket.tether")).toHaveLength(1);
  });

  it("festival-kit has exactly the four ambient nodes and no node named diya*", () => {
    const path = join(MODELS_DIR, "festival-kit.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    expect(doc.nodeNames.sort()).toEqual(["Gudi", "PaperKite", "RangoliDecal", "ToranGarland"].sort());
    for (const name of doc.nodeNames) {
      expect(name.toLowerCase(), `festival-kit node "${name}" reads as a diya (M16)`).not.toMatch(/^diya/);
    }
  });

  it("pr-stepping-stones carries the basalt/laterite org materials and the submerged-stone form", () => {
    const path = join(MODELS_DIR, "pr-stepping-stones.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    expect(doc.materialNames).toContain("mat.basalt");
    expect(doc.materialNames).toContain("mat.laterite");
    expect(doc.nodeNames).toContain("SubmergedStone");
  });
});
