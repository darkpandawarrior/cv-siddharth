// scripts/gen-world-plate.mjs
//
// Night Survey art-direction doc §11 — THE STATIC FALLBACK.
//
// "No WebGL, or prefers-reduced-motion with an explicit opt-out unclicked:
// serve public/p/world/corridor.png — a top-down orthographic bake of the
// same terrain under the same 13° key... produced at build time... from the
// identical generator data (no runtime cost, no drift)."
//
// HONESTY NOTE, because §11 asks for more than this file can honestly
// deliver without a new dependency: a true orthographic bake under a real
// 13° directional light is a three.js/WebGL render, and doing that
// headlessly at build time needs a GPU-capable renderer (puppeteer+WebGL,
// or a software rasteriser) — neither is an installed dependency, and this
// project's own hard rule is not to add one. What ships here instead is a
// honest, simpler bake: the same real per-lane, per-month relief data
// (heightfield.ts's `visualHeightAt`, the exact function the drivable
// terrain uses) rendered as an SVG hypsometric tint — height encoded as
// brightness against each lane's real hue, the same four lanes in the same
// order, the same month/lane grid — then rasterised to PNG by `sharp`
// (already a dependency; it embeds librsvg, so this needs no headless
// browser). It is not lit; it is READABLE, which is what §11's own
// fallback bar asks for ("not a blank screen").
//
// The shared lit-map overlay (§11's other half) is deliberately NOT baked
// in: it is playhtml's shared runtime state (litMap.ts's own doc comment —
// "NOT wired to playhtml" yet), so there is nothing real to bake at build
// time. A visitor's own driving never reaches this fallback anyway (they'd
// need WebGL to have driven anywhere first).
//
// The year rules, lane monograms and alt text stay OUT of this PNG on
// purpose, per §11 — drawn as inline SVG in the DOM by CorridorPlate.tsx,
// which reads the committed src/world/corridorPlate.ts this script also
// writes so neither file can drift from the other's numbers.
//
// Per the house generator contract (gen-timeline.mjs, gen-*-stats.mjs): a
// failure here NEVER fails the build and NEVER writes a degraded file — the
// previously committed PNG/metadata are left exactly as they were.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PNG = join(root, "public/p/world/corridor.png");
const OUT_META = join(root, "src/world/corridorPlate.ts");

// Landscape orientation — Z (time) runs left→right, X (lane) runs top→
// bottom — matches the corridor's real 168:56 (3:1) proportions exactly, so
// nothing here distorts the shape a driver would actually see from above.
const WIDTH = 2400;
const HEIGHT = 800;

const LANE_COLOR = { work: "#3ddc84", chess: "#5ee6ff", writing: "#f2a13d", opensource: "#e8efe9" };

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [10, 13, 12];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

const INK = hexToRgb("#0a0d0c"); // Terrain.tsx's own ground base — the same "unlit" floor the live shader starts from

/** Mixes `hex` from the ground's own ink base (a quiet month) up to the
 *  lane's full hue (a busy one) — the hypsometric tint. Reuses §3.4's own
 *  `pow(w, 0.6)` falloff curve (the live shader's "worn track" emissive
 *  ramp) rather than inventing a second easing for the fallback, so a busy
 *  month reads BRIGHTER here exactly the way it reads brighter/more
 *  saturated everywhere else in this world (the bollards' intensity curve,
 *  the lit-map's own emissive add) — never the reverse. */
function tint(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const c = Math.pow(Math.max(0, Math.min(1, t)), 0.6);
  const mix = (base, full) => Math.round(base + (full - base) * c);
  return `rgb(${mix(INK[0], r)},${mix(INK[1], g)},${mix(INK[2], b)})`;
}

async function main() {
  let heightfield;
  let terrainRelief;
  let timelineMod;
  let cityMod;
  try {
    // Dynamic imports, inside the try: Node 22.7+/23.6+'s type-stripping
    // makes these plain .ts files importable under plain `node` (this repo's
    // other gen-*.mjs scripts already rely on the same thing for
    // src/data/*.ts) — but if a future TS feature in any of these four
    // modules ever stops being erasable syntax, this generator must skip
    // quietly rather than break the build, matching the house contract.
    [heightfield, terrainRelief, timelineMod, cityMod] = await Promise.all([
      import(join(root, "src/world/heightfield.ts")),
      import(join(root, "src/world/terrainRelief.ts")),
      import(join(root, "src/data/timeline.ts")),
      import(join(root, "src/world/city.ts")),
    ]);
  } catch (err) {
    console.warn("[gen-world-plate] source modules unavailable, leaving previous output untouched:", err.message);
    return;
  }

  const { laneCenterX, monthCenterZ, MONTH_DEPTH, RELIEF_MAX, laneKeys } = heightfield;
  const { visualHeightAt } = terrainRelief;
  const { timeline } = timelineMod;
  const { CITY } = cityMod;

  const months = timeline.months;
  const zToX = (z) => ((z - CITY.z0) / (CITY.z1 - CITY.z0)) * WIDTH;
  const laneToY = (x) => ((x - -CITY.halfWidth) / (CITY.halfWidth * 2)) * HEIGHT;
  const monthWidthPx = zToX(CITY.z0 + MONTH_DEPTH) - zToX(CITY.z0);

  const rects = [];
  for (let li = 0; li < laneKeys.length; li++) {
    const key = laneKeys[li];
    const color = LANE_COLOR[key] ?? "#e8efe9";
    const cx = laneCenterX(li);
    const laneTop = laneToY(cx) - HEIGHT / (laneKeys.length * 2);
    const laneHeightPx = HEIGHT / laneKeys.length;
    for (let mi = 0; mi < months.length; mi++) {
      const z = monthCenterZ(mi);
      const h = visualHeightAt(cx, z);
      const t = Math.max(0, Math.min(1, (h - CITY.groundY) / RELIEF_MAX));
      const x0 = zToX(z - MONTH_DEPTH / 2);
      rects.push(
        `<rect x="${x0.toFixed(1)}" y="${laneTop.toFixed(1)}" width="${(monthWidthPx + 0.6).toFixed(1)}" height="${laneHeightPx.toFixed(1)}" fill="${tint(color, t)}" />`,
      );
    }
  }

  // Faint lane dividers and a base wash — the SVG-bake equivalent of
  // Terrain.tsx's own berm strips and ink-base plate, so the fallback still
  // reads as "one ground" and not four disconnected stripes.
  const dividers = [];
  for (let li = 1; li < laneKeys.length; li++) {
    const y = (HEIGHT / laneKeys.length) * li;
    dividers.push(`<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}" stroke="#e8efe9" stroke-opacity="0.18" stroke-width="2" />`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#0a0d0c" />
  ${rects.join("\n  ")}
  ${dividers.join("\n  ")}
</svg>`;

  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch (err) {
    console.warn("[gen-world-plate] sharp unavailable, leaving previous output untouched:", err.message);
    return;
  }

  try {
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    mkdirSync(dirname(OUT_PNG), { recursive: true });
    writeFileSync(OUT_PNG, png);
  } catch (err) {
    console.warn("[gen-world-plate] rasterise failed, leaving previous output untouched:", err.message);
    return;
  }

  // The committed metadata CorridorPlate.tsx (src/world/) reads to draw its
  // DOM-side SVG overlay — year rules, lane monograms, alt text — without
  // recomputing any terrain math itself. Year Z positions mirror
  // Fixtures.tsx's own `yearRankZ` formula exactly (CITY.z0 + MONTH_DEPTH*12*k)
  // so the fallback's year lines land at the identical fraction across the
  // image that the live ground shader's year seams land on the real terrain.
  const yearCount = Math.floor(months.length / 12) + 1;
  const years = Array.from({ length: yearCount }, (_, k) => {
    const z = CITY.z0 + MONTH_DEPTH * 12 * k;
    return { year: 2019 + k, xFraction: zToX(z) / WIDTH };
  }).filter((y) => y.xFraction >= 0 && y.xFraction <= 1);

  const meta = {
    generatedAt: new Date().toISOString(),
    width: WIDTH,
    height: HEIGHT,
    from: timeline.from,
    to: timeline.to,
    lanes: laneKeys.map((key, i) => ({
      key,
      label: timeline.lanes[i]?.label ?? key,
      color: LANE_COLOR[key] ?? "#e8efe9",
      yFraction: (i + 0.5) / laneKeys.length,
    })),
    years,
  };

  const body = `// AUTO-GENERATED by scripts/gen-world-plate.mjs — do not edit by hand.
//
// The metadata src/world/CorridorPlate.tsx overlays on public/p/world/corridor.png
// — Night Survey art-direction doc §11's "8 year rules and lane monograms
// drawn as inline SVG on top of it in the DOM". Kept as committed data
// (never recomputed from three.js) so the DOM overlay can render with zero
// WebGL and zero drift from the baked image beneath it.
export interface CorridorPlateLane {
  key: string;
  label: string;
  color: string;
  /** 0..1 fraction of the image's height — the lane's own centreline. */
  yFraction: number;
}
export interface CorridorPlateYear {
  year: number;
  /** 0..1 fraction of the image's width. */
  xFraction: number;
}
export interface CorridorPlateMeta {
  generatedAt: string;
  width: number;
  height: number;
  from: string;
  to: string;
  lanes: CorridorPlateLane[];
  years: CorridorPlateYear[];
}
export const corridorPlateMeta: CorridorPlateMeta = ${JSON.stringify(meta, null, 2)};
`;
  writeFileSync(OUT_META, body);

  console.log(
    `[gen-world-plate] ${WIDTH}x${HEIGHT} corridor.png, ${laneKeys.length} lanes x ${months.length} months, ${years.length} year rules → public/p/world/corridor.png + src/world/corridorPlate.ts`,
  );
}

main().catch((err) => {
  console.warn("[gen-world-plate] unexpected failure, leaving previous output untouched:", err);
});
