/**
 * Guards budgets.json against a silent ratchet loosening.
 *
 * budgets.json is a ratchet (scripts/check-budget.mjs's own comment): a
 * regression fails the build, and a deliberate increase is a reviewed, human
 * edit. But "reviewed" only holds if nothing else can move the ceiling —
 * and every OTHER lane in this wave runs `git diff --exit-code budgets.json`
 * (G4), which only catches a change once it is already staged. This test
 * fails inside the ordinary `npx vitest run` gate instead, so a budget
 * change shows up the moment it lands, not just at the diff-review step.
 *
 * budgets.lock.json is a byte copy of budgets.json taken when this lane
 * landed (M29). The rule: every value budgets.lock.json ever recorded must
 * still equal budgets.json's value; the ONLY new key a later lane may add is
 * under namedChunks (P2-10b's Globe chunk, the one named exception in G4).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8")) as Record<string, unknown>;

/** Recursively flattens an object/array into [pathSegments, leafValue] pairs. */
function leaves(value: unknown, path: string[] = []): Array<[string[], unknown]> {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    return entries.flatMap(([k, v]) => leaves(v, [...path, k]));
  }
  return [[path, value]];
}

const get = (obj: unknown, path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

/**
 * Every leaf budgets.lock.json ever recorded must still match budgets.json.
 * Any leaf present in `current` but absent from `lock` is a NEW key, allowed
 * only when its path starts with namedChunks.
 */
export function diffBudgets(lock: unknown, current: unknown): string[] {
  const errors: string[] = [];
  const lockLeaves = leaves(lock);
  const lockPaths = new Set(lockLeaves.map(([p]) => p.join(".")));

  for (const [path, lockValue] of lockLeaves) {
    const currentValue = get(current, path);
    if (currentValue !== lockValue) {
      errors.push(
        `budgets.json:${path.join(".")} changed from ${JSON.stringify(lockValue)} (budgets.lock.json) to ` +
          `${JSON.stringify(currentValue)} — a budget ceiling only moves through a reviewed, human edit ` +
          `to both files together.`,
      );
    }
  }
  for (const [path] of leaves(current)) {
    const key = path.join(".");
    if (lockPaths.has(key)) continue;
    if (path[0] !== "namedChunks") {
      errors.push(`budgets.json:${key} is a new key outside namedChunks — additions are only allowed there.`);
    }
  }
  return errors;
}

describe("budgets.json never drifts from its lock without review", () => {
  it("the real budgets.json passes against budgets.lock.json", () => {
    expect(diffBudgets(readJson("budgets.lock.json"), readJson("budgets.json"))).toEqual([]);
  });

  // Break-it (G15): in-memory fixtures, never the real files on disk.
  it("changing largestChunkBytes in an in-memory copy fails", () => {
    const lock = readJson("budgets.lock.json");
    const current = { ...lock, largestChunkBytes: (lock.largestChunkBytes as number) + 1 };
    const errors = diffBudgets(lock, current);
    expect(errors.some((e) => e.includes("largestChunkBytes"))).toBe(true);
  });

  it("adding namedChunks.Globe passes", () => {
    const lock = readJson("budgets.lock.json");
    const current = {
      ...lock,
      namedChunks: { ...(lock.namedChunks as Record<string, number>), Globe: 90_000 },
    };
    expect(diffBudgets(lock, current)).toEqual([]);
  });

  it("adding a top-level key outside namedChunks fails", () => {
    const lock = readJson("budgets.lock.json");
    const current = { ...lock, newTopLevelKey: 1 };
    const errors = diffBudgets(lock, current);
    expect(errors.some((e) => e.includes("newTopLevelKey"))).toBe(true);
  });
});
