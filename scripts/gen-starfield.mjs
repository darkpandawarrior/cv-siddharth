#!/usr/bin/env node
/**
 * Writes public/sky/stars-hyg41-m5.bin from the HYG v41 star catalogue
 * (astronexus, CC BY-SA 4.0), filtered to mag <= 5.0. Manual and network
 * (a 34 MB CSV): run by hand when the catalogue needs a refresh, never from
 * `run-pipeline.mjs` or any other build-time generator (live-data-spec.md#1.3,
 * #4 R6). See public/sky/STARS-LICENSE.txt for the terms that bind the file
 * this writes.
 *
 * Usage:
 *   node scripts/gen-starfield.mjs                 # fetch HYG v41, write the bin
 *   node scripts/gen-starfield.mjs --input path.csv # read a local CSV instead
 *   node scripts/gen-starfield.mjs --check          # fixture-only, no network,
 *                                                    # no write — proves the
 *                                                    # filter+encode step is
 *                                                    # deterministic (gen-starfield.test.mjs)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeStarField } from "../src/lib/stars.ts";

const HYG_URL = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv";
const MAG_LIMIT = 5.0;
const OUT_PATH = fileURLToPath(new URL("../public/sky/stars-hyg41-m5.bin", import.meta.url));
const FIXTURE_PATH = fileURLToPath(new URL("__fixtures__/hyg-20.csv", import.meta.url));

/** Minimal RFC4180 CSV parser (quoted fields, "" escapes) — HYG's fields
 *  never contain a bare newline, so this stays a few lines instead of a
 *  dependency (G6). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Pure: CSV text in, encoded Buffer out. Filters to mag <= magLimit and
 *  drops the Sun itself (dist === 0 pc — HYG's own row 0, "Sol"), which the
 *  mag filter alone would let through at mag -26.7. */
export function buildStarField(csvText, magLimit = MAG_LIMIT) {
  const rows = parseCsv(csvText).filter((r) => r.length > 1);
  const header = rows[0];
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  const stars = [];
  for (const r of rows.slice(1)) {
    const mag = Number(r[col.mag]);
    const dist = Number(r[col.dist]);
    if (!Number.isFinite(mag) || mag > magLimit) continue;
    if (!(dist > 0)) continue; // excludes Sol (dist 0) and any other degenerate row
    const ra = Number(r[col.ra]); // hours, HYG's own unit
    const dec = Number(r[col.dec]); // degrees
    const ci = Number(r[col.ci]);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    stars.push({ raHours: ra, decDeg: dec, mag, ci: Number.isFinite(ci) ? ci : 0 });
  }
  return encodeStarField(stars);
}

async function fetchHygCsv() {
  const res = await fetch(HYG_URL);
  if (!res.ok) throw new Error(`HYG fetch failed: ${res.status}`);
  return res.text();
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const inputIdx = args.indexOf("--input");
  const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : null;

  if (check) {
    const csvText = readFileSync(FIXTURE_PATH, "utf-8");
    const a = buildStarField(csvText);
    const b = buildStarField(csvText);
    if (!a.equals(b)) {
      console.error("gen-starfield --check: non-deterministic output for the same input");
      process.exit(1);
    }
    console.log(`gen-starfield --check: OK (${(a.length - 4) / 8} stars from the 20-row fixture, byte-identical)`);
    return;
  }

  const csvText = inputPath ? readFileSync(inputPath, "utf-8") : await fetchHygCsv();
  const buf = buildStarField(csvText);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, buf);
  console.log(`gen-starfield: wrote ${buf.length} bytes, ${(buf.length - 4) / 8} stars, mag <= ${MAG_LIMIT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
