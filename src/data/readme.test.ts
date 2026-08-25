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
      16: "Sixteen", 17: "Seventeen", 18: "Eighteen", 19: "Nineteen",
      20: "Twenty", 21: "Twenty-one", 22: "Twenty-two", 23: "Twenty-three",
      24: "Twenty-four", 25: "Twenty-five",
    };
    const ssr = NUM[routes.length - clientOnly.length];
    const total = NUM[routes.length]?.toLowerCase();
    expect(ssr, `add a word for ${routes.length - clientOnly.length} to NUM`).toBeDefined();
    expect(total, `add a word for ${routes.length} to NUM`).toBeDefined();
    expect(README).toContain(`${ssr} of the ${total} route files server-render`);
    expect(clientOnly.length, "the README says six routes are client-only").toBe(6);
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
