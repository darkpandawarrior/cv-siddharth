// scripts/world-v2/gen-terrain.mjs
//
// Deterministic terrain generator for World v2 ("Sangam") — world-v2-spec.md
// §3, amended by living-ledger-spec.md §3.3/§3.5 and online-tools-spec.md §A1
// (master-plan.md#M5/M33/M55/M67/M68). Reads real committed data through
// `src/world/v2/valley.ts` (the single layout source — P2-03b) and
// `src/world/v2/ledger.ts` (the single real-data source for everything
// valley.ts does not itself expose: the chess ridge's peaks, the west
// terraces' work-lane level, the east meadow's writing-lane year totals),
// plus this lane's own `real-relief.mjs` for the real micro-relief beyond
// 60m of any water. Writes:
//   heavy/world/terrain/valley-h-513.png(+.json)   — 1.5 m/texel, first view + mobile
//   heavy/world/terrain/valley-h-1025.png(+.json)  — 0.75 m/texel, desktop upgrade
//   heavy/world/terrain/valley-flow-1024.webp      — RG flow dir, B foam, A channel id
//   heavy/world/terrain/LICENSE-ODbL.txt
// plus a QA preview (gitignored, never a build artefact) at
//   .showcase-work/world-v2/terrain-preview.png
//
// This lane deletes the old per-generator pure-math module (M5/M68): every
// number this generator places on the ground now traces through valley.ts
// or ledger.ts, never a second, drifting copy of the same math.
//
// HONESTY NOTE (same discipline as the old generator's own, and
// real-relief.mjs's): sharp 0.35.4's raw-input `depth: 'ushort'` path does
// not round-trip correctly in this environment, so both heightmaps take the
// sanctioned fallback — an 8-bit PNG plus {min,max} JSON, from which the
// real height is `min + (pixel/255)*(max-min)`.
//
// Splat (aSplat/aAux) is NOT baked here — world-v2-spec §3 bakes it per
// vertex, at load, in a web worker (`splat.worker.ts`, this lane) from the
// heightmap's own neighbourhood plus REC-6's real filesChanged lookup. This
// generator's job ends at real geometry and real flow; the worker's job is
// real surface.

import { writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as V from "../../src/world/v2/valley.ts";
import { ledger } from "../../src/world/v2/ledger.ts";
import { zToYear } from "../../src/world/city.ts";
import { loadRelief, realRelief, RESIDUAL_JSON } from "./real-relief.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "heavy", "world", "terrain");
const PREVIEW_PNG = join(root, ".showcase-work", "world-v2", "terrain-preview.png");

// Files superseded by this lane's rewrite (the old, single-resolution
// baked-splat scheme) — cleaned up so heavy/world/terrain/** holds only
// what the current generator actually produces (this lane owns the whole
// directory; a stale asset nothing writes any more is dead weight, not an
// API).
const OBSOLETE_FILES = [
  "heightmap.png",
  "heightmap.json",
  "splat.png",
  "splat-legend.json",
  "river-spline.json",
  "tributaries.json",
  "districts.json",
];

const INPUT_FILES = [
  join(root, "src/world/v2/valley.ts"),
  join(root, "src/world/v2/ledger.ts"),
  join(root, "src/world/v2/grammar.ts"),
  join(root, "src/world/city.ts"),
  join(root, "src/data/osm/mutha.json"),
  join(root, "src/data/timeline.ts"),
  join(root, "src/data/chess.ts"),
  join(root, "src/data/history.ts"),
  join(root, "src/data/systemGraph.ts"),
  join(root, "src/data/projectStats.ts"),
  join(root, "scripts/world-v2/real-relief.mjs"),
  RESIDUAL_JSON,
  fileURLToPath(import.meta.url),
].filter(existsSync);

function smooth01(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// ── z <-> ym, replicated from valley.ts's own private nearestYm (not
// exported; that module's own ownership lane, not this one's, and this is
// ~8 lines of pure arithmetic, not worth an ownership edit for) ───────────
function yearFracToYm(yearFrac) {
  const y = Math.floor(yearFrac);
  const m = Math.min(12, Math.max(1, Math.round((yearFrac - y) * 12) + 1));
  return `${y}-${String(m).padStart(2, "0")}`;
}
function nearestYm(z, months) {
  const ym = yearFracToYm(zToYear(z / V.VALLEY_SCALE));
  if (ym < months[0]) return months[0];
  if (ym > months[months.length - 1]) return months[months.length - 1];
  return ym;
}

/** Distance from (x,z) to the straight segment a->b, xz plane — the one
 *  piece of geometry the old per-generator math module carried that
 *  valley.ts does not itself expose (it only needs the segment endpoints,
 *  not this scan, to build `Tributary` rows). */
function distToSegment(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(x - a.x, z - a.z);
  let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
}

// ── G9 chess ridge (amended): a pure step function of `ym`, never
// interpolated — living-ledger §3.3 G9, idea-atlas REC-4/REC-6. ───────────
const RIDGE_RATING_MIN = 800;
const RIDGE_RATING_MAX = 3200;
const RIDGE_H_MIN = 30;
const RIDGE_H_MAX = 140;
/** The Jan-2023 lichess -> chess.com handoff (idea-atlas REC-4): the L2 GLB
 *  marker's twin in the world, a notch cut into the ridge at that month.
 *  2023-01 is already one of the six recorded peak months (chess.com
 *  bullet, 2023-01-26), so this never introduces a height change outside a
 *  recorded peak month — it deepens the one already there. */
const NOTCH_YM = "2023-01";
const NOTCH_DEPTH = 14;

const RIDGE_PEAKS = ledger.chess.platforms
  .flatMap((p) => p.peaks.map((peak) => ({ rating: peak.rating, ym: peak.at.slice(0, 7) })))
  .sort((a, b) => a.ym.localeCompare(b.ym));

function ratingToRidgeHeight(rating) {
  const t = Math.min(1, Math.max(0, (rating - RIDGE_RATING_MIN) / (RIDGE_RATING_MAX - RIDGE_RATING_MIN)));
  return RIDGE_H_MIN + t * (RIDGE_H_MAX - RIDGE_H_MIN);
}

/** Ridge crest height at a recorded month: the running max rating across
 *  every peak recorded by that month (holds flat between, per G9), with the
 *  REC-4 notch subtracted exactly at the handoff month. Pure function of
 *  `ym` — the reason the acceptance test can assert it changes only at
 *  recorded peak months. */
export function ridgeCrestHeightAtYm(ym) {
  let maxRating = 0;
  for (const p of RIDGE_PEAKS) if (p.ym <= ym) maxRating = Math.max(maxRating, p.rating);
  let h = ratingToRidgeHeight(maxRating);
  if (ym === NOTCH_YM) h -= NOTCH_DEPTH;
  return h;
}

async function main() {
  await loadRelief(); // hard dependency — no silent fallback to fbm (online-tools-spec §A1)

  const generatedAt = new Date(Math.max(...INPUT_FILES.map((f) => statSync(f).mtimeMs))).toISOString();

  const basin = V.sangamBasin();
  const trib = V.tributaries(); // real includeBuild sources — also this lane's district anchors (x,z)
  const districts = V.districtAnchors(
    trib.map((t) => t.id),
    basin,
  ); // same ids, same order as tributaries() used internally -> same x,z, plus y

  const workLane = ledger.timeline.lanes.find((l) => l.key === "work");
  const writingLane = ledger.timeline.lanes.find((l) => l.key === "writing");
  // East meadow amendment (living-ledger §3.5): the writing lane reads at
  // YEAR resolution, never month-to-month — one total per year, applied
  // uniformly across that year's z-span.
  const writingYearTotal = new Map();
  for (const ym of ledger.timeline.months) {
    const year = ym.slice(0, 4);
    writingYearTotal.set(year, (writingYearTotal.get(year) ?? 0) + (writingLane.months[ym] ?? 0));
  }

  /** The amended height function — world-v2-spec §3, steps 1-8. */
  function heightAt(x, z) {
    const ym = nearestYm(z, ledger.timeline.months);
    const riverWidth = V.riverWidthAtZ(z);
    const riverDepth = V.riverDepth(riverWidth);

    // step 1: base valley, capped at 60 — V.distanceToRiver is the real
    // Mutha shape (valley.ts, amended off the old sinusoid).
    const dRiver = V.distanceToRiver(x, z);
    let h = Math.min(60, 3 + 0.004 * dRiver * dRiver);

    // step 2: carve the channel to -depth inside width/2, 4m smoothstep bank
    {
      const half = riverWidth / 2;
      if (dRiver <= half) {
        h = -riverDepth;
      } else if (dRiver < half + 4) {
        const t = (dRiver - half) / 4;
        h = -riverDepth + (h - -riverDepth) * smooth01(t);
      }
    }

    // step 3: west terraces (work lane, stepped 0.6m risers) — unchanged
    if (x < 0 && dRiver > riverWidth / 2 + 4) {
      const workLevel = workLane.months[ym] ?? 0;
      const riser = 0.6;
      h += Math.round((workLevel / 40) * riser * 4) * riser * 0.25;
    }

    // step 4: east meadow, banded — amended to the writing lane's YEAR total
    if (x > 0 && dRiver > riverWidth / 2 + 4) {
      const yearTotal = writingYearTotal.get(ym.slice(0, 4)) ?? 0;
      h += Math.min(6, yearTotal * 0.05);
    }

    // step 5: Sangam amphitheatre bowl + district benches
    const dBasin = Math.hypot(x - basin.x, z - basin.z);
    if (dBasin < basin.r) {
      const t = dBasin / basin.r;
      h = h * t + 2 * (1 - t);
    }
    for (const d of districts) {
      const dd = Math.hypot(x - d.x, z - d.z);
      if (dd < 14) {
        const t = dd / 14;
        h = h * t + d.y * (1 - t);
      }
    }

    // step 6: tributary channels, straight from district bench to basin
    let dTrib = Infinity;
    let tribWidth = 0;
    for (const t of trib) {
      const dd = distToSegment(x, z, t.from, t.to);
      if (dd < dTrib) {
        dTrib = dd;
        tribWidth = t.width;
      }
    }
    if (dTrib <= tribWidth / 2) {
      h = Math.min(h, 1);
    } else if (dTrib < tribWidth / 2 + 2) {
      const t = (dTrib - tribWidth / 2) / 2;
      h = Math.min(h, 1 + (h - 1) * smooth01(t));
    }

    // step 7: real relief only, beyond 60m from any water — never fbm
    // (online-tools-spec §A1; the data-bearing relief above is never noised)
    const distWater = Math.min(dRiver - riverWidth / 2, dTrib - tribWidth / 2);
    if (distWater > 60) {
      h += realRelief(x, z) * 8;
    }

    // step 8: chess ridge (G9, amended) — a pure step function of `ym`,
    // continued into the far ring at the same z.
    if (x >= 300) {
      const ridgeH = ridgeCrestHeightAtYm(ym);
      const blend = smooth01((x - 300) / 30);
      h = h * (1 - blend) + ridgeH * blend;
    }

    return { h, dRiver, riverWidth, dTrib, tribWidth, distWater };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const name of OBSOLETE_FILES) {
    const p = join(OUT_DIR, name);
    if (existsSync(p)) rmSync(p);
  }

  await writeHeightmap(513, heightAt, generatedAt);
  await writeHeightmap(1025, heightAt, generatedAt);
  await writeFlowMap(1024, heightAt, trib, basin);
  writeFileSync(join(OUT_DIR, "LICENSE-ODbL.txt"), LICENSE_TEXT);

  console.log(`[gen-terrain] ${trib.length} tributaries, ${districts.length} districts -> ${OUT_DIR}`);
}

async function writeHeightmap(grid, heightAt, generatedAt) {
  const step = V.EXTENT / (grid - 1);
  const heights = new Float32Array(grid * grid);
  let hMin = Infinity;
  let hMax = -Infinity;
  for (let gz = 0; gz < grid; gz++) {
    const z = V.BOUNDS.zMin + gz * step;
    for (let gx = 0; gx < grid; gx++) {
      const x = V.BOUNDS.xMin + gx * step;
      const { h } = heightAt(x, z);
      heights[gz * grid + gx] = h;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }
  const pixels = new Uint8Array(grid * grid);
  const range = hMax - hMin || 1;
  for (let i = 0; i < heights.length; i++) pixels[i] = Math.round(((heights[i] - hMin) / range) * 255);

  const name = `valley-h-${grid}`;
  const png = await sharp(Buffer.from(pixels), { raw: { width: grid, height: grid, channels: 1 } })
    .greyscale()
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(OUT_DIR, `${name}.png`), png);
  writeFileSync(
    join(OUT_DIR, `${name}.json`),
    JSON.stringify(
      {
        generatedAt,
        grid,
        metresPerTexel: step,
        extent: V.EXTENT,
        center: V.CENTER,
        bounds: V.BOUNDS,
        min: hMin,
        max: hMax,
        note: "real height = min + (pixel/255) * (max-min); 8-bit fallback, see this file's honesty note",
      },
      null,
      2,
    ),
  );
}

/** valley-flow-1024.webp — R/G flow direction (along the river tangent or a
 *  tributary's own straight bearing), B foam (shoreline + confluence
 *  collars), A channel id (0 main, 1..6 tributary — world-v2-spec §3). */
async function writeFlowMap(grid, heightAt, trib, basin) {
  const step = V.EXTENT / (grid - 1);
  const rgba = new Uint8Array(grid * grid * 4);
  const eps = step;
  for (let gz = 0; gz < grid; gz++) {
    const z = V.BOUNDS.zMin + gz * step;
    for (let gx = 0; gx < grid; gx++) {
      const x = V.BOUNDS.xMin + gx * step;
      const idx = gz * grid + gx;
      const { dRiver, riverWidth, dTrib, tribWidth, distWater } = heightAt(x, z);

      let dirX;
      let dirZ;
      let channelId;
      if (dRiver <= dTrib) {
        // main river: flow tangent along x(z), always advancing +Z
        const dx = (V.riverX(z + eps) - V.riverX(z - eps)) / (2 * eps);
        const len = Math.hypot(dx, 1);
        dirX = dx / len;
        dirZ = 1 / len;
        channelId = 0;
      } else {
        // nearest tributary: constant bearing from its own anchor to the basin
        let nearest = trib[0];
        let best = Infinity;
        for (let i = 0; i < trib.length; i++) {
          const d = distToSegment(x, z, trib[i].from, trib[i].to);
          if (d < best) {
            best = d;
            nearest = trib[i];
          }
        }
        const dx = nearest.to.x - nearest.from.x;
        const dz = nearest.to.z - nearest.from.z;
        const len = Math.hypot(dx, dz) || 1;
        dirX = dx / len;
        dirZ = dz / len;
        channelId = (trib.indexOf(nearest) % 6) + 1;
      }

      // foam: shoreline band (peaks right at the bank, fades within ~3m)
      // plus a confluence collar around the Sangam basin rim.
      const shoreline = 1 - smooth01(Math.max(0, distWater) / 3);
      const dBasin = Math.hypot(x - basin.x, z - basin.z);
      const confluence = 1 - smooth01(Math.abs(dBasin - basin.r) / 10);
      const foam = Math.max(shoreline, confluence * 0.8);

      rgba[idx * 4 + 0] = Math.round((dirX * 0.5 + 0.5) * 255);
      rgba[idx * 4 + 1] = Math.round((dirZ * 0.5 + 0.5) * 255);
      rgba[idx * 4 + 2] = Math.round(Math.min(1, Math.max(0, foam)) * 255);
      rgba[idx * 4 + 3] = Math.round((channelId / 6) * 255);
    }
  }
  const webp = await sharp(Buffer.from(rgba), { raw: { width: grid, height: grid, channels: 4 } })
    .webp({ quality: 92, lossless: false })
    .toBuffer();
  writeFileSync(join(OUT_DIR, "valley-flow-1024.webp"), webp);
}

const LICENSE_TEXT = `heavy/world/terrain — ODbL 1.0
================================

The heightmaps and flow map in this directory are derived from OpenStreetMap
data (the Mutha river course, src/data/osm/mutha.json, fetched by
scripts/gen-river-osm.mjs) through scripts/world-v2/gen-terrain.mjs, and are
offered under the Open Database Licence 1.0 (ODbL), with attribution to
OpenStreetMap contributors: (c) OpenStreetMap contributors,
https://www.openstreetmap.org/copyright.

Relief: SRTM/GMTED2010 via AWS Terrain Tiles (USGS, public domain), sampled
near Vetal Tekdi.
`;

// Run only when invoked directly (`node scripts/world-v2/gen-terrain.mjs`),
// never as a side effect of importing this module for its pure
// `ridgeCrestHeightAtYm` export (gen-terrain.test.mjs) — the old generator
// had no such guard, but that only ever mattered because nothing imported
// it for anything but running it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[gen-terrain] failed:", err);
    process.exitCode = 1;
  });
}
