import { describe, expect, it } from "vitest";
import { anthology, anthologyEntries } from "./anthology.ts";
import { STATE_COLOR, worldPosition } from "../Starmap.tsx";
import { isRevisited, worldKeys, worldSeasons } from "./crossnav.ts";

/**
 * Integrity guards on the starmap half of the generated anthology data.
 *
 * Every failure this file catches is currently invisible until runtime, and
 * two of them are invisible even then. Starmap.tsx throws on an unknown
 * system, so a bad `s` is a blank tab and a console error. A `k` that matches
 * no entry is quieter and worse: openWorld finds nothing and the click does
 * nothing at all, with no error anywhere. A state with no colour falls back to
 * "lit" and silently reports the wrong thing about a world.
 *
 * Nothing upstream stops any of it. starmap.json flows through
 * build-registry.mjs into registry.json into gen-anthology.mjs, which is
 * network-optional and deliberately never fails a build over the fiction.
 * This test is the only gate on that path.
 *
 * It imports worldPosition and STATE_COLOR from Starmap.tsx rather than
 * restating them, so it cannot pass while disagreeing with the renderer.
 */
/**
 * The worlds that are actually drawn.
 *
 * Three carry `o: null` because their own record says the position is not given
 * or not known, and Starmap.tsx filters them out before rendering. Every
 * assertion below is about geometry, so it can only be about worlds that have
 * some. worldPosition() throws on an unplaced world rather than returning the
 * origin, and that throw is what caught this file when the three landed:
 * `Starmap: "Mrit'havn" has no position and must not be drawn.`
 *
 * anthology.test.ts owns the other half, that the three are still null.
 */
const worlds = anthology.starmap.worlds.filter((w) => w.o !== null);

// The tightest pair on the shipping map is 64.9 world units (Exxobar to The
// Directory), and the tightest the tuning has ever held is 60.5, so 55 clears
// the real map and still fails a stack. Labels are drei Html portals at
// distanceFactor 120: below this they overlap on screen at the default camera.
// ponytail: a season written as one dense city will trip this, because
// districts inside a single system sit closer than 55. That is the moment to
// decide whether districts get labels at all, not now.
const LABEL_FLOOR = 55;

describe("starmap integrity", () => {
  it("points every world at a system that exists", () => {
    // Starmap.tsx:worldPosition throws on a miss, which is a thrown render in
    // the browser. Here it is a named failure with the world in the message.
    for (const w of worlds) {
      expect(anthology.starmap.systems[w.s], `${w.n} -> ${w.s}`).toBeDefined();
    }
  });

  it("resolves every reader key to a real entry", () => {
    // EVERY key, not the first one. `k` widened to an array the moment a later
    // season came back to a place the account had already filed, and a reader
    // that kept the singular shape would validate #2300 and never look at the
    // district #2300's ring became. This test caught exactly that on the way
    // in, as a TypeError on w.k.split.
    let checked = 0;
    for (const w of worlds) {
      for (const k of worldKeys(w)) {
        const [season, idx] = k.split("-").map(Number);
        expect(anthologyEntries.find((e) => e.season === season && e.idx === idx), `${w.n} -> ${k}`).toBeDefined();
        checked++;
      }
    }
    // The floor. Without it a rename that emptied worldKeys() would leave this
    // inspecting nothing and reporting green.
    expect(checked, "no reader keys visited, so this guard proves nothing").toBeGreaterThanOrEqual(22);
  });

  it("gives a world more than one record only where a later season came back to it", () => {
    // Accumulation, asserted rather than assumed. The map draws a cyan ring
    // around a revisited world and nothing else changes, so a stray second key
    // would put that ring on a world no later season ever mentions.
    const revisited = worlds.filter(isRevisited);
    expect(revisited.map((w) => w.n), "the accumulation ring has nothing to draw").toEqual(["The Directory"]);
    for (const w of revisited) {
      const seasons = worldSeasons(w);
      // Forward in time, same law the register runs on: the later record is
      // laid over the earlier one, never the other way round.
      expect([...seasons], `${w.n} lists its records out of order`).toEqual([...seasons].sort((a, b) => a - b));
      expect(new Set(seasons).size, `${w.n} carries two records from one season`).toBe(seasons.length);
    }
  });

  it("gives every world a state the renderer has a colour for", () => {
    for (const w of worlds) {
      expect(Object.keys(STATE_COLOR), `${w.n} -> ${w.st}`).toContain(w.st);
    }
  });

  it("never puts two worlds in the same place, or close enough to collide", () => {
    // The defect this is really aimed at: four worlds once sat at offset
    // [0,0,0] inside their own single-world systems, which is only invisible
    // for as long as each of those systems holds exactly one world. Comparing
    // rendered positions rather than raw offsets catches both that and two
    // different systems resolving to the same point.
    const placed = worlds.map((w) => ({ n: w.n, p: worldPosition(w) }));
    let closest = { pair: "", d: Infinity };
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const [a, b] = [placed[i], placed[j]];
        const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
        if (d < closest.d) closest = { pair: `${a.n} / ${b.n}`, d };
      }
    }
    expect(closest.d, `closest pair: ${closest.pair} at ${closest.d.toFixed(1)}`).toBeGreaterThan(LABEL_FLOOR);
  });

  it("resolves every fence endpoint to a named world", () => {
    // Fences are drawn by name, and Starmap.tsx returns null on a miss, so a
    // renamed world takes its fence off the map with no error at all.
    const names = new Set(worlds.map((w) => w.n));
    for (const [a, b] of anthology.starmap.fences) {
      expect(names.has(a), `fence endpoint ${a}`).toBe(true);
      expect(names.has(b), `fence endpoint ${b}`).toBe(true);
    }
  });

  it("names every world exactly once, so the fence lookup is unambiguous", () => {
    // Both the fence lookup and React's key for a NamedWorld are the name.
    const names = worlds.map((w) => w.n);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never lets a withdrawn world carry a Concluded threshold", () => {
    // Withdrawn is the one state the count cannot reach: the Directory never
    // held the record, so there is nothing for it to file. An `at` here would
    // make the slider claim otherwise.
    for (const w of worlds) {
      if (w.st === "withdrawn") expect(w.at, w.n).toBeUndefined();
    }
  });

  it("keeps every Concluded threshold inside the slider's range", () => {
    // A threshold outside 611..671 can never fire, so the world's `st` would
    // be dead data that looks live.
    for (const w of worlds) {
      if (w.at === undefined) continue;
      expect(w.at, w.n).toBeGreaterThanOrEqual(611);
      expect(w.at, w.n).toBeLessThanOrEqual(671);
    }
  });
});
