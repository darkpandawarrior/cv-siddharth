import { describe, expect, it } from "vitest";

import { previous, shrinkage } from "./gen-loopdown.mjs";

/**
 * The guard that stops a successful-but-empty registry fetch from blanking the
 * writing hub. Two things can break it, and both break it SILENTLY — the
 * generator keeps exiting 0 and the file keeps getting written.
 */
describe("gen-loopdown regression guard", () => {
  it("can actually read the committed writing.ts", () => {
    // If the brace anchor is ever "simplified" to indexOf("{"), the slice
    // starts inside the PostLinks type, JSON.parse throws, previous() returns
    // null, and every shrink below silently passes. This is that canary.
    const prev = previous();
    expect(prev).not.toBeNull();
    for (const k of ["lessons", "series", "archive", "cast"]) expect(prev[k].length).toBeGreaterThan(0);
  });

  it("refuses an empty payload on all four collections, not just lessons", () => {
    const empty = { lessons: [], series: [], archive: [], cast: [] };
    expect(shrinkage(empty, previous()).sort()).toEqual(["archive", "cast", "lessons", "series"]);
  });

  it("lets a genuine addition through", () => {
    const prev = previous();
    const grown = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, [...v, v[0]]]));
    expect(shrinkage(grown, prev)).toEqual([]);
  });

  it("has nothing to compare against on a fresh clone, so it writes", () => {
    expect(shrinkage({ lessons: [], series: [], archive: [], cast: [] }, null)).toEqual([]);
  });
});
