#!/usr/bin/env node
// Fetches World v2 texture + HDRI source assets from Poly Haven, converts to
// webp (sharp) at the spec resolutions, and writes heavy/world/textures/ +
// heavy/world/ASSETS.md + heavy/world/assets.json. Idempotent: skips any
// output file that already exists. See scratchpad/world-v2-spec.md §9.
import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = "heavy/world/textures";
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

  const totalBytes = assets.reduce((s, a) => s + a.files.reduce((s2, f) => s2 + f.bytes, 0), 0);

  await writeFile("heavy/world/assets.json", JSON.stringify({ generatedAt: new Date().toISOString(), totalBytes, assets }, null, 2));

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
  ].join("\n");
  await writeFile("heavy/world/ASSETS.md", md);

  console.log(`\nTotal bytes: ${totalBytes}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
