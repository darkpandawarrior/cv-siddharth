// Generates per-project Open Graph assets so a shared build link renders its
// OWN card (title, blurb, art) instead of the one generic site image.
//
// For each project with a detail page it emits two static, crawler-friendly
// artifacts under public/p/<slug>/:
//   • og.png            — a branded 1200×630 card, rasterized from an HTML
//                         template with the pre-installed headless Chromium
//                         (no runtime dep; Vercel just serves the committed PNG)
//   • index.html        — a tiny share page carrying the per-project OG/Twitter
//                         meta, then redirecting humans to /#project/<slug>
//
// Facts come from src/data/profile.ts (the single source of truth), so the
// cards can't drift from the site. Chromium is only needed HERE (author time);
// run `npm run gen:og` and commit the output. Not wired into prebuild — the
// Vercel build has no browser and doesn't need one.
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { inflateSync, deflateSync } from "node:zlib";
import { projects, profile } from "../src/data/profile.ts";

/* ── Minimal PNG top-crop (no image lib) ──────────────────────────────────
 * Chromium emits 8-bit, non-interlaced RGB/RGBA PNGs. We inflate the IDAT,
 * unfilter the top `keepH` scanlines, re-filter them as None, and re-deflate.
 * That lets us render into an oversized window (so the content sits in the
 * fully-painted viewport) and crop back to an exact 1200×630 — sidestepping
 * headless Chromium's reserved-viewport band without an external cropper. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function cropPngTop(buf, keepH) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error("not a PNG");
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") idat.push(data);
    off += 12 + len;
    if (type === "IEND") break;
  }
  if (!ihdr) throw new Error("no IHDR");
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (bd=${bitDepth}, il=${interlace})`);
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : null;
  if (!bpp) throw new Error(`unsupported colorType ${colorType}`);
  const rows = Math.min(keepH, height);
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(rows * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < rows; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  // Re-emit as filter 0 (None) rows.
  const filtered = Buffer.alloc(rows * (stride + 1));
  for (let y = 0; y < rows; y++) {
    filtered[y * (stride + 1)] = 0;
    out.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const newIhdr = Buffer.from(ihdr);
  newIhdr.writeUInt32BE(rows, 4);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", newIhdr),
    pngChunk("IDAT", deflateSync(filtered, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "public", "p");
const SITE = "https://cv-siddharth.vercel.app";

const CHROMIUM =
  process.env.CHROMIUM_BIN ||
  ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );
const OG_W = 1200;
const OG_H = 630;
// Render into a taller window than the card so the content is centered inside
// the FULLY-painted viewport, then crop the exact 1200×630 off the top. This
// sidesteps headless Chromium's reserved-viewport band entirely — no fragile
// per-theme unpainted strip at the bottom.
const RENDER_H = 760;

function rasterize(htmlPath, pngPath) {
  const raw = `${pngPath}.raw.png`;
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
      `--window-size=${OG_W},${RENDER_H}`,
      `--screenshot=${raw}`,
      `file://${htmlPath}`,
    ],
    { stdio: "ignore" },
  );
  writeFileSync(pngPath, cropPngTop(readFileSync(raw), OG_H));
  rmSync(raw, { force: true });
}

const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A shorter, punchier line for the card + share title than the full tagline.
function shortTagline(p) {
  const first = p.tagline.split(/[—–·]/)[0].trim();
  return first.length > 92 ? `${first.slice(0, 89)}…` : first;
}

// The 1200×630 card. System fonts only (headless render, no network) with a
// serif fallback for serif-identity projects like Kursi.
function cardHtml(p) {
  const t = p.theme ?? {};
  const accent = t.accent ?? "#3ddc84";
  const ink = t.ink ?? "#05070a";
  const surface = t.surface ?? "#0b0f0d";
  const line = t.line ?? "#243029";
  const serif = t.displayFont && /serif|Rozha|Georgia/i.test(t.displayFont);
  const display = serif
    ? "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
    : "'Space Grotesk', -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif";
  const stats = (p.status ?? "").split("·").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const chips = (p.stack ?? []).slice(0, 5);
  // Headless Chromium reserves ~82px of window height, so the content viewport
  // (100vh) is shorter than the 1200×630 screenshot. We paint the full frame
  // via `html` backgrounds and vertically-center the content in 100vh with a
  // compensating top pad, so the block lands at the true center of the 630 png
  // and nothing can clip regardless of the exact reserved height.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  html,body{
    width:100%;height:100%;
    color:#e8efe9;font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif;
    background:
      linear-gradient(90deg, ${accent} 0, ${accent} 10px, transparent 10px) no-repeat,
      radial-gradient(${accent}16 1px, transparent 1px) 0 0 / 34px 34px,
      radial-gradient(60% 90% at 88% -10%, ${accent}24, transparent 60%) no-repeat,
      radial-gradient(50% 70% at 2% 112%, ${accent}1c, transparent 60%) no-repeat,
      linear-gradient(150deg, ${ink}, ${surface});
  }
  .wrap{width:100vw;height:100vh;padding:0 80px;display:flex;flex-direction:column;justify-content:center}
  .brandrow{display:flex;align-items:center;justify-content:space-between;gap:20px}
  .brandl{display:flex;align-items:center;gap:14px}
  .badge{width:44px;height:44px;border-radius:12px;background:${accent};color:${ink};
    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px;font-family:${display}}
  .brand{font-weight:700;font-size:22px;letter-spacing:.2px}
  .brand .dot{color:${accent}}
  .who{text-align:right;color:#9fb4aa;font-size:18px;line-height:1.35}
  .who b{color:#e8efe9}
  .eyebrow{margin-top:30px;font-family:'JetBrains Mono',ui-monospace,monospace;
    font-size:15px;letter-spacing:3px;text-transform:uppercase;color:${accent}}
  .name{font-family:${display};font-weight:800;font-size:88px;line-height:1;margin-top:12px}
  .tag{margin-top:20px;font-size:29px;line-height:1.26;color:#cfe3d7;max-width:1000px}
  .stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}
  .stat{border:1px solid ${accent}66;background:${accent}14;color:${accent};
    border-radius:999px;padding:9px 18px;font-size:20px;font-weight:600;font-family:'JetBrains Mono',ui-monospace,monospace}
  .chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
  .chip{border:1px solid ${line};color:#9fb0a6;border-radius:999px;padding:7px 15px;font-size:17px}
  </style></head><body>
  <div class="wrap">
    <div class="brandrow">
      <div class="brandl"><div class="badge">S</div><div class="brand">sid<span class="dot">.</span>android</div></div>
      <div class="who"><b>Siddharth Pandalai</b><br/>Senior Android Engineer</div>
    </div>
    <div class="eyebrow">// project · one codebase, every surface</div>
    <div class="name">${esc(p.name)}</div>
    <div class="tag">${esc(shortTagline(p))}</div>
    <div class="stats">${stats.map((s) => `<div class="stat">${esc(s)}</div>`).join("")}</div>
    <div class="chips">${chips.map((c) => `<div class="chip">${esc(c)}</div>`).join("")}</div>
  </div>
  </body></html>`;
}

function sharePage(p) {
  const url = `${SITE}/p/${p.slug}`;
  const img = `${url}/og.png`;
  const title = `${p.name} — ${shortTagline(p)} · Siddharth Pandalai`;
  const desc = p.description;
  const deep = `/#project/${p.slug}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <meta name="theme-color" content="${esc(p.theme?.ink ?? "#0b0f0d")}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="sid.android" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${img}" />
  <meta http-equiv="refresh" content="0; url=${deep}" />
  <script>window.location.replace(${JSON.stringify(deep)});</script>
  <style>
    html,body{margin:0;height:100%;background:${p.theme?.ink ?? "#0b0f0d"};color:#e8efe9;
      font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
    .w{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:1.5rem}
    a{color:${p.theme?.accent ?? "#3ddc84"}}
  </style>
</head>
<body>
  <div class="w">
    <p>Opening <strong>${esc(p.name)}</strong> …</p>
    <p><a href="${deep}">Continue to the ${esc(p.name)} case study →</a></p>
    <noscript><p><a href="${deep}">View the ${esc(p.name)} case study</a></p></noscript>
  </div>
</body>
</html>`;
}

const targets = projects.filter((p) => p.detail);
mkdirSync(outRoot, { recursive: true });
const tmp = join(tmpdir(), "sid-og");
mkdirSync(tmp, { recursive: true });

let pngs = 0;
for (const p of targets) {
  const dir = join(outRoot, p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), sharePage(p));

  const html = cardHtml(p);
  const htmlPath = join(tmp, `${p.slug}.html`);
  writeFileSync(htmlPath, html);
  const pngPath = join(dir, "og.png");
  if (CHROMIUM) {
    try {
      rasterize(htmlPath, pngPath);
      pngs++;
    } catch (e) {
      console.warn(`  ! chromium failed for ${p.slug}: ${e.message}`);
    }
  }
  console.log(`  ✓ /p/${p.slug}/  (share page${existsSync(pngPath) ? " + og.png" : ""})`);
}
rmSync(tmp, { recursive: true, force: true });

if (!CHROMIUM) {
  console.warn("\n! No Chromium found — share pages written, but og.png NOT regenerated.");
  console.warn("  Set CHROMIUM_BIN or run where a headless Chromium is available, then commit the PNGs.");
}
console.log(`\ngen-og: ${targets.length} share pages, ${pngs} OG images · site ${SITE} · owner ${profile.name}`);
