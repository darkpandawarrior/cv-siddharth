import { describe, expect, it } from "vitest";
import { anthology, anthologyEntries, entriesOfSeason, entryBySlug } from "./anthology.ts";

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
  it("has all three seasons, 34 entries, 10/10/14", () => {
    expect(anthologyEntries).toHaveLength(34);
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
    for (const w of anthology.witnesses) expect(w.art, w.id).toMatch(/^\/p\/anthology\//);
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
    for (const e of withWitness) expect(e.witness?.art).toMatch(/^\/p\/anthology\/witnesses\//);
  });
});
