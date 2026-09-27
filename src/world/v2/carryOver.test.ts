// CRAFT-5 / M6 / M70's own gate (idea-atlas.md#CRAFT-5, master-plan.md#M6,
// lane P3-05 acceptance): every v1 feature id must be accounted for, every
// "ported" entry's file must exist, and no archived (v1-only) file may be
// imported by any src/world/v2 module.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHIVED_V1_FILES, CARRY_OVER, carryOverViolations, type CarryOverEntry } from "./carryOver.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_DIR = HERE; // src/world/v2
const WORLD_DIR = join(V2_DIR, "..");
const REPO_ROOT = join(WORLD_DIR, "..", "..");

// The 16 v1 feature ids CRAFT-5 names (idea-atlas.md#CRAFT-5,
// master-plan.md#M6's task list), copied here rather than imported from
// carryOver.ts so shrinking that file's own list cannot silently shrink
// what this test requires too.
const REQUIRED_V1_IDS = [
  "gps",
  "threads",
  "litMap",
  "explored",
  "corpus",
  "trail",
  "wake",
  "artifacts",
  "ghosts",
  "pavilions",
  "monuments",
  "districtWest",
  "reality-ledger",
  "skyBinding",
  "rain",
  "lamps",
  "repertoire-pillars",
];

describe("carryOver: the real manifest", () => {
  it("has no violations (every required id present, every entry well-formed)", () => {
    expect(carryOverViolations(CARRY_OVER, REQUIRED_V1_IDS)).toEqual([]);
  });

  it("every 'ported' entry's file actually exists", () => {
    for (const entry of CARRY_OVER) {
      if (entry.status !== "ported") continue;
      const abs = join(REPO_ROOT, entry.file!);
      expect(existsSync(abs), `${entry.id}: ${entry.file}`).toBe(true);
    }
  });

  it("every archived file actually exists (nothing archives a path that isn't there)", () => {
    for (const rel of ARCHIVED_V1_FILES) {
      expect(existsSync(join(REPO_ROOT, rel)), rel).toBe(true);
    }
  });
});

describe("carryOver: break-it (G15)", () => {
  it("fails when a required v1 id is missing", () => {
    const withoutGps = CARRY_OVER.filter((e) => e.id !== "gps");
    const violations = carryOverViolations(withoutGps, REQUIRED_V1_IDS);
    expect(violations).toContain("missing v1 id: gps");
  });

  it("fails when a 'ported' entry's file is missing", () => {
    const broken: CarryOverEntry[] = [{ id: "gps", status: "ported" }];
    expect(carryOverViolations(broken, ["gps"])).toContain('gps: status "ported" has no file');
  });

  it("fails when a 'degraded'/'dropped' entry has no reason", () => {
    const broken: CarryOverEntry[] = [{ id: "trail", status: "dropped" }];
    expect(carryOverViolations(broken, ["trail"])).toContain('trail: status "dropped" has no reason');
  });

  it("a well-formed fixture passes clean", () => {
    const clean: CarryOverEntry[] = [
      { id: "gps", status: "ported", file: "src/world/v2/layers/GpsLens.tsx" },
      { id: "trail", status: "dropped", reason: "no meaning on a river" },
    ];
    expect(carryOverViolations(clean, ["gps", "trail"])).toEqual([]);
  });
});

// ── no archived file is imported by any src/world/v2 module ────────────────

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function importSpecifiers(source: string): string[] {
  return [...stripComments(source).matchAll(/import[^;]*from\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Every non-test src/world/v2 module. Test files are excluded: a fixture
 *  string like fictionFence.test.ts's own break-it literal
 *  ('import ... from "../../world/destinations.ts"') is source TEXT that
 *  looks like an import to a regex scan but drives no module graph. The
 *  swap PR's real risk is a v2 RUNTIME/type import of a retired file, which
 *  only non-test modules can carry. */
function v2Modules(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".test.tsx")
      ) {
        out.push(p);
      }
    }
  };
  walk(V2_DIR);
  return out;
}

/** Resolves a relative import specifier against the importing file's own
 *  directory (so "./Terrain.tsx" inside src/world/v2/WorldV2.tsx resolves
 *  to v2's OWN Terrain.tsx, never v1's, since a basename-only match would
 *  wrongly conflate the two files that happen to share a name), and
 *  strips a trailing .ts/.tsx so it compares equal to `archivedAbs`
 *  regardless of which extension the specifier spelled out. Non-relative
 *  specifiers (bare package imports) can never resolve to a repo file. */
function resolvesTo(specifier: string, importerDir: string, archivedAbs: string): boolean {
  if (!specifier.startsWith(".")) return false;
  const resolved = join(importerDir, specifier).replace(/\.tsx?$/, "");
  return resolved === archivedAbs.replace(/\.tsx?$/, "");
}

/** True when `source` (a src/world/v2 module at `importerAbs`) imports the
 *  archived v1 file at `archivedRel` (e.g. "src/world/gps.ts"), via any
 *  relative depth ("../gps.ts" from v2/, "../../gps.ts" from v2/layers/,
 *  "../../world/gps.ts", …), resolved by path, not by basename text. */
export function importsArchivedFile(source: string, importerAbs: string, archivedAbs: string): boolean {
  const importerDir = dirname(importerAbs);
  return importSpecifiers(source).some((spec) => resolvesTo(spec, importerDir, archivedAbs));
}

describe("carryOver: no archived v1 file is imported by src/world/v2", () => {
  const modules = v2Modules();

  it("scanned at least one v2 module (the scan reads something, not nothing)", () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  for (const archivedRel of ARCHIVED_V1_FILES) {
    const archivedAbs = join(REPO_ROOT, archivedRel);
    it(`no src/world/v2 module imports ${archivedRel}`, () => {
      const offenders = modules.filter((m) =>
        importsArchivedFile(readFileSync(m, "utf8"), m, archivedAbs),
      );
      expect(offenders.map((m) => m.replace(REPO_ROOT + "/", ""))).toEqual([]);
    });
  }

  it("break-it: the scanner actually flags an import of an archived file", () => {
    const importer = join(WORLD_DIR, "v2", "layers", "Fixture.tsx");
    const fixture = 'import { rainMode } from "../../Rain.tsx";\nexport const x = rainMode;';
    expect(importsArchivedFile(fixture, importer, join(WORLD_DIR, "Rain.tsx"))).toBe(true);
    expect(importsArchivedFile(fixture, importer, join(WORLD_DIR, "Corpus.tsx"))).toBe(false);
  });

  it("does not confuse v2's own Terrain.tsx with v1's (same basename, different dirs)", () => {
    const worldV2Tsx = 'import { Terrain } from "./Terrain.tsx";';
    const importer = join(V2_DIR, "WorldV2.tsx");
    expect(importsArchivedFile(worldV2Tsx, importer, join(WORLD_DIR, "Terrain.tsx"))).toBe(false);
  });
});
