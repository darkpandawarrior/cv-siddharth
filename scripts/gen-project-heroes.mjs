/**
 * Renders a purpose-built hero banner for each project card.
 *
 * WHY NOT SCREENSHOTS. The cards used to show app screenshots cropped to a
 * ~2.7:1 band. Every one of those problems was structural, not a matter of
 * picking a better file:
 *   - Tall phone screens seen through a shallow letterbox show one arbitrary
 *     horizontal slice. The "best" frame is still a slice.
 *   - What that slice contains is whatever the app happened to render — a
 *     Coverage table, a toast, an empty chart region. None of it says what the
 *     project IS or why it's impressive.
 *   - Two of the products are light-themed, so their screenshots fight a dark
 *     page no matter how they're cropped.
 * A hero is authored instead: correct aspect by construction, in the project's
 * own palette, carrying the facts that actually earn attention (46 modules,
 * 5 platforms, 66 gateways) rather than whatever was on screen.
 *
 * Design language is deliberately the same as gen-og.mjs — accent edge, dot
 * grid, radial glows, mono eyebrow, stat pills — so a card, a share preview and
 * a project page read as one system.
 *
 * Output is committed, like the OG images: this needs a headless Chromium, and
 * without one it warns and leaves the existing PNGs untouched rather than
 * failing a build.
 */
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { projects } from "../src/data/profile.ts";
import { CHROMIUM } from "./lib/chromium.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "projects", "_heroes");

// 2x the widest the card is ever drawn (474px), so it stays crisp on retina and
// in the larger featured slot. 2.7:1 matches the card band's own proportions.
const W = 1000;
const H = 370;
// Headless Chromium reserves a band of window height, so render taller and crop
// the exact frame off the top — same trick gen-og.mjs uses, same reason.
const RENDER_H = H + 130;

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The first clause of a tagline — the part that fits on one line and lands. */
function lede(str = "", max = 78) {
  const first = str.split(/[—–·]/)[0].trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/**
 * A project's stats, as pills.
 *
 * `status` is a human string ("46 modules · 5 platforms · 159 tests"), so split
 * on the separator it already uses. Entries that are prose rather than a metric
 * ("In development", "Active") are kept — they're honest status, and a card
 * that hid them would be overselling.
 */
function pillsOf(p) {
  return (p.status ?? "")
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function heroHtml(p) {
  const t = p.theme ?? {};
  const accent = t.accent ?? "#3ddc84";
  const ink = t.ink ?? "#05070a";
  const surface = t.surface ?? "#0b0f0d";
  const line = t.line ?? "#243029";
  // Kursi identifies with a serif display face; everything else is geometric.
  const serif = !!(t.displayFont && /serif|Rozha|Georgia/i.test(t.displayFont));
  const display = serif
    ? "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
    : "'Space Grotesk', -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif";
  const nameSize = p.name.length > 11 ? 62 : 74;
  const pills = pillsOf(p);
  const chips = (p.stack ?? []).slice(0, 4);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  html,body{background:#000;color:#e8efe9;
    font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif}
  /* The banner is an EXACT ${W}x${H} box anchored at the origin, not a 100vh
     centred layout. Centring in the viewport made the crop position-dependent:
     content taller than average drifted below the cut line and lost its bottom
     row (Kursi's chips, whose tagline wraps to two lines). A fixed box at 0,0
     means the top-crop captures the whole banner whatever it contains. */
  .wrap{position:absolute;top:0;left:0;width:${W}px;height:${H}px;overflow:hidden;
    padding:34px 52px;display:flex;flex-direction:column;justify-content:center;
    background:
      linear-gradient(90deg, ${accent} 0, ${accent} 7px, transparent 7px) no-repeat,
      radial-gradient(${accent}14 1px, transparent 1px) 0 0 / 28px 28px,
      radial-gradient(58% 120% at 92% -20%, ${accent}30, transparent 62%) no-repeat,
      radial-gradient(46% 90% at 4% 118%, ${accent}1e, transparent 60%) no-repeat,
      linear-gradient(148deg, ${ink}, ${surface});
  }
  .eyebrow{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:14px;
    letter-spacing:3.4px;text-transform:uppercase;color:${accent};opacity:.92}
  .name{font-family:${display};font-weight:800;font-size:${nameSize}px;line-height:1.02;margin-top:10px;
    ${serif ? "letter-spacing:.5px;" : "letter-spacing:-1px;"}}
  /* Two lines maximum. A third would push the pills out of the box, and the
     pills carry the numbers that make the card worth looking at. */
  .tag{margin-top:12px;font-size:21px;line-height:1.28;color:#cfe3d7;max-width:700px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .pills{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
  .pill{border:1px solid ${accent}66;background:${accent}16;color:${accent};
    border-radius:999px;padding:7px 16px;font-size:16px;font-weight:600;
    font-family:'JetBrains Mono',ui-monospace,monospace;white-space:nowrap}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .chip{border:1px solid ${line};color:#9fb0a6;border-radius:999px;padding:5px 13px;font-size:14px;white-space:nowrap}
  </style></head><body>
  <div class="wrap">
    <div class="eyebrow">${esc(p.slug)}</div>
    <div class="name">${esc(p.name)}</div>
    <div class="tag">${esc(lede(p.tagline))}</div>
    ${pills.length ? `<div class="pills">${pills.map((s) => `<div class="pill">${esc(s)}</div>`).join("")}</div>` : ""}
    ${chips.length ? `<div class="chips">${chips.map((c) => `<div class="chip">${esc(c)}</div>`).join("")}</div>` : ""}
  </div></body></html>`;
}

if (!CHROMIUM) {
  console.warn("[gen-project-heroes] no headless Chromium found — keeping the committed PNGs.");
  console.warn("  Set CHROMIUM_BIN, or install Chrome, then re-run and commit the output.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
let n = 0;
for (const p of projects) {
  const htmlPath = join(tmpdir(), `hero-${p.slug}.html`);
  const rawPath = join(tmpdir(), `hero-${p.slug}.raw.png`);
  const outPath = join(outDir, `${p.slug}.png`);
  writeFileSync(htmlPath, heroHtml(p));
  execFileSync(
    CHROMIUM,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=1200",
      `--window-size=${W},${RENDER_H}`,
      `--screenshot=${rawPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: "ignore" },
  );
  if (!existsSync(rawPath)) throw new Error(`hero render produced nothing for ${p.slug}`);
  // Chromium screenshots the whole window; take the exact banner off the top.
  await sharp(rawPath).extract({ left: 0, top: 0, width: W, height: H }).png().toFile(outPath);
  rmSync(htmlPath, { force: true });
  rmSync(rawPath, { force: true });
  n++;
}
console.log(`[gen-project-heroes] rendered ${n} hero banners → public/projects/_heroes/ (${W}x${H})`);
