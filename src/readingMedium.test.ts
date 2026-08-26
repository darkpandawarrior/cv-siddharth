import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { anthologyEntries, unfiledPieces, unfiledBySlug } from "./data/anthology.ts";
import { entryTheme } from "./lib/seasonTheme.ts";
import { splitDocket } from "./lib/docket.ts";

/**
 * The reading page's chrome, guarded at the artifact.
 *
 * Two shipped defects motivated this file and neither was caught by 885 other
 * tests, because every one of them asked about the DATA and none asked what the
 * page does with it:
 *
 *   - Season three printed its withdrawal line twice on all fourteen pages. A
 *     component rendered `> Kindling · page 47 withdrawn` and the body it sat
 *     above already began with that exact string.
 *   - Ten of season four's fourteen feet rendered at full body-prose size,
 *     because the selector that styled the apparatus was `ul:last-of-type` and
 *     those ten are authored as paragraphs. The finale was one of them: its
 *     design turns on a reader noticing "397" against a threshold of 400, in
 *     the block that was being set as story.
 *
 * Both are the same shape of mistake — a rule that reads part of the corpus and
 * is silent on the rest — so these tests are written over ALL FORTY-EIGHT
 * entries rather than a sample. A guard on 47 files is a green build that
 * proves nothing.
 */

const css = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf8");
/** The stylesheet with its prose removed. A rule this file explains in a comment
 *  is not a rule this file applies, and a guard that cannot tell them apart
 *  fires on its own documentation. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
const route = readFileSync(fileURLToPath(new URL("./routes/read.$slug.tsx", import.meta.url)), "utf8");

describe("the docket", () => {
  it("finds a first line on every entry in the corpus", () => {
    const without = anthologyEntries.filter((e) => splitDocket(e.body).docket === null);
    expect(without.map((e) => e.slug), "an entry with no opening line would render no docket at all").toEqual([]);
    expect(anthologyEntries.length).toBe(48);
  });

  it("renders that line exactly once — the season three duplication cannot come back", () => {
    for (const e of anthologyEntries) {
      const { docket, rest } = splitDocket(e.body);
      expect(docket, e.slug).toBeTruthy();
      expect(rest, `${e.slug} still carries its docket line in the prose the page renders`).not.toContain(docket!);
    }
  });

  it("never prints a count the site invented next to the Directory's own", () => {
    // The relay docket used to add `POSITION 2 OF 10` — the site's tally of
    // what has shipped — directly above the entry's own `Series 7 of 16`. Two
    // registers disagreeing on one screen, and only one of them is canon.
    expect(route).not.toMatch(/POSITION \$\{|POSITION \d+ OF/);
  });

  it("gives all four media a docket, and each season only its own", () => {
    const seen = new Map<number, Set<string>>();
    for (const e of anthologyEntries) {
      const set = seen.get(e.season) ?? new Set<string>();
      set.add(entryTheme(e).docket);
      seen.set(e.season, set);
    }
    expect(Object.fromEntries([...seen].map(([s, v]) => [s, [...v]]))).toEqual({
      1: ["relay"],
      2: ["folio"],
      3: ["withdrawn"],
      4: ["posted"],
    });
  });

  it("styles every docket it can produce", () => {
    for (const kind of ["relay", "folio", "withdrawn", "posted"]) {
      expect(css, `.piece-docket--${kind} has no styles, so that season falls back to bare prose`).toContain(
        `.piece-docket--${kind}`,
      );
    }
  });

  it("comes apart into a district and a term on every season four notice", () => {
    // The posted docket sets the district at signage scale and keeps the
    // clearance term as small print. A notice whose line does not split into
    // three falls back to one flat line, which is correct but silently drops
    // the season's only piece of typographic signage — so assert all fourteen.
    for (const e of anthologyEntries.filter((x) => x.season === 4)) {
      const { docket } = splitDocket(e.body);
      expect(docket!.split(" · "), `${e.slug} would fall back to a flat docket`).toHaveLength(3);
    }
  });
});

describe("the apparatus", () => {
  it("is a container, not a selector that can only see lists", () => {
    // `.piece-body ul:last-of-type` matched 23 of 35 feet and silently set the
    // other 12 as story. It may not come back.
    expect(rules, "a selector, not the comment explaining why it was removed").not.toContain("ul:last-of-type");
    expect(rules).toContain(".piece-apparatus {");
  });

  it("covers both authored shapes — bulleted and paragraph", () => {
    const DIV = "\n\n---\n\n";
    let bulleted = 0;
    let paragraph = 0;
    for (const e of anthologyEntries) {
      const i = e.body.indexOf(DIV);
      if (i < 0) continue;
      const lines = e.body
        .slice(i + DIV.length)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(1); // the "**Terminologies:**" / "**Notice conditions**" label
      if (lines.length === 0) continue;
      if (lines.every((l) => l.startsWith("-") || l.startsWith("*"))) bulleted++;
      else paragraph++;
    }
    // Both shapes exist in the shipped corpus. If either count ever reaches
    // zero this test stops meaning anything, so it asserts the mixture itself.
    expect(bulleted, "no bulleted feet left — this guard now proves nothing").toBeGreaterThan(0);
    expect(paragraph, "no paragraph feet left — this guard now proves nothing").toBeGreaterThan(0);
  });
});

describe("the reading floor", () => {
  // Five values. A later change has to argue with a number, not with a feeling.
  const body = css.slice(css.indexOf(".piece-body {"), css.indexOf("\n}", css.indexOf(".piece-body {")));

  it("keeps prose at its stated size, leading and colour", () => {
    expect(body).toContain("font-size: 1.0625rem");
    expect(body).toContain("line-height: 1.75");
    expect(body).toContain("var(--color-prose, #ded3c2)");
  });

  it("never sets the reading column in a monospace face", () => {
    expect(body).not.toContain("--font-mono");
  });

  it("keeps an aside above the floor's own minimum", () => {
    const aside = css.slice(css.indexOf(".piece-body p.piece-aside"), css.indexOf("}", css.indexOf(".piece-body p.piece-aside")));
    const size = /font-size:\s*([\d.]+)em/.exec(aside);
    expect(size, "the aside must state its size in em of body, so this rule is checkable").toBeTruthy();
    expect(Number(size![1]), "an aside may not drop below 0.9em of body prose").toBeGreaterThanOrEqual(0.9);
    expect(aside, "an aside is a fact he wanted you to have, not small print — the colour does not move").not.toContain(
      "color:",
    );
  });
});

describe("stated contrast ratios", () => {
  // This file shipped a scorch gradient at 1.024:1 because a number nobody
  // re-ran was trusted. Two comments in .ink-world disagreed with arithmetic
  // until the pass that added this test. Every ratio a comment states about
  // .ink-world's own tokens is recomputed here from the hex it sits on.
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
    return (hi + 0.05) / (lo + 0.05);
  };

  const ink = "#14100c";
  const block = css.slice(css.indexOf(".ink-world {"), css.indexOf("\n}", css.indexOf(".ink-world {")));

  it("agrees with the arithmetic on every token whose comment states one", () => {
    // Anchored to ONE line. The first version of this regex let the match run
    // across newlines, so --color-warn was tested against a ratio stated four
    // declarations further down and failed for the wrong reason.
    const claims = [...block.matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6});[ \t]*\/\*[^\n*]*?([\d.]+):1 on(?: the)? ink/gi)];
    expect(claims.length, "no ratio claims found — this test would pass on an empty file").toBeGreaterThanOrEqual(2);
    for (const [, token, hex, stated] of claims) {
      expect(Number(ratio(hex, ink).toFixed(2)), `${token} (${hex}) states ${stated}:1 on ${ink}`).toBeCloseTo(
        Number(stated),
        1,
      );
    }
  });

  it("keeps the season four district above the AA floor at signage scale", () => {
    expect(ratio("#5ec8dc", ink)).toBeGreaterThan(4.5);
  });
});

describe("wide paperwork", () => {
  it("scrolls a table instead of letting the page clip it", () => {
    // The page root sets overflow-x: hidden. Page thirty's whole subject is a
    // Difference column at the far right — the first thing a hidden overflow
    // eats.
    expect(route).toContain('className="piece-table"');
    const box = css.slice(css.indexOf(".piece-table {"), css.indexOf("\n}", css.indexOf(".piece-table {")));
    expect(box).toContain("overflow-x: auto");
    expect(route, "a scrolling region must be reachable by keyboard").toMatch(/piece-table"[\s\S]{0,40}tabIndex=\{0\}/);
  });
});

describe("the unfiled lane", () => {
  it("carries the work that has no season, and does not count it as one of the forty-eight", () => {
    // Four seasons and forty-eight entries are printed on four pages and
    // asserted by guards on both sides of the registry hop. An unfiled piece is
    // not one of the forty-eight, which is the entire reason it arrives on its
    // own array instead of as a season zero.
    expect(anthologyEntries).toHaveLength(48);
    expect(new Set(anthologyEntries.map((e) => e.season))).toEqual(new Set([1, 2, 3, 4]));
    expect(unfiledPieces.length, "the lane shipped and nothing is in it").toBeGreaterThan(0);
  });

  it("prints the designation its frontmatter carries rather than resolving one", () => {
    // The corpus uses square brackets for a value a form requires and nobody
    // has filled in. "[unassigned]" IS the answer; an empty string would be the
    // site deciding the question is unanswered rather than unanswered-on-purpose.
    for (const p of unfiledPieces) {
      expect(p.series, `${p.slug} has no designation at all`).toBeTruthy();
      expect(p.body.length, `${p.slug} arrived with no body`).toBeGreaterThan(200);
    }
  });

  it("keeps every unfiled slug reachable and distinct from the forty-eight", () => {
    const entrySlugs = new Set(anthologyEntries.map((e) => e.slug));
    for (const p of unfiledPieces) {
      expect(entrySlugs.has(p.slug), `${p.slug} is in both arrays`).toBe(false);
      expect(unfiledBySlug(p.slug), `${p.slug} does not resolve`).toBeTruthy();
    }
  });
});

describe("the front door", () => {
  const source = readFileSync(fileURLToPath(new URL("./routes/anthology.tsx", import.meta.url)), "utf8");
  /** The file with its prose removed. A count this file EXPLAINS in a comment is
   *  not a count it renders, and the first version of the guard below fired on
   *  its own documentation, which is the same mistake the apparatus guard made
   *  two describes() up. */
  const page = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  it("states its size from the corpus rather than from a typed number", () => {
    // This page shipped "twenty entries, two seasons" against a corpus of
    // thirty-four across three. The fix is not a better number; it is not
    // having one to keep.
    expect(page).toContain("anthologyEntries.reduce((n, e) => n + e.words, 0)");
    const literals = page.match(/\b(48|83,434|83434|forty-eight|six hours|6 hours)\b/gi);
    expect(literals, `the door hardcodes ${literals?.join(", ")}`).toBeNull();
  });

  it("points at two doors that actually exist and are not the same piece", () => {
    // Both are derived, so this asserts the derivation still lands on real
    // entries rather than that two particular slugs are present.
    const first = anthologyEntries.filter((e) => e.season === 1).sort((a, b) => a.idx - b.idx)[0];
    const shortest = anthologyEntries.filter((e) => e.season === 1).sort((a, b) => a.words - b.words)[0];
    expect(first).toBeTruthy();
    expect(shortest).toBeTruthy();
    expect(first.slug).not.toBe(shortest.slug);
    // The shortest piece in the whole corpus is 280 words, deep inside season
    // three, and would be a door into the middle of a fire. The derivation is
    // scoped to season one on purpose, and this is that reason, asserted.
    const shortestAnywhere = [...anthologyEntries].sort((a, b) => a.words - b.words)[0];
    expect(shortestAnywhere.season, "if the shortest piece is now in season one, revisit the door").not.toBe(1);
    expect(shortest.season).toBe(1);
  });

  it("still refuses to explain the order it claims", () => {
    // "Works separately, together, or in any order." is said once and nothing
    // may follow it that argues for it. The door answers a different question.
    expect(page).toContain("Works separately, together, or in any order.");
    expect(page).not.toMatch(/read them in order|recommended order|start with season|correct order/i);
  });
});
