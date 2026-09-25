#!/usr/bin/env node
// Publishes the six Sangam concept-art frames (gemini-3-pro-image, USD 0.839
// for the set, 2026-09-24) from the gitignored look-dev inbox into the
// committed heavy asset root — world-v2-spec.md #9, master-plan.md #M69.
//
// Source PNGs live only in .showcase-work/concept/ (gitignored) and are
// never committed; this script is the one place that reads them. It writes,
// per frame:
//   heavy/world/concept/<name>.webp       full resolution, q90
//   heavy/world/concept/<name>-960.webp   960px wide, q90
// plus one share crop from the default frame:
//   heavy/world/concept/01-golden-spawn-og.jpg   1200x630 cover, JPEG q85
// and a manifest, heavy/world/concept/concept.json, one row per file.
//
// Deterministic (house rule, G13): createdAt is each source PNG's own
// mtime, never Date.now(), so two runs against the same source images are
// byte-identical.
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_DIR = join(root, ".showcase-work", "concept");
const OUT_DIR = join(root, "heavy", "world", "concept");

const MODEL = "gemini-3-pro-image";
const COST_USD_SET = 0.839;

// realityState matches P3-01d's pickConceptPlate order (Diwali night > rain
// > night > otherwise, master-plan.md#M69); 05 and 06 are look-dev targets
// only (G11), never the fallback plate, so they carry no reality state.
const FRAMES = [
  {
    name: "01-golden-spawn",
    caption: "Concept painting: the Sangam valley at golden hour, seen from the spawn point.",
    realityState: "default",
  },
  {
    name: "02-night-survey",
    caption: "Concept painting: the valley by night, lanterns lit along the ghats.",
    realityState: "night",
  },
  {
    name: "03-monsoon",
    caption: "Concept painting: the valley under monsoon cloud and rain.",
    realityState: "rain",
  },
  {
    name: "04-diwali",
    caption: "Concept painting: the valley at Diwali, the ghats lit for the festival.",
    realityState: "diwali",
  },
  {
    name: "05-bridge-closeup",
    caption: "Concept painting: the Sangam keystone bridge, close up.",
    realityState: null,
  },
  {
    name: "06-amphitheatre-districts",
    caption: "Concept painting: the amphitheatre and its district benches.",
    realityState: null,
  },
];

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];

  for (const frame of FRAMES) {
    const srcPath = join(SRC_DIR, `${frame.name}.png`);
    if (!existsSync(srcPath)) {
      throw new Error(`[pack-concept] missing source: ${srcPath}`);
    }
    const srcBuf = readFileSync(srcPath);
    const sourceSha256 = sha256(srcBuf);
    const createdAt = new Date(statSync(srcPath).mtimeMs).toISOString();

    const fullBuf = await sharp(srcBuf).webp({ quality: 90 }).toBuffer();
    const fullPath = join(OUT_DIR, `${frame.name}.webp`);
    writeFileSync(fullPath, fullBuf);
    rows.push({
      file: `${frame.name}.webp`,
      bytes: fullBuf.length,
      sha256: sha256(fullBuf),
      sourceSha256,
      model: MODEL,
      costUsdSet: COST_USD_SET,
      createdAt,
      realityState: frame.realityState,
      caption: frame.caption,
    });

    const smallBuf = await sharp(srcBuf).resize({ width: 960 }).webp({ quality: 90 }).toBuffer();
    const smallPath = join(OUT_DIR, `${frame.name}-960.webp`);
    writeFileSync(smallPath, smallBuf);
    rows.push({
      file: `${frame.name}-960.webp`,
      bytes: smallBuf.length,
      sha256: sha256(smallBuf),
      sourceSha256,
      model: MODEL,
      costUsdSet: COST_USD_SET,
      createdAt,
      realityState: frame.realityState,
      caption: frame.caption,
    });

    if (frame.name === "01-golden-spawn") {
      const ogBuf = await sharp(srcBuf)
        .resize(1200, 630, { fit: "cover", position: "centre" })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      const ogPath = join(OUT_DIR, "01-golden-spawn-og.jpg");
      writeFileSync(ogPath, ogBuf);
      rows.push({
        file: "01-golden-spawn-og.jpg",
        bytes: ogBuf.length,
        sha256: sha256(ogBuf),
        sourceSha256,
        model: MODEL,
        costUsdSet: COST_USD_SET,
        createdAt,
        realityState: frame.realityState,
        caption: "Share-preview crop of the golden-spawn concept painting.",
      });
    }
  }

  writeFileSync(join(OUT_DIR, "concept.json"), JSON.stringify(rows, null, 2));
  console.log(`[pack-concept] wrote ${rows.length} rows (${FRAMES.length} frames) -> heavy/world/concept/`);
}

main().catch((err) => {
  console.error("[pack-concept] failed:", err);
  process.exit(1);
});
