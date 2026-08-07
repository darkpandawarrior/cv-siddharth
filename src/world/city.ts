/**
 * THE SPINE. One coordinate system, shared by every district (west/east),
 * every dated thing (facets' authored/discovered threads) and the ground
 * itself (era colour). Every other module under src/world/ that needs to
 * turn "a year" or "a date string" into "a place in the scene" imports from
 * here rather than re-deriving the mapping — a second copy of `yearZ` is
 * exactly the kind of drift that put a 2m trench across this world's only
 * route south the last time two files each held their own idea of where the
 * ground was.
 *
 * Zero three.js/@react-three imports, by design: this is pure layout maths
 * and date parsing, so it is unit-testable headlessly and importable from a
 * Node data-gen script without dragging in a renderer.
 *
 * COORDINATE SCHEME (unchanged from worldData.ts's original): +X east, +Y
 * up, -Z north, +Z south. The craft spawns facing +Z, so driving forward is
 * driving forward in time — north is 2017, south is now. That is the whole
 * poem and it costs nothing, so it is never flipped.
 */

/**
 * The layout constants every district and the ground read.
 *
 * `yearSpan` (16m/year) is the one number everything else derives from:
 * `firstYear`..`lastYear` gives 10 bands of that width, centred on
 * `(firstYear+lastYear)/2` = 2021.5, which is why `yearZ` looks the way it
 * does below. `z1` runs 8m past `lastYear`'s band on purpose — not padding,
 * but room for the handful of dated things (writing.lessons, facets.loopdown)
 * that fall after "now": the most honest detail in the whole layout, and it
 * is free.
 *
 * `buildInner`/`buildOuter` bound the flanks district geometry is allowed to
 * occupy. `buildInner` in particular is the one number standing between a
 * tall west/east monument and a room's sensor volume — nothing with
 * `|x| < buildInner` is ever built, which is what keeps a monument out of a
 * pavilion's approach.
 */
export const CITY = {
  yearSpan: 16,
  firstYear: 2017,
  lastYear: 2026,
  halfWidth: 28,
  laneHalf: 6,
  roomOffset: 10,
  buildInner: 15,
  buildOuter: 27,
  groundY: 0.5,
  z0: -80,
  z1: 88,
} as const;

/** The z-band centre for a given (possibly fractional) year. */
export function yearZ(year: number): number {
  return (year - (CITY.firstYear + CITY.lastYear) / 2) * CITY.yearSpan;
}

/** Inverse of `yearZ` — what year does this z-coordinate sit at. */
export function zToYear(z: number): number {
  return z / CITY.yearSpan + (CITY.firstYear + CITY.lastYear) / 2;
}

// Three-letter month keys, so "April", "Apr", "june" and "Jun" all resolve
// the same way — src/data/ mixes full and abbreviated month names across
// profile.ts's `period` strings and elsewhere, and this function has to read
// both without two parsing paths.
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthIndex(word: string): number | null {
  const i = MONTH_ABBR.indexOf(word.slice(0, 3).toLowerCase());
  return i === -1 ? null : i;
}

/**
 * A date-ish string, wherever src/data/ happens to have written it, to a
 * z-coordinate — or `null` when the string does not name a real date.
 *
 * Three shapes are recognised, each anchored to the FULL string (not a
 * substring search) so a string that merely CONTAINS digits doesn't get
 * mis-read as a date:
 *   - ISO: "2019-05-09" — interpolated to the day, via yearZ.
 *   - "Month YYYY": "Jun 2026", "April 2026" — interpolated to the month.
 *   - bare year: "2021", "2018".
 *
 * Ranges ("April 2026 - Present", "January 2021 - May 2023") are handled by
 * reading the leading half — the start of a span is what places the THING on
 * the axis; a district that needs the far end too (an employer's span,
 * say) calls this again on the back half of its own `" - "` split rather
 * than this function inventing a two-value return.
 *
 * Everything else — "campus-lore", "personal-essay", "2069 (written 2020)"
 * (2069 is not a year anything here was made in, and the parenthetical is
 * exactly the kind of guess this function refuses to make) — returns `null`.
 * A district that gets `null` back must NOT invent a year: see the design
 * doc's "nothing gets a fabricated year" rule. `null` is the honest answer
 * and every caller has to be able to render it as "undated" rather than
 * silently defaulting to today.
 */
export function dateZ(value: string): number | null {
  const first = value.split(" - ")[0]?.trim() ?? "";

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(first);
  if (iso) {
    const [, y, mo, d] = iso;
    const year = Number(y) + (Number(mo) - 1) / 12 + (Number(d) - 1) / 365;
    return yearZ(year);
  }

  const monthYear = /^([A-Za-z]+)\s+(\d{4})$/.exec(first);
  if (monthYear) {
    const mi = monthIndex(monthYear[1]);
    if (mi === null) return null; // "Present" alone never reaches here — it's the tail of a split, not the head
    return yearZ(Number(monthYear[2]) + mi / 12);
  }

  const bareYear = /^(\d{4})$/.exec(first);
  if (bareYear) return yearZ(Number(bareYear[1]));

  return null;
}

/** Which flank of the boulevard a district lives on. West = what he was paid
 *  for; east = what he made anyway. See the design doc's lateral-band table. */
export type Flank = "west" | "east";

/** The palette tokens district geometry is allowed to pull from —
 *  worldPalette()'s full set includes a few (signalDim, card, surface, void,
 *  text, textDim, accentDim) that are structural/background colours rather
 *  than "a district's own tint", so this narrows to the ones meant to be
 *  handed out as an identity. */
export type PaletteToken = "signal" | "probe" | "alt" | "warn" | "accent" | "accent2";

/**
 * What a district hands the resolution field (ResolveField, WS2) to draw as
 * dust: a family's worth of target points on its own surfaces, plus which
 * token they resolve into.
 */
export type ResolveSource = {
  id: string;
  /** Flat xyz triples, in world space, on the structure's surface. */
  targets: Float32Array;
  token: PaletteToken;
};

/** Anything tall enough to degrade a GPS fix — gps.ts's canyonFactor reads a
 *  list of these instead of a single hardcoded set of monuments now that the
 *  city has two flanks of them. */
export type TallStructure = { x: number; z: number; height: number };
