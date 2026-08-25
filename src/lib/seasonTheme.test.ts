import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { anthologyEntries, entriesOfSeason } from "../data/anthology.ts";
import type { AnthologyEntry } from "../data/anthology.ts";
import { entryTheme, seasonHero, KINDLING_FINALE } from "./seasonTheme.ts";

/**
 * The guard on the per-season theme, and on the one CSS defect it exists to
 * undo.
 *
 * Two failures were shipped here and both were the same shape: an intention
 * encoded correctly and executed into nothing. The kicker said `PAGE 1 OF 91`
 * on a season three card because the season two branch caught everything that
 * was not season one, and the scorch painted rgba(24,10,3) over a #14100c
 * ground, which composites to #14100c. Neither threw, neither logged, and
 * neither was visible to any check the repo had.
 *
 * So the assertions below are deliberately about the artifact rather than the
 * intent: the string a reader actually sees, and the colour a browser actually
 * composites. Every one of them carries a vacuity guard, because a check that
 * has quietly stopped matching anything is the third instance of the same bug.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "..", "index.css"), "utf8");
const THEME_SRC = readFileSync(join(HERE, "seasonTheme.ts"), "utf8");

/** The ink world's ground, index.css `--color-ink`. */
const INK = "#14100c";

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(channels(a)), luminance(channels(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("entryTheme labels", () => {
  const seasons = [...new Set(anthologyEntries.map((e) => e.season))];

  it("has entries in every season to label (guard is not vacuous)", () => {
    expect(seasons.length).toBeGreaterThanOrEqual(3);
    expect(anthologyEntries.length).toBeGreaterThan(30);
  });

  // The three literal strings that reached production. `undefined` and `NaN`
  // come from formatting a counting scheme the season does not have; `0 OF 91`
  // came from the one page he keeps carrying page 0 through season two's
  // branch.
  it("never prints undefined, NaN or a zeroth page in a label", () => {
    for (const e of anthologyEntries) {
      const t = entryTheme(e);
      for (const s of [t.label, t.short]) {
        expect(s, `${e.slug}: ${s}`).not.toMatch(/undefined|NaN/);
        expect(s, `${e.slug}: ${s}`).not.toMatch(/\b0 OF 91\b/i);
      }
    }
  });

  // The original defect, stated as a rule rather than as a season three fix:
  // the ninety-one pages are season two's counting scheme and nobody else's.
  it("only season two counts in pages of 91", () => {
    const offenders = anthologyEntries
      .filter((e) => e.season !== 2 && /^PAGE \d+ OF 91$/.test(entryTheme(e).label))
      .map((e) => e.slug);
    expect(offenders).toEqual([]);
    // ...and season two really does, or the rule above is passing on nothing.
    expect(entriesOfSeason(2).every((e) => /^PAGE \d+ OF 91$/.test(entryTheme(e).label))).toBe(true);
  });

  it("gives each season a visibly different card", () => {
    const cards = [1, 2, 3].map((n) => entryTheme(entriesOfSeason(n)[0]).card);
    expect(new Set(cards).size).toBe(3);
  });
});

describe("the one page he keeps", () => {
  const kept = anthologyEntries.find((e) => e.kindling === KINDLING_FINALE);

  it("exists (guard is not vacuous)", () => {
    expect(kept).toBeDefined();
  });

  // The bible: "The final plate is clean, unmarked paper. The only undamaged
  // object in the season." So it is an exception inside season three's own
  // row, not a special case leaking into the card component.
  it("is undamaged, while every other kindling page is not", () => {
    const t = entryTheme(kept as AnthologyEntry);
    expect(t.card).not.toContain("season-three-torn");
    expect(t.card).toContain("season-kept");
    expect(t.tilt).toBe(false);
    expect(t.short).toBe("kept");
    expect(t.label).toBe("THE PAGE HE KEEPS");

    const withdrawn = entriesOfSeason(3).filter((e) => e.kindling !== KINDLING_FINALE);
    expect(withdrawn.length).toBe(13);
    for (const e of withdrawn) {
      expect(entryTheme(e).card, e.slug).toContain("season-three-torn");
      expect(entryTheme(e).label, e.slug).toMatch(/^PAGE \d+ WITHDRAWN$/);
    }
  });

  // Every colour the kept page sets is stated in seasonTheme.ts with the ratio
  // it clears against that same block's --color-card. Recomputing them here is
  // what stops the comment and the value drifting apart, which is how a badge
  // in this project once shipped at 1.4:1.
  it("meets every contrast ratio its own source comment claims", () => {
    const vars = entryTheme(kept as AnthologyEntry).vars ?? {};
    const card = String(vars["--color-card"]);
    expect(card).toMatch(/^#[0-9a-f]{6}$/);

    // `"--color-text": "#1f1a12", // 13.06:1`
    const stated = [...THEME_SRC.matchAll(/"(--color-[a-z-]+)":\s*"(#[0-9a-f]{6})",\s*\/\/\s*([\d.]+):1/g)];
    expect(stated.length).toBeGreaterThanOrEqual(5);

    for (const [, token, hex, claim] of stated) {
      expect(vars[token as `--${string}`], token).toBe(hex);
      const actual = contrast(hex, card);
      expect(Math.abs(actual - Number(claim)), `${token} claims ${claim}:1, measures ${actual.toFixed(2)}:1`).toBeLessThan(0.05);
      // 3.0 is the non-text UI floor for --color-line, 4.5 is text.
      expect(actual, `${token} at ${actual.toFixed(2)}:1`).toBeGreaterThanOrEqual(token === "--color-line" ? 3 : 4.5);
    }
  });
});

describe("a season with no row of its own", () => {
  // A fourth season is a row in the SEASON table and an arm in seasonHero().
  // Until someone adds them it must degrade to something true rather than
  // claim season two's page numbers or throw on the way past.
  // Season four now has a row of its own, so the unfiled fallback is tested
  // with FIVE. That was the point of the fallback: an unwritten season renders
  // as something honest instead of claiming another season's counting scheme,
  // and this assertion is only meaningful while it points at a season that does
  // not exist yet. It moved up one when four arrived and it will move again.
  const five = { ...anthologyEntries[0], season: 5, idx: 7, page: 0, entry: 0 } as AnthologyEntry;
  const four = { ...anthologyEntries[0], season: 4, idx: 7, page: 0, entry: 0 } as AnthologyEntry;

  it("falls through to the unfiled row without throwing", () => {
    expect(() => entryTheme(five)).not.toThrow();
    const t = entryTheme(five);
    expect(t.label).not.toMatch(/OF 91|undefined|NaN/);
    expect(t.label).toContain("7");
    expect(seasonHero(5)).toBeNull();
  });

  it("gives season four the wall rather than the fallback", () => {
    const t = entryTheme(four);
    expect(t.label).toBe("NOTICE 7 OF 14");
    expect(t.card).toContain("season-four-notice");
    expect(t.tilt).toBe(false);
    expect(seasonHero(4)).toBe("wall");
  });
});

/** The hub card ground, index.css `--color-card` inside `.ink-world`. */
const CARD = "#221b15";

/** Every rgba() stop in a rule whose selector mentions season three. */
function seasonThreeStops() {
  const blocks = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.includes("season-three"));
  return blocks.flatMap(([, sel, body]) => {
    const selector = sel.trim().split("\n").pop()!.trim();
    // `.season-three-torn` is a card treatment; the scorch is on the reading
    // page. A stop is only as visible as the ground it actually composites on.
    const ground = selector.includes("torn") ? CARD : INK;
    const out: { selector: string; rgb: [number, number, number]; alpha: number; ground: string }[] = [];

    for (let i = body.indexOf("rgba("); i >= 0; i = body.indexOf("rgba(", i + 1)) {
      // Balanced scan, because the alpha argument is usually a calc().
      let depth = 0;
      let end = i + 4;
      for (; end < body.length; end++) {
        if (body[end] === "(") depth++;
        else if (body[end] === ")" && --depth === 0) break;
      }
      const args = body.slice(i + 5, end);
      let split = 0;
      const parts: string[] = [];
      let start = 0;
      for (let j = 0; j < args.length; j++) {
        if (args[j] === "(") split++;
        else if (args[j] === ")") split--;
        else if (args[j] === "," && split === 0) {
          parts.push(args.slice(start, j));
          start = j + 1;
        }
      }
      parts.push(args.slice(start));
      // The alpha is `0.34`, or `calc(0.6 * var(--scorch, 0))`, or
      // `calc(0.14 + 0.34 * var(--scorch, 0))`. --scorch runs 0..1, so the
      // strongest this stop ever gets is the sum of its own coefficients with
      // the var() and its fallback taken out of the arithmetic.
      const alphaExpr = (parts[3] ?? "1").replace(/var\([^)]*\)/g, "");
      const alpha = Math.min(1, [...alphaExpr.matchAll(/[\d.]+/g)].reduce((a, m) => a + Number(m[0]), 0));
      out.push({
        selector,
        rgb: parts.slice(0, 3).map((p) => Number(p.trim())) as [number, number, number],
        alpha,
        ground,
      });
    }
    return out;
  });
}

describe("the season three fire", () => {
  // The defect this replaces, measured rather than recalled: char is dark, the
  // ground is #14100c, and char over a dark ground is arithmetic that returns
  // the ground. rgba(24,10,3) at its strongest composited to #160d07, 1.01:1,
  // and at kindling 1 to #14100c exactly, 1.00:1.
  //
  // Note what does NOT catch that, because it was the obvious check to reach
  // for: rgba(35,16,8) is very slightly LIGHTER in raw luminance than
  // #14100c, so "no stop darker than the ground" passes on the broken CSS. It
  // is the alpha that kills it. So the rule has to composite.
  //
  // Threshold 1.2:1 is not eyeballed. Every stop of the shipped char treatment
  // measures between 1.000:1 and 1.025:1 composited; every stop of the ember
  // and ash treatment measures between 1.366:1 and 3.619:1. 1.2 sits in that
  // gap with room either side. It is not an accessibility floor and does not
  // claim to be: these stops carry no information the text does not also
  // carry. It is a floor on being visible at all.
  const stops = seasonThreeStops();

  it("finds the stops it is meant to be checking (guard is not vacuous)", () => {
    expect(stops.length).toBeGreaterThanOrEqual(8);
    expect(new Set(stops.map((s) => s.selector)).size).toBeGreaterThanOrEqual(2);
    for (const s of stops) {
      expect(s.rgb.every((c) => Number.isInteger(c)), s.selector).toBe(true);
      expect(s.alpha, s.selector).toBeGreaterThan(0);
    }
  });

  it("composites every stop to something you can actually see", () => {
    const invisible = stops
      .map((s) => {
        const over = s.rgb.map((c, i) => Math.round(c * s.alpha + channels(s.ground)[i] * (1 - s.alpha)));
        const hex = `#${over.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
        return { ...s, hex, ratio: contrast(hex, s.ground), lifts: luminance(over as [number, number, number]) > luminance(channels(s.ground)) };
      })
      .filter((s) => s.ratio < 1.2 || !s.lifts)
      .map((s) => `${s.selector}: rgba(${s.rgb.join(", ")}) at ${s.alpha} composites to ${s.hex}, ${s.ratio.toFixed(3)}:1 on ${s.ground}`);
    expect(invisible).toEqual([]);
  });
});
