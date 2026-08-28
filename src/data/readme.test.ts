import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoStats } from "./repoStats.ts";
import { surfaces } from "./surfaces.ts";

/**
 * The README is outward facing and it makes checkable claims. This is the same
 * gate src/data/surfaces.test.ts puts on the registry's spelled-out counts, for
 * the same reason: the site advertised "twenty short stories" against a corpus
 * of thirty-four, and "619 unit tests" against a suite of 812, because both
 * numbers were typed once and then trusted.
 */
const README = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const ROOT = new URL("../../", import.meta.url).pathname;

describe("the README's numbers are the repo's numbers", () => {
  it("states the real unit test count and file count", () => {
    expect(README, `README should say ${repoStats.tests} unit tests`).toContain(
      `${repoStats.tests} unit tests across ${repoStats.testFiles} files`,
    );
  });

  /*
   * The test above compares the README to a GENERATED file, so when repoStats.ts
   * is itself stale the two agree with each other and the gate passes on a wrong
   * number. That is not hypothetical: it is how the README shipped 817/74 into a
   * PR against a suite of 899/81. It only failed in CI, because CI runs
   * gen-repo-stats before vitest and a developer does not.
   *
   * So the generated half gets its own check against something nothing
   * generates. Counting files is enough — a file count that has drifted is proof
   * the whole record is stale, and the test total moves with it. Walked rather
   * than globbed because the suite spans src/, api/ and scripts/.
   */
  it("has not let the generated stats go stale under it", () => {
    const skip = new Set(["node_modules", "dist", ".git", "e2e", ".vercel", "coverage", ".worktrees"]);
    const walk = (dir: string): number => {
      let n = 0;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || skip.has(e.name)) continue;
        if (e.isDirectory()) n += walk(join(dir, e.name));
        else if (/\.test\.(ts|tsx|mjs)$/.test(e.name)) n += 1;
      }
      return n;
    };
    expect(
      walk(ROOT),
      "src/data/repoStats.ts is stale — run `npm run gen:repo-stats` and update the README",
    ).toBe(repoStats.testFiles);
  });

  it("states the real Playwright file count", () => {
    const specs = readdirSync(join(ROOT, "e2e")).filter((f) => f.endsWith(".spec.ts")).length;
    expect(README, `README should say ${specs} e2e spec files`).toMatch(
      new RegExp(`Playwright tests across ${specs} files`),
    );
  });

  it("counts the destinations the registry actually has", () => {
    const words: Record<number, string> = {
      15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen",
      19: "nineteen", 20: "twenty", 21: "twenty-one", 22: "twenty-two",
    };
    const word = words[surfaces.length];
    expect(word, `add a word for ${surfaces.length} to this test`).toBeDefined();
    expect(README, `the registry holds ${surfaces.length} surfaces`).toContain(`**${word} destinations**`);
  });

  it("counts the client-only routes, which is a claim about rendering", () => {
    const routes = readdirSync(join(ROOT, "src/routes")).filter((f) => f.endsWith(".tsx"));
    const clientOnly = routes.filter((f) =>
      /^\s*ssr: false,\s*$/m.test(readFileSync(join(ROOT, "src/routes", f), "utf8")),
    );
    // Derived, not typed. Both halves of this sentence were literals and both
    // went stale the moment /canon landed: the file count said twenty-two
    // against twenty-three files, and this assertion stayed green through it
    // because it only compared one hardcoded string to another.
    const NUM: Record<number, string> = {
      // Small numbers too, now that the client-only count is derived from this
      // same table rather than hardcoded.
      5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine",
      16: "Sixteen", 17: "Seventeen", 18: "Eighteen", 19: "Nineteen",
      20: "Twenty", 21: "Twenty-one", 22: "Twenty-two", 23: "Twenty-three",
      24: "Twenty-four", 25: "Twenty-five",
    };
    const ssr = NUM[routes.length - clientOnly.length];
    const total = NUM[routes.length]?.toLowerCase();
    expect(ssr, `add a word for ${routes.length - clientOnly.length} to NUM`).toBeDefined();
    expect(total, `add a word for ${routes.length} to NUM`).toBeDefined();
    expect(README).toContain(`${ssr} of the ${total} route files server-render`);
    // Derived, like the sentence above it. This was `toBe(6)` — a hardcoded
    // literal inside the very test whose comment complains about hardcoded
    // literals going stale, and it went stale the moment /ops landed as the
    // seventh client-only route. Assert the README's own word for the count
    // instead, so the number can only be wrong in one place.
    const clientWord = NUM[clientOnly.length];
    expect(clientWord, `add a word for ${clientOnly.length} to NUM`).toBeDefined();
    expect(README, `the README should say ${clientWord} routes stay client-only`)
      .toContain(`${clientWord} stay client-only`);
    for (const f of clientOnly) {
      const route = "/" + f.replace(/\.tsx$/, "");
      expect(README, `${route} is client-only and the README should name it`).toContain(`\`${route}\``);
    }
  });

  it("carries no dash in prose, which is this surface's rule", () => {
    // Code blocks are exempt: the tree diagram's comments are code.
    const prose = README.replace(/```[\s\S]*?```/g, "");
    const found = prose.split("\n").filter((l) => /—|–/.test(l));
    expect(found, `dashes left in README prose:\n${found.join("\n")}`).toEqual([]);
  });
});
