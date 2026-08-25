import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * PROJECT LAW 5, MECHANISED.
 *
 * `.reveal` sets `opacity: 0` and waits for the `revealed` class, which only
 * the <Reveal> component's IntersectionObserver ever adds. Any element that
 * wears the bare class WITHOUT going through that component renders, takes up
 * layout, measures correctly in every test — and is permanently invisible.
 *
 * It has happened before and it is close to undetectable: the DOM is right,
 * the a11y tree is right, axe is happy, and a screenshot just quietly has a
 * hole in it. So this is a source-level check rather than a runtime one.
 *
 * Two things legitimately supply the observer: the <Reveal> component, and a
 * page-level hook that queries `.reveal` descendants and adds `revealed`
 * itself (ProjectDetail's useScrollReveal does exactly this, for ten
 * elements). So a file that wires its own observer is exempt — the bug this
 * catches is a bare `.reveal` in a file where NOTHING will ever add the
 * class.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

describe("project law 5 — a bare .reveal class is invisible forever", () => {
  const root = new URL("../", import.meta.url).pathname;
  const files = walk(join(root, "src")).filter((f) => !f.endsWith("Reveal.tsx"));

  it("finds the components it is meant to be scanning", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never applies the reveal class outside the <Reveal> component", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // This file supplies its own observer — the class will get added.
      if (/classList\.add\(\s*["'`]revealed["'`]/.test(src) || /ScrollReveal\s*\(/.test(src)) continue;
      // className="… reveal …" or className={`… reveal …`} — the word on its
      // own, so `revealed`, `reveal-slow` and prose are not false positives.
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] ?? m[2] ?? "";
        if (/(^|[\s`{])reveal($|[\s`}])/.test(cls)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${file.replace(root, "")}:${line} — className contains bare "reveal"`);
        }
      }
    }
    expect(
      offenders,
      `these wear .reveal without <Reveal>'s observer, so they are stuck at opacity:0 forever:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
