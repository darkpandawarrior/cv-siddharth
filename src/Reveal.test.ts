import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Reveal } from "./Reveal.tsx";

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

/**
 * `.reveal` no longer ships opacity:0 as its base state — see index.css and
 * Reveal.tsx. These two checks are the "green build that proves nothing"
 * guard the fix needed: a component-level assertion that would still pass if
 * the CSS regression came back (React doesn't know index.css exists) paired
 * with a CSS-level assertion that would still pass if Reveal.tsx stopped
 * gating the hidden class (a text file doesn't know what calls it).
 */
describe("scroll-reveal ships the visible state as the truth", () => {
  it("renders a Reveal child fully in the accessibility tree with no observer ever run", () => {
    // renderToStaticMarkup never runs effects — no IntersectionObserver
    // exists in this environment at all, which is the permanent, total
    // version of "the observer is late or never fires". If Reveal's base
    // render depended on the effect to become visible, this is where it
    // would show up as missing text rather than hidden text, since SSR
    // markup carries no computed opacity to inspect.
    const html = renderToStaticMarkup(createElement(Reveal, { children: "the manga season audit" }));
    expect(html).toContain("the manga season audit");
    expect(html).not.toMatch(/aria-hidden="true"/);
    expect(html).not.toMatch(/\shidden(=|[\s/>])/);
    // The armed (pre-animation) class is a client-only decision made inside
    // the mount effect — it must never ship in the markup a crawler, a
    // screen reader's first pass, or a slow connection actually receives.
    expect(html).not.toContain("reveal-armed");
  });

  it("never parks .reveal's base rule at opacity:0 in index.css", () => {
    const cssPath = join(new URL("../", import.meta.url).pathname, "src/index.css");
    const css = readFileSync(cssPath, "utf8");
    // Matches only the bare `.reveal { … }` block — the lookahead excludes
    // `.reveal-armed` and `.reveal.revealed`, which are allowed to.
    const base = /\.reveal(?=[\s{])\s*\{([^}]*)\}/.exec(css);
    expect(base, "expected a base `.reveal { … }` rule in index.css").toBeTruthy();
    expect(base![1]).not.toMatch(/opacity\s*:\s*0\b/);
  });
});
