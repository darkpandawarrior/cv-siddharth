/**
 * Harvests each white-label client's OWN brand assets out of the branch that
 * built it: the launcher icon it shipped with, and the brand colour its theme
 * was tinted to.
 *
 * WHY THIS EXISTS. The Play Store can only give an icon for an app that is still
 * on the Play Store, and 90 of these are not — they were published, pulled, and
 * are now provable only from the Internet Archive. Their icons are not gone
 * though: every white-label build is a product flavour, and a product flavour
 * that rebrands the app has to carry its own `ic_launcher` and its own
 * `resValue "color", 'theme_color'`. Those are still sitting in the branch.
 *
 * So a delisted app can still be shown as the thing it was, in its own colour,
 * with its own icon — recovered from the commit that shipped it rather than
 * left as a blank square.
 *
 * WHAT IT PARSES. One sweep over every wl_* branch tip, reading the
 * `productFlavors { }` block of each build.gradle:
 *
 *     crossWind {
 *         applicationId "product.customer.crossWind"
 *         resValue "color", 'theme_color', "#C4140A"
 *     }
 *
 * — which gives flavour name → package id → brand colour, and the flavour name
 * is what locates the launcher icon under `src/<flavour>/res/mipmap-<density>/`
 * in the same tree.
 *
 * NO FALLING BACK TO THE BASE ICON. A flavour with no icon of its own inherits
 * Jugnoo's, and putting Jugnoo's logo on a client's card would be a small lie
 * told 90 times. Those stay blank and the UI draws an initial.
 *
 * Writes .store-flavours.json (gitignored, ~3 min) and the icons themselves into
 * public/store/. gen-store.mjs reads both.
 *
 * Usage: node scripts/gen-store-flavours.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import sharp from "sharp";

const OUT = resolve(process.cwd(), ".store-flavours.json");
const ICON_DIR = resolve(process.cwd(), "public/store");
const REPOS = [
  { dir: `${homedir()}/Repos/Android/Jugnoo/jugnoo-android-autos`, side: "rider" },
  { dir: `${homedir()}/Repos/Android/Jugnoo/jugnoo-android-driver`, side: "driver" },
];
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

/* ── Sweep every branch ─────────────────────────────────────────────────── */

const clients = new Map();
for (const { dir, side } of REPOS) {
  if (!existsSync(dir)) throw new Error(`[flavours] missing repo ${dir}`);
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
        // First branch that defines a client wins; later branches are re-cuts.
        if (clients.has(f.id)) continue;
        clients.set(f.id, { ...f, side, repo: dir, branch, moduleDir });
      }
    }
    if (++n % 200 === 0) console.log(`[flavours] ${side} ${n}/${branches.length}`);
  }
}
console.log(`[flavours] ${clients.size} client flavours located`);

/* ── Pull each one's launcher icon out of its branch ────────────────────── */

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
console.log(`[flavours] ${icons} icon(s) recovered from branches, ${missing} flavour(s) had none`);

const out = {};
for (const [id, f] of clients) out[id] = { flavour: f.name, color: f.color, side: f.side };
writeFileSync(OUT, JSON.stringify(out));
console.log(
  `[flavours] wrote ${Object.keys(out).length} entries, ${Object.values(out).filter((v) => v.color).length} with a brand colour`,
);
