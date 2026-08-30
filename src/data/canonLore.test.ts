import { describe, expect, it } from "vitest";
import { anthology, anthologyEntries } from "./anthology.ts";
import * as lore from "./canonLore.ts";
import { NAMED_THIRTEEN, RENDERINGS, SEASON_CANON, TETHER } from "./canonLore.ts";
import { BANNED, DASHES, walk } from "./proseGuards.ts";
import { surfaces } from "./surfaces.ts";

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
 *
 * `walk` and `BANNED` live in ./proseGuards.ts, shared with anthology.test.ts:
 * see that file's guard on the generated corpus for why a second copy of
 * either is not an option.
 */

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

describe("the process leak guard", () => {
  // /canon carried a Sources list linking .md filenames straight at the working
  // bibles, and an "outside the fiction" note naming the prompting, the model
  // and a cross-lab ownership audit. It shipped, and it read as production
  // apparatus printed inside the lore. Worse, it undercut The Rendering, which
  // is the in-world answer to the very question the note answered out of world.
  //
  // This asserts the reader-visible strings, not the symbol names, because
  // deleting an export and re-adding the same sentence under a new name is the
  // exact way this comes back.
  const walked = walk(lore, "canonLore");

  // Guard D. Without a floor on what the walk actually visited, a renamed
  // export or prose moved into a file this walk does not import leaves
  // `walked` at zero and the assertion below green over nothing rather than
  // over a clean module. 169 strings walk today; 100 leaves headroom without
  // being so low a near-total wipe would still pass.
  it("actually walked the module, not nothing", () => {
    expect(walked.length).toBeGreaterThan(100);
  });

  it("exports nothing a reader could see that names how the work was made", () => {
    const offenders: string[] = [];
    for (const { path, text } of walked) {
      for (const re of BANNED) {
        if (re.test(text)) offenders.push(`${path}: ${re} in ${JSON.stringify(text.slice(0, 90))}`);
      }
    }
    expect(offenders).toEqual([]);
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
      .filter((s) => DASHES.test(s.text))
      .map((s) => `${s.path}: ${s.text.slice(0, 60)}`);
    expect(offenders, `em or en dash in canon copy: ${offenders.join(" | ")}`).toEqual([]);
  });

  /*
   * The same rule, over the CV data layer, which is what a hiring manager
   * actually reads.
   *
   * The assertion above shipped pointed at one file. The rule is not about the
   * fiction: it is the house voice, and the surface blurbs, the metric details,
   * the milestone labels on the /playground terrain and the Elsewhere rows were
   * all outside it, carrying 68 dashes between them. Same shape as the guard
   * above, one pattern from proseGuards.
   *
   * Globbed rather than listed. A hand-kept list is how a data module joins
   * src/data and never joins the gate, which is the exact failure surfaces.ts
   * exists to prevent for routes. So a new file is covered on arrival and the
   * only way out is to argue for it in EXTERNALLY_SOURCED below.
   */
  const modules = import.meta.glob(["./*.ts", "!./*.test.ts"], { eager: true }) as Record<
    string,
    Record<string, unknown>
  >;

  /*
   * Prose this repo transcribes rather than writes, where a dash is a fact
   * about someone else's text and "fixing" it would falsify the record:
   *
   *   store.ts       Play Store listing titles, verbatim ("Ryde – Book a Ride").
   *   weeb.ts        anime titles from the tracker API, same reason.
   *   writing.ts     pulled from github.com/darkpandawarrior/the-loopdown by
   *   archiveText.ts gen-loopdown/gen-archive-text; archiveText carries the FULL
   *                  TEXT of pieces printed in Excelsior in 2019-2021, quote
   *                  attributions included. An edit here is reverted by the next
   *                  generator run, so the fix belongs upstream or nowhere.
   *   anthology.ts   in-world fiction, generated, and guarded by this file's own
   *                  RESIDUE/BANNED walk in anthology.test.ts. Widening the voice
   *                  rule to 34 story bodies is a separate argument.
   */
  const EXTERNALLY_SOURCED = new Set(["anthology", "archiveText", "store", "weeb", "writing", "proseGuards"]);

  const guarded = Object.entries(modules)
    .map(([path, mod]) => [path.replace(/^\.\/|\.ts$/g, ""), mod] as const)
    .filter(([name]) => !EXTERNALLY_SOURCED.has(name));

  it("guards the whole data layer, not a hand-kept corner of it", () => {
    expect(guarded.length).toBeGreaterThanOrEqual(20);
  });

  it.each(guarded)("has no em dash or en dash in %s", (name, mod) => {
    const offenders = Object.entries(mod)
      .filter(([, v]) => typeof v !== "function")
      .flatMap(([k, v]) => walk(v, `${name}.${k}`))
      .filter((s) => DASHES.test(s.text))
      .map((s) => `${s.path}: ${s.text.slice(0, 80)}`);
    expect(offenders, `em or en dash in visitor prose: ${offenders.join(" | ")}`).toEqual([]);
  });
});

/*
 * One wall, one voice.
 *
 * Nineteen surface blurbs addressed the reader or stayed impersonal; two did
 * not. /chess ended "a bot that plays like me" and /shipped opened "from work
 * he touched ... the platform he worked on", so a hiring manager reading one
 * proof tile met three different narrators.
 *
 * First person only. A bare third-person match would be permanently red for a
 * bogus reason: /anthology's blurb is about the in-world field reporter who
 * "stops filing, burns the case, and walks into a city built to the dimensions
 * of his own paperwork" — ordinary English about a character, not a slip. Same
 * lesson as the bare `council` that is deliberately absent from BANNED.
 */
describe("the surface wall speaks in one voice", () => {
  it("never slips into the first person", () => {
    const offenders = surfaces
      .filter((s) => /\b(I|me|my|mine)\b/.test(s.blurb))
      .map((s) => `${s.to}: ${s.blurb}`);
    expect(offenders, `blurb written in the first person: ${offenders.join(" | ")}`).toEqual([]);
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
    expect(SEASON_CANON[4].spoils).toBeTruthy();
  });
});
