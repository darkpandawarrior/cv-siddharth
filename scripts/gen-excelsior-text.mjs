// OCRs each rendered Excelsior page into a per-edition text manifest, so the
// in-reader search can find "the page you half-remember" without shipping
// ~400 OCR'd page bodies as a TS import into every visitor's bundle.
//
// NOT part of prebuild, and NOT in check-generated.mjs's determinism list —
// same posture as gen-excelsior.mjs (a sibling, and this script's whole
// reason to exist): a manual, occasional tool whose OUTPUT is committed. It
// needs `tesseract` on PATH, a system binary this repo cannot assume a CI
// runner has, which is the same "classified by running it on a laptop"
// exclusion check-generated.mjs's own header already applies to poppler.
//
//   node scripts/gen-excelsior-text.mjs          # OCR anything missing
//   node scripts/gen-excelsior-text.mjs --force  # re-OCR everything
//
// Requires: tesseract (`brew install tesseract`).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { excelsiorEditions } from "../src/data/excelsior.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// heavy/, not public/: the asset-offload lane moved every excelsior asset
// (pages, covers) off the Vercel deploy onto GitHub Pages — see
// src/lib/assetBase.ts. This manifest is small (per-edition JSON, not the
// ~400 page images), but it ships alongside the pages it indexes, and
// distSize.test.ts's "never ships one of the five moved heavy-asset classes"
// check treats ANY public/excelsior/** survivor as a leak, not just the big
// ones.
const pagesRoot = join(root, "heavy", "excelsior", "pages");
const outRoot = join(root, "heavy", "excelsior", "text");
const force = process.argv.includes("--force");

// Uniform block of text — a reasonable default for a magazine's justified
// columns. ponytail: this is a one-line calibration knob, not a heuristic;
// if a specific edition comes back unusably garbled, re-run it by hand with
// a different --psm rather than building multi-pass PSM detection for a
// three-edition corpus.
const PSM = "6";

if (!existsSync(pagesRoot)) {
  console.log("[excelsior-text] no rendered pages under heavy/excelsior/pages — run gen-excelsior.mjs first");
  process.exit(0);
}

try {
  execFileSync("tesseract", ["--version"], { stdio: "ignore" });
} catch {
  console.error("[excelsior-text] tesseract not found on PATH. Install it: brew install tesseract");
  process.exit(1);
}

mkdirSync(outRoot, { recursive: true });

for (const ed of excelsiorEditions) {
  const dir = join(pagesRoot, ed.year);
  if (!existsSync(dir)) {
    console.log(`[excelsior-text] ${ed.year}: no rendered pages, skipping`);
    continue;
  }
  const outFile = join(outRoot, `${ed.year}.json`);
  const manifest = force || !existsSync(outFile) ? {} : JSON.parse(readFileSync(outFile, "utf8"));

  const pages = readdirSync(dir).filter((f) => f.endsWith(".webp")).sort();
  let added = 0;
  for (const file of pages) {
    const n = String(Number(file.match(/p(\d+)\.webp/)?.[1] ?? 0));
    if (!force && manifest[n]) continue;
    const raw = execFileSync("tesseract", [join(dir, file), "stdout", "--psm", PSM], {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    manifest[n] = raw.toLowerCase().replace(/\s+/g, " ").trim();
    added += 1;
  }

  writeFileSync(outFile, JSON.stringify(manifest));
  console.log(`[excelsior-text] ${ed.year}: ${added} page(s) OCR'd, ${Object.keys(manifest).length} total`);
}
