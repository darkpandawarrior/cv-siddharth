import { anthology } from "./anthology.ts";

/**
 * The Morkinstar Journals, as the fiction keeps it about itself.
 *
 * Facts live here, presentation lives in `src/routes/canon.tsx`. Every string
 * below is lifted from one of four files in the-loopdown
 * (`fiction/morkinstar-journals/bible.md`, `species.md`, `s2-bible.md`,
 * `s3-bible.md`) rather than written fresh, which is why `CANON_SOURCES` can
 * honestly call itself a receipt.
 *
 * CHUNK WEIGHT, and it is load-bearing. This file imports `{ anthology }` and
 * never `anthologyEntries`. The two are separate top-level consts in a 408KB
 * generated module, so rollup drops all 34 story bodies from the /canon chunk
 * as long as nothing here reaches for them. `canonLore.test.ts` imports the
 * corpus freely, because a Node test pays no bundle cost.
 *
 * VOICE RULE, enforced. All three bibles state "No em dashes in body prose,
 * ever". This is the page that publishes that rule, so it cannot break it.
 * `canonLore.test.ts` walks every exported string and fails on an em dash or
 * an en dash.
 */

/** One of the laws the anthology holds itself to. */
export interface CanonLaw {
  /** Continuous across seasons. A fourth season's first law numbers itself 8. */
  n: number;
  name: string;
  gloss: string;
  /** Set when the law is one storyteller's position rather than settled canon. */
  contested?: string;
  /** The entry where the law fires. The test fails if the slug is dead. */
  seenAt: { slug: string; label: string };
}

/** A season's reading contract: what it is about, and what saying so costs. */
export interface SeasonCanon {
  /** Laws this season ADDS. Season one added seven, two and three added none. */
  laws?: CanonLaw[];
  thesis: string;
  points: { term: string; gloss: string }[];
  /**
   * What opening this block gives away, or null when it gives nothing away.
   *
   * This one field IS the spoiler design. `null` renders the block open, above
   * the divider. A string renders it below the divider inside a closed
   * `<details>` whose summary prints the string, so the reader is told the
   * price before they pay it. A fourth season picks its own side of the line
   * by writing one value, and no component compares a season number to a
   * literal anywhere.
   */
  spoils: string | null;
}

// The seven laws, each cut to the one line a reader actually needs, moved
// verbatim from the tab this page replaced. What is new is `seenAt`: a law
// stated with no entry behind it is a rule in a vacuum, and the whole point of
// promoting this off a reference panel was to make each law a doorway.
const SEVEN_LAWS: CanonLaw[] = [
  {
    n: 1,
    name: "The Count of Fourteen",
    gloss:
      "Every world reports fourteen gods and fourteen monsters, independently, with no contact between them.",
    seenAt: { slug: "legend-of-koaeluae-scales", label: "first stated, Entry #2245" },
  },
  {
    n: 2,
    name: "The Unnamed Fourteenth",
    gloss: "Ask anyone to list the fourteen monsters and you get thirteen names and a pause.",
    seenAt: { slug: "the-word-marltains-do-not-have", label: "the blank line, Entry #2263" },
  },
  {
    n: 3,
    name: "The Halving",
    gloss: "A deadlock ends only when someone voluntarily divides themselves and spends both halves.",
    seenAt: { slug: "the-tide-that-owes", label: "named by its absence, Entry #2259" },
  },
  {
    n: 4,
    name: "The Residue",
    gloss:
      "Whatever is left over becomes the phenomenon he can actually measure: snow, silence, a tide, a count.",
    seenAt: { slug: "the-standing-dead", label: "a line of graves, Entry #2277" },
  },
  {
    n: 5,
    name: "The Witness Who Tells It",
    gloss:
      "Every legend keeps one mortal who was there and told it afterward. The heroes lose; the tellers are why there is a story at all.",
    seenAt: { slug: "ninety-nine-names-of-silence", label: "Tveggi, Entry #2250" },
  },
  {
    n: 6,
    name: "The Two Facings",
    gloss:
      "One storyteller's account of why thirteen of the fourteen split and one did not. Not settled canon.",
    // bible.md marks this one explicitly, and the correspondent refuses to
    // close it on the page. Printing it as settled would flatten the thing the
    // anthology is careful about: the seams belong at the level of who is
    // telling you.
    contested: "the tvænd's account, not settled canon",
    seenAt: { slug: "two-suns-one-shadow", label: "the arithmetic, Entry #2291" },
  },
  {
    n: 7,
    name: "Concluded",
    gloss:
      "The Directory's status flag for a world with no phenomena outstanding and no further contact indicated.",
    seenAt: { slug: "the-world-with-no-number", label: "611 of them, Entry #2296" },
  },
];

/**
 * Per-season doctrine, keyed by season number, and every lookup is optional.
 *
 * A season present in `anthology.seasons` with no entry here renders its title,
 * its blurb and its bible link and nothing else: a thin section, never a blank
 * one and never a crash. That is what season four looks like on the day its
 * first story ships and before anyone has written its doctrine.
 */
export const SEASON_CANON: Record<number, SeasonCanon> = {
  1: {
    laws: SEVEN_LAWS,
    thesis:
      "The Directory is a census, an employer, and eventually the subject. Its one consistent characteristic is that it writes things down badly and nobody checks. That is a running gag for six entries and then it is the plot.",
    points: [
      {
        term: "Warmth, never contempt",
        gloss:
          "Four cultures in a row go out of their way to say their monster meant no harm. Uhl is hungry. Skerrin is a consequence. Vaal-Ne is thirsty. Ottokh is the most reasonable entity in his own legend. The people who survive long enough to have a legend are the ones who stopped needing a villain.",
      },
      {
        term: "No clean wins",
        gloss:
          "Nine legends, not one victory. Ombra loses outright. Vör-Angi is divided into nothing. Anh-Rekk becomes a fire that has to be relit every ninth generation. The Ombri have failed for four thousand clicks and have not stopped.",
      },
      {
        term: "Self-terms, not survey terms",
        gloss:
          "The Directory records what a surveyor guessed. He uses what the people call themselves, files corrections, and the corrections are acknowledged and not actioned.",
      },
      {
        term: "Category 3",
        gloss:
          "Writing, no spaceflight. Every world in the first nine entries is graded that way, because that is where the myths are richest.",
      },
    ],
    // Nothing here is an ending. It is how to read the season you are about to
    // start, so it sits above the line, open.
    spoils: null,
  },
  2: {
    thesis:
      "Season one was a man filing. Season two is the same man refusing to, and being wrong about what that costs.",
    points: [
      {
        term: "The spine",
        gloss:
          "Skerrin has no body. Skerrin's mass is the record, and it grows by exactly what you write. That is stated flatly in Entry #2284 and he transcribed it himself. Then he went and started an archive.",
      },
      {
        term: "The count is not weather",
        gloss:
          "The rising Concluded count is not the universe being ominous. It rises because of him. He is not observing the count, he is feeding it, one page at a time, while believing he is keeping things open.",
      },
      {
        term: "An archive of one author",
        gloss:
          "The Væhn are safe because their ninety-one pages are written by ninety-one different children. His ninety-one pages are all his. An archive of one author is not an archive. It is a self-portrait, and Skerrin eats those.",
      },
      {
        term: "Ninety-one is borrowed",
        gloss:
          "He is copying a number that belongs to somebody else's ritual, for a cycle that is not his, on a world he visited once. He needed a number and that was the one he had seen work. Not wisdom. Grief behaviour, and a borrowed ritual done slightly wrong.",
      },
      {
        term: "Vænheim",
        gloss:
          "The founding charter named eight intervals and left two with no length. By the last page one of them has a number, because something has now lasted long enough to need it. He never finds out who assigned it, and Elysheim stays blank.",
      },
    ],
    spoils: "how the case works, what the rising number is counting, and the last page.",
  },
  3: {
    thesis:
      "Season three is that man burning ninety pages of his own work, on purpose, to stay alive.",
    points: [
      {
        term: "The correction",
        gloss:
          "The Væhn are not safe because ninety-one different children wrote the pages. They are safe because every ninth generation they burn everything. The one kept page is what survives a fire. He copied the wrong half of the ritual and left behind the only part that works.",
      },
      {
        term: "The clock, and it is his own fault",
        gloss:
          "He wrote the last page first, so the case was always going to complete the moment the last ordinary slot filled. A case with ninety-one of ninety-one slots filled is a complete account. Complete is finished, finished is Concluded, and Concluded is the word the Cendran child wrote.",
      },
      {
        term: "What the fire actually burns",
        gloss:
          "He has no body, so the only thing he is, is the account. The fire is not a man saving himself from a monster. It is a man burning the only description of himself that exists, in the correct order, because the alternative is worse. The stake in every piece is what of him goes out with this page.",
      },
      {
        term: "What he keeps",
        gloss:
          "A blank page. The kept page has to hold something nobody has ever written down, and the only thing in that case never written is the page he has not written yet. An account with a blank page in it is not complete, and a record that is not complete cannot be Concluded.",
      },
      {
        term: "It does not end",
        gloss:
          "Skerrin does not die. The Væhn have done this ninety-one times and still have a Skerrin. The fire does not kill it, it makes him light again, and he will do this again.",
      },
    ],
    spoils: "the ending.",
  },
};

/**
 * The thirteen that have names, copied from the-loopdown's
 * `scripts/morkinstar-art.mjs` (the same list the fourteen plate is drawn
 * from). There is no mechanical link between the two, so a god renamed
 * upstream drifts silently here. Accepted, and partly covered: the test pins
 * the list at exactly thirteen, which is the count the whole page turns on.
 */
export const NAMED_THIRTEEN = [
  "Xærion",
  "Uhl",
  "Ottokh",
  "Vaal-Ne",
  "Grin",
  "Skalde",
  "Skerrin",
  "Hœl",
  "Ihn-Solat",
  "Vör-Angi",
  "Ösrun",
  "Ombra",
  "Anh-Rekk",
];

/**
 * The count's arithmetic, as a ledger rather than as prose.
 *
 * A reader who does the subtraction unaided gets 27 against a stated 28 and
 * concludes the book is broken. bible.md's own instruction for any entry
 * leaning on law six is "show this working", so the page shows it.
 */
export const COUNT_LEDGER: { line: string; value: string }[] = [
  { line: "thirteen split, two faces each", value: "26 names" },
  { line: "the one that never split", value: "+ 1 name" },
  { line: "names in total", value: "27" },
  { line: "lines across the two lists", value: "28" },
];

/**
 * The Rendering, series-level doctrine, and the reason this section gets the
 * most room on the page. It reframes every image on the site: nothing here is
 * a photograph, so the reader is entitled to distrust all of it.
 */
export const RENDERING_DOCTRINE = {
  /** The sentence the section opens on, at display size. */
  claim: "We have never seen anyone in this anthology.",
  mechanism: [
    "Everything in this anthology reached the reader through two instruments. A translation rig that renders, that Morkinstar argues with, that fights him on a word for two days, whose renderings vary between tellings and occasionally fail outright. And a Galactic Directory form, filled in by an institution whose defining trait for sixty galaxals has been pressing a familiar shape onto whatever it files.",
    "This is not a retcon. It is what the frame always was. The correspondent's great wrong idea was that the Directory printed the count of fourteen onto worlds that never had it, and he was wrong about the number because he tested it on the gods. He never tested it on the bodies.",
  ],
  /** The line the whole doctrine turns on, set apart. */
  pull: "Bipedal category species is not an observation. It is a checkbox.",
  consequences: [
    {
      term: "The art may go as far as it likes",
      gloss:
        "A plate that resolves cleanly means the rig held. A figure half-dissolved into what it actually is means the rig strained. Hands in an unrendered void means it failed. And one plate is a refusal, because that species is never named anywhere in the corpus and the instrument does not get to invent one.",
    },
    {
      term: "Variance is canon, not inconsistency",
      gloss:
        "A teller who reads humanlike is not a design failure. It is a rendering that resolved toward the familiar, which is exactly what a Directory instrument would do, and the reader is entitled to distrust it.",
    },
    {
      term: "The correspondent has no body",
      gloss:
        "He is never described, never given a species, never named as anything, across the whole corpus. Everyone else at least got a rendering. He did not. The only thing he is, is the account.",
    },
  ],
};

/**
 * The four states of the rig, each with the plate that is the evidence for it.
 *
 * These four are the argument of the section, so they are the four the page
 * shows at full size rather than the whole set of ten. `witnessId` resolves
 * against `anthology.witnesses`, which lives on the small meta object, so
 * reading the portrait costs nothing at bundle time.
 */
export const RENDERINGS: {
  state: "held" | "strained" | "failed" | "refused";
  witnessId: string;
  slug: string;
  note: string;
}[] = [
  {
    state: "held",
    witnessId: "feeriko",
    slug: "legend-of-koaeluae-scales",
    note: "God-blooded, and drawn that way: ice-light under the skin, scales surfacing at the forearms, snow falling out of her rather than onto her. She married the serpent and bore his children, so the snow on that world is her husband's scales. Hands raised mid sentence, entirely legible.",
  },
  {
    state: "strained",
    witnessId: "aedri",
    slug: "the-arm-shake",
    note: "Two figures in an embrace. She is drawn in ink and heat bloom, forearm flanges spread, because her species runs hot enough to read as fever. The one she is holding is drawn in nothing at all.",
  },
  {
    state: "failed",
    witnessId: "soelvi",
    slug: "the-word-marltains-do-not-have",
    note: "Marltains are born in twos, always, and she was the first who was one. Where the pair should be there is a hole in the paper, person shaped. Not a ghost. An absence with an edge.",
  },
  {
    state: "refused",
    witnessId: "ossul",
    slug: "the-second-chair",
    note: "His species is never named anywhere in the corpus, so the rig does not get to render him. Lamplight, a desk, two hands, the second chair, and where the figure should resolve, it does not.",
  },
];

/**
 * The four physical facts canon states outright, which no rendering can argue
 * with. This is the counterweight that stops the doctrine above reading as
 * licence to draw anything at all.
 */
export const RIG_CONSTRAINTS: { species: string; world: string; constraint: string }[] = [
  {
    species: "Vöskh",
    world: "Grïnjdarlay",
    constraint: "The auditory organ runs the length of the jawline. Tveggi was born without it.",
  },
  { species: "Marltains", world: "Marlt", constraint: "More than two sexes. Obligate twin birth, always." },
  { species: "Ombri", world: "Killuga Var", constraint: "Resting temperature high enough to read as fever." },
  { species: "Hraedh", world: "Jötunheimr", constraint: "Enormous." },
];

/** The footnote that makes the table above a floor rather than a catalogue. */
export const RIG_CONSTRAINTS_NOTE = "Canon is silent on eight of the fourteen species. Silence is permission.";

/**
 * The tether: the measured claim that keeps a cosmic plate reading as a person.
 *
 * MEASURED, NOT RECALLED, and this is the one thing on the page that has a
 * shelf life. species.md writes the figure as 63, which was true when the
 * corpus was thirty entries; it is thirty-four now and the real count is 97.
 * Printing 63 would ship exactly the defect this project keeps hitting, an
 * intention encoded correctly and executed into a stale fact.
 *
 * These three numbers are written down here and re-derived from
 * `anthologyEntries` by `canonLore.test.ts`, which fails the build when the
 * corpus grows and this file does not. That test is the only reason a literal
 * is honest here. If `scripts/gen-anthology.mjs` ever emits the tally onto the
 * `anthology` meta object, delete these three and read it from there instead.
 */
export const TETHER: { value: number; label: string; pattern: string }[] = [
  { value: 97, label: "times the corpus says hand or hands", pattern: String.raw`\bhands?\b` },
  { value: 0, label: "times it says fur or limb", pattern: String.raw`\b(?:fur|limb)s?\b` },
  { value: 8, label: "times it says eye or eyes", pattern: String.raw`\beyes?\b` },
];

export const TETHER_DOCTRINE =
  "However cosmic the plate goes, the hands stay legible and stay busy. A pair of hands doing careful work reads as a person no matter what it is attached to, at any scale, in any medium. Emotion is carried by posture, tension and direction of attention, and never by eyes.";

// Realm is blank for Galaxal and Milgalaxal in the founding charter itself;
// they are not tied to any one world's day, so there is nothing to put there.
// `blank: true` marks the two intervals that were named at founding with no
// length, so the page can render those cells as blanks rather than as data.
export const STANDARD_INTERVALS: { interval: string; realm: string; length: string; blank?: boolean }[] = [
  { interval: "Flick", realm: "Nifheim", length: "1.2 Earth hours" },
  { interval: "Tick", realm: "Limheim", length: "1 Earth day" },
  { interval: "Momenta", realm: "Purgaheim", length: "50 Earth days" },
  { interval: "Click", realm: "Hellheim", length: "2 Earth years" },
  { interval: "Galaxal", realm: "", length: "228 Hellheims · 456 Earth years" },
  { interval: "Milgalaxal", realm: "", length: "2228 Hellheims · 2455 Earth years" },
  { interval: "Elysheim", realm: "Elysheim", length: "not yet required", blank: true },
  { interval: "Vænheim", realm: "Vænheim", length: "not yet required", blank: true },
];

export const MILGALAXAL_NOTE =
  "The milgalaxal line does not multiply out from the click above it. That is inherited from the 2021 source story rather than a typo, and Entry #2300 is built on it.";

/**
 * The joke buried in an appendix, and the site has never printed it. It is
 * safe above the spoiler line: it gives away nothing that happens, only what
 * the units are named after.
 */
export const AFTERLIVES_NOTE =
  "Galactic Standard time is measured in afterlives. Nobody in-universe has noticed, because appendices to standards documents are the safest place in any civilisation to hide something.";

/**
 * Every claim on this page traces to one of these files, so the links are the
 * receipt rather than decoration.
 *
 * The bible rows derive from the seasons themselves, because the upstream
 * filename is mechanical (bible.md for season one, s{n}-bible.md after it) and
 * the hand-kept list this replaced had already fallen a season behind. A fourth
 * season arrives with its own receipt and no code change. The council records
 * stay written out: they are dated audits of one particular week, not a
 * per-season artefact, so nothing derives them.
 */
export const CANON_SOURCES: { file: string; note: string }[] = [
  ...anthology.seasons.map((s) => ({
    file: s.n === 1 ? "bible.md" : `s${s.n}-bible.md`,
    note: `the canon for season ${s.n}, ${s.title}`,
  })),
  { file: "species.md", note: "the Rendering doctrine and the four surviving constraints" },
  { file: "council-2026-08-15.md", note: "the record of the season one council" },
  { file: "council-s2-2026-08-15.md", note: "the cross-lab ownership audit of the season two slate" },
];

export const CANON_SOURCE_BASE =
  "https://github.com/darkpandawarrior/the-loopdown/blob/main/fiction/morkinstar-journals/";

/**
 * The only two sentences on the page spoken from outside the fiction, and they
 * are labelled as such where they render.
 *
 * This is a portfolio, so the process is part of the claim, but breaking frame
 * is expensive on the one page whose job is to hold it. So: once, at the very
 * foot, under everything else, next to the source links.
 */
export const OUTSIDE_THE_FICTION = [
  "The first portraits came back as ten nineteenth-century European humans. That was the prompting, not the model, and fixing it by drawing slightly stranger people would have been the smaller mistake made more carefully. The Rendering is the actual answer, and it is canon rather than a workaround.",
  "Six of the first ten season two premises were killed by a blind cross-lab ownership audit, and the record of it is public.",
];

/* ---------------------------------------------------------------------------
   WHAT IS NOT HERE, and why. Read this before adding a section.

   The bibles are half doctrine and half instructions to whoever writes next.
   The line is: anything true INSIDE the fiction may go on the page; anything
   that is an instruction to the author, a record of what was killed, or a cost
   figure, may not.

   1. Kill records. council-s2's table naming six dead premises after other
      authors' books. It is an inventory of things that do not exist, and it
      makes the project read as derivative on the one page whose job is to make
      it read as owned. The credibility claim survives as one sentence in
      OUTSIDE_THE_FICTION; the inventory does not.
   2. Authoring instructions. "Writing entry eleven and beyond", the four
      gates, the naming rules, the entry-number arithmetic constraint, the
      prompting skeleton, and the "never use: woman, man, clerk, child..."
      negative list. All of it is a brief for a writer, not a fact about a
      world.
   3. Load-bearing directives. "Do not correct it in any file", "Never finish
      that sentence", "Do not fill it in later", "Do not have him explain the
      parallel". The FACTS they protect are all on the page (the milgalaxal
      does not multiply out, #2300 is filed incomplete). The imperative is not.
   4. The arc tables from all three bibles. Their "the turn" column is a
      spoiler index for every entry in reading order. /anthology's season grids
      already list the entries with blurbs, which is the non-spoiling version.
   5. Council falsifiers and dissents. Process, and they name material that
      never shipped.
   6. Anything from SESSION-LOG-2026-08-15.md. A dev log: repo paths, filter
      chain debugging, cost figures.
   7. Model names, lab names, token caps, billing multiples. None of it belongs
      near the fiction.
   8. Anything that spoils without saying so. Vænheim's number, page 58, page
      91, the name, and what he keeps are not banned, they are GATED: they live
      inside a season whose `spoils` field is a string, which puts them below
      the divider behind a closed door that prints the price first.
   --------------------------------------------------------------------------- */
