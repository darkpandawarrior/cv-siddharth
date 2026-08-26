import { KINDLING_FINALE } from "../lib/seasonTheme.ts";
import {
  anthology,
  anthologyEntries,
  type AnthologyEntry,
  type AnthologyWitness,
  type StarWorld,
} from "./anthology.ts";

/**
 * The Damage Register's resolver layer: every join the anthology's cross-links
 * are allowed to make, and nothing else.
 *
 * Two laws govern this file and both are structural rather than documented.
 *
 * LAW A, the register runs forward in time only. A page may carry what later
 * happened to it. Nothing hands back what was destroyed, and nothing points at
 * a meaning. That is why `consumed()` returns a NUMBER: a Season Three piece
 * names the page it burned and must never be able to link to it, and the
 * cheapest way to guarantee that is a return type incapable of expressing a
 * route. There is deliberately no `pageOf(kindling)` returning an entry.
 *
 * LAW B, the register is corpus state and never reader state. Every function
 * here is a pure derivation over the generated corpus, so every line is true
 * for everyone the moment a season ships. Nothing reads storage, nothing takes
 * a "seen" set, nothing is a function of who is asking.
 *
 * Everything is DERIVED. The one hand-kept list in this repo, the teller
 * registry, fell a season behind and shipped ten of twenty portraits for a
 * month, so the standing rule is that a join is computed from the corpus or it
 * does not exist.
 */

// --- Keys ------------------------------------------------------------------
// "s2-04" style. The corpus uses this shape in witnesses.json and in the
// starmap's own `k`, in two different spellings, so both are parsed here
// rather than at four call sites.

export const keyOf = (e: AnthologyEntry): string => `s${e.season}-${String(e.idx).padStart(2, "0")}`;

export const entryOfKey = (k: string): AnthologyEntry | undefined =>
  anthologyEntries.find((e) => keyOf(e) === k);

/**
 * The entry keys a teller belongs to.
 *
 * The generated `entry` field is a single key today and widens to an array the
 * moment one teller carries several pages, so both shapes are accepted here.
 * Moved verbatim from anthology.tsx, which is where it was written and where
 * only the roll could reach it.
 */
export const keysOf = (w: AnthologyWitness): string[] => {
  const key: string | string[] | undefined = w.entry;
  return Array.isArray(key) ? key : key ? [key] : [];
};

// --- Tellers ---------------------------------------------------------------

/**
 * ALL tellers of an entry, in registry order.
 *
 * The shipped reading page ran `witnesses.find(...)`, which keeps the first
 * match and silently drops the rest, so a page with two tellers asserted a
 * false thing about its own subject. Two entries already have two: s2-04 is
 * Hallovar and Ilvra, s3-11 is Sarn and Öyla. Neither second teller is in the
 * currently generated registry, which is stale at ten of twenty.
 *
 * `roster` exists so the plural path can be proven against a fixture rather
 * than waiting on a regeneration in another repo. It is not a hook, it is not
 * configuration, and no caller in the app passes it.
 */
export const tellersOf = (
  e: AnthologyEntry,
  roster: readonly AnthologyWitness[] = anthology.witnesses,
): AnthologyWitness[] => roster.filter((w) => keysOf(w).includes(keyOf(e)));

/**
 * Every entry a teller appears in, in corpus order.
 *
 * Accepts the id because that is what a route param and an anchor hash carry,
 * and the witness itself because the roll already holds one.
 */
export const entriesOfTeller = (
  teller: string | AnthologyWitness,
  roster: readonly AnthologyWitness[] = anthology.witnesses,
): AnthologyEntry[] => {
  const w = typeof teller === "string" ? roster.find((x) => x.id === teller) : teller;
  return w ? keysOf(w).map(entryOfKey).filter((e): e is AnthologyEntry => Boolean(e)) : [];
};

// --- The fire --------------------------------------------------------------

/**
 * A Season Two record, to the Kindling piece that withdrew it. Null for
 * everything else, including the eighty-one pages the reader never sees.
 *
 * THE SCOPE IS THE POINT. All ten Season One records carry `page: 0`, and so
 * does the one page he keeps (kindling 14). An unscoped page equality joins
 * every Season One entry to the kept page and stamps a withdrawal line across
 * the whole of the first season, which is a lie about ten pages that were
 * never in the case and never burned.
 *
 * Three independent things stop that, and on today's corpus any one of them
 * would be enough, which is exactly why all three stay: `e.season === 2`
 * because only a case page can be withdrawn from the case, `e.page > 0`
 * because page zero is the absence of a page number and not a page, and the
 * kindling ceiling because the kept page withdrew nothing. A fourth season, or
 * a Season One record that ever gains a page number, removes the redundancy
 * without warning.
 */
export const fateOf = (e: AnthologyEntry): AnthologyEntry | null =>
  e.season !== 2 || e.page <= 0
    ? null
    : (anthologyEntries.find(
        (x) => x.season === 3 && x.page === e.page && (x.kindling ?? 0) < KINDLING_FINALE,
      ) ?? null);

/**
 * A Kindling piece, to the page number it consumed. A NUMBER, forever.
 *
 * Five of the thirteen (pages 12, 34, 44, 61, 73) name pages that were never
 * shipped. They resolve to a number with no record behind it and they stay
 * that way: some of this is permanently out of reach, and the register teaches
 * that wordlessly by printing a number no route answers.
 *
 * The other eight name pages the reader could reach, and must not be able to.
 * See Law A at the top of the file: this returns a number so that no caller,
 * present or future, can turn ash back into an anchor.
 */
export const consumed = (e: AnthologyEntry): number | null =>
  e.season === 3 && (e.kindling ?? 0) > 0 && e.kindling !== KINDLING_FINALE && e.page > 0
    ? e.page
    : null;

// --- The map ---------------------------------------------------------------

/** Every record this world is the record of, in the order the account gained
 *  them. `k` is a string while one season is the whole account of a place, and
 *  an array once a later season comes back to it.
 *
 *  Both shapes are read HERE and nowhere else, which is the same discipline
 *  crossnav's keysOf() applies to a teller's entries: a field that widens in
 *  two spellings gets one reader, or the fourth call site is the one that
 *  keeps the old shape and quietly drops half the data. The witness registry
 *  already shipped that exact bug with a `find` where it needed a `filter`. */
export const worldKeys = (world: StarWorld): string[] =>
  world.k === undefined ? [] : Array.isArray(world.k) ? world.k : [world.k];

/** The seasons whose records this world carries. Empty is the furniture that
 *  belongs to the whole account instead of to one season (today: the ruin),
 *  which is always shown at full. */
export const worldSeasons = (world: StarWorld): number[] =>
  worldKeys(world).map((k) => Number(k.split("-")[0]));

/**
 * A world more than one season is the record of.
 *
 * Season four's device is accumulation: the wall keeps everything, nothing is
 * destroyed, only covered, and the latest layer sits on top with the earlier
 * one still legible under it. Exactly one world is in that state, and it is
 * the one the season is standing in: the Directory ring of #2300 is a district
 * now, and s4-11 says so in its first line. The map records that the way the
 * season does, by laying the later record over the earlier one rather than by
 * filing a second place, because the city grew onto the ring and then through
 * it and the corpus gives it no position of its own.
 *
 * Derived, never a flag: a second key IS the fact, so there is nothing here to
 * fall out of step with the data.
 */
export const isRevisited = (world: StarWorld): boolean => worldSeasons(world).length > 1;


// The Directory's Concluded count exactly as the entry itself states it, in
// its own Terminologies block, spelled out in English. Thirteen entries carry
// one. Parsed rather than interpolated: a count the corpus did not write down
// does not exist, and an entry between two counts is not "about" the midpoint.
//
// The lookup is built over 611..671, which is Starmap's CONCLUDED_START..
// FIELD_COUNT, so a count outside the slider's domain resolves to null and
// produces no line, which is the correct behaviour anyway.
// ponytail: widen the range only when the slider widens. If the generator ever
// bakes `concluded` into the entry, delete the parser and read the field.
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy"];
const say = (n: number): string =>
  n < 20 ? ONES[n] : [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join("-");
const COUNTS = new Map(
  Array.from({ length: 61 }, (_, i) => 611 + i).map((n) => [`six hundred and ${say(n - 600)} worlds`, n]),
);
const CONCLUDED_RE =
  /\*\*Concluded\*\*[\s\S]{0,200}?indicated\.\*\s*\*{0,2}(Six hundred and [a-z-]+ worlds)/i;

/** The count this entry states, or null. Null is not zero and not a default. */
export const concludedOf = (e: AnthologyEntry): number | null => {
  const m = e.body.match(CONCLUDED_RE);
  return (m && COUNTS.get(m[1].toLowerCase())) ?? null;
};

/**
 * The one starmap world this record is the record OF, and the count at which
 * the map should already be sitting when the reader arrives.
 *
 * Null when nothing claims the key, when SEVERAL do (naming one of six fence
 * worlds would be an invention), or when the claimant is `st: "self"`. The
 * Directory publishes the Concluded count and is not filed under it.
 *
 * `at` is the starmap's own figure first and the entry's stated count second,
 * and null when neither says. No interpolation: null means no line, not a
 * guess at where the slider belongs.
 */
export function worldOf(e: AnthologyEntry): { world: StarWorld; at: number | null } | null {
  const claim = anthology.starmap.worlds.filter((w) => worldKeys(w).includes(`${e.season}-${e.idx}`));
  if (claim.length !== 1 || claim[0].st === "self") return null;
  return { world: claim[0], at: claim[0].at ?? concludedOf(e) };
}

// --- Argued absences -------------------------------------------------------

/**
 * Nine entries have a teller-shaped hole that is deliberate. Omitting them
 * reads as an oversight, so they are rows on the roll and a line in the
 * register.
 *
 * This is authored argument and cannot be derived, which is the whole reason
 * it is a constant. It lives here rather than in anthology.tsx because the
 * register and the roll now both read it, and a fact stated in a route file is
 * a fact only that route can check. When the generator grows an `absences`
 * field this constant is deleted and both readers read that instead.
 *
 * Copied verbatim from anthology.tsx. Every claim is in the story file it
 * names. anthology.tsx must delete its copy and import this one, or the two
 * lists drift, which is the failure that produced this file.
 */
export const ARGUED_ABSENCES: { entry: string; why: string }[] = [
  {
    entry: "s1-09",
    why: "Forty million people, alive and fed, with no gods, no monsters, no luck and no stories at all. Law five has nothing to attach to, because there is no legend. The nearest thing to a teller is a woman who built a word for why out of their word for by what method, and nobody on that planet ever wrote down a thing she said. A teller is somebody whose account survives them. Hers does not.",
  },
  {
    entry: "s2-06",
    why: "Aboard ship between two systems he will not name, with no second person in it at any point. Everything that acts is equipment: a hanging scale, a peeling calibration sticker, three rows of a table.",
  },
  {
    entry: "s2-09",
    why: "Nineteen days out from anywhere, and the page is built out of proving nobody was there. Himself, the crew, the boarding log checked three times, Ossul eleven decks down. When he runs out of suspects the only other party in the room is the case, and a case is not mortal.",
  },
  {
    entry: "s3-05",
    why: "One sentence about blind fish and an apology for its own length. The nearest thing to a teller is a version of himself he cannot place, on a world he does not remember being on.",
  },
  {
    entry: "s3-06",
    why: "Three weighings and a difference. Its only witness is a hanging scale by the aft locker with a tolerance printed on its plate, and the whole discipline of the page is leaving a number alone.",
  },
  {
    entry: "s3-08",
    why: "Kaunis is here as an institution and a wall, not a person. Four hundred names in chalk, resurfaced every generation so nobody stops reading it. A world that gets a wall, and a man who does not.",
  },
  {
    entry: "s3-10",
    why: "Nobody on any of the six worlds ever saw the map. The graves still point and the poles still point. What stops existing is the pairing, and the only person who could witness that is the one burning it.",
  },
  {
    entry: "s3-12",
    why: "The alibi run, and its whole structure is the elimination of every other person who could have been in the room. What is left standing is his own sentence: an archive of one author is a self portrait.",
  },
  {
    entry: "s3-14",
    why: "The case is empty and nothing was witnessed. The only figure invoked is a rule rather than a person, and the plate is clean unmarked paper, the one undamaged object in the season. That is the portrait. Leave it.",
  },
];

/** The argued absence for this entry, if one was argued. */
export const absenceOf = (e: AnthologyEntry): { entry: string; why: string } | undefined =>
  ARGUED_ABSENCES.find((a) => a.entry === keyOf(e));

// --- The paint -------------------------------------------------------------

/**
 * The earlier record a Season Four notice is pasted over.
 *
 * SEASON THREE'S JOIN, RUN THE OTHER WAY. The fire destroyed and this one
 * keeps: `s4-bible.md` calls the plates' device "the exact inverse of Season
 * Three's: that was destruction, this is accumulation", and the mechanism is a
 * plate "carrying a legible fragment of an earlier S1 or S2 plate under the
 * current paint ... always from the entry the piece detonates". The site is
 * told, in the same file, to reuse the damage register for it rather than
 * invent anything, and never as a banner, a popup or a link card. So it is one
 * line of small print in the register, like every other join here.
 *
 * IT IS A LABEL AND NEVER A ROUTE, for the same reason `consumed()` returns a
 * number. The notice is the later object and the record under it is the
 * earlier one, so a link would run backwards, and Law A at the top of this
 * file is that the register only ever runs forward. Season Three states the
 * page it burned and cannot link to it; Season Four states the record it
 * covered and cannot link to it either. Neither hands anything back.
 *
 * AUTHORED, AND CHECKED. "The entry the piece detonates" is a judgement about
 * what a piece is about, which no parser can make: `worldOf` cannot be run
 * backwards over the prose, because s4-06 mentions Killuga Var in an anecdote
 * that is not what that notice is over, and a code resolving to the wrong
 * entry is worse than no code at all. So it is a constant, like
 * ARGUED_ABSENCES. What keeps it from drifting the way the teller registry
 * drifted is `quote`: the sentence in the notice's own body that puts the row
 * here, asserted present in crossnav.test.ts. A row whose sentence has left
 * the corpus fails rather than lingers.
 *
 * FOUR OF FOURTEEN, and the bible's word is "sparingly". The other ten notices
 * carry no line, and nothing explains why, which is the same variance nine of
 * the ten Season One records already teach.
 */
export const UNDER_PAINT: { entry: string; under: string; quote: string }[] = [
  { entry: "s4-03", under: "s1-05", quote: "I know because I wrote it, on Killuga Var" },
  { entry: "s4-04", under: "s1-03", quote: "A long time ago now I filed Vædrun" },
  { entry: "s4-08", under: "s1-06", quote: "I have written about the Hraedh before" },
  { entry: "s4-12", under: "s1-07", quote: "with me since Cendre" },
];

/**
 * How the earlier record is named, and it is a STRING because a string cannot
 * be navigated to. Season One is filed by entry number and Season Two by page,
 * and neither season shares the other's counting scheme, so the number is
 * formatted where the season is known rather than at the call site.
 */
const filedAs = (e: AnthologyEntry): string | null =>
  e.season === 1 ? `#${e.entry}` : e.season === 2 && e.page > 0 ? `page ${e.page}` : null;

/**
 * The label for the record legible under this notice, or null.
 *
 * Returns no entry and no slug, deliberately. See UNDER_PAINT above: there is
 * nothing here for a later refactor to turn into an anchor.
 */
export const underPaint = (e: AnthologyEntry): string | null => {
  const row = UNDER_PAINT.find((u) => u.entry === keyOf(e));
  if (!row) return null;
  const covered = entryOfKey(row.under);
  return covered ? filedAs(covered) : null;
};

// --- The register -----------------------------------------------------------

/** Where a register line points. There is no shape here that names a Season
 *  Two page from Season Three, and there never may be. */
export type RegisterTarget =
  | { kind: "read"; slug: string }
  | { kind: "anthology"; search: AnthologySearch; hash?: string };

/** /anthology's URL vocabulary. Named layers, never numbers, so a link is
 *  readable and a season renumbering does not silently retarget it. */
export interface AnthologySearch {
  layer?: "form" | "case" | "fire" | "map" | "tellers" | "wall" | "unfiled" | "dark";
  world?: string;
  at?: number;
}

export type RegisterKind = (typeof REGISTER_ORDER)[number];

export interface RegisterLine {
  kind: RegisterKind;
  /** Text before the link. "" means the whole line IS the link. */
  lead: string;
  label: string;
  /** null means stated and never linked. Every Season Three fate is null. */
  to: RegisterTarget | null;
}

/**
 * Fixed order, and a hard cap of four by construction.
 *
 * The cap is not a slice at the end. The register is built by walking this
 * array and asking each kind once, so four is the arithmetic of the array
 * rather than a rule someone has to remember. Adding a fifth kind is a visible
 * edit to a constant that the tests measure.
 *
 * `filing` held its sort position and nothing else for three seasons, because
 * no shipped record stated a filing fact the register could carry. Season Four
 * states one: a notice pasted over an earlier record of his, with a fragment
 * of it still legible at the torn corner. Where the sheet sits in the pile is
 * a filing fact and it is the Directory's own word for it, so the category got
 * its member rather than a fifth kind, and the cap is still four by
 * arithmetic.
 */
export const REGISTER_ORDER = ["fate", "world", "teller", "filing"] as const;

// A line renders only when its fact is true of that record. There is no
// placeholder, no "none recorded", no greyed row and no count of what is
// missing: absence is the tell, and Season Two's chrome: "none" is already
// this doctrine.
//
// Every line's grammatical subject is the RECORD. No line begins with a verb
// addressed to the reader. That is asserted in crossnav.test.ts against a real
// verb list, because a rule stated only in a comment is a rule that survives
// exactly until the first person in a hurry.
const PRODUCERS: Partial<Record<RegisterKind, (e: AnthologyEntry) => RegisterLine | null>> = {
  fate: (e) => {
    // Season Two: what later happened to this page. Forward in time, and the
    // whole line is the link, because the fate IS the destination.
    const burner = fateOf(e);
    if (burner) {
      return {
        kind: "fate",
        lead: "",
        label: `page ${e.page} withdrawn · Kindling ${burner.kindling}`,
        to: { kind: "read", slug: burner.slug },
      };
    }
    // Season Three: what this piece consumed. Stated, never linked, including
    // the eight the reader could reach. An anchor from the ash back to the
    // intact page refunds the fire.
    const page = consumed(e);
    return page === null
      ? null
      : { kind: "fate", lead: "", label: `page ${page} · withdrawn from the case`, to: null };
  },

  world: (e) => {
    const w = worldOf(e);
    // No world, or a world at no stated count, is no line. A man between two
    // systems he will not name has no catalogue reference.
    if (!w || w.at === null) return null;
    return {
      kind: "world",
      lead: `${w.world.n} · concluded at `,
      label: `${w.at}`,
      to: { kind: "anthology", search: { layer: "map", world: w.world.n, at: w.at } },
    };
  },

  filing: (e) => {
    // Season Four: what this notice was pasted over. Stated, never linked, for
    // the same reason Season Three's fate is: the register runs forward, and
    // the record under the paint is the earlier object. The wall keeps it,
    // which is the whole difference from the fire, and the line says keeps
    // rather than took.
    const covered = underPaint(e);
    return covered === null
      ? null
      : { kind: "filing", lead: "", label: `${covered} · legible under the paint`, to: null };
  },

  teller: (e) => {
    // Only where the absence is ARGUED. An entry that simply has a teller gets
    // no line here: edge four turns the existing aside's name into the link
    // rather than adding furniture, so a teller line for a record that has one
    // would be the same fact printed twice.
    const absence = absenceOf(e);
    return absence
      ? {
          kind: "teller",
          lead: "",
          label: "no teller recorded",
          to: { kind: "anthology", search: { layer: "tellers" }, hash: `blank-${absence.entry}` },
        }
      : null;
  },
};

/**
 * The composed register for a record: already ordered, already capped, so the
 * component renders what it is handed and cannot compose its own.
 *
 * The one page he keeps returns nothing at all. It is the only undamaged
 * object in the season and it ends at blank paper; small print underneath it
 * would be the site annotating the blank. The reading page has its own
 * terminal guard for the same two pages, and this makes that guard the second
 * line of defence rather than the only one.
 */
export function registerLines(e: AnthologyEntry): RegisterLine[] {
  if (e.kindling === KINDLING_FINALE) return [];
  return REGISTER_ORDER.map((kind) => PRODUCERS[kind]?.(e) ?? null).filter(
    (l): l is RegisterLine => l !== null,
  );
}
