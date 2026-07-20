// Pulls a curated, hand-picked set of frames + demo gifs from each app repo's
// docs/ over raw.githubusercontent into public/projects/<slug>/screenshots/.
// A 404 logs MISS and continues — never fails the build. Runs before
// gen-galleries so new files land in the gallery. Local committed media is the
// fallback: with no network the build still works off what's already on disk.
import { writeFileSync, mkdirSync, statSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.GITHUB_TOKEN;

// Re-encodes a gif in place via ffmpeg's palette filters (fps cap + no upscale
// + smaller palette) — routinely 40-60% smaller with no visible quality loss.
// Skips quietly if ffmpeg isn't on PATH or the file is already small.
function compressGif(path) {
  if (!path.endsWith(".gif") || statSync(path).size < 300_000) return;
  const tmp = `${path}.tmp.gif`;
  const filter =
    "fps=12,scale='min(480,iw)':-1:flags=lanczos,split[s0][s1];" +
    "[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3";
  const res = spawnSync("ffmpeg", ["-y", "-i", path, "-vf", filter, "-loglevel", "error", tmp]);
  if (res.status !== 0 || !statSync(tmp, { throwIfNoEntry: false })) {
    console.warn(`[sync-media] compress skipped (ffmpeg unavailable/failed) for ${path}`);
    return;
  }
  const before = statSync(path).size;
  const after = statSync(tmp).size;
  if (after > 0 && after < before) {
    renameSync(tmp, path);
    console.log(`[sync-media] compressed ${path} ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`);
  } else {
    unlinkSync(tmp);
  }
}

import { sync } from "./media-manifest.mjs";

const raw = (repo, path) => `https://raw.githubusercontent.com/${repo}/main/docs/${path}`;

async function pull(repo, srcPath, dest) {
  try {
    const res = await fetch(raw(repo, srcPath), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return console.warn(`[sync-media] MISS ${res.status} ${srcPath}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    compressGif(dest);
    console.log(`[sync-media] ok ${srcPath} -> ${dest}`);
  } catch (err) {
    console.warn(`[sync-media] MISS ${srcPath} — ${err.message}`);
  }
}

for (const [slug, { repo, files }] of Object.entries(sync)) {
  const dir = join(root, "public", "projects", slug, "screenshots");
  mkdirSync(dir, { recursive: true });
  for (const [srcPath, destName] of files) {
    await pull(repo, srcPath, join(dir, destName));
  }
}
