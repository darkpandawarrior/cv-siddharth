// Typed registry for AR-00 (ARCHIVE.md#AR-00, master-plan.md#M70, G-ARCHIVE).
//
// Erasable TypeScript only: no enum, no namespace, no parameter-property
// shorthand, no `const enum` - every type here vanishes under Node's
// `--experimental-strip-types` (Node 26) with zero transform, so
// scripts/*.mjs can `import { ARCHIVE } from "../src/archive/registry.ts"`
// directly without going through tsc or vite first.
//
// Whatever a lane supersedes is deleted by default. If it is kept instead,
// the lane adds a row here, an ARCHIVE.md section under the matching anchor,
// and reaches it through at least one easter-egg entry point with an e2e
// test, then marks every touchpoint:
//   // ponytail: archive(<id>) until <reviewBy>; removal recipe in ARCHIVE.md#<id>
// registry.test.ts enforces that every marker has a row and every row is
// real (files, tests and entry points all exist) - see that file for what
// it checks and, just as important, what it deliberately does not.

export type ArchiveEntryPoint = {
  kind: "url" | "terminal" | "palette" | "world" | "key";
  how: string;
  test: string;
};

export type ArchiveEntry = {
  id: string;
  what: string;
  whyKept: string;
  entryPoints: ArchiveEntryPoint[];
  files: string[] | { from: "carryOver:archived" };
  tests: string[];
  removal: string[];
  archivedAt: string;
  reviewBy: string;
};

// Planned phase-3 deploy date. The ship gate replaces it if deployment slips.
export const ARCHIVE: ArchiveEntry[] = [{
  id: "world-v1",
  what: "The first drivable Night Survey world",
  whyKept: "Production rollback and a record of the first world",
  entryPoints: [{ kind: "url", how: "/playground?world=v1", test: "e2e/world-driving.spec.ts" }],
  files: { from: "carryOver:archived" },
  tests: ["e2e/world-driving.spec.ts", "e2e/world-fallback.spec.ts", "e2e/playground-world.spec.ts", "e2e/world-reality.spec.ts"],
  removal: [
    "Remove the world=v1 validation in src/routes/playground.tsx and the v1 branches/imports in src/Playground.tsx.",
    "Remove every entry point added by P4-00 and its archive plaque.",
    "Remove ARCHIVED_V1_FILES from src/world/v2/carryOver.ts after confirming no active module imports them.",
    "Remove the four v1 specs and the archive entry-point specs added by P4-00.",
    "Remove this registry row, its markers and the ARCHIVE.md world-v1 section.",
  ],
  archivedAt: "2026-10-04",
  reviewBy: "2027-04-04",
}];
