import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The refresh chain must never be able to skip a generator again.
 *
 * `npm run refresh` was an 18-link `&&` chain, and `&&` is why one dead regex
 * in the fifth generator kept the thirteen after it from running for eight
 * consecutive days, and why chessDeep.ts reached 29 days stale while its own
 * alarm stayed green. scripts/refresh.mjs runs every step and reports at the
 * end instead.
 *
 * This guards the property, not the implementation: whatever `refresh` becomes,
 * it must not be a short-circuiting shell chain, and it must still cover every
 * generator the repo has.
 */
describe("the refresh chain cannot silence a generator", () => {
  const root = new URL("../", import.meta.url).pathname;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const runner = readFileSync(join(root, "scripts", "refresh.mjs"), "utf8");

  it("does not short-circuit on the first failure", () => {
    expect(
      pkg.scripts.refresh,
      "refresh must not be an && chain — one failure would skip every later generator",
    ).not.toMatch(/&&/);
  });

  it("runs every step through the runner", () => {
    expect(pkg.scripts.refresh).toContain("scripts/refresh.mjs");
  });

  /** The steps the runner declares, in order. */
  const steps = [...runner.matchAll(/^\s*"([a-z:-]+)",$/gm)].map((m) => m[1]);

  it("names only real npm scripts", () => {
    const unknown = steps.filter((s) => !(s in pkg.scripts));
    expect(unknown, `refresh.mjs names scripts that do not exist: ${unknown.join(", ")}`).toEqual([]);
  });

  it("still covers every generator", () => {
    expect(steps.length).toBeGreaterThanOrEqual(18);
    // The two that went stale because they ran last are the ones worth naming.
    for (const must of ["gen:chess-deep", "gen:system-prompt", "gen:hiresignal", "sync:media"]) {
      expect(steps, `${must} dropped out of the refresh chain`).toContain(must);
    }
  });

  it("still exits non-zero when a generator fails", () => {
    expect(runner).toMatch(/process\.exit\(1\)/);
  });
});
