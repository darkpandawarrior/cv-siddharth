#!/usr/bin/env node
// Fetches World v2 texture + HDRI source assets from Poly Haven, converts to
// webp (sharp) at the spec resolutions, and writes heavy/world/textures/ +
// heavy/world/ASSETS.md + heavy/world/assets.json. Idempotent: skips any
// output file that already exists. See scratchpad/world-v2-spec.md §9.
//
// P2-07c also uses this file for three CC0 Poly Haven *models* (fern_02,
// rock_moss_set_01, brass_diya_lantern): world-v2-spec.md §6 wants them
// "1k, gltf-transform resize 512 && webp". Raw source downloads land in
// heavy/world/models/polyhaven/<id>/ (already gitignored, regenerable);
// the repacked, gltfpack-compressed result is the committed
// heavy/world/models/<id>.glb. Both gltf-transform and gltfpack run only
// through exact-pinned npx (never added to package.json, world-v2-spec.md
// §5, master-plan.md#M68) so a determinism double-run stays meaningful.
import { mkdir, writeFile, stat, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = "heavy/world/textures";
const RAW_MODELS_DIR = "heavy/world/models/polyhaven";
const MODELS_OUT = "heavy/world/models";
const API = "https://api.polyhaven.com/files";
const PAGE = (id) => `https://polyhaven.com/a/${id}`;

// id -> [width, ...] to emit. "512 only" assets get just [512].
const TEXTURES = [
  { id: "brown_mud_dry", use: "terrain splat R: red soil", sizes: [1024, 512] },
  { id: "withered_grass", use: "terrain splat G: grass banks at the end of the monsoon", sizes: [1024, 512] },
  { id: "rock_pitted_mossy", use: "terrain splat B: laterite cliffs where slope > 32 degrees", sizes: [1024, 512] },
  { id: "ganges_river_pebbles", use: "terrain splat A: riverbed and shoreline below water+0.4 m", sizes: [1024, 512] },
  { id: "forest_leaves_02", use: "ground under the canopy (aAux.x mask under banyans)", sizes: [1024, 512] },
  { id: "large_sandstone_blocks_01", use: "mat.sandstone: ghat steps, bridge voussoirs, hero stones", sizes: [1024, 512] },
  { id: "white_sandstone_blocks_02", use: "mat.paleStone: deepmal, baori, yantra, bridge piers", sizes: [1024, 512] },
  { id: "white_plaster_02", use: "mat.plaster: whitewashed chhatris, shrine walls, houses", sizes: [1024, 512] },
  { id: "roof_09", use: "mat.roofTile: riverside and old-town house roofs", sizes: [1024, 512] },
  { id: "weathered_brown_planks", use: "mat.planks: hodi hull, jetties, mooring posts, rahat wheel", sizes: [1024, 512] },
  { id: "bark_brown_02", use: "mat.bark: banyan, neem, aerial roots", sizes: [1024, 512] },
  { id: "palm_tree_bark", use: "mat.palmBark: palm trunks (mid-distance)", sizes: [512] },
];

const HDRI = {
  id: "kloppenheim_06_puresky",
  use: "offline only: Blender lighting for the foliage atlas bake and lookdev renders (no runtime HDRI; the sky dome is PMREM'd)",
};

const MODELS = [
  { id: "fern_02", use: "fern clumps, T1 near-field scatter (world-v2-spec.md §6)" },
  { id: "rock_moss_set_01", use: "riverbank boulders (world-v2-spec.md §6)" },
  { id: "brass_diya_lantern", use: "boat-bow + keystone lantern prop (world-v2-spec.md §6)" },
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function sizeOf(p) {
  return (await stat(p)).size;
}

/** Downloads a Poly Haven map's 1k jpg once, resizes down for every requested size. */
async function processMap(id, mapKey, suffix, quality, sizes, files) {
  const filesMeta = await fetchJson(`${API}/${id}`);
  const entry = filesMeta[mapKey]?.["1k"]?.jpg;
  if (!entry) throw new Error(`${id}: no 1k jpg for ${mapKey}`);

  const outPaths = sizes.map((w) => path.join(OUT_DIR, `${id}_${suffix}_${w}.webp`));
  const missing = outPaths.filter((p) => !existsSync(p));
  if (missing.length === 0) {
    for (const [i, w] of sizes.entries()) files.push({ path: outPaths[i], width: w, bytes: await sizeOf(outPaths[i]) });
    return;
  }

  const raw = await fetchBuffer(entry.url);
  for (const [i, w] of sizes.entries()) {
    const outPath = outPaths[i];
    if (!existsSync(outPath)) {
      await sharp(raw).resize(w, w).webp({ quality }).toFile(outPath);
    }
    files.push({ path: outPath, width: w, bytes: await sizeOf(outPath) });
  }
}

async function processTexture(t) {
  const files = [];
  await processMap(t.id, "Diffuse", "c", 80, t.sizes, files);
  await processMap(t.id, "nor_gl", "n", 90, t.sizes, files);
  return { id: t.id, use: t.use, sourceUrl: PAGE(t.id), licence: "CC0", files };
}

async function processHdri(h) {
  const outPath = path.join(OUT_DIR, `${h.id}_1k.hdr`);
  if (!existsSync(outPath)) {
    const filesMeta = await fetchJson(`${API}/${h.id}`);
    const entry = filesMeta.hdri?.["1k"]?.hdr;
    if (!entry) throw new Error(`${h.id}: no 1k hdr`);
    const raw = await fetchBuffer(entry.url);
    await writeFile(outPath, raw);
  }
  return { id: h.id, use: h.use, sourceUrl: PAGE(h.id), licence: "CC0", files: [{ path: outPath, width: 1024, bytes: await sizeOf(outPath) }] };
}

/** Downloads a Poly Haven *model*'s 1k gltf + its included .bin/textures into
 * heavy/world/models/polyhaven/<id>/ (gitignored raw source), mirroring
 * fetch-polyhaven-models.py's endpoint shape (api.polyhaven.com/files/<id>
 * -> .gltf["1k"].gltf, with .include for the sibling files). Idempotent. */
async function fetchModelSource(id) {
  const outDir = path.join(RAW_MODELS_DIR, id);
  const meta = await fetchJson(`${API}/${id}`);
  const entry = meta.gltf?.["1k"]?.gltf;
  if (!entry) throw new Error(`${id}: no 1k gltf`);
  const gltfPath = path.join(outDir, path.basename(entry.url));
  const allFiles = { ...entry.include, [path.basename(entry.url)]: entry };
  for (const [rel, f] of Object.entries(allFiles)) {
    const dest = path.join(outDir, rel);
    if (existsSync(dest)) continue;
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await fetchBuffer(f.url));
  }
  return gltfPath;
}

/** Runs a pinned dev tool through npx, never added to package.json (K1,
 * world-v2-spec.md §5, master-plan.md#M68). Exact pins only, so the
 * determinism double-run stays meaningful (A4). */
function runPinnedNpx(pkgAtVersion, args) {
  execFileSync("npx", ["-y", pkgAtVersion, ...args], { stdio: "inherit" });
}

/** Poly Haven model -> committed heavy/world/models/<id>.glb: resize
 * textures to 512, recompress as webp (both via the pinned
 * @gltf-transform/cli), then meshopt-pack with the pinned gltfpack. */
async function repackModel(m) {
  const finalPath = path.join(MODELS_OUT, `${m.id}.glb`);
  if (!existsSync(finalPath)) {
    const gltfPath = await fetchModelSource(m.id);
    const tmp = await mkdtemp(path.join(os.tmpdir(), `polyhaven-${m.id}-`));
    try {
      const resized = path.join(tmp, "resized.glb");
      const webp = path.join(tmp, "webp.glb");
      runPinnedNpx("@gltf-transform/cli@4.5.0", ["resize", gltfPath, resized, "--width", "512", "--height", "512"]);
      runPinnedNpx("@gltf-transform/cli@4.5.0", ["webp", resized, webp]);
      await mkdir(MODELS_OUT, { recursive: true });
      runPinnedNpx("gltfpack@1.2.0", ["-cc", "-kn", "-i", webp, "-o", finalPath]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  return { id: m.id, use: m.use, sourceUrl: PAGE(m.id), licence: "CC0", files: [{ path: finalPath, bytes: await sizeOf(finalPath) }] };
}

const ELEVATION_LINE =
  "Elevation texture: SRTM/GMTED2010 via AWS Terrain Tiles (USGS, public domain)";

// Hand-authored, but kept HERE (not typed straight into ASSETS.md) so a
// re-run of this generator can never silently delete it again: this file's
// `main()` rewrites heavy/world/ASSETS.md wholesale every run, and a fixed
// static tail is the only way a full-file generator preserves content it
// does not itself produce. Documents scripts/blender/world-v2/
// fetch-polyhaven-models.py's raw (gitignored) model source fetches, used
// by lookdev-spawn.py's geometry-nodes scatter -- a sibling script, not
// this lane's repacked committed GLBs in the table above.
const MODELS_SECTION = `## Models (lookdev scatter kit + props)

Fetched from Poly Haven (CC0) by \`scripts/blender/world-v2/fetch-polyhaven-models.py\` into
\`heavy/world/models/polyhaven/<id>/\` (gitignored, regenerable source, same policy as the
texture webps above; rerun the script to refetch). Used by \`lookdev-spawn.py\`'s geometry-nodes
scatter and the boat/bridge lantern props. Full "geometry nodes" tree assets (jacaranda_tree
etc.) were evaluated and rejected: their shared \`.bin\` geometry is 75-205 MB regardless of
requested texture resolution, wrong for this 16 GB machine and for a git commit. Background
tree silhouettes are built procedurally instead, same discipline as the spec's own
banyan-neem.py/palm.py.

| id | use | source | licence |
|---|---|---|---|
| fern_02 | near-field fern clumps, T1 scatter (spec §6) | [https://polyhaven.com/a/fern_02](https://polyhaven.com/a/fern_02) | CC0 |
| rock_moss_set_01 | riverbank boulders, geo-nodes scatter (spec §6) | [https://polyhaven.com/a/rock_moss_set_01](https://polyhaven.com/a/rock_moss_set_01) | CC0 |
| shrub_01 | undergrowth shrub, geo-nodes scatter | [https://polyhaven.com/a/shrub_01](https://polyhaven.com/a/shrub_01) | CC0 |
| brass_diya_lantern | boat-bow + keystone lantern prop (spec §6) | [https://polyhaven.com/a/brass_diya_lantern](https://polyhaven.com/a/brass_diya_lantern) | CC0 |
`;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const assets = [];
  for (const t of TEXTURES) {
    process.stdout.write(`${t.id}... `);
    assets.push(await processTexture(t));
    console.log("ok");
  }
  process.stdout.write(`${HDRI.id} (hdri)... `);
  assets.push(await processHdri(HDRI));
  console.log("ok");
  for (const m of MODELS) {
    process.stdout.write(`${m.id} (model)... `);
    assets.push(await repackModel(m));
    console.log("ok");
  }

  const totalBytes = assets.reduce((s, a) => s + a.files.reduce((s2, f) => s2 + f.bytes, 0), 0);

  // No generatedAt clock stamp: this file is committed, and G13 requires
  // every committed generator to be byte-identical across two runs with
  // the same inputs (never Date.now() for committed data).
  await writeFile("heavy/world/assets.json", JSON.stringify({ totalBytes, assets }, null, 2));

  const md = [
    "# World v2 texture + HDRI assets",
    "",
    "Fetched from Poly Haven (CC0) by `scripts/world-v2/fetch-polyhaven.mjs`. Re-run is idempotent (skips existing files).",
    "",
    "| id | use | source | licence | files | bytes |",
    "|---|---|---|---|---|---|",
    ...assets.map((a) => {
      const fileList = a.files.map((f) => `${path.basename(f.path)} (${f.bytes.toLocaleString("en-US")} B)`).join(", ");
      return `| ${a.id} | ${a.use} | [${a.sourceUrl}](${a.sourceUrl}) | ${a.licence} | ${fileList} | ${a.files.reduce((s, f) => s + f.bytes, 0).toLocaleString("en-US")} |`;
    }),
    "",
    `**Total: ${totalBytes.toLocaleString("en-US")} bytes (${(totalBytes / 1024 / 1024).toFixed(2)} MB)**`,
    "",
    ELEVATION_LINE,
    "",
    MODELS_SECTION,
  ].join("\n");
  await writeFile("heavy/world/ASSETS.md", md);

  console.log(`\nTotal bytes: ${totalBytes}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
