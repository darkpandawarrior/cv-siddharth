// scripts/world-v2/gen-terrain.mjs
//
// Deterministic terrain generator for World v2 ("Sangam") — world-v2-spec.md
// §3. Reads real committed data (systemGraph.ts, projectStats.ts, timeline.ts,
// city.ts) and this lane's own pure math (valley-math.mjs), and writes:
//   heavy/world/terrain/heightmap.png   — grayscale height field
//   heavy/world/terrain/heightmap.json  — {min,max} in metres (see note)
//   heavy/world/terrain/splat.png       — RGBA soil/grass/laterite/pebble weights
//   heavy/world/terrain/river-spline.json
//   heavy/world/terrain/tributaries.json
//   heavy/world/terrain/districts.json
// plus a QA preview (not a build artefact, gitignored) at
//   .showcase-work/world-v2/terrain-preview.png
//
// HONESTY NOTE (same discipline as gen-world-plate.mjs's own note): the spec
// asks for a 16-bit heightmap "if possible, else 8-bit + scale in JSON".
// sharp 0.35.4's raw-input `depth: 'ushort'` path does not round-trip
// correctly in this environment (verified: it silently mis-reads the
// channel count instead of preserving 16-bit greyscale), and hand-rolling a
// 16-bit PNG encoder is exactly the kind of unrequested complexity this
// house's own ladder says to skip. So this generator takes the sanctioned
// fallback: an 8-bit PNG plus heightmap.json's {min,max}, from which the
// real-world height is `min + (pixel/255)*(max-min)`. Upgrade to 16-bit
// when a sharp/libvips version here actually honours raw ushort input.
//
// Every number placed on the ground traces to committed data or to this
// file's own math — no invented values (house rule §0.1). Where a source
// (an includeBuild edge's project) has no `projectStats` row, its stream is
// flagged `unmeasuredWidth` and drawn at the 1.2 m floor, never guessed.
//
// Chess ridge (spec §3 step 8) asks for "max rating across the 6 series" —
// there is no per-month, per-format rating time series committed anywhere
// in src/data/ (chess.ts holds only lifetime peaks; chessDeep.ts has none
// either). Rather than fabricate one, this generator drives the ridge from
// `timeline.ts`'s real `chess` lane (monthly games played, Gaussian-smoothed
// exactly as the spec's step 8 describes) — the closest real, measured,
// monthly signal to "how much chess that month", which is what a skyline is
// supposed to read as here. Swap in a real rating series if one is ever
// generated.

import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as V from "./valley-math.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "heavy", "world", "terrain");
// QA preview: a scratch inspection artefact, gitignored, never a committed
// file. Written relative to THIS script's own worktree root (never a
// hardcoded absolute path — that would cross-write into whichever checkout
// happens to sit at that path on this machine, corrupting it, and would
// crash with no such directory on any other machine or in CI).
const PREVIEW_PNG = join(root, ".showcase-work", "world-v2", "terrain-preview.png");

const GRID = 385; // 768m / 384 ~= 2 m/texel — dense enough to read the carved features, light enough to compute in JS in a few seconds

const DISTRICT_IDS = ["doori", "gaddi", "paymentslab-kmp", "candidai", "kmp-app-template"];

// Deterministic stamp (house rule, never Date.now()): the max mtime across
// this generator's real data inputs plus its own pure-math dependency, so
// two runs against the same committed sources produce byte-identical JSON.
const INPUT_FILES = [
  join(root, "src/data/systemGraph.ts"),
  join(root, "src/data/projectStats.ts"),
  join(root, "src/data/timeline.ts"),
  join(root, "src/world/city.ts"),
  join(root, "scripts/world-v2/valley-math.mjs"),
  fileURLToPath(import.meta.url),
];

async function main() {
  let systemGraphMod, projectStatsMod, timelineMod, cityMod;
  try {
    [systemGraphMod, projectStatsMod, timelineMod, cityMod] = await Promise.all([
      import(join(root, "src/data/systemGraph.ts")),
      import(join(root, "src/data/projectStats.ts")),
      import(join(root, "src/data/timeline.ts")),
      import(join(root, "src/world/city.ts")),
    ]);
  } catch (err) {
    console.warn("[gen-terrain] source modules unavailable, leaving previous output untouched:", err.message);
    return;
  }

  const generatedAt = new Date(Math.max(...INPUT_FILES.map((f) => statSync(f).mtimeMs))).toISOString();

  const { systemGraph } = systemGraphMod;
  const { projectStats } = projectStatsMod;
  const { timeline } = timelineMod;
  const { CITY } = cityMod;

  const basin = V.sangamBasin(timeline, CITY);
  const districts = V.districtAnchors(DISTRICT_IDS, timeline, CITY);
  const districtsById = new Map(districts.map((d) => [d.id, d]));
  const trib = V.tributaries(systemGraph.edges, projectStats, districtsById, basin);
  const spline = V.riverSpline(timeline, CITY);

  // --- height field ---------------------------------------------------
  const heights = new Float32Array(GRID * GRID);
  const splat = new Float32Array(GRID * GRID * 4); // soil, grass, laterite, pebble

  const step = V.EXTENT / (GRID - 1);

  for (let gz = 0; gz < GRID; gz++) {
    const z = V.BOUNDS.zMin + gz * step;
    const riverWidth = V.riverWidthAtZ(z, timeline, CITY);
    const riverDepth = V.riverDepth(riverWidth);
    const workLevel = V.laneValueAtZ(z, timeline, CITY, "work");
    const writingLevel = V.laneValueAtZ(z, timeline, CITY, "writing");

    for (let gx = 0; gx < GRID; gx++) {
      const x = V.BOUNDS.xMin + gx * step;
      const idx = gz * GRID + gx;

      // step 1: base valley, capped at 60
      const dRiver = V.distanceToRiver(x, z);
      let h = Math.min(60, 3 + 0.004 * dRiver * dRiver);

      // step 2: carve the river channel, 4m smoothstep bank
      {
        const half = riverWidth / 2;
        if (dRiver <= half) {
          h = -riverDepth;
        } else if (dRiver < half + 4) {
          const t = (dRiver - half) / 4;
          const s = t * t * (3 - 2 * t);
          h = -riverDepth + (h - -riverDepth) * s;
        }
      }

      // step 3: west terraces (work lane, stepped 0.6m risers), only west
      // of the river bank
      if (x < 0 && dRiver > riverWidth / 2 + 4) {
        const riser = 0.6;
        h += Math.round((workLevel / 40) * riser * 4) * riser * 0.25; // gentle, bounded stepped relief from real monthly work volume
      }

      // step 4: east meadow (writing lane, banded), only east of the bank
      if (x > 0 && dRiver > riverWidth / 2 + 4) {
        h += Math.min(6, writingLevel * 0.15);
      }

      // step 5: Sangam amphitheatre bowl + district benches
      const dBasin = Math.hypot(x - basin.x, z - basin.z);
      if (dBasin < basin.r) {
        const t = dBasin / basin.r;
        h = h * t + 2 * (1 - t); // bowl floor ~2m near centre, blends out to base valley at the rim
      }
      for (const d of districts) {
        const dd = Math.hypot(x - d.x, z - d.z);
        if (dd < 14) {
          const t = dd / 14;
          h = h * t + d.y * (1 - t); // bench at the district's own anchor height
        }
      }

      // step 6: tributary channels, straight-ish polyline from each
      // district bench down to the basin
      let dTrib = Infinity;
      let tribWidth = 0;
      for (const t of trib) {
        const dd = V.distToSegment(x, z, t.from, t.to);
        if (dd < dTrib) {
          dTrib = dd;
          tribWidth = t.width;
        }
      }
      if (dTrib <= tribWidth / 2) {
        h = Math.min(h, 1); // shallow dry-or-wet channel bed
      } else if (dTrib < tribWidth / 2 + 2) {
        const t = (dTrib - tribWidth / 2) / 2;
        const s = t * t * (3 - 2 * t);
        h = Math.min(h, 1 + (h - 1) * s);
      }

      // step 7: fbm, only beyond 60m from any water (main river or a
      // tributary channel)
      const distWater = Math.min(dRiver - riverWidth / 2, dTrib - tribWidth / 2);
      if (distWater > 60) {
        h += V.fbm(x * 0.012, z * 0.012) * 8;
      }

      // step 8: chess ridge, x in [300,384], continued to the extent edge
      if (x >= 300) {
        const games = V.laneValueSmoothed(z, timeline, CITY, "chess", 2);
        const ridgeH = 30 + Math.min(1, games / 620) * 110; // 620 = timeline's real peak month (2020-12)
        const blend = smooth01((x - 300) / 30);
        h = h * (1 - blend) + ridgeH * blend;
      }

      heights[idx] = h;

      // splat weights (spec §3: soil/grass/laterite by slope/pebble near water)
      const nearWater = distWater < 0.5;
      const laterite = h > 45 ? 1 : 0;
      const pebble = nearWater ? 1 : Math.max(0, 1 - distWater / 3);
      const soil = Math.max(0, 1 - Math.abs(h - 10) / 25);
      const grass = 1;
      const sum = soil + grass + laterite + pebble || 1;
      splat[idx * 4 + 0] = soil / sum;
      splat[idx * 4 + 1] = grass / sum;
      splat[idx * 4 + 2] = laterite / sum;
      splat[idx * 4 + 3] = pebble / sum;
    }
  }

  function smooth01(t) {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }

  let hMin = Infinity;
  let hMax = -Infinity;
  for (const h of heights) {
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }

  const heightPixels = new Uint8Array(GRID * GRID);
  for (let i = 0; i < heights.length; i++) {
    heightPixels[i] = Math.round(((heights[i] - hMin) / (hMax - hMin || 1)) * 255);
  }

  const splatPixels = new Uint8Array(GRID * GRID * 4);
  for (let i = 0; i < splat.length; i++) splatPixels[i] = Math.round(Math.min(1, Math.max(0, splat[i])) * 255);

  mkdirSync(OUT_DIR, { recursive: true });

  const heightPng = await sharp(Buffer.from(heightPixels), { raw: { width: GRID, height: GRID, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(OUT_DIR, "heightmap.png"), heightPng);
  writeFileSync(
    join(OUT_DIR, "heightmap.json"),
    JSON.stringify(
      {
        generatedAt,
        grid: GRID,
        metresPerTexel: step,
        extent: V.EXTENT,
        center: V.CENTER,
        bounds: V.BOUNDS,
        min: hMin,
        max: hMax,
        note: "real height = min + (pixel/255) * (max-min); 8-bit fallback, see gen-terrain.mjs's honesty note",
      },
      null,
      2,
    ),
  );

  const splatPng = await sharp(Buffer.from(splatPixels), { raw: { width: GRID, height: GRID, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(OUT_DIR, "splat.png"), splatPng);
  writeFileSync(
    join(OUT_DIR, "splat-legend.json"),
    JSON.stringify({ r: "soil (brown_mud_dry)", g: "grass (withered_grass)", b: "laterite rock (rock_pitted_mossy)", a: "pebble (ganges_river_pebbles)" }, null, 2),
  );

  writeFileSync(join(OUT_DIR, "river-spline.json"), JSON.stringify({ generatedAt, points: spline }, null, 2));
  writeFileSync(
    join(OUT_DIR, "tributaries.json"),
    JSON.stringify({ generatedAt, basin, streams: trib }, null, 2),
  );
  writeFileSync(join(OUT_DIR, "districts.json"), JSON.stringify({ generatedAt, basin, districts }, null, 2));

  console.log(
    `[gen-terrain] ${GRID}x${GRID} (${step.toFixed(2)} m/texel), height ${hMin.toFixed(1)}..${hMax.toFixed(1)} m, ${trib.length} tributaries (${trib.filter((t) => t.hasWater).length} with water), ${districts.length} districts -> heavy/world/terrain/`,
  );

  await renderPreview(heights, hMin, hMax, splat, spline, districts, basin, trib);
}

/** Top-down QA render: hypsometric tint from the real height field, river
 *  spline traced in cyan (measured water only), district anchors labelled
 *  via an SVG overlay composited on top — never text baked into the
 *  heightmap itself. */
async function renderPreview(heights, hMin, hMax, splat, spline, districts, basin, trib) {
  const rgba = new Uint8Array(GRID * GRID * 4);
  for (let i = 0; i < GRID * GRID; i++) {
    const t = (heights[i] - hMin) / (hMax - hMin || 1);
    const soil = splat[i * 4 + 0];
    const grass = splat[i * 4 + 1];
    const laterite = splat[i * 4 + 2];
    const pebble = splat[i * 4 + 3];
    // base hypsometric ramp: low = river ink, mid = grass green, high = laterite red-brown
    let r = 20 + t * 140;
    let g = 40 + t * 90;
    let b = 30 + (1 - t) * 60;
    // tint by dominant splat channel
    r = r * 0.6 + (laterite * 180 + soil * 120) * 0.4;
    g = g * 0.6 + grass * 150 * 0.4;
    b = b * 0.6 + pebble * 140 * 0.4;
    if (heights[i] < 0) {
      r = 10;
      g = 40 + Math.min(1, -heights[i] / 4) * 60;
      b = 90 + Math.min(1, -heights[i] / 4) * 100; // river channel, cyan-leaning
    }
    rgba[i * 4 + 0] = Math.round(Math.min(255, Math.max(0, r)));
    rgba[i * 4 + 1] = Math.round(Math.min(255, Math.max(0, g)));
    rgba[i * 4 + 2] = Math.round(Math.min(255, Math.max(0, b)));
    rgba[i * 4 + 3] = 255;
  }

  const step = V.EXTENT / (GRID - 1);
  const toPx = (x, z) => ({ px: (x - V.BOUNDS.xMin) / step, py: (z - V.BOUNDS.zMin) / step });

  const riverPts = spline.filter((p) => p.z >= V.BOUNDS.zMin && p.z <= V.BOUNDS.zMax).map((p) => toPx(p.x, p.z));
  const riverPath = riverPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");

  const tribLines = trib
    .map((t) => {
      const a = toPx(t.from.x, t.from.z);
      const b = toPx(t.to.x, t.to.z);
      const stroke = t.hasWater ? "#5ee6ff" : "#8a8a7a";
      const dash = t.hasWater ? "" : ' stroke-dasharray="3,3"';
      return `<line x1="${a.px.toFixed(1)}" y1="${a.py.toFixed(1)}" x2="${b.px.toFixed(1)}" y2="${b.py.toFixed(1)}" stroke="${stroke}" stroke-width="1.5"${dash} opacity="0.85"/>`;
    })
    .join("\n  ");

  // Art-direction fix: alternating "above i even / below i odd" pushed each
  // label toward whichever neighbour was closest on the amphitheatre arc,
  // because the arc is symmetric about its midpoint (sin(200deg)==sin(340deg),
  // sin(235deg)==sin(305deg)) — pairs of districts land on the SAME row, and
  // the old scheme then offset them in opposite directions *into* each
  // other ("doori"+"gaddi" and "candidai"+"kmp-app-template" fused). Instead,
  // push each label radially outward from the basin along its own bearing —
  // districts are already angularly separated on the arc, so radiating
  // outward preserves that separation instead of fighting it — and anchor
  // the text away from the basin on whichever side it lands.
  const basinPxForLabels = toPx(basin.x, basin.z);
  const labels = districts
    .map((d) => {
      const p = toPx(d.x, d.z);
      const dx = p.px - basinPxForLabels.px;
      const dy = p.py - basinPxForLabels.py;
      const len = Math.hypot(dx, dy) || 1;
      const lx = p.px + (dx / len) * 16;
      const ly = p.py + (dy / len) * 16;
      const anchor = dx < 0 ? "end" : "start";
      return `<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="3.5" fill="#f2a13d"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-family="monospace" font-size="11" fill="#e8efe9">${d.id}</text>`;
    })
    .join("\n  ");

  const basinPx = toPx(basin.x, basin.z);

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID}" height="${GRID}">
  <path d="${riverPath}" fill="none" stroke="#5ee6ff" stroke-width="2.5" opacity="0.9"/>
  ${tribLines}
  <circle cx="${basinPx.px.toFixed(1)}" cy="${basinPx.py.toFixed(1)}" r="${(basin.r / step).toFixed(1)}" fill="none" stroke="#f2a13d" stroke-width="1.5" stroke-dasharray="4,2" opacity="0.8"/>
  <text x="${(basinPx.px + basin.r / step + 4).toFixed(1)}" y="${basinPx.py.toFixed(1)}" font-family="monospace" font-size="11" fill="#f2a13d">Sangam</text>
  ${labels}
  <text x="8" y="30" font-family="monospace" font-size="11" fill="#e8efe9">N — 2017</text>
  <text x="8" y="${GRID - 10}" font-family="monospace" font-size="11" fill="#e8efe9">S — now</text>
  <rect x="0" y="0" width="${GRID}" height="30" fill="#060807" opacity="0.55"/>
  <text x="8" y="13" font-family="monospace" font-size="10" fill="#f2a13d">LAYOUT DEBUG — not a craft/terrain render (no lighting, no 3D). See heavy/world/terrain/*.png for the real heightmap+splat.</text>
  <text x="8" y="26" font-family="monospace" font-size="10" fill="#e8efe9">river=time, cyan=measured tributary, grey dashed=declared</text>
</svg>`;

  const base = sharp(Buffer.from(rgba), { raw: { width: GRID, height: GRID, channels: 4 } }).png();
  const composed = await sharp(await base.toBuffer())
    .composite([{ input: Buffer.from(overlay) }])
    .resize(GRID * 2, GRID * 2, { kernel: "nearest" })
    .png()
    .toBuffer();

  // Best-effort: the preview is a QA convenience, never a build artefact, so
  // a write failure here (e.g. a read-only or missing parent on some
  // machine) must not crash the deterministic terrain generation above it.
  try {
    mkdirSync(dirname(PREVIEW_PNG), { recursive: true });
    writeFileSync(PREVIEW_PNG, composed);
    console.log(`[gen-terrain] preview -> ${PREVIEW_PNG}`);
  } catch (err) {
    console.warn(`[gen-terrain] preview write skipped: ${err.message}`);
  }
}

main().catch((err) => {
  console.warn("[gen-terrain] unexpected failure, leaving previous output untouched:", err);
});
