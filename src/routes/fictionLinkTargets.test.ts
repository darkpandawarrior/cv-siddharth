import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard E: the one-way door on link TARGETS, not link text.
 *
 * /making is allowed to link at .md working files — kill records,
 * instructions to whoever writes next, arc tables — because it is the
 * making-of, behind its own spoiler gate. The fiction surfaces are never
 * allowed to link back out at it, or at the source repo's working files
 * directly. "A link is not a mention, it is a door: say where it opens."
 *
 * This scans the reader-facing fiction surfaces for every href/to literal
 * and checks the TARGET, not whatever text sits on the link.
 */

const root = new URL("../../", import.meta.url).pathname;

// Every surface a reader can reach fiction prose or its data from today.
// Widen this list the way canonLore.test.ts's BANNED scope had to widen to
// cover anthology.ts: a new fiction surface means adding it here.
const SCANNED = [
  "src/routes/canon.tsx",
  "src/routes/anthology.tsx",
  "src/routes/read.$slug.tsx",
  "src/data/anthology.ts",
  "src/data/canonLore.ts",
  "src/data/crossnav.ts",
];

// The route set this site actually serves, derived from src/routes/ rather
// than hand-kept, so a new legitimate route does not need a second edit here
// to avoid reading as "outside the fiction". "index"/"$"/"__root" are file
// router special cases, not routes a link target names.
const KNOWN_ROUTES = new Set(
  readdirSync(join(root, "src/routes"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(/\.tsx$/, "").split(".")[0])
    .filter((s) => s !== "index" && s !== "$" && s !== "__root"),
);

function extractTargets(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:href|to)\s*=\s*"([^"]*)"/g)) out.push(m[1]);
  return out;
}

const found = SCANNED.flatMap((rel) =>
  extractTargets(readFileSync(join(root, rel), "utf8")).map((target) => ({ file: rel, target })),
);

describe("fiction surface link targets", () => {
  // Guard D. A rewrite that moves every link into a template literal or a
  // helper this regex does not parse would leave `found` empty and every
  // assertion below green over a scan that read nothing. 17 targets are
  // found today across these files.
  it("actually found link targets to check, not nothing", () => {
    expect(found.length).toBeGreaterThan(10);
  });

  it("never points at a .md file or the source repo's fiction directory", () => {
    const offenders = found
      .filter(({ target }) => /\.md\b/i.test(target) || /github\.com\/.+\/fiction\//i.test(target))
      .map(({ file, target }) => `${file}: ${target}`);
    expect(offenders).toEqual([]);
  });

  it("never links at /making — that door only opens from the site chrome", () => {
    const offenders = found.filter(({ target }) => target.includes("/making")).map(({ file, target }) => `${file}: ${target}`);
    expect(offenders).toEqual([]);
  });

  it("stays inside the reader-facing route set for every internal target", () => {
    const offenders = found
      .filter(({ target }) => target.startsWith("/"))
      .map(({ file, target }) => ({ file, target, top: target.slice(1).split(/[/?#]/)[0] }))
      .filter(({ top }) => top && !KNOWN_ROUTES.has(top))
      .map(({ file, target }) => `${file}: ${target}`);
    expect(offenders).toEqual([]);
  });
});

describe("guard H: every anchor a link builds has something to land on", () => {
  // read.$slug.tsx builds `#teller-${w.id}` and crossnav.ts builds
  // `#blank-${entry}`. Neither id was ever emitted, so both links resolved to
  // the correct layer and then did nothing at all. The link worked. The jump
  // did not, and nothing in the suite could tell the difference, because a
  // hash that matches no element is not an error in a browser.
  //
  // This reads the two files as text rather than rendering, which is weaker
  // than a DOM assertion and is the reason it also asserts a floor: a rename
  // that breaks the regex would otherwise leave it finding nothing and passing.
  const hub = readFileSync(join(root, "src/routes/anthology.tsx"), "utf8");
  const reader = readFileSync(join(root, "src/routes/read.$slug.tsx"), "utf8");
  const crossnav = readFileSync(join(root, "src/data/crossnav.ts"), "utf8");

  const prefixes = [
    ...reader.matchAll(/hash:\s*`([a-z]+)-\$\{/g),
    ...crossnav.matchAll(/hash:\s*`([a-z]+)-\$\{/g),
  ].map((m) => m[1]);

  it("found the anchor builders at all", () => {
    expect(new Set(prefixes).size).toBeGreaterThanOrEqual(2);
  });

  it("emits an id for every anchor prefix a link constructs", () => {
    // Match the TEMPLATE the id is built from, anywhere in the hub, rather
    // than `id={` glued to a backtick. The ids are emitted from a ternary
    // inside one id={...}, so the glued form found nothing and reported both
    // prefixes orphaned while both were correctly rendered. The guard's own
    // regex encoded the intention and did not match the artifact, which is the
    // defect this guard exists to catch, committed inside the guard.
    const orphans = [...new Set(prefixes)].filter(
      (prefix) => !hub.includes("`" + prefix + "-${"),
    );
    expect(orphans, `anchor prefix(es) nothing renders an id for: ${orphans.join(", ")}`).toEqual([]);
  });
});

