import type { CSSProperties } from "react";
import type { AnthologyEntry } from "../data/anthology.ts";

/**
 * Per-season visual identity for The Morkinstar Journals.
 *
 * This file exists because the hub had exactly one switch, `const cool =
 * season === 1`, so seasons two and three went down an identical branch and
 * rendered as the same object. They are not the same object. The bible is
 * explicit: season one is the Directory's dark survey form and it was
 * BROADCAST, season two is his own warm paper and it was NEVER SENT, season
 * three is that same paper after he put it in a fire. Three media, two
 * treatments, and the two that collapsed were the two the reader is supposed
 * to be able to tell apart from across a room.
 *
 * The descriptor is a function of the ENTRY, not of the season number. That is
 * the decision everything else falls out of: the one page he keeps is an
 * exception inside season three's own row rather than a special case leaking
 * into the card component.
 */

/** Season three's kindling ordinal: 1-13 withdrawn, 14 the one page kept. */
export const KINDLING_FINALE = 14;
const KINDLING_MAX_SCORCH = 13;

/** React's CSSProperties does not know about custom properties. */
export type ThemeVars = CSSProperties & Record<`--${string}`, string | number>;

export interface EntryTheme {
  /** Classes on the hub card shell. */
  card: string;
  /** Classes on the hub card's plate. */
  plate: string;
  /** Classes on the kicker. */
  kicker: string;
  /** Kicker on the hub, byline on the reading page. Seasons do not share a
   *  counting scheme, so this is the only place a number is formatted. */
  label: string;
  /** The same fact, short enough for the onward-nav column. */
  short: string;
  /** Degrees. The grid alternates the sign by index. 0 disables. */
  tiltDeg: number;
  /** Mount the card inside TiltCard. */
  tilt: boolean;
  /** Scoped token overrides, applied on the card and on the reading body.
   *  Every component inside keeps reading the same var() names. */
  vars?: ThemeVars;
  /** How the reading page typesets the entry's OWN first line.
   *  Every entry opens with one, written by the correspondent, and it is the
   *  entry's medium stated in its own words: a relay slug, a folio, a
   *  withdrawal, a posted notice carrying the term of its own erasure. This
   *  says which of the four it is, so the page can set it as a masthead
   *  instead of dropping all forty-eight through the generic quote style.
   *  It replaces the old `chrome` field, which asked a narrower question
   *  ("does the site print a stamp here") and had exactly two answers left
   *  once the site stopped inventing lines the entries already carry. */
  docket: "relay" | "folio" | "withdrawn" | "posted";
  /** Classes on the reading page's prose wrapper. */
  body: string;
}

// Season one, the Directory's survey form. Broadcast, filed, numbered.
// A case file does not tilt and does not glow. The grayscale/sepia pass is
// load-bearing: it is what makes ten different plates read as one filed set,
// which is most of what season one's impact actually is.
const directory = (e: AnthologyEntry): EntryTheme => ({
  card: "rounded-lg border-line hover:border-zinc-500",
  plate: "grayscale-[35%] sepia-[10%]",
  kicker: "text-zinc-400",
  label: `ENTRY #${e.entry}`,
  short: `#${e.entry}`,
  tiltDeg: 0,
  tilt: false,
  docket: "relay",
  body: "",
});

// Season two, his own page. Never sent, so the site prints nothing of its own
// above it and the absence is still the tell — a folio is not chrome. "Page 30
// of 91" is a number he wrote on his own paper, and the site used to wrap it in
// a bordered mono quote box, the register it reserves for a log line someone
// filed. Setting it as a bare folio in the reading serif REMOVES chrome. Loose warm paper on a desk: it tilts, the corner is
// soft, and the card carries the same ruled lines the reading page does.
const pages = (e: AnthologyEntry): EntryTheme => ({
  card: "rounded-2xl border-accent/25 hover:border-accent/60 season-two-card",
  plate: "",
  kicker: "text-accent",
  label: `PAGE ${e.page} OF 91`,
  short: `p.${e.page}`,
  tiltDeg: 0.65,
  tilt: true,
  docket: "folio",
  body: "season-two-paper",
});

// Season three, the fire. Same paper as season two, because canon says it is
// the same paper, marked by the fire he is setting to it. So the ground does
// not change and colour cannot carry the season. What changes is the SHAPE:
// the corners stop being corners. A burned page is identified by its edge.
const kindling = (e: AnthologyEntry): EntryTheme => {
  if (e.kindling === KINDLING_FINALE) return kept();
  const scorch = Math.min(1, Math.max(0, e.kindling ?? 0) / KINDLING_MAX_SCORCH);
  return {
    card: "relative rounded-none border-accent/30 hover:border-accent/70 season-three-torn",
    plate: "season-three-torn__plate",
    kicker: "text-accent",
    label: `PAGE ${e.page} WITHDRAWN`,
    short: `p.${e.page} ✕`,
    // Stated, not left undefined. A burned page does not sit askew on a desk
    // the way season two's loose paper does: it is the shape of its own edge
    // and nothing else, so any rotation reads as decoration fighting the bite.
    // These were missing at first and the runtime behaviour was accidentally
    // correct (undefined is falsy both times) while tsc -b failed, which is the
    // same class of defect this project keeps hitting: right by accident.
    tiltDeg: 0,
    tilt: false,
    // The accent swap is the whole reason the palette lives in custom
    // properties: card-elevated's hover glow and the tilt glow both
    // color-mix() against --color-accent, so they re-tint to ember with no
    // class edits. --color-warn already exists in .ink-world.
    vars: { "--scorch": scorch, "--color-accent": "var(--color-warn)" },
    docket: "withdrawn",
    body: "season-two-paper season-three-scorched",
  };
};

// The exception, and the only undamaged object in season three. Tokens rather
// than classes: the card's markup does not change, so every child keeps
// reading the same var() names and comes out legible on paper. Hexes are the
// plate palette from morkinstar-plates.mjs. Contrast ratios are asserted in
// seasonTheme.test.ts rather than eyeballed, because the last time a badge in
// this season was styled by eye it shipped at 1.4:1.
const kept = (): EntryTheme => ({
  card: "rounded-none season-kept",
  plate: "",
  kicker: "text-accent",
  label: "THE PAGE HE KEEPS",
  short: "kept",
  tiltDeg: 0,
  tilt: false,
  vars: {
    "--color-card": "#e9dfc9",
    "--color-text": "#1f1a12", // 13.06:1
    // Body prose on the kept page. .piece-body's own colour is
    // var(--color-prose, #ded3c2), and that cream fallback is invisible on this
    // paper, so the paper has to name its ink. Same value as --color-text
    // rather than a softer one invented here: 13.06:1 is measured, a guess
    // would not be.
    "--color-prose": "#1f1a12", // 13.06:1
    "--color-text-dim": "#5b5142", //  5.87:1
    "--color-muted": "#6b6153", //  4.58:1
    "--color-line": "#8a7a5c", //  3.16:1, the non-text UI floor
    "--color-accent": "#9e3b2e", //  5.09:1
    "--color-accent-dim": "#7d2e23",
  },
  docket: "withdrawn",
  body: "season-two-paper",
});

// A season with no row of its own. It renders as season two's paper, which is
// what a fourth season would have rendered as by accident before this table
// existed, except that it no longer claims season two's counting scheme.
// Positional, always true, and it never asserts a canon it does not have.
const unfiled = (e: AnthologyEntry): EntryTheme => ({
  ...pages(e),
  label: `№ ${e.idx}`,
  short: `№${e.idx}`,
});

// Season four, the notice board. Not his paper and not the Directory's form:
// a civic notice pasted on a public wall, which is exactly what its plates are.
// The card is flat and hard cornered like season one, because a notice is
// posted rather than handled, and it carries no tilt for the same reason.
// --color-coverage is measured at 8.72:1 on the card ground and 9.71:1 on
// ink, and is the same coverage cyan the plates use, so card and plate agree.
const wall = (e: AnthologyEntry): EntryTheme => ({
  card: "rounded-none border-line hover:border-accent/60 season-four-notice",
  plate: "",
  kicker: "text-accent",
  label: `NOTICE ${e.idx} OF 14`,
  short: `n.${e.idx}`,
  tiltDeg: 0,
  tilt: false,
  vars: { "--color-accent": "var(--color-coverage)" },
  docket: "posted",
  body: "",
});

const SEASON: Record<number, (e: AnthologyEntry) => EntryTheme> = {
  1: directory,
  2: pages,
  3: kindling,
  4: wall,
};

export function entryTheme(e: AnthologyEntry): EntryTheme {
  return (SEASON[e.season] ?? unfiled)(e);
}

/** The anchor object above a season's grid. null renders nothing, which is a
 *  stated choice rather than the accident it currently is: season two and
 *  three have no hero image at all, and season one has The Fourteen. */
export type SeasonHero = "fourteen" | "case-full" | "case-burned" | "wall" | null;
export function seasonHero(n: number): SeasonHero {
  return n === 1 ? "fourteen" : n === 2 ? "case-full" : n === 3 ? "case-burned" : n === 4 ? "wall" : null;
}
