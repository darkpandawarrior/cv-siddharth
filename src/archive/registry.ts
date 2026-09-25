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

// The world-v1 row arrives with P3-07 (world-v1 archived behind five hidden
// entry points per M70); this lane ships the type and the empty registry.
export const ARCHIVE: ArchiveEntry[] = [];
