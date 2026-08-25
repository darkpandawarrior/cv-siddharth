import { describe, expect, it } from "vitest";
import { anthology, anthologyEntries, entriesOfSeason, type AnthologyWitness } from "./anthology.ts";
import { KINDLING_FINALE } from "../lib/seasonTheme.ts";
import {
  consumed,
  entriesOfTeller,
  fateOf,
  keyOf,
  REGISTER_ORDER,
  registerLines,
  tellersOf,
  worldOf,
} from "./crossnav.ts";

/**
 * The widget guard.
 *
 * The Damage Register degrades into a related-links box the moment somebody
 * adds a line reading "More like this", and the only thing that makes that
 * impossible rather than merely discouraged is this file. Every rule the
 * register is built on is asserted here against the real corpus, and every
 * assertion in it has been broken on purpose and watched go red before it was
 * trusted green.
 */

/** One printable row per record: kind, the text a reader sees, the target. */
const rowsOf = (slugOrKey: string) => {
  const e = anthologyEntries.find((x) => keyOf(x) === slugOrKey)!;
  return registerLines(e).map((l) => `${l.kind} | ${l.lead}${l.label} | ${l.to ? l.to.kind : "none"}`);
};

// The register exactly as the shipped corpus produces it. Pinned rather than
// spot-checked because the failures this file exists to catch are all
// "a line appeared on a page that should not have one", and only a whole-corpus
// snapshot catches the tenth page nobody thought to look at.
//
// Nine of the ten Season One records carry no register at all. That is both the
// variance the design wants and the proof that the page-zero landmine below did
// not go off.
const REGISTER_FIXTURE: Record<string, string[]> = {
  "s1-01": [],
  "s1-02": [],
  "s1-03": [],
  "s1-04": [],
  "s1-05": [],
  "s1-06": [],
  "s1-07": [],
  "s1-08": [],
  "s1-09": [
    "world | [unnamed] · concluded at 611 | anthology",
    "teller | no teller recorded | anthology",
  ],
  // #2300 states a count of 612, and the world that claims it is the Directory
  // itself. The institution that publishes the count is not filed under it, so
  // the page that ends mid-sentence also ends with no small print.
  "s1-10": [],
  // The trapdoor: the foot of the first page of the case, the first thing every
  // Season Two reader reads, moving them across a season boundary.
  "s2-01": ["fate | page 1 withdrawn · Kindling 1 | read"],
  "s2-02": ["world | Vœrhan · concluded at 615 | anthology"],
  "s2-03": ["world | Dhurin · concluded at 619 | anthology"],
  "s2-04": [
    "fate | page 16 withdrawn · Kindling 3 | read",
    "world | Ilmarrow · concluded at 624 | anthology",
  ],
  "s2-05": [
    "fate | page 23 withdrawn · Kindling 4 | read",
    "world | Threnn · concluded at 631 | anthology",
  ],
  "s2-06": [
    "fate | page 30 withdrawn · Kindling 6 | read",
    "teller | no teller recorded | anthology",
  ],
  // Six worlds and six fences, and no single world on the map claims the key.
  // The entry whose subject is six worlds has no catalogue reference, and
  // inventing one would be the Directory's own crime.
  "s2-07": ["fate | page 38 withdrawn · Kindling 10 | read"],
  "s2-08": [
    "fate | page 47 withdrawn · Kindling 8 | read",
    "world | Kaunis · concluded at 659 | anthology",
  ],
  "s2-09": [
    "fate | page 58 withdrawn · Kindling 12 | read",
    "teller | no teller recorded | anthology",
  ],
  "s2-10": ["fate | page 91 withdrawn · Kindling 13 | read"],
  "s3-01": ["fate | page 1 · withdrawn from the case | none"],
  "s3-02": ["fate | page 12 · withdrawn from the case | none"],
  "s3-03": ["fate | page 16 · withdrawn from the case | none"],
  "s3-04": ["fate | page 23 · withdrawn from the case | none"],
  "s3-05": [
    "fate | page 34 · withdrawn from the case | none",
    "teller | no teller recorded | anthology",
  ],
  "s3-06": [
    "fate | page 30 · withdrawn from the case | none",
    "teller | no teller recorded | anthology",
  ],
  "s3-07": ["fate | page 44 · withdrawn from the case | none"],
  "s3-08": [
    "fate | page 47 · withdrawn from the case | none",
    "teller | no teller recorded | anthology",
  ],
  "s3-09": ["fate | page 61 · withdrawn from the case | none"],
  "s3-10": [
    "fate | page 38 · withdrawn from the case | none",
    "teller | no teller recorded | anthology",
  ],
  "s3-11": ["fate | page 73 · withdrawn from the case | none"],
  "s3-12": [
    "fate | page 58 · withdrawn from the case | none",
    "teller | no teller recorded | anthology",
  ],
  "s3-13": ["fate | page 91 · withdrawn from the case | none"],
  // The one page he keeps ends at blank paper. Small print underneath it would
  // be the site annotating the blank.
  "s3-14": [],
};

describe("the register", () => {
  it("is exactly this, for every record in the corpus", () => {
    const actual = Object.fromEntries(anthologyEntries.map((e) => [keyOf(e), rowsOf(keyOf(e))]));
    expect(actual).toEqual(REGISTER_FIXTURE);
  });

  it("never exceeds four lines, never repeats a kind, never leaves the order", () => {
    for (const e of anthologyEntries) {
      const lines = registerLines(e);
      expect(lines.length, keyOf(e)).toBeLessThanOrEqual(REGISTER_ORDER.length);
      expect(REGISTER_ORDER.length, "the cap is four, in a fixed order").toBe(4);
      expect(new Set(lines.map((l) => l.kind)).size, keyOf(e)).toBe(lines.length);
      const positions = lines.map((l) => REGISTER_ORDER.indexOf(l.kind));
      expect(positions, keyOf(e)).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  // A register line's grammatical subject is the record, never the reader.
  // "Read the piece that burned this" is a related-links box; "page 1
  // withdrawn, Kindling 1" is an archive. The difference is one word, and a
  // comment saying so would not survive the first person in a hurry.
  it("never addresses the reader", () => {
    const IMPERATIVES = [
      "read", "see", "explore", "discover", "view", "visit", "learn", "find", "click",
      "browse", "check", "follow", "continue", "start", "jump", "go", "keep", "take",
      "try", "dive", "meet", "open", "watch", "listen", "get", "join", "return", "head",
    ];
    const banned = new RegExp(`^(${IMPERATIVES.join("|")})\\b`, "i");
    for (const e of anthologyEntries) {
      for (const l of registerLines(e)) {
        expect(`${l.lead}${l.label}`.trim(), `${keyOf(e)} / ${l.kind}`).not.toMatch(banned);
      }
    }
  });
});

describe("the page-zero landmine", () => {
  // All ten Season One records carry page 0, and so does the one page he keeps.
  // An unscoped kindling-to-page join therefore matches every Season One entry
  // against kindling 14 and stamps a withdrawal across the whole of the first
  // season: ten pages that were never in the case and were never burned.
  it("never puts a withdrawal line on a Season One record", () => {
    for (const e of entriesOfSeason(1)) {
      expect(registerLines(e).some((l) => l.kind === "fate"), e.slug).toBe(false);
      expect(fateOf(e), e.slug).toBeNull();
    }
    const wording = entriesOfSeason(1)
      .flatMap(registerLines)
      .filter((l) => /withdrawn|Kindling/i.test(`${l.lead}${l.label}`));
    expect(wording).toEqual([]);
  });

  it("never lets the kept page withdraw anything", () => {
    const kept = anthologyEntries.find((e) => e.kindling === KINDLING_FINALE)!;
    expect(kept.page, "the kept page carries page 0, same as all of Season One").toBe(0);
    expect(consumed(kept)).toBeNull();
    expect(anthologyEntries.map(fateOf).filter(Boolean)).not.toContain(kept);
  });
});

describe("the kindling joins", () => {
  // The thirteen withdrawals, pinned. Eight resolve to a record the reader can
  // reach; five name pages that were never shipped and resolve to a number with
  // nothing behind it. Those five stay that way permanently: some of this is
  // out of reach, and the register teaches that by printing a number no route
  // answers rather than by explaining itself.
  const JOINS: [number, number, string | null][] = [
    [1, 1, "the-second-chair"],
    [2, 12, null],
    [3, 16, "the-last-thing-he-taught-them"],
    [4, 23, "what-you-have-not-said-out-loud"],
    [5, 34, null],
    [6, 30, "the-weight-of-the-case"],
    [7, 44, null],
    [8, 47, "the-one-that-stayed-open"],
    [9, 61, null],
    [10, 38, "six-worlds-six-fences"],
    [11, 73, null],
    [12, 58, "someone-has-been-reading"],
    [13, 91, "the-back-of-the-case"],
  ];

  it("matches the fixture, thirteen of them", () => {
    // The lookup is done HERE, not by a resolver. crossnav exports no function
    // that turns a Kindling piece into a Season Two record, because the ash
    // does not hand the page back and a resolver that could express the link is
    // a resolver somebody will eventually call.
    const actual = entriesOfSeason(3)
      .filter((e) => e.kindling !== undefined && e.kindling < KINDLING_FINALE)
      .sort((a, b) => (a.kindling ?? 0) - (b.kindling ?? 0))
      .map((e) => [
        e.kindling,
        consumed(e),
        anthologyEntries.find((x) => x.season === 2 && x.page === e.page)?.slug ?? null,
      ]);
    expect(actual).toEqual(JOINS);
    expect(actual.filter((j) => j[2] !== null)).toHaveLength(8);
    expect(actual.filter((j) => j[2] === null)).toHaveLength(5);
  });

  it("gives the five unshipped pages a number and no record", () => {
    for (const [, page, slug] of JOINS.filter((j) => j[2] === null)) {
      expect(typeof page).toBe("number");
      expect(slug).toBeNull();
      expect(anthologyEntries.some((e) => e.season === 2 && e.page === page)).toBe(false);
    }
  });

  it("links no Season Three record back to the page it burned", () => {
    // Law A. An anchor from the ash to the intact page refunds the fire, and
    // the fire's cost is the one non-negotiable thing in this anthology.
    for (const e of entriesOfSeason(3)) {
      for (const l of registerLines(e).filter((x) => x.kind === "fate")) {
        expect(l.to, e.slug).toBeNull();
      }
    }
  });

  it("gives the eight reachable pages their fate, forward in time", () => {
    const fated = entriesOfSeason(2).filter((e) => fateOf(e) !== null);
    expect(fated.map((e) => e.page)).toEqual([1, 16, 23, 30, 38, 47, 58, 91]);
    for (const e of fated) expect(fateOf(e)!.season).toBe(3);
  });
});

describe("tellers, plural", () => {
  // The shipped registry is stale at ten of twenty portraits and files every
  // teller under exactly one key, so the corpus cannot yet demonstrate the
  // plural on its own. The roster below is the shape the upstream
  // witnesses.json already has: two tellers on s2-04, two on s3-11, and one
  // carrying an array of keys. Asserting against it proves tellersOf is a
  // filter and not a renamed find, today, without waiting on a regeneration in
  // another repo.
  const ROSTER: AnthologyWitness[] = [
    { id: "hallovar", name: "Hallovar", entry: "s2-04", did: "", art: "" },
    { id: "ilvra", name: "Ilvra", entry: "s2-04", did: "", art: "" },
    { id: "sarn", name: "Sarn", entry: "s3-11", did: "", art: "" },
    { id: "oyla", name: "Öyla", entry: "s3-11", did: "", art: "" },
    // The generated interface still types `entry` as one key, because no
    // shipped teller carries several yet. keysOf already reads both shapes, so
    // this is the array the field widens to and not a fiction about the type.
    { id: "ossul", name: "Ossul", entry: ["s1-10", "s2-01", "s2-09"], did: "", art: "" } as unknown as AnthologyWitness,
    { id: "nobody", name: "Nobody", did: "", art: "" },
  ];

  const entryOf = (key: string) => anthologyEntries.find((e) => keyOf(e) === key)!;

  it("returns every teller of an entry, not the first one", () => {
    expect(tellersOf(entryOf("s2-04"), ROSTER).map((w) => w.id)).toEqual(["hallovar", "ilvra"]);
    expect(tellersOf(entryOf("s3-11"), ROSTER).map((w) => w.id)).toEqual(["sarn", "oyla"]);
  });

  it("returns every entry a teller appears in", () => {
    expect(entriesOfTeller("ossul", ROSTER).map(keyOf)).toEqual(["s1-10", "s2-01", "s2-09"]);
    expect(entriesOfTeller("hallovar", ROSTER).map(keyOf)).toEqual(["s2-04"]);
    // A teller with no key files under nothing and renders nowhere, rather than
    // silently falling into the first season.
    expect(entriesOfTeller("nobody", ROSTER)).toEqual([]);
    expect(entriesOfTeller("not-a-teller", ROSTER)).toEqual([]);
  });

  it("reads the shipped registry when nobody hands it one", () => {
    // Every shipped teller resolves to a real entry, both directions agree, and
    // no entry is handed a teller that is not filed to it.
    for (const w of anthology.witnesses) {
      const entries = entriesOfTeller(w.id);
      expect(entries.length, w.id).toBeGreaterThan(0);
      for (const e of entries) expect(tellersOf(e).map((x) => x.id), keyOf(e)).toContain(w.id);
    }
  });
});

describe("worlds", () => {
  it("names a world only where exactly one claims the record", () => {
    // Six worlds, six fences, and no world on the map claims 2-7.
    expect(worldOf(anthologyEntries.find((e) => e.slug === "six-worlds-six-fences")!)).toBeNull();
    // The Directory publishes the Concluded count and is not filed under it.
    expect(worldOf(anthologyEntries.find((e) => e.slug === "why-we-measure-time-in-hells")!)).toBeNull();
  });

  it("takes the count from the map first and the record's own words second", () => {
    // Vœrhan's count is on the starmap, so the starmap's figure wins even
    // though page four states a different one in its own Terminologies block.
    const voerhan = worldOf(anthologyEntries.find((e) => e.slug === "the-weather-they-made-up")!);
    expect(voerhan?.world.at).toBe(615);
    expect(voerhan?.at).toBe(615);
    // Dhurin has no figure on the map, so the record's own count is used, and
    // nothing is interpolated for the eight lit worlds that state no count.
    const dhurin = worldOf(anthologyEntries.find((e) => e.slug === "the-cold-case-of-all-fourteen")!);
    expect(dhurin?.world.at).toBeUndefined();
    expect(dhurin?.at).toBe(619);
    const exxobar = worldOf(anthologyEntries.find((e) => e.slug === "legend-of-koaeluae-scales")!);
    expect(exxobar?.at).toBeNull();
  });
});
