import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boardProfiles } from "./beforeTheCode.ts";
import { excelsiorMarks } from "./excelsiorMarks.ts";
import { pieceBySlug } from "./archiveText.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * What can and cannot be gated here.
 *
 * These three quotes were transcribed by eye from page scans and shipped
 * shortened while a docstring promised they were verbatim — for months, with
 * every test green, because nothing in the repo ever compared a quote to its
 * source. The source is a page IMAGE, so no cheap test can diff the words; that
 * check is a human with the scan open, which is exactly why each card links to
 * it.
 *
 * What IS mechanical is the citation. A quote pointing at a page that does not
 * exist is unverifiable by anyone, and a wrong page number is worse than none —
 * it sends a reader to the wrong place and looks checked. That much is gated.
 */
describe("board profiles cite a page a reader can actually open", () => {
  it("has a scanned page on disk for every profile", () => {
    const missing = boardProfiles
      .map((p) => ({ p, file: `public/excelsior/pages/${p.year}/p${String(p.page).padStart(3, "0")}.webp` }))
      .filter(({ file }) => !existsSync(join(root, file)))
      .map(({ p, file }) => `${p.year} "${p.title}" → ${file}`);
    expect(missing, `profile citing a page that is not in the scans: ${missing.join(", ")}`).toEqual([]);
  });

  /**
   * One ellipsis per cut, counted — not merely "has an ellipsis somewhere".
   *
   * The first version of this test asked `quote.includes("…")` and was useless:
   * deleting the interior mark from the '21 quote — the worst of the original
   * defects, two non-adjacent sentences spliced into continuous speech — left
   * the leading mark in place, so the test stayed green through exactly the bug
   * it existed to catch. Verified by breaking it both ways.
   *
   * These counts were checked character by character against the scans on
   * 2026-08-15. A quote changing means re-opening its page, which is the point:
   * no machine can diff prose against a page image, so the gate's job is to
   * make an edit deliberate rather than to approve it.
   */
  const CUTS: Record<string, number> = {
    2019: 1, // trailing: "…, while discredit Arpith …" (names another student)
    2020: 1, // leading: "Oh damn. I am just trying to tell a friend …"
    2021: 2, // leading (~150 words) AND interior: "Except for the father, of course!"
  };

  it("marks every cut it made, and exactly as many as were verified", () => {
    const wrong = boardProfiles
      .map((p) => ({ p, found: (p.quote.match(/…/g) ?? []).length, want: CUTS[p.year] }))
      .filter(({ found, want }) => found !== want)
      .map(({ p, found, want }) => `${p.year} "${p.title}": ${found} ellipsis, expected ${want}`);
    expect(wrong, `quote trimming no longer matches what was verified against the scan: ${wrong.join("; ")}`).toEqual([]);
  });

  it("gives every profile the fields the card renders", () => {
    for (const p of boardProfiles) {
      for (const field of ["title", "role", "question", "quote", "direction"] as const) {
        expect(p[field]?.trim(), `${p.year} ${field}`).toBeTruthy();
      }
      expect(p.page, `${p.year} page`).toBeGreaterThan(0);
    }
  });
});

/**
 * The same class of citation, in the file next door.
 *
 * excelsiorMarks is hand-curated too — its own docstring says so — and it
 * carries the same two kinds of pointer the board profiles do: a page in the
 * scans, and a slug at /read. Both were verified by hand once and then trusted,
 * which is precisely how the board quotes went wrong.
 *
 * The readSlug check earns its place from this session specifically: two
 * archive pieces were removed for not being his writing, and a removal is
 * exactly what silently dangles a link like this. They happened not to be
 * referenced here. Nothing made that true, and nothing would have said so.
 */
describe("excelsior marks point at things that exist", () => {
  it("cites a scanned page that is on disk", () => {
    const missing = excelsiorMarks
      .map((m) => ({ m, file: `public/excelsior/pages/${m.year}/p${String(m.page).padStart(3, "0")}.webp` }))
      .filter(({ file }) => !existsSync(join(root, file)))
      .map(({ m, file }) => `${m.year} "${m.label}" → ${file}`);
    expect(missing, `mark citing a page that is not in the scans: ${missing.join(", ")}`).toEqual([]);
  });

  it("links only to /read pieces that still exist", () => {
    const dangling = excelsiorMarks
      .filter((m) => m.readSlug && !pieceBySlug(m.readSlug))
      .map((m) => `${m.year} "${m.label}" → /read/${m.readSlug}`);
    expect(dangling, `mark pointing at a /read piece that is gone: ${dangling.join(", ")}`).toEqual([]);
  });
});
