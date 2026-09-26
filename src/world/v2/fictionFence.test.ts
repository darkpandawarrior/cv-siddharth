import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Morkinstar fence, both directions (world-v2-spec.md §5.19; this
 * lane's own task list): a static import/reference scan, sibling of
 * `routes/fictionLinkTargets.test.ts` and `purity.test.ts`'s "not written
 * yet -> skip, not fail" convention for files a later lane still owns.
 *
 *   1. `src/world/v2/fiction/*` never imports `data/profile`, `destinations`
 *      or `storyMap` (§5.19's own bullet).
 *   2. `src/world/v2/fiction/*` never imports `src/lib/sky.ts`,
 *      `src/lib/stars.ts`, or references `public/sky` — the fiction layer
 *      renders its own moon-white/deep-ground sky, never the real one
 *      (this lane's task list).
 *   3. `destinations.ts`, `Landmarks.tsx`, `LandmarkPanel.tsx` never import
 *      `anthology`, `canonLore`, or anything under `world/v2/fiction/`.
 *   4. `NightSky` (wherever it lands) never imports `anthology`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_DIR = HERE; // src/world/v2/
const WORLD_DIR = join(V2_DIR, "..");
const SRC_DIR = join(WORLD_DIR, "..");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  return [...code.matchAll(/import[^;]*from\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

/** The checker under test: a pure function of source text. `forbidden` is
 *  matched against each import specifier AND, separately, as a plain
 *  substring of the whole file (for a non-import reference like a
 *  `public/sky` asset path). */
export function fenceViolations(source: string, forbidden: readonly RegExp[]): string[] {
  const code = stripComments(source);
  const specifiers = importSpecifiers(source);
  const violations: string[] = [];
  for (const re of forbidden) {
    for (const spec of specifiers) if (re.test(spec)) violations.push(`imports ${spec}`);
    if (re.test(code) && !specifiers.some((s) => re.test(s))) {
      // matched somewhere other than an import specifier (a string literal
      // asset path, e.g. "/sky/stars-hyg41-m5.bin")
      if (code.match(re)) violations.push(`references ${re.source}`);
    }
  }
  return [...new Set(violations)];
}

function fictionModules(): string[] {
  const dir = join(V2_DIR, "fiction");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const FICTION_FORBIDDEN = [/(^|\/)data\/profile(\.ts|\/)/, /destinations\.ts/, /storyMap\.ts/];
const FICTION_SKY_FORBIDDEN = [/lib\/sky\.ts/, /lib\/stars\.ts/, /public\/sky/];
const OUTWARD_FORBIDDEN = [/anthology\.ts/, /canonLore\.ts/, /world\/v2\/fiction\//];

describe("fictionFence: fiction/ never imports the real/profile layer", () => {
  const modules = fictionModules();
  if (modules.length === 0) {
    it.skip("src/world/v2/fiction/*.ts (not written yet)", () => {});
  } else {
    for (const path of modules) {
      it(`${path.replace(SRC_DIR, "src")} stays inside the fence (profile/destinations/storyMap)`, () => {
        expect(fenceViolations(readFileSync(path, "utf8"), FICTION_FORBIDDEN)).toEqual([]);
      });
      it(`${path.replace(SRC_DIR, "src")} never reaches for the real sky (sky.ts/stars.ts/public/sky)`, () => {
        expect(fenceViolations(readFileSync(path, "utf8"), FICTION_SKY_FORBIDDEN)).toEqual([]);
      });
    }
  }
});

describe("fictionFence: the real/profile layer never imports fiction outward", () => {
  const SCANNED = [
    { rel: "src/world/destinations.ts", abs: join(WORLD_DIR, "destinations.ts") },
    { rel: "src/world/Landmarks.tsx", abs: join(WORLD_DIR, "Landmarks.tsx") },
    { rel: "src/world/LandmarkPanel.tsx", abs: join(WORLD_DIR, "LandmarkPanel.tsx") },
  ];

  it("every scanned file actually exists (the scan reads something, not nothing)", () => {
    for (const { abs } of SCANNED) expect(existsSync(abs), abs).toBe(true);
  });

  for (const { rel, abs } of SCANNED) {
    it(`${rel} never imports anthology, canonLore, or world/v2/fiction/`, () => {
      expect(fenceViolations(readFileSync(abs, "utf8"), OUTWARD_FORBIDDEN)).toEqual([]);
    });
  }

  // NightSky doesn't exist yet at any known path — same skip convention.
  const nightSkyCandidates = ["NightSky.tsx", "world/NightSky.tsx", "world/v2/NightSky.tsx"].map((p) =>
    join(SRC_DIR, p),
  );
  const nightSky = nightSkyCandidates.find(existsSync);
  if (!nightSky) {
    it.skip("NightSky (not written yet)", () => {});
  } else {
    it("NightSky never imports anthology", () => {
      expect(fenceViolations(readFileSync(nightSky, "utf8"), [/anthology\.ts/])).toEqual([]);
    });
  }
});

describe("fictionFence: the checker actually fires (break-it, G15)", () => {
  // Inlined rather than a separate __fixtures__ file — this test file is
  // this lane's only owned path here (master-plan.json P2-03b `owns`), and
  // an injected fixture STRING proves the checker fires exactly as well as
  // a fixture file would, without adding a path outside that list (G2).
  const fixture = [
    'import { landmarkDestinations } from "../../world/destinations.ts";',
    'import { anthology } from "../../data/anthology.ts";',
    'import { PUNE } from "../../lib/sky.ts";',
    "export const x = landmarkDestinations().length + anthology.title.length + PUNE.lat;",
  ].join("\n");

  it("flags the banned imports in the fixture, both directions", () => {
    const inward = fenceViolations(fixture, FICTION_FORBIDDEN);
    expect(inward.some((v) => v.includes("destinations.ts"))).toBe(true);
    const outward = fenceViolations(fixture, OUTWARD_FORBIDDEN);
    expect(outward.some((v) => v.includes("anthology.ts"))).toBe(true);
    const sky = fenceViolations(fixture, FICTION_SKY_FORBIDDEN);
    expect(sky.some((v) => v.includes("lib/sky.ts"))).toBe(true);
  });

  it("is not merely a pass-through (a clean snippet reports nothing)", () => {
    expect(fenceViolations("export const x = 1 + 2;", FICTION_FORBIDDEN)).toEqual([]);
  });
});
