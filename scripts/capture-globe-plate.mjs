// Captures /globe's no-WebGL static fallback (living-ledger-spec.md#6.3):
// "heavy/globe/plates/globe-{720,1440}.avif plus the same facts as a list."
// Run after a build, against a running preview server:
//
//   npm run build && npm run serve &
//   node scripts/capture-globe-plate.mjs [--base http://localhost:4173]
//
// One screenshot, two widths: a 1440-wide capture and a 720-wide resize of
// the SAME frame, rather than two separate page loads: /globe's SSR/no-WebGL
// branch renders the same fact list at both widths (routes/globe.tsx has no
// responsive layout swap), so capturing once and resizing is the same pixels
// for less work, the same reasoning distSize.test.ts's sibling scripts use
// for their own derivative images (gen-images.mjs).
//
// Writes heavy/globe/plates/manifest.json alongside the plates: a sha256 of
// globeFacts (globeRows.ts), the exact G15-G17 inputs the plate depicts,
// so globePlateFreshness.test.ts can tell a stale plate from a fresh one
// without ever comparing against a LIVE count (the spec's own line: "the
// plate never claims a live number"). This is a MANUAL generator, the same
// category as globe-earth, normals, starfield and river (living-ledger-spec
// §13 / G13's own exemption): run by hand at lane close, never registered in
// the automated build pipeline, so it carries no AUTO-GENERATED stamp and is
// not subject to freshness.test.ts's discovery.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { globeFacts } from "../src/world/globe/globeRows.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "heavy", "globe", "plates");
const base = (process.argv.find((a) => a.startsWith("--base="))?.split("=")[1]) ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 4173}`;

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
await page.goto(`${base}/globe`, { waitUntil: "networkidle" });
const shot = await page.screenshot({ type: "png" });
await browser.close();

for (const width of [1440, 720]) {
  const file = join(outDir, `globe-${width}.avif`);
  await sharp(shot).resize({ width }).avif({ quality: 55 }).toFile(file);
  console.log(`[capture-globe-plate] wrote ${file.slice(root.length + 1)}`);
}

const hash = createHash("sha256").update(JSON.stringify(globeFacts)).digest("hex");
const manifestPath = join(outDir, "manifest.json");
writeFileSync(
  manifestPath,
  JSON.stringify({ hash, note: "sha256 of globeRows.ts's globeFacts (G15-G17 inputs); see globePlateFreshness.test.ts" }, null, 2) + "\n",
);
console.log(`[capture-globe-plate] wrote ${manifestPath.slice(root.length + 1)} (hash ${hash.slice(0, 12)}…)`);
