// Captures every route of this site into docs/screenshots, so the site is covered by the same
// sentinel as the apps it showcases.
//
//   npm run build && npm run serve &   # or any origin
//   node scripts/capture-site.mjs [--base http://localhost:4173]
//
// Routes are read from src/routes/*.tsx rather than listed here. A hand-kept list is exactly how a
// new page ends up with no capture and nobody notices — the failure this whole sentinel exists for.
//
// Deliberately NOT a visual-regression baseline. These pages carry live 3D, particle fields and a
// scroll-driven hero; pinning them to exact pixels would produce a gate that fails on every run and
// gets switched off. The sentinel checks the things that are stable and still catch real rot: a
// page that renders blank, two routes that render identically, a route with no capture at all.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { surfaces, captureViewport } from "../src/data/surfaces.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "screenshots");
const base = (process.argv.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:4173").split("=")[1];

// Routes that need a param to exist at all. One representative each — enough to prove the template
// renders; capturing every project would just re-photograph the same layout.
const PARAM_ROUTES = [
  ["/project/portfolio", "project_detail"],
  ["/project/mileway", "project_detail_with_compare"],
];

function routes() {
  const files = readdirSync(join(root, "src", "routes")).filter((f) => f.endsWith(".tsx"));
  const out = [];
  for (const f of files) {
    const name = f.replace(/\.tsx$/, "");
    if (name === "__root" || name === "$" || name.includes("$")) continue; // layout, 404, param routes
    out.push(name === "index" ? ["/", "home"] : [`/${name}`, name]);
  }
  return [...out, ...PARAM_ROUTES];
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()} — ${e.message}`));

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const captured = [];
for (const [path, name] of routes()) {
  const url = base + path;
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    if (!res || res.status() >= 400) {
      console.warn(`[capture] ${path} → HTTP ${res?.status() ?? "no response"} — skipped`);
      continue;
    }
    // Canvas-heavy rooms need a beat after networkidle: the first frame of a 3D scene is an empty
    // canvas, and capturing it would produce exactly the blank image the sentinel then flags.
    await page.waitForTimeout(2500);
    const file = join(outDir, `site_${name}.png`);
    await page.screenshot({ path: file });
    captured.push(name);
  } catch (e) {
    console.warn(`[capture] ${path} failed: ${e.message}`);
  }
}

// Second pass: the wall's posters, each shot in the window its own device frame
// implies. The 1440x900 captures above stay exactly as they were — they are the
// sentinel's visual record and comparing a desktop page against a phone-width
// one would flag every route as changed. These are a separate `surface_*` set
// that only gen-surfaces.mjs reads.
//
// Without this the wall was arguing against itself: every tile, phone through
// TV, showed the same desktop capture with its sides cropped off.
const surfaced = [];
for (const surface of surfaces.filter((s) => s.poster)) {
  const vp = captureViewport(surface.device);
  // A desktop/browser surface's viewport IS the 1440x900 pass above. Shooting
  // it twice writes two files with identical pixels, which the sentinel
  // correctly reports as a duplicate; gen-surfaces.mjs already falls back to
  // the site_* capture when there is no surface_* one.
  if (vp.width === 1440 && vp.height === 900) continue;
  const p = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
  try {
    const res = await p.goto(base + surface.to, { waitUntil: "networkidle", timeout: 45_000 });
    if (!res || res.status() >= 400) {
      console.warn(`[capture] ${surface.to} @${vp.width}x${vp.height} → HTTP ${res?.status() ?? "none"} — skipped`);
    } else {
      await p.waitForTimeout(2500);
      await p.screenshot({ path: join(outDir, `surface_${surface.poster}.png`) });
      surfaced.push(`${surface.poster}@${vp.width}x${vp.height}`);
    }
  } catch (e) {
    console.warn(`[capture] ${surface.to} @${vp.width}x${vp.height} failed: ${e.message}`);
  }
  await p.close();
}

await browser.close();
writeFileSync(
  join(outDir, "CAPTURED.json"),
  JSON.stringify({ base, count: captured.length, routes: captured, surfaces: surfaced }, null, 2) + "\n",
);
console.log(`[capture] ${captured.length} routes → docs/screenshots/site_*.png`);
console.log(`[capture] ${surfaced.length} surfaces → docs/screenshots/surface_*.png`);
if (errors.length) {
  console.warn(`[capture] ${errors.length} page errors while capturing:`);
  for (const e of errors.slice(0, 10)) console.warn("  " + e);
}
