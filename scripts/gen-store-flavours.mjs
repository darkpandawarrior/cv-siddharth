/**
 * Per-client brand assets for the shelf: the launcher icon each build shipped
 * with, and the colour its theme was set to.
 *
 * WHY IT IS NEEDED. Google can only serve an icon for an app that is still on
 * Google Play, and a large share of this shelf is not — those apps were
 * published, later taken down, and survive only as an archived listing page,
 * which the Archive does not keep the icon for. Without this step they render
 * as identical grey squares.
 *
 * Reads two source checkouts named by environment variable (see REPOS) and
 * writes .store-flavours.json plus the icons into public/store/. Both outputs
 * are committed, so nothing about a build depends on having the inputs.
 *
 * Usage: SHELF_RIDER_REPO=... SHELF_DRIVER_REPO=... node scripts/gen-store-flavours.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const OUT = resolve(process.cwd(), ".store-flavours.json");
const ICON_DIR = resolve(process.cwd(), "public/store");
/**
 * The two source checkouts, supplied by the operator.
 *
 * Deliberately not hardcoded and deliberately not named: this repository is
 * public and its inputs are not, and a path is a statement about what sits on
 * somebody's disk. Absent them, the script refuses to run rather than guessing.
 */
const REPOS = [
  { dir: process.env.SHELF_RIDER_REPO, side: "rider" },
  { dir: process.env.SHELF_DRIVER_REPO, side: "driver" },
].filter((r) => r.dir);
/** Biggest first — the launcher icon we want is the one with the most pixels. */
const DENSITIES = ["xxxhdpi", "xxhdpi", "xhdpi", "hdpi", "mdpi"];

const git = (dir, args, encoding = "utf8") =>
  execFileSync("git", ["-C", dir, ...args], { encoding, maxBuffer: 1 << 28 });
const tryGit = (dir, args, encoding = "utf8") => {
  try {
    return git(dir, args, encoding);
  } catch {
    return null;
  }
};

/**
 * Flavour blocks in a build.gradle, by brace depth.
 *
 * Depth matters: `applicationId` also appears in `defaultConfig`, and a naive
 * line scan would hand every flavour in the file the base package id.
 */
function parseFlavours(gradle) {
  const out = [];
  let depth = 0;
  let flavoursAt = -1;
  let current = null;
  for (const raw of gradle.split("\n")) {
    const line = raw.trim();
    if (/^productFlavors\s*\{/.test(line)) flavoursAt = depth;

    // A flavour opens exactly one level inside productFlavors.
    if (flavoursAt >= 0 && depth === flavoursAt + 1) {
      const name = /^([A-Za-z][A-Za-z0-9_]*)\s*\{\s*$/.exec(line)?.[1];
      if (name) current = { name, id: null, color: null };
    }
    if (current) {
      const id = /^applicationId\s*["']([^"']+)["']/.exec(line)?.[1];
      if (id) current.id = id;
      const colour = /resValue\s+["']color["']\s*,\s*["'](theme_color|colorPrimary)["']\s*,\s*["'](#[0-9A-Fa-f]{6,8})["']/.exec(
        line,
      );
      // theme_color wins: colorPrimary is often the darker variant.
      if (colour && (!current.color || colour[1] === "theme_color")) current.color = colour[2];
    }

    for (const ch of raw) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (current && depth === flavoursAt + 1) {
          if (current.id) out.push(current);
          current = null;
        }
        if (flavoursAt >= 0 && depth === flavoursAt) flavoursAt = -1;
      }
    }
  }
  return out;
}

/* ── Sweep the sources ──────────────────────────────────────────────────── */

const clients = new Map();
if (REPOS.length === 0)
  throw new Error("[flavours] set SHELF_RIDER_REPO and SHELF_DRIVER_REPO — refusing to guess");
for (const { dir, side } of REPOS) {
  if (!existsSync(dir)) throw new Error(`[flavours] no checkout at ${dir}`);
  const branches = git(dir, ["branch", "-r", "--format=%(refname:short)"])
    .split("\n")
    .filter((b) => /\/wl[_-]/i.test(b));

  let n = 0;
  for (const branch of branches) {
    const paths = tryGit(dir, ["grep", "-l", "-E", "productFlavors", branch, "--", "*build.gradle"]);
    if (!paths) continue;
    for (const entry of paths.trim().split("\n")) {
      // `git grep -l <rev>` prints "<rev>:<path>", and the path itself contains
      // colons nowhere but the rev prefix does — split once, from the left.
      const path = entry.slice(entry.indexOf(":") + 1);
      const gradle = tryGit(dir, ["show", `${branch}:${path}`]);
      if (!gradle) continue;
      const moduleDir = path.replace(/\/build\.gradle$/, "");
      for (const f of parseFlavours(gradle)) {
        // First definition of a client wins; later ones are re-cuts of it.
        if (clients.has(f.id)) continue;
        clients.set(f.id, { ...f, side, repo: dir, branch, moduleDir });
      }
    }
    if (++n % 200 === 0) console.log(`[flavours] ${side} ${n}/${branches.length}`);
  }
}
console.log(`[flavours] ${clients.size} client flavours located`);

/* ── Resolve each one's launcher icon ───────────────────────────────────── */

mkdirSync(ICON_DIR, { recursive: true });
let icons = 0;
let missing = 0;

for (const [id, f] of clients) {
  const file = resolve(ICON_DIR, `${id}.webp`);
  if (existsSync(file)) continue;
  let png = null;
  for (const density of DENSITIES) {
    for (const name of ["ic_launcher.png", "ic_launcher_round.png", "app_icon.png"]) {
      png = tryGit(
        f.repo,
        ["show", `${f.branch}:${f.moduleDir}/src/${f.name}/res/mipmap-${density}/${name}`],
        "buffer",
      );
      if (png) break;
    }
    if (png) break;
  }
  if (!png) {
    missing++;
    continue;
  }
  try {
    await sharp(png).resize(128, 128, { fit: "contain" }).webp({ quality: 82 }).toFile(file);
    icons++;
  } catch {
    missing++;
  }
}
console.log(`[flavours] ${icons} icon(s) resolved, ${missing} without one`);

const out = {};
for (const [id, f] of clients) out[id] = { flavour: f.name, color: f.color, side: f.side };
writeFileSync(OUT, JSON.stringify(out));
console.log(
  `[flavours] wrote ${Object.keys(out).length} entries, ${Object.values(out).filter((v) => v.color).length} with a brand colour`,
);
