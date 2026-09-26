// Pulls a curated, hand-picked set of frames + demo gifs from each app repo's
// docs/ over raw.githubusercontent into heavy/projects/<slug>/screenshots/.
// A failed pull retains the last asset and exits nonzero after all pulls. Runs before
// gen-galleries so new files land in the gallery. Local committed media is the
// fallback: with no network the build still works off what's already on disk.
import { writeFileSync, mkdirSync, statSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

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

import { fetchWithTimeout } from "./lib/net.mjs";
const raw = (repo, path) => `https://raw.githubusercontent.com/${repo}/main/docs/${path}`;
/* The ONLY host that serves the LFS object rather than the pointer. */
const lfs = (repo, path) => `https://media.githubusercontent.com/media/${repo}/main/docs/${path}`;

/**
 * Git LFS pointers are ~130 bytes of text beginning with this exact line.
 *
 * raw.githubusercontent serves the POINTER, never the binary, for any
 * LFS-tracked path. Stutter's .gitattributes puts every binary asset through
 * LFS ("code stays plain text and diffable; binary assets go through Git
 * LFS"), so four of its screenshots came back as 130-byte text files and this
 * script wrote them straight over the real committed images — turning
 * title.webp from 13 KB of WEBP into a pointer, and taking gen-images down
 * with "Input file contains unsupported image format" on the next step.
 *
 * That was invisible for as long as the refresh job died earlier in the chain.
 * The moment the commit step was changed to always() so one dead generator
 * could not discard the other 26, the next scheduled run would have COMMITTED
 * these pointers and shipped four broken images to the live case study.
 */
const isLfsPointer = (buf) =>
  buf.length < 1024 && buf.subarray(0, 40).toString("utf8").startsWith("version https://git-lfs");

async function get(url) {
  const res = await fetchWithTimeout(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return res.ok ? Buffer.from(await res.arrayBuffer()) : res.status;
}

// Private LFS objects need the authenticated batch endpoint; the media CDN
// can return 404 even when the repository's pointer is readable.
async function downloadLfs(repo, pointer) {
  const text = pointer.toString("utf8");
  const oid = text.match(/^oid sha256:([a-f0-9]{64})$/m)?.[1];
  const size = Number(text.match(/^size (\d+)$/m)?.[1]);
  if (!token || !oid || !Number.isSafeInteger(size) || size <= 0) throw new Error("LFS download requires a valid pointer and GitHub token");
  const response = await fetchWithTimeout(`https://github.com/${repo}.git/info/lfs/objects/batch`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`, "Content-Type": "application/vnd.git-lfs+json", Accept: "application/vnd.git-lfs+json" },
    body: JSON.stringify({ operation: "download", transfers: ["basic"], objects: [{ oid, size }] }),
  });
  if (!response.ok) throw new Error(`LFS batch HTTP ${response.status}`);
  const action = (await response.json()).objects?.[0]?.actions?.download;
  if (!action?.href || new URL(action.href).protocol !== "https:") throw new Error("LFS returned no HTTPS download");
  const asset = await fetchWithTimeout(action.href, { headers: action.header ?? {} });
  if (!asset.ok) throw new Error(`LFS asset HTTP ${asset.status}`);
  const bytes = Buffer.from(await asset.arrayBuffer());
  if (bytes.length !== size || createHash("sha256").update(bytes).digest("hex") !== oid) throw new Error("LFS integrity mismatch");
  return bytes;
}

async function pull(repo, srcPath, dest) {
  try {
    let buf = await get(raw(repo, srcPath));
    if (typeof buf === "number") throw new Error(`HTTP ${buf}: ${srcPath}`);
    if (isLfsPointer(buf)) {
      let viaLfs = await get(lfs(repo, srcPath));
      if (typeof viaLfs === "number" || isLfsPointer(viaLfs)) viaLfs = await downloadLfs(repo, buf);
      if (typeof viaLfs === "number" || isLfsPointer(viaLfs)) {
        // Never write the pointer. Keeping the committed asset is always
        // better than replacing a real image with 130 bytes of text.
        throw new Error(`LFS ${srcPath}: pointer only; kept the committed file`);
      }
      buf = viaLfs;
    }
    writeFileSync(dest, buf);
    compressGif(dest);
    console.log(`[sync-media] ok ${srcPath} -> ${dest}`);
  } catch (err) {
    process.exitCode = 1;
    console.warn(`[sync-media] MISS ${srcPath} — ${err.message}`);
  }
}

for (const [slug, { repo, files }] of Object.entries(sync)) {
  const dir = join(root, "heavy", "projects", slug, "screenshots");
  mkdirSync(dir, { recursive: true });
  for (const [srcPath, destName] of files) {
    await pull(repo, srcPath, join(dir, destName));
  }
}
