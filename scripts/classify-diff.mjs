#!/usr/bin/env node
// Data-loss tripwire behind each generator's own refusal to write bad data
// (self-healing-spec.md#3, point 4). Exits 0 only when every path changed
// since <base> is a declared generator output (never code) AND no declared
// output collapsed. Prints the offending paths otherwise.
//
// Usage: node scripts/classify-diff.mjs [base-ref]   (default origin/main)
import { execFileSync } from "node:child_process";
import { matchesGlob } from "node:path";
import { GENERATORS } from "./generators.mjs";

const base = process.argv[2] ?? "origin/main";
const OUTPUTS = GENERATORS.flatMap((g) => g.outputs);

function changedPaths() {
  return execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function show(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  } catch {
    return null; // absent at that ref (new or deleted file)
  }
}

// Generated data files export one top-level array/object literal; an empty
// one is a collapse even when it didn't shrink 50% (e.g. a 200B stub that
// replaced a 300B stub).
function isEmptyCollection(text) {
  return /=\s*(\[\s*\]|\{\s*\})\s*;?\s*$/.test(text.trim());
}

const bad = [];
for (const path of changedPaths()) {
  if (!OUTPUTS.some((glob) => matchesGlob(path, glob))) {
    bad.push(`${path}: not a declared generator output`);
    continue;
  }
  const after = show("HEAD", path);
  if (after === null) continue; // deleted: nothing shrank
  const before = show(base, path);
  const beforeSize = before === null ? 0 : Buffer.byteLength(before);
  const afterSize = Buffer.byteLength(after);
  if (beforeSize > 0 && afterSize < beforeSize * 0.5) {
    bad.push(`${path}: shrank from ${beforeSize}B to ${afterSize}B (>50%)`);
  } else if (isEmptyCollection(after)) {
    bad.push(`${path}: became an empty collection`);
  }
}

if (bad.length) {
  for (const line of bad) console.error(`classify-diff: ${line}`);
  process.exit(1);
}
console.log("classify-diff: ok");
process.exit(0);
