import { describe, expect, it } from "vitest";
import { anthology, anthologyEntries, entriesOfSeason, entryBySlug } from "./anthology.ts";
import { BANNED, RESIDUE, walk } from "./proseGuards.ts";

// Every generated entry closes with exactly one "\n\n---\n\n" before its
// Terminologies block (read.$slug.tsx names this shape too, and splits on
// it to separate the story from the tape). RESIDUE's own `^---\s*$` clause
// matches that divider as readily as it matches an orphan one, so the one
// known-legitimate divider is excised before RESIDUE runs. Guard A is
// hunting for a marker nobody put there on purpose, not this one.
const TERMINOLOGIES_DIVIDER = "\n\n---\n\n";

/**
 * Guards on the generated anthology data.
 *
 * These are not tests of the generator's code. They are tests of its OUTPUT,
 * because the output is fetched from another repo at build time and the failure
 * modes are all "the data is quietly the wrong shape", which typechecks fine and
 * only shows up as a broken page.
 *
 * The h1 case is the one that actually happened: the frontmatter strip left a
 * blank line in front of the markdown heading, `^#` stopped matching, and every
 * one of the twenty reading pages shipped with two h1 elements. tsc was happy,
 * lint was happy, and it took looking at the live DOM to find it.
 */
describe("anthology data", () => {
  it("has all four seasons, 48 entries, 10/10/14/14", () => {
    expect(anthologyEntries).toHaveLength(48);
    expect(entriesOfSeason(1)).toHaveLength(10);
    expect(entriesOfSeason(2)).toHaveLength(10);
    expect(entriesOfSeason(3)).toHaveLength(14);
  });

  it("never leaves a markdown H1 in a body", () => {
    // The reading page renders its own <h1>. A second one in the body is an
    // accessibility defect and axe will fail the e2e run over it.
    const offenders = anthologyEntries.filter((e) => /^#\s/.test(e.body)).map((e) => e.slug);
    expect(offenders).toEqual([]);
  });

  it("never leaves frontmatter in a body", () => {
    const offenders = anthologyEntries.filter((e) => e.body.startsWith("---\n")).map((e) => e.slug);
    expect(offenders).toEqual([]);
  });

  it("every entry has prose, a slug and a title", () => {
    for (const e of anthologyEntries) {
      expect(e.slug, `${e.title} slug`).toBeTruthy();
      expect(e.title, `${e.slug} title`).toBeTruthy();
      expect(e.body.length, `${e.slug} body`).toBeGreaterThan(500);
    }
  });

  it("numbers each season the way that season is filed", () => {
    // Season one files to the Directory and is numbered by entry. Season two
    // refuses to file and is numbered by page. Season three burns its own
    // case and is numbered by kindling ordinal (1-14). Exactly one is ever set.
    for (const e of entriesOfSeason(1)) expect(e.entry, e.slug).toBeGreaterThan(0);
    for (const e of entriesOfSeason(2)) expect(e.page, e.slug).toBeGreaterThan(0);
    for (const e of entriesOfSeason(3)) expect(e.kindling, e.slug).toBeGreaterThan(0);
  });

  it("caps season three's kindling ordinal at 14, with piece 14 the only one kept", () => {
    // Bible: "A page with nothing on it cannot be Concluded." Piece 14 is the
    // one page he keeps — the only one that should ever carry that ordinal.
    const s3 = entriesOfSeason(3);
    expect(s3.map((e) => e.kindling).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
  });

  it("keeps slugs unique so /read/$slug can resolve them", () => {
    const slugs = anthologyEntries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(entryBySlug(slugs[0])?.slug).toBe(slugs[0]);
  });

  it("points every asset path at public/, not at the source repo", () => {
    for (const e of anthologyEntries) {
      if (e.plate) expect(e.plate, e.slug).toMatch(/^\/p\/anthology\//);
    }
    // An undrawn teller carries art: "". The record still ships, because law
    // five is about who told it and a missing drawing is not a missing teller,
    // and the site renders that as a deliberate card. So the rule is: IF there
    // is a path, it points at public/. The same shape as the plate check above,
    // which has always allowed a plate to be missing.
    for (const w of anthology.witnesses) if (w.art) expect(w.art, w.id).toMatch(/^\/p\/anthology\//);
  });

  it("gives every witness a name and something they did", () => {
    for (const w of anthology.witnesses) {
      expect(w.name, w.id).toBeTruthy();
      expect(w.did.length, w.id).toBeGreaterThan(20);
    }
  });

  it("hangs each witness off an entry that exists", () => {
    const withWitness = anthologyEntries.filter((e) => e.witness);
    expect(withWitness.length).toBeGreaterThan(0);
    for (const e of withWitness) if (e.witness?.art) expect(e.witness.art).toMatch(/^\/p\/anthology\/witnesses\//);
  });
});

describe("guard A: no pipeline residue in a published body", () => {
  // anthology.ts shipped s3-09's body ending in a literal `</content>` for
  // weeks: the source .md was fixed and the generated artifact never was.
  // The source being clean proves nothing about what shipped, so this checks
  // the OUTPUT every one of these 34 bodies actually renders from.
  it("has no leftover tag, fence or divider marker in any body", () => {
    const offenders = anthologyEntries
      .filter((e) => RESIDUE.test(e.body.replace(TERMINOLOGIES_DIVIDER, "\n\n")))
      .map((e) => e.slug);
    expect(offenders).toEqual([]);
  });

  it("never ends a body on a tag line", () => {
    const isTagLine = (line: string) => /^<\/?\w/.test(line.trim());
    const offenders = anthologyEntries
      .filter((e) => isTagLine(e.body.trimEnd().split("\n").pop() ?? ""))
      .map((e) => e.slug);
    expect(offenders).toEqual([]);
  });
});

describe("guard B: process vocabulary over the generated corpus", () => {
  // canonLore.test.ts's "process leak guard" checks canonLore.ts's exports
  // against this same BANNED list (./proseGuards.ts). This is the half of
  // the corpus that guard never saw: 34 bodies, 34 blurbs, season blurbs,
  // witness `did` lines and plate captions are exactly as reader-visible.
  const walked = [...walk(anthology, "anthology"), ...walk(anthologyEntries, "anthologyEntries")];

  // Guard D. 524 strings walk today; without this floor, an export rename or
  // moving prose into a file this walk does not import would leave `walked`
  // near zero and the assertion below green over an empty scan.
  it("actually walked the corpus, not nothing", () => {
    expect(walked.length).toBeGreaterThan(400);
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

describe("guard C: no narrator the account does not have", () => {
  // The blurbs reach every card, every search result and every shared link, so
  // they are among the most-read sentences in the project. Several used to be
  // written from beside the work: "He files.", "He stops filing.", "He burns it
  // faster than he can explain why he wrote it." The entries say I. A blurb
  // that says he has hired a narrator who does not exist, and put him between
  // the reader and the account.
  //
  // THIS IS NOT THE CHECK THE RULING SPECIFIED, and the divergence is
  // deliberate. The ruling proposed asserting that a first-person body implies
  // a first-person blurb, and predicted it would go red on about seven Season
  // Three entries. Run against the corrected corpus it goes red on nine, and
  // every one is a false positive: "Why it snows for a half momenta every click
  // on Exxobar" is a blurb about a world, it has no narrator at all, and there
  // is nothing wrong with it. Person-symmetry was a proxy. The defect was
  // always third-person narration OF HIM, so that is what this asserts.
  // The verb list grew once already. Season Four's own season blurb shipped as
  // "He posts on a wall" and this guard let it through, because "posts" was not
  // on it. A closed list of verbs is a weaker check than the idea behind it, and
  // the honest fix when one gets past is to add it and say so, rather than to
  // pretend the list was ever complete.
  const NARRATES =
    /\b[Hh]e (?:files|stops|burns|holds|builds|writes|takes|reads|keeps|finds|walks|spends|posts|arrives|leaves|asks|carries|visits|learns|discovers)\b|\bhis own case\b|\btells us\b/;

  const blurbs = [
    ...anthologyEntries.map((e) => ({ where: e.slug, text: e.blurb })),
    ...anthology.seasons.map((s) => ({ where: `season ${s.n}`, text: s.blurb })),
  ];

  it("never narrates the correspondent in the third person", () => {
    const offenders = blurbs
      .filter((b) => NARRATES.test(b.text))
      .map((b) => `${b.where}: ${JSON.stringify(b.text.slice(0, 80))}`);
    expect(offenders, `blurb(s) written from outside the account: ${offenders.join(" | ")}`).toEqual([]);
  });

  // The floor. Without it a renamed field or a changed shape leaves this
  // inspecting an empty array and passing, which is the failure mode three of
  // this project's four defects had in common.
  it("actually read the blurbs", () => {
    expect(blurbs.length).toBeGreaterThan(30);
    expect(blurbs.every((b) => typeof b.text === "string" && b.text.length > 20)).toBe(true);
  });
});
