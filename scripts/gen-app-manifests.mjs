// Writes heavy/<app>-app/build-manifest.json for each of the five embedded
// app builds (Gaddi/kursi-app, Doori/mileway-app, PaymentsLab-KMP/
// paymentslab-app, the Compose twin/portfolio-app, Stutter/deadlock-app):
// {repo, commit, builtAt, engine, bytes}.
//
// WHY. Every device panel that embeds one of these builds used to have
// nothing truer to say about "what's running" than the code that renders it —
// no file anywhere records which commit a visitor is actually looking at. The
// panels (DeviceWall, DeviceMorph, ProjectDetail) fetch this file AT RUNTIME
// (see src/lib/appManifest.ts), so it is a live edge: whatever is on the CDN
// right now, not whatever was true when this repo last built.
//
// SIBLING KIND, same graceful-skip contract as gen-ops.mjs and
// gen-repo-stats.mjs: `repo`/`commit` need the app's own repo checked out
// beside this one (only true on the maintainer's machine and, for the twin,
// in refresh-twin.yml). Absent app repo -> keep the committed manifest's
// repo/commit/engine untouched and only refresh `bytes` (always locally
// knowable) and, on first write with nothing committed yet, skip the app
// entirely rather than fabricate a commit that was never read.
//
// `builtAt` is a wall-clock stamp, written only when repo/commit actually
// changed or the file didn't exist yet — same "only write on real content
// change" discipline emit() already uses in gen-kotlin-data.mjs, so a rerun
// with nothing new to say doesn't reset the freshness clock. That is the
// number DEVICE panels compare against freshnessSla.ts's
// APP_MANIFEST_SLA_DAYS to render DEGRADED: if the cron job that regenerates
// this stops running, `builtAt` stops moving and every panel eventually says
// so, instead of quietly serving an old build under a fresh-looking site.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEAVY = join(root, "heavy");
const today = () => new Date().toISOString().slice(0, 10);

/** Every build this site embeds, and where its own repo lives on disk when
 *  checked out beside this one. Paths match the conventions already proven
 *  out by sync-twin.mjs (`../cv-siddharth-kmp`) and gen-ops.mjs's leverage
 *  scan (`../../Android/<Repo>`); Stutter (Godot, not KMP) lives beside the
 *  Android checkouts' sibling `Games/` directory instead. */
const APPS = [
  { dir: "kursi-app", siblingRepo: join(root, "..", "..", "Android", "Kursi"), engine: "gradle-kmp" },
  { dir: "mileway-app", siblingRepo: join(root, "..", "..", "Android", "Mileway"), engine: "gradle-kmp" },
  { dir: "paymentslab-app", siblingRepo: join(root, "..", "..", "Android", "PaymentsLab"), engine: "gradle-kmp" },
  { dir: "portfolio-app", siblingRepo: join(root, "..", "cv-siddharth-kmp"), engine: "gradle-kmp" },
  { dir: "deadlock-app", siblingRepo: join(root, "..", "..", "Games", "deadlock"), engine: "godot" },
];

/** The real bytes this repo actually ships for that build — always knowable,
 *  sibling or not, because it's a walk of what's already checked out here. */
function dirBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n += e.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return n;
}

/** The repo slug, read from the sibling's OWN remote rather than hand-typed —
 *  the exact class of drift this lane exists to end. Gaddi/Doori/PaymentsLab-KMP
 *  are all renames of what the local Android/ directory names still say. */
function repoSlug(dir) {
  try {
    const url = execFileSync("git", ["-C", dir, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    return url.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
  } catch {
    return null;
  }
}

function commitOf(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Kotlin/Compose Multiplatform version pair, same libs.versions.toml read
 *  gen-repo-stats.mjs already does for the twin — reused here for the other
 *  three KMP apps too rather than re-deriving a second parser. */
function gradleKmpEngine(dir) {
  try {
    const toml = readFileSync(join(dir, "gradle", "libs.versions.toml"), "utf8");
    const v = (k) => toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"))?.[1] ?? null;
    const compose = v("compose-multiplatform");
    const kotlin = v("kotlin");
    if (!compose && !kotlin) return null;
    return [compose && `Compose Multiplatform ${compose}`, kotlin && `Kotlin ${kotlin}`].filter(Boolean).join(" / ");
  } catch {
    return null;
  }
}

function godotEngine(dir) {
  try {
    const proj = readFileSync(join(dir, "project.godot"), "utf8");
    const version = proj.match(/config\/features\s*=\s*PackedStringArray\("([^"]+)"/)?.[1];
    return version ? `Godot ${version}` : null;
  } catch {
    return null;
  }
}

let written = 0;
let skipped = 0;
for (const app of APPS) {
  const appDir = join(HEAVY, app.dir);
  if (!existsSync(appDir)) {
    console.log(`gen-app-manifests: ${appDir} does not exist, skipping ${app.dir}.`);
    skipped++;
    continue;
  }
  const outFile = join(appDir, "build-manifest.json");
  const previous = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null;

  const bytes = dirBytes(appDir);
  const hasSibling = existsSync(app.siblingRepo);
  const repo = hasSibling ? repoSlug(app.siblingRepo) : previous?.repo ?? null;
  const commit = hasSibling ? commitOf(app.siblingRepo) : previous?.commit ?? null;
  const engine = hasSibling
    ? (app.engine === "godot" ? godotEngine(app.siblingRepo) : gradleKmpEngine(app.siblingRepo)) ?? previous?.engine ?? null
    : previous?.engine ?? null;

  if (!repo || !commit) {
    console.log(`gen-app-manifests: ${app.dir} — no sibling checkout and no committed manifest, skipping.`);
    skipped++;
    continue;
  }

  // Only reset the freshness clock when repo/commit actually moved (or this
  // is the first manifest ever written for this app) — a rerun that finds
  // nothing new must not look like a fresh build.
  const contentChanged = !previous || previous.repo !== repo || previous.commit !== commit;
  const builtAt = contentChanged ? today() : previous.builtAt;

  const manifest = { repo, commit, builtAt, engine, bytes };
  mkdirSync(appDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n");
  written++;
  console.log(`gen-app-manifests: ${app.dir} -> ${repo}@${commit}, built ${builtAt}, ${(bytes / 1e6).toFixed(1)} MB${hasSibling ? "" : " (sibling absent, kept committed repo/commit)"}`);
}

console.log(`gen-app-manifests: ${written} written, ${skipped} skipped.`);
