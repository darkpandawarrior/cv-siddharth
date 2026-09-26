import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * P2-07e's own gate (this lane's acceptance list): the four audited kits
 * (keystone bridge, Doori ghat, Gaddi ghat, ghat-kit) plus the new Tara Kund
 * observatory each parse as valid GLB, and their JSON chunk's node (and
 * material) names carry the sockets this lane's task list names — never a
 * baked data count (world-v2-spec.md §0.3 rule 2: "no GLB bakes a data
 * count"). A GLB not yet produced by its Blender script is skipped, not
 * failed, matching this repo's "not written yet -> skip" convention
 * (purity.test.ts, fictionFence.test.ts). Sibling of kitSockets.arch1/2's
 * test.ts (P2-07a/b); same GLB reader.
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
 * reused by every kitSockets sibling: "no node name contains a digit count
 * of a data record (e.g. no 'bell.67')". Two-or-more-digit numeric suffixes
 * are the shape a live count takes. */
const DATA_COUNT_SUFFIX = /\.\d{2,}(\.|$)/;

/** socket.inflow.NN (sangam-keystone-bridge, P1-13) and socket.mooring.NN
 * (gaddi-ghat, P1-13) predate this lane and are not in its task list — both
 * are a fixed, small physical mount-point allocation (5 tributary berths
 * under the arch, 3 ships edges), zero-padded to 2 digits by the landed
 * script's own `{i:02d}` formatting, not a live count this lane bakes. This
 * lane's own additions (socket.niche.*, socket.schema_*, socket.tier_pitch,
 * socket.starfield) carry no digit suffix at all, so the exemption never
 * shadows a real violation this lane could introduce. */
const PRE_EXISTING_FIXED_SUFFIX = /^socket\.(inflow|mooring)\.\d{2}$/;

const KITS: Array<{ id: string; expectedNodes: string[] }> = [
  {
    id: "sangam-keystone-bridge",
    expectedNodes: [
      "Voussoir", "Keystone", "VoussoirSide", "KeystoneSide", "PierCourse",
      "SpandrelWall", "SpandrelWallSide", "CutwaterPier", "DeckSegment",
      "RailingRun", "LampSocketPost", "DryNiche",
      "socket.arch_curve", "socket.deck_curve", "socket.pier_a", "socket.pier_b",
      "socket.lantern", "socket.lamp",
      "socket.niche.deviceIntegrity", "socket.niche.biometric", "socket.niche.secureStore",
      "socket.niche.auth", "socket.niche.netlog", "socket.niche.charts",
      "socket.niche.store", "socket.niche.secretsPattern",
    ],
  },
  {
    id: "doori-ghat",
    expectedNodes: [
      "GhatTop", "Parapet", "SurveyPillar", "SchemaPillarBase", "SchemaBand",
      "socket.flights_top", "socket.hero_stone",
      "socket.stream_edge_l", "socket.stream_edge_r",
      "socket.schema_bands_start", "socket.schema_pitch",
    ],
  },
  {
    id: "gaddi-ghat",
    expectedNodes: [
      "GaddiSeat", "JharokhaFrame", "JharokhaLattice", "ChhatriCanopy", "socket.flights_top",
    ],
  },
  {
    id: "ghat-kit",
    expectedNodes: ["Step", "Landing", "socket.step_pitch", "ChhatriPavilion"],
  },
  {
    id: "tara-kund-observatory",
    expectedNodes: ["TierRing", "BasePlinth", "Dome", "socket.tier_pitch", "socket.starfield"],
  },
];

describe("kitSockets.audit (P2-07e: keystone bridge, Doori ghat, Gaddi ghat, ghat-kit, Tara Kund)", () => {
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

  it("no kit node name bakes a data-record count (e.g. no bell.67), pre-existing fixed sockets exempt", () => {
    for (const kit of KITS) {
      const path = join(MODELS_DIR, `${kit.id}.glb`);
      if (!existsSync(path)) continue;
      const doc = readGlb(path);
      for (const name of doc.nodeNames) {
        if (PRE_EXISTING_FIXED_SUFFIX.test(name)) continue;
        expect(name, `${kit.id}.glb node "${name}" looks like a baked data count`).not.toMatch(
          DATA_COUNT_SUFFIX,
        );
      }
    }
  });

  it("sangam-keystone-bridge has exactly 8 dry-niche sockets, one per zero-consumer module", () => {
    const path = join(MODELS_DIR, "sangam-keystone-bridge.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    const niches = doc.nodeNames.filter((n) => n.startsWith("socket.niche."));
    expect(niches).toHaveLength(8);
    expect(doc.nodeNames).toContain("DryNiche");
  });

  it("doori-ghat's schema pillar is distinct from the survey pillar and carries a growing-count pitch socket", () => {
    const path = join(MODELS_DIR, "doori-ghat.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    expect(doc.nodeNames).toContain("SurveyPillar");
    expect(doc.nodeNames).toContain("SchemaPillarBase");
    expect(doc.nodeNames).toContain("SchemaBand");
    // No baked "schema.NN" band count anywhere — only the pitch + start anchor.
    expect(doc.nodeNames.filter((n) => /^schema\.\d+$/.test(n))).toHaveLength(0);
  });

  it("tara-kund-observatory materials are only moon-white and ground (no amber, cyan or green material; world-v2-spec §5.19)", () => {
    const path = join(MODELS_DIR, "tara-kund-observatory.glb");
    if (!existsSync(path)) return;
    const doc = readGlb(path);
    expect(doc.materialNames.sort()).toEqual(["mat.groundDeep", "mat.moonWhite"]);
    for (const name of doc.materialNames) {
      expect(name.toLowerCase()).not.toMatch(/amber|cyan|green/);
    }
  });
});
