import { describe, expect, it } from "vitest";
import { anthology, anthologyEntries } from "./anthology.ts";
import * as lore from "./canonLore.ts";
import { CANON_SOURCES, NAMED_THIRTEEN, RENDERINGS, SEASON_CANON, TETHER } from "./canonLore.ts";

/**
 * The gate on /canon's data.
 *
 * `anthologyEntries` is imported here and NOWHERE in canonLore.ts, on purpose:
 * a Node test pays no bundle cost, so the corpus can be re-measured here while
 * the route's chunk stays free of 34 story bodies.
 *
 * The recurring defect in this project is an intention encoded correctly and
 * executed into nothing, so each assertion below is written to go red for a
 * specific real failure rather than to be true by construction.
 */

/** Every string reachable from the module's exports, path included for the message. */
function walk(value: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
  }
  return out;
}

describe("the seven laws", () => {
  const laws = Object.values(SEASON_CANON).flatMap((c) => c.laws ?? []);

  it("is seven laws, and they are the seven", () => {
    expect(laws).toHaveLength(7);
    expect(laws.map((l) => l.name)).toEqual([
      "The Count of Fourteen",
      "The Unnamed Fourteenth",
      "The Halving",
      "The Residue",
      "The Witness Who Tells It",
      "The Two Facings",
      "Concluded",
    ]);
  });

  // The ordinal is what the ghost numeral prints, so a duplicate or a gap is a
  // page that says "II" twice and never says "III".
  it("numbers them contiguously from one", () => {
    expect(laws.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  // Every law is a doorway. A renamed slug upstream would otherwise ship as a
  // 404 that nothing else on the site notices.
  it("points every law at an entry that exists", () => {
    const slugs = new Set(anthologyEntries.map((e) => e.slug));
    const dead = laws.filter((l) => !slugs.has(l.seenAt.slug)).map((l) => `${l.name} -> ${l.seenAt.slug}`);
    expect(dead, `law(s) linking at a slug not in the corpus: ${dead.join(", ")}`).toEqual([]);
  });

  it("marks law six as one storyteller's position", () => {
    expect(laws.find((l) => l.n === 6)?.contested).toBeTruthy();
  });
});

describe("the sources block", () => {
  // The pattern this page inherited: bible rows DERIVE from the seasons, so a
  // fourth season arrives with its own receipt and no code edit. The hand-kept
  // list it replaced had already fallen a season behind.
  it("derives exactly one bible row per season, named by the upstream rule", () => {
    const bibles = CANON_SOURCES.filter((s) => s.file.endsWith("bible.md"));
    expect(bibles).toHaveLength(anthology.seasons.length);
    expect(bibles.map((b) => b.file)).toEqual(
      anthology.seasons.map((s) => (s.n === 1 ? "bible.md" : `s${s.n}-bible.md`)),
    );
  });

  it("keeps the non-derived records too", () => {
    const files = CANON_SOURCES.map((s) => s.file);
    expect(files).toContain("species.md");
    expect(files).toContain("council-2026-08-15.md");
  });
});

describe("the rendering evidence", () => {
  it("shows all four states of the rig", () => {
    expect(RENDERINGS.map((r) => r.state)).toEqual(["held", "strained", "failed", "refused"]);
  });

  // The plate IS the argument of that section. A witness id that does not
  // resolve renders nothing at all, silently, which is exactly the class of
  // defect this repo keeps hitting.
  it("resolves every portrait and every entry link", () => {
    const ids = new Set(anthology.witnesses.map((w) => w.id));
    const slugs = new Set(anthologyEntries.map((e) => e.slug));
    for (const r of RENDERINGS) {
      expect(ids.has(r.witnessId), `no witness "${r.witnessId}" on the anthology meta`).toBe(true);
      expect(slugs.has(r.slug), `no entry "${r.slug}" in the corpus`).toBe(true);
    }
  });
});

describe("the count", () => {
  it("names exactly thirteen", () => {
    expect(NAMED_THIRTEEN).toHaveLength(13);
    expect(new Set(NAMED_THIRTEEN).size).toBe(13);
  });
});

describe("the tether is measured, not remembered", () => {
  // species.md writes the hands figure as 63, which was true of thirty
  // entries. The corpus is thirty-four and the real count is 97. This is the
  // assertion that stops a stale fact shipping: it recounts the bodies and
  // compares them to the literals the page prints.
  const bodies = anthologyEntries.map((e) => e.body).join(" ");

  it.each(TETHER)("prints the real count for $label", ({ value, pattern }) => {
    const actual = (bodies.match(new RegExp(pattern, "gi")) || []).length;
    expect(actual, `the corpus now says this ${actual} times, the page prints ${value}`).toBe(value);
  });

  it("keeps the counter-evidence at zero, because that is the point", () => {
    expect(TETHER.find((t) => t.label.includes("fur or limb"))?.value).toBe(0);
  });
});

describe("the voice rule the page publishes", () => {
  // All three bibles state "No em dashes in body prose, ever". This is the
  // page that prints that rule, so it cannot be the page that breaks it.
  it("has no em dash or en dash in any exported string", () => {
    const offenders = walk(lore, "canonLore")
      // Escapes, not the literal glyphs: U+2014 em dash, U+2013 en dash. The
      // verification step for this page is a plain `grep -nE` for those two
      // characters across the canon files, and a detector written with the
      // glyphs in it is the one thing guaranteed to show up in its own sweep.
      .filter((s) => /[\u2014\u2013]/.test(s.text))
      .map((s) => `${s.path}: ${s.text.slice(0, 60)}`);
    expect(offenders, `em or en dash in canon copy: ${offenders.join(" | ")}`).toEqual([]);
  });
});

describe("the spoiler partition", () => {
  // `spoils` is the whole disclosure design: null renders open above the
  // divider, a string renders closed below it with the price on the door. A
  // season that declares neither would land on the wrong side by accident.
  it("gives every season a deliberate side of the line", () => {
    for (const [n, c] of Object.entries(SEASON_CANON)) {
      expect(c.spoils === null || c.spoils.length > 0, `season ${n} has an empty spoils string`).toBe(true);
    }
  });

  it("keeps the endings behind a door and the reading contract in front of it", () => {
    expect(SEASON_CANON[1].spoils).toBeNull();
    expect(SEASON_CANON[2].spoils).toBeTruthy();
    expect(SEASON_CANON[3].spoils).toBeTruthy();
  });
});
