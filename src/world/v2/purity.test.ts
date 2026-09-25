import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * D1 Deterministic (living-ledger-spec §3.4): every pure module under
 * src/world/v2 is free of Math.random(, Date.now(, performance.now(,
 * an argument-less `new Date()`, and a hashNoise/stringSeed call seeded
 * from a map/forEach callback's own index rather than a stable key.
 *
 * The fixed module list below is the glob this lane's task calls for:
 * later lanes (P2-03c and beyond) add grammar.ts, worldModel.ts,
 * futureSlots.ts, visitDiff.ts, valley.ts, skyFrame.ts, spawn.ts and
 * src/world/v2/live/*.ts without ever touching this file — a listed
 * module that doesn't exist yet is skipped, not failed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_DIR = HERE; // this file already lives at src/world/v2/

const PURE_MODULE_NAMES = [
  "hash",
  "ledger",
  "forms",
  "streams",
  "grammar",
  "worldModel",
  "futureSlots",
  "visitDiff",
  "valley",
  "skyFrame",
  "spawn",
];

function liveModules(): string[] {
  const dir = join(V2_DIR, "live");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const INDEX_SEEDED_RE = /\.(?:map|forEach)\(\s*\(\s*\w*\s*,\s*(\w+)\s*\)\s*=>[\s\S]{0,300}?\b(?:hashNoise|stringSeed)\([^)]*\b\1\b/;

/** The checker under test: a pure function of source text, so it is
 *  itself directly testable without touching the filesystem. */
export function purityViolations(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];
  if (code.includes("Math.random(")) violations.push("Math.random(");
  if (code.includes("Date.now(")) violations.push("Date.now(");
  if (code.includes("performance.now(")) violations.push("performance.now(");
  if (/new Date\(\s*\)/.test(code)) violations.push("argument-less new Date()");
  if (INDEX_SEEDED_RE.test(code)) violations.push("index-seeded hashNoise/stringSeed");
  return violations;
}

describe("purity: real modules", () => {
  for (const name of PURE_MODULE_NAMES) {
    const path = join(V2_DIR, `${name}.ts`);
    if (!existsSync(path)) {
      it.skip(`${name}.ts (not written yet)`, () => {});
      continue;
    }
    it(`${name}.ts has no impurity`, () => {
      expect(purityViolations(readFileSync(path, "utf8"))).toEqual([]);
    });
  }

  const live = liveModules();
  if (live.length === 0) {
    it.skip("live/*.ts (none written yet)", () => {});
  } else {
    for (const path of live) {
      it(`live/${path.split("/").pop()} has no impurity`, () => {
        expect(purityViolations(readFileSync(path, "utf8"))).toEqual([]);
      });
    }
  }
});

describe("purity: the checker actually fires (break-it, G15)", () => {
  const fixture = readFileSync(join(V2_DIR, "__fixtures__/core/impure.fixture.ts"), "utf8");
  const found = purityViolations(fixture);

  it("flags every forbidden pattern in the fixture", () => {
    expect(found).toContain("Math.random(");
    expect(found).toContain("Date.now(");
    expect(found).toContain("performance.now(");
    expect(found).toContain("argument-less new Date()");
    expect(found).toContain("index-seeded hashNoise/stringSeed");
  });

  it("is not merely a pass-through (a clean snippet reports nothing)", () => {
    expect(purityViolations("export const x = 1 + 2;")).toEqual([]);
  });
});
