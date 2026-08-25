/**
 * The entry's first line, lifted off the top of its body.
 *
 * Every one of the forty-eight anthology entries opens with a blockquote the
 * correspondent wrote himself, and that line is the entry's medium stated in
 * its own words:
 *
 *   > Entry #2250 · Series 7 of 16, Alpha Axmoiri System     a relay slug
 *   > Page 30 of 91                                          a folio
 *   > Kindling · page 47 withdrawn                           a withdrawal
 *   > Posted · THE RETURNS HALL · cleared in 12 ticks        a notice, carrying
 *                                                            the term of its own erasure
 *
 * Four seasons, four media, and the reading page rendered all forty-eight
 * through `.piece-body blockquote`, whose own comment in index.css reserves
 * that register for "quoted charter text or a log line someone filed." A
 * masthead set as a quotation.
 *
 * This lives in lib/ rather than inside the route for one reason, and it is the
 * reason this project keeps finding: a guard that reimplements the thing it
 * guards is not a guard. The first version of readingMedium.test.ts carried its
 * own copy of this function, and when the season-three double-print defect was
 * deliberately put back to check the test would catch it, the test stayed
 * green — it was asserting the copy, which was still correct. One
 * implementation, imported by both, is the only version of this that can fail.
 *
 * Anchored to the very start, so a blockquote anywhere else in a piece stays a
 * quotation and keeps its style. Returns null rather than assuming: the corpus
 * is allowed an entry that opens some other way, and the page falls back to
 * rendering it as prose.
 */
export function splitDocket(body: string): { docket: string | null; rest: string } {
  const m = /^>[ \t]*(\S.*?)[ \t]*(?:\r?\n|$)/.exec(body);
  if (!m) return { docket: null, rest: body };
  return { docket: m[1], rest: body.slice(m[0].length).replace(/^\s*\n/, "") };
}
