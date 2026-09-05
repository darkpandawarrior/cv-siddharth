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
 * grid, radial glows, mono eyebrow — so a card, a share preview and a project
 * page read as one system.
 *
 * WHAT THE BANNER DOES NOT SAY. It used to render the tagline, the status
 * pills and the stack chips as well — every one of which the card prints again
 * in full within about 100px of the banner's bottom edge. A Gaddi card carried
 * "13 modules / 4 platforms / 10 bot personas" as pills AND as its bracketed
 * status line, and its tagline twice. The banner is the project's IDENTITY —
 * its palette, its display face, its name — and the card is where the facts
 * live. Saying each thing once is why the card got shorter without losing
 * anything a reader had not already read.
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

function heroHtml(p) {
  const t = p.theme ?? {};
  const accent = t.accent ?? "#3ddc84";
  const ink = t.ink ?? "#05070a";
  const surface = t.surface ?? "#0b0f0d";
  const line = t.line ?? "#243029";
  // Gaddi identifies with a serif display face; everything else is geometric.
  const serif = !!(t.displayFont && /serif|Rozha|Georgia/i.test(t.displayFont));
  const display = serif
    ? "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
    : "'Space Grotesk', -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif";
  // Sized against the banner's real width now that the name is the only text
  // in it: the long descriptive titles ("The KMP toolkit family",
  // "cv-siddharth: this site, and its Compose Multiplatform twin") were set at
  // the same 62px as "Gaddi" and ran straight off the edge.
  const nameSize = p.name.length > 34 ? 46 : p.name.length > 22 ? 58 : p.name.length > 11 ? 68 : 84;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  html,body{background:#000;color:#e8efe9;
    font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif}
  /* The banner is an EXACT ${W}x${H} box anchored at the origin, not a 100vh
     centred layout. Centring in the viewport made the crop position-dependent:
     content taller than average drifted below the cut line and lost its bottom
     row (Gaddi's chips, whose tagline wraps to two lines). A fixed box at 0,0
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
  /* The name is the whole banner now, so it gets the room the tagline and the
     pills used to take. */
  .name{font-family:${display};font-weight:800;font-size:${nameSize}px;line-height:1.04;margin-top:14px;
    ${serif ? "letter-spacing:.5px;" : "letter-spacing:-1.5px;"}}
  /* A short accent rule instead of a row of pills: it closes the composition
     and carries the project's colour without repeating a single word the card
     prints below. */
  .rule{margin-top:22px;width:96px;height:4px;border-radius:999px;
    background:linear-gradient(90deg, ${accent}, ${accent}22)}
  </style></head><body>
  <div class="wrap">
    <div class="eyebrow">${esc(p.slug)}</div>
    <div class="name">${esc(p.name)}</div>
    <div class="rule"></div>
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
