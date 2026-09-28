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
//
// SIZE GATE (audit fix, 2026-09-28): heavy/ was ~422 MB going into a Pages
// site whose soft cap is ~1 GB and which ALSO serves the F-Droid repo under
// fdroid/ — this script has no visibility into that other tenant's size, so
// its own ceiling (MAX_DEST_BYTES, 800 MB) is set well under the shared 1 GB
// budget on purpose, to leave it headroom. Checked against DEST (cv/ only —
// what this script actually writes), after the rsync and before the git
// commit, so an oversized sync is caught before it's committed rather than
// silently shipped. `--force-size` overrides it for a deliberate, reviewed
// one-off growth (a new showcase film, say) — same shape as `--dry-run`.
import { readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEAVY = join(root, "heavy");
const PAGES = join(root, "..", "..", "Profile", "darkpandawarrior.github.io");
const DEST = join(PAGES, "cv");
const MAX_DEST_BYTES = 800 * 1024 * 1024;

/** Recursive byte total of everything under `dir` — a plain `du -sb`, no
 *  external process (check-budget.mjs's `dirSize` does the same walk for
 *  dist/client). Symlinks are `statSync`'d, not `lstatSync`'d, so a
 *  symlinked asset counts its real target size once, same as that one. `0`
 *  for a directory that doesn't exist yet, so a first-ever publish (no DEST
 *  on disk before mkdirSync below) never throws. */
export function destSizeBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? destSizeBytes(p) : statSync(p).size;
  }
  return total;
}

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

// Everything below actually touches disk/network/git — pulled into a
// function and guarded so a test can `import { destSizeBytes } from
// "./publish-heavy-assets.mjs"` without running the script (this module's
// only real entrypoint is the CLI: see package.json's `publish:heavy-assets`
// and publish-assets.yml).
function runPublish() {
  if (!existsSync(PAGES)) {
    console.log(`publish-heavy-assets: ${PAGES} is not checked out, skipping.`);
    process.exit(0);
  }
  if (!existsSync(HEAVY)) {
    console.log(`publish-heavy-assets: ${HEAVY} does not exist, nothing to publish.`);
    process.exit(0);
  }

  const dryRun = process.argv.includes("--dry-run");
  const forceSize = process.argv.includes("--force-size");
  const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

  mkdirSync(DEST, { recursive: true });

  // The .avif/.webp derivatives under heavy/ are untracked build outputs that gen-images.mjs
  // writes only when the source is newer. A publish straight after a `git pull` (which stamps
  // the pulled PNGs but leaves old derivatives in place) shipped 1x derivatives beside 3x
  // PNGs on 2026-09-08, so the browsers, which pick the derivative, still saw the old size.
  // Regenerate before syncing, whatever ran or did not run before this script.
  execFileSync("node", [join(root, "scripts", "gen-images.mjs")], { stdio: "inherit" });
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

  // Checked here — after the real sync, before anything is committed — so an
  // oversized cv/ is caught while it's still an uncommitted working-tree
  // change in PAGES (recoverable with a plain `git checkout`), never
  // silently shipped.
  const destBytes = destSizeBytes(DEST);
  if (destBytes > MAX_DEST_BYTES && !forceSize) {
    console.error(
      `publish-heavy-assets: cv/ under ${PAGES} is now ${mb(destBytes)} MB, over the ${mb(MAX_DEST_BYTES)} MB ` +
        `threshold (GitHub Pages' soft site cap is ~1 GB, shared with the fdroid/ repo this same site serves). ` +
        `Not committing. Shrink heavy/, or re-run with --force-size once the growth is a deliberate, reviewed choice.`,
    );
    process.exit(1);
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
}

if (import.meta.url === `file://${process.argv[1]}`) runPublish();
