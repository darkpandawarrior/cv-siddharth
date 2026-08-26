import { describe, expect, it } from "vitest";
import { anthology, anthologyEntries, entriesOfSeason, type AnthologyWitness } from "./anthology.ts";
import { KINDLING_FINALE } from "../lib/seasonTheme.ts";
import {
  ARGUED_ABSENCES,
  consumed,
  entriesOfTeller,
  entryOfKey,
  fateOf,
  keyOf,
  REGISTER_ORDER,
  registerLines,
  tellersOf,
  UNDER_PAINT,
  worldKeys,
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
  "s2-02": ["world | Vœrhan · concluded at 617 | anthology"],
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
  // Season Four. Four notices are pasted over a record of his and say so in
  // their own prose, and those four print. The other ten print nothing, and
  // the reason for each is asserted below at the source rather than left to
  // this fixture: "season four, and the tripwire that could not fire".
  //
  // WHAT THIS BLOCK USED TO SAY, because the correction is the lesson. It
  // claimed three independent reasons for fourteen empty rows, the third being
  // that witnesses.json held no season four teller, and it promised that this
  // fixture SHOULD go red once they were harvested. All fourteen were
  // harvested, the registry now carries fifteen season four keys, and every
  // test stayed green, because the teller producer reads ARGUED_ABSENCES and
  // has never read the registry at all: a record that HAS a teller gets no
  // line, by design. The tripwire was armed on a mechanism that does not
  // exist, so it could not have fired for anything.
  "s4-01": [],
  "s4-02": [],
  "s4-03": ["filing | #2269 · legible under the paint | none"],
  "s4-04": ["filing | #2259 · legible under the paint | none"],
  "s4-05": [],
  "s4-06": [],
  "s4-07": [],
  "s4-08": ["filing | #2277 · legible under the paint | none"],
  "s4-09": [],
  "s4-10": [],
  "s4-11": [],
  "s4-12": ["filing | #2284 · legible under the paint | none"],
  "s4-13": [],
  "s4-14": [],
};

describe("the register", () => {
  it("is exactly this, for every record in the corpus", () => {
    const actual = Object.fromEntries(anthologyEntries.map((e) => [keyOf(e), rowsOf(keyOf(e))]));
    expect(actual).toEqual(REGISTER_FIXTURE);

    // THE FLOOR, and this fixture is the reason it has to be here. Twenty of
    // the forty-eight rows are [], and a resolver layer that had stopped
    // resolving anything at all would satisfy every one of them and fail only
    // on the twenty-eight that print. Assert the count that prints, so an
    // empty row is only ever an empty row and never the whole thing collapsing
    // quietly around it.
    expect(Object.keys(actual).length, "the corpus shrank").toBe(48);
    expect(Object.values(actual).filter((rows) => rows.length > 0).length, "the register stopped printing").toBe(28);
  });

  it("gives every kind in the order at least one member", () => {
    // A kind with no producer is a sort position pretending to be a category,
    // and `filing` was exactly that for three seasons: declared, ordered,
    // tested for position, and never once printed. Season Four gave it a
    // member. This is what would have said so.
    const printed = new Set(anthologyEntries.flatMap(registerLines).map((l) => l.kind));
    expect([...REGISTER_ORDER].filter((k) => !printed.has(k)), "a kind nothing produces").toEqual([]);
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
    // The map's figure wins where it has one. This used to assert Vœrhan at
    // 615 and the starmap rewrite removed that field, correctly: the entry says
    // Vœrhan was "Concluded forty galaxals ago", which is roughly eighteen
    // thousand Earth years before he ever landed, so it is already dark when
    // the slider starts at 611 and never flips during the season. A world that
    // closes inside the 611 to 671 window is the only kind this clause is
    // about, and s1-09 is one: the Directory files it at 611 on the page.
    const unnamed = worldOf(anthologyEntries.find((e) => e.slug === "the-world-with-no-number")!);
    expect(unnamed?.world.at).toBe(611);
    expect(unnamed?.at).toBe(611);
    // And Vœrhan now falls through to whatever its own Terminologies block
    // says, which is the second clause of this rule doing the work.
    const voerhan = worldOf(anthologyEntries.find((e) => e.slug === "the-weather-they-made-up")!);
    expect(voerhan?.world.at).toBeUndefined();
    // Dhurin has no figure on the map, so the record's own count is used, and
    // nothing is interpolated for the eight lit worlds that state no count.
    const dhurin = worldOf(anthologyEntries.find((e) => e.slug === "the-cold-case-of-all-fourteen")!);
    expect(dhurin?.world.at).toBeUndefined();
    expect(dhurin?.at).toBe(619);
    const exxobar = worldOf(anthologyEntries.find((e) => e.slug === "legend-of-koaeluae-scales")!);
    expect(exxobar?.at).toBeNull();
  });
});

describe("season four, and the tripwire that could not fire", () => {
  // The fourteen rows in the fixture above were pinned to [] with a comment
  // promising they would go red once the season four tellers were harvested.
  // They were harvested. Nothing went red. Everything below is what should
  // have been asserted instead: not that the answer is empty, but why, at the
  // source of each reason, so that a reason ceasing to hold is a failure.

  it("has a teller on every notice, and gives none of them a register line", () => {
    // The false premise, stated and disproved in one test. Harvesting a teller
    // can never add a line, because the teller producer answers ARGUED_ABSENCES
    // and has never read the registry: the line is "no teller recorded", so a
    // record that HAS one is exactly the case that gets nothing. The name is
    // already at the foot of the page in the teller aside, and printing it
    // again in small print underneath would be the same fact twice.
    for (const e of entriesOfSeason(4)) {
      expect(tellersOf(e).length, `${keyOf(e)} has no teller in the shipped registry`).toBeGreaterThan(0);
      expect(registerLines(e).some((l) => l.kind === "teller"), keyOf(e)).toBe(false);
    }
  });

  it("prints a teller line for an argued absence and for nothing else, in any season", () => {
    // The producer's real relationship, corpus-wide, so the season four case
    // above is a consequence of a rule rather than a claim about one season.
    const printed = anthologyEntries
      .filter((e) => registerLines(e).some((l) => l.kind === "teller"))
      .map(keyOf);
    // Nine absences are argued and eight print: the kept page argues one and
    // still returns nothing, because registerLines stops before the producers
    // run for it. That is the terminal guard, and it is visible here.
    const kept = keyOf(anthologyEntries.find((e) => e.kindling === KINDLING_FINALE)!);
    expect(printed).toEqual(ARGUED_ABSENCES.map((a) => a.entry).filter((k) => k !== kept));
    expect(ARGUED_ABSENCES.some((a) => a.entry === kept), "the kept page still argues its absence").toBe(true);
  });

  it("puts a record under the paint only where the notice says so in its own prose", () => {
    // What stops UNDER_PAINT drifting off the corpus the way the teller
    // registry did. Every row names the sentence that put it there, and the
    // sentence has to still be in that notice.
    expect(UNDER_PAINT.length, "nothing is under the paint, so this proves nothing").toBeGreaterThanOrEqual(4);
    for (const u of UNDER_PAINT) {
      const notice = entryOfKey(u.entry);
      const covered = entryOfKey(u.under);
      expect(notice, `${u.entry} is not a record`).toBeDefined();
      expect(covered, `${u.under} is not a record`).toBeDefined();
      expect(notice!.body, `${u.entry} no longer says it`).toContain(u.quote);
      // Accumulation runs one way. A notice covers something older than itself.
      expect(covered!.season, `${u.under} is not earlier than ${u.entry}`).toBeLessThan(notice!.season);
    }
    const printed = anthologyEntries
      .filter((e) => registerLines(e).some((l) => l.kind === "filing"))
      .map(keyOf);
    expect(printed).toEqual(UNDER_PAINT.map((u) => u.entry));
  });

  it("never links a notice to the record it covered", () => {
    // Law A, the other way round. Season Three states the page it burned and
    // cannot link to it because the ash does not hand the page back. Season
    // Four states the record it covered and cannot link to it either, because
    // the notice is the later object and the register only runs forward. Both
    // return something with no route in it.
    for (const e of anthologyEntries) {
      for (const l of registerLines(e).filter((x) => x.kind === "filing")) {
        expect(l.to, keyOf(e)).toBeNull();
      }
    }
  });

  it("leaves the other ten notices empty for a reason, and the reason is checkable", () => {
    const covered = new Set(UNDER_PAINT.map((u) => u.entry));
    const empty = entriesOfSeason(4).filter((e) => !covered.has(keyOf(e)));
    expect(empty.length, "the split moved and nobody said so").toBe(10);
    for (const e of empty) {
      const at = keyOf(e);
      // Read at the four sources rather than off the four producers. Each line
      // below is a fact about the corpus that a later change can falsify, and
      // when one does this goes red instead of the row staying quietly [].
      expect(e.page, `${at} carries a page number and would join the kindling arithmetic`).toBe(0);
      expect(e.kindling, `${at} carries a kindling ordinal`).toBeUndefined();
      // The Directory ring carries s4-11 as well as #2300, and an institution
      // that publishes the count is not filed under it. That is the same rule
      // that leaves #2300's own record with no world line, and it is the only
      // reason a claimed key here produces nothing.
      const claiming = anthology.starmap.worlds.filter((w) => worldKeys(w).includes(`${e.season}-${e.idx}`));
      expect(claiming.every((w) => w.st === "self"), `${at} is claimed by a world that would print`).toBe(true);
      expect(ARGUED_ABSENCES.some((a) => a.entry === at), `${at} argues an absence`).toBe(false);
      expect(registerLines(e), at).toEqual([]);
    }
  });
});
