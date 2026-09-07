// Publishes the heavy/ directory to the Pages repo checked out beside this
// one, under cv/<same relative path> — same sibling pattern gen-ops.mjs uses
// for its KMP/Android leverage scan.
//
// WHY. Vercel's free tier caps deployment storage at 10 GB (hit 100% on
// 2026-09-07) and this site redeploys on every merge to main, so 251 MB of
// Wasm demos + screenshots + showcase films + Excelsior scans + OG cards
// divided the budget into ~38 deployments. Moved out of public/ into
// heavy/ (see src/lib/assetBase.ts) so Vite never ships them, and published
// here to darkpandawarrior.github.io/cv/ instead — the same Pages site that
// already hosts the F-Droid repo under fdroid/.
//
// Idempotent, additive: rsync -a with NO --delete. This is a one-way sync
// from the working copy of heavy/ (which a build has just regenerated the
// .avif/.webp siblings into — run `npm run build` or at least `npm run
// gen:images` first) into the Pages checkout; it never removes a file the
// Pages repo already has, even if this repo's heavy/ no longer does, because
// deleting an asset another commit of the live site still links to would 404
// it out from under a visitor with no warning here. Pruning a retired asset
// is a deliberate, separate operation.
//
// GRACEFUL SKIP when the sibling isn't checked out, matching gen-timeline.mjs
// and sync-twin.mjs on the same shape of missing dependency: a build machine
// without the Pages repo beside this one is not a reason to fail this repo's
// build.
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEAVY = join(root, "heavy");
const PAGES = join(root, "..", "..", "Profile", "darkpandawarrior.github.io");
const DEST = join(PAGES, "cv");

if (!existsSync(PAGES)) {
  console.log(`publish-heavy-assets: ${PAGES} is not checked out, skipping.`);
  process.exit(0);
}
if (!existsSync(HEAVY)) {
  console.log(`publish-heavy-assets: ${HEAVY} does not exist, nothing to publish.`);
  process.exit(0);
}

const dryRun = process.argv.includes("--dry-run");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

mkdirSync(DEST, { recursive: true });

console.log(`publish-heavy-assets: rsync ${HEAVY}/ -> ${DEST}/ ${dryRun ? "(dry run)" : ""}`);
run("rsync", [
  "-a",
  "--human-readable",
  ...(dryRun ? ["--dry-run", "--itemize-changes"] : []),
  // Same names sync-project-media.mjs already refuses to write over — a stray
  // OS file or an in-progress edit should never ride along into a public repo.
  "--exclude", ".DS_Store",
  `${HEAVY}/`,
  `${DEST}/`,
]);

if (dryRun) {
  console.log("publish-heavy-assets: dry run, not committing.");
  process.exit(0);
}

const sourceSha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();

const status = spawnSync("git", ["status", "--porcelain", "--", "cv"], { cwd: PAGES, encoding: "utf8" }).stdout;
if (!status.trim()) {
  console.log("publish-heavy-assets: nothing changed under cv/, nothing to commit.");
  process.exit(0);
}

run("git", ["add", "cv"], { cwd: PAGES });
run(
  "git",
  [
    "commit",
    "-m",
    `chore(cv): sync heavy assets from darkpandawarrior/cv-siddharth@${sourceSha}`,
  ],
  { cwd: PAGES },
);
console.log(`publish-heavy-assets: committed in ${PAGES}. Push it yourself: git -C ${PAGES} push`);
