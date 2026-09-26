// registry.test.ts - marker/row consistency for the ARCHIVE policy (M70,
// ARCHIVE.md, G-ARCHIVE). Two things happen here:
//
//   1. A real scan of every git-tracked text file for the marker, checked
//      against the real `ARCHIVE` array and the real filesystem. Today the
//      registry is empty and no marker exists yet, so this passes trivially
//      - the first real row (world-v1) arrives with P3-07.
//   2. In-memory break-it fixtures that exercise `validate` directly, so the
//      four failure shapes the acceptance criteria name are proven without
//      needing real archived files to exist yet.
//
// Deliberately does NOT compare `reviewBy` with today's date - that is the
// doctor's job (SH-4), not a test that must stay green forever (the
// store.ts lesson, M62): an aging entry can never turn `npm test` red.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ARCHIVE, type ArchiveEntry } from "./registry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MARKER_RE =
  /ponytail: archive\(([^)]+)\) until (\d{4}-\d{2}-\d{2}); removal recipe in ARCHIVE\.md#(\S+)/g;
const ANCHOR_RE = /<a id="([^"]+)">/g;

// Binary/compiled extensions a marker could never legibly live in - mirrors
// check-old-names.mjs's TEXT_EXT allowlist idea without importing it (that
// script's list is old-name specific, not archive specific).
const SKIP_EXT = /\.(png|jpe?g|gif|webp|glb|gltf|bin|mp4|mp3|wasm|woff2?|ttf|ico|pdf|lock)$/i;

export type Marker = { id: string; date: string; anchor: string; file: string };

export function findMarkers(file: string, text: string): Marker[] {
  const hits: Marker[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    hits.push({ id: m[1], date: m[2], anchor: m[3], file });
  }
  return hits;
}

function trackedTextFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !SKIP_EXT.test(f));
}

function scanMarkers(): Marker[] {
  const hits: Marker[] = [];
  for (const file of trackedTextFiles()) {
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue; // deleted/renamed between `git ls-files` and the read
    }
    hits.push(...findMarkers(file, text));
  }
  return hits;
}

export function anchorsIn(text: string): Set<string> {
  return new Set([...text.matchAll(ANCHOR_RE)].map((m) => m[1]));
}

/**
 * The consistency check itself, as a pure function so break-it fixtures
 * don't need real files on disk: `fileExists`/`testExists` default to a real
 * filesystem check but can be swapped for a fixture's own predicate.
 */
export function validate(
  archive: ArchiveEntry[],
  markers: Marker[],
  archiveMdAnchors: Set<string>,
  fileExists: (path: string) => boolean = (p) => existsSync(join(root, p)),
  testExists: (path: string) => boolean = fileExists,
): string[] {
  const errors: string[] = [];
  const byId = new Map(archive.map((e) => [e.id, e]));

  for (const m of markers) {
    const row = byId.get(m.id);
    if (!row) {
      errors.push(`${m.file}: marker archive(${m.id}) has no registry row`);
      continue;
    }
    if (row.reviewBy !== m.date) {
      errors.push(
        `${m.file}: marker archive(${m.id}) until ${m.date} != row reviewBy ${row.reviewBy}`,
      );
    }
  }

  for (const row of archive) {
    const files = Array.isArray(row.files) ? row.files : [];
    for (const f of files) {
      if (!fileExists(f)) errors.push(`${row.id}: names missing file ${f}`);
    }
    for (const t of row.tests) {
      if (!testExists(t)) errors.push(`${row.id}: names missing test ${t}`);
    }
    if (row.entryPoints.length === 0) {
      errors.push(`${row.id}: has no entry point`);
    } else if (!row.entryPoints.some((ep) => testExists(ep.test))) {
      errors.push(`${row.id}: no entry point whose test file exists`);
    }
    if (!archiveMdAnchors.has(row.id)) {
      errors.push(`ARCHIVE.md: missing anchor for ${row.id}`);
    }
  }

  for (const anchor of archiveMdAnchors) {
    if (!byId.has(anchor)) errors.push(`ARCHIVE.md: anchor ${anchor} has no registry row`);
  }

  return errors;
}

describe("archive registry (real scan)", () => {
  it(
    "passes on the empty registry",
    () => {
      const markers = scanMarkers();
      const archiveMd = readFileSync(join(root, "ARCHIVE.md"), "utf8");
      expect(validate(ARCHIVE, markers, anchorsIn(archiveMd))).toEqual([]);
    },
    // ponytail: scanning ~2k git-tracked files synchronously is fine alone
    // (~4s) but can miss the 5s default under full-suite CPU contention;
    // raise the ceiling here rather than optimizing the scan.
    15000,
  );

  it("ARCHIVE.md carries the marker format verbatim", () => {
    const archiveMd = readFileSync(join(root, "ARCHIVE.md"), "utf8");
    expect(archiveMd).toContain(
      "// ponytail: archive(<id>) until <reviewBy>; removal recipe in ARCHIVE.md#<id>",
    );
  });
});

describe("archive registry (break-it fixtures)", () => {
  const okRow: ArchiveEntry = {
    id: "demo",
    what: "a demo row",
    whyKept: "fixture",
    entryPoints: [{ kind: "url", how: "?demo=1", test: "e2e/demo.spec.ts" }],
    files: ["src/demo.ts"],
    tests: ["src/demo.test.ts"],
    removal: ["delete src/demo.ts"],
    archivedAt: "2026-01-01",
    reviewBy: "2026-07-01",
  };
  const exists = (p: string) => p.startsWith("src/demo") || p === "e2e/demo.spec.ts";
  const okMarker: Marker = { id: "demo", date: "2026-07-01", anchor: "demo", file: "fixture.ts" };
  const okAnchors = new Set(["demo"]);

  it("passes on a consistent fixture (sanity check for the fixture itself)", () => {
    expect(validate([okRow], [okMarker], okAnchors, exists)).toEqual([]);
  });

  it("fails: a marker without a row", () => {
    const orphan: Marker = { ...okMarker, id: "ghost" };
    const errors = validate([okRow], [okMarker, orphan], okAnchors, exists);
    expect(errors.some((e) => e.includes("archive(ghost) has no registry row"))).toBe(true);
  });

  it("fails: a row naming a missing file", () => {
    const badRow: ArchiveEntry = { ...okRow, files: ["src/does-not-exist.ts"] };
    const errors = validate([badRow], [okMarker], okAnchors, exists);
    expect(errors.some((e) => e.includes("names missing file src/does-not-exist.ts"))).toBe(true);
  });

  it("fails: a marker date that differs from reviewBy", () => {
    const staleMarker: Marker = { ...okMarker, date: "2026-06-01" };
    const errors = validate([okRow], [staleMarker], okAnchors, exists);
    expect(errors.some((e) => e.includes("!= row reviewBy 2026-07-01"))).toBe(true);
  });

  it("fails: a row without an entry point", () => {
    const noEntryRow: ArchiveEntry = { ...okRow, entryPoints: [] };
    const errors = validate([noEntryRow], [okMarker], okAnchors, exists);
    expect(errors.some((e) => e.includes("demo: has no entry point"))).toBe(true);
  });

  it("fails: a row whose only entry point's test file is missing", () => {
    const deadEntryRow: ArchiveEntry = {
      ...okRow,
      entryPoints: [{ kind: "key", how: "konami", test: "e2e/missing.spec.ts" }],
    };
    const errors = validate([deadEntryRow], [okMarker], okAnchors, exists);
    expect(errors.some((e) => e.includes("no entry point whose test file exists"))).toBe(true);
  });

  it("fails: ARCHIVE.md has a row with no matching anchor", () => {
    const errors = validate([okRow], [okMarker], new Set(), exists);
    expect(errors.some((e) => e.includes("missing anchor for demo"))).toBe(true);
  });

  it("fails: ARCHIVE.md has an anchor with no matching row", () => {
    const errors = validate([], [], new Set(["orphan-anchor"]), exists);
    expect(errors.some((e) => e.includes("anchor orphan-anchor has no registry row"))).toBe(true);
  });
});
