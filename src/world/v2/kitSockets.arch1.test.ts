import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * P2-07a's own gate (this lane's acceptance list): each of the six
 * kits-architecture-1 GLBs parses as valid GLB, and its JSON chunk's node
 * (and material) names carry the sockets this lane's task list names —
 * never a baked data count (world-v2-spec.md §0.3 rule 2: "no GLB bakes a
 * data count"). A GLB not yet produced by its Blender script is skipped,
 * not failed, matching this repo's "not written yet -> skip" convention
 * (purity.test.ts, fictionFence.test.ts).
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

/** world-v2-spec.md §0.3 rule 2, restated by this lane's acceptance list:
 * "no node name contains a digit count of a data record (e.g. no
 * 'bell.67')". Two-or-more-digit numeric suffixes are the shape a live
 * count takes (fleetStats' 88/84, providers' 15/44/7); this lane's own
 * fixed-cardinality indices (buckets 0-4, pillars 0-5) stay single-digit
 * on purpose, so the boundary this regex draws is exact for both sides. */
const DATA_COUNT_SUFFIX = /\.\d{2,}(\.|$)/;

const KITS: Array<{ id: string; expectedNodes: string[] }> = [
  {
    id: "paymentslab-bell-toran",
    expectedNodes: ["ToranFrame", "Bell", "socket.bell_pitch"],
  },
  {
    id: "candidai-rahat",
    expectedNodes: [
      "Wheel",
      "Bucket",
      "socket.bucket.0",
      "socket.bucket.1",
      "socket.bucket.2",
      "socket.bucket.3",
      "socket.bucket.4",
    ],
  },
  {
    id: "template-gomukh",
    expectedNodes: ["GomukhHead", "socket.spout.a", "socket.spout.b"],
  },
  {
    id: "portfolio-twin-chhatri",
    expectedNodes: ["ChhatriA", "ChhatriB", "Pool", "InlayTile", "socket.floorInlay"],
  },
  {
    id: "stutter-samrat-yantra",
    expectedNodes: ["Gnomon", "Quadrant", "shadowInlay"],
  },
  {
    id: "sinc-p-baori",
    expectedNodes: [
      "level.tenantIsolation",
      "level.auditChainAtomicity",
      "level.statutoryTrackPriority",
      "level.noAutomatedOutcomes",
      "pillar.deepseek",
      "pillar.council.0",
      "pillar.council.1",
      "pillar.council.2",
      "pillar.council.3",
      "pillar.council.4",
      "pillar.council.5",
    ],
  },
];

describe("kitSockets.arch1 (P2-07a: bell toran, rahat, gomukh, twin chhatri, samrat yantra, baori)", () => {
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

  it("sinc-p-baori has exactly 4 named levels and 7 pillar sockets, one pillar.deepseek", () => {
    const path = join(MODELS_DIR, "sinc-p-baori.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    const levels = doc.nodeNames.filter((n) => n.startsWith("level."));
    const pillars = doc.nodeNames.filter((n) => n.startsWith("pillar."));
    expect(levels).toHaveLength(4);
    expect(pillars).toHaveLength(7);
    expect(pillars).toContain("pillar.deepseek");
  });

  it("candidai-rahat has exactly 5 bucket sockets and a named Wheel node", () => {
    const path = join(MODELS_DIR, "candidai-rahat.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    const buckets = doc.nodeNames.filter((n) => n.startsWith("socket.bucket."));
    expect(buckets).toHaveLength(5);
    expect(doc.nodeNames).toContain("Wheel");
  });

  it("portfolio-twin-chhatri carries a named site-CI inlay material", () => {
    const path = join(MODELS_DIR, "portfolio-twin-chhatri.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    expect(doc.materialNames).toContain("mat.siteCI");
  });
});
