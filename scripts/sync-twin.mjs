// Rebuilds the Compose twin's Wasm distribution and syncs it into
// public/portfolio-app, which is the live demo the /project/portfolio page
// embeds in a device frame.
//
// WHY THIS EXISTS. Until 2026-09-01 there was no script. The embedded build was
// a hand copy, and it showed: the committed .wasm files were dated 13 August,
// nineteen days and thirteen ported surfaces stale, so the page advertising the
// twin was booting a version with seven routes while the twin had twenty. None
// of it was visible from this repo, because a stale binary serves perfectly.
//
// The house answer to that is already in refresh-media.yml, which pulls from the
// app repos daily and "commits any drift ... without a manual poke". This is the
// same contract for the twin, and .github/workflows/refresh-twin.yml is what
// runs it.
//
// GRACEFUL SKIP when the twin is not checked out, matching gen-images.mjs on a
// missing ffmpeg: a sibling repo that is not present is not a reason to fail
// this repo's build, and it must not empty a directory the site serves.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KMP = join(root, "..", "cv-siddharth-kmp");
const DEST = join(root, "public", "portfolio-app");
const DIST = join(KMP, "cmp-web", "build", "dist", "wasmJs", "productionExecutable");

if (!existsSync(KMP)) {
  console.log(`sync-twin: ${KMP} is not checked out, keeping the committed build.`);
  process.exit(0);
}

const build = !process.argv.includes("--no-build");
if (build) {
  console.log("sync-twin: building :cmp-web:wasmJsBrowserDistribution ...");
  execFileSync(join(KMP, "gradlew"), [":cmp-web:wasmJsBrowserDistribution"], {
    cwd: KMP,
    stdio: "inherit",
  });
}

if (!existsSync(DIST)) {
  console.error(`sync-twin: ${DIST} does not exist after the build. Refusing to empty ${DEST}.`);
  process.exit(1);
}

// Refuse to sync something obviously broken. The distribution is two .wasm
// blobs and a JS shim; a build that produced neither is a failure that would
// otherwise replace a working demo with a blank frame.
const wasm = readdirSync(DIST).filter((f) => f.endsWith(".wasm"));
if (wasm.length < 2) {
  console.error(`sync-twin: expected at least 2 .wasm in the distribution, found ${wasm.length}. Refusing to sync.`);
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(DIST, DEST, { recursive: true });

const bytes = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? bytes(join(dir, e.name)) : statSync(join(dir, e.name)).size),
    0,
  );

const routes = readdirSync(DEST, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "composeResources").length;
console.log(
  `sync-twin: ${(bytes(DEST) / 1048576).toFixed(1)} MB, ${wasm.length} wasm, ${routes} prerendered route directories.`,
);
