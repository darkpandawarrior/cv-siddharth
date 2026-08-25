import { describe, expect, it } from "vitest";
import { SERIES_COLOR, accentOf } from "./writingMeta.ts";
import { writing } from "./writing.ts";

/**
 * A COLOUR COLLISION IS THE ONE DRIFT NOBODY REPORTS.
 *
 * SERIES_COLOR held five entries against eight published series, and the three
 * it did not name all fell through to "#8f74ff" — which is sensors-who-lie's
 * own accent. So the legend showed four chips in the same violet, three of
 * them claiming a series that had never been assigned it. Nothing throws,
 * nothing logs, and the page looks designed.
 *
 * accentOf derives the missing hues now. What this file guards is the property
 * that made the bug invisible: two series must never share a colour.
 */
describe("series accents", () => {
  it("gives no two series the same colour", () => {
    const used = writing.series.map((s) => accentOf(s.id));
    const dupes = used.filter((c, i) => used.indexOf(c) !== i);
    expect(
      new Set(dupes),
      `${[...new Set(dupes)].join(", ")} is assigned to more than one series. If PALETTE has run out of hues, add one; do not pin a colour in SERIES_COLOR to work around it.`,
    ).toEqual(new Set());
  });

  it("pins colours only for series that still exist upstream", () => {
    const ids = new Set(writing.series.map((s) => s.id));
    const stale = Object.keys(SERIES_COLOR).filter((id) => !ids.has(id));
    expect(stale, `SERIES_COLOR pins ${stale.join(", ")}, which the-loopdown no longer publishes.`).toEqual([]);
  });
});
